#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function startEvidence(options) {
  const root = resolve(options.root ?? process.cwd());
  const reportDirectory = safeReportDirectory(options.reportDirectory ?? '.postman-cli-reports');
  const reportRoot = resolve(root, reportDirectory);
  mkdirSync(reportRoot, { recursive: true });

  const specPath = safeOptionalPath(options.specPath);
  const configPath = safeOptionalPath(options.configPath);
  const specDigest = specPath && existsSync(resolve(root, specPath))
    ? digestFile(resolve(root, specPath))
    : null;
  const actionRoot = resolve(options.actionRoot ?? root);
  const lockPath = resolve(actionRoot, 'postman-cs.lock.json');
  const dependencyLockDigest = existsSync(lockPath) ? digestFile(lockPath) : null;
  const immutableInputs = {
    schemaVersion: 1,
    operation: options.operation ?? 'validate',
    projectName: options.projectName ?? '',
    configPath,
    specPath,
    specDigest,
    dependencyLockDigest,
    workspaceName: options.workspaceName ?? '',
    workspaceId: options.workspaceId ?? '',
    smokeCollectionId: options.smokeCollectionId ?? '',
    contractCollectionId: options.contractCollectionId ?? '',
    environmentId: options.environmentId ?? '',
    reportFormat: options.reportFormat ?? 'junit',
    configWriteMode: options.configWriteMode ?? 'none',
    repoWriteMode: options.repoWriteMode ?? 'none',
  };
  const fingerprint = digestText(stableStringify(immutableInputs));
  const evidencePath = join(reportDirectory, `evidence-${fingerprint}.json`);
  const summaryPath = join(reportDirectory, `summary-${fingerprint}.md`);
  const evidence = {
    schemaVersion: 1,
    fingerprint,
    idempotency: {
      key: fingerprint,
      mutationPolicy: mutationPolicy(immutableInputs.operation, immutableInputs.configWriteMode, immutableInputs.repoWriteMode),
      repeatBehavior: 'same inputs replace the same evidence and report paths',
    },
    inputs: immutableInputs,
    result: { status: 'started', workspaceId: null, artifacts: [] },
  };
  writePrivateJson(resolve(root, evidencePath), evidence);
  emitOutput(options.outputPath, 'run-fingerprint', fingerprint);
  emitOutput(options.outputPath, 'evidence-path', evidencePath);
  emitOutput(options.outputPath, 'summary-path', summaryPath);
  logEvent('start', {
    operation: immutableInputs.operation,
    fingerprint,
    mutationPolicy: evidence.idempotency.mutationPolicy,
    specDigest: specDigest ?? 'unavailable',
  });
  return { evidence, evidencePath, summaryPath, fingerprint };
}

export function finishEvidence(options) {
  const root = resolve(options.root ?? process.cwd());
  const evidencePath = safeRequiredPath(options.evidencePath, 'evidence path');
  const summaryPath = safeRequiredPath(options.summaryPath, 'summary path');
  const absoluteEvidence = resolve(root, evidencePath);
  if (!existsSync(absoluteEvidence)) throw new Error(`Evidence file does not exist: ${evidencePath}`);
  const evidence = JSON.parse(readFileSync(absoluteEvidence, 'utf8'));
  const reportRoot = resolve(root, safeReportDirectory(options.reportDirectory ?? '.postman-cli-reports'));
  const artifacts = listArtifacts(reportRoot, root, new Set([evidencePath, summaryPath]));
  evidence.result = {
    status: options.status || 'unknown',
    workspaceId: options.workspaceId || null,
    artifacts,
  };
  writePrivateJson(absoluteEvidence, evidence);

  const summary = renderSummary(evidence, evidencePath);
  const absoluteSummary = resolve(root, summaryPath);
  writeFileSync(absoluteSummary, summary, { encoding: 'utf8', mode: 0o600 });
  chmodSync(absoluteSummary, 0o600);
  if (options.stepSummaryPath) appendFileSync(options.stepSummaryPath, `${summary}\n`, 'utf8');
  logEvent('finish', {
    operation: evidence.inputs.operation,
    fingerprint: evidence.fingerprint,
    status: evidence.result.status,
    workspaceId: evidence.result.workspaceId ?? 'unavailable',
    artifactCount: artifacts.length,
    evidencePath,
  });
  return { evidence, evidencePath, summaryPath };
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function mutationPolicy(operation, configWriteMode, repoWriteMode) {
  if (operation === 'validate' || operation === 'cli-test') return 'read-only';
  if (operation === 'contract-test' && configWriteMode === 'none') return 'idempotent-upsert';
  if (operation === 'onboard' && repoWriteMode === 'none') return 'asset-upsert-no-repo-write';
  return 'mutation-enabled';
}

function renderSummary(evidence, evidencePath) {
  const input = evidence.inputs;
  const artifacts = evidence.result.artifacts.length
    ? evidence.result.artifacts.map((artifact) => `- \`${artifact.path}\` — ${artifact.bytes} bytes — SHA-256 \`${artifact.sha256}\``).join('\n')
    : '- No result artifacts were produced.';
  return `## Postman Harness gate\n\n` +
    `| Field | Value |\n| --- | --- |\n` +
    `| Status | \`${evidence.result.status}\` |\n` +
    `| Operation | \`${input.operation}\` |\n` +
    `| Project | \`${markdown(input.projectName)}\` |\n` +
    `| Workspace | \`${markdown(input.workspaceName || 'not applicable')}\` |\n` +
    `| Workspace ID | \`${markdown(evidence.result.workspaceId || input.workspaceId || 'not resolved')}\` |\n` +
    `| Mutation policy | \`${evidence.idempotency.mutationPolicy}\` |\n` +
    `| Idempotency fingerprint | \`${evidence.fingerprint}\` |\n` +
    `| Spec SHA-256 | \`${input.specDigest || 'not available'}\` |\n` +
    `| Dependency lock SHA-256 | \`${input.dependencyLockDigest || 'not available'}\` |\n` +
    `| Evidence | \`${evidencePath}\` |\n\n` +
    `### Preserved artifacts\n\n${artifacts}\n\n` +
    `No credential values are included in this summary. Identical immutable inputs produce the same fingerprint and evidence paths.\n`;
}

function listArtifacts(directory, root, excluded) {
  if (!existsSync(directory)) return [];
  const output = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const path = relative(root, absolute);
        if (excluded.has(path)) continue;
        output.push({ path, bytes: statSync(absolute).size, sha256: digestFile(absolute) });
      }
    }
  };
  visit(directory);
  return output.sort((left, right) => left.path.localeCompare(right.path));
}

