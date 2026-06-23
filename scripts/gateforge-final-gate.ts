#!/usr/bin/env tsx
import fs from 'node:fs';

type GateSummary = {
  evidenceContext?: string;
  score?: string;
  results?: { name: string; status: string; evidenceClass: string }[];
};

type ExternalPacket = {
  environment: string;
  decisionRequested: string;
  items: { id: string; status: string; evidenceRefs: string[]; owner: string }[];
};

const defaultSummaryPath = 'gateforge-audit/run-2026-06-23-1035/ga-unblock-evidence/summary.json';
const defaultExternalPath = 'gateforge-audit/external-attestations/hosted-staging-attestation.json';
const summaryPath = process.argv[2] || defaultSummaryPath;
const externalPath = process.argv[3] || defaultExternalPath;

const requiredExternalIds = [
  'hosted_staging_gateforge_run',
  'provider_webhook_replay_idempotency',
  'monitoring_alerting_proof',
  'hosted_restore_drill',
  'legal_commercial_final_approval',
  'admin_mfa_runtime_proof',
  'ai_budget_runtime_proof',
];

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function printBlocked(reason: string, details: string[] = []): never {
  console.log('GateForge final gate: CANNOT_APPROVE');
  console.log(`reason: ${reason}`);
  details.forEach((detail) => console.log(`  - ${detail}`));
  process.exit(1);
}

const summary = readJson<GateSummary>(summaryPath);
if (!summary) printBlocked('runtime summary missing', [summaryPath]);

const runtimeFailures = (summary.results || []).filter((result) => result.status !== 'PASS');
if (runtimeFailures.length) {
  printBlocked('runtime evidence has non-PASS checks', runtimeFailures.map((result) => `${result.name}: ${result.status}`));
}

const external = readJson<ExternalPacket>(externalPath);
if (!external) printBlocked('external attestation packet missing', [externalPath]);

if (external.decisionRequested !== 'CONDITIONAL_GO' && external.decisionRequested !== 'GO') {
  printBlocked('external attestation decision is unsupported', [`decisionRequested=${external.decisionRequested}`]);
}

const byId = new Map(external.items.map((item) => [item.id, item]));
const externalFailures: string[] = [];
for (const id of requiredExternalIds) {
  const item = byId.get(id);
  if (!item) {
    externalFailures.push(`${id}: missing`);
    continue;
  }
  if (item.status !== 'PASS') externalFailures.push(`${id}: ${item.status}`);
  if (!item.evidenceRefs.length) externalFailures.push(`${id}: missing evidenceRefs`);
  if (!item.owner.trim()) externalFailures.push(`${id}: missing owner`);
}

if (externalFailures.length) printBlocked('external attestations incomplete', externalFailures);

console.log('GateForge final gate: CONDITIONAL_GO');
console.log(`runtime context: ${summary.evidenceContext || 'UNKNOWN'}`);
console.log(`score: ${summary.score || 'NOT_RECOMPUTED'}`);
console.log(`external environment: ${external.environment}`);
console.log(`external evidence items: ${external.items.length}`);
