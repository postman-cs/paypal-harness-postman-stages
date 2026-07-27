import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePath,
  routeKey,
  extractSpecRoutes,
  extractAppRoutes,
  applySubset,
  compare,
  toJUnit,
} from '../scripts/compare-routes.mjs';

test('normalizePath templates parameters and trims slashes', () => {
  assert.equal(normalizePath('/api/pets/{petId}/'), '/api/pets/{}');
  assert.equal(normalizePath('/api/pets/{id}'), '/api/pets/{}');
  assert.equal(normalizePath('api//pets'), '/api/pets');
});

test('routeKey equates spring and OAS parameter names', () => {
  assert.equal(routeKey('get', '/api/pets/{petId}'), routeKey('GET', '/api/pets/{id}'));
});

test('extractSpecRoutes reads OAS paths and methods only', () => {
  const routes = extractSpecRoutes({
    paths: { '/a': { get: {}, post: {}, parameters: [] }, '/b/{id}': { delete: {} } },
  });
  assert.equal(routes.length, 3);
});

test('extractAppRoutes accepts generated OpenAPI, records, and strips prefixes', () => {
  const fromSpec = extractAppRoutes({ paths: { '/petclinic/api/x': { get: {} } } }, '/petclinic');
  assert.deepEqual(fromSpec, [{ method: 'GET', path: '/api/x' }]);
  const fromRecords = extractAppRoutes([{ method: 'post', path: '/api/y' }]);
  assert.deepEqual(fromRecords, [{ method: 'POST', path: '/api/y' }]);
});

test('applySubset include and exclude selectors', () => {
  const routes = [
    { method: 'GET', path: '/api/pets' },
    { method: 'GET', path: '/api/pettypes' },
    { method: 'GET', path: '/manage/health' },
  ];
  const kept = applySubset(routes, {
    include: [{ pathPrefix: '/api' }],
    exclude: [{ pathPrefix: '/api/pettypes' }],
  });
  assert.deepEqual(kept.map((r) => r.path), ['/api/pets']);
});

test('compare finds missing, rogue, and honors exceptions', () => {
  const spec = [
    { method: 'GET', path: '/api/pets' },
    { method: 'GET', path: '/api/unicorns' },
  ];
  const app = [
    { method: 'GET', path: '/api/pets' },
    { method: 'DELETE', path: '/api/pets/{petId}' },
  ];
  const result = compare(spec, app, [
    { kind: 'rogue', method: 'DELETE', path: '/api/pets/{id}', reason: 'approved cleanup route' },
  ]);
  assert.equal(result.matched.length, 1);
  assert.equal(result.missingInApp.length, 1);
  assert.equal(result.rogueInApp.length, 1);
  assert.ok(result.rogueInApp[0].exception);
  assert.equal(result.blocking.length, 1); // only the missing endpoint blocks
});

test('toJUnit emits one testcase per route with failures and skips', () => {
  const result = compare(
    [{ method: 'GET', path: '/a' }, { method: 'GET', path: '/b' }],
    [{ method: 'GET', path: '/a' }, { method: 'GET', path: '/c' }],
    [{ kind: 'rogue', method: 'GET', path: '/c', reason: 'ok' }],
  );
  const xml = toJUnit(result);
  assert.match(xml, /tests="3" failures="1" skipped="1"/);
  assert.match(xml, /failure message="Spec endpoint is not implemented/);
  assert.match(xml, /skipped message="approved exception: ok"/);
});
