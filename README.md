# PayPal Harness Pipeline

This repository is the PayPal-facing CI entrypoint for Postman API onboarding
and spec-versus-implementation contract testing. Its strict design rule is
enforced in code: the wrapper delegates directly to approved Postman-CS action
repositories pinned to immutable commits.

## What is ready

- `action.yml`: CLI-first wrapper operations `validate`, `cli-test`,
  `contract-test`, and `onboard`.
- `postman-cs.lock.json`: exact upstream repository/commit inventory.
- `harness/pipeline-cloud-vm.yaml`: native Harness Action-step template.
- `harness/pipeline-kubernetes.yaml`: Kubernetes/Drone fallback, subject to
  privileged-runner security approval.
- `pnpm run check`: unit, secret-leak, dependency-pin, and template checks.

No credential is stored here. The supplied Postman and Harness credentials are
deliberately absent from every file and must be rotated if their disclosure does
not meet the owning teams' policy.

## Local validation

```sh
pnpm run check
```

## Harness adoption

1. Publish this repository to the customer-approved source-control location.
2. Review and pin its full commit SHA in the selected Harness template.
3. Replace the `PAYPAL_*` markers with customer-owned identifiers.
4. Store credentials in Harness Secrets and reference only their identifiers.
5. Start with `operation=validate`; it does not require a Postman credential.
6. Pre-provision the signed Postman CLI on the runner. Runtime `curl | sh`
   installation is intentionally rejected.
7. Resolve the exact `Winter Trinity` organization workspace through
   `postman search workspaces`; provide its ID as an additional identity lock
   when known. Tests fail closed on a missing, mismatched, or ambiguous match.
8. Use `operation=cli-test` for direct CLI collection runs. Use
   `cli-report-format=junit` for Collection v2 HTTP test assets and
   `cli-report-format=cli-only` for formats without JUnit support, including v3
   YAML.
9. Proceed to `contract-test` only after runner/runtime and first-service inputs
   are confirmed. It lints the authoritative spec with the Postman CLI in
   `Winter Trinity` before calling the pinned Postman-CS TDD action. Keep
   repository/config write modes at `none`.
10. Do not enable `onboard` for production until the transitive action-pin risk
   documented in the architecture is remediated or accepted by PayPal.

See [architecture](docs/ARCHITECTURE.md) and the [working-session checklist](docs/WORKING-SESSION.md).

## Current known boundary

The action repository is locally built but not yet published, so the Harness
template intentionally contains an invalid `FULL_40_CHARACTER_COMMIT_SHA`
marker. Publishing, selecting the PayPal SCM location, and activating a live
Harness pipeline require customer confirmation and human approval.
