#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const defaultDir = '/tmp/fnnlr-gateforge-secrets';
const dirArgIndex = process.argv.indexOf('--dir');
const secretDir = dirArgIndex >= 0 ? process.argv[dirArgIndex + 1] : defaultDir;
const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run') || !apply;
const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function fileReady(name: string): boolean {
  const file = path.join(secretDir, name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  return Boolean(fs.readFileSync(file, 'utf8').trim());
}

function fail(message: string): never {
  console.error(`GateForge upload local secrets: FAIL - ${message}`);
  process.exit(1);
}

const validation = run('npx', ['tsx', 'scripts/gateforge-local-secret-files-check.ts', '--dir', secretDir]);
process.stdout.write(validation.output);
if (validation.status !== 0) fail('local secret files are not ready; upload was not attempted');

const attestation = attestationSecrets.find((name) => fileReady(name));
if (!attestation) fail('no ready attestation file after validation');
const uploadNames = [attestation, ...runtimeSecrets];

console.log(`GateForge upload local secrets: ${dryRun ? 'DRY_RUN' : 'APPLY'}`);
console.log(`  directory: ${secretDir}`);
console.log(`  attestation selected: ${attestation}`);
console.log(`  runtime secrets: ${runtimeSecrets.length}/${runtimeSecrets.length}`);
console.log('  No secret values were printed.');

for (const name of uploadNames) {
  const file = path.join(secretDir, name);
  if (dryRun) {
    console.log(`  would upload: ${name} from ${file}`);
    continue;
  }
  const result = run('gh', ['secret', 'set', name, '--body-file', file]);
  if (result.status !== 0) fail(`gh secret set failed for ${name}: ${result.output.trim()}`);
  console.log(`  uploaded: ${name}`);
}

if (dryRun) {
  console.log('GateForge upload local secrets: dry run complete; rerun with --apply to upload.');
} else {
  console.log('GateForge upload local secrets: upload complete; run npm run gateforge:github-secrets-audit next.');
}
