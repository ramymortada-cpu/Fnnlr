#!/usr/bin/env tsx
import fs from 'node:fs';
import { hostedSecretsManifestPath, loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

const workflowPath = '.github/workflows/gateforge-hosted-staging-strict.yml';
const gaEvidenceWorkflowPath = '.github/workflows/gateforge-ga-evidence.yml';
const guidePath = 'gateforge-audit/run-2026-06-23-1035/38_hosted_staging_operator_setup.md';
const workflow = fs.readFileSync(workflowPath, 'utf8');
const gaEvidenceWorkflow = fs.readFileSync(gaEvidenceWorkflowPath, 'utf8');
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
  'npm run gateforge:external-closeout-validator',
  'npm run gateforge:hosted-dependency-chain',
  'npm run gateforge:hosted-readiness-contract',
  'npm run gateforge:open-p0-runbook',
  'npm run gateforge:final-gate',
]) {
  requireContains(workflowPath, workflow, command);
}

for (const command of [
  'npm run gateforge:local-secrets-env-template',
  'npm run gateforge:import-local-secrets',
  'npm run gateforge:hosted-readiness-doctor',
]) {
  requireContains(guidePath, guide, command);
}

for (const artifact of ['49_local_secret_env_template.env', '49_local_secret_env_template.md']) {
  requireContains(gaEvidenceWorkflowPath, gaEvidenceWorkflow, artifact);
  requireContains(guidePath, guide, artifact);
}

for (const artifact of [
  '44_hosted_readiness_doctor.md',
  '44_hosted_readiness_doctor.json',
  '52_external_closeout_validator.md',
  '52_external_closeout_validator.json',
  '53_hosted_dependency_chain.md',
  '53_hosted_dependency_chain.json',
  '54_hosted_readiness_contract.md',
  '54_hosted_readiness_contract.json',
  '55_open_p0_terminal_runbook.md',
  '55_open_p0_terminal_runbook.json',
]) {
  requireContains(workflowPath, workflow, artifact);
  requireContains(gaEvidenceWorkflowPath, gaEvidenceWorkflow, artifact);
  requireContains(guidePath, guide, artifact);
}

for (const phrase of [
  'Hosted secrets preflight',
  'Prepare hosted attestation packet',
  'Validate external evidence packet',
  'Hosted live CI',
  'Hosted Postgres tests',
  'GateForge external closeout validator',
  'GateForge hosted dependency chain',
  'GateForge hosted readiness contract',
  'GateForge open P0 terminal runbook',
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
