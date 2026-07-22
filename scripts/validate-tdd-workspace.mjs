import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function argumentsMap(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || argv[index + 1] === undefined) throw new Error('Invalid arguments.');
    values.set(argv[index].slice(2), argv[index + 1]);
  }
  return values;
}

function scalar(value) {
  const trimmed = value.trim().replace(/\s+#.*$/, '').trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseSimpleYamlPaths(source) {
  const values = new Map();
  const stack = [];
  for (const raw of source.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const match = raw.match(/^(\s*)([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (!match) continue;
    const indent = match[1].length;
    while (stack.length && stack.at(-1).indent >= indent) stack.pop();
    const key = match[2];
    const rawValue = match[3];
    const path = [...stack.map((entry) => entry.key), key].join('.');
    if (rawValue) values.set(path, scalar(rawValue));
    else stack.push({ indent, key });
  }
  return values;
}

export function validateTddWorkspace(source, expectedName, expectedId, specOverride = '') {
  const values = parseSimpleYamlPaths(source);
  const configuredName = values.get('tdd.workspace.name') ?? '';
  const configuredId = values.get('tdd.workspace.id') ?? '';
  if (configuredName !== expectedName) {
    throw new Error(`TDD config must use the exact workspace name "${expectedName}".`);
  }
  if (configuredId && configuredId !== expectedId) {
    throw new Error('TDD config workspace ID does not match the CLI-resolved workspace ID.');
  }
  const specPath = specOverride.trim() || values.get('spec.path') || '';
  if (!specPath) throw new Error('No authoritative spec path was supplied or configured.');
  if (specPath.startsWith('/') || specPath.split(/[\\/]/).includes('..')) {
    throw new Error('The authoritative spec path must be repo-relative and may not traverse upward.');
  }
  return { configuredName, configuredId, specPath };
}

function main() {
  const args = argumentsMap(process.argv.slice(2));
  const config = args.get('config');
  const expectedName = args.get('expected-name');
  const expectedId = args.get('expected-id');
  const output = args.get('github-output');
  if (!config || !expectedName || !expectedId || !output) throw new Error('config, expected-name, expected-id, and github-output are required.');
  const result = validateTddWorkspace(readFileSync(config, 'utf8'), expectedName, expectedId, args.get('spec-path') ?? '');
  appendFileSync(output, `spec-path=${result.specPath}\n`, { encoding: 'utf8' });
  console.log(`Verified TDD configuration for ${result.configuredName}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

