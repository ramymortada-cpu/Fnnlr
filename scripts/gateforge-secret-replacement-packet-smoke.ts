#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

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
for (const name of runtimeSecrets) fs.writeFileSync(path.join(placeholderDir, name), name.includes('CAP') ? '1' : `value-for-${name}`);
fs.writeFileSync(path.join(placeholderDir, 'CONTROL_PLANE_DATABASE_URL'), 'REPLACE_WITH_STAGING_CONTROL_PLANE_DATABASE_URL');

const placeholder = run(['--dir', placeholderDir, '--out', placeholderOut, '--csv-out', placeholderCsv]);
if (placeholder.status === 0) fail('placeholder case unexpectedly passed');
const placeholderReport = fs.readFileSync(placeholderOut, 'utf8');
const placeholderCsvBody = fs.readFileSync(placeholderCsv, 'utf8');
if (!placeholderReport.includes('Status: `REPLACE_LOCAL_SECRET_VALUES`')) fail('placeholder report did not show replacement decision');
if (!placeholderReport.includes('CONTROL_PLANE_DATABASE_URL')) fail('placeholder report did not include placeholder secret name');
if (!placeholderReport.includes('No secret values were printed')) fail('placeholder output guarantee missing from report');
if (placeholderReport.includes('value-for-CONTROL_PLANE_DATABASE_URL')) fail('placeholder report leaked a secret-like value');
if (!placeholderCsvBody.startsWith('secret,kind,status,source,required_action,validation,upload_phase')) fail('CSV header is wrong');

const passingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-replacement-pass-'));
const passOut = path.join(os.tmpdir(), 'fnnlr-gateforge-replacement-pass.md');
const passCsv = path.join(os.tmpdir(), 'fnnlr-gateforge-replacement-pass.csv');
fs.writeFileSync(path.join(passingDir, attestationSecrets[1]), 'base64-packet');
for (const name of runtimeSecrets) fs.writeFileSync(path.join(passingDir, name), name.includes('CAP') ? '1' : `value-for-${name}`);

const passing = run(['--dir', passingDir, '--out', passOut, '--csv-out', passCsv]);
if (passing.status !== 0) fail(`passing case failed: ${passing.output}`);
const passingReport = fs.readFileSync(passOut, 'utf8');
if (!passingReport.includes('Status: `READY_FOR_UPLOAD`')) fail('passing report did not show upload-ready decision');
if (!passingReport.includes(`Runtime ready: \`${runtimeSecrets.length}/${runtimeSecrets.length}\``)) fail('passing report did not include runtime count');
if (passingReport.includes('value-for-ANTHROPIC_API_KEY')) fail('passing report leaked a secret-like value');

console.log('GateForge secret replacement packet smoke: PASS');
