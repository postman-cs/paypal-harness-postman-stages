import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePostmanUses, verifySupplyChain } from '../scripts/verify-supply-chain.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const action = readFileSync(resolve(import.meta.dirname, '..', 'action.yml'), 'utf8');

test('parses only direct Postman-CS action references', () => {
  const refs = parsePostmanUses(`
    uses: postman-cs/example@0123456789012345678901234567890123456789
    uses: actions/checkout@v4
  `);
  assert.deepEqual(refs, [{
    repository: 'postman-cs/example',
    ref: '0123456789012345678901234567890123456789',
  }]);
});

test('rejects mutable references', () => {
  const result = verifySupplyChain(
    'uses: postman-cs/example@main',
    { dependencies: { 'postman-cs/example': { commit: '0'.repeat(40) } } },
  );
  assert.match(result.errors.join('\n'), /not pinned to its exact Harness-compatible release tag/);
});

test('accepts an exact Harness release tag paired with its locked commit', () => {
  const result = verifySupplyChain(
    'uses: postman-cs/example@v2.1.2',
    { dependencies: { 'postman-cs/example': {
      harnessRef: 'v2.1.2',
      commit: '0'.repeat(40),
    } } },
  );
  assert.deepEqual(result.errors, []);
});

test('rejects lock drift', () => {
  const result = verifySupplyChain(
    `uses: postman-cs/example@${'1'.repeat(40)}`,
    { dependencies: { 'postman-cs/example': { commit: '2'.repeat(40) } } },
  );
  assert.match(result.errors.join('\n'), /does not match its locked commit/);
});

test('allows one stage to verify its own direct lock without consuming the entire catalog', () => {
  const result = verifySupplyChain(
    `uses: postman-cs/example@${'1'.repeat(40)}`,
    { dependencies: {
      'postman-cs/example': { commit: '1'.repeat(40) },
      'postman-cs/another': { commit: '2'.repeat(40) },
    } },
    { requireAllLocks: false, sourceLabel: 'stage.yaml' },
  );
  assert.deepEqual(result.errors, []);
});

test('keeps onboarding behind an explicit human risk gate', () => {
  assert.match(action, /approve-onboarding-risk:[\s\S]*?default: "false"/);
  assert.match(action, /OPERATION" = "onboard"[\s\S]*?APPROVE_ONBOARDING_RISK" != "true"/);
});
