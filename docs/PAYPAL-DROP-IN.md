# Add Postman stages to an existing PayPal Harness pipeline

PayPal does not need to adopt a replacement pipeline. The canonical files in
`harness/stages` generate remote stage templates in `.harness/templates`.
Production links those remote templates from
`postman-cs/paypal-harness-postman-stages`; it does not copy inline YAML or use
a personal wrapper. The linked stages inherit the parent repository, trigger,
connector, revision, and downstream controls.

## First delivery for Jason

Insert these two independent stages before PayPal's current governance and
promotion gates:

1. `harness/stages/spec-to-postman-onboarding.yaml`
2. `harness/stages/postman-cli-quality-gate.yaml`

The first stage verifies the official Orders v2 source by commit and SHA-256,
then invokes the regular Postman-CS onboarding action. The second stage proves
the exact Winter Trinity identity and uses Postman CLI for lint, smoke/contract
collection execution, failure gating, and JUnit.

## Install

1. Configure a Harness Git connector scoped exactly to
   `postman-cs/paypal-harness-postman-stages` and import the two approved files
   in `.harness/templates` as remote stage templates.
2. Run `pnpm harness:install -- ... --dry-run`, then `--apply`, with the
   existing downstream governance/promotion stage supplied as `--before-stage`.
3. Preserve the parent's `properties.ci.codebase`, trigger, connector, and
   deployment stages.
4. Replace only the stage runtime block if PayPal uses a VM or Kubernetes
   runner instead of Harness Cloud.
5. Create Harness secret `paypal_postman_api_key` from the approved Postman
   service account.
6. Provide the existing Winter Trinity workspace ID. The stage is deliberately
   not allowed to create an unnamed/unknown workspace.
7. For onboarding, set `approve_postman_write=true`, keep
   `repo-write-mode=none`, and use the immutable default Orders URL.
8. Wire the onboarding action output to the CLI stage's
   `onboarding_collections_json` with
   `<+pipeline.stages.postman_spec_to_postman_onboarding.spec.execution.steps.run_regular_postman_cs_onboarding.output.outputVariables."collections-json">`.
   Explicit reviewed IDs may be supplied instead and take precedence.
9. Run the CLI quality stage twice with identical inputs.
10. Confirm stable IDs, no duplicate assets, identical results, and visible
    JUnit before introducing a private service.

The installer validates the connector URL and both template Git metadata
records before it will change the pipeline. See `docs/JASON-QUICKSTART.md` for
the exact handoff commands and rollback flow.

## Public Orders source

- Repository: `paypal/paypal-rest-api-specifications`
- Commit: `9f0f52810ae24244ec3f24260c28f58e198d0b9e`
- Artifact: `openapi/checkout_orders_v2.json`
- SHA-256: `14db0b9e0d7440e38595b823724599edc7ab8b7a2b41ac442463e81b7d477fd6`

This is the public contract Deirdre and Jason selected for the proof.

## Later stages

- Use `postman-to-git-sync.yaml` after asset IDs stabilize. It requires
  `approve_local_commit=true` and cannot push.
- Use `runtime-route-discovery.yaml` only after the Insights service, cluster,
  environment, token type, and retention model are confirmed.

## Rollback

Remove/revert the stage YAML. Git sync produces only a local commit that stays
under PayPal's existing review process. Postman asset rollback and cleanup stay
human-owned until the first private service establishes retention semantics.
