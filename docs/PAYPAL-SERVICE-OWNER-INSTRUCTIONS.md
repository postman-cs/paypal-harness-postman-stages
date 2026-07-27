# PayPal Service Owner — Setup & Run Instructions

Postman CS → PayPal handoff for spec-versus-application contract testing in
Harness on Kubernetes. Everything below was executed end-to-end on a live
AMD64 Kubernetes cluster on 2026-07-27: GitHub → Harness (KubernetesDirect) →
Postman, including fail-closed negative tests and deliberate rogue-endpoint
injection. Primary technical contact on the Postman side: your CS team.
Primary PayPal contact: Varun (testENV team implements).

---

## 1. What you are receiving

One repository — `postman-cs/paypal-harness-postman-stages` (use `main`) —
containing three modular Harness CI stages. Each is a single `stage:` object
you paste under your existing pipeline's `stages:` list. PayPal keeps its
triggers, connectors, approval policy, and deployment stages.

| Module | Stage file | What it does |
| --- | --- | --- |
| Contract testing (**start here**) | `harness/stages/postman-cli-quality-gate.yaml` | Verifies the service-account identity and exact target workspace, lints the spec, executes approved Postman collections against your live service, publishes JUnit. Read-only. |
| Mismatch detection | `harness/stages/route-contract-comparison.yaml` | Bidirectional route check: every spec endpoint must exist in the app; every app endpoint must appear in the selected spec (explicit rogue-endpoint detection). Subset selection, approved-exception register, block/warn policy, JSON + JUnit. |
| Synchronization | `harness/stages/spec-to-postman-onboarding.yaml` | Digest-verified spec from your repo into Postman (workspace, spec, generated collections). Requires explicit write approval; never writes to Git. **Currently blocked by an upstream Spec Hub issue — see §9.** |

All execution goes through Postman: the signed Postman CLI runs collections
and lint, the checksum-pinned `postman-bootstrap` CLI performs onboarding, and
every collection run also uploads to Postman Cloud so results are visible in
the workspace run history, not only in Harness.

Everything is pinned: binaries by SHA-256, actions by commit. `pnpm run check`
validates the whole repository (tests + supply-chain verification) — run it
after cloning and after any change.

---

## 2. Prerequisites checklist

Confirm each before the first run:

```
kubectl get nodes -o custom-columns=NAME:.metadata.name,ARCH:.status.nodeInfo.architecture
kubectl get namespaces
```

1. **AMD64 Linux nodes.** The Postman-CS binaries require Linux AMD64. An
   ARM64 cluster needs an AMD64 node pool (or emulation, not recommended).
2. **A dedicated CI namespace** (example: `paypal-postman-ci`). Plain Run
   steps only — **no privileged pods are required**. (The old
   `pipeline-kubernetes.yaml` needed privileged Docker-in-Docker; it is
   retired — do not deploy it.)
3. **Outbound egress** from that namespace to: `github.com`,
   `raw.githubusercontent.com`, `api.getpostman.com`, `dl-cli.pstmn.io`,
   `*.gw.postman.com`, `app.harness.io`, `us-docker.pkg.dev`.
4. **A Postman service-account PMAK** for your Postman team, stored **only**
   as a Harness secret named `paypal_postman_service_account_pmak`. Personal
   PMAKs are rejected by service-token minting — this is deliberate.
5. **A sandbox Postman workspace** for first runs. Test operations are locked
   to an exact workspace name+ID pair and fail closed on any mismatch. The
   service account must have access to this workspace. With the provision
   stage (§5.1) this can be auto-created: pass `--workspace-name` plus the
   numeric owning sub-team id instead of a workspace id.
6. **Your Spring Boot service** deployed in a lower environment: listening on
   `0.0.0.0`, known port, `/actuator/health` exposed. For best mismatch
   detection also expose the route inventory:
   `management.endpoints.web.exposure.include=health,mappings`.

---

## 3. One-time Harness setup (~30 minutes)

### 3.1 Delegate in your cluster

```
helm repo add harness-delegate https://app.harness.io/storage/harness-download/delegate-helm-chart/
helm upgrade -i paypal-postman-delegate harness-delegate/harness-delegate-ng \
  --namespace harness-delegate-ng --create-namespace \
  --set delegateName=paypal-postman-delegate \
  --set accountId=<YOUR_HARNESS_ACCOUNT_ID> \
  --set delegateToken=<TOKEN_FROM_HARNESS_UI> \
  --set delegateDockerImage=us-docker.pkg.dev/gar-prod-setup/harness-public/harness/delegate:<VERSION> \
  --set resources.requests.memory=2048Mi
```

