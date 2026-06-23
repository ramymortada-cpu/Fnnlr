#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

function run(args: string[]) {
  const result = spawnSync('npx', ['tsx', 'scripts/gateforge-upload-local-secrets.ts', ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function fail(message: string): never {
  console.error(`GateForge upload local secrets smoke: FAIL - ${message}`);
  process.exit(1);
}

const missingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-upload-missing-'));
const missing = run(['--dry-run', '--dir', missingDir]);
if (missing.status === 0) fail('missing folder dry run unexpectedly passed');
if (!missing.output.includes('upload was not attempted')) fail('missing case did not stop before upload');
if (!missing.output.includes('No secret values were printed.')) fail('missing case did not include no-values assurance');

const passingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-upload-pass-'));
fs.writeFileSync(path.join(passingDir, attestationSecrets[1]), 'base64-packet');
for (const name of runtimeSecrets) fs.writeFileSync(path.join(passingDir, name), name.includes('CAP') ? '1' : `value-for-${name}`);

const passing = run(['--dry-run', '--dir', passingDir]);
if (passing.status !== 0) fail(`passing dry run failed: ${passing.output}`);
if (!passing.output.includes('GateForge upload local secrets: DRY_RUN')) fail('passing dry run did not print DRY_RUN');
if (!passing.output.includes(`attestation selected: ${attestationSecrets[1]}`)) fail('passing dry run did not select B64 attestation');
if (!passing.output.includes(`would upload: ${attestationSecrets[1]}`)) fail('passing dry run did not plan attestation upload');
if (!passing.output.includes('would upload: CONTROL_PLANE_DATABASE_URL')) fail('passing dry run did not plan runtime upload');

console.log('GateForge upload local secrets smoke: PASS');
