#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';

const requiredRuntimeSecrets = [
  'CONTROL_PLANE_DATABASE_URL',
  'TENANT_DB_ADMIN_URL',
  'TENANT_DB_HOST',
  'TENANT_CREDENTIAL_ENCRYPTION_KEY',
  'INTEGRATION_ENCRYPTION_KEY',
  'FNNLR_CRON_SECRET',
  'AUTH_MFA_ENCRYPTION_KEY',
  'FNNLR_AI_TENANT_DAILY_USD_CAP',
  'FNNLR_AI_GLOBAL_DAILY_USD_CAP',
  'SENTRY_DSN',
  'UPTIME_HEALTHCHECK_URL',
  'ALERT_EMAIL_TO',
  'ALERT_WEBHOOK_URL',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'EMAIL_REPLY_TO',
  'ANTHROPIC_API_KEY',
];

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
delete cleanEnv.GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON;
delete cleanEnv.GATEFORGE_HOSTED_STAGING_ATTESTATION_B64;
for (const name of requiredRuntimeSecrets) delete cleanEnv[name];

const missing = run(cleanEnv);
if (missing.status === 0) fail('missing-secrets case unexpectedly passed');
if (!missing.output.includes('missing one attestation secret')) fail('missing-secrets case did not name attestation requirement');
if (!missing.output.includes('missing runtime secret: CONTROL_PLANE_DATABASE_URL')) fail('missing-secrets case did not name runtime requirement');
if (!missing.output.includes('No secret values were printed.')) fail('missing-secrets case did not include no-values assurance');

const passEnv = {
  ...cleanEnv,
  GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON: '{}',
  CONTROL_PLANE_DATABASE_URL: 'dummy',
  TENANT_DB_ADMIN_URL: 'dummy',
  TENANT_DB_HOST: 'dummy',
  TENANT_CREDENTIAL_ENCRYPTION_KEY: 'dummy',
  INTEGRATION_ENCRYPTION_KEY: 'dummy',
  FNNLR_CRON_SECRET: 'dummy',
  AUTH_MFA_ENCRYPTION_KEY: 'dummy',
  FNNLR_AI_TENANT_DAILY_USD_CAP: '1',
  FNNLR_AI_GLOBAL_DAILY_USD_CAP: '1',
  SENTRY_DSN: 'dummy',
  UPTIME_HEALTHCHECK_URL: 'dummy',
  ALERT_EMAIL_TO: 'ops@example.com',
  ALERT_WEBHOOK_URL: 'dummy',
  RESEND_API_KEY: 'dummy',
  EMAIL_FROM: 'ops@example.com',
  EMAIL_REPLY_TO: 'ops@example.com',
  ANTHROPIC_API_KEY: 'dummy',
};
const passing = run(passEnv);
if (passing.status !== 0) fail(`complete-secrets case failed: ${passing.output}`);
if (!passing.output.includes('GateForge hosted secrets preflight: PASS')) fail('complete-secrets case did not print PASS');
if (!passing.output.includes('runtime secrets present: 17/17')) fail('complete-secrets case did not verify runtime count');

console.log('GateForge hosted secrets preflight smoke: PASS');
