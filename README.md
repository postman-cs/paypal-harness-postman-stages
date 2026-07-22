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
- `harness/pipeline-studio-sandbox.yaml`: EchoAtlas sandbox for the public
  PayPal Orders v2 developer contract; `validate` is credential-free and
  `cli-test` is separately locked to `Winter Trinity`.
- `pnpm run check`: unit, secret-leak, dependency-pin, and template checks.

No credential is stored here. The supplied Postman and Harness credentials are
deliberately absent from every file and must be rotated if their disclosure does
not meet the owning teams' policy.

## Local validation

```sh
pnpm run check
```

## Harness adoption

1. Mirror the private wrapper repository into the customer-approved
   source-control location when PayPal takes ownership.
2. Review the immutable wrapper revision already pinned in each Harness
   template. Change it only through a reviewed commit.
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

The wrapper is published privately at
`danielshively-source/paypal-harness-pipeline` and the Harness templates pin
commit `351c84661c0fc619f36af94ede3c953eca735d2b`. Harness therefore needs a
read-only fine-grained GitHub token stored as `paypal_github_token` while the
repository remains private. Credentialed testing is still blocked until the
Postman API key can see the exact `Winter Trinity` organization workspace and
its approved collection IDs.

See [Harness sandbox evidence](docs/HARNESS-SANDBOX-EVIDENCE.md) for the live
pipeline review, public-spec provenance, and remaining human gates.
