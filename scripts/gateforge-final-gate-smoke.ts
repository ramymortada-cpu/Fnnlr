#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const runtimeSummary = 'gateforge-audit/run-2026-06-23-1035/ga-unblock-evidence/summary.json';
const completeExternal = 'tests/fixtures/gateforge-external-pass.json';
const missingExternal = 'gateforge-audit/external-attestations/hosted-staging-attestation.template.json';

function runFinalGate(externalPath: string) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/gateforge-final-gate.ts', runtimeSummary, externalPath], {
    encoding: 'utf8',
  });
}

const pass = runFinalGate(completeExternal);
if (pass.status !== 0 || !`${pass.stdout}\n${pass.stderr}`.includes('GateForge final gate: CONDITIONAL_GO')) {
  console.error('Final gate smoke failed: complete external evidence should pass.');
  console.error(pass.stdout);
  console.error(pass.stderr);
  process.exit(1);
}
if (!`${pass.stdout}\n${pass.stderr}`.includes('external blockers explicitly closed: 16/16')) {
  console.error('Final gate smoke failed: complete external evidence should report explicit blocker closures.');
  console.error(pass.stdout);
  console.error(pass.stderr);
  process.exit(1);
}

const fail = runFinalGate(missingExternal);
if (fail.status === 0 || !`${fail.stdout}\n${fail.stderr}`.includes('GateForge final gate: CANNOT_APPROVE')) {
  console.error('Final gate smoke failed: incomplete external evidence should fail closed.');
  console.error(fail.stdout);
  console.error(fail.stderr);
  process.exit(1);
}

const completePacket = JSON.parse(fs.readFileSync(completeExternal, 'utf8')) as {
  items: { id: string; blockerIdsClosed?: string[] }[];
};
const missingEmailPath = path.join(os.tmpdir(), 'fnnlr-final-gate-missing-email.json');
fs.writeFileSync(
  missingEmailPath,
  `${JSON.stringify(
    {
      ...completePacket,
      items: completePacket.items.filter((item) => item.id !== 'email_deliverability_runtime_proof'),
    },
    null,
    2,
  )}\n`,
);
const missingEmail = runFinalGate(missingEmailPath);
if (missingEmail.status === 0 || !`${missingEmail.stdout}\n${missingEmail.stderr}`.includes('external attestation contract failed')) {
  console.error('Final gate smoke failed: missing email runtime proof should fail the external contract.');
  console.error(missingEmail.stdout);
  console.error(missingEmail.stderr);
  process.exit(1);
}

const missingClosurePath = path.join(os.tmpdir(), 'fnnlr-final-gate-missing-closures.json');
fs.writeFileSync(
  missingClosurePath,
  `${JSON.stringify(
    {
      ...completePacket,
      items: completePacket.items.map((item) => ({ ...item, blockerIdsClosed: [] })),
    },
    null,
    2,
  )}\n`,
);
const missingClosure = runFinalGate(missingClosurePath);
if (missingClosure.status === 0 || !`${missingClosure.stdout}\n${missingClosure.stderr}`.includes('external attestation contract failed')) {
  console.error('Final gate smoke failed: missing blocker closure mapping should fail the external contract.');
  console.error(missingClosure.stdout);
  console.error(missingClosure.stderr);
  process.exit(1);
}

console.log('GateForge final gate smoke: PASS');
