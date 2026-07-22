# PayPal Harness/Postman requirements

## Evidence-backed customer requirements

| Requirement | Evidence | Deliverable/status |
| --- | --- | --- |
| Fit into the current Harness flow | Deirdre placed the capability before existing governance/SDLC controls | Four independent `stage:` objects; no replacement trigger or pipeline |
| Repository OAS 3 → Postman assets | Deirdre asked for automatic collection generation when an OAS 3 contract is checked in | `spec-to-postman-onboarding.yaml` calls the regular onboarding action directly |
| Postman CLI quality gate | Jason wants API/CLI-driven engineer-verifiable proof | `postman-cli-quality-gate.yaml` performs exact-workspace verification, lint, collection runs, and JUnit |
| Reviewable Postman → Git result | PayPal wants bidirectional flexibility, not a UI-only flow | `postman-to-git-sync.yaml` uses `commit-only`; a human owns push/merge |
| Contract drift blocks promotion | Jason said Harness exists but contract testing is missing | CLI failures fail the stage and therefore stop downstream promotion |
| Detect implemented endpoints absent from OAS | Deirdre described rogue endpoints and one-to-many/many-to-many mappings | `runtime-route-discovery.yaml` supplies runtime evidence; comparison logic remains discovery/implementation work |
| Meaningful public proof | Deirdre selected developer.paypal.com; Jason selected Orders for complexity | Official Orders v2 commit and digest are pinned |
| Usage visibility | Deirdre wants visibility across roughly 3,900 Postman users | Account/adoption workstream; intentionally outside these CI stages |

Primary evidence: PayPal Gong call `414844849311536128`, 2026-06-16. The
2026-06-25 contract-testing call confirms Deirdre, Jason, and Varun attended,
but its transcript is unavailable in Kepler and is used only as attendance
evidence.

## Eric's Thursday completion gate

1. **Problem/business outcome:** automate governed spec/collection lifecycle
   and Postman quality gates inside PayPal's existing Harness flow.
2. **Stakeholders:** Deirdre Corley leads the API management product direction;
   Jason DeLeau is an API platform engineering manager. Jason and Varun
   Gnanaselvan are booked technical counterparts; final implementation ownership
   must be confirmed with them.
3. **Success measures:** stable Postman IDs across identical reruns; no duplicate
   assets; passing Orders CLI/JUnit proof; intentional drift fails promotion;
   Postman-to-Git output remains human-reviewed.
4. **Target go-live:** unknown. The working session must name a decision owner
   and production target date; tonight's sandbox proof is not the go-live date.

Eric's Linear comment:
`https://linear.app/postman/project/paypal-5aedd5e30933/activity#project-update-23507bc8&comment-c275b213`

## Non-negotiable controls

- Full top-level commit pins for customer-stage Postman-CS actions.
- Harness Secret references only; no raw PMAK or Git token in YAML or logs.
- Exact Winter Trinity name plus workspace ID.
- Existing workspace required; writes need explicit runtime approval.
- Postman CLI is the test executor and publishes JUnit.
- Git materialization is `commit-only`; no automatic push or merge.
- A failed Postman gate blocks downstream promotion.
- Transitive mutable action references inside the regular onboarding composite
  remain visible as a production-readiness risk.

## Remaining working-session decisions

- Which existing Harness pipeline and runner image receive the stages.
- Jason/Varun engineering ownership split, secret owner, security approver,
  rollback owner, and evidence retention location.
- Exact Winter Trinity workspace and approved Orders collection IDs.
- First private service, canonical spec, base URL, health route, auth/test-data
  strategy, and pass/fail thresholds.
- Route-inventory source and normalization/matching rules for rogue endpoints.
- Production go-live date and acceptance window.
