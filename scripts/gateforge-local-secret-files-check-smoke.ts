#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

function fixtureValueFor(name: string): string {
  const values: Record<string, string> = {
    GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON: '{"generatedAt":"2026-06-24T00:00:00.000Z","environment":"HOSTED_STAGING","decisionRequested":"CONDITIONAL_GO","items":[{"id":"hosted_staging_gateforge_run","title":"hosted_staging_gateforge_run","status":"PASS","evidenceRefs":["artifact:fixture"],"owner":"Fixture"},{"id":"provider_webhook_replay_idempotency","title":"provider_webhook_replay_idempotency","status":"PASS","evidenceRefs":["artifact:fixture"],"owner":"Fixture"},{"id":"monitoring_alerting_proof","title":"monitoring_alerting_proof","status":"PASS","evidenceRefs":["artifact:fixture"],"owner":"Fixture"},{"id":"hosted_restore_drill","title":"hosted_restore_drill","status":"PASS","evidenceRefs":["artifact:fixture"],"owner":"Fixture"},{"id":"legal_commercial_final_approval","title":"legal_commercial_final_approval","status":"PASS","evidenceRefs":["artifact:fixture"],"owner":"Fixture"},{"id":"admin_mfa_runtime_proof","title":"admin_mfa_runtime_proof","status":"PASS","evidenceRefs":["artifact:fixture"],"owner":"Fixture"},{"id":"ai_budget_runtime_proof","title":"ai_budget_runtime_proof","status":"PASS","evidenceRefs":["artifact:fixture"],"owner":"Fixture"}]}',
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
for (const name of runtimeSecrets) fs.writeFileSync(path.join(placeholderDir, name), fixtureValueFor(name));
fs.writeFileSync(path.join(placeholderDir, 'SENTRY_DSN'), 'REPLACE_WITH_STAGING_SENTRY_DSN');
const placeholder = run(placeholderDir);
if (placeholder.status === 0) fail('placeholder case unexpectedly passed');
if (!placeholder.output.includes('SENTRY_DSN: PLACEHOLDER')) fail('placeholder case did not name placeholder file');

const placeholderJson = spawnSync('npx', ['tsx', 'scripts/gateforge-local-secret-files-check.ts', '--dir', placeholderDir, '--json'], {
  encoding: 'utf8',
  maxBuffer: 1024 * 1024,
});
if (placeholderJson.status === 0) fail('placeholder JSON case unexpectedly passed');
const parsedPlaceholder = JSON.parse(placeholderJson.stdout);
if (parsedPlaceholder.ok !== false) fail('placeholder JSON did not mark ok=false');
if (!parsedPlaceholder.runtime.some((entry: { name: string; status: string }) => entry.name === 'SENTRY_DSN' && entry.status === 'PLACEHOLDER')) {
  fail('placeholder JSON did not include SENTRY_DSN placeholder status');
}

const invalidDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-secret-invalid-'));
fs.writeFileSync(path.join(invalidDir, attestationSecrets[1]), fixtureValueFor(attestationSecrets[1]));
for (const name of runtimeSecrets) fs.writeFileSync(path.join(invalidDir, name), fixtureValueFor(name));
fs.writeFileSync(path.join(invalidDir, 'CONTROL_PLANE_DATABASE_URL'), 'https://not-postgres.example.com');
const invalidJson = spawnSync('npx', ['tsx', 'scripts/gateforge-local-secret-files-check.ts', '--dir', invalidDir, '--json'], {
  encoding: 'utf8',
  maxBuffer: 1024 * 1024,
});
if (invalidJson.status === 0) fail('invalid JSON case unexpectedly passed');
const parsedInvalid = JSON.parse(invalidJson.stdout);
if (
  !parsedInvalid.runtime.some(
    (entry: { name: string; status: string; reason?: string }) =>
      entry.name === 'CONTROL_PLANE_DATABASE_URL' && entry.status === 'INVALID' && entry.reason?.includes('postgres'),
  )
) {
  fail('invalid JSON did not include CONTROL_PLANE_DATABASE_URL invalid reason');
}

const passingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-secret-pass-'));
fs.writeFileSync(path.join(passingDir, attestationSecrets[1]), fixtureValueFor(attestationSecrets[1]));
for (const name of runtimeSecrets) fs.writeFileSync(path.join(passingDir, name), fixtureValueFor(name));
const passing = run(passingDir);
if (passing.status !== 0) fail(`passing case failed: ${passing.output}`);
if (!passing.output.includes('GateForge local secret files check: PASS')) fail('passing case did not print PASS');
if (!passing.output.includes(`runtime files ready: ${runtimeSecrets.length}/${runtimeSecrets.length}`)) {
  fail('passing case did not verify runtime count');
}

console.log('GateForge local secret files check smoke: PASS');
