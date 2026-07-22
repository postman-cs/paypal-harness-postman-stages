# PayPal Harness working-session contract

## Proposed first pass for Jason and Varun

Use PayPal's public Orders v2 API in the exact Winter Trinity workspace. Add two
independent stages to one existing non-production Harness pipeline:

1. `spec-to-postman-onboarding.yaml` — regular Postman onboarding.
2. `postman-cli-quality-gate.yaml` — Postman CLI lint/tests/JUnit.

This is not a TDD-preview demonstration. The regular onboarding action owns the
spec/workspace/collection lifecycle; Postman CLI owns the quality gate. PayPal's
existing governance and promotion stages remain downstream and authoritative.

## Customer-confirmed problem and intended outcome

- Deirdre Corley, product lead for PayPal's API management platform, wants a
  unified API ecosystem and better Postman usage visibility.
- A checked-in OAS 3 contract should update/generate the corresponding Postman
  collection without manual UI work.
- Postman assets should be exportable to a reviewable Git commit.
- Contract checks should run through API/CLI in Harness and block drift before
  PayPal's existing gates.
- Runtime evidence should ultimately find implemented endpoints absent from the
  authoritative spec, including complex app-to-spec relationships.
- Jason DeLeau, an API platform engineering manager, wants an
  engineer-verifiable implementation rather than a UI-only demo.

Evidence: PayPal Gong `414844849311536128`, 2026-06-16. The 2026-06-25 meeting
confirms Deirdre, Jason, and Varun attended, but its transcript is unavailable
in Kepler and is used only for attendance.

## Decisions required from Jason and Varun

- Confirm the engineering owner, Harness pipeline owner, secrets owner,
  security approver, rollback owner, and their own ownership split.
- Select the existing Harness pipeline and runner. Confirm Linux/AMD64, Node 24,
  and a reviewed pre-provisioned Postman CLI version.
- Confirm source-control provider, repository, default branch, connector, PR
  variables, and branch protections. GitHub is not yet a validated PayPal
  source-control assumption for the private service.
- Confirm the exact Winter Trinity organization-workspace ID and the approved
  Orders smoke/contract collection IDs.
- Confirm Postman/GitHub egress or an approved internal mirror. Customer action
  stages still resolve directly to the reviewed Postman-CS commits.
- Select the first private service after Orders: spec path, base URL, health
  route, auth/test-data strategy, and representative pass/fail cases.
- Define JUnit/artifact retention, failure policy, approval and rollback
  behavior, production decision owner, and target go-live date.
- Define the deployed-route inventory and normalization rules required for
  rogue-endpoint comparison.

## Demonstration sequence

1. Show `pnpm run check` green and review the four semantic stage files.
2. Paste `spec-to-postman-onboarding.yaml` and
   `postman-cli-quality-gate.yaml` into the selected existing pipeline.
3. Show that onboarding calls
   `postman-cs/postman-api-onboarding-action@v2.1.2` directly, verifies that
   tag against the locked commit, and makes no Git write.
4. Create/reference Harness secret `paypal_postman_api_key`; never paste the
   PMAK into YAML or a transcript.
5. Provide the exact existing Winter Trinity workspace ID, set
   `approve_postman_write=true`, and run regular Orders onboarding.
6. Record generated/reused spec and collection IDs; rerun unchanged and verify
   no duplicates.
7. Show `postman --version`, exact workspace name/ID resolution, Orders spec
   lint, approved collection execution, and JUnit in the CLI stage.
8. Run the CLI stage twice unchanged, then demonstrate one controlled failing
   contract assertion that blocks downstream promotion.
9. Review `postman-to-git-sync.yaml` but do not run it until asset IDs are
   approved; its maximum authority is an unpushed local commit.
10. Review `runtime-route-discovery.yaml` as the input to rogue-endpoint work;
    do not claim the comparison is complete.

## Eric's completion gate

Leave with four explicit answers: what business problem PayPal is solving, who
owns/care about it, how success is measured, and the target production go-live
date. The first three have a research-backed proposal in
`docs/PAYPAL-REQUIREMENTS.md`; the date and final owner remain human decisions.

## Acceptance boundary

The working session succeeds when Jason or Varun can point to the selected
existing pipeline, verify the direct regular-onboarding action pin, see a stable
Orders onboarding rerun and CLI/JUnit result in Winter Trinity, and name the
private-service owner and next date. A sandbox run is not production approval.
