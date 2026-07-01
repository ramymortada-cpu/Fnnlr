#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

function fixtureValueFor(name: string): string {
  const values: Record<string, string> = {
    GATEFORGE_HOSTED_STAGING_ATTESTATION_B64: 'eyJnZW5lcmF0ZWRBdCI6IjIwMjYtMDYtMjRUMDA6MDA6MDAuMDAwWiIsImVudmlyb25tZW50IjoiSE9TVEVEX1NUQUdJTkciLCJkZWNpc2lvblJlcXVlc3RlZCI6IkNPTkRJVElPTkFMX0dPIiwiaXRlbXMiOlt7ImlkIjoiaG9zdGVkX3N0YWdpbmdfZ2F0ZWZvcmdlX3J1biIsInRpdGxlIjoiaG9zdGVkX3N0YWdpbmdfZ2F0ZWZvcmdlX3J1biIsInN0YXR1cyI6IlBBU1MiLCJldmlkZW5jZVJlZnMiOlsiYXJ0aWZhY3Q6Zml4dHVyZSJdLCJvd25lciI6IkZpeHR1cmUifSx7ImlkIjoicHJvdmlkZXJfd2ViaG9va19yZXBsYXlfaWRlbXBvdGVuY3kiLCJ0aXRsZSI6InByb3ZpZGVyX3dlYmhvb2tfcmVwbGF5X2lkZW1wb3RlbmN5Iiwic3RhdHVzIjoiUEFTUyIsImV2aWRlbmNlUmVmcyI6WyJhcnRpZmFjdDpmaXh0dXJlIl0sIm93bmVyIjoiRml4dHVyZSJ9LHsiaWQiOiJtb25pdG9yaW5nX2FsZXJ0aW5nX3Byb29mIiwidGl0bGUiOiJtb25pdG9yaW5nX2FsZXJ0aW5nX3Byb29mIiwic3RhdHVzIjoiUEFTUyIsImV2aWRlbmNlUmVmcyI6WyJhcnRpZmFjdDpmaXh0dXJlIl0sIm93bmVyIjoiRml4dHVyZSJ9LHsiaWQiOiJob3N0ZWRfcmVzdG9yZV9kcmlsbCIsInRpdGxlIjoiaG9zdGVkX3Jlc3RvcmVfZHJpbGwiLCJzdGF0dXMiOiJQQVNTIiwiZXZpZGVuY2VSZWZzIjpbImFydGlmYWN0OmZpeHR1cmUiXSwib3duZXIiOiJGaXh0dXJlIn0seyJpZCI6ImxlZ2FsX2NvbW1lcmNpYWxfZmluYWxfYXBwcm92YWwiLCJ0aXRsZSI6ImxlZ2FsX2NvbW1lcmNpYWxfZmluYWxfYXBwcm92YWwiLCJzdGF0dXMiOiJQQVNTIiwiZXZpZGVuY2VSZWZzIjpbImFydGlmYWN0OmZpeHR1cmUiXSwib3duZXIiOiJGaXh0dXJlIn0seyJpZCI6ImFkbWluX21mYV9ydW50aW1lX3Byb29mIiwidGl0bGUiOiJhZG1pbl9tZmFfcnVudGltZV9wcm9vZiIsInN0YXR1cyI6IlBBU1MiLCJldmlkZW5jZVJlZnMiOlsiYXJ0aWZhY3Q6Zml4dHVyZSJdLCJvd25lciI6IkZpeHR1cmUifSx7ImlkIjoiYWlfYnVkZ2V0X3J1bnRpbWVfcHJvb2YiLCJ0aXRsZSI6ImFpX2J1ZGdldF9ydW50aW1lX3Byb29mIiwic3RhdHVzIjoiUEFTUyIsImV2aWRlbmNlUmVmcyI6WyJhcnRpZmFjdDpmaXh0dXJlIl0sIm93bmVyIjoiRml4dHVyZSJ9XX0=',
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

const secretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-doctor-'));
const outPath = path.join(os.tmpdir(), 'fnnlr-gateforge-doctor-smoke.md');
const jsonOutPath = path.join(os.tmpdir(), 'fnnlr-gateforge-doctor-smoke.json');
fs.writeFileSync(path.join(secretDir, attestationSecrets[1]), fixtureValueFor(attestationSecrets[1]));
for (const name of runtimeSecrets) fs.writeFileSync(path.join(secretDir, name), fixtureValueFor(name));

const result = spawnSync(
  'npx',
  [
    'tsx',
    'scripts/gateforge-hosted-readiness-doctor.ts',
    '--dir',
    secretDir,
    '--from-file',
    'tests/fixtures/gateforge-gh-secrets-b64-only-pass.json',
    '--out',
    outPath,
    '--json-out',
    jsonOutPath,
  ],
  {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  },
);

const output = `${result.stdout || ''}${result.stderr || ''}`;
const report = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
const jsonReport = fs.existsSync(jsonOutPath) ? fs.readFileSync(jsonOutPath, 'utf8') : '';

function fail(message: string): never {
  console.error(`GateForge hosted readiness doctor smoke: FAIL - ${message}`);
  console.error(output);
  process.exit(1);
}

if ((result.status ?? 1) !== 1) fail('fixture mode should stop before claiming hosted strict evidence is ready');
if (!output.includes('GateForge hosted readiness doctor: TRIGGER_HOSTED_STRICT')) fail('doctor did not pick trigger next step');
if (!report.includes('| Local secret files | `PASS` |')) fail('report did not mark local secrets PASS');
if (!report.includes('| GitHub secret names | `PASS` |')) fail('report did not mark GitHub secrets PASS');
if (!report.includes('| Remaining external blocker closeout | `PASS` | 16 external blockers are mapped for operator closeout |')) {
  fail('report did not include passing remaining closeout probe');
}
if (!report.includes('## Remaining External Blocker IDs')) fail('report did not list remaining external blocker IDs');
if (!report.includes('- `GF-001`') || !report.includes('- `GF-016`')) fail('report did not include GF-001..GF-016');
if (!report.includes('| Hosted strict workflow | `UNKNOWN` | skipped in fixture mode |')) {
  fail('report did not mark hosted strict workflow fixture skip');
}
if (report.includes('postgres://') || report.includes('sk-ant-fixture') || report.includes(fixtureValueFor(attestationSecrets[1]))) {
  fail('report leaked fixture secret values');
}
if (!jsonReport.includes('"decision": "TRIGGER_HOSTED_STRICT"')) fail('JSON report did not expose the trigger decision');
if (!jsonReport.includes('"status": "PASS"')) fail('JSON report did not expose passing probes');
if (!jsonReport.includes('"secretValuesPrinted": false')) fail('JSON report did not include safety flags');
if (jsonReport.includes('postgres://') || jsonReport.includes('sk-ant-fixture') || jsonReport.includes(fixtureValueFor(attestationSecrets[1]))) {
  fail('JSON report leaked fixture secret values');
}

const placeholderDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-doctor-placeholder-'));
fs.writeFileSync(path.join(placeholderDir, attestationSecrets[1]), 'REPLACE_WITH_BASE64_HOSTED_STAGING_ATTESTATION');
for (const name of runtimeSecrets) fs.writeFileSync(path.join(placeholderDir, name), fixtureValueFor(name));
const placeholderOut = path.join(os.tmpdir(), 'fnnlr-gateforge-doctor-placeholder-smoke.md');
const placeholderResult = spawnSync(
  'npx',
  [
    'tsx',
    'scripts/gateforge-hosted-readiness-doctor.ts',
    '--dir',
    placeholderDir,
    '--from-file',
    'tests/fixtures/gateforge-gh-secrets-b64-only-pass.json',
    '--out',
    placeholderOut,
  ],
  {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  },
);
const placeholderOutput = `${placeholderResult.stdout || ''}${placeholderResult.stderr || ''}`;
const placeholderReport = fs.existsSync(placeholderOut) ? fs.readFileSync(placeholderOut, 'utf8') : '';
if ((placeholderResult.status ?? 1) !== 1) fail('placeholder doctor should fail until placeholders are replaced');
if (!placeholderOutput.includes('GateForge hosted readiness doctor: REPLACE_LOCAL_SECRET_PLACEHOLDERS')) {
  fail('placeholder doctor did not pick placeholder replacement decision');
}
if (!placeholderReport.includes('| Local secret files | `FAIL` | local secret files exist but placeholders remain |')) {
  fail('placeholder doctor report did not explain placeholder state');
}

console.log('GateForge hosted readiness doctor smoke: PASS');
