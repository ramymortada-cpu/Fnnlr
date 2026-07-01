#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';
import { validateGateForgeSecretValue } from './gateforge-secret-value-validation.js';

const defaultDir = '/tmp/fnnlr-gateforge-secrets';
const dirIndex = process.argv.indexOf('--dir');
const secretDir = dirIndex >= 0 ? process.argv[dirIndex + 1] : defaultDir;
const nameIndex = process.argv.indexOf('--name');
const valueFileIndex = process.argv.indexOf('--value-file');
const valueEnvIndex = process.argv.indexOf('--value-env');
const useStdin = process.argv.includes('--stdin');

function fail(message: string): never {
  console.error(`GateForge write local secret: FAIL - ${message}`);
  console.error('No secret values were printed.');
  process.exit(1);
}

function readStdin(): string {
  return fs.readFileSync(0, 'utf8');
}

function readValue(): string {
  const sources = [valueFileIndex >= 0, valueEnvIndex >= 0, useStdin].filter(Boolean).length;
  if (sources !== 1) fail('provide exactly one of --value-file, --value-env, or --stdin');

  if (valueFileIndex >= 0) {
    const file = process.argv[valueFileIndex + 1];
    if (!file) fail('--value-file requires a path');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(`value file does not exist: ${file}`);
    return fs.readFileSync(file, 'utf8').trim();
  }

  if (valueEnvIndex >= 0) {
    const envName = process.argv[valueEnvIndex + 1];
    if (!envName) fail('--value-env requires an environment variable name');
    const value = process.env[envName];
    if (value === undefined) fail(`environment variable is not set: ${envName}`);
    return value.trim();
  }

  return readStdin().trim();
}

const name = nameIndex >= 0 ? process.argv[nameIndex + 1] : '';
if (!name) fail('--name is required');

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();
const allowedSecrets = new Set([...attestationSecrets, ...runtimeSecrets]);
if (!allowedSecrets.has(name)) fail(`unknown GateForge hosted secret name: ${name}`);

const value = readValue();
const validation = validateGateForgeSecretValue(name, value);
if (validation.status !== 'READY') {
  fail(`${name} is ${validation.status}${validation.reason ? ` (${validation.reason})` : ''}`);
}

fs.mkdirSync(secretDir, { recursive: true, mode: 0o700 });
fs.chmodSync(secretDir, 0o700);
const outFile = path.join(secretDir, name);
fs.writeFileSync(outFile, `${value}\n`, { mode: 0o600 });
fs.chmodSync(outFile, 0o600);

console.log('GateForge write local secret: READY');
console.log(`  directory: ${secretDir}`);
console.log(`  secret: ${name}`);
console.log('  status: READY');
console.log('  No secret values were printed.');
