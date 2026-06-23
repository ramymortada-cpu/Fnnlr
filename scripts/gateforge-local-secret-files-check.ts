#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const defaultDir = '/tmp/fnnlr-gateforge-secrets';
const dirArgIndex = process.argv.indexOf('--dir');
const secretDir = dirArgIndex >= 0 ? process.argv[dirArgIndex + 1] : defaultDir;
const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

type CheckResult = {
  name: string;
  kind: 'runtime' | 'attestation';
  status: 'READY' | 'MISSING' | 'EMPTY' | 'PLACEHOLDER';
};

function readSecretFile(name: string): string | null {
  const file = path.join(secretDir, name);
  if (!fs.existsSync(file)) return null;
  if (!fs.statSync(file).isFile()) return null;
  return fs.readFileSync(file, 'utf8').trim();
}

function statusFor(name: string, kind: CheckResult['kind']): CheckResult {
  const value = readSecretFile(name);
  if (value === null) return { name, kind, status: 'MISSING' };
  if (!value) return { name, kind, status: 'EMPTY' };
  if (isPlaceholder(value)) return { name, kind, status: 'PLACEHOLDER' };
  return { name, kind, status: 'READY' };
}

function isPlaceholder(value: string): boolean {
  if (value.includes('REPLACE_WITH_')) return true;
  if (value.includes('USER:PASSWORD@HOST')) return true;
  if (value === 'HOST') return true;
  return false;
}

const attestationResults = attestationSecrets.map((name) => statusFor(name, 'attestation'));
const runtimeResults = runtimeSecrets.map((name) => statusFor(name, 'runtime'));
const readyAttestations = attestationResults.filter((result) => result.status === 'READY');
const failedRuntime = runtimeResults.filter((result) => result.status !== 'READY');
const ok = readyAttestations.length >= 1 && failedRuntime.length === 0;

if (!ok) {
  console.error('GateForge local secret files check: FAIL');
  console.error(`  directory: ${secretDir}`);
  if (!readyAttestations.length) {
    console.error(`  - missing one ready attestation file: ${attestationSecrets.join(' or ')}`);
  }
  for (const result of [...attestationResults, ...runtimeResults].filter((entry) => entry.status !== 'READY')) {
    console.error(`  - ${result.name}: ${result.status}`);
  }
  console.error('No secret values were printed.');
  process.exit(1);
}

console.log('GateForge local secret files check: PASS');
console.log(`  directory: ${secretDir}`);
console.log(`  attestation files ready: ${readyAttestations.length}/${attestationSecrets.length}`);
console.log(`  runtime files ready: ${runtimeSecrets.length}/${runtimeSecrets.length}`);
