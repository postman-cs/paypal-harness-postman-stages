import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function argumentsMap(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${key ?? '(end)'}.`);
    values.set(key.slice(2), value);
  }
  return values;
}

function textValue(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

export function workspaceCandidates(value, output = []) {
  if (Array.isArray(value)) {
    for (const entry of value) workspaceCandidates(entry, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  const name = textValue(value, ['name', 'title', 'displayName']);
  const id = textValue(value, ['id', 'workspaceId', 'uid']);
  if (name && id) output.push({ name, id });
  for (const entry of Object.values(value)) workspaceCandidates(entry, output);
  return output;
}

export function resolveWorkspace(searchJson, expectedName, expectedId = '') {
  const exactName = expectedName.trim();
  if (!exactName) throw new Error('Expected workspace name is required.');
  const exact = workspaceCandidates(searchJson)
    .filter((candidate) => candidate.name === exactName);
  const unique = [...new Map(exact.map((candidate) => [candidate.id, candidate])).values()];
  if (unique.length === 0) throw new Error(`No exact workspace named "${expectedName}" is visible to the Postman CLI.`);
  if (expectedId.trim()) {
    const identified = unique.filter((candidate) => candidate.id === expectedId.trim());
    if (identified.length !== 1) throw new Error('The exact workspace name did not resolve to the expected workspace ID.');
    return identified[0];
  }
  if (unique.length > 1) throw new Error(`Multiple exact workspaces named "${expectedName}" are visible; provide the expected workspace ID.`);
  return unique[0];
}

function main() {
  const args = argumentsMap(process.argv.slice(2));
  const input = args.get('input');
  const expectedName = args.get('expected-name');
  const expectedId = args.get('expected-id') ?? '';
  const output = args.get('github-output');
  if (!input || !expectedName || !output) throw new Error('input, expected-name, and github-output are required.');
  const match = resolveWorkspace(JSON.parse(readFileSync(input, 'utf8')), expectedName, expectedId);
  appendFileSync(output, `workspace-id=${match.id}\nworkspace-name=${match.name}\n`, { encoding: 'utf8' });
  console.log(`Resolved the exact approved test workspace: ${match.name}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
