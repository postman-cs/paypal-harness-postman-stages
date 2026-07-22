# PayPal Harness working-session contract

## Proposed first pass

Use one non-production service and begin with `operation=validate`. If setup
validation is green, run `cli-test` and then `contract-test` against the same
immutable service commit and authoritative OpenAPI specification. Every live
wrapper test targets the exact `Winter Trinity` workspace. The Orders API is a
candidate, not a confirmed selection.

## Decisions required from Jason DeLeau and Varun Gnanaselvan

- Confirm their actual roles and identify the engineering owner, Harness
  pipeline owner, secrets owner, and security approver.
- Confirm Harness account, organization, project, pipeline, runner type, and
  whether the build uses Harness Cloud, VM/local, or Kubernetes infrastructure.
- Confirm source-control provider, service repository, default branch,
  connector, PR event metadata, and branch-protection rules. GitHub is not yet
  a validated PayPal source-control assumption.
- Select the first service and authoritative OpenAPI path; identify its runtime
  start command, health URL, base URL, and representative success/failure cases.
- Confirm Node 24 support for `postman-onboarding-tdd`. If unavailable, agree on
  a supported runner upgrade before attempting the contract-test operation.
- Confirm the signed Postman CLI is pre-provisioned on the runner and record its
  reviewed version. The pipeline intentionally does not install it at runtime.
- Confirm the exact `Winter Trinity` organization-workspace ID. The wrapper can
  resolve by exact name, but supplying the ID prevents ambiguity and provides a
  second identity check.
- Select the Winter Trinity smoke/contract collection IDs and optional
  environment ID. Confirm whether the assets support JUnit (`junit`) or require
  CLI-only reporting, including v3 YAML collections (`cli-only`).
- Confirm network egress/allowlist for GitHub and Postman, or the approved
  internal mirror strategy. The action must still resolve to the reviewed
  Postman-CS commits in `postman-cs.lock.json`.
- Create Harness Secret identifiers for Postman and GitHub credentials and name
  rotation/revocation owners. Do not share raw credential values in the session.
- Decide permanent versus ephemeral Postman workspace behavior, cleanup trigger,
  retention, merge handling, and recovery owner.
- Define the pass/fail evidence, failure policy, JUnit retention, approval gate,
  rollback path, decision owner, and customer-confirmed date.

## Demonstration sequence

1. Show `pnpm run check` green in this wrapper repository.
2. Import the template appropriate to the confirmed runner.
3. Replace every `PAYPAL_*` marker and pin this wrapper to a full commit SHA.
4. Run `validate` without Postman secrets; save its validation summary.
5. Verify `postman --version`, then resolve credentials only through Harness
   Secrets. Never paste a PMAK into pipeline YAML or a command transcript.
6. Resolve the organization-owned workspace via `postman search workspaces` and
   demonstrate that the wrapper selected exact name `Winter Trinity` and the
   approved ID.
7. Run `cli-test` against the approved Winter Trinity collection IDs. Preserve
   JUnit when the collection format supports it; otherwise preserve the CLI
   transcript and exit result.
8. Run one controlled failing `contract-test`, then correct the service/spec and
   rerun green. Preserve spec-lint, contract, and failure evidence.
9. Leave `onboard` and all write modes disabled until a named human approves the
   target assets and mutation policy, and the transitive tagged references in
   the locked onboarding action are remediated or explicitly accepted.

## Acceptance boundary

The working session is successful when PayPal can trigger the wrapper from its
own Harness project, the wrapper demonstrably calls the locked Postman-CS action
revision, all credentialed tests are proven to target `Winter Trinity`, and the
resulting CLI/JUnit evidence is visible without exposing a secret.
Production execution and task completion remain human decisions.
