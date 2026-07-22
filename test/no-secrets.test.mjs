import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.git' || entry.name === 'node_modules') return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

test('tracked project files contain no recognizable live credential', () => {
  const findings = [];
  for (const file of files(root)) {
    if (!statSync(file).isFile()) continue;
    const source = readFileSync(file, 'utf8');
    if (/PMAK-[A-Za-z0-9_-]{20,}/.test(source)) findings.push(`${file}: PMAK`);
    if (/pat\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9._-]{8,}/.test(source)) findings.push(`${file}: Harness token`);
    if (/lin_api_[A-Za-z0-9]{20,}/.test(source)) findings.push(`${file}: Linear token`);
  }
  assert.deepEqual(findings, []);
});

