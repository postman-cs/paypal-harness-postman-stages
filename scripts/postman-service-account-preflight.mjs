#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PACKAGE = '@postman-cse/onboarding-resolve-service-token@2.0.4';

function redact(value) {
  return String(value || '')
    .replace(/PMAK-[A-Za-z0-9_-]+/g, '[REDACTED_PMAK]')
    .replace(/pma_at_[A-Za-z0-9._-]+/g, '[REDACTED_ACCESS_TOKEN]');
}

export function parseResolvedIdentity(stdout) {
  const result = JSON.parse(stdout);
  if (!result.token || !result['team-id']) {
    throw new Error('The Postman-CS resolver did not return both token and team-id.');
  }
  return { teamId: String(result['team-id']), skipped: String(result.skipped) === 'true' };
}

export function main({ env = process.env } = {}) {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (!Number.isInteger(nodeMajor) || nodeMajor < 24) {
    console.error(`Node 24 or newer is required for ${PACKAGE}; current runtime is ${process.version}.`);
    return 2;
  }
  if (!env.POSTMAN_API_KEY) {
    console.error('Set POSTMAN_API_KEY to a Postman service-account PMAK. Do not pass it as a command-line argument.');
    return 2;
  }
  const region = env.POSTMAN_REGION || 'us';
  const run = spawnSync(
    'npx',
    ['--yes', PACKAGE, '--postman-region', region],
    { env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  if (run.error) {
    console.error(`Could not start the Postman-CS resolver: ${redact(run.error.message)}`);
    return 1;
  }
  if (run.status !== 0) {
    const diagnostic = redact(run.stderr || run.stdout || 'service-account token mint failed').trim();
    console.error(diagnostic);
    return run.status || 1;
  }
  try {
    const identity = parseResolvedIdentity(run.stdout);
    console.log(`Postman service-account preflight passed for team ${identity.teamId}; the short-lived token was discarded.`);
    return 0;
  } catch (error) {
    console.error(redact(error instanceof Error ? error.message : error));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
