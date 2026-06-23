#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

function run(dir: string) {
  const result = spawnSync('npx', ['tsx', 'scripts/gateforge-local-secret-files-check.ts', '--dir', dir], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function fail(message: string): never {
  console.error(`GateForge local secret files check smoke: FAIL - ${message}`);
  process.exit(1);
}

const missingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-secret-missing-'));
const missing = run(missingDir);
if (missing.status === 0) fail('missing folder case unexpectedly passed');
if (!missing.output.includes('missing one ready attestation file')) fail('missing case did not name attestation requirement');
if (!missing.output.includes('CONTROL_PLANE_DATABASE_URL: MISSING')) fail('missing case did not name runtime file');
if (!missing.output.includes('No secret values were printed.')) fail('missing case did not include no-values assurance');

const placeholderDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-secret-placeholder-'));
fs.writeFileSync(path.join(placeholderDir, attestationSecrets[0]), '{}');
for (const name of runtimeSecrets) fs.writeFileSync(path.join(placeholderDir, name), 'ok');
fs.writeFileSync(path.join(placeholderDir, 'SENTRY_DSN'), 'REPLACE_WITH_STAGING_SENTRY_DSN');
const placeholder = run(placeholderDir);
if (placeholder.status === 0) fail('placeholder case unexpectedly passed');
if (!placeholder.output.includes('SENTRY_DSN: PLACEHOLDER')) fail('placeholder case did not name placeholder file');

const passingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-secret-pass-'));
fs.writeFileSync(path.join(passingDir, attestationSecrets[1]), 'base64-packet');
for (const name of runtimeSecrets) fs.writeFileSync(path.join(passingDir, name), name.includes('CAP') ? '1' : `value-for-${name}`);
const passing = run(passingDir);
if (passing.status !== 0) fail(`passing case failed: ${passing.output}`);
if (!passing.output.includes('GateForge local secret files check: PASS')) fail('passing case did not print PASS');
if (!passing.output.includes(`runtime files ready: ${runtimeSecrets.length}/${runtimeSecrets.length}`)) {
  fail('passing case did not verify runtime count');
}

console.log('GateForge local secret files check smoke: PASS');