⚠️ **Pin a versioned delegate image.** Query
`GET /ng/api/delegate-setup/latest-supported-version` (or copy the version
from the Harness UI install snippet). The `latest` tag does not exist upstream
and the pod will `ErrImagePull`.

### 3.2 Connectors

| Connector | Type | Notes |
| --- | --- | --- |
| Kubernetes | `K8sCluster`, credential `InheritFromDelegate`, selector = your delegate | Referenced by every stage's `infrastructure` block. |
| Registry | DockerHub / your registry | **Required on every Run step under Kubernetes infrastructure** — Harness rejects the pipeline without it. ⚠️ Do **not** use the built-in `account.harnessImage` for the tools image: it is a mirror that rewrites image paths and the pull fails. |
| GitHub | Repo-type connector to your service repository | Used by `cloneCodebase`. |

### 3.3 Secret

Project-scope secret `paypal_postman_service_account_pmak` = the
service-account PMAK. Nothing else. No credential ever appears in YAML.

---

## 4. Build the approved tools image

Every Run step executes inside one image that pre-bakes Node 24 and the signed
Postman CLI. Runtime `curl | sh` installation is rejected by the gate — this
is a supply-chain control, not an inconvenience.

**Preferred: pull the published image.** The repository's
`publish-tools-image` workflow publishes
`ghcr.io/postman-cs/postman-tools:node24` on every Dockerfile change to
`main` — point `PAYPAL_TOOLS_IMAGE` at it (or mirror it into your internal
registry) and skip the local build entirely.

**Alternative: build it yourself** (air-gapped registries, custom base):

```
cd docker/postman-tools
docker build --platform linux/amd64 -t <your-registry>/postman-tools:node24 .
docker push <your-registry>/postman-tools:node24
```

The build records the Postman CLI artifact digest inside the image at
`/opt/postman-cli.tar.gz.sha256`. Rebuild deliberately (new CLI version), not
implicitly.

---

## 5. Generate and import the pipeline

```
corepack enable
pnpm install --frozen-lockfile
pnpm run check                 # 41 tests + supply-chain + template validation
pnpm harness:kubernetes        # emits harness/pipeline-kubernetes-native.yaml
```

The emitted pipeline is the proven day-one shape — three stages in order:
**provision** (service-account identity check first, then idempotent asset
provisioning with ids emitted as outputs) → **route-contract comparison** →
**CLI quality gate** (asset inputs wired to provision outputs, so no id is
ever typed by hand). The onboarding stage remains available as a drop-in but
is excluded from the default emit while its Spec Hub upload path is blocked
upstream (§9.1); the provision stage covers spec sync via the public API.

Import the emitted YAML into Harness, then replace every `PAYPAL_*`
placeholder in the UI:

| Placeholder | Value |
| --- | --- |
| `PAYPAL_ORG_ID` / `PAYPAL_PROJECT_ID` | Your Harness org and project |
| `PAYPAL_SCM_CONNECTOR` / `PAYPAL_SERVICE_REPOSITORY` | Your GitHub connector and repo |
| `PAYPAL_KUBERNETES_CONNECTOR` | The K8s connector from §3.2 |
| `PAYPAL_CI_NAMESPACE` | Your CI namespace |
| `PAYPAL_REGISTRY_CONNECTOR` | The registry connector from §3.2 |
| `PAYPAL_TOOLS_IMAGE` | `<your-registry>/postman-tools:node24` |

Two operational settings we learned the hard way — set them on every Run step:

- `imagePullPolicy: IfNotPresent` (or your registry policy).
- Step resources of at least `memory: 1536Mi` for the onboarding stage — the
  pinned bootstrap binary is ~136 MB and Harness's default step limits kill it
  with a misleading "insufficient resources" failure.

The emitted pipeline is a **generated projection** of the canonical stages.
Never hand-edit it; change the canonical stage (via PR) and regenerate.

### 5.1 Reduced-setup path: the idempotent provision stage (recommended)

`scripts/ensure-postman-assets.mjs` removes four manual setup steps — no
pre-created workspace, no manual spec upload, no hand-collected collection
IDs, no hand-built environment. Run it as the first pipeline stage; it:

