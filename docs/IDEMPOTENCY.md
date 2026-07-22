# Idempotency contract

| Stage | Mutation policy | Idempotency rule |
| --- | --- | --- |
| `spec-to-postman-onboarding` | Human-approved Postman upsert; no Git write | Existing mode reuses an immutable workspace ID; create mode reconciles by owning sub-team plus canonical service-repo URL; `spec-sync-mode=update`, `collection-sync-mode=refresh`, and emitted asset IDs must reuse the same objects |
| `postman-cli-quality-gate` | Read-only | Exact workspace identity plus the same collection/environment IDs must produce the same pass/fail result and no Postman/Git mutation |
| `postman-to-git-sync` | Local `commit-only` | Same Postman asset versions must produce no new diff/commit on the second run; the stage cannot push |
| `runtime-route-discovery` | Currently blocked before writes | Service-account-only policy fails closed until Insights acknowledgement is supported atomically; `create-api-key=false` prevents durable-key proliferation |

## Automated proof available now

GitHub Actions run
[`29946049355`](https://github.com/danielshively-source/paypal-harness-pipeline/actions/runs/29946049355)
executes the legacy wrapper's public Orders validation and synthetic Postman CLI
surface twice. Each pair produces one stable fingerprint/path; the CLI fixture
asserts two collection runs and no mutating Postman command.

The drop-in stage test suite additionally enforces stable-ID inputs, explicit
write approvals, direct Postman-CS commit pins, `repo-write-mode=none` for
onboarding, `commit-only` for Git sync, and read-only CLI commands.

## Live acceptance sequence

Once a service-account PMAK and the approved target workspace strategy are
available:

1. Record Git commit, Orders spec digest, direct action SHAs, workspace ID,
   spec ID, collection IDs, environment ID, and write approvals.
2. Run onboarding twice with identical values.
3. Assert the workspace/spec/collection IDs remain stable and no duplicate
   assets are created.
4. Run the CLI stage twice and assert the same JUnit counts/result with no
   Postman or Git mutation.
5. Run Postman-to-Git twice; assert the second run has no diff and no new local
   commit.
6. Change exactly one reviewed contract field; assert one expected Postman
   update and a changed quality result where appropriate.
7. Revert it; assert the original IDs and outcome return.

Until this sequence passes against real Winter Trinity assets, idempotency is
confirmed for the code and read-only test contract—not yet for PayPal's live
credentialed onboarding round trip.
