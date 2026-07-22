# Jason simulation — GitHub spec to Harness to Postman

Date: 2026-07-22

Target: existing team workspace `Winter Trinity`
Harness pipeline: `PayPal_Jason_Orders_DropIn_Proof`

## Result

The rehearsal exercised the production-shaped route from a fresh public GitHub
clone through Harness and into Postman. It reached the Postman write boundary,
then failed closed because the supplied credential is a personal PMAK. The
regular Postman-CS onboarding core requires a service-account PMAK that can mint
a short-lived service token (or an already minted service-account access token)
for asset operations.

No Postman asset was created or changed. A second successful run and the final
asset-ID idempotency comparison therefore remain blocked on the credential,
not on GitHub, Harness, the PayPal spec, or the stage implementation.

## Jason-path setup

1. Cloned `https://github.com/postman-cs/paypal-harness-postman-stages.git`
   into a new directory, as a PayPal engineer would.
2. Checked out commit
   `462481576a572a418af77d506fb1fcf474c48941` from `main`.
3. Ran `pnpm install --frozen-lockfile` and `pnpm run check`.
4. Passed the 31 tests then present, deterministic template generation, and
   direct Postman-CS dependency validation.
5. Confirmed the Harness connector resolves exactly to
   `https://github.com/postman-cs/paypal-harness-postman-stages.git`.
6. Selected the existing `Winter Trinity` workspace by immutable ID, not name.
7. Set the explicit Postman-write approval input to `true` and ran only the
   first onboarding stage.

## Immutable inputs

- PayPal source repository: `paypal/paypal-rest-api-specifications`
- Source commit: `9f0f52810ae24244ec3f24260c28f58e198d0b9e`
- Source file: `openapi/checkout_orders_v2.json`
- Spec SHA-256:
  `14db0b9e0d7440e38595b823724599edc7ab8b7a2b41ac442463e81b7d477fd6`
- Postman-CS runtime:
  `postman-cs/postman-bootstrap-action` release `v2.10.5`
- Runtime commit: `848edbabcbfd311168e05b2976b907736f020ba5`
- Linux AMD64 binary SHA-256:
  `114a62ae96ec3cfa7e80f45c1192de8caf014b248bb4cb727f0584442a92c336`
- Postman CLI installed by the reviewed onboarding core: `1.44.0`

## Execution evidence

Harness execution `OLoAYo9lQYqvv6hEEqhXHQ`, sequence 4, ran from
13:26:33 to 13:27:39 PDT.

| Boundary | Result | Evidence |
| --- | --- | --- |
| GitHub → Harness | Pass | Harness cloned the codebase through `postman_cs_paypal_stages`. |
| Source integrity | Pass | The exact Orders v2 URL and SHA-256 were verified. |
| Human write gate | Pass | `approve_postman_write=true` was explicitly supplied. |
| Postman-CS runtime integrity | Pass | The v2.10.5 binary was downloaded from the Postman-CS release and its SHA-256 passed. |
| Postman CLI | Pass | Postman CLI 1.44.0 installed and authenticated with the supplied personal key. |
| Workspace target | Pass | Exact existing workspace `Winter Trinity` was selected by ID. |
| Service credential | Fail closed | The personal PMAK could not mint a service-account access token; the retry was rejected with HTTP 401 before the spec write. |
| Postman assets | Not run | Spec, collection, and test asset creation did not start. |
| Idempotency rerun | Blocked | There is no successful first-run identity set to compare yet. |

Three earlier attempts exposed Harness Action-adapter incompatibilities and
were used to harden the final stage:

| Sequence | Execution ID | Finding and correction |
| --- | --- | --- |
| 1 | `r2o3VGhYRyOrAxMoV0dCwg` | Harness treated a commit SHA as a tag; the source contract was corrected. |
| 2 | `LORw4lznQUmzd3_szWe-gQ` | Harness could not preload the nested composite action; the stage was flattened to the regular bootstrap core. |
| 3 | `OUEzqVybQuGYjdQ50lszRg` | Harness's Action adapter could not execute the action's Node 24 runtime; the stage switched to the checksum-verified self-contained Postman-CS binary. |
| 4 | `OLoAYo9lQYqvv6hEEqhXHQ` | All integration boundaries passed through Postman CLI login; the personal credential then failed the required service-token mint. |

## Before/after state

The `Winter Trinity` workspace was inspected after execution 4 with the same
authenticated Postman identity. It remains a team workspace with zero
collections, APIs, environments, mocks, and monitors. This matches the pre-run
snapshot and proves the failed rehearsal did not leave partial assets.

## Follow-up hardening

Template v0.2.0 makes the credential class unambiguous with Harness secret
`paypal_postman_service_account_pmak`, adds an explicit `existing` versus
`create` workspace mode, and passes workspace outputs directly to the CLI gate.
Create mode requires the Postman sub-team ID and canonical PayPal service-repo
URL so the regular Postman-CS bootstrap can create and reconcile a new
workspace without duplicate identities.

## Completion gate

Create Harness secret `paypal_postman_service_account_pmak` from a PMAK
generated for a Postman service account that has access to the owning team and
target workspace. Then run the same stage twice with identical inputs and
retain:

- the first-run workspace, spec, and collection IDs;
- the second-run IDs and operation receipts;
- evidence that the IDs are identical and no duplicate assets were created;
- the subsequent Postman CLI quality-gate JUnit output.

Do not weaken the service-credential preflight or substitute browser-session
cookies. The intended PayPal production path remains a direct dependency on
the public Postman-CS repositories.
