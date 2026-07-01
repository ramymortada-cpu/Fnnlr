#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

function fixtureValueFor(name: string): string {
  const values: Record<string, string> = {
    GATEFORGE_HOSTED_STAGING_ATTESTATION_B64: Buffer.from(
      fs.readFileSync('tests/fixtures/gateforge-external-pass.json', 'utf8'),
    ).toString('base64'),
    CONTROL_PLANE_DATABASE_URL: 'postgres://control_user:control_password@db.staging.example.com:5432/fnnlr_control?sslmode=require',
    TENANT_DB_ADMIN_URL: 'postgres://tenant_admin:tenant_password@db.staging.example.com:5432/postgres?sslmode=require',
    TENANT_DB_HOST: 'db.staging.example.com',
    TENANT_CREDENTIAL_ENCRYPTION_KEY: 'tenant-credential-key-fixture-32',
    INTEGRATION_ENCRYPTION_KEY: 'integration-key-fixture-32chars',
    FNNLR_CRON_SECRET: 'cron-secret-fixture-32-characters',
    AUTH_MFA_ENCRYPTION_KEY: 'mfa-encryption-key-fixture-32',
    FNNLR_AI_TENANT_DAILY_USD_CAP: '1',
    FNNLR_AI_GLOBAL_DAILY_USD_CAP: '5',
    SENTRY_DSN: 'https://public@sentry.example.com/1',
    UPTIME_HEALTHCHECK_URL: 'https://staging.example.com/health',
    ALERT_EMAIL_TO: 'ops@example.com',
    ALERT_WEBHOOK_URL: 'https://hooks.example.com/fnnlr-alerts',
    RESEND_API_KEY: 're_fixture_key_123456',
    EMAIL_FROM: 'noreply@example.com',
    EMAIL_REPLY_TO: 'support@example.com',
    ANTHROPIC_API_KEY: 'sk-ant-fixture-key-123456',
  };
  const value = values[name];
  if (!value) throw new Error(`missing fixture value for ${name}`);
  return value;
}

function run(args: string[]) {
  const result = spawnSync('npx', ['tsx', 'scripts/gateforge-external-blocker-progress.ts', ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function fail(message: string, output = ''): never {
  console.error(`GateForge external blocker progress smoke: FAIL - ${message}`);
  if (output) console.error(output);
  process.exit(1);
}

const readyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-progress-ready-'));
fs.writeFileSync(path.join(readyDir, attestationSecrets[1]), fixtureValueFor(attestationSecrets[1]));
for (const name of runtimeSecrets) fs.writeFileSync(path.join(readyDir, name), fixtureValueFor(name));

const readyMd = path.join(os.tmpdir(), 'fnnlr-gateforge-progress-ready.md');
const readyJson = path.join(os.tmpdir(), 'fnnlr-gateforge-progress-ready.json');
const ready = run([
  '--dir',
  readyDir,
  '--from-file',
  'tests/fixtures/gateforge-gh-secrets-pass.json',
  '--out',
  readyMd,
  '--json-out',
  readyJson,
]);
if (ready.status !== 0) fail('ready fixture should produce progress board', ready.output);
const readyReport = fs.readFileSync(readyMd, 'utf8');
const readyParsed = JSON.parse(fs.readFileSync(readyJson, 'utf8')) as {
  total?: number;
  counts?: { HOSTED_EVIDENCE_PENDING?: number; LOCAL_SECRET_PENDING?: number };
  safety?: { secretValuesPrinted?: boolean };
};
if (readyParsed.total !== 16) fail('ready fixture did not produce 16 rows');
if (readyParsed.counts?.HOSTED_EVIDENCE_PENDING !== 16) fail('ready fixture should put all blockers at hosted evidence pending');
if (readyReport.includes('postgres://') || readyReport.includes('sk-ant-fixture') || readyReport.includes(fixtureValueFor(attestationSecrets[1]))) {
  fail('ready report leaked fixture secret values');
}
if (readyParsed.safety?.secretValuesPrinted !== false) fail('ready JSON did not assert secret safety');

const missingMd = path.join(os.tmpdir(), 'fnnlr-gateforge-progress-missing.md');
const missingJson = path.join(os.tmpdir(), 'fnnlr-gateforge-progress-missing.json');
const missing = run([
  '--dir',
  path.join(os.tmpdir(), 'fnnlr-gateforge-progress-missing-dir'),
  '--from-file',
  'tests/fixtures/gateforge-gh-secrets-pass.json',
  '--out',
  missingMd,
  '--json-out',
  missingJson,
]);
if (missing.status !== 0) fail('missing local secrets should still produce an honest progress board', missing.output);
const missingParsed = JSON.parse(fs.readFileSync(missingJson, 'utf8')) as {
  counts?: { LOCAL_SECRET_PENDING?: number };
};
if (missingParsed.counts?.LOCAL_SECRET_PENDING !== 16) fail('missing fixture should keep all blockers local-secret pending');

console.log('GateForge external blocker progress smoke: PASS');
