#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

function fixtureValueFor(name: string): string {
  const values: Record<string, string> = {
    GATEFORGE_HOSTED_STAGING_ATTESTATION_B64: 'eyJob3N0ZWRfc3RhZ2luZ19nYXRlZm9yZ2VfcnVuIjp7InN0YXR1cyI6IlBBU1MifX0=',
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
fs.writeFileSync(path.join(passingDir, attestationSecrets[1]), fixtureValueFor(attestationSecrets[1]));
for (const name of runtimeSecrets) fs.writeFileSync(path.join(passingDir, name), fixtureValueFor(name));

const passing = run(['--dry-run', '--dir', passingDir]);
if (passing.status !== 0) fail(`passing dry run failed: ${passing.output}`);
if (!passing.output.includes('GateForge upload local secrets: DRY_RUN')) fail('passing dry run did not print DRY_RUN');
if (!passing.output.includes(`attestation selected: ${attestationSecrets[1]}`)) fail('passing dry run did not select B64 attestation');
if (!passing.output.includes(`would upload: ${attestationSecrets[1]}`)) fail('passing dry run did not plan attestation upload');
if (!passing.output.includes('would upload: CONTROL_PLANE_DATABASE_URL')) fail('passing dry run did not plan runtime upload');

console.log('GateForge upload local secrets smoke: PASS');
