import { createHash } from 'node:crypto';
import { parse, stringify } from 'yaml';
import { REMOTE_TEMPLATES, REMOTE_TEMPLATE_VERSION } from './build-remote-templates.mjs';

export const PRODUCTION_SOURCE = Object.freeze({
  owner: 'postman-cs',
  repository: 'paypal-harness-postman-stages',
  fullName: 'postman-cs/paypal-harness-postman-stages',
  branch: 'main',
});

export const HARNESS_COMPATIBLE_ACTION_REFS = Object.freeze({
  'postman-cs/postman-api-onboarding-action': 'v2.1.2',
  'postman-cs/postman-bootstrap-action': 'v2.10.5',
  'postman-cs/postman-resolve-service-token-action': 'v2.0.4',
});

export const DELIVERY_STAGES = Object.freeze([
  {
    name: 'Postman - Spec to Postman onboarding',
    identifier: 'postman_spec_to_postman_onboarding',
    templateIdentifier: 'paypal_postman_onboarding',
    templatePath: '.harness/templates/paypal-postman-onboarding-v0.2.0.yaml',
    inputs: [
      ['project_name', 'String', '<+input>.default(paypal-orders)'],
      ['spec_url', 'String', '<+input>.default(https://raw.githubusercontent.com/paypal/paypal-rest-api-specifications/9f0f52810ae24244ec3f24260c28f58e198d0b9e/openapi/checkout_orders_v2.json)'],
      ['spec_sha256', 'String', '<+input>.default(14db0b9e0d7440e38595b823724599edc7ab8b7a2b41ac442463e81b7d477fd6)'],
      ['workspace_mode', 'String', '<+input>.default(existing).allowedValues(existing,create)'],
      ['workspace_id', 'String', '<+input>'],
      ['target_workspace_name', 'String', '<+input>.default(Winter Trinity)'],
      ['workspace_team_id', 'String', '<+input>'],
      ['service_repo_url', 'String', '<+input>'],
      ['governance_group', 'String', '<+input>'],
      ['requester_email', 'String', '<+input>'],
      ['workspace_admin_user_ids', 'String', '<+input>'],
      ['spec_id', 'String', '<+input>'],
      ['baseline_collection_id', 'String', '<+input>'],
      ['smoke_collection_id', 'String', '<+input>'],
      ['contract_collection_id', 'String', '<+input>'],
      ['approve_postman_write', 'String', '<+input>.allowedValues(false,true)'],
    ],
  },
  {
    name: 'Postman - CLI quality gate',
    identifier: 'postman_cli_quality_gate',
    templateIdentifier: 'paypal_postman_cli_quality_gate',
    templatePath: '.harness/templates/paypal-postman-cli-quality-gate-v0.2.0.yaml',
    inputs: [
      [
        'workspace_id',
        'String',
        '<+pipeline.stages.postman_spec_to_postman_onboarding.spec.execution.steps.run_regular_postman_cs_onboarding.output.outputVariables.workspace_id>',
      ],
      [
        'workspace_name',
        'String',
        '<+pipeline.stages.postman_spec_to_postman_onboarding.spec.execution.steps.run_regular_postman_cs_onboarding.output.outputVariables.workspace_name>',
      ],
      ['spec_url', 'String', '<+input>.default(https://raw.githubusercontent.com/paypal/paypal-rest-api-specifications/9f0f52810ae24244ec3f24260c28f58e198d0b9e/openapi/checkout_orders_v2.json)'],
      ['spec_sha256', 'String', '<+input>.default(14db0b9e0d7440e38595b823724599edc7ab8b7a2b41ac442463e81b7d477fd6)'],
      ['smoke_collection_id', 'String', '<+input>'],
      ['contract_collection_id', 'String', '<+input>'],
      [
        'onboarding_collections_json',
        'String',
        '<+pipeline.stages.postman_spec_to_postman_onboarding.spec.execution.steps.run_regular_postman_cs_onboarding.output.outputVariables.collections_json>',
      ],
      ['environment_id', 'String', '<+input>'],
    ],
  },
]);