1. Ensures the **workspace** (by exact name; creates under your sub-team when
   absent — or pass an explicit `--workspace-id`).
2. Ensures the **spec** (digest-verified from your pinned contract URL; uses
   the public Specs API, which also avoids the Spec Hub upload issue in §9.1).
3. Ensures the **contract collection** (generated from the live application's
   OpenAPI) and a **smoke collection** (health + inventory assertions).
4. Ensures the **environment** with `baseUrl` pointing at your service, and
   converges the value if it drifted.

Every asset is adopted by canonical name on reruns — never duplicated — and
the step emits `SPEC_ID`, `CONTRACT_UID`, `SMOKE_UID`, `ENVIRONMENT_UID` as
CI output variables that downstream stages consume via Harness expressions,
so **no asset ID is ever hardcoded in pipeline YAML**.

Proven live (2026-07-27): workspace wiped to zero assets, then three
consecutive pipeline runs — run 1 created spec + collections + environment,
runs 2 and 3 adopted them (`CREATED=none-adopted-all`), and the workspace
inventory after run 3 was byte-identical to run 2 (same four UIDs, counts
2/1/1, no duplicates). With this stage, §6's `smoke_collection_id`,
`contract_collection_id`, and `environment_id` inputs are wired to provision
outputs instead of being supplied by hand.

---

## 6. First run — contract testing (the agreed priority)

Run order per the current Linear priority: **contract testing first,
synchronization second.**

Supply these runtime inputs to the CLI quality-gate stage:

| Variable | Value |
| --- | --- |
| `workspace_id` / `workspace_name` | Your sandbox workspace's exact ID and exact name |
| `spec_url` / `spec_sha256` | Defaults pin PayPal's public Orders v2 contract at commit `9f0f528…`, digest `14db0b9e…` — keep for the demo, replace for your service |
| `smoke_collection_id` and/or `contract_collection_id` | Approved collection IDs that exist in that workspace |
| `environment_id` | Postman environment whose `baseUrl` points at your live service (cluster DNS, e.g. `http://<svc>.<ns>.svc.cluster.local:<port>/<context>`) |

A green run looks like: Clone codebase → Verify Postman service-account
identity → Prepare immutable PayPal Orders input → Execute with Postman CLI →
Summarize CLI artifacts — with JUnit under `.postman-cli-reports/` published
to Harness Tests, and the same runs visible in the Postman workspace run
history.

**Complete-results note:** the canonical gate passes `--bail failure` to
collection runs (stop at first failure). If your reporting requirement is
"complete results", remove `--bail` from the **contract** run so JUnit
captures every endpoint. Decision pending on your side — see §10.

### Verified fail-closed matrix (all tested live in Harness, 2026-07-27)

| Scenario | Behaviour |
| --- | --- |
| Wrong workspace name | Fails at the workspace-identity check, before any collection runs |
| Wrong spec SHA-256 | Fails at digest verification; the Postman CLI step is skipped entirely |
| No collection IDs | Refuses with an explicit error (exit 2) |
| Personal (non-service-account) PMAK | Token minting refuses |
| Re-run with identical inputs | Identical green result (idempotent) |

---

## 7. Mismatch detection — route-contract comparison

Add `harness/stages/route-contract-comparison.yaml` as its own stage. Inputs:

| Variable | Value |
| --- | --- |
| `app_base_url` | e.g. `http://<svc>.<ns>.svc.cluster.local:<port>/<context>` |
| `inventory_url` | `<app_base_url>/actuator/mappings` (preferred) or `<app_base_url>/v3/api-docs` |
| `spec_path` | Repo-relative path to the selected OAS |
| `subset_path` (optional) | Spec-subset selector — see below |
| `exceptions_path` (optional) | Approved-mismatch register — see below |
| `strip_prefix` (optional) | Context path to strip from app routes (e.g. `/petclinic`) |
| `policy` | `block` (default: mismatches fail the stage) or `warn` (report and pass) |

**Subset selector** (`subset.json`) — this is our strawman for your
application-to-spec-subset mapping; it composes for one-to-many and
many-to-many app/spec relationships (one comparison per app+subset pair):

```json
{ "include": [ { "pathPrefix": "/api" } ],
  "exclude": [ { "pathPrefix": "/api/internal" }, { "method": "DELETE", "path": "/api/pets/{id}" } ] }
```

