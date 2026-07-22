import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { REMOTE_TEMPLATES, renderRemoteTemplate, stageToTemplate } from '../scripts/build-remote-templates.mjs';
import {
  DELIVERY_STAGES,
  PRODUCTION_SOURCE,
  assertConnectorTargetsProductionRepo,
  assertImmutablePostmanCsActions,
  assertProductionSource,
  assertRemoteTemplateMetadata,
  harnessPipelineUpdate,
  installLinkedStages,
} from '../scripts/harness-installer-core.mjs';

const root = resolve(import.meta.dirname, '..');

test('pipeline updates use Harness raw YAML contract', () => {
  const yaml = 'pipeline:\n  identifier: paypal\n';
  assert.deepEqual(harnessPipelineUpdate(yaml), {
    method: 'PUT',
    headers: { 'content-type': 'application/yaml' },
    body: yaml,
  });
  assert.throws(() => harnessPipelineUpdate('{"yamlPipeline":"..."}'), /raw pipeline YAML/);
});

function fixture(stages = [{ stage: { name: 'Promote', identifier: 'promote', type: 'Custom', spec: {} } }]) {
  return `pipeline:\n  name: Existing PayPal pipeline\n  identifier: paypal_existing\n  stages:\n${stages.map((item) => `    - ${JSON.stringify(item)}`).join('\n')}\n`;
}

test('checked-in remote templates are deterministic projections of customer stages', () => {
  for (const metadata of REMOTE_TEMPLATES) {
    const checkedIn = readFileSync(resolve(root, metadata.templatePath), 'utf8');
    assert.equal(checkedIn, renderRemoteTemplate(metadata));
    const parsed = parse(checkedIn);
    assert.equal(parsed.template.identifier, metadata.identifier);
    assert.equal(parsed.template.tags.source, PRODUCTION_SOURCE.fullName);
    assert.equal(parsed.template.type, 'Stage');
    assert.equal(parsed.template.spec.type, 'CI');
  }
});

test('remote template body preserves the canonical stage contract', () => {
  for (const metadata of REMOTE_TEMPLATES) {
    const stage = parse(readFileSync(resolve(root, metadata.stagePath), 'utf8')).stage;
    const template = stageToTemplate(readFileSync(resolve(root, metadata.stagePath), 'utf8'), metadata).template;
    assert.deepEqual(template.spec, {
      type: stage.type,
      variables: stage.variables,
      spec: stage.spec,
    });
  }
});

test('production source rejects forks, wrappers, mutable branches, and personal namespaces', () => {
  assert.doesNotThrow(() => assertProductionSource());
  for (const bad of [
    { ...PRODUCTION_SOURCE, owner: 'danielshively-source', fullName: 'danielshively-source/paypal-harness-pipeline' },
    { ...PRODUCTION_SOURCE, branch: 'develop' },
    { ...PRODUCTION_SOURCE, fullName: 'postman-cs/cse-tools' },
  ]) {
    assert.throws(() => assertProductionSource(bad), /Production/);
  }
});

test('runtime actions must call postman-cs directly at a commit or approved exact Harness tag', () => {
  const onboarding = readFileSync(resolve(root, 'harness/stages/spec-to-postman-onboarding.yaml'), 'utf8');
  const cli = readFileSync(resolve(root, 'harness/stages/postman-cli-quality-gate.yaml'), 'utf8');
  assert.equal(assertImmutablePostmanCsActions([onboarding, cli]), 1);
  assert.throws(
    () => assertImmutablePostmanCsActions(['uses: postman-cs/postman-api-onboarding-action@main']),
    /approved exact Harness release tag/,
  );
  assert.throws(
    () => assertImmutablePostmanCsActions(['uses: postman-cs/postman-api-onboarding-action@v2']),
    /approved exact Harness release tag/,
  );
  assert.throws(
    () => assertImmutablePostmanCsActions(['uses: somebody/paypal-wrapper@0123456789012345678901234567890123456789']),
    /postman-cs/,
  );
});

test('installer inserts exactly two linked stages before the explicit promotion anchor', () => {
  const first = installLinkedStages(fixture(), { beforeStage: 'promote' });
  assert.equal(first.changed, true);
  assert.deepEqual(first.installed, DELIVERY_STAGES.map((stage) => stage.identifier));
  const parsed = parse(first.yaml);
  assert.deepEqual(
    parsed.pipeline.stages.map((item) => item.stage.identifier),
    ['postman_spec_to_postman_onboarding', 'postman_cli_quality_gate', 'promote'],
  );
  assert.deepEqual(
    parsed.pipeline.stages.slice(0, 2).map((item) => item.stage.template.templateRef),
    ['paypal_postman_onboarding', 'paypal_postman_cli_quality_gate'],
  );
});

test('installer is idempotent and refuses collisions or ambiguous anchors', () => {
  const first = installLinkedStages(fixture(), { beforeStage: 'promote' });
  const second = installLinkedStages(first.yaml, { beforeStage: 'promote' });
  assert.equal(second.changed, false);
  assert.equal(second.yaml, first.yaml);
  assert.throws(() => installLinkedStages(fixture(), { beforeStage: 'missing' }), /anchor/);
  const collision = fixture([{ stage: { name: 'Untrusted', identifier: DELIVERY_STAGES[0].identifier, type: 'CI', spec: {} } }]);
  assert.throws(() => installLinkedStages(collision), /not the approved linked/);
});

test('preflight verifies the Harness connector and both remote template paths', () => {
  const connector = {
    data: { connector: { identifier: 'postman_cs', spec: { url: 'https://github.com/postman-cs/paypal-harness-postman-stages.git' } } },
  };
  assert.doesNotThrow(() => assertConnectorTargetsProductionRepo(connector, 'postman_cs'));
  assert.throws(
    () => assertConnectorTargetsProductionRepo({ data: { spec: { url: 'https://github.com/person/fork' } } }, 'fork'),
    /not pinned/,
  );
  assert.throws(
    () => assertConnectorTargetsProductionRepo({ data: { spec: { url: 'https://github.com/postman-cs/paypal-harness-postman-stages.evil.example' } } }, 'spoofed'),
    /not pinned/,
  );
  for (const expected of DELIVERY_STAGES) {
    const metadata = {
      data: {
        gitDetails: {
          repoName: 'paypal-harness-postman-stages',
          connectorRef: 'postman_cs',
          filePath: expected.templatePath,
          storeType: 'REMOTE',
          branch: 'main',
        },
      },
    };
    assert.doesNotThrow(() => assertRemoteTemplateMetadata(metadata, expected, 'postman_cs'));
  }
});
