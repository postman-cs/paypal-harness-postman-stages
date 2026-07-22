# PayPal drop-in Postman stages

Each YAML file has one top-level `stage:` object and maps to one PayPal ask.
Paste the object under an existing Harness pipeline's `stages:` list. PayPal
keeps its trigger, codebase, connectors, runner policy, deployment stages, and
approval policy.

| Customer ask | Drop-in stage | Direct Postman-CS dependency | Effect |
| --- | --- | --- | --- |
| Sync a checked-in OAS contract into Postman | `spec-to-postman-onboarding.yaml` | `postman-bootstrap-action` (regular onboarding core) | Human-approved stable-ID upsert in an existing workspace; no Git write |
| Make Postman tests a Harness quality gate | `postman-cli-quality-gate.yaml` | Postman CLI, against assets created by regular onboarding | Exact Winter Trinity identity check, spec lint, collection run, JUnit; read-only |
| Bring governed Postman assets back to the repo | `postman-to-git-sync.yaml` | `postman-repo-sync-action` | Local commit only; never pushes |
| Discover implemented runtime routes for later rogue-endpoint comparison | `runtime-route-discovery.yaml` | `postman-insights-onboarding-action` | Human-approved link to an already discovered service |

## First pipeline for Jason

Tonight's first GitHub → Harness → Postman proof is:

1. `spec-to-postman-onboarding.yaml`
2. `postman-cli-quality-gate.yaml`

The onboarding stage downloads and digest-verifies PayPal's public Orders v2
contract, calls the regular onboarding core in
`postman-cs/postman-bootstrap-action` at an exact lock-mapped tag, reuses the
supplied Winter Trinity workspace, updates the spec and
generated collections, disables Insights, skips built-in tests, and makes no Git
write. The next independent stage uses the pre-provisioned Postman CLI to prove
the exact Winter Trinity workspace, lint the same Orders contract, execute only
approved smoke/contract collection IDs, and publish JUnit.

The first run is a controlled Postman sandbox write because onboarding must
create or refresh Postman assets. It requires `approve_postman_write=true` and
an existing workspace ID. The CLI quality gate is read-only.

## Required Harness values

- Secret `paypal_postman_api_key`, scoped to the Postman service account that
  can access Winter Trinity.
- Exact Winter Trinity workspace ID.
- At least one approved smoke or contract collection ID for the CLI stage.
- A runner image with the signed Postman CLI already installed. Runtime
  `curl | sh` installation is intentionally prohibited.

Harness exposes GitHub Action outputs to later stages. To avoid manually
copying generated collection IDs, set the CLI stage's
`onboarding_collections_json` to:

```text
<+pipeline.stages.postman_spec_to_postman_onboarding.spec.execution.steps.run_regular_postman_cs_onboarding.output.outputVariables."collections-json">
```

Explicit `smoke_collection_id` or `contract_collection_id` values override the
corresponding JSON values, so a reviewed fixed-ID rollout remains possible.

## Supply-chain contract

All lifecycle actions call `postman-cs/<repo>` directly. GitHub Actions use
full commit SHAs; the Harness onboarding stage uses the regular onboarding
bootstrap core at exact release tag `v2.10.5` because Harness resolves Actions
by Git tag and cannot reliably preload the parent composite's nested actions.
Its resolved commit is recorded in
`postman-cs.lock.json`; validation fails on floating, unlocked, or mismatched
top-level references. No PayPal stage references the personal wrapper.

The broader regular onboarding composite contains version-tagged transitive
`postman-cs` references. This Harness path invokes the Node-based bootstrap core
directly, removing that nested-composite dependency. Its exact tag is
lock-mapped, though Git tags can still be moved.

## Human gates and idempotency

- Onboarding requires an existing workspace ID and explicit write approval;
  `refresh`/`update` modes and supplied IDs prevent duplicate assets.
- CLI quality is read-only and fails if the workspace name/ID is not exact.
- Git sync requires explicit approval, uses `commit-only`, and cannot push.
- Runtime discovery requires explicit approval and never creates a durable API
  key on an ordinary run.

Runtime discovery is necessary for Deirdre's rogue-endpoint requirement, but it
is not the comparison itself. Comparing implementation inventory one-to-one
against the OAS contract remains a visible discovery/implementation gate.
