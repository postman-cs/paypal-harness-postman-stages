import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (name) => readFileSync(resolve(root, 'harness/stages', name), 'utf8');
const onboarding = read('spec-to-postman-onboarding.yaml');
const cli = read('postman-cli-quality-gate.yaml');
const gitSync = read('postman-to-git-sync.yaml');
const insights = read('runtime-route-discovery.yaml');

test('one semantic drop-in stage exists for each PayPal pipeline ask', () => {
  for (const source of [onboarding, cli, gitSync, insights]) {
    assert.match(source, /^stage:$/m);
    assert.doesNotMatch(source, /^pipeline:$/m);
  }
});

test('regular onboarding is the primary Postman lifecycle path', () => {
  assert.match(onboarding, /uses: postman-cs\/postman-api-onboarding-action@v2\.1\.2/);
  assert.doesNotMatch(onboarding, /postman-onboarding-tdd/);
  assert.match(onboarding, /repo-write-mode: none/);
  assert.match(onboarding, /skip-built-in-tests: "true"/);
  assert.match(onboarding, /approve_postman_write/);
  assert.match(onboarding, /workspace-id: <\+stage\.variables\.workspace_id>/);
});

test('CLI stage is read-only, Winter Trinity locked, and publishes JUnit', () => {
  assert.match(cli, /postman login --with-api-key/);
  assert.match(cli, /postman search workspaces 'Winter Trinity'/);
  assert.match(cli, /postman spec lint/);
  assert.match(cli, /postman collection run/);
  assert.match(cli, /onboarding_collections_json/);
  assert.match(cli, /x\.smoke/);
  assert.match(cli, /x\.contract/);
  assert.match(cli, /writePolicy=none/);
  assert.match(cli, /type: JUnit/);
  assert.doesNotMatch(cli, /commit-and-push/);
});

test('all customer lifecycle actions resolve directly to postman-cs', () => {
  assert.match(onboarding, /uses: postman-cs\//);
  assert.match(gitSync, /uses: postman-cs\/postman-repo-sync-action@[a-f0-9]{40}/);
  assert.match(insights, /uses: postman-cs\/postman-insights-onboarding-action@[a-f0-9]{40}/);
  for (const source of [onboarding, cli, gitSync, insights]) {
    assert.doesNotMatch(source, /danielshively-source\/paypal-harness-pipeline@/);
  }
});

test('Postman to Git is human gated and cannot push', () => {
  assert.match(gitSync, /approve_local_commit/);
  assert.match(gitSync, /repo-write-mode: commit-only/);
  assert.doesNotMatch(gitSync, /commit-and-push/);
});

test('runtime discovery is gated and does not overclaim rogue-route comparison', () => {
  assert.match(insights, /approve_runtime_link/);
  assert.match(insights, /create-api-key: "false"/);
  assert.match(insights, /route-inventory-comparison-remains-a-separate-customer-discovery-gate/);
});
