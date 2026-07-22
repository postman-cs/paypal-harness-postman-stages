# PayPal drop-in Postman stages

Each YAML file has one top-level `stage:` object and maps to one PayPal ask.
Paste the object under an existing Harness pipeline's `stages:` list. PayPal
keeps its trigger, codebase, connectors, runner policy, deployment stages, and
approval policy.

| Customer ask | Drop-in stage | Direct Postman-CS dependency | Effect |
| --- | --- | --- | --- |
| Sync a checked-in OAS contract into Postman | `spec-to-postman-onboarding.yaml` | `postman-bootstrap-action` (regular onboarding core) | Human-approved existing-workspace upsert or new-workspace bootstrap; no Git write |
| Make Postman tests a Harness quality gate | `postman-cli-quality-gate.yaml` | `postman-resolve-service-token-action` + Postman CLI | Exact service-account and workspace identity checks, spec lint, collection run, JUnit; read-only |
| Bring governed Postman assets back to the repo | `postman-to-git-sync.yaml` | `postman-repo-sync-action` | Local commit only; never pushes |
| Discover implemented runtime routes for later rogue-endpoint comparison | `runtime-route-discovery.yaml` | `postman-insights-onboarding-action` | Backend-blocked before writes until Insights accepts service-account identity end to end |

## First pipeline for Jason

Tonight's first GitHub → Harness → Postman proof is:

1. `spec-to-postman-onboarding.yaml`
2. `postman-cli-quality-gate.yaml`

The onboarding stage downloads and digest-verifies PayPal's public Orders v2
contract, downloads and checksum-verifies the exact regular-onboarding CLI from
the `postman-cs/postman-bootstrap-action` v2.10.5 release, reuses the supplied
Winter Trinity workspace in `existing` mode, updates the spec and generated
collections, and makes no Git write. In `create` mode the same Postman-CS core
creates/reconciles a workspace under an explicit Postman sub-team. The next
independent stage verifies that the PMAK is a service-account credential, then
uses the pre-provisioned Postman CLI to prove
the exact Winter Trinity workspace, lint the same Orders contract, execute only
approved smoke/contract collection IDs, and publish JUnit.

The first run is a controlled Postman sandbox write because onboarding must
create or refresh Postman assets. It requires `approve_postman_write=true` and
an explicit workspace strategy. The CLI quality gate is read-only.

## Required Harness values

- Secret `paypal_postman_service_account_pmak`, generated for the Postman
  service account. A personal-user PMAK is rejected by token minting.
- Exact Winter Trinity workspace ID for `existing` mode, or the owning sub-team
  ID and canonical service-repo URL for `create` mode.
- At least one approved smoke or contract collection ID for the CLI stage.
- A runner image with the signed Postman CLI already installed. Runtime
  `curl | sh` installation is intentionally prohibited.

The onboarding Run step exports its CLI results as Harness output variables. To
avoid manually copying generated collection IDs, set the CLI stage's
`onboarding_collections_json` to:

```text
<+pipeline.stages.postman_spec_to_postman_onboarding.spec.execution.steps.run_regular_postman_cs_onboarding.output.outputVariables.collections_json>
```

Explicit `smoke_collection_id` or `contract_collection_id` values override the
corresponding JSON values, so a reviewed fixed-ID rollout remains possible.

## Supply-chain contract

All lifecycle actions call `postman-cs/<repo>` directly. GitHub Actions use
full commit SHAs; the Harness onboarding stage uses the regular onboarding
bootstrap CLI from exact release `v2.10.5` because Harness cannot execute its
`node24` Action runtime. The binary's SHA-256 and resolved commit are recorded in
`postman-cs.lock.json`; validation fails on floating, unlocked, or mismatched
top-level references. No PayPal stage references the personal wrapper.

The broader regular onboarding composite contains version-tagged transitive
`postman-cs` references. This Harness path invokes the self-contained bootstrap
CLI directly, removing that nested-composite dependency. An exact binary digest
prevents a moved tag from silently changing the executed artifact.

## Human gates and idempotency

- Onboarding requires explicit write approval and either an existing workspace
  ID or deterministic create-mode ownership/reconciliation inputs;
  `refresh`/`update` modes and emitted IDs prevent duplicate assets.
- CLI quality is read-only and fails if the workspace name/ID is not exact.
- Git sync requires explicit approval, uses `commit-only`, and cannot push.
- Runtime discovery requires explicit approval and never creates a durable API
  key on an ordinary run. It currently fails before writes because the final
  Insights acknowledgement does not accept a service-account identity.

Runtime discovery is necessary for Deirdre's rogue-endpoint requirement, but it
is not the comparison itself. Comparing implementation inventory one-to-one
against the OAS contract remains a visible discovery/implementation gate.
See `docs/CUSTOMER-TECHNICAL-CONSIDERATIONS.md` for the customer readiness
checklist and the exact Insights boundary.
