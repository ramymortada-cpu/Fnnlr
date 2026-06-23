#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();
const secretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-doctor-'));
const outPath = path.join(os.tmpdir(), 'fnnlr-gateforge-doctor-smoke.md');
fs.writeFileSync(path.join(secretDir, attestationSecrets[1]), 'base64-packet');
for (const name of runtimeSecrets) fs.writeFileSync(path.join(secretDir, name), name.includes('CAP') ? '1' : `value-for-${name}`);

const result = spawnSync(
  'npx',
  [
    'tsx',
    'scripts/gateforge-hosted-readiness-doctor.ts',
    '--dir',
    secretDir,
    '--from-file',
    'tests/fixtures/gateforge-gh-secrets-b64-only-pass.json',
    '--out',
    outPath,
  ],
  {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  },
);

const output = `${result.stdout || ''}${result.stderr || ''}`;
const report = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';

function fail(message: string): never {
  console.error(`GateForge hosted readiness doctor smoke: FAIL - ${message}`);
  console.error(output);
  process.exit(1);
}

if ((result.status ?? 1) !== 1) fail('fixture mode should stop before claiming hosted strict evidence is ready');
if (!output.includes('GateForge hosted readiness doctor: TRIGGER_HOSTED_STRICT')) fail('doctor did not pick trigger next step');
if (!report.includes('| Local secret files | `PASS` |')) fail('report did not mark local secrets PASS');
if (!report.includes('| GitHub secret names | `PASS` |')) fail('report did not mark GitHub secrets PASS');
if (!report.includes('| Hosted strict workflow | `UNKNOWN` | skipped in fixture mode |')) {
  fail('report did not mark hosted strict workflow fixture skip');
}
if (report.includes('value-for-') || report.includes('base64-packet')) fail('report leaked fixture secret values');

console.log('GateForge hosted readiness doctor smoke: PASS');
