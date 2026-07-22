# PayPal technical-team considerations

Use this checklist before installing the Postman stages into a real PayPal
pipeline. The goal is to make the drop-ins predictable for platform engineers,
service owners, security reviewers, and Postman administrators—not merely make
the demo pass.

## Identity and access

- Create a dedicated Postman service account for CI. Store its PMAK in Harness
  as `paypal_postman_service_account_pmak` and grant it only the target team,
  workspace, Spec Hub, collection, and governance permissions it needs.
- A PMAK is not automatically a service-account credential. A personal user
  can create a personal PMAK, but `POST /service-account-tokens` rejects it.
  The PMAK must be generated while operating as the dedicated service account.
- Mint a short-lived access token inside each job from the long-lived
  service-account PMAK. Do not persist that token, browser cookies, or a human
  user's access token in Harness.
- Confirm the Postman data-residency region (`us` or `eu`) and use it for both
  minting and asset operations. A token minted against one region is not valid
  against the other.
- Define credential rotation, owner, expiry alert, break-glass procedure, and
  the behavior when the service account is disabled or removed from a team.
- Keep Harness secret resolution, output-variable masking, shell tracing, log
  retention, and delegate access in the threat model. Tokens must never become
  ordinary Harness output variables.

## Workspace strategy

The onboarding stage supports two explicit modes:

- `workspace_mode=existing`: provide the immutable workspace ID. This is the
  Winter Trinity rehearsal mode and prevents a proof run from creating a new
  workspace.
- `workspace_mode=create`: leave the workspace ID empty, provide the owning
  Postman `workspace_team_id`, and provide the canonical PayPal service-repo
  URL. The Postman-CS bootstrap creates or reconciles the workspace, then emits
  the stable workspace/spec/collection IDs for downstream stages.

For create mode, agree on naming, sub-team ownership, visibility, governance
group, admin IDs, requester/audit identity, retention, and who can delete the
workspace. The workspace name is derived from `project_name` (or `[domain]
project_name` when a domain code is later added).

Do not treat a matching display name as identity. Reuse must be anchored by the
workspace ID, committed `.postman/resources.yaml`, or the canonical service-repo
link. Feed the onboarding output IDs directly to the CLI stage and record them
in the build receipt.

## Source contract and repository topology

- Pin every remote spec by URL/ref plus SHA-256. The v0.2.0 stage accepts a
  customer spec while retaining the public PayPal Orders contract as its
  reviewed default.
- Decide whether the source is GitHub.com, GitHub Enterprise, a monorepo path,
  or a generated artifact. Confirm the Harness delegate can reach it without
  opening unintended network paths.
- For multi-file OpenAPI, `$ref` resolution, overlays, generated specs, and
  protobuf/GraphQL inputs, choose the exact bundle boundary and checksum rule.
- The Harness Git connector for the reusable templates must point exactly to
  `postman-cs/paypal-harness-postman-stages`. The checked-out codebase for a
  customer run must still be the PayPal service repository, not the template
  repository.
- Keep Postman-to-Git at `commit-only`. PayPal's existing review and promotion
  controls decide whether a generated diff is pushed or merged.

## Harness runtime

- Validate Linux AMD64 availability, container image policy, filesystem write
  permissions, corporate proxy behavior, certificate trust, DNS, and outbound
  access to GitHub and the correct Postman regional hosts.
- Mirror the checksum-pinned Postman-CS binaries internally if direct GitHub
  release downloads are disallowed. Preserve the upstream digest and provenance
  in that mirror.
- Confirm cache behavior and cold-start impact: the resolver and bootstrap
  binaries are self-contained and intentionally avoid an npm/Node dependency,
  but they are large release artifacts.
- Local macOS validation uses the pinned Node 24 npm CLI because Postman-CS
  currently publishes the self-contained resolver only for Linux AMD64. This
  does not change the production Harness dependency or identity flow.
- Harness's generic GitHub Action adapter did not support the current Node 24
  actions in the sandbox. The onboarding and identity checks therefore use
  checksum-verified Postman-CS release binaries in ordinary Run steps.
- Decide report/artifact storage, JUnit retention, execution URL retention,
  timeout/retry policy, concurrency, and whether parallel service builds may
  target the same Postman assets.

## Pipeline behavior and idempotency

- Place immutable-source verification and service-account validation before
  every write. Keep explicit human gates before Postman writes, local Git
  commits, and downstream promotion.
- Serialize or otherwise protect concurrent writes to the same workspace/spec.
  A successful single rerun is not enough to prove concurrent idempotency.
- Run onboarding twice with identical inputs and compare workspace, spec,
  baseline, smoke, and contract collection IDs. Confirm no duplicate workspace,
  spec, collection, environment, monitor, or API Catalog entry appears.
- Define update semantics for breaking spec changes, deleted operations,
  collection regeneration, local test customizations, and a failed run after
  only some resources were updated.
- Preserve the original Harness pipeline YAML and provide a tested rollback.
  Rolling back the pipeline definition does not automatically roll back Postman
  asset mutations, so retain asset IDs and operation receipts.

## Quality-gate contract

- Decide which generated collection is the smoke gate and which is the contract
  gate, which environment is allowed, and which failures block promotion.
- Provision and pin Postman CLI, then capture its version, lint JSON, JUnit,
  collection IDs, environment ID, and spec digest without logging variables or
  secrets.
- Define timeouts, retries, rate-limit handling, flaky-test quarantine, data
  cleanup, synthetic test accounts, and behavior when an upstream sandbox is
  unavailable.
- Confirm that tests are safe to rerun and do not create duplicate payments,
  orders, webhooks, or other externally visible side effects.

## Network, security, and compliance

- Allow only the selected Postman regional API endpoints, GitHub source/release
  endpoints or approved mirrors, and PayPal test endpoints required by the
  collections.
- Verify TLS interception and proxy settings (`NODE_USE_ENV_PROXY=1` where
  required), secret redaction, least-privilege GitHub tokens, SBOM/provenance,
  vulnerability scanning, and binary checksum enforcement.
- Classify specs, examples, test data, CLI reports, and generated collections.
  Remove credentials and regulated data before syncing assets or retaining
  artifacts.
- Establish rate-limit budgets and backoff for large fan-out onboarding across
  many services.

## Ownership and operations

- Name the PayPal platform owner, individual service owner, Postman admin,
  Harness admin, security approver, and escalation route.
- Document the supported stage version, upgrade cadence, deprecation policy,
  change window, and who approves a new Postman-CS digest or template release.
- Add alerts for credential mint failure, source digest mismatch, partial asset
  mutation, duplicate identity, CLI test failure, and downstream promotion
  blocked by Postman.

## Known Insights boundary

The current `postman-insights-onboarding-action` can perform API Catalog
discovery and Git linking with a service-account token, but its final Akita
acknowledgement/application-binding endpoints still require a Postman user
identity. That conflicts with PayPal's service-account-only requirement and can
produce a partial-link risk. The checked-in runtime stage now fails before any
write and must remain disabled until the upstream action exposes an atomic
service-account-only mode or the backend accepts service-account identities end
to end. Do not solve this by storing a human user's token in CI.
