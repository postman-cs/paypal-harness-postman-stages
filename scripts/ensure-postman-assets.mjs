#!/usr/bin/env node
// Idempotent Postman asset provisioner for a target workspace, using only the
// public Postman API (no Spec Hub ws-proxy dependency). Safe to run on every
// pipeline execution: assets are adopted by canonical name when they exist,
// created when they do not, and never duplicated. Environment values converge
// to the requested state.
//
//   POSTMAN_API_KEY=... node scripts/ensure-postman-assets.mjs \
//     --workspace-id <id>           # existing target workspace, OR:
//     --workspace-name <name> --workspace-team-id <numeric sub-team id>
//                                   # find-by-name or create (org-mode tenants
//                                   # bind creation via teamId in the body)
//     --project-name <name>         # canonical asset name prefix, e.g. paypal-orders
//     --spec-url <url>              # pinned contract source
//     --spec-sha256 <digest>        # exact digest of the contract
//     --inventory-url <url>         # live app OpenAPI used to generate the contract collection
//     --app-base-url <url>          # live service base URL for the environment + smoke tests
//     [--env-name <name>]           # default: <project-name>-live
//     [--result-json <path>]        # machine-readable result
//
// Prints KEY=VALUE lines (SPEC_ID, CONTRACT_UID, SMOKE_UID, ENVIRONMENT_UID,
// CREATED_*) for direct consumption as CI output variables.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const BASE = 'https://api.getpostman.com';
const KEY = process.env.POSTMAN_API_KEY;
if (!KEY) { console.error('POSTMAN_API_KEY is required.'); process.exit(2); }

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  console.error(`--${name} is required.`);
  process.exit(2);
}

const PROJECT = arg('project-name');
const SPEC_URL = arg('spec-url');
const SPEC_SHA256 = arg('spec-sha256');
const INVENTORY_URL = arg('inventory-url');
const APP_BASE_URL = arg('app-base-url');
const ENV_NAME = arg('env-name', `${PROJECT}-live`);

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'X-Api-Key': KEY, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

const created = { workspace: false, spec: false, contract: false, smoke: false, environment: false };

// 0. Workspace: explicit id, or ensured by exact name (created under the
//    given sub-team when absent — org-mode tenants require teamId in the body).
let WORKSPACE = arg('workspace-id', '');
if (!WORKSPACE) {
  const wsName = arg('workspace-name');
  const wsTeam = Number(arg('workspace-team-id'));
  const all = (await api('GET', '/workspaces')).workspaces ?? [];
  const existing = all.filter((w) => w.name === wsName);
  if (existing.length > 1) throw new Error(`workspace name "${wsName}" is ambiguous (${existing.length} matches); pass --workspace-id`);
  if (existing.length === 1) {
    WORKSPACE = existing[0].id;
  } else {
    const res = await api('POST', '/workspaces', {
      workspace: { name: wsName, type: 'team', teamId: wsTeam, description: 'Provisioned by ensure-postman-assets (idempotent).' },
    });
    WORKSPACE = res.workspace.id;
    created.workspace = true;
  }
}

// 1. Spec: digest-verified, created once, adopted thereafter.
const specs = (await api('GET', `/specs?workspaceId=${WORKSPACE}`)).specs ?? [];
let spec = specs.find((s) => s.name === PROJECT);
if (!spec) {
  const contractRes = await fetch(SPEC_URL);
  if (!contractRes.ok) throw new Error(`spec download failed: ${contractRes.status}`);
  const contract = await contractRes.text();
  const digest = createHash('sha256').update(contract).digest('hex');
  if (digest !== SPEC_SHA256.toLowerCase()) {
    throw new Error(`spec digest mismatch: expected ${SPEC_SHA256}, got ${digest}`);
  }
  spec = await api('POST', `/specs?workspaceId=${WORKSPACE}`, {
    name: PROJECT,
    type: 'OPENAPI:3.0',
    files: [{ path: 'index.json', content: contract }],
  });
  created.spec = true;
}

