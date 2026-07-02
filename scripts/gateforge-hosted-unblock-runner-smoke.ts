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

const secretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-hosted-unblock-'));
fs.writeFileSync(path.join(secretDir, attestationSecrets[1]), fixtureValueFor(attestationSecrets[1]));
for (const name of runtimeSecrets) fs.writeFileSync(path.join(secretDir, name), fixtureValueFor(name));

function run(args: string[]) {
  const result = spawnSync('npx', ['tsx', 'scripts/gateforge-hosted-unblock-runner.ts', ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

const preparedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-hosted-unblock-prepared-'));
const preparedReport = path.join(os.tmpdir(), 'fnnlr-gateforge-hosted-unblock-prepared-attestation.md');
for (const name of runtimeSecrets) fs.writeFileSync(path.join(preparedDir, name), fixtureValueFor(name));

const prepared = run([
  '--dry-run',
  '--prepare-attestation',
  '--packet',
  'tests/fixtures/gateforge-external-pass.json',
  '--attestation-pack-out',
  preparedReport,
  '--dir',
  preparedDir,
  '--from-file',
  'tests/fixtures/gateforge-gh-secrets-b64-only-pass.json',
]);

const preparedOutput = prepared.output;
if (prepared.status !== 0) {
  console.error('GateForge hosted unblock runner smoke: FAIL - prepared dry run failed');
  console.error(preparedOutput);
  process.exit(1);
}
if (!preparedOutput.includes('Prepare attestation B64 secret file')) {
  console.error('GateForge hosted unblock runner smoke: FAIL - prepared dry run did not run attestation pack');
  process.exit(1);
}
if (!fs.existsSync(path.join(preparedDir, attestationSecrets[1]))) {
  console.error('GateForge hosted unblock runner smoke: FAIL - prepared dry run did not write B64 attestation file');
  process.exit(1);
}

const result = spawnSync(
  'npx',
  [
    'tsx',
    'scripts/gateforge-hosted-unblock-runner.ts',
    '--dry-run',
    '--dir',
    secretDir,
    '--from-file',
    'tests/fixtures/gateforge-gh-secrets-b64-only-pass.json',
  ],
  {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  },
);

const output = `${result.stdout || ''}${result.stderr || ''}`;

function fail(message: string): never {
  console.error(`GateForge hosted unblock runner smoke: FAIL - ${message}`);
  console.error(output);
  process.exit(1);
}

if ((result.status ?? 1) !== 0) fail('dry run failed');
if (!output.includes('GateForge hosted unblock runner: DRY_RUN')) fail('runner did not print DRY_RUN');
if (!output.includes('GateForge local secret files check: PASS')) fail('runner did not validate local files');
if (!output.includes('GateForge upload local secrets: DRY_RUN')) fail('runner did not plan upload');
if (!output.includes('GateForge hosted strict trigger: DRY_RUN_READY')) fail('runner did not plan strict trigger');
if (!output.includes('dry run complete')) fail('runner did not complete dry run');

console.log('GateForge hosted unblock runner smoke: PASS');
