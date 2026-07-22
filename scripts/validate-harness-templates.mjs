import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templates = ['harness/pipeline-cloud-vm.yaml', 'harness/pipeline-kubernetes.yaml'];
let failed = false;

for (const relative of templates) {
  const source = readFileSync(resolve(root, relative), 'utf8');
  const checks = [
    [/PMAK-[A-Za-z0-9_-]+/, 'contains a literal Postman API key'],
    [/pat\.[A-Za-z0-9._-]+/, 'contains a literal Harness token'],
    [/@(?:main|master|v\d+(?:\.\d+)*)\b/, 'contains a mutable action reference'],
  ];
  for (const [pattern, message] of checks) {
    if (pattern.test(source)) {
      console.error(`ERROR: ${relative} ${message}.`);
      failed = true;
    }
  }
  if (!source.includes('FULL_40_CHARACTER_COMMIT_SHA')) {
    console.error(`ERROR: ${relative} must make the wrapper commit pin explicit.`);
    failed = true;
  }
}

if (failed) process.exitCode = 1;
else console.log(`Validated ${templates.length} secret-free Harness template(s).`);