**Exception register** (`exceptions.json`) — approved deviations; `block`
policy reports them as skipped instead of failing:

```json
[ { "kind": "rogue", "method": "GET", "path": "/api/pettypes",
    "reason": "approved read-only listing", "approvedBy": "paypal-testenv" } ]
```

Output: `route-contract.json` (machine-readable, counts + every mismatch) and
`route-contract.xml` (JUnit: one testcase per route — matched, missing-in-app
= failure, rogue = failure, excepted = skipped) published to Harness.

Both directions and both policies were proven live with deliberate faults: a
spec-only endpoint (detected missing-in-app), hidden spec paths (live routes
detected as rogue), one approved exception (honored), `warn` = green with full
report, `block` = stage failed and downstream steps skipped.

---

## 8. Synchronization — spec-to-Postman onboarding

Gated by `approve_postman_write=true` plus an explicit workspace strategy
(`existing` with workspace ID, or `create` with owning sub-team + canonical
repo URL). Idempotent: reruns refresh collections and update the spec rather
than duplicating. Run it **after** contract testing is green.

⚠️ Currently blocked — see §9 item 1 for status and interim path.

---

## 9. Known issues (upstream; tracked by Postman CS)

1. **Spec Hub upload rejects large-ish specs.** `postman-bootstrap` ≤ 2.10.5
   writes specs through an internal proxy that rejects even the 971 KB pinned
   Orders contract with "Total size exceeded the limit of 20 MB", while the
   public Specs API accepts identical content. Escalated to the Postman-CS
   action owners. Interim: pre-create the spec via the public Specs API and
   pass `spec_id`, or run contract testing only (it has no Spec Hub write).
2. **Workspace-scoped lint requires governance rulesets.**
   `postman spec lint --workspace-id` hard-errors on tenants without API
   Governance rulesets configured. Verify your tenant has them (Enterprise
   feature) before treating lint as a hard gate; unscoped lint (default
   Postman rules) is the fallback.
3. **Only these three stages are Kubernetes-portable.** The `postman-to-git-sync`
   and `runtime-route-discovery` stages contain GitHub `Action` steps that
   would require the privileged Drone plugin on Kubernetes — excluded by
   design. Route discovery's Insights backend also does not yet accept
   service-account identity end-to-end; the route-contract comparison in §7
   covers the rogue-endpoint requirement without it.
4. **Bootstrap path validation** rejects `./`-prefixed `--spec-path` values —
   use bare relative paths.

---

## 10. Decisions we need from PayPal

Current defaults are in parentheses; the pipeline runs today on these
assumptions and every one is swappable:

1. **"Full results" definition** — route mismatches both directions +
   behavioral collection results + lint findings as JSON + JUnit (current).
   Add schema-level diffs, negative cases, security checks, examples?
2. **Authoritative route inventory** — Actuator `mappings` when exposed,
   generated OpenAPI otherwise (current). Or gateway inventory / runtime
   traffic?
3. **App-to-spec-subset mapping format** — `subset.json` selectors (current
   strawman).
4. **Production-representative proof** — which service, repo, spec revision,
   lower environment, and named owner? (Orders v2 is the demo contract, not
   the confirmed production service.)
5. **Mismatch policy** — block with approved-exception register (current),
   warn-only, or per-severity?
6. **Output destinations** — JUnit to Harness + JSON artifact + Postman Cloud
   run history (current). Additional test-management system?
7. **Bail vs complete results** — canonical gate bails on first failure;
   complete-results mode is a one-flag change (see §6).
8. **Auth, test-data safety, cleanup, retries, evidence retention, and
   Kubernetes network constraints** for your lower environment.
9. **One service or two** for the proof — older notes said two examples;
   current Linear converges on one.

---

## 11. Security posture summary

- The PMAK lives only in Harness Secrets; stages receive it via
  `<+secrets.getValue(...)>` and never echo it.
- Service-account identity is verified (checksum-pinned resolver binary)
  before anything else runs; personal keys fail closed.
- Every downloaded binary is SHA-256-verified against `postman-cs.lock.json`;
  every action reference is commit-pinned; floating tags fail validation.
- Contract testing and mismatch detection are read-only against Postman;
  onboarding writes require an explicit human-approved flag; nothing ever
  pushes to your Git repositories.
- No privileged containers anywhere in the supported path.
