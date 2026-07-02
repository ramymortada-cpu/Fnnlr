#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

const requiredAttestationItemIds = [
  'hosted_staging_gateforge_run',
  'provider_webhook_replay_idempotency',
  'monitoring_alerting_proof',
  'hosted_restore_drill',
  'email_deliverability_runtime_proof',
  'legal_commercial_final_approval',
  'admin_mfa_runtime_proof',
  'ai_budget_runtime_proof',
];

function fixtureAttestationB64(): string {
  return Buffer.from(
    JSON.stringify({
      generatedAt: '2026-06-24T00:00:00.000Z',
      environment: 'HOSTED_STAGING',
      decisionRequested: 'CONDITIONAL_GO',
      items: requiredAttestationItemIds.map((id) => ({
        id,
        title: id,
        status: 'PASS',
        evidenceRefs: ['artifact:fixture'],
        owner: 'Fixture',
      })),
    }),
    'utf8',
  ).toString('base64');
}

function fixtureValueFor(name: string): string {
  if (name === 'GATEFORGE_HOSTED_STAGING_ATTESTATION_B64') return fixtureAttestationB64();
  const values: Record<string, string> = {
    GATEFORGE_HOSTED_STAGING_ATTESTATION_B64: 'eyJnZW5lcmF0ZWRBdCI6IjIwMjYtMDYtMjRUMDA6MDA6MDAuMDAwWiIsImVudmlyb25tZW50IjoiSE9TVEVEX1NUQUdJTkciLCJkZWNpc2lvblJlcXVlc3RlZCI6IkNPTkRJVElPTkFMX0dPIiwiaXRlbXMiOlt7ImlkIjoiaG9zdGVkX3N0YWdpbmdfZ2F0ZWZvcmdlX3J1biIsInRpdGxlIjoiaG9zdGVkX3N0YWdpbmdfZ2F0ZWZvcmdlX3J1biIsInN0YXR1cyI6IlBBU1MiLCJldmlkZW5jZVJlZnMiOlsiYXJ0aWZhY3Q6Zml4dHVyZSJdLCJvd25lciI6IkZpeHR1cmUifSx7ImlkIjoicHJvdmlkZXJfd2ViaG9va19yZXBsYXlfaWRlbXBvdGVuY3kiLCJ0aXRsZSI6InByb3ZpZGVyX3dlYmhvb2tfcmVwbGF5X2lkZW1wb3RlbmN5Iiwic3RhdHVzIjoiUEFTUyIsImV2aWRlbmNlUmVmcyI6WyJhcnRpZmFjdDpmaXh0dXJlIl0sIm93bmVyIjoiRml4dHVyZSJ9LHsiaWQiOiJtb25pdG9yaW5nX2FsZXJ0aW5nX3Byb29mIiwidGl0bGUiOiJtb25pdG9yaW5nX2FsZXJ0aW5nX3Byb29mIiwic3RhdHVzIjoiUEFTUyIsImV2aWRlbmNlUmVmcyI6WyJhcnRpZmFjdDpmaXh0dXJlIl0sIm93bmVyIjoiRml4dHVyZSJ9LHsiaWQiOiJob3N0ZWRfcmVzdG9yZV9kcmlsbCIsInRpdGxlIjoiaG9zdGVkX3Jlc3RvcmVfZHJpbGwiLCJzdGF0dXMiOiJQQVNTIiwiZXZpZGVuY2VSZWZzIjpbImFydGlmYWN0OmZpeHR1cmUiXSwib3duZXIiOiJGaXh0dXJlIn0seyJpZCI6ImxlZ2FsX2NvbW1lcmNpYWxfZmluYWxfYXBwcm92YWwiLCJ0aXRsZSI6ImxlZ2FsX2NvbW1lcmNpYWxfZmluYWxfYXBwcm92YWwiLCJzdGF0dXMiOiJQQVNTIiwiZXZpZGVuY2VSZWZzIjpbImFydGlmYWN0OmZpeHR1cmUiXSwib3duZXIiOiJGaXh0dXJlIn0seyJpZCI6ImFkbWluX21mYV9ydW50aW1lX3Byb29mIiwidGl0bGUiOiJhZG1pbl9tZmFfcnVudGltZV9wcm9vZiIsInN0YXR1cyI6IlBBU1MiLCJldmlkZW5jZVJlZnMiOlsiYXJ0aWZhY3Q6Zml4dHVyZSJdLCJvd25lciI6IkZpeHR1cmUifSx7ImlkIjoiYWlfYnVkZ2V0X3J1bnRpbWVfcHJvb2YiLCJ0aXRsZSI6ImFpX2J1ZGdldF9ydW50aW1lX3Byb29mIiwic3RhdHVzIjoiUEFTUyIsImV2aWRlbmNlUmVmcyI6WyJhcnRpZmFjdDpmaXh0dXJlIl0sIm93bmVyIjoiRml4dHVyZSJ9XX0=',
    CONTROL_PLANE_DATABASE_URL: 'postgres://control_user:control_password@db.staging.fnnlr.ai:5432/fnnlr_control?sslmode=require',
    TENANT_DB_ADMIN_URL: 'postgres://tenant_admin:tenant_password@db.staging.fnnlr.ai:5432/postgres?sslmode=require',
    TENANT_DB_HOST: 'db.staging.fnnlr.ai',
    TENANT_CREDENTIAL_ENCRYPTION_KEY: 'tenant-credential-key-fixture-32-plus',
    INTEGRATION_ENCRYPTION_KEY: 'integration-key-fixture-32chars-plus',
    FNNLR_CRON_SECRET: 'cron-secret-fixture-32-characters',
    AUTH_MFA_ENCRYPTION_KEY: 'mfa-encryption-key-fixture-32-plus',
    FNNLR_AI_TENANT_DAILY_USD_CAP: '1',
    FNNLR_AI_GLOBAL_DAILY_USD_CAP: '5',
    SENTRY_DSN: 'https://publickey@o123456.ingest.sentry.io/123456',
    UPTIME_HEALTHCHECK_URL: 'https://staging.fnnlr.ai/health',
    ALERT_EMAIL_TO: 'ops@fnnlr.ai',
    ALERT_WEBHOOK_URL: 'https://hooks.fnnlr.ai/fnnlr-alerts',
    RESEND_API_KEY: 're_fixture_key_1234567890',
    EMAIL_FROM: 'noreply@fnnlr.ai',
    EMAIL_REPLY_TO: 'support@fnnlr.ai',
    ANTHROPIC_API_KEY: 'sk-ant-fixture-key-1234567890abcdef',
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
const missingReport = path.join(os.tmpdir(), 'fnnlr-gateforge-upload-missing.md');
const missingJson = path.join(os.tmpdir(), 'fnnlr-gateforge-upload-missing.json');
const missing = run(['--dry-run', '--dir', missingDir, '--report-out', missingReport, '--json-out', missingJson]);
if (missing.status === 0) fail('missing folder dry run unexpectedly passed');
if (!missing.output.includes('upload was not attempted')) fail('missing case did not stop before upload');
if (!missing.output.includes('No secret values were printed.')) fail('missing case did not include no-values assurance');
if (!fs.readFileSync(missingReport, 'utf8').includes('Status: `BLOCKED_LOCAL_SECRET_VALIDATION`')) {
  fail('missing case did not write blocked upload report');
}

const passingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-upload-pass-'));
fs.writeFileSync(path.join(passingDir, attestationSecrets[1]), fixtureValueFor(attestationSecrets[1]));
for (const name of runtimeSecrets) fs.writeFileSync(path.join(passingDir, name), fixtureValueFor(name));

const passingReport = path.join(os.tmpdir(), 'fnnlr-gateforge-upload-pass.md');
const passingJson = path.join(os.tmpdir(), 'fnnlr-gateforge-upload-pass.json');
const passing = run(['--dry-run', '--dir', passingDir, '--report-out', passingReport, '--json-out', passingJson]);
if (passing.status !== 0) fail(`passing dry run failed: ${passing.output}`);
if (!passing.output.includes('GateForge upload local secrets: DRY_RUN')) fail('passing dry run did not print DRY_RUN');
if (!passing.output.includes(`attestation selected: ${attestationSecrets[1]}`)) fail('passing dry run did not select B64 attestation');
if (!passing.output.includes(`would upload: ${attestationSecrets[1]}`)) fail('passing dry run did not plan attestation upload');
if (!passing.output.includes('would upload: CONTROL_PLANE_DATABASE_URL')) fail('passing dry run did not plan runtime upload');
const passingReportText = fs.readFileSync(passingReport, 'utf8');
const passingJsonText = fs.readFileSync(passingJson, 'utf8');
if (!passingReportText.includes('Status: `DRY_RUN_READY`')) fail('passing report did not record DRY_RUN_READY');
if (!passingReportText.includes('| `CONTROL_PLANE_DATABASE_URL` | runtime | `WOULD_UPLOAD` | `PASS` |')) {
  fail('passing report did not include runtime upload row');
}
if (passingReportText.includes(fixtureValueFor('CONTROL_PLANE_DATABASE_URL')) || passingJsonText.includes(fixtureValueFor('CONTROL_PLANE_DATABASE_URL'))) {
  fail('upload report leaked a fixture secret value');
}

console.log('GateForge upload local secrets smoke: PASS');
