#!/usr/bin/env tsx
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

const missingRuntime = runtimeSecrets.filter((name) => !process.env[name]?.trim());
const hasAttestation = attestationSecrets.some((name) => Boolean(process.env[name]?.trim()));

if (!hasAttestation || missingRuntime.length) {
  console.error('GateForge hosted secrets preflight: FAIL');
  if (!hasAttestation) {
    console.error(`  - missing one attestation secret: ${attestationSecrets.join(' or ')}`);
  }
  for (const name of missingRuntime) console.error(`  - missing runtime secret: ${name}`);
  console.error('No secret values were printed.');
  process.exit(1);
}

console.log('GateForge hosted secrets preflight: PASS');
console.log(`  attestation secret: ${attestationSecrets.find((name) => Boolean(process.env[name]?.trim()))}`);
console.log(`  runtime secrets present: ${runtimeSecrets.length}/${runtimeSecrets.length}`);
