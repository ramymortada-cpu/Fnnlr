#!/usr/bin/env tsx
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';
import { validateGateForgeSecretValue } from './gateforge-secret-value-validation.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

const runtimeResults = runtimeSecrets.map((name) => ({ name, ...validateGateForgeSecretValue(name, process.env[name]) }));
const attestationResults = attestationSecrets.map((name) => ({ name, ...validateGateForgeSecretValue(name, process.env[name]) }));
const failedRuntime = runtimeResults.filter((result) => result.status !== 'READY');
const readyAttestation = attestationResults.find((result) => result.status === 'READY');

if (!readyAttestation || failedRuntime.length) {
  console.error('GateForge hosted secrets preflight: FAIL');
  if (!readyAttestation) {
    console.error(`  - missing one attestation secret: ${attestationSecrets.join(' or ')}`);
    for (const result of attestationResults.filter((entry) => entry.status !== 'MISSING')) {
      console.error(`  - attestation secret ${result.name}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
    }
  }
  for (const result of failedRuntime) {
    console.error(`  - runtime secret ${result.name}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
  }
  console.error('No secret values were printed.');
  process.exit(1);
}

console.log('GateForge hosted secrets preflight: PASS');
console.log(`  attestation secret: ${readyAttestation.name}`);
console.log(`  runtime secrets present: ${runtimeSecrets.length}/${runtimeSecrets.length}`);
