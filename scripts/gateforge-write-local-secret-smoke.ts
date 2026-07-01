#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function run(args: string[], input?: string) {
  const result = spawnSync('npx', ['tsx', 'scripts/gateforge-write-local-secret.ts', ...args], {
    encoding: 'utf8',
    input,
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function fail(message: string, output = ''): never {
  console.error(`GateForge write local secret smoke: FAIL - ${message}`);
  if (output) console.error(output);
  process.exit(1);
}

const secretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-write-secret-'));
const valueFile = path.join(os.tmpdir(), 'fnnlr-gateforge-control-url.txt');
const controlUrl = 'postgres://control_user:control_password@db.staging.example.com:5432/fnnlr_control?sslmode=require';
fs.writeFileSync(valueFile, controlUrl);

const valid = run(['--dir', secretDir, '--name', 'CONTROL_PLANE_DATABASE_URL', '--value-file', valueFile]);
if (valid.status !== 0) fail('valid secret write should pass', valid.output);
if (!valid.output.includes('GateForge write local secret: READY')) fail('valid write did not report READY', valid.output);
if (!valid.output.includes('No secret values were printed.')) fail('valid write did not include no-values guarantee');
if (valid.output.includes(controlUrl)) fail('valid write leaked secret value');

const written = fs.readFileSync(path.join(secretDir, 'CONTROL_PLANE_DATABASE_URL'), 'utf8').trim();
if (written !== controlUrl) fail('secret file was not written exactly');
const mode = fs.statSync(path.join(secretDir, 'CONTROL_PLANE_DATABASE_URL')).mode & 0o777;
if (mode !== 0o600) fail(`secret file mode should be 0600, got ${mode.toString(8)}`);

const placeholder = run(['--dir', secretDir, '--name', 'TENANT_DB_HOST', '--stdin'], 'REPLACE_WITH_STAGING_TENANT_DB_HOST');
if (placeholder.status === 0) fail('placeholder value should fail validation', placeholder.output);
if (!placeholder.output.includes('TENANT_DB_HOST is PLACEHOLDER')) fail('placeholder failure did not identify placeholder status', placeholder.output);
if (placeholder.output.includes('REPLACE_WITH_STAGING_TENANT_DB_HOST')) fail('placeholder failure leaked placeholder body');

const unknown = run(['--dir', secretDir, '--name', 'NOT_A_SECRET', '--stdin'], 'value');
if (unknown.status === 0) fail('unknown secret should fail validation', unknown.output);
if (!unknown.output.includes('unknown GateForge hosted secret name')) fail('unknown secret failure was unclear', unknown.output);

console.log('GateForge write local secret smoke: PASS');
