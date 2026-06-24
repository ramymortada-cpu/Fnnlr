#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

function fixtureValueFor(name: string): string {
  const values: Record<string, string> = {
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

function fail(message: string): never {
  console.error(`GateForge secret replacement packet smoke: FAIL - ${message}`);
  process.exit(1);
}

function run(args: string[]) {
  const result = spawnSync('npx', ['tsx', 'scripts/gateforge-secret-replacement-packet.ts', ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

const placeholderDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-replacement-placeholder-'));
const placeholderOut = path.join(os.tmpdir(), 'fnnlr-gateforge-replacement-placeholder.md');
const placeholderCsv = path.join(os.tmpdir(), 'fnnlr-gateforge-replacement-placeholder.csv');
fs.writeFileSync(path.join(placeholderDir, attestationSecrets[1]), 'REPLACE_WITH_BASE64_HOSTED_STAGING_ATTESTATION');
for (const name of runtimeSecrets) fs.writeFileSync(path.join(placeholderDir, name), fixtureValueFor(name));
fs.writeFileSync(path.join(placeholderDir, 'CONTROL_PLANE_DATABASE_URL'), 'REPLACE_WITH_STAGING_CONTROL_PLANE_DATABASE_URL');

const placeholder = run(['--dir', placeholderDir, '--out', placeholderOut, '--csv-out', placeholderCsv]);
if (placeholder.status === 0) fail('placeholder case unexpectedly passed');
const placeholderReport = fs.readFileSync(placeholderOut, 'utf8');
const placeholderCsvBody = fs.readFileSync(placeholderCsv, 'utf8');
if (!placeholderReport.includes('Status: `REPLACE_LOCAL_SECRET_VALUES`')) fail('placeholder report did not show replacement decision');
if (!placeholderReport.includes('CONTROL_PLANE_DATABASE_URL')) fail('placeholder report did not include placeholder secret name');
if (!placeholderReport.includes('No secret values were printed')) fail('placeholder output guarantee missing from report');
if (placeholderReport.includes('value-for-CONTROL_PLANE_DATABASE_URL')) fail('placeholder report leaked a secret-like value');
if (!placeholderCsvBody.startsWith('secret,kind,status,reason,source,required_action,validation,upload_phase')) fail('CSV header is wrong');

const invalidDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-replacement-invalid-'));
const invalidOut = path.join(os.tmpdir(), 'fnnlr-gateforge-replacement-invalid.md');
const invalidCsv = path.join(os.tmpdir(), 'fnnlr-gateforge-replacement-invalid.csv');
fs.writeFileSync(path.join(invalidDir, attestationSecrets[1]), fixtureValueFor(attestationSecrets[1]));
for (const name of runtimeSecrets) fs.writeFileSync(path.join(invalidDir, name), fixtureValueFor(name));
fs.writeFileSync(path.join(invalidDir, 'TENANT_DB_HOST'), 'postgres://user:pass@db.staging.example.com');
const invalid = run(['--dir', invalidDir, '--out', invalidOut, '--csv-out', invalidCsv]);
if (invalid.status === 0) fail('invalid case unexpectedly passed');
const invalidReport = fs.readFileSync(invalidOut, 'utf8');
if (!invalidReport.includes('`TENANT_DB_HOST` | `runtime` | `INVALID`')) fail('invalid report did not mark TENANT_DB_HOST invalid');
if (!invalidReport.includes('must be a host only')) fail('invalid report did not include sanitized invalid reason');

const passingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-replacement-pass-'));
const passOut = path.join(os.tmpdir(), 'fnnlr-gateforge-replacement-pass.md');
const passCsv = path.join(os.tmpdir(), 'fnnlr-gateforge-replacement-pass.csv');
fs.writeFileSync(path.join(passingDir, attestationSecrets[1]), fixtureValueFor(attestationSecrets[1]));
for (const name of runtimeSecrets) fs.writeFileSync(path.join(passingDir, name), fixtureValueFor(name));

const passing = run(['--dir', passingDir, '--out', passOut, '--csv-out', passCsv]);
if (passing.status !== 0) fail(`passing case failed: ${passing.output}`);
const passingReport = fs.readFileSync(passOut, 'utf8');
if (!passingReport.includes('Status: `READY_FOR_UPLOAD`')) fail('passing report did not show upload-ready decision');
if (!passingReport.includes(`Runtime ready: \`${runtimeSecrets.length}/${runtimeSecrets.length}\``)) fail('passing report did not include runtime count');
if (passingReport.includes('sk-ant-fixture') || passingReport.includes('postgres://')) fail('passing report leaked a secret-like value');

console.log('GateForge secret replacement packet smoke: PASS');
