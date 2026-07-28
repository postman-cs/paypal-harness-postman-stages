# PayPal Harness + Postman pipeline stages

This repository packages Postman capabilities as independent Harness CI stages
that PayPal inserts into existing pipelines, plus a generated Kubernetes-native
pipeline that chains the first-delivery shape end to end. Stages call reviewed
`postman-cs` repositories directly and use the Postman CLI as the test
execution plane.

**Start here: [PayPal service-owner instructions](docs/PAYPAL-SERVICE-OWNER-INSTRUCTIONS.md)**
— the complete setup-and-run runbook for the first pipeline (provision →
route-contract comparison → CLI quality gate on `KubernetesDirect`, no
privileged runners). Generate it with:

```
pnpm install --frozen-lockfile && pnpm run check
pnpm harness:kubernetes        # emits harness/pipeline-kubernetes-native.yaml
```

Verified end-to-end 2026-07-27 on a live AMD64 Kubernetes cluster: green from
an empty Postman tenant in ~4 minutes, idempotent reruns, fail-closed negative
paths, and bidirectional rogue-endpoint detection
([war-games ledger](docs/WAR-GAMES-2026-07-27.md)).

## One stage per PayPal ask

| Outcome | File |
| --- | --- |
| Idempotent workspace/spec/collections/environment provisioning with ids as outputs (identity check first) | `harness/stages/postman-asset-provision.yaml` |
| Bidirectional app-route-versus-OAS comparison with rogue-endpoint detection | `harness/stages/route-contract-comparison.yaml` |
| Postman CLI lint + collection quality gate + JUnit | `harness/stages/postman-cli-quality-gate.yaml` |
| GitHub OAS contract → Postman via the regular onboarding core | `harness/stages/spec-to-postman-onboarding.yaml` |
| Postman assets → reviewable local Git commit | `harness/stages/postman-to-git-sync.yaml` |
| Runtime service discovery/linkage for rogue-route analysis | `harness/stages/runtime-route-discovery.yaml` |

The first pipeline for PayPal's technical team is the generated three-stage
chain: **provision → route-contract comparison → CLI quality gate**, using the
immutable public PayPal Orders v2 contract as the demo input. The onboarding
stage (bootstrap core) rejoins the default emit once its verified upstream fix
is released — see the known-issues section of the service-owner instructions.
The git-sync and route-discovery stages remain GitHub-Actions-based drop-ins
and are not part of the Kubernetes default.

## Product stance

- PayPal's Harness pipeline remains authoritative for triggers, checkout,
  approvals, promotion, and deployment.
- The self-contained bootstrap CLI from the regular Postman API onboarding
  suite owns workspace/spec/collection lifecycle. Harness downloads the exact
  Postman-CS release asset and verifies SHA-256 before execution; this avoids
  Harness's unsupported `node24` Action adapter.
- Postman CLI owns lint and collection execution. The runner must provision a
  reviewed CLI binary; runtime `curl | sh` installation is prohibited.
- Postman-to-Git sync stops at `commit-only`; a PayPal human decides whether to
  push or merge.
- Insights linkage supplies runtime route evidence, but a full
  implemented-route-versus-spec comparison is still an explicit implementation
  gap rather than a claimed feature.

## Direct Postman-CS dependency policy

Every customer lifecycle stage calls `postman-cs/<repository>` directly. GitHub
Actions use full commit SHAs. Harness onboarding downloads the exact `v2.10.5`
Postman-CS release binary and verifies its published SHA-256; its tag and commit
are also recorded in `postman-cs.lock.json`. Validation rejects floating tags,
mutable branches, unlocked references, and unverified binaries. No stage
depends on the private personal wrapper.

The guarded installer also verifies that PayPal's Harness Git connector points
to `postman-cs/paypal-harness-postman-stages`, that both linked remote templates
resolve from their approved paths on `main`, and that the linked version is
`v0.2.0`. It refuses forks and inline production copies. The v0.1.0 template
files remain published so an existing installation is not silently rewritten.

The broader regular onboarding composite includes version-tagged transitive
Postman-CS references, but this Harness stage bypasses that composite and calls
its self-contained bootstrap CLI directly. The release binary is protected by
an exact SHA-256 in addition to the lock-mapped tag and commit.

## Required Harness inputs

- Secret `paypal_postman_service_account_pmak` containing a PMAK generated for
  the Postman service account. A personal-user PMAK cannot mint the short-lived
  service token required for asset operations.
- A fresh service token must be minted inside every Harness job that performs
  Postman work. The operator does not mint or copy this token manually: regular
  onboarding mints it inside the pinned bootstrap runtime, and the CLI gate
  uses the checksum-pinned Postman-CS resolver before doing any work. The token
  is job-scoped and must never be stored as a Harness secret or output.
- Either an exact existing workspace ID, or `workspace_mode=create` plus the
  owning Postman sub-team ID and canonical PayPal service-repo URL.
- At least one approved smoke or contract collection ID.
- A Linux AMD64 runner with Node 24 support and the signed Postman CLI.

No credential is stored in this repository.

## Validate locally

```sh
pnpm run check
```

On macOS, validate a candidate service-account PMAK through the pinned
Postman-CS npm CLI (Node 24 or newer required):

```sh
read -s "POSTMAN_API_KEY?Service-account PMAK: "
echo
export POSTMAN_API_KEY
pnpm postman:service-account:preflight:mac
unset POSTMAN_API_KEY
```

The Mac command discards the minted short-lived token and proves only that the
PMAK is eligible. Harness still needs the Linux runtime path because that is
where the real job mints and consumes a fresh token. The default Harness
templates use the checksum-pinned Linux AMD64 resolver and bootstrap binaries.

To install the two linked stages into an existing pipeline, run the installer
in dry-run mode first. It requires an explicit downstream stage anchor, creates
a rollback backup on apply, verifies Harness read-back, and is idempotent:

```sh
HARNESS_API_KEY='...' pnpm harness:install -- \
  --account ACCOUNT --org ORG --project PROJECT --pipeline PIPELINE \
  --connector POSTMAN_CS_GITHUB --before-stage PROMOTION_GATE --dry-run
```

The suite checks stage shape, secret leakage, direct repository pins, write
policies, CLI behavior, JUnit wiring, deterministic evidence, and the legacy
wrapper contract.

## Existing full-pipeline references

The generated `harness/pipeline-kubernetes-native.yaml` is the only pipeline
artifact; earlier wrapper-based reference pipelines have been removed in favor
of the drop-in stages plus this generated chain.

See the [drop-in guide](docs/PAYPAL-DROP-IN.md), [requirements](docs/PAYPAL-REQUIREMENTS.md),
[idempotency contract](docs/IDEMPOTENCY.md), [build log](docs/BUILD-LOG.md), and
[working-session plan](docs/WORKING-SESSION.md). The
[PayPal simulation](docs/PAYPAL-SIMULATION-2026-07-22.md) records the real
GitHub→Harness→Postman attempt, and the
[technical-team checklist](docs/CUSTOMER-TECHNICAL-CONSIDERATIONS.md) covers
production decisions and known backend constraints.
