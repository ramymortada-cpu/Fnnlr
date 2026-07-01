#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';
import { validateGateForgeSecretValue } from './gateforge-secret-value-validation.js';

const defaultDir = '/tmp/fnnlr-gateforge-secrets';
const dirIndex = process.argv.indexOf('--dir');
const secretDir = dirIndex >= 0 ? process.argv[dirIndex + 1] : defaultDir;
const envFileIndex = process.argv.indexOf('--env-file');
const requireAll = process.argv.includes('--require-all');

type ParsedSecret = {
  name: string;
  value: string;
  line: number;
};

function fail(message: string): never {
  console.error(`GateForge import local secrets: FAIL - ${message}`);
  console.error('No secret values were printed.');
  process.exit(1);
}

function parseEnvLine(raw: string, line: number): ParsedSecret | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const normalized = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;
  const equalIndex = normalized.indexOf('=');
  if (equalIndex <= 0) fail(`line ${line} is not KEY=VALUE`);
  const name = normalized.slice(0, equalIndex).trim();
  let value = normalized.slice(equalIndex + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (!/^[A-Z][A-Z0-9_]+$/.test(name)) fail(`line ${line} has invalid secret name`);
  return { name, value, line };
}

const envFile = envFileIndex >= 0 ? process.argv[envFileIndex + 1] : '';
if (!envFile) fail('--env-file is required');
if (!fs.existsSync(envFile) || !fs.statSync(envFile).isFile()) fail(`env file does not exist: ${envFile}`);

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();
const requiredSecrets = new Set([...runtimeSecrets]);
const allowedSecrets = new Set([...attestationSecrets, ...runtimeSecrets]);
const parsed = fs
  .readFileSync(envFile, 'utf8')
  .split(/\r?\n/)
  .map((line, index) => parseEnvLine(line, index + 1))
  .filter((entry): entry is ParsedSecret => Boolean(entry));

if (!parsed.length) fail('env file has no secret rows');

const seen = new Set<string>();
const errors: string[] = [];
for (const entry of parsed) {
  if (!allowedSecrets.has(entry.name)) errors.push(`line ${entry.line}: unknown GateForge hosted secret name ${entry.name}`);
  if (seen.has(entry.name)) errors.push(`line ${entry.line}: duplicate secret ${entry.name}`);
  seen.add(entry.name);
  const validation = validateGateForgeSecretValue(entry.name, entry.value);
  if (validation.status !== 'READY') {
    errors.push(`${entry.name}: ${validation.status}${validation.reason ? ` (${validation.reason})` : ''}`);
  }
}

if (requireAll) {
  const missingRequired = [...requiredSecrets].filter((name) => !seen.has(name));
  const hasAttestation = attestationSecrets.some((name) => seen.has(name));
  for (const name of missingRequired) errors.push(`missing required runtime secret ${name}`);
  if (!hasAttestation) errors.push(`missing one attestation secret: ${attestationSecrets.join(' or ')}`);
}

if (errors.length) {
  console.error('GateForge import local secrets: FAIL');
  for (const error of errors) console.error(`  - ${error}`);
  console.error('No secret values were printed.');
  process.exit(1);
}

fs.mkdirSync(secretDir, { recursive: true, mode: 0o700 });
fs.chmodSync(secretDir, 0o700);
for (const entry of parsed) {
  const outFile = path.join(secretDir, entry.name);
  fs.writeFileSync(outFile, `${entry.value.trim()}\n`, { mode: 0o600 });
  fs.chmodSync(outFile, 0o600);
}

console.log('GateForge import local secrets: READY');
console.log(`  directory: ${secretDir}`);
console.log(`  env file: ${envFile}`);
console.log(`  imported secrets: ${parsed.length}`);
console.log(`  require all: ${requireAll ? 'YES' : 'NO'}`);
console.log('  No secret values were printed.');
