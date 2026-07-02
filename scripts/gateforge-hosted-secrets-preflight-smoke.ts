#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
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

function run(env: NodeJS.ProcessEnv) {
  const result = spawnSync('npx', ['tsx', 'scripts/gateforge-hosted-secrets-preflight.ts'], {
    env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function fail(message: string): never {
  console.error(`GateForge hosted secrets preflight smoke: FAIL - ${message}`);
  process.exit(1);
}

const cleanEnv = { ...process.env };
for (const name of attestationSecrets) delete cleanEnv[name];
for (const name of runtimeSecrets) delete cleanEnv[name];

const missing = run(cleanEnv);
if (missing.status === 0) fail('missing-secrets case unexpectedly passed');
if (!missing.output.includes('missing one attestation secret')) fail('missing-secrets case did not name attestation requirement');
if (!missing.output.includes('runtime secret CONTROL_PLANE_DATABASE_URL: MISSING')) fail('missing-secrets case did not name runtime requirement');
if (!missing.output.includes('No secret values were printed.')) fail('missing-secrets case did not include no-values assurance');

const passEnv = {
  ...cleanEnv,
  [attestationSecrets[0]]: fixtureValueFor(attestationSecrets[0]),
  ...Object.fromEntries(runtimeSecrets.map((name) => [name, fixtureValueFor(name)])),
};
const passing = run(passEnv);
if (passing.status !== 0) fail(`complete-secrets case failed: ${passing.output}`);
if (!passing.output.includes('GateForge hosted secrets preflight: PASS')) fail('complete-secrets case did not print PASS');
if (!passing.output.includes(`runtime secrets present: ${runtimeSecrets.length}/${runtimeSecrets.length}`)) {
  fail('complete-secrets case did not verify runtime count');
}
if (passing.output.includes('postgres://') || passing.output.includes('sk-ant-fixture')) fail('complete-secrets case leaked fixture values');

const invalidEnv = {
  ...passEnv,
  CONTROL_PLANE_DATABASE_URL: 'https://wrong-protocol.fnnlr.ai',
  GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON: 'not-json',
};
const invalid = run(invalidEnv);
if (invalid.status === 0) fail('invalid-secrets case unexpectedly passed');
if (!invalid.output.includes('runtime secret CONTROL_PLANE_DATABASE_URL: INVALID')) {
  fail('invalid-secrets case did not name invalid runtime secret');
}
if (!invalid.output.includes('attestation secret GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON: INVALID')) {
  fail('invalid-secrets case did not name invalid attestation secret');
}
if (invalid.output.includes('https://wrong-protocol.example.com') || invalid.output.includes('not-json')) {
  fail('invalid-secrets case leaked raw values');
}

const invalidShapeEnv = {
  ...passEnv,
  CONTROL_PLANE_DATABASE_URL: 'postgres://control_user:control_password@db.staging.fnnlr.ai:5432/fnnlr_control',
  TENANT_DB_HOST: 'localhost',
  ANTHROPIC_API_KEY: 'fixture-key-without-provider-prefix',
};
const invalidShape = run(invalidShapeEnv);
if (invalidShape.status === 0) fail('invalid-shape case unexpectedly passed');
if (!invalidShape.output.includes('runtime secret CONTROL_PLANE_DATABASE_URL: INVALID')) {
  fail('invalid-shape case did not reject DB URL without sslmode=require');
}
if (!invalidShape.output.includes('runtime secret TENANT_DB_HOST: INVALID')) {
  fail('invalid-shape case did not reject localhost host');
}
if (!invalidShape.output.includes('runtime secret ANTHROPIC_API_KEY: INVALID')) {
  fail('invalid-shape case did not reject provider key prefix');
}
if (invalidShape.output.includes('fixture-key-without-provider-prefix')) {
  fail('invalid-shape case leaked raw values');
}

console.log('GateForge hosted secrets preflight smoke: PASS');
