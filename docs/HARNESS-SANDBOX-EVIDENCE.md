# Harness sandbox evidence — 2026-07-22

> Historical wrapper proof. The current PayPal handoff uses the four direct
> customer stages under `harness/stages`, led by regular Postman onboarding and
> the separate Postman CLI quality gate. No private-wrapper token is required by
> those customer stages.

## Current direct-stage proof

Pipeline `PayPal_Jason_Orders_DropIn_Proof` was created in Harness account
`MqRO9-E1S3KCCbydo-lPPg`, organization `default`, project `default_project` on
2026-07-22 from the exact onboarding and CLI stage files in this repository.
The create returned HTTP 200 with no YAML errors. Submitting the identical
definition again returned HTTP 200, and server readback confirmed:

- regular onboarding pin
  `postman-cs/postman-api-onboarding-action@d3d3776077fdcfa0b3e319e208dd963d18a0a0d9`;
- independent `postman_cli_quality_gate` stage;
- no `postman-onboarding-tdd` action; and
- no `danielshively-source/paypal-harness-pipeline` dependency.

This proves the first two-stage customer definition is accepted and can be
reapplied without creating another pipeline. It does not prove Postman asset
idempotency because the approved Winter Trinity PMAK/workspace/collection IDs
are not present at the connected Harness project scope; no execution occurred.

## Selected sandbox

Use `PayPal_SpecHub_Postman_Automation` as the existing sandbox baseline. It is
the only current pipeline with a Postman CLI contract stage and meaningful run
history. Do not use `PayPal_API_Pipeline` for the first wrapper proof; its live
Postman stage is intentionally incomplete.

The additive replacement template is
`harness/pipeline-studio-sandbox.yaml`, identifier
`PayPal_Public_Orders_Postman_Sandbox`. It was saved as a separate pipeline in
Harness on 2026-07-22; Harness readback reports `valid: true`, no YAML errors,
and the `ci` and `pms` modules.

The evidence-enabled revision was submitted twice through Harness's pipeline
update API on 2026-07-22. Both updates returned HTTP 200; subsequent server
readback remained `valid: true`, returned no YAML errors, and contained wrapper
revision `e6b290c034aa1cc8a144578041fbd652b1f4f09f`. This confirms the sandbox
definition itself can be applied repeatedly without creating another pipeline.

## Failed-execution review

- Execution `INBY9M-yQtqcCZiT-e6YWA` failed in
  `Contract_validation / Run_contract_collection_with_Postman_CLI` with exit
  status 1. The stage generated a local collection and environment, installed
  the Postman CLI at runtime with an unpinned shell installer when absent, and
  then ran the generated assets. The configured collection/environment IDs do
  not resolve through the currently authenticated Postman account.
- Execution `yUKHVvbETPaUnL2cueZwlQ` failed during delegate provisioning because
  no eligible delegate was available. Later Harness Cloud executions reached
  the pipeline steps, so this is historical infrastructure evidence rather
  than the current functional failure.

## Public PayPal contract

- Developer documentation:
  `https://developer.paypal.com/docs/api/orders/v2/`
- Official PayPal OpenAPI repository:
  `paypal/paypal-rest-api-specifications`
- Artifact commit:
  `9f0f52810ae24244ec3f24260c28f58e198d0b9e`
- Artifact path: `openapi/checkout_orders_v2.json`
- Verified OpenAPI/title/version: `3.0.4`, `Orders`, `2.32`
- Verified SHA-256:
  `14db0b9e0d7440e38595b823724599edc7ab8b7a2b41ac442463e81b7d477fd6`

The sandbox template downloads that immutable artifact, verifies the digest,
and creates only the minimal local TDD configuration needed by the direct
Postman-CS validation action.

The generated configuration was also executed locally through the exact pinned
`postman-cs/postman-onboarding-tdd` revision. It parsed nine operations and
passed setup validation with zero errors and zero warnings. This is not a
substitute for the first Harness execution; it proves the public contract and
generated config are valid before the private-action access gate.

## Immutable wrapper and runner

- Private wrapper repository:
  `https://github.com/danielshively-source/paypal-harness-pipeline`
- Approved wrapper action revision:
  `e6b290c034aa1cc8a144578041fbd652b1f4f09f`
- The action revision calls only the immutable Postman-CS action revisions in
  `postman-cs.lock.json`.
- The pinned `postman-onboarding-tdd` action declares a Node 24 runtime. Confirm
  that the PayPal Harness Action runtime supports Node 24 before treating the
  first hosted execution as production-representative.
- The sandbox provisions the official npm-distributed Postman CLI at the pinned
  version `1.44.0` in a dedicated step, then the wrapper verifies
  `postman --version`. Runtime `curl | sh` installation is not used.

## Remaining gates

1. Create `paypal_github_token` as a Harness Secret using a fine-grained token
   with read-only contents access to the private wrapper repository. Do not
   reuse a broad local GitHub CLI token.
2. Generate a Postman API key in the account/team that owns `Winter Trinity`.
   The currently stored key authenticates successfully but returns zero exact
   organization-workspace matches for that name.
3. After the correct key resolves exactly one workspace, create Harness Secret
   `paypal_postman_api_key` from that key and record the workspace ID.
4. Select collection IDs that are members of `Winter Trinity`; the two IDs in
   the old sandbox resolve to nothing through the current account.
5. Import the additive sandbox pipeline and run `operation=validate` first.
   The pipeline is imported and schema-valid; execution remains pending the
   private-wrapper token. Only after `validate` passes, run
   `operation=cli-test` with the workspace and collection inputs. No production
   onboarding is authorized by this proof.

Harness secret inventory was rechecked after the pipeline update. Neither
`paypal_github_token` nor `paypal_postman_api_key` exists at the connected
project scope, so no execution was attempted.

## Repeatability evidence

GitHub Actions run
[`29946049355`](https://github.com/danielshively-source/paypal-harness-pipeline/actions/runs/29946049355)
passed all three jobs on 2026-07-22:

- the repository/action/template contract;
- two public PayPal Orders setup validations with one identical fingerprint,
  evidence path, and read-only mutation policy; and
- two synthetic CLI runs that selected exact workspace `Winter Trinity`, ran
  both collection gates, produced one identical fingerprint/evidence path, and
  exposed no mutating Postman command surface.

This proves deterministic wrapper behavior and a stable Harness handoff
contract. It does **not** prove a credentialed round trip against PayPal's
Postman team; the correct `Winter Trinity` credential and approved asset IDs
remain required.
