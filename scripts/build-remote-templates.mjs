import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const REMOTE_TEMPLATE_VERSION = 'v0.2.0';
export const REMOTE_TEMPLATES = [
  {
    stagePath: 'harness/stages/spec-to-postman-onboarding.yaml',
    templatePath: '.harness/templates/paypal-postman-onboarding-v0.2.0.yaml',
    name: 'PayPal - Postman onboarding',
    identifier: 'paypal_postman_onboarding',
    description: 'Pinned GitHub OpenAPI contract to idempotent Postman workspace, spec, and collection onboarding.',
  },
  {
    stagePath: 'harness/stages/postman-cli-quality-gate.yaml',
    templatePath: '.harness/templates/paypal-postman-cli-quality-gate-v0.2.0.yaml',
    name: 'PayPal - Postman CLI quality gate',
    identifier: 'paypal_postman_cli_quality_gate',
    description: 'Read-only Postman CLI lint and collection execution gate with Harness JUnit results.',
  },
];

export function stageToTemplate(stageSource, metadata) {
  const parsed = parse(stageSource);
  if (!parsed?.stage?.spec || parsed.stage.type !== 'CI') {
    throw new Error(`${metadata.stagePath} is not one Harness CI stage.`);
  }
  const { name: _stageName, identifier: _stageIdentifier, ...stageContract } = parsed.stage;
  return {
    template: {
      name: metadata.name,
      identifier: metadata.identifier,
      versionLabel: REMOTE_TEMPLATE_VERSION,
      type: 'Stage',
      description: metadata.description,
      tags: {
        owner: 'postman-cs',
        customer: 'paypal',
        source: 'postman-cs/paypal-harness-postman-stages',
      },
      spec: stageContract,
    },
  };
}

export function renderRemoteTemplate(metadata) {
  const source = readFileSync(resolve(root, metadata.stagePath), 'utf8');
  return `# GENERATED from ${metadata.stagePath}; run pnpm harness:templates to refresh.\n${stringify(stageToTemplate(source, metadata), { lineWidth: 0 })}`;
}

export function buildRemoteTemplates() {
  for (const metadata of REMOTE_TEMPLATES) {
    const destination = resolve(root, metadata.templatePath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, renderRemoteTemplate(metadata));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildRemoteTemplates();
  console.log(`Generated ${REMOTE_TEMPLATES.length} Harness remote stage templates.`);
}
