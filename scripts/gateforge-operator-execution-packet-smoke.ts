#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-operator-packet-'));
const outMd = path.join(tempDir, 'operator-packet.md');
const outCsv = path.join(tempDir, 'operator-packet.csv');
const outJson = path.join(tempDir, 'operator-packet.json');

const result = spawnSync(
  'npx',
  ['tsx', 'scripts/gateforge-operator-execution-packet.ts', '--out', outMd, '--csv-out', outCsv, '--json-out', outJson],
  {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  },
);
const output = `${result.stdout || ''}${result.stderr || ''}`;

function fail(message: string): never {
  console.error(`GateForge operator execution packet smoke: FAIL - ${message}`);
  if (output) console.error(output);
  process.exit(1);
}

if ((result.status ?? 1) !== 0) fail('packet generation failed');
if (!fs.existsSync(outMd) || !fs.existsSync(outCsv) || !fs.existsSync(outJson)) fail('packet outputs were not written');

const md = fs.readFileSync(outMd, 'utf8');
const csv = fs.readFileSync(outCsv, 'utf8');
const parsed = JSON.parse(fs.readFileSync(outJson, 'utf8')) as {
  total?: number;
  counts?: { LOCAL_SECRET_PENDING?: number };
  secrets?: unknown[];
  safety?: { secretValuesPrinted?: boolean; productionMutated?: boolean; sourceDumpsIncluded?: boolean };
};

if (parsed.total !== 16) fail('packet does not contain 16 blockers');
if (parsed.counts?.LOCAL_SECRET_PENDING !== 16) fail('packet should preserve current local-secret-pending truth');
if (!Array.isArray(parsed.secrets) || parsed.secrets.length !== 19) fail('packet should list 19 hosted secret file options');
if (parsed.safety?.secretValuesPrinted !== false || parsed.safety?.productionMutated !== false || parsed.safety?.sourceDumpsIncluded !== false) {
  fail('packet safety flags are not all false');
}
if (!md.includes('GateForge Operator Execution Packet')) fail('markdown title missing');
if (!md.includes('npm run gateforge:hosted-unblock -- --apply --prepare-attestation')) fail('operator command path missing');
if (!csv.startsWith('id,status,owner,action,secret_names')) fail('csv header changed unexpectedly');
for (const forbidden of ['postgres://', 'sk-ant-', 're_fixture', 'password@']) {
  if (md.includes(forbidden) || csv.includes(forbidden)) fail(`packet leaked forbidden value fragment: ${forbidden}`);
}

console.log('GateForge operator execution packet smoke: PASS');
