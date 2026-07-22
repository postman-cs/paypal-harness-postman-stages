#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DELIVERY_STAGES,
  PRODUCTION_SOURCE,
  assertConnectorTargetsProductionRepo,
  assertImmutablePostmanCsActions,
  assertProductionSource,
  assertRemoteTemplateMetadata,
  installLinkedStages,
  pipelineDigest,
  validateGeneratedTemplateCatalog,
} from './harness-installer-core.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function usage(error) {
  const message = `${error ? `ERROR: ${error}\n\n` : ''}Usage:
  HARNESS_API_KEY=... node scripts/install-paypal-postman-stages.mjs \\
    --account ACCOUNT --org ORG --project PROJECT --pipeline PIPELINE \\
    --connector POSTMAN_CS_GITHUB --before-stage EXISTING_GATE --dry-run|--apply

Rollback:
  HARNESS_API_KEY=... node scripts/install-paypal-postman-stages.mjs \\
    --account ACCOUNT --org ORG --project PROJECT --pipeline PIPELINE \\
    --rollback .harness-backups/<file>.yaml

Production is locked to ${PRODUCTION_SOURCE.fullName}@${PRODUCTION_SOURCE.branch}.
The API key is accepted only through HARNESS_API_KEY.`;
  console.error(message);
  process.exit(error ? 2 : 0);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') continue;
    if (token === '--help' || token === '-h') usage();
    if (!token.startsWith('--')) usage(`Unexpected argument: ${token}`);
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (key === 'dryRun' || key === 'apply') options[key] = true;
    else {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) usage(`Missing value for ${token}`);
      options[key] = value;
      index += 1;
    }
  }
  return options;
}

function required(value, label) {
  if (!value) usage(`${label} is required.`);
  return value;
}

function query(options, extra = {}) {
  return new URLSearchParams({
    accountIdentifier: options.account,
    orgIdentifier: options.org,
    projectIdentifier: options.project,
    ...extra,
  });
}

async function request(options, path, init = {}) {
  const response = await fetch(`${options.baseUrl}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'x-api-key': options.apiKey,
      'Harness-Account': options.account,
      ...init.headers,
    },
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) {
    const detail = body?.message || body?.status || `HTTP ${response.status}`;
    throw new Error(`${init.method || 'GET'} ${path.split('?')[0]} failed: ${detail}`);
  }
  return body;
}

function extractPipelineYaml(response) {
  const data = response?.data || response;
  const yaml = data?.yamlPipeline || data?.pipeline?.yamlPipeline || data?.pipelineYaml;
  if (typeof yaml !== 'string') throw new Error('Harness pipeline response did not include yamlPipeline.');
  return yaml;
}

async function readPipeline(options) {
  const search = query(options, { getMetadataOnly: 'false' });
  return extractPipelineYaml(await request(options, `/pipeline/api/pipelines/${encodeURIComponent(options.pipeline)}?${search}`));
}

async function writePipeline(options, yaml) {
  const search = query(options);
  await request(options, `/pipeline/api/pipelines/${encodeURIComponent(options.pipeline)}?${search}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ yamlPipeline: yaml }),
  });
}

async function verifyRemoteSources(options) {
  const connectorSearch = query(options);
  const connector = await request(options, `/ng/api/connectors/${encodeURIComponent(options.connector)}?${connectorSearch}`);
  assertConnectorTargetsProductionRepo(connector, options.connector);
  for (const expected of DELIVERY_STAGES) {
    const templateSearch = query(options, {
      versionLabel: 'v0.1.0',
      branch: PRODUCTION_SOURCE.branch,
      storeType: 'REMOTE',
      connectorRef: options.connector,
      repoName: PRODUCTION_SOURCE.repository,
    });
    const template = await request(options, `/template/api/templates/${encodeURIComponent(expected.templateIdentifier)}?${templateSearch}`);
    assertRemoteTemplateMetadata(template, expected, options.connector);
  }
}

