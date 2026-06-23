#!/usr/bin/env tsx
const attestationAlternatives = [
  'GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON',
  'GATEFORGE_HOSTED_STAGING_ATTESTATION_B64',
];

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

const missingRuntime = requiredRuntimeSecrets.filter((name) => !process.env[name]?.trim());
const hasAttestation = attestationAlternatives.some((name) => Boolean(process.env[name]?.trim()));

if (!hasAttestation || missingRuntime.length) {
  console.error('GateForge hosted secrets preflight: FAIL');
  if (!hasAttestation) {
    console.error(`  - missing one attestation secret: ${attestationAlternatives.join(' or ')}`);
  }
  for (const name of missingRuntime) console.error(`  - missing runtime secret: ${name}`);
  console.error('No secret values were printed.');
  process.exit(1);
}

console.log('GateForge hosted secrets preflight: PASS');
console.log(`  attestation secret: ${attestationAlternatives.find((name) => Boolean(process.env[name]?.trim()))}`);
console.log(`  runtime secrets present: ${requiredRuntimeSecrets.length}/${requiredRuntimeSecrets.length}`);
