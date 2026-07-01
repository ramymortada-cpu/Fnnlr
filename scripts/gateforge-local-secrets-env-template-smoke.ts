#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function fail(message: string, output = ''): never {
  console.error(`GateForge local secret env template smoke: FAIL - ${message}`);
  if (output) console.error(output);
  process.exit(1);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-env-template-'));
const envOut = path.join(tempDir, 'template.env');
const mdOut = path.join(tempDir, 'template.md');
const result = spawnSync(
  'npx',
  ['tsx', 'scripts/gateforge-local-secrets-env-template.ts', '--out', envOut, '--md-out', mdOut],
  {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  },
);

const output = `${result.stdout || ''}${result.stderr || ''}`;
if ((result.status ?? 1) !== 0) fail('template generator should pass', output);
if (!output.includes('GateForge local secret env template: READY')) fail('missing READY output', output);
if (!output.includes('No secret values were printed.')) fail('missing no-values guarantee', output);
if (!fs.existsSync(envOut)) fail('env template was not written');
if (!fs.existsSync(mdOut)) fail('markdown template was not written');

const envBody = fs.readFileSync(envOut, 'utf8');
const mdBody = fs.readFileSync(mdOut, 'utf8');
for (const name of [
  'CONTROL_PLANE_DATABASE_URL',
  'TENANT_DB_ADMIN_URL',
  'GATEFORGE_HOSTED_STAGING_ATTESTATION_B64',
  'ANTHROPIC_API_KEY',
]) {
  if (!envBody.includes(name)) fail(`env template missing ${name}`);
  if (!mdBody.includes(name)) fail(`markdown template missing ${name}`);
}
if (!envBody.includes('REPLACE_WITH_STAGING_CONTROL_PLANE_DATABASE_URL')) fail('env template missing safe placeholders');
if (!mdBody.includes('gateforge:import-local-secrets')) fail('markdown template missing import command');

const forbidden = /(postgres:\/\/|postgresql:\/\/|sk-[A-Za-z0-9]|re_[A-Za-z0-9]|:\/\/[^\s:]+:[^\s@]+@|BEGIN PRIVATE|password=)/;
if (forbidden.test(envBody)) fail('env template contains a secret-looking value');
if (forbidden.test(mdBody)) fail('markdown template contains a secret-looking value');

console.log('GateForge local secret env template smoke: PASS');
