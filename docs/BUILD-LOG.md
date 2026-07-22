# Build log and evidence contract

Each drop-in stage emits concise, non-secret `POSTMAN_HARNESS` records. The
records identify the stage, immutable direct dependency, write policy, and
idempotency model without logging credentials, headers, request bodies, cookies,
or environment values.

## Stage events

```text
POSTMAN_HARNESS event=stage_complete stage=spec-to-postman-onboarding writePolicy=approved-postman-upsert+git-none
POSTMAN_HARNESS dependency=postman-cs/postman-bootstrap-action ref=v2.10.5 commit=848edbabcbfd311168e05b2976b907736f020ba5
POSTMAN_HARNESS event=stage_complete stage=postman-cli-quality-gate writePolicy=none
POSTMAN_HARNESS executor=postman-cli sourceStage=postman-cs/postman-bootstrap-action
POSTMAN_HARNESS event=stage_complete stage=postman-to-git-sync writePolicy=commit-only
POSTMAN_HARNESS event=stage_complete stage=runtime-route-discovery writePolicy=approved-link-only
```

Onboarding also records the immutable PayPal Orders source repository, commit,
artifact, and SHA-256. The CLI stage records the reviewed CLI version in Harness
logs, fails closed unless the exact Winter Trinity workspace ID is visible, and
lists report artifacts without printing Postman responses or secret values.

## JUnit

`postman-cli-quality-gate.yaml` writes:

- `.postman-cli-reports/smoke.xml` when a smoke collection ID is supplied;
- `.postman-cli-reports/contract.xml` when a contract collection ID is supplied;
- `.postman-cli-reports/spec-lint.json` for governance evidence; and
- `.postman-cli-reports/workspaces.json` only in the ephemeral runner workspace
  for exact identity validation.

The Harness Run step declares `.postman-cli-reports/*.xml` as JUnit report paths,
so test results appear in the execution's Tests view. PayPal must select an
approved artifact store and retention period before production; this repository
does not silently create one.

## Failure behavior

- Source commit/digest mismatch stops onboarding before a Postman write.
- Missing approval or workspace ID stops onboarding before the action.
- Missing CLI, ambiguous/mismatched workspace, lint error, or collection failure
  fails the CLI stage and blocks downstream promotion.
- Git sync cannot push; its log shows the local commit/diff for human review.
- Runtime discovery fails when the exact service is not found and never opts in
  to durable API-key creation.

## Existing deterministic wrapper evidence

The legacy wrapper still produces fingerprinted JSON and Markdown evidence in
`.postman-cli-reports`. GitHub Actions run `29946049355` proves that mechanism.
It remains useful implementation evidence, but the PayPal-facing stages no
longer require that private wrapper repository.

## Harness definition evidence — 2026-07-22

The composed Jason proof was created once and then updated with the identical
two-stage YAML. Both Harness writes returned HTTP 200 with no YAML errors.
Readback confirmed the regular onboarding SHA, CLI gate, absence of TDD, and
absence of the personal wrapper. The definition identifier is
`PayPal_Jason_Orders_DropIn_Proof`. Execution sequence 4 reached the regular
Postman-CS onboarding core, installed and authenticated Postman CLI 1.44.0,
selected exact Winter Trinity, and then failed closed before an asset write
because the available personal PMAK could not mint a service-account token.
The workspace remained unchanged. See
`docs/JASON-SIMULATION-2026-07-22.md`.

## Production handoff hardening — 2026-07-22

- Added generated Harness remote stage templates at version `v0.1.0`; their
  canonical source is the reviewed customer stage catalog.
- Locked the production delivery source to
  `postman-cs/paypal-harness-postman-stages@main` and retained immutable full-SHA
  runtime calls to the underlying `postman-cs` actions.
- Added connector URL and remote-template metadata preflight. Production install
  fails for a fork, wrapper, inline collision, wrong Git file, wrong version, or
  mutable/non-Postman-CS Action reference.
- Added a dry-run/apply/rollback installer for an existing PayPal pipeline.
  Apply requires an explicit downstream anchor, writes a mode-0600 local backup,
  reads the Harness definition back, and verifies idempotent linked stages.
- Added deterministic template generation, collision and ordering tests, source
  policy tests, connector/template preflight tests, and a non-secret Jason input
  manifest. That suite passed 31 tests before the live rehearsal.

## Service-account and workspace hardening — v0.2.0

- Preserved v0.1.0 template files and added v0.2.0 templates rather than
  rewriting an imported Harness version in place.
- Renamed the production secret contract to
  `paypal_postman_service_account_pmak`; tests reject personal-user token/key
  secret references across the customer stage catalog.
- Added `workspace_mode=existing|create`. Existing mode requires an immutable
  workspace ID. Create mode requires an owning Postman sub-team ID and
  canonical PayPal service-repo URL, then emits workspace identity to the CLI
  stage.
- Generalized both delivery stages to accept any HTTPS spec URL with an exact
  SHA-256 while keeping the reviewed public Orders artifact as the default.
- Added a checksum-pinned `postman-resolve-service-token-action` v2.0.4
  preflight to the CLI stage, so a personal PMAK fails before quality-gate work.
- Added a macOS Node 24 wrapper around the pinned Postman-CS npm CLI; it reports
  only the service-account team ID and discards the short-lived access token.
- Validated the replacement PMAK on macOS and installed it as project-scoped
  Harness secret `paypal_postman_service_account_pmak` without logging it.
- Harness sequence 5 (`ntzUYH0pSXyW9QZbU0QlHQ`) minted the short-lived token,
  resolved service-account team `13569807`, and passed every boundary through
  workspace selection. The first read of Winter Trinity specifications failed
  with HTTP 403 because the service account is not assigned to workspace
  `d692f930-e186-44e1-bffa-2971bf69ddf4`; no write was attempted.
- Added a pre-write backend guard to runtime Insights linking. The current
  Akita acknowledgement path requires a user identity and therefore does not
  meet PayPal's service-account-only policy.
- Expanded the suite to 34 passing tests and added the production technical
  checklist in `docs/CUSTOMER-TECHNICAL-CONSIDERATIONS.md`.
