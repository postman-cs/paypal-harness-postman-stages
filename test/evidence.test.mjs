import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finishEvidence, startEvidence } from '../scripts/build-evidence.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'paypal-harness-evidence-'));
  writeFileSync(join(root, 'openapi.yaml'), 'openapi: 3.0.4\ninfo:\n  title: Orders\n  version: 2.32\npaths: {}\n');
  writeFileSync(join(root, 'postman-cs.lock.json'), '{"version":1}\n');
  return root;
}

function options(root) {
  return {
    root,
    actionRoot: root,
    reportDirectory: '.reports',
    operation: 'cli-test',
    projectName: 'paypal-orders',
    configPath: '.postman-template/onboarding.yml',
    specPath: 'openapi.yaml',
    workspaceName: 'Winter Trinity',
    workspaceId: 'workspace-1',
    smokeCollectionId: 'collection-1',
    environmentId: 'environment-1',
    reportFormat: 'junit',
    configWriteMode: 'none',
    repoWriteMode: 'none',
  };
}

test('identical immutable inputs reuse one fingerprint and evidence path', () => {
  const root = fixture();
  const first = startEvidence(options(root));
  writeFileSync(join(root, '.reports', 'smoke.xml'), '<testsuite tests="1" failures="0"/>\n');
  finishEvidence({ root, reportDirectory: '.reports', evidencePath: first.evidencePath, summaryPath: first.summaryPath, status: 'success', workspaceId: 'workspace-1' });
  const second = startEvidence(options(root));
  assert.equal(second.fingerprint, first.fingerprint);
  assert.equal(second.evidencePath, first.evidencePath);
  assert.equal(second.summaryPath, first.summaryPath);
  assert.equal(second.evidence.idempotency.mutationPolicy, 'read-only');
});

test('contract or spec changes create a different idempotency fingerprint', () => {
  const root = fixture();
  const first = startEvidence(options(root));
  const changedCollection = startEvidence({ ...options(root), smokeCollectionId: 'collection-2' });
  writeFileSync(join(root, 'openapi.yaml'), 'openapi: 3.0.4\ninfo:\n  title: Orders changed\n  version: 2.33\npaths: {}\n');
  const changedSpec = startEvidence(options(root));
  assert.notEqual(changedCollection.fingerprint, first.fingerprint);
  assert.notEqual(changedSpec.fingerprint, first.fingerprint);
});

test('final evidence inventories reports without credentials', () => {
  const root = fixture();
  const started = startEvidence(options(root));
  writeFileSync(join(root, '.reports', 'contract.xml'), '<testsuite tests="2" failures="1"/>\n');
  const finished = finishEvidence({ root, reportDirectory: '.reports', evidencePath: started.evidencePath, summaryPath: started.summaryPath, status: 'failure', workspaceId: 'workspace-1' });
  const serialized = readFileSync(join(root, started.evidencePath), 'utf8');
  assert.equal(finished.evidence.result.artifacts.length, 1);
  assert.match(serialized, /contract\.xml/);
  assert.doesNotMatch(serialized, /PMAK-|postman-api-key|authorization/i);
});
