#!/usr/bin/env tsx
import fs from 'node:fs';
import { hostedSecretsManifestPath, loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

const workflowPath = '.github/workflows/gateforge-hosted-staging-strict.yml';
const guidePath = 'gateforge-audit/run-2026-06-23-1035/38_hosted_staging_operator_setup.md';
const workflow = fs.readFileSync(workflowPath, 'utf8');
const guide = fs.readFileSync(guidePath, 'utf8');
const manifest = fs.readFileSync(hostedSecretsManifestPath, 'utf8');
const failures: string[] = [];

function requireContains(label: string, body: string, needle: string) {
  if (!body.includes(needle)) failures.push(`${label} missing ${needle}`);
}

for (const secret of [...attestationSecrets, ...runtimeSecrets]) {
  requireContains(hostedSecretsManifestPath, manifest, `"${secret}"`);
  requireContains(workflowPath, workflow, `${secret}: \${{ secrets.${secret} }}`);
  requireContains(guidePath, guide, `\`${secret}\``);
}

for (const command of [
  'npm run gateforge:hosted-secrets-preflight',
  'npm run gateforge:prepare-hosted-attestation',
  'npm run gateforge:external-check',
  'npm run ci:live',
  'npm run test:pg',
  'npm run deploy:health-gate',
  'npm run deploy:smoke',
  'npm run gateforge:ga-unblock',
  'npm run gateforge:final-gate',
]) {
  requireContains(workflowPath, workflow, command);
}

for (const phrase of [
  'Hosted secrets preflight',
  'Prepare hosted attestation packet',
  'Validate external evidence packet',
  'Hosted live CI',
  'Hosted Postgres tests',
  'GateForge final gate',
]) {
  requireContains(guidePath, guide, phrase);
}

if (failures.length) {
  console.error('GateForge hosted operator drift smoke: FAIL');
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log('GateForge hosted operator drift smoke: PASS');
console.log(`  attestation secrets checked: ${attestationSecrets.length}`);
console.log(`  runtime secrets checked: ${runtimeSecrets.length}`);
