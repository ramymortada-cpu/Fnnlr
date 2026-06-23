#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';

const runtimeSummary = 'gateforge-audit/run-2026-06-23-1035/ga-unblock-evidence/summary.json';
const completeExternal = 'tests/fixtures/gateforge-external-pass.json';
const missingExternal = 'gateforge-audit/external-attestations/hosted-staging-attestation.template.json';

const pass = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/gateforge-final-gate.ts', runtimeSummary, completeExternal], { encoding: 'utf8' });
if (pass.status !== 0 || !`${pass.stdout}\n${pass.stderr}`.includes('GateForge final gate: CONDITIONAL_GO')) {
  console.error('Final gate smoke failed: complete external evidence should pass.');
  console.error(pass.stdout);
  console.error(pass.stderr);
  process.exit(1);
}

const fail = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/gateforge-final-gate.ts', runtimeSummary, missingExternal], { encoding: 'utf8' });
if (fail.status === 0 || !`${fail.stdout}\n${fail.stderr}`.includes('GateForge final gate: CANNOT_APPROVE')) {
  console.error('Final gate smoke failed: incomplete external evidence should fail closed.');
  console.error(fail.stdout);
  console.error(fail.stderr);
  process.exit(1);
}

console.log('GateForge final gate smoke: PASS');
