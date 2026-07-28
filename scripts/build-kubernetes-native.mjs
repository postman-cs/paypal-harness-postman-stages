import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Kubernetes-native projection of the canonical PayPal stages: plain Run
// steps on KubernetesDirect infrastructure, no privileged runner (the earlier
// wrapper approach needed the privileged Drone plugin and was removed). Every Run
// step executes inside PAYPAL_TOOLS_IMAGE, which must pre-bake Node 24 and
// the signed Postman CLI; runtime curl-pipe CLI installation stays forbidden.
// Default emitted shape is the proven day-one pipeline: provision (identity
// check first, then idempotent asset provisioning with ids as outputs) ->
// route-contract comparison -> CLI quality gate consuming provision outputs.
// The spec-to-postman-onboarding stage stays available as a drop-in but is
// excluded from the default emit while its Spec Hub upload path is blocked
// upstream (the provision stage covers spec sync via the public Specs API).
export const KUBERNETES_NATIVE_STAGES = [
  'harness/stages/postman-asset-provision.yaml',
  'harness/stages/route-contract-comparison.yaml',
  'harness/stages/postman-cli-quality-gate.yaml',
];

const PROVISION_OUT =
  '<+pipeline.stages.postman_asset_provision.spec.execution.steps.ensure_assets.output.outputVariables';

// Gate inputs resolved from provision outputs so no asset id is ever typed by hand.
const GATE_OUTPUT_WIRING = {
  workspace_id: `${PROVISION_OUT}.WORKSPACE_ID>`,
  smoke_collection_id: `${PROVISION_OUT}.SMOKE_UID>`,
  contract_collection_id: `${PROVISION_OUT}.CONTRACT_UID>`,
  environment_id: `${PROVISION_OUT}.ENVIRONMENT_UID>`,
};

export const KUBERNETES_PIPELINE_PATH = 'harness/pipeline-kubernetes-native.yaml';

export const KUBERNETES_INFRASTRUCTURE = {
  type: 'KubernetesDirect',
  spec: {
    connectorRef: 'PAYPAL_KUBERNETES_CONNECTOR',
    namespace: 'PAYPAL_CI_NAMESPACE',
    automountServiceAccountToken: false,
    nodeSelector: {},
    os: 'Linux',
  },
};

export function stageToKubernetesNative(stageSource, stagePath) {
  const parsed = parse(stageSource);
  if (!parsed?.stage?.spec || parsed.stage.type !== 'CI') {
    throw new Error(`${stagePath} is not one Harness CI stage.`);
  }
  const stage = parsed.stage;
  delete stage.spec.platform;
  delete stage.spec.runtime;
  stage.spec.infrastructure = structuredClone(KUBERNETES_INFRASTRUCTURE);
  for (const entry of stage.spec.execution?.steps ?? []) {
    const step = entry.step;
    if (!step) continue;
    if (step.type !== 'Run') {
      throw new Error(
        `${stagePath} step ${step.identifier} is type ${step.type}; only plain Run steps are Kubernetes-portable without the privileged Drone plugin.`,
      );
    }
    // KubernetesDirect Run steps execute in an explicit container image.
    // PAYPAL_REGISTRY_CONNECTOR may be added as connectorRef for private
    // registries; without it the pull is anonymous/cluster-local.
    step.spec = {
      connectorRef: 'PAYPAL_REGISTRY_CONNECTOR',
      image: 'PAYPAL_TOOLS_IMAGE',
      ...step.spec,
    };
  }
  return stage;
}

export function buildKubernetesNativePipeline() {
  const stages = KUBERNETES_NATIVE_STAGES.map((stagePath) =>
    stageToKubernetesNative(readFileSync(resolve(root, stagePath), 'utf8'), stagePath),
  );
  for (const stage of stages) {
    if (stage.identifier !== 'postman_cli_quality_gate') continue;
    for (const variable of stage.variables ?? []) {
      if (variable.name in GATE_OUTPUT_WIRING) variable.value = GATE_OUTPUT_WIRING[variable.name];
    }
  }
  const pipeline = {
    pipeline: {
      name: 'PayPal Postman Kubernetes Pipeline',
      identifier: 'paypal_postman_kubernetes_pipeline',
      orgIdentifier: 'PAYPAL_ORG_ID',
      projectIdentifier: 'PAYPAL_PROJECT_ID',
      properties: {
        ci: {
          codebase: {
            connectorRef: 'PAYPAL_SCM_CONNECTOR',
            repoName: 'PAYPAL_SERVICE_REPOSITORY',
            build: '<+input>',
          },
        },
      },
      stages: stages.map((stage) => ({ stage })),
    },
  };
  const header = [
    '# GENERATED from the canonical drop-in stages; run pnpm harness:kubernetes to refresh.',
    '# Kubernetes-native pipeline: no GitHub Actions Drone plugin and no',
    '# privileged Docker-in-Docker. Replace all',
    '# PAYPAL_* placeholders through the Harness UI before saving. PAYPAL_TOOLS_IMAGE',
    '# must pre-bake Node 24 and the signed Postman CLI (see docker/postman-tools).',
    '# No credential belongs in this file.',
  ].join('\n');
  return `${header}\n${stringify(pipeline, { lineWidth: 0 })}`;
}

export function writeKubernetesNativePipeline() {
  const destination = resolve(root, KUBERNETES_PIPELINE_PATH);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, buildKubernetesNativePipeline());
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeKubernetesNativePipeline();
  console.log(`Generated ${KUBERNETES_PIPELINE_PATH} from ${KUBERNETES_NATIVE_STAGES.length} canonical stage(s).`);
}
