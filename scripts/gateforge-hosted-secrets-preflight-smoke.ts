#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

function run(env: NodeJS.ProcessEnv) {
  const result = spawnSync('npx', ['tsx', 'scripts/gateforge-hosted-secrets-preflight.ts'], {
    env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function fail(message: string): never {
  console.error(`GateForge hosted secrets preflight smoke: FAIL - ${message}`);
  process.exit(1);
}

const cleanEnv = { ...process.env };
for (const name of attestationSecrets) delete cleanEnv[name];
for (const name of runtimeSecrets) delete cleanEnv[name];

const missing = run(cleanEnv);
if (missing.status === 0) fail('missing-secrets case unexpectedly passed');
if (!missing.output.includes('missing one attestation secret')) fail('missing-secrets case did not name attestation requirement');
if (!missing.output.includes('missing runtime secret: CONTROL_PLANE_DATABASE_URL')) fail('missing-secrets case did not name runtime requirement');
if (!missing.output.includes('No secret values were printed.')) fail('missing-secrets case did not include no-values assurance');

const passEnv = {
  ...cleanEnv,
  [attestationSecrets[0]]: '{}',
  ...Object.fromEntries(runtimeSecrets.map((name) => [name, name.includes('CAP') ? '1' : 'dummy'])),
};
const passing = run(passEnv);
if (passing.status !== 0) fail(`complete-secrets case failed: ${passing.output}`);
if (!passing.output.includes('GateForge hosted secrets preflight: PASS')) fail('complete-secrets case did not print PASS');
if (!passing.output.includes(`runtime secrets present: ${runtimeSecrets.length}/${runtimeSecrets.length}`)) {
  fail('complete-secrets case did not verify runtime count');
}

console.log('GateForge hosted secrets preflight smoke: PASS');