function backupPath(options, source) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve(root, '.harness-backups', `${options.pipeline}-${stamp}-${pipelineDigest(source).slice(0, 12)}.yaml`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const options = {
    account: required(args.account || process.env.HARNESS_ACCOUNT_ID, '--account/HARNESS_ACCOUNT_ID'),
    org: required(args.org || process.env.HARNESS_ORG_ID, '--org/HARNESS_ORG_ID'),
    project: required(args.project || process.env.HARNESS_PROJECT_ID, '--project/HARNESS_PROJECT_ID'),
    pipeline: required(args.pipeline || process.env.HARNESS_PIPELINE_ID, '--pipeline/HARNESS_PIPELINE_ID'),
    connector: args.connector || process.env.HARNESS_GITHUB_CONNECTOR,
    beforeStage: args.beforeStage,
    baseUrl: String(args.baseUrl || process.env.HARNESS_BASE_URL || 'https://app.harness.io').replace(/\/+$/, ''),
    apiKey: required(process.env.HARNESS_API_KEY, 'HARNESS_API_KEY'),
  };

  const modes = Number(Boolean(args.dryRun)) + Number(Boolean(args.apply)) + Number(Boolean(args.rollback));
  if (modes !== 1) usage('Choose exactly one of --dry-run, --apply, or --rollback FILE.');
  assertProductionSource();
  validateGeneratedTemplateCatalog();
  const stageSources = [
    readFileSync(resolve(root, 'harness/stages/spec-to-postman-onboarding.yaml'), 'utf8'),
    readFileSync(resolve(root, 'harness/stages/postman-cli-quality-gate.yaml'), 'utf8'),
  ];
  const directReferences = assertImmutablePostmanCsActions(stageSources);

  if (args.rollback) {
    const backup = readFileSync(resolve(args.rollback), 'utf8');
    const current = await readPipeline(options);
    console.log(`Rollback target: ${options.pipeline}`);
    console.log(`Current SHA-256: ${pipelineDigest(current)}`);
    console.log(`Backup SHA-256:  ${pipelineDigest(backup)}`);
    await writePipeline(options, backup);
    const readback = await readPipeline(options);
    if (pipelineDigest(readback) !== pipelineDigest(backup)) throw new Error('Rollback read-back digest mismatch.');
    console.log('Rollback applied and read-back verified.');
    return;
  }

  required(options.connector, '--connector/HARNESS_GITHUB_CONNECTOR');
  await verifyRemoteSources(options);
  const current = await readPipeline(options);
  const result = installLinkedStages(current, { beforeStage: options.beforeStage });
  console.log(`Pipeline: ${options.pipeline}`);
  console.log(`Production source: ${PRODUCTION_SOURCE.fullName}@${PRODUCTION_SOURCE.branch}`);
  console.log(`Direct immutable postman-cs runtime references verified: ${directReferences}`);
  console.log(`Current SHA-256: ${pipelineDigest(current)}`);
  console.log(`Planned SHA-256: ${pipelineDigest(result.yaml)}`);
  console.log(`Install: ${result.installed.join(', ') || 'none (already installed)'}`);
  console.log(`Already present: ${result.alreadyPresent.join(', ') || 'none'}`);

  if (args.dryRun || !result.changed) {
    console.log(result.changed ? 'Dry run complete; Harness was not changed.' : 'No-op: approved linked stages are already installed.');
    return;
  }
  if (!options.beforeStage) usage('--before-stage is required for a production apply so promotion ordering is explicit.');

  const backup = backupPath(options, current);
  mkdirSync(resolve(root, '.harness-backups'), { recursive: true });
  writeFileSync(backup, current, { mode: 0o600 });
  console.log(`Backup: ${backup}`);
  await writePipeline(options, result.yaml);
  const readback = await readPipeline(options);
  const verified = installLinkedStages(readback, { beforeStage: options.beforeStage });
  if (verified.changed) throw new Error('Harness read-back does not contain both approved linked stages.');
  console.log(`Applied and read-back verified: ${pipelineDigest(readback)}`);
}

main().catch((error) => {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
