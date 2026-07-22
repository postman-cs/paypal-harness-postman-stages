import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const action = readFileSync(resolve(root, 'action.yml'), 'utf8');
const lock = JSON.parse(readFileSync(resolve(root, 'postman-cs.lock.json'), 'utf8'));

export function parsePostmanUses(source) {
  const uses = [...source.matchAll(/^\s*uses:\s*(postman-cs\/[A-Za-z0-9._-]+)@([^\s#]+)\s*$/gm)];
  const evidence = [...source.matchAll(/POSTMAN_HARNESS dependency=(postman-cs\/[A-Za-z0-9._-]+) ref=([^\s']+)/g)];
  return [...uses, ...evidence].map((match) => ({ repository: match[1], ref: match[2] }));
}

export function verifySupplyChain(source, manifest, options = {}) {
  const {
    requireAllLocks = true,
    requireReference = true,
    sourceLabel = 'action.yml',
  } = options;
  const references = parsePostmanUses(source);
  const errors = [];
  if (requireReference && references.length === 0) {
    errors.push(`${sourceLabel} must directly invoke at least one postman-cs repository.`);
  }
  for (const reference of references) {
    const locked = manifest.dependencies?.[reference.repository];
    if (!locked) errors.push(`${reference.repository} is missing from postman-cs.lock.json.`);
    else if (/^[a-f0-9]{40}$/.test(reference.ref)) {
      if (locked.commit !== reference.ref) errors.push(`${reference.repository} does not match its locked commit.`);
    } else if (!locked.harnessRef || locked.harnessRef !== reference.ref) {
      errors.push(`${reference.repository} is not pinned to its exact Harness-compatible release tag.`);
    } else if (!/^v\d+\.\d+\.\d+$/.test(reference.ref) || !/^[a-f0-9]{40}$/.test(locked.commit)) {
      errors.push(`${reference.repository} Harness tag must be exact and paired with a full locked commit SHA.`);
    }
  }
  if (requireAllLocks) {
    for (const repository of Object.keys(manifest.dependencies ?? {})) {
      if (!references.some((reference) => reference.repository === repository)) {
        errors.push(`${repository} is locked but not directly invoked by ${sourceLabel}.`);
      }
    }
  }
  return { references, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const customerStages = [
    'harness/stages/spec-to-postman-onboarding.yaml',
    'harness/stages/postman-to-git-sync.yaml',
    'harness/stages/runtime-route-discovery.yaml',
  ].map((relative) => readFileSync(resolve(root, relative), 'utf8')).join('\n');
  const result = verifySupplyChain(`${action}\n${customerStages}`, lock, {
    sourceLabel: 'action.yml and the customer stage catalog',
  });
  if (result.errors.length) {
    for (const error of result.errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Verified ${result.references.length} direct Postman-CS action reference(s) at locked commits or exact Harness-compatible release tags.`);
  }
}