export function assertProductionSource(source = PRODUCTION_SOURCE) {
  if (source.fullName !== PRODUCTION_SOURCE.fullName || source.branch !== PRODUCTION_SOURCE.branch) {
    throw new Error(`Production source must be ${PRODUCTION_SOURCE.fullName}@${PRODUCTION_SOURCE.branch}.`);
  }
  if (source.owner !== 'postman-cs') {
    throw new Error('Production delivery cannot use a personal namespace or wrapper repository.');
  }
}

export function harnessPipelineUpdate(yaml) {
  if (typeof yaml !== 'string' || !/^pipeline:/m.test(yaml)) {
    throw new Error('Harness pipeline update requires raw pipeline YAML.');
  }
  return {
    method: 'PUT',
    headers: { 'content-type': 'application/yaml' },
    body: yaml,
  };
}

export function assertImmutablePostmanCsActions(stageSources) {
  let count = 0;
  for (const source of stageSources) {
    const uses = [...source.matchAll(/^\s*uses:\s*([^\s#]+)\s*$/gm)].map((match) => match[1]);
    const evidenceRefs = [...source.matchAll(/POSTMAN_HARNESS dependency=(postman-cs\/[A-Za-z0-9._-]+) ref=([^\s']+)/g)]
      .map((match) => `${match[1]}@${match[2]}`);
    for (const reference of [...uses, ...evidenceRefs]) {
      count += 1;
      const match = reference.match(/^(postman-cs\/[A-Za-z0-9._-]+)@(.+)$/);
      const isCommit = match && /^[a-f0-9]{40}$/.test(match[2]);
      const isExactHarnessTag = match && HARNESS_COMPATIBLE_ACTION_REFS[match[1]] === match[2];
      if (!isCommit && !isExactHarnessTag) {
        throw new Error(`Production Action reference must be a direct postman-cs commit or approved exact Harness release tag; received ${reference}.`);
      }
    }
    if (/danielshively-source/.test(source)) {
      throw new Error('Production stages cannot contain a personal wrapper or mutable action reference.');
    }
  }
  if (count === 0) throw new Error('At least one direct locked postman-cs runtime reference is required.');
  return count;
}

export function linkedStage(stage) {
  return {
    stage: {
      name: stage.name,
      identifier: stage.identifier,
      template: {
        templateRef: stage.templateIdentifier,
        versionLabel: REMOTE_TEMPLATE_VERSION,
        templateInputs: {
          type: 'CI',
          variables: stage.inputs.map(([name, type, value]) => ({ name, type, value })),
        },
      },
    },
  };
}

export function isExpectedLinkedStage(item, expected) {
  const stage = item?.stage;
  return stage?.identifier === expected.identifier
    && stage?.template?.templateRef === expected.templateIdentifier
    && stage?.template?.versionLabel === REMOTE_TEMPLATE_VERSION;
}

export function installLinkedStages(pipelineSource, { beforeStage } = {}) {
  const document = parse(pipelineSource);
  if (!document?.pipeline || !Array.isArray(document.pipeline.stages)) {
    throw new Error('Harness YAML must contain pipeline.stages as a list.');
  }

  const stages = document.pipeline.stages;
  const installed = [];
  for (const expected of DELIVERY_STAGES) {
    const matches = stages.filter((item) => item?.stage?.identifier === expected.identifier);
    if (matches.length > 1) throw new Error(`Duplicate stage identifier: ${expected.identifier}.`);
    if (matches.length === 1) {
      if (!isExpectedLinkedStage(matches[0], expected)) {
        throw new Error(`${expected.identifier} already exists but is not the approved linked ${expected.templateIdentifier}@${REMOTE_TEMPLATE_VERSION} template.`);
      }
      installed.push(expected.identifier);
    }
  }

  const missing = DELIVERY_STAGES.filter((stage) => !installed.includes(stage.identifier));
  if (missing.length === 0) {
    return { yaml: pipelineSource, changed: false, installed: [], alreadyPresent: installed };
  }

  let insertionIndex = stages.length;
  if (beforeStage) {
    insertionIndex = stages.findIndex((item) => item?.stage?.identifier === beforeStage);
    if (insertionIndex < 0) throw new Error(`Insertion anchor stage not found: ${beforeStage}.`);
  }
  stages.splice(insertionIndex, 0, ...missing.map(linkedStage));

  return {
    yaml: stringify(document, { lineWidth: 0 }),
    changed: true,
    installed: missing.map((stage) => stage.identifier),
    alreadyPresent: installed,
  };
}

export function pipelineDigest(source) {
  return createHash('sha256').update(source).digest('hex');
}

function collectKeyValues(value, key, results = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeyValues(item, key, results);
  } else if (value && typeof value === 'object') {
    for (const [candidate, nested] of Object.entries(value)) {
      if (candidate === key) results.push(nested);
      collectKeyValues(nested, key, results);
    }
  }
  return results;
}

export function assertConnectorTargetsProductionRepo(response, connectorRef) {
  const urls = [
    ...collectKeyValues(response, 'url'),
    ...collectKeyValues(response, 'validationRepo'),
  ].filter((value) => typeof value === 'string');
  const expected = `https://github.com/${PRODUCTION_SOURCE.fullName}`;
  const exact = urls.some((candidate) => {
    try {
      const url = new URL(candidate);
      const path = url.pathname.replace(/\/+$/, '').replace(/\.git$/, '');
      return url.protocol === 'https:'
        && url.hostname.toLowerCase() === 'github.com'
        && path.toLowerCase() === `/${PRODUCTION_SOURCE.fullName}`;
    } catch {
      return false;
    }
  });
  if (!exact) {
    throw new Error(`Harness connector ${connectorRef} is not pinned to ${expected}.`);
  }
}

export function assertRemoteTemplateMetadata(response, expected, connectorRef) {
  const repos = collectKeyValues(response, 'repoName').filter((value) => typeof value === 'string');
  const connectors = collectKeyValues(response, 'connectorRef').filter((value) => typeof value === 'string');
  const paths = collectKeyValues(response, 'filePath').filter((value) => typeof value === 'string');
  const stores = collectKeyValues(response, 'storeType').filter((value) => typeof value === 'string');
  const branches = collectKeyValues(response, 'branch').filter((value) => typeof value === 'string');
  if (!repos.some((value) => value.toLowerCase() === PRODUCTION_SOURCE.repository || value.toLowerCase() === PRODUCTION_SOURCE.fullName)) {
    throw new Error(`${expected.templateIdentifier} is not backed by ${PRODUCTION_SOURCE.fullName}.`);
  }
  if (!connectors.includes(connectorRef)) {
    throw new Error(`${expected.templateIdentifier} does not use Harness connector ${connectorRef}.`);
  }
  if (!paths.some((value) => value.replace(/^\/+/, '') === expected.templatePath)) {
    throw new Error(`${expected.templateIdentifier} does not resolve from ${expected.templatePath}.`);
  }
  if (!stores.some((value) => value.toUpperCase() === 'REMOTE')) {
    throw new Error(`${expected.templateIdentifier} is not a remote Harness template.`);
  }
  if (branches.length && !branches.includes(PRODUCTION_SOURCE.branch)) {
    throw new Error(`${expected.templateIdentifier} is not sourced from ${PRODUCTION_SOURCE.branch}.`);
  }
}

export function validateGeneratedTemplateCatalog() {
  const generatedIds = REMOTE_TEMPLATES.map((item) => item.identifier).sort();
  const deliveryIds = DELIVERY_STAGES.map((item) => item.templateIdentifier).sort();
  if (JSON.stringify(generatedIds) !== JSON.stringify(deliveryIds)) {
    throw new Error('Remote template generator and installer catalogs have diverged.');
  }
}
