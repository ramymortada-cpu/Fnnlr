#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const defaultDir = '/tmp/fnnlr-gateforge-secrets';
const dirArgIndex = process.argv.indexOf('--dir');
const secretDir = dirArgIndex >= 0 ? process.argv[dirArgIndex + 1] : defaultDir;
const json = process.argv.includes('--json');
const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

type CheckResult = {
  name: string;
  kind: 'runtime' | 'attestation';
  status: 'READY' | 'MISSING' | 'EMPTY' | 'PLACEHOLDER' | 'INVALID';
  reason?: string;
};

function readSecretFile(name: string): string | null {
  const file = path.join(secretDir, name);
  if (!fs.existsSync(file)) return null;
  if (!fs.statSync(file).isFile()) return null;
  return fs.readFileSync(file, 'utf8').trim();
}

function statusFor(name: string, kind: CheckResult['kind']): CheckResult {
  const value = readSecretFile(name);
  if (value === null) return { name, kind, status: 'MISSING' };
  if (!value) return { name, kind, status: 'EMPTY' };
  if (isPlaceholder(value)) return { name, kind, status: 'PLACEHOLDER' };
  const invalidReason = invalidReasonFor(name, value);
  if (invalidReason) return { name, kind, status: 'INVALID', reason: invalidReason };
  return { name, kind, status: 'READY' };
}

function isPlaceholder(value: string): boolean {
  if (value.includes('REPLACE_WITH_')) return true;
  if (value.includes('USER:PASSWORD@HOST')) return true;
  if (value === 'HOST') return true;
  if (value.startsWith('value-for-')) return true;
  if (value.includes('placeholder')) return true;
  return false;
}

function invalidReasonFor(name: string, value: string): string | null {
  if (name === 'GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON') return invalidJsonAttestationReason(value);
  if (name === 'GATEFORGE_HOSTED_STAGING_ATTESTATION_B64') return invalidBase64Reason(value);
  if (name === 'CONTROL_PLANE_DATABASE_URL' || name === 'TENANT_DB_ADMIN_URL') return invalidPostgresUrlReason(value);
  if (name === 'TENANT_DB_HOST') return invalidHostReason(value);
  if (name === 'FNNLR_AI_TENANT_DAILY_USD_CAP' || name === 'FNNLR_AI_GLOBAL_DAILY_USD_CAP') return invalidPositiveNumberReason(value);
  if (name === 'SENTRY_DSN') return invalidHttpsUrlReason(value, 'must be an https DSN');
  if (name === 'UPTIME_HEALTHCHECK_URL' || name === 'ALERT_WEBHOOK_URL') return invalidHttpsUrlReason(value, 'must be an https URL');
  if (name === 'ALERT_EMAIL_TO' || name === 'EMAIL_FROM' || name === 'EMAIL_REPLY_TO') return invalidEmailReason(value);
  if (name === 'RESEND_API_KEY') return value.length < 12 ? 'must be a non-trivial provider API key' : null;
  if (name === 'ANTHROPIC_API_KEY') return value.length < 12 ? 'must be a non-trivial provider API key' : null;
  if (name.endsWith('ENCRYPTION_KEY') || name === 'FNNLR_CRON_SECRET') return value.length < 24 ? 'must be at least 24 characters' : null;
  return null;
}

function invalidJsonAttestationReason(value: string): string | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object') return 'must be a JSON object';
    return null;
  } catch {
    return 'must be valid JSON';
  }
}

function invalidBase64Reason(value: string): string | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return 'must be base64 text';
  if (value.length < 24) return 'must be a non-trivial base64 evidence packet';
  return null;
}

function invalidPostgresUrlReason(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return 'must be a valid postgres URL';
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return 'must use postgres/postgresql protocol';
  if (!parsed.username || !parsed.password || !parsed.hostname) return 'must include username, password, and host';
  return null;
}

function invalidHostReason(value: string): string | null {
  if (value.includes('://') || value.includes('@') || value.includes('/')) return 'must be a host only, without protocol, credentials, or path';
  if (!/^[a-zA-Z0-9.-]+$/.test(value)) return 'must contain only host-safe characters';
  if (!value.includes('.')) return 'must look like a real staging host';
  return null;
}

function invalidPositiveNumberReason(value: string): string | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 'must be a positive number';
  return null;
}

function invalidHttpsUrlReason(value: string, reason: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return reason;
  }
  if (parsed.protocol !== 'https:') return reason;
  if (!parsed.hostname.includes('.')) return reason;
  return null;
}

function invalidEmailReason(value: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'must be a valid email address';
  return null;
}

const attestationResults = attestationSecrets.map((name) => statusFor(name, 'attestation'));
const runtimeResults = runtimeSecrets.map((name) => statusFor(name, 'runtime'));
const readyAttestations = attestationResults.filter((result) => result.status === 'READY');
const failedRuntime = runtimeResults.filter((result) => result.status !== 'READY');
const ok = readyAttestations.length >= 1 && failedRuntime.length === 0;
const summary = {
  ok,
  directory: secretDir,
  attestationReady: readyAttestations.length,
  attestationRequired: 1,
  attestationOptions: attestationResults,
  runtimeReady: runtimeResults.filter((result) => result.status === 'READY').length,
  runtimeRequired: runtimeResults.length,
  runtime: runtimeResults,
};

if (json) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(ok ? 0 : 1);
}

if (!ok) {
  console.error('GateForge local secret files check: FAIL');
  console.error(`  directory: ${secretDir}`);
  if (!readyAttestations.length) {
    console.error(`  - missing one ready attestation file: ${attestationSecrets.join(' or ')}`);
  }
  for (const result of [...attestationResults, ...runtimeResults].filter((entry) => entry.status !== 'READY')) {
    console.error(`  - ${result.name}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
  }
  console.error('No secret values were printed.');
  process.exit(1);
}

console.log('GateForge local secret files check: PASS');
console.log(`  directory: ${secretDir}`);
console.log(`  attestation files ready: ${readyAttestations.length}/${attestationSecrets.length}`);
console.log(`  runtime files ready: ${runtimeSecrets.length}/${runtimeSecrets.length}`);
