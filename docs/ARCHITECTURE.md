# Architecture and trust boundary

## Non-negotiable execution chain

```text
PayPal service repository / Harness trigger
  -> PayPal-controlled Harness CI pipeline
    -> immutable revision of this wrapper action
      -> immutable Postman-CS action revision
        -> Postman API and CLI
```

This repository is orchestration only. It must not copy, vendor, silently fork,
or reimplement the Postman-CS actions. `action.yml` contains the direct
`postman-cs/...@<full-commit-sha>` calls; `postman-cs.lock.json` is the reviewable
direct-dependency record; and `pnpm run validate` rejects a mutable or drifting
direct ref.

Harness Cloud, VM, and local runner infrastructure should use the native
Harness `Action` step. Kubernetes infrastructure must use Harness's documented
GitHub Actions Drone plugin, which requires privileged Docker-in-Docker. PayPal
security must approve that runner model before the Kubernetes template is used.

## Operations

| Operation | Direct dependency | Intended gate |
| --- | --- | --- |
| `validate` | `postman-cs/postman-onboarding-tdd` | Secret-free setup and harness lint before adoption. |
| `cli-test` | Postman CLI | Direct smoke and contract collection execution in the exact `Winter Trinity` sandbox. |
| `contract-test` | Postman CLI + `postman-cs/postman-onboarding-tdd` | CLI spec governance followed by PR-scoped spec-versus-implementation proof. |
| `onboard` | `postman-cs/postman-api-onboarding-action` | Human-approved workspace/bootstrap/repo synchronization. |

## CLI-first policy and test isolation

The signed Postman CLI is the primary surface wherever it supports the required
operation: CI authentication, organization-workspace discovery, spec linting,
and collection execution. The wrapper does not install the CLI at runtime; the
PayPal runner must provide a reviewed version. Postman APIs remain available
only behind the pinned Postman-CS actions for asset orchestration that the CLI
does not expose.

All credentialed wrapper tests are locked to the case-sensitive workspace name
`Winter Trinity`. The wrapper searches organization-owned workspaces through
the CLI, requires one exact match, and optionally confirms the expected ID.
Ambiguous, missing, or mismatched results stop execution before linting or
collection runs. `contract-test` also rejects a TDD configuration targeting any
other workspace. No PayPal production workspace is used by these tests.

Collection v2 HTTP assets can emit CLI and JUnit evidence. Collection formats
without JUnit reporter support, including v3 YAML, must select
`cli-report-format=cli-only`; the CLI exit code remains the gate.

Mutation defaults are deliberately `none`. Changing either write mode requires
a reviewed pipeline revision and a named customer owner. Production promotion
is outside this action and remains human-gated in PayPal's pipeline.

The locked `postman-api-onboarding-action` revision currently composes other
Postman-CS actions through release tags. The outer source is immutable, but its
transitive references do not yet meet a full-SHA-only supply-chain policy. Keep
`operation=onboard` blocked for PayPal production until those upstream refs are
made immutable or PayPal approves and pins an internal mirror. `validate` and
`contract-test` directly execute the locked TDD action and are the intended
working-session path.

## Secrets

The Postman credential, GitHub token, service credentials, OAuth secrets, and
mTLS material must be Harness Secret references (or references to PayPal's
approved external secret manager). They must never be committed, entered as
runtime text inputs, copied to Studio, or printed by diagnostic steps.

The wrapper accepts either a PMAK or a service access token. The first working
session should use PayPal's secret identifier and leave the raw value invisible
to the pipeline author. Rotation, revocation, and audit ownership must be named
before onboarding leaves a sandbox.

## Supply-chain update procedure

1. Pull the relevant Postman-CS repository and review the candidate commit.
2. Run its own tests and inspect bundled `dist` changes where applicable.
3. Update the exact SHA in both `action.yml` and `postman-cs.lock.json`.
4. Run `pnpm run check` and security/policy scanning.
5. Open a reviewed change and retain the previous wrapper SHA for rollback.
6. Update the Harness Action step only after approval; always use this wrapper's
   full commit SHA, never a branch or floating version tag.
