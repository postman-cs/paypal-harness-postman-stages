import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResolvedIdentity } from '../scripts/postman-service-account-preflight.mjs';

test('Mac service-account preflight parses identity without returning the token', () => {
  assert.deepEqual(
    parseResolvedIdentity(JSON.stringify({ token: 'secret-token', 'team-id': '6029', skipped: 'false' })),
    { teamId: '6029', skipped: false },
  );
});

test('Mac service-account preflight rejects incomplete resolver output', () => {
  assert.throws(() => parseResolvedIdentity('{"team-id":"6029"}'), /token and team-id/);
});
