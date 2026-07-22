# Architecture and trust boundary

## Customer execution chain

```text
PayPal source repository and existing Harness trigger
  -> independent PayPal-selected Postman stage
    -> postman-cs action at a full top-level commit SHA
      -> Postman asset APIs
    -> or pre-provisioned Postman CLI
      -> lint, collection execution, and JUnit
  -> PayPal's existing governance/promotion/deployment stages
```

PayPal keeps authority over source checkout, triggers, runners, secrets,
approvals, and promotion. The drop-ins do not introduce a replacement pipeline
or hidden deployment path.

## One stage per outcome

| Stage | Execution surface | Maximum authority |
| --- | --- | --- |
| `spec-to-postman-onboarding` | Regular `postman-api-onboarding-action` | Approved upsert in a supplied existing Postman workspace; no Git write |
| `postman-cli-quality-gate` | Postman CLI | Read-only exact-workspace lint and collection execution; JUnit |
| `postman-to-git-sync` | `postman-repo-sync-action` | Local commit only; no push |
| `runtime-route-discovery` | `postman-insights-onboarding-action` | Approved linkage of an already discovered runtime service |

TDD preview is not the first customer workflow. It remains available in the
legacy wrapper for future PR-scoped spec-versus-implementation experimentation,
but it is absent from the Jason Orders handoff.

## CLI-first policy

The signed Postman CLI is the quality execution plane: authentication,
organization-workspace discovery, spec linting, and collection execution. The
runner must provide a reviewed version. The stage intentionally refuses a
runtime `curl | sh` installer.

CLI tests are locked to case-sensitive workspace name `Winter Trinity` and the
supplied workspace ID. Missing, ambiguous, or mismatched results stop before
lint or collection execution. Collection failures produce a non-zero result and
block downstream promotion; JUnit is declared to Harness.

Postman-CS actions own lifecycle operations the CLI does not expose cleanly:
asset upsert, repo materialization, and Insights linkage.

## Mutation policy

- Onboarding requires an existing workspace ID and explicit approval; it uses
  `refresh` and `update` semantics and no Git write.
- CLI quality is read-only.
- Git sync is `commit-only` and cannot publish.
- Runtime discovery requires explicit approval and `create-api-key=false`.
- Production promotion and task completion remain human decisions.

## Supply-chain boundary

Every customer lifecycle stage points to `postman-cs/...@<40-character SHA>`
directly. `postman-cs.lock.json` records those commits, and `pnpm run validate`
rejects mutable, missing, or mismatched top-level references.

The reviewed regular onboarding composite contains release-tagged transitive
Postman-CS actions. Its top-level source is immutable, but its full dependency
graph does not yet meet a SHA-only policy. PayPal must either accept that risk,
use a reviewed internal mirror, or wait for Postman-CS to publish a fully pinned
composite before production.

## Secrets

PMAKs, access tokens, Git credentials, service auth, OAuth secrets, and mTLS
material must be Harness Secret references or PayPal-approved external secret
references. They must never be committed, passed as ordinary runtime text,
copied into build evidence, or printed by diagnostics.

## Legacy references

The repository retains `action.yml` and three full-pipeline templates as
implementation and repeatability evidence. They pin the private wrapper at
`e6b290c034aa1cc8a144578041fbd652b1f4f09f`. They are not required by the four
customer drop-ins and are not tonight's handoff path.
