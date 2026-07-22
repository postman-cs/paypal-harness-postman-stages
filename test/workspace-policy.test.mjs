import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveWorkspace, workspaceCandidates } from '../scripts/resolve-workspace.mjs';
import { parseSimpleYamlPaths, validateTddWorkspace } from '../scripts/validate-tdd-workspace.mjs';

test('finds nested Postman CLI workspace search results', () => {
  const input = { data: { results: [{ name: 'Winter Trinity', id: '123-ws' }] } };
  assert.deepEqual(workspaceCandidates(input), [{ name: 'Winter Trinity', id: '123-ws' }]);
  assert.deepEqual(resolveWorkspace(input, 'Winter Trinity'), { name: 'Winter Trinity', id: '123-ws' });
});

test('rejects a non-exact or ambiguous workspace', () => {
  assert.throws(() => resolveWorkspace({ results: [{ name: 'Winter Trinity Copy', id: 'a' }] }, 'Winter Trinity'), /No exact workspace/);
  assert.throws(() => resolveWorkspace({ results: [{ name: 'winter trinity', id: 'case-mismatch' }] }, 'Winter Trinity'), /No exact workspace/);
  assert.throws(() => resolveWorkspace({ results: [
    { name: 'Winter Trinity', id: 'a' },
    { name: 'Winter Trinity', id: 'b' },
  ] }, 'Winter Trinity'), /Multiple exact workspaces/);
});

test('rejects an unexpected workspace id', () => {
  assert.throws(
    () => resolveWorkspace({ results: [{ name: 'Winter Trinity', id: 'actual' }] }, 'Winter Trinity', 'expected'),
    /expected workspace ID/,
  );
});

test('uses an expected id to disambiguate exact-name workspaces', () => {
  const input = { results: [
    { name: 'Winter Trinity', id: 'first' },
    { name: 'Winter Trinity', id: 'approved' },
  ] };
  assert.deepEqual(resolveWorkspace(input, 'Winter Trinity', 'approved'), {
    name: 'Winter Trinity',
    id: 'approved',
  });
});

test('parses and validates the TDD workspace and spec path', () => {
  const source = `
version: 1
spec:
  path: api/openapi.yaml
tdd:
  workspace:
    name: Winter Trinity
    id: 123-ws
`;
  const paths = parseSimpleYamlPaths(source);
  assert.equal(paths.get('tdd.workspace.name'), 'Winter Trinity');
  assert.deepEqual(validateTddWorkspace(source, 'Winter Trinity', '123-ws'), {
    configuredName: 'Winter Trinity',
    configuredId: '123-ws',
    specPath: 'api/openapi.yaml',
  });
});

test('rejects a different TDD workspace or unsafe spec path', () => {
  const other = 'spec:\n  path: api/openapi.yaml\ntdd:\n  workspace:\n    name: Other\n';
  assert.throws(() => validateTddWorkspace(other, 'Winter Trinity', '123-ws'), /exact workspace name/);
  const unsafe = 'spec:\n  path: ../openapi.yaml\ntdd:\n  workspace:\n    name: Winter Trinity\n';
  assert.throws(() => validateTddWorkspace(unsafe, 'Winter Trinity', '123-ws'), /may not traverse upward/);
});

test('the composite action is CLI-first and hard-locks test execution to Winter Trinity', () => {
  const action = readFileSync(new URL('../action.yml', import.meta.url), 'utf8');
  assert.match(action, /postman search workspaces/);
  assert.match(action, /postman spec lint/);
  assert.match(action, /postman collection run/);
  assert.match(action, /postman logout/);
  assert.match(action, /TEST_WORKSPACE_NAME" != "Winter Trinity"/);
  assert.match(action, /--reporters cli,junit/);
  assert.match(action, /--reporters cli\n/);
  assert.doesNotMatch(action, /curl\s+[^\n]*\|\s*(?:ba)?sh/);
});
