#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

function fixtureValueFor(name: string): string {
  const values: Record<string, string> = {
    GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON: '{"hosted_staging_gateforge_run":{"status":"PASS"}}',
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
  CONTROL_PLANE_DATABASE_URL: 'https://wrong-protocol.example.com',
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

console.log('GateForge hosted secrets preflight smoke: PASS');
