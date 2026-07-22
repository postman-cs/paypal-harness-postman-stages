# PayPal Harness + Postman pipeline stages

This repository packages Postman capabilities as independent Harness stages
that PayPal can insert into existing pipelines. The customer-facing path is the
four-file catalog in [`harness/stages`](harness/stages/README.md); it calls
reviewed `postman-cs` repositories directly and uses Postman CLI as the test
execution plane.

For production, PayPal links the generated Harness stage templates from
`postman-cs/paypal-harness-postman-stages` rather than copying them or using a
personal wrapper. Start with the [Jason handoff](docs/JASON-QUICKSTART.md).

## One stage per PayPal ask

| Outcome | File |
| --- | --- |
| GitHub OAS contract → Postman workspace/spec/collections | `harness/stages/spec-to-postman-onboarding.yaml` |
| Postman CLI lint + collection quality gate + JUnit | `harness/stages/postman-cli-quality-gate.yaml` |
| Postman assets → reviewable local Git commit | `harness/stages/postman-to-git-sync.yaml` |
| Runtime service discovery/linkage for rogue-route analysis | `harness/stages/runtime-route-discovery.yaml` |

The first pipeline for Jason tonight is **spec-to-Postman onboarding followed
by the Postman CLI quality gate**. It uses the immutable public PayPal Orders v2
contract, an explicit existing-or-create workspace strategy, the
checksum-verified `postman-cs/postman-bootstrap-action` release binary (the
regular onboarding core), and approved collection IDs. The Winter Trinity
rehearsal uses `workspace_mode=existing`; production can use `create` to
bootstrap and reconcile a new workspace. It does not use the TDD preview action.

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

The Mac command discards the minted short-lived token. Harness continues to use
the checksum-pinned Linux release binary.

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

`harness/pipeline-cloud-vm.yaml`, `harness/pipeline-kubernetes.yaml`, and
`harness/pipeline-studio-sandbox.yaml` remain as additive reference pipelines.
They use the private wrapper at immutable revision
`e6b290c034aa1cc8a144578041fbd652b1f4f09f`; they are not the customer handoff
path.

The last green wrapper repeatability proof is GitHub Actions run
[`29946049355`](https://github.com/danielshively-source/paypal-harness-pipeline/actions/runs/29946049355).
It proves the repository contract and deterministic read-only behavior, not a
credentialed PayPal Postman round trip.

See the [drop-in guide](docs/PAYPAL-DROP-IN.md), [requirements](docs/PAYPAL-REQUIREMENTS.md),
[idempotency contract](docs/IDEMPOTENCY.md), [build log](docs/BUILD-LOG.md), and
[working-session plan](docs/WORKING-SESSION.md). The
[Jason simulation](docs/JASON-SIMULATION-2026-07-22.md) records the real
GitHub→Harness→Postman attempt, and the
[technical-team checklist](docs/CUSTOMER-TECHNICAL-CONSIDERATIONS.md) covers
production decisions and known backend constraints.
