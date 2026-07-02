#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

function fail(message: string, output = ''): never {
  console.error(`GateForge GA unblock status smoke: FAIL - ${message}`);
  if (output) console.error(output);
  process.exit(1);
}

function run(args: string[]) {
  const result = spawnSync('npx', ['tsx', 'scripts/gateforge-ga-unblock-status.ts', ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function fixtureValueFor(name: string): string {
  const values: Record<string, string> = {
    GATEFORGE_HOSTED_STAGING_ATTESTATION_B64: Buffer.from(
      fs.readFileSync('tests/fixtures/gateforge-external-pass.json', 'utf8'),
    ).toString('base64'),
    CONTROL_PLANE_DATABASE_URL: 'postgres://control_user:control_password@db.staging.fnnlr.ai:5432/fnnlr_control?sslmode=require',
    TENANT_DB_ADMIN_URL: 'postgres://tenant_admin:tenant_password@db.staging.fnnlr.ai:5432/postgres?sslmode=require',
    TENANT_DB_HOST: 'db.staging.fnnlr.ai',
    TENANT_CREDENTIAL_ENCRYPTION_KEY: 'tenant-credential-key-fixture-32-plus',
    INTEGRATION_ENCRYPTION_KEY: 'integration-key-fixture-32chars-plus',
    FNNLR_CRON_SECRET: 'cron-secret-fixture-32-characters',
    AUTH_MFA_ENCRYPTION_KEY: 'mfa-encryption-key-fixture-32-plus',
    FNNLR_AI_TENANT_DAILY_USD_CAP: '1',
    FNNLR_AI_GLOBAL_DAILY_USD_CAP: '5',
    SENTRY_DSN: 'https://publickey@o123456.ingest.sentry.io/123456',
    UPTIME_HEALTHCHECK_URL: 'https://staging.fnnlr.ai/health',
    ALERT_EMAIL_TO: 'ops@fnnlr.ai',
    ALERT_WEBHOOK_URL: 'https://hooks.fnnlr.ai/fnnlr-alerts',
    RESEND_API_KEY: 're_fixture_key_1234567890',
    EMAIL_FROM: 'noreply@fnnlr.ai',
    EMAIL_REPLY_TO: 'support@fnnlr.ai',
    ANTHROPIC_API_KEY: 'sk-ant-fixture-key-1234567890abcdef',
  };
  const value = values[name];
  if (!value) fail(`missing fixture value for ${name}`);
  return value;
}

const missingOut = path.join(os.tmpdir(), 'fnnlr-gateforge-unblock-status-missing.md');
const missingJson = path.join(os.tmpdir(), 'fnnlr-gateforge-unblock-status-missing.json');
const missing = run([
  '--dir',
  path.join(os.tmpdir(), 'fnnlr-gateforge-unblock-status-missing-dir'),
  '--from-file',
  'tests/fixtures/gateforge-gh-secrets-b64-only-pass.json',
  '--external-file',
  'tests/fixtures/gateforge-external-pass.json',
  '--out',
  missingOut,
  '--json-out',
  missingJson,
]);
if (missing.status !== 1) fail('missing local evidence should not pass final review', missing.output);
if (!missing.output.includes('GateForge GA unblock status: CANNOT_APPROVE_LOCAL_EVIDENCE')) {
  fail('missing local evidence did not produce CANNOT_APPROVE_LOCAL_EVIDENCE', missing.output);
}

const secretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-unblock-status-ready-'));
fs.writeFileSync(path.join(secretDir, attestationSecrets[1]), fixtureValueFor(attestationSecrets[1]));
for (const name of runtimeSecrets) fs.writeFileSync(path.join(secretDir, name), fixtureValueFor(name));

const readyOut = path.join(os.tmpdir(), 'fnnlr-gateforge-unblock-status-ready.md');
const readyJson = path.join(os.tmpdir(), 'fnnlr-gateforge-unblock-status-ready.json');
const ready = run([
  '--dir',
  secretDir,
  '--from-file',
  'tests/fixtures/gateforge-gh-secrets-b64-only-pass.json',
  '--external-file',
  'tests/fixtures/gateforge-external-pass.json',
  '--out',
  readyOut,
  '--json-out',
  readyJson,
]);
if (ready.status !== 1) fail('fixture mode should stop before final hosted review', ready.output);
if (!ready.output.includes('GateForge GA unblock status: READY_TO_TRIGGER_HOSTED_STRICT')) {
  fail('ready fixture did not produce READY_TO_TRIGGER_HOSTED_STRICT', ready.output);
}

const report = fs.readFileSync(readyOut, 'utf8');
const parsed = JSON.parse(fs.readFileSync(readyJson, 'utf8')) as {
  decision?: { state?: string };
  probes?: {
    externalAttestationContract?: { status?: string };
    remainingExternalBlockerCloseout?: { status?: string };
  };
  blockers?: { openExternalBlockers?: string[] };
  evidenceScope?: {
    localSecretDirectoryMode?: string;
    githubSecretSource?: string;
    externalAttestationPacket?: string;
    externalAttestationContractRequiredForHostedTrigger?: boolean;
    localSecretReadinessIsGaEvidence?: boolean;
    hostedStrictWorkflowRequiredForGa?: boolean;
  };
  safety?: { secretValuesPrinted?: boolean };
};
if (!report.includes('Defensible score band: `74-78/100`')) fail('ready report did not include expected score band');
if (!report.includes('External attestation contract')) fail('ready report did not include external attestation contract probe');
if (!report.includes('Remaining external blocker closeout')) fail('ready report did not include closeout probe');
if (!report.includes('## Remaining External Blocker IDs')) fail('ready report did not include external blocker IDs');
if (!report.includes('## Evidence Scope')) fail('ready report did not include evidence scope');
if (!report.includes('Local secret readiness is GA evidence: `NO`')) fail('ready report did not distinguish local readiness from GA evidence');
if (!report.includes('External attestation contract required for hosted trigger: `YES`')) {
  fail('ready report did not require external attestation contract for hosted trigger');
}
if (parsed.decision?.state !== 'READY_TO_TRIGGER_HOSTED_STRICT') fail('ready JSON did not include expected state');
if (parsed.probes?.externalAttestationContract?.status !== 'PASS') fail('ready JSON did not include passing external attestation contract probe');
if (parsed.probes?.remainingExternalBlockerCloseout?.status !== 'PASS') fail('ready JSON did not include passing closeout probe');
if (parsed.blockers?.openExternalBlockers?.length !== 16) fail('ready JSON did not include 16 external blockers');
if (parsed.evidenceScope?.localSecretDirectoryMode !== 'explicit-dir') fail('ready JSON did not include explicit local secret directory mode');
if (parsed.evidenceScope?.githubSecretSource !== 'fixture-file') fail('ready JSON did not include fixture GitHub secret source');
if (parsed.evidenceScope?.externalAttestationPacket !== 'tests/fixtures/gateforge-external-pass.json') {
  fail('ready JSON did not include external attestation packet source');
}
if (parsed.evidenceScope?.externalAttestationContractRequiredForHostedTrigger !== true) {
  fail('ready JSON did not require external attestation contract for hosted trigger');
}
if (parsed.evidenceScope?.localSecretReadinessIsGaEvidence !== false) fail('ready JSON did not state local secret readiness is not GA evidence');
if (parsed.evidenceScope?.hostedStrictWorkflowRequiredForGa !== true) fail('ready JSON did not require hosted strict workflow for GA');
if (parsed.safety?.secretValuesPrinted !== false) fail('ready JSON did not state secret safety');
if (report.includes('postgres://') || report.includes('sk-ant-fixture') || report.includes(fixtureValueFor(attestationSecrets[1]))) {
  fail('status report leaked fixture secret values');
}

console.log('GateForge GA unblock status smoke: PASS');
