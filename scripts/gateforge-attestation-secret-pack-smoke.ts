#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function fail(message: string): never {
  console.error(`GateForge attestation secret pack smoke: FAIL - ${message}`);
  process.exit(1);
}

function run(args: string[]) {
  const result = spawnSync('npx', ['tsx', 'scripts/gateforge-attestation-secret-pack.ts', ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

const secretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-attestation-secret-'));
const blockedOut = path.join(os.tmpdir(), 'fnnlr-gateforge-attestation-blocked.md');
const blockedJsonOut = path.join(os.tmpdir(), 'fnnlr-gateforge-attestation-blocked.json');
const blocked = run([
  '--packet',
  'gateforge-audit/external-attestations/hosted-staging-attestation.template.json',
  '--secret-dir',
  secretDir,
  '--out',
  blockedOut,
  '--json-out',
  blockedJsonOut,
  '--write-b64',
]);
if (blocked.status === 0) fail('template packet unexpectedly passed');
if (!blocked.output.includes('GateForge attestation secret pack: BLOCKED')) fail('blocked case did not print BLOCKED');
if (fs.existsSync(path.join(secretDir, 'GATEFORGE_HOSTED_STAGING_ATTESTATION_B64'))) {
  fail('blocked case wrote B64 secret file');
}
const blockedReport = fs.readFileSync(blockedOut, 'utf8');
const blockedJson = JSON.parse(fs.readFileSync(blockedJsonOut, 'utf8')) as {
  decision?: string;
  b64FileWritten?: boolean;
  safety?: { b64SecretValuePrinted?: boolean; packetBodyPrinted?: boolean };
};
if (!blockedReport.includes('Decision: `BLOCKED`')) fail('blocked report did not record BLOCKED');
if (blockedReport.includes('eyJ')) fail('blocked report leaked base64-looking content');
if (blockedJson.decision !== 'BLOCKED') fail('blocked JSON did not record BLOCKED');
if (blockedJson.b64FileWritten !== false) fail('blocked JSON incorrectly recorded B64 write');
if (blockedJson.safety?.b64SecretValuePrinted !== false || blockedJson.safety.packetBodyPrinted !== false) {
  fail('blocked JSON safety flags are missing');
}

const readyOut = path.join(os.tmpdir(), 'fnnlr-gateforge-attestation-ready.md');
const readyJsonOut = path.join(os.tmpdir(), 'fnnlr-gateforge-attestation-ready.json');
const ready = run([
  '--packet',
  'tests/fixtures/gateforge-external-pass.json',
  '--secret-dir',
  secretDir,
  '--out',
  readyOut,
  '--json-out',
  readyJsonOut,
  '--write-b64',
]);
if (ready.status !== 0) fail(`ready packet failed: ${ready.output}`);
const b64Path = path.join(secretDir, 'GATEFORGE_HOSTED_STAGING_ATTESTATION_B64');
if (!fs.existsSync(b64Path)) fail('ready case did not write B64 secret file');
if (!fs.readFileSync(b64Path, 'utf8').trim()) fail('ready case wrote empty B64 secret file');
const readyReport = fs.readFileSync(readyOut, 'utf8');
const readyJsonText = fs.readFileSync(readyJsonOut, 'utf8');
const readyJson = JSON.parse(readyJsonText) as {
  decision?: string;
  b64FileWritten?: boolean;
  safety?: { b64SecretValuePrinted?: boolean; packetBodyPrinted?: boolean };
};
if (!readyReport.includes('Decision: `READY`')) fail('ready report did not record READY');
if (readyReport.includes(fs.readFileSync(b64Path, 'utf8').trim())) fail('ready report leaked B64 secret value');
if (readyJson.decision !== 'READY') fail('ready JSON did not record READY');
if (readyJson.b64FileWritten !== true) fail('ready JSON did not record B64 write');
if (readyJson.safety?.b64SecretValuePrinted !== false || readyJson.safety.packetBodyPrinted !== false) {
  fail('ready JSON safety flags are missing');
}
if (readyJsonText.includes(fs.readFileSync(b64Path, 'utf8').trim())) fail('ready JSON leaked B64 secret value');

console.log('GateForge attestation secret pack smoke: PASS');
