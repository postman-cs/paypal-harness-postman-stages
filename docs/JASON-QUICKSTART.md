# Jason handoff: add the Postman stages to a PayPal Harness pipeline

Jason does **not** add these stages to Daniel's Harness account. PayPal imports
the two remote stage templates into PayPal's Harness project, then links them
into the existing PayPal pipeline. PayPal's trigger, repository checkout,
approvals, promotion, and deployment remain unchanged.

## Production source contract

There are two intentionally direct `postman-cs` connections:

1. Harness loads the linked stage templates from
   `postman-cs/paypal-harness-postman-stages` on `main`.
2. At execution time, onboarding invokes
   `postman-cs/postman-bootstrap-action@v2.10.5`, the Node-based core used by
   regular onboarding. Harness requires a Git tag for an Action;
   `postman-cs.lock.json` records the exact commit resolved by that tag. This
   avoids Harness's nested-composite loader while still calling Postman-CS
   directly. Future lifecycle stages call Postman-CS directly as well.

The installer fails closed if its connector URL, template Git metadata,
repository owner, file path, template version, or locked Action ref does not
match that contract. A personal fork, copied inline stage, wrapper action,
floating tag, or different repository is not accepted for production.

## One-time PayPal Harness setup

1. Clone and validate the source:

   ```sh
   git clone https://github.com/postman-cs/paypal-harness-postman-stages.git
   cd paypal-harness-postman-stages
   corepack enable
   pnpm install --frozen-lockfile
   pnpm run check
   ```

2. In the PayPal Harness project, create a GitHub connector whose repository
   URL is exactly
   `https://github.com/postman-cs/paypal-harness-postman-stages.git`. Enable API
   access and use PayPal's approved read credential. Do not point the connector
   at a fork.
3. In **Project Setup → Templates**, import these files from that connector,
   repository, and the `main` branch as remote stage templates:

   - `.harness/templates/paypal-postman-onboarding-v0.1.0.yaml`
   - `.harness/templates/paypal-postman-cli-quality-gate-v0.1.0.yaml`

   Keep version `v0.1.0`; mark it stable only after PayPal review.
4. Create the Harness secret `paypal_postman_api_key` using the approved
   Postman service-account key. Do not put that key in Git, a runtime input, a
   command-line argument, or a build log.
5. Confirm the Linux AMD64 build runner has the reviewed Postman CLI already
   installed. Runtime `curl | sh` installation is not allowed.

Harness documents remote templates as Git-backed reusable entities. The Git
connector must have API access and username/token authentication; permissions
should be kept to the least privilege PayPal requires.

## Guarded install into an existing pipeline

Set the identifiers locally. Keep `HARNESS_API_KEY` in the shell environment so
it never appears in shell history as an installer argument:

```sh
export HARNESS_ACCOUNT_ID='PAYPAL_ACCOUNT_ID'
export HARNESS_ORG_ID='PAYPAL_ORG_ID'
export HARNESS_PROJECT_ID='PAYPAL_PROJECT_ID'
export HARNESS_PIPELINE_ID='EXISTING_PAYPAL_PIPELINE_ID'
export HARNESS_GITHUB_CONNECTOR='POSTMAN_CS_REPO_CONNECTOR_ID'
export HARNESS_API_KEY='PAYPAL_HARNESS_API_KEY'
```

Choose the existing governance or promotion stage that must remain after the
two Postman stages. Preview the exact mutation first:

```sh
pnpm harness:install -- \
  --before-stage EXISTING_GOVERNANCE_OR_PROMOTION_STAGE_ID \
  --dry-run
```

If the preflight and ordering are correct, apply it:

```sh
pnpm harness:install -- \
  --before-stage EXISTING_GOVERNANCE_OR_PROMOTION_STAGE_ID \
  --apply
```

The apply command saves the original pipeline under `.harness-backups/`,
updates Harness, reads the pipeline back, and verifies both linked stage
versions. Re-running the command is a no-op.

Rollback uses the printed backup path:

```sh
pnpm harness:install -- --rollback .harness-backups/PRINTED_BACKUP_FILE.yaml
```

## First run inputs

Use the non-secret defaults in `harness/inputs/jason-orders.defaults.yaml`.
Supply the exact existing Winter Trinity workspace ID and at least one reviewed
smoke or contract collection ID. The public Orders v2 contract is pinned by
both upstream commit and SHA-256.

1. Keep `approve_postman_write=false` for input review.
2. Confirm the onboarding target, stable asset IDs, and collection scope.
3. Set `approve_postman_write=true` for the approved proof run.
4. Run onboarding followed by the CLI gate twice with identical inputs.
5. Confirm the second run reuses the same workspace/spec/collection identities,
   creates no duplicate assets, emits JUnit, and leaves Git untouched.
6. Keep the existing PayPal human approval before promotion.

## Evidence to retain

- Harness execution URL and sequence ID.
- The `POSTMAN_HARNESS dependency=postman-cs/... ref=<tag> commit=<SHA>` log records.
- Spec source commit and SHA-256 verification.
- Postman CLI version, lint JSON, and JUnit results.
- First- and second-run Postman asset IDs for the idempotency comparison.
- Human approval and the unchanged downstream PayPal promotion controls.
