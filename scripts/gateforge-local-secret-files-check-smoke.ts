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

function fixtureAttestationJson(): string {
  return JSON.stringify({
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
  });
}

function fixtureValueFor(name: string): string {
  const values: Record<string, string> = {
    GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON: fixtureAttestationJson(),
    GATEFORGE_HOSTED_STAGING_ATTESTATION_B64: Buffer.from(fixtureAttestationJson(), 'utf8').toString('base64'),
    CONTROL_PLANE_DATABASE_URL: 'postgres://control_user:control_password@db.staging.fnnlr.ai:5432/fnnlr_control?sslmode=require',
    TENANT_DB_ADMIN_URL: 'postgres://tenant_admin:tenant_password@db.staging.fnnlr.ai:5432/postgres?sslmode=require',
    TENANT_DB_HOST: 'db.staging.fnnlr.ai',
    TENANT_CREDENTIAL_ENCRYPTION_KEY: 'tenant-credential-key-fixture-32-plus',
    INTEGRATION_ENCRYPTION_KEY: 'integration-key-fixture-32chars-plus',
    FNNLR_CRON_SECRET: 'cron-secret-fixture-32-characters-plus',
    AUTH_MFA_ENCRYPTION_KEY: 'mfa-encryption-key-fixture-32-plus',
    FNNLR_AI_TENANT_DAILY_USD_CAP: '1',
    FNNLR_AI_GLOBAL_DAILY_USD_CAP: '5',
    SENTRY_DSN: 'https://publickey@o123456.ingest.sentry.io/123456',
    UPTIME_HEALTHCHECK_URL: 'https://staging.fnnlr.ai/health',
    ALERT_EMAIL_TO: 'ops@fnnlr.ai',
    ALERT_WEBHOOK_URL: 'https://hooks.fnnlr.ai/fnnlr-alerts',
    RESEND_API_KEY: 're_fixture_key_1234567890',
    EMAIL_FROM: 'Fnnlr Staging <noreply@fnnlr.ai>',
    EMAIL_REPLY_TO: 'support@fnnlr.ai',
    ANTHROPIC_API_KEY: 'sk-ant-fixture-key-1234567890abcdef',
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
fs.writeFileSync(path.join(invalidDir, 'CONTROL_PLANE_DATABASE_URL'), 'https://not-postgres.fnnlr.ai');
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

const invalidShapeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-secret-invalid-shape-'));
fs.writeFileSync(path.join(invalidShapeDir, attestationSecrets[1]), fixtureValueFor(attestationSecrets[1]));
for (const name of runtimeSecrets) fs.writeFileSync(path.join(invalidShapeDir, name), fixtureValueFor(name));
fs.writeFileSync(path.join(invalidShapeDir, 'TENANT_DB_ADMIN_URL'), 'postgres://user:password@localhost:5432/postgres?sslmode=require');
fs.writeFileSync(path.join(invalidShapeDir, 'ANTHROPIC_API_KEY'), 'fixture-key-without-provider-prefix');
fs.writeFileSync(path.join(invalidShapeDir, 'EMAIL_FROM'), 'Fnnlr Staging <noreply@example.com>');
const invalidShapeJson = spawnSync('npx', ['tsx', 'scripts/gateforge-local-secret-files-check.ts', '--dir', invalidShapeDir, '--json'], {
  encoding: 'utf8',
  maxBuffer: 1024 * 1024,
});
if (invalidShapeJson.status === 0) fail('invalid shape JSON case unexpectedly passed');
const parsedInvalidShape = JSON.parse(invalidShapeJson.stdout);
if (
  !parsedInvalidShape.runtime.some(
    (entry: { name: string; status: string; reason?: string }) =>
      entry.name === 'TENANT_DB_ADMIN_URL' && entry.status === 'INVALID' && entry.reason?.includes('hosted staging'),
  )
) {
  fail('invalid shape JSON did not reject localhost tenant DB admin URL');
}
if (
  !parsedInvalidShape.runtime.some(
    (entry: { name: string; status: string; reason?: string }) =>
      entry.name === 'ANTHROPIC_API_KEY' && entry.status === 'INVALID' && entry.reason?.includes('Anthropic'),
  )
) {
  fail('invalid shape JSON did not reject provider key prefix');
}
if (
  !parsedInvalidShape.runtime.some(
    (entry: { name: string; status: string; reason?: string }) =>
      entry.name === 'EMAIL_FROM' && entry.status === 'PLACEHOLDER',
  )
) {
  fail('invalid shape JSON did not reject documentation email domain');
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
