#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();
const secretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-hosted-unblock-'));
fs.writeFileSync(path.join(secretDir, attestationSecrets[1]), 'base64-packet');
for (const name of runtimeSecrets) fs.writeFileSync(path.join(secretDir, name), name.includes('CAP') ? '1' : `value-for-${name}`);

const result = spawnSync(
  'npx',
  [
    'tsx',
    'scripts/gateforge-hosted-unblock-runner.ts',
    '--dry-run',
    '--dir',
    secretDir,
    '--from-file',
    'tests/fixtures/gateforge-gh-secrets-b64-only-pass.json',
  ],
  {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  },
);

const output = `${result.stdout || ''}${result.stderr || ''}`;

function fail(message: string): never {
  console.error(`GateForge hosted unblock runner smoke: FAIL - ${message}`);
  console.error(output);
  process.exit(1);
}

if ((result.status ?? 1) !== 0) fail('dry run failed');
if (!output.includes('GateForge hosted unblock runner: DRY_RUN')) fail('runner did not print DRY_RUN');
if (!output.includes('GateForge local secret files check: PASS')) fail('runner did not validate local files');
if (!output.includes('GateForge upload local secrets: DRY_RUN')) fail('runner did not plan upload');
if (!output.includes('GateForge hosted strict trigger: DRY_RUN_READY')) fail('runner did not plan strict trigger');
if (!output.includes('dry run complete')) fail('runner did not complete dry run');

console.log('GateForge hosted unblock runner smoke: PASS');
