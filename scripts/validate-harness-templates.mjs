import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePostmanUses, verifySupplyChain } from './verify-supply-chain.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(readFileSync(resolve(root, 'postman-cs.lock.json'), 'utf8'));
const wrapperPin = 'danielshively-source/paypal-harness-pipeline@e6b290c034aa1cc8a144578041fbd652b1f4f09f';
const wrapperTemplates = [
  'harness/pipeline-cloud-vm.yaml',
  'harness/pipeline-kubernetes.yaml',
  'harness/pipeline-studio-sandbox.yaml',
];
const stageTemplates = [
  'harness/stages/spec-to-postman-onboarding.yaml',
  'harness/stages/postman-cli-quality-gate.yaml',
  'harness/stages/postman-to-git-sync.yaml',
  'harness/stages/runtime-route-discovery.yaml',
];
const remoteTemplates = [
  '.harness/templates/paypal-postman-onboarding-v0.1.0.yaml',
  '.harness/templates/paypal-postman-cli-quality-gate-v0.1.0.yaml',
];
const expectedStageActions = new Map([
  ['harness/stages/spec-to-postman-onboarding.yaml', 'postman-cs/postman-bootstrap-action'],
  ['harness/stages/postman-to-git-sync.yaml', 'postman-cs/postman-repo-sync-action'],
  ['harness/stages/runtime-route-discovery.yaml', 'postman-cs/postman-insights-onboarding-action'],
]);
let failed = false;

function checkSecretsAndMutableRefs(relative, source) {
  const checks = [
    [/PMAK-[A-Za-z0-9_-]+/, 'contains a literal Postman API key'],
    [/pat\.[A-Za-z0-9._-]+/, 'contains a literal Harness token'],
    [/@(?:main|master)\b|@v\d+(?:\.\d+)?(?=\s|$)/, 'contains a mutable action reference'],
  ];
  for (const [pattern, message] of checks) {
    if (pattern.test(source)) {
      console.error(`ERROR: ${relative} ${message}.`);
      failed = true;
    }
  }
}

for (const relative of wrapperTemplates) {
  const source = readFileSync(resolve(root, relative), 'utf8');
  checkSecretsAndMutableRefs(relative, source);
  if (!source.includes(wrapperPin)) {
    console.error(`ERROR: ${relative} must use the approved immutable wrapper commit.`);
    failed = true;
  }
}

for (const relative of stageTemplates) {
  const source = readFileSync(resolve(root, relative), 'utf8');
  checkSecretsAndMutableRefs(relative, source);
  if (!/^stage:$/m.test(source) || /^pipeline:$/m.test(source)) {
    console.error(`ERROR: ${relative} must contain exactly one drop-in stage, not a pipeline.`);
    failed = true;
  }
  if (source.includes('danielshively-source/paypal-harness-pipeline@')) {
    console.error(`ERROR: ${relative} must not depend on the personal wrapper repository.`);
    failed = true;
  }

  const expected = expectedStageActions.get(relative);
  const refs = parsePostmanUses(source);
  if (expected && !refs.some(({ repository }) => repository === expected)) {
    console.error(`ERROR: ${relative} must directly use ${expected}.`);
    failed = true;
  }
  const supply = verifySupplyChain(source, lock, {
    requireAllLocks: false,
    requireReference: Boolean(expected),
    sourceLabel: relative,
  });
  for (const error of supply.errors) {
    console.error(`ERROR: ${relative}: ${error}`);
    failed = true;
  }
}

for (const relative of remoteTemplates) {
  const source = readFileSync(resolve(root, relative), 'utf8');
  checkSecretsAndMutableRefs(relative, source);
  if (!/^template:$/m.test(source) || !/^\s+type: Stage$/m.test(source)) {
    console.error(`ERROR: ${relative} must be a Harness stage template.`);
    failed = true;
  }
  if (!source.includes('source: postman-cs/paypal-harness-postman-stages')) {
    console.error(`ERROR: ${relative} must declare the production postman-cs delivery source.`);
    failed = true;
  }
  if (source.includes('danielshively-source')) {
    console.error(`ERROR: ${relative} must not contain a personal namespace.`);
    failed = true;
  }
}

const onboarding = readFileSync(resolve(root, stageTemplates[0]), 'utf8');
if (/repo-write-mode:|generate-ci-workflow:|enable-insights:|skip-built-in-tests:/.test(onboarding)) {
  console.error('ERROR: Harness onboarding must call only the bootstrap core; wrapper-only Git, Insights, and test inputs are forbidden.');
  failed = true;
}
const cli = readFileSync(resolve(root, stageTemplates[1]), 'utf8');
for (const required of [/postman spec lint/, /postman collection run/, /type: JUnit/, /Winter Trinity/]) {
  if (!required.test(cli)) {
    console.error(`ERROR: CLI stage is missing ${required}.`);
    failed = true;
  }
}

if (failed) process.exitCode = 1;
else console.log(`Validated ${wrapperTemplates.length} wrapper pipeline(s), ${stageTemplates.length} customer drop-in stage(s), and ${remoteTemplates.length} production remote template(s).`);
