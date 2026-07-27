# PayPal Kubernetes Quickstart — Harness stages on your own cluster

Proven end-to-end on 2026-07-27 against a live AMD64 k3s cluster: GitHub →
Harness (KubernetesDirect) → Postman, with the CLI quality gate executing a
complete-results contract run against a live Spring Boot service and JUnit
published back to Harness.

## What you need (one-time, ~30 minutes)

| # | Item | Notes |
| --- | --- | --- |
| 1 | AMD64 Linux nodes | `kubectl get nodes -o custom-columns=NAME:.metadata.name,ARCH:.status.nodeInfo.architecture` must say `amd64`. ARM64 (Apple-Silicon-style) clusters need AMD64 node pools. |
| 2 | Harness delegate in the cluster | Helm chart `harness-delegate/harness-delegate-ng`. **Pin a versioned image** (`GET /ng/api/delegate-setup/latest-supported-version`); the `latest` tag does not exist upstream. Give it ≥2 GiB memory. |
| 3 | Kubernetes connector | `InheritFromDelegate` + your delegate selector. |
| 4 | Dedicated CI namespace | e.g. `paypal-postman-ci`. Plain Run steps only — **no privileged pods required** (unlike the legacy `pipeline-kubernetes.yaml`, which is retired). |
| 5 | Registry connector | **Required**: every Run step on Kubernetes infrastructure must carry a registry `connectorRef`; Harness rejects the pipeline otherwise. Do **not** use the built-in `account.harnessImage` for your tools image — it is a mirror that rewrites image paths to `us-docker.pkg.dev/...` and the pull fails. Create a plain DockerHub/registry connector (anonymous works for public images). |
| 6 | Tools image | Build `docker/postman-tools/Dockerfile` (Node 24 + signed Postman CLI pre-baked) and push to a registry your cluster can reach. Runtime `curl \| sh` CLI installs are rejected by the gate — this is deliberate. |
| 7 | Secret `paypal_postman_service_account_pmak` | Project-scope Harness secret holding the **service-account** PMAK. Personal-user PMAKs are rejected by token minting. |
| 8 | GitHub connector | Repo-type connector to your service repository for `cloneCodebase`. |
| 9 | Outbound egress | `github.com`, `raw.githubusercontent.com`, `api.getpostman.com`, `dl-cli.pstmn.io`, `*.gw.postman.com`, plus Harness endpoints (`app.harness.io`, `us-docker.pkg.dev`). |
| 10 | Your Spring Boot service | Listening on `0.0.0.0`, known port, health endpoint (`/actuator/health`). Deploy it in-cluster; the contract collections run against it over cluster DNS. |

## Generate the pipeline

```
pnpm install --frozen-lockfile
pnpm harness:kubernetes        # emits harness/pipeline-kubernetes-native.yaml
```

Import the emitted YAML into Harness and replace the `PAYPAL_*` placeholders
(org, project, SCM/K8s/registry connectors, namespace, tools image). The
pipeline is a deterministic projection of the two canonical stages — never
hand-edit the emitted file.

## Route-contract module (rogue-endpoint detection)

`harness/stages/route-contract-comparison.yaml` + `scripts/compare-routes.mjs`
implement the bidirectional spec-versus-application check: every endpoint in
the selected spec must exist in the app; every endpoint the app exposes must
appear in the spec (rogue detection). Verified on Kubernetes 2026-07-27 with a
deliberately injected rogue endpoint and a deliberately unimplemented spec
endpoint — both detected, one exception honored, JSON + JUnit published, and
both policy modes proven (warn = report and pass; block = fail the stage).

Documented assumptions awaiting PayPal confirmation:
- **Inventory source**: Actuator `/actuator/mappings` when exposed (enable via
  `management.endpoints.web.exposure.include=mappings` on the wrapper);
  generated OpenAPI (`/v3/api-docs`) otherwise; plain `[{method,path}]` records
  also accepted (gateway inventories normalize to this).
- **Subset mapping format**: `subset.json` with `include`/`exclude` selectors
  (`path`, `pathPrefix`, optional `method`). One-to-many and many-to-many
  app/spec relations compose from multiple subset files, one comparison per pair.
- **Mismatch policy**: `block` by default with an approved-exception register
  (`exceptions.json`: kind + method + path + reason + approvedBy); `warn` mode
  reports everything and passes.
- **"Full results" today**: route mismatches (both directions), behavioral
  collection results, spec lint findings — JSON + JUnit. Schema-level diffing,
  negative cases, and security checks are open PayPal decisions.

## Postman is the executor everywhere

- Spec upload/versioning: Postman Spec Hub (bootstrap CLI, checksum-pinned).
- Contract + smoke execution: `postman collection run` (JUnit to Harness).
- Spec quality: `postman spec lint` with workspace governance.
- Identity: service-account PMAK verified by `postman-resolve-service-token`
  before anything else runs; the gate fails closed on personal keys.
- Every run also uploads to Postman Cloud — results are visible in the
  target workspace's run history, not just in Harness.

## Verified fail-closed behaviour (beat-up results, 2026-07-27)

| Scenario | Result |
| --- | --- |
| Wrong workspace name | Identity check fails before any collection runs |
| Wrong spec SHA-256 | Digest check fails before lint/run |
| No collection IDs | Gate refuses with explicit error |
| Missing/personal PMAK | Token minting refuses service-token issue |

## Known issues to plan around

1. **Spec Hub 20 MB limit (upstream bug, postman-cs escalation open):**
   `postman-bootstrap` ≤2.10.5 writes specs through the Bifrost ws-proxy, which
   rejects the pinned 971 KB PayPal Orders contract with "Total size exceeded
   the limit of 20 MB", while the public Specs API accepts identical content.
   Until fixed, pre-create the spec via the public Specs API and run the
   onboarding stage with `spec_id` set, or run contract testing first (it has
   no Spec Hub write dependency).
2. **`postman spec lint --workspace-id` requires workspace governance
   rulesets** on the tenant; without them the lint step errors. Verify on your
   tenant before wiring lint as a hard gate.
3. **Complete results vs `--bail`:** the canonical gate passes `--bail failure`
   to collection runs. For complete-results contract reporting, drop `--bail`
   on the contract run so JUnit captures every endpoint.
4. **Only the onboarding and CLI-gate stages are Kubernetes-portable.** The
   git-sync and route-discovery stages contain GitHub `Action` steps, which on
   Kubernetes require the privileged Drone plugin — excluded by design.
