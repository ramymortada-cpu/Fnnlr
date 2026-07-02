#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function run(args: string[]) {
  const result = spawnSync('npx', ['tsx', 'scripts/gateforge-import-local-secrets.ts', ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function fail(message: string, output = ''): never {
  console.error(`GateForge import local secrets smoke: FAIL - ${message}`);
  if (output) console.error(output);
  process.exit(1);
}

const secretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-import-secret-'));
const envFile = path.join(os.tmpdir(), 'fnnlr-gateforge-import.env');
const controlUrl = 'postgres://control_user:control_password@db.staging.fnnlr.ai:5432/fnnlr_control?sslmode=require';
const tenantHost = 'db.staging.fnnlr.ai';
fs.writeFileSync(
  envFile,
  [
    '# GateForge smoke fixture',
    `CONTROL_PLANE_DATABASE_URL="${controlUrl}"`,
    `TENANT_DB_HOST=${tenantHost}`,
  ].join('\n'),
);

const valid = run(['--dir', secretDir, '--env-file', envFile]);
if (valid.status !== 0) fail('valid env import should pass', valid.output);
if (!valid.output.includes('GateForge import local secrets: READY')) fail('valid import did not report READY', valid.output);
if (!valid.output.includes('No secret values were printed.')) fail('valid import did not include no-values guarantee');
if (valid.output.includes(controlUrl) || valid.output.includes(tenantHost)) fail('valid import leaked a secret value');
if (fs.readFileSync(path.join(secretDir, 'CONTROL_PLANE_DATABASE_URL'), 'utf8').trim() !== controlUrl) {
  fail('control-plane URL was not written exactly');
}
if ((fs.statSync(path.join(secretDir, 'CONTROL_PLANE_DATABASE_URL')).mode & 0o777) !== 0o600) {
  fail('imported secret file mode should be 0600');
}

const placeholderFile = path.join(os.tmpdir(), 'fnnlr-gateforge-import-placeholder.env');
fs.writeFileSync(placeholderFile, 'TENANT_DB_HOST=REPLACE_WITH_STAGING_TENANT_DB_HOST\n');
const placeholder = run(['--dir', secretDir, '--env-file', placeholderFile]);
if (placeholder.status === 0) fail('placeholder import should fail', placeholder.output);
if (!placeholder.output.includes('TENANT_DB_HOST: PLACEHOLDER')) fail('placeholder failure did not report status', placeholder.output);
if (placeholder.output.includes('REPLACE_WITH_STAGING_TENANT_DB_HOST')) fail('placeholder import leaked placeholder value');

const unknownFile = path.join(os.tmpdir(), 'fnnlr-gateforge-import-unknown.env');
fs.writeFileSync(unknownFile, 'NOT_A_SECRET=value\n');
const unknown = run(['--dir', secretDir, '--env-file', unknownFile]);
if (unknown.status === 0) fail('unknown secret import should fail', unknown.output);
if (!unknown.output.includes('unknown GateForge hosted secret name')) fail('unknown failure was unclear', unknown.output);

const requireAll = run(['--dir', secretDir, '--env-file', envFile, '--require-all']);
if (requireAll.status === 0) fail('partial env with --require-all should fail', requireAll.output);
if (!requireAll.output.includes('missing required runtime secret TENANT_DB_ADMIN_URL')) {
  fail('require-all failure did not list missing required runtime secret', requireAll.output);
}

console.log('GateForge import local secrets smoke: PASS');
