#!/usr/bin/env tsx
import { hostedSecretsManifestPath, loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

function fail(message: string): never {
  console.error(`GateForge hosted secrets manifest smoke: FAIL - ${message}`);
  process.exit(1);
}

const manifest = loadHostedSecretsManifest();
if (manifest.attestationSecrets.length !== 2) fail(`expected 2 attestation secrets, got ${manifest.attestationSecrets.length}`);
if (manifest.runtimeSecrets.length !== 17) fail(`expected 17 runtime secrets, got ${manifest.runtimeSecrets.length}`);
if (!manifest.attestationSecrets.includes('GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON')) fail('missing JSON attestation secret');
if (!manifest.attestationSecrets.includes('GATEFORGE_HOSTED_STAGING_ATTESTATION_B64')) fail('missing B64 attestation secret');
if (!manifest.runtimeSecrets.includes('CONTROL_PLANE_DATABASE_URL')) fail('missing control plane database secret');
if (!manifest.runtimeSecrets.includes('ANTHROPIC_API_KEY')) fail('missing AI provider secret');

console.log('GateForge hosted secrets manifest smoke: PASS');
console.log(`  manifest: ${hostedSecretsManifestPath}`);
console.log(`  attestation secrets: ${manifest.attestationSecrets.length}`);
console.log(`  runtime secrets: ${manifest.runtimeSecrets.length}`);