function safeReportDirectory(value) {
  const path = safeRequiredPath(value, 'report directory');
  if (path === '.') throw new Error('Report directory cannot be the repository root.');
  return path.replace(/\/$/, '');
}

function safeOptionalPath(value) {
  if (!value) return null;
  return safeRequiredPath(value, 'path');
}

function safeRequiredPath(value, label) {
  const path = String(value ?? '').trim();
  if (!path || isAbsolute(path) || path.split(/[\\/]/).includes('..')) {
    throw new Error(`${label} must be a safe repository-relative path.`);
  }
  return path;
}

function digestFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function digestText(value) {
  return createHash('sha256').update(value).digest('hex');
}

function writePrivateJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(path, 0o600);
}

function emitOutput(path, name, value) {
  if (path) appendFileSync(path, `${name}=${value}\n`, 'utf8');
}

function logEvent(event, values) {
  const fields = Object.entries(values).map(([key, value]) => `${key}=${logValue(value)}`).join(' ');
  console.log(`POSTMAN_HARNESS event=${event} ${fields}`);
}

function logValue(value) {
  return JSON.stringify(String(value).replace(/[\r\n]+/g, ' '));
}

function markdown(value) {
  return String(value).replace(/[|`\r\n]/g, ' ');
}

async function main() {
  const mode = process.argv[2];
  const common = {
    root: process.cwd(),
    actionRoot: process.env.GITHUB_ACTION_PATH || process.cwd(),
    reportDirectory: process.env.REPORT_DIRECTORY,
  };
  if (mode === 'start') {
    startEvidence({
      ...common,
      operation: process.env.OPERATION,
      projectName: process.env.PROJECT_NAME,
      configPath: process.env.CONFIG_PATH,
      specPath: process.env.SPEC_PATH,
      workspaceName: process.env.WORKSPACE_NAME,
      workspaceId: process.env.WORKSPACE_ID,
      smokeCollectionId: process.env.SMOKE_COLLECTION_ID,
      contractCollectionId: process.env.CONTRACT_COLLECTION_ID,
      environmentId: process.env.ENVIRONMENT_ID,
      reportFormat: process.env.REPORT_FORMAT,
      configWriteMode: process.env.CONFIG_WRITE_MODE,
      repoWriteMode: process.env.REPO_WRITE_MODE,
      outputPath: process.env.GITHUB_OUTPUT,
    });
  } else if (mode === 'finish') {
    finishEvidence({
      ...common,
      evidencePath: process.env.EVIDENCE_PATH,
      summaryPath: process.env.SUMMARY_PATH,
      status: process.env.RESULT_STATUS,
      workspaceId: process.env.RESOLVED_WORKSPACE_ID,
      stepSummaryPath: process.env.GITHUB_STEP_SUMMARY,
    });
  } else {
    throw new Error('Usage: build-evidence.mjs <start|finish>');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`POSTMAN_HARNESS event=evidence-error message=${logValue(error instanceof Error ? error.message : String(error))}`);
    process.exitCode = 1;
  });
}
