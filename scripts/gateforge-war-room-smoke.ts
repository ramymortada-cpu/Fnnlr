#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function fail(message: string, output = ''): never {
  console.error(`GateForge war room smoke: FAIL - ${message}`);
  if (output) console.error(output);
  process.exit(1);
}

const completePacket = JSON.parse(fs.readFileSync('tests/fixtures/gateforge-external-pass.json', 'utf8')) as {
  items: { blockerIdsClosed?: string[] }[];
};
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-war-room-'));
const weakPacketPath = path.join(tempDir, 'weak-pass-packet.json');
const runbookOut = path.join(tempDir, 'war-room.md');
const reportOut = path.join(tempDir, 'life-or-death-war-room.md');

fs.writeFileSync(
  weakPacketPath,
  `${JSON.stringify(
    {
      ...completePacket,
      items: completePacket.items.map((item) => ({ ...item, blockerIdsClosed: [] })),
    },
    null,
    2,
  )}\n`,
);

const result = spawnSync(
  'npx',
  [
    'tsx',
    'scripts/gateforge-war-room.ts',
    '--external-file',
    weakPacketPath,
    '--runbook-out',
    runbookOut,
    '--report-out',
    reportOut,
  ],
  {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  },
);
const output = `${result.stdout || ''}${result.stderr || ''}`;
if (result.status !== 0) fail('war-room should write a CANNOT_APPROVE report instead of exiting non-zero', output);

const runbook = fs.readFileSync(runbookOut, 'utf8');
const report = fs.readFileSync(reportOut, 'utf8');
if (!runbook.includes('- Decision: `CANNOT_APPROVE`')) fail('runbook did not fail closed for weak PASS packet');
if (!runbook.includes('External contract: `FAIL`')) fail('runbook did not expose failed external contract');
if (!report.includes('- External contract: `FAIL`')) fail('report did not expose failed external contract');
if (runbook.includes('postgres://') || report.includes('postgres://')) fail('war room leaked secret-like content');

console.log('GateForge war room smoke: PASS');
