#!/usr/bin/env tsx
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const defaultDir = '/tmp/fnnlr-gateforge-secrets';
const dirIndex = process.argv.indexOf('--dir');
const secretDir = dirIndex >= 0 ? process.argv[dirIndex + 1] : defaultDir;
const force = process.argv.includes('--force');
const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

const generatedValues: Record<string, string> = {
  TENANT_CREDENTIAL_ENCRYPTION_KEY: randomSecret(),
  INTEGRATION_ENCRYPTION_KEY: randomSecret(),
  FNNLR_CRON_SECRET: randomSecret(),
  AUTH_MFA_ENCRYPTION_KEY: randomSecret(),
  FNNLR_AI_TENANT_DAILY_USD_CAP: '5',
  FNNLR_AI_GLOBAL_DAILY_USD_CAP: '25',
};

const placeholders: Record<string, string> = {
  GATEFORGE_HOSTED_STAGING_ATTESTATION_B64: 'REPLACE_WITH_BASE64_HOSTED_STAGING_ATTESTATION',
  CONTROL_PLANE_DATABASE_URL: 'REPLACE_WITH_STAGING_CONTROL_PLANE_DATABASE_URL',
  TENANT_DB_ADMIN_URL: 'REPLACE_WITH_STAGING_TENANT_DB_ADMIN_URL',
  TENANT_DB_HOST: 'REPLACE_WITH_STAGING_TENANT_DB_HOST',
  SENTRY_DSN: 'REPLACE_WITH_STAGING_SENTRY_DSN',
  UPTIME_HEALTHCHECK_URL: 'REPLACE_WITH_STAGING_HEALTHCHECK_URL',
  ALERT_EMAIL_TO: 'REPLACE_WITH_STAGING_ALERT_EMAIL',
  ALERT_WEBHOOK_URL: 'REPLACE_WITH_STAGING_ALERT_WEBHOOK_URL',
  RESEND_API_KEY: 'REPLACE_WITH_RESEND_STAGING_KEY',
  EMAIL_FROM: 'REPLACE_WITH_VERIFIED_EMAIL_FROM',
  EMAIL_REPLY_TO: 'REPLACE_WITH_SUPPORT_REPLY_TO',
  ANTHROPIC_API_KEY: 'REPLACE_WITH_ANTHROPIC_STAGING_KEY',
};

fs.mkdirSync(secretDir, { recursive: true, mode: 0o700 });
fs.chmodSync(secretDir, 0o700);

let created = 0;
let preserved = 0;
for (const name of [attestationSecrets[1], ...runtimeSecrets]) {
  const file = path.join(secretDir, name);
  if (fs.existsSync(file) && !force) {
    preserved += 1;
    continue;
  }
  const value = generatedValues[name] ?? placeholders[name];
  if (!value) throw new Error(`no scaffold value configured for ${name}`);
  fs.writeFileSync(file, `${value}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  created += 1;
}

console.log('GateForge local secrets scaffold: complete');
console.log(`  directory: ${secretDir}`);
console.log(`  files written: ${created}`);
console.log(`  files preserved: ${preserved}`);
console.log(`  generated secret files: ${Object.keys(generatedValues).length}`);
console.log('  placeholder files must be replaced before upload.');
console.log('  No secret values were printed.');

function randomSecret(): string {
  return crypto.randomBytes(32).toString('base64');
}