// 2. Contract collection: generated from the live application's OpenAPI so the
//    behavioral run always matches the deployed surface; renamed to a canonical
//    name so reruns adopt instead of duplicating.
const CONTRACT_NAME = `${PROJECT} contract`;
const collections = (await api('GET', `/collections?workspace=${WORKSPACE}`)).collections ?? [];
let contract = collections.find((c) => c.name === CONTRACT_NAME);
if (!contract) {
  const invRes = await fetch(INVENTORY_URL);
  if (!invRes.ok) throw new Error(`inventory download failed: ${invRes.status}`);
  const imported = await api('POST', `/import/openapi?workspace=${WORKSPACE}`, {
    type: 'string',
    input: await invRes.text(),
  });
  const uid = imported.collections?.[0]?.uid ?? imported.collections?.[0]?.id;
  if (!uid) throw new Error(`import returned no collection: ${JSON.stringify(imported).slice(0, 200)}`);
  await api('PATCH', `/collections/${uid}`, { collection: { info: { name: CONTRACT_NAME } } });
  contract = { uid, name: CONTRACT_NAME };
  created.contract = true;
}

// 3. Smoke collection: health + inventory reachability with assertions.
const SMOKE_NAME = `${PROJECT} smoke`;
let smoke = collections.find((c) => c.name === SMOKE_NAME);
if (!smoke) {
  const res = await api('POST', `/collections?workspace=${WORKSPACE}`, {
    collection: {
      info: { name: SMOKE_NAME, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [
        {
          name: 'actuator health',
          event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
            "pm.test('health responds 200', () => pm.response.to.have.status(200));",
            "pm.test('status is UP', () => pm.expect(pm.response.json().status).to.eql('UP'));",
          ] } }],
          request: { method: 'GET', url: `${APP_BASE_URL}/actuator/health` },
        },
        {
          name: 'route inventory served',
          event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
            "pm.test('inventory responds 200', () => pm.response.to.have.status(200));",
          ] } }],
          request: { method: 'GET', url: INVENTORY_URL },
        },
      ],
    },
  });
  smoke = { uid: res.collection.uid ?? res.collection.id, name: SMOKE_NAME };
  created.smoke = true;
}

// 4. Environment: created once; baseUrl converges on every run.
const environments = (await api('GET', `/environments?workspace=${WORKSPACE}`)).environments ?? [];
let environment = environments.find((e) => e.name === ENV_NAME);
if (!environment) {
  const res = await api('POST', `/environments?workspace=${WORKSPACE}`, {
    environment: { name: ENV_NAME, values: [{ key: 'baseUrl', value: APP_BASE_URL, enabled: true }] },
  });
  environment = { uid: res.environment.uid ?? res.environment.id, name: ENV_NAME };
  created.environment = true;
} else {
  const detail = await api('GET', `/environments/${environment.uid}`);
  const baseUrl = (detail.environment.values ?? []).find((v) => v.key === 'baseUrl');
  if (!baseUrl || baseUrl.value !== APP_BASE_URL) {
    await api('PUT', `/environments/${environment.uid}`, {
      environment: {
        name: ENV_NAME,
        values: [{ key: 'baseUrl', value: APP_BASE_URL, enabled: true }],
      },
    });
  }
}

const result = {
  workspaceId: WORKSPACE,
  specId: spec.id,
  contractUid: contract.uid,
  smokeUid: smoke.uid,
  environmentUid: environment.uid,
  created,
};
if (arg('result-json', '')) writeFileSync(arg('result-json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(`SPEC_ID=${result.specId}`);
console.log(`CONTRACT_UID=${result.contractUid}`);
console.log(`SMOKE_UID=${result.smokeUid}`);
console.log(`ENVIRONMENT_UID=${result.environmentUid}`);
console.log(`CREATED=${Object.entries(created).filter(([, v]) => v).map(([k]) => k).join(',') || 'none-adopted-all'}`);
