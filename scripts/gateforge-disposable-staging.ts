#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const containerName = process.env.GATEFORGE_PG_CONTAINER || 'fnnlr-gateforge-postgres';
const hostPort = process.env.GATEFORGE_PG_PORT || '55433';
const dbPassword = process.env.GATEFORGE_PG_PASSWORD || 'fnnlr_gateforge_pw';
const controlDb = 'fnnlr_control';
const runDir = path.resolve('gateforge-audit/run-2026-06-23-1035');

function run(label: string, cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env): number {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    encoding: 'utf8',
    env,
  });
  return result.status ?? 1;
}

function capture(cmd: string, args: string[]): { code: number; out: string } {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  return { code: result.status ?? 1, out: [result.stdout, result.stderr].filter(Boolean).join('\n') };
}

function waitForPostgres(): boolean {
  for (let i = 0; i < 45; i += 1) {
    const r = capture('docker', ['exec', containerName, 'pg_isready', '-U', 'postgres', '-d', controlDb]);
    if (r.code === 0) return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  return false;
}

function writeStatus(markdown: string) {
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, '30_disposable_staging_repeatable_run.md'), `${markdown.trim()}\n`);
}

console.log('GateForge disposable staging: starting clean PostgreSQL evidence environment.');

run('remove old disposable container', 'docker', ['rm', '-f', containerName]);
const started = run('start disposable postgres', 'docker', [
  'run',
  '--name', containerName,
  '-e', `POSTGRES_PASSWORD=${dbPassword}`,
  '-e', 'POSTGRES_USER=postgres',
  '-e', `POSTGRES_DB=${controlDb}`,
  '-p', `${hostPort}:5432`,
  '-d',
  'postgres:16-alpine',
]);
if (started !== 0) process.exit(started);

let finalCode = 1;
try {
  if (!waitForPostgres()) {
    console.error('Disposable PostgreSQL did not become ready.');
    process.exit(1);
  }

  const evidenceEnv: NodeJS.ProcessEnv = {
    ...process.env,
    GATEFORGE_EVIDENCE_CONTEXT: 'DISPOSABLE_LOCAL_STAGING_POSTGRES',
    CONTROL_PLANE_DATABASE_URL: `postgres://postgres:${dbPassword}@localhost:${hostPort}/${controlDb}`,
    TENANT_DB_ADMIN_URL: `postgres://postgres:${dbPassword}@localhost:${hostPort}/postgres`,
    TENANT_DB_HOST: 'localhost',
    TENANT_DB_PORT: hostPort,
    TENANT_DB_PREFIX: 'fnnlr_gateforge_tenant',
    TENANT_CREDENTIAL_ENCRYPTION_KEY: 'gateforge-local-disposable-key-32',
    INTEGRATION_ENCRYPTION_KEY: 'gateforge-local-disposable-key-32',
    FNNLR_CRON_SECRET: 'gateforge-local-cron-secret',
    AUTH_MFA_ENCRYPTION_KEY: 'gateforge-local-disposable-key-32',
    FNNLR_AI_TENANT_DAILY_USD_CAP: '25',
    FNNLR_AI_GLOBAL_DAILY_USD_CAP: '100',
    FNNLR_AI_KILL_SWITCH: 'false',
    RESEND_API_KEY: 're_dummy_local_evidence_only',
    EMAIL_FROM: 'noreply@example.test',
    EMAIL_REPLY_TO: 'support@example.test',
    SENTRY_DSN: 'https://public@example.test/1',
    UPTIME_HEALTHCHECK_URL: 'https://status.example.test/health',
    ALERT_EMAIL_TO: 'ops@example.test',
    ALERT_WEBHOOK_URL: 'https://hooks.example.test/fnnlr',
    ANTHROPIC_API_KEY: 'sk-ant-local-evidence-placeholder',
  };

  const migrateCode = run('control migrations', 'npm', ['run', 'migrate:control'], evidenceEnv);
  if (migrateCode !== 0) {
    finalCode = migrateCode;
  } else {
    finalCode = run('gateforge ga unblock evidence', 'npm', ['run', 'gateforge:ga-unblock'], evidenceEnv);
    writeStatus(`
# Repeatable Disposable Staging Run

Status: \`${finalCode === 0 ? 'PASS_WITH_GATE_APPROVAL' : 'EVIDENCE_COLLECTED_GATE_NOT_APPROVED'}\`

Container: \`${containerName}\`

Host port: \`${hostPort}\`

Context: \`DISPOSABLE_LOCAL_STAGING_POSTGRES\`

This command builds a clean PostgreSQL server, applies control-plane migrations, runs the GateForge GA unblock evidence runner, and removes the container after evidence collection.

Expected GateForge interpretation:

- Runtime checks may pass in this disposable context.
- Full GA remains blocked until hosted provider evidence and legal/commercial human attestation are archived.
`);
  }
} finally {
  run('remove disposable postgres', 'docker', ['rm', '-f', containerName]);
}

process.exit(finalCode);
