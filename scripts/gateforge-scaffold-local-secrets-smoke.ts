#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();
const secretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-scaffold-'));

function run(args: string[]) {
  const result = spawnSync('npx', ['tsx', 'scripts/gateforge-scaffold-local-secrets.ts', ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function check(args: string[]) {
  const result = spawnSync('npx', ['tsx', 'scripts/gateforge-local-secret-files-check.ts', ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function fail(message: string): never {
  console.error(`GateForge local secrets scaffold smoke: FAIL - ${message}`);
  process.exit(1);
}

const first = run(['--dir', secretDir]);
if (first.status !== 0) fail(first.output);
if (!first.output.includes('files written: 18')) fail('first scaffold did not write the expected 18 files');
if (!fs.existsSync(path.join(secretDir, attestationSecrets[1]))) fail('B64 attestation placeholder was not created');
for (const name of runtimeSecrets) {
  if (!fs.existsSync(path.join(secretDir, name))) fail(`runtime file missing after scaffold: ${name}`);
}

const preservedBefore = fs.readFileSync(path.join(secretDir, 'FNNLR_CRON_SECRET'), 'utf8');
const second = run(['--dir', secretDir]);
if (second.status !== 0) fail(second.output);
if (!second.output.includes('files preserved: 18')) fail('second scaffold did not preserve existing files');
const preservedAfter = fs.readFileSync(path.join(secretDir, 'FNNLR_CRON_SECRET'), 'utf8');
if (preservedBefore !== preservedAfter) fail('scaffold overwrote existing file without --force');

const validation = check(['--dir', secretDir]);
if (validation.status === 0) fail('validator unexpectedly passed with placeholders');
if (!validation.output.includes('GATEFORGE_HOSTED_STAGING_ATTESTATION_B64: PLACEHOLDER')) {
  fail('validator did not flag attestation placeholder');
}
if (!validation.output.includes('CONTROL_PLANE_DATABASE_URL: PLACEHOLDER')) {
  fail('validator did not flag database URL placeholder');
}
if (first.output.includes(preservedBefore.trim())) fail('scaffold output leaked generated secret');

console.log('GateForge local secrets scaffold smoke: PASS');
