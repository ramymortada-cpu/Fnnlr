#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

type EvidenceStatus = 'PASS' | 'FAIL' | 'MISSING' | 'HUMAN_ATTESTATION_REQUIRED';

type EvidenceItem = {
  id: string;
  title: string;
  status: EvidenceStatus;
  evidenceRefs: string[];
  owner: string;
  notes?: string;
};

type EvidencePacket = {
  generatedAt: string;
  environment: 'HOSTED_STAGING' | 'PRODUCTION_READ_ONLY';
  decisionRequested: 'CONDITIONAL_GO' | 'GO';
  items: EvidenceItem[];
};

const packetPath = process.argv[2] || 'gateforge-audit/external-attestations/hosted-staging-attestation.json';
const requiredIds = [
  'hosted_staging_gateforge_run',
  'provider_webhook_replay_idempotency',
  'monitoring_alerting_proof',
  'hosted_restore_drill',
  'legal_commercial_final_approval',
  'admin_mfa_runtime_proof',
  'ai_budget_runtime_proof',
];

function fail(message: string): never {
  console.error(`GateForge external evidence: FAIL — ${message}`);
  process.exit(1);
}

function loadPacket(file: string): EvidencePacket {
  if (!fs.existsSync(file)) fail(`packet not found: ${file}`);
  const raw = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw) as EvidencePacket;
  } catch (e: any) {
    fail(`invalid JSON: ${String(e?.message ?? e)}`);
  }
}

function validateRef(ref: string): boolean {
  if (/secret|password|token|private[_-]?key/i.test(ref)) return false;
  return /^(https:\/\/github\.com\/|gateforge-audit\/|docs\/|artifact:|ticket:|screenshot:|log:)/.test(ref);
}

const packet = loadPacket(packetPath);
const byId = new Map(packet.items.map((item) => [item.id, item]));
const failures: string[] = [];

if (!['HOSTED_STAGING', 'PRODUCTION_READ_ONLY'].includes(packet.environment)) {
  failures.push('environment must be HOSTED_STAGING or PRODUCTION_READ_ONLY');
}

if (!['CONDITIONAL_GO', 'GO'].includes(packet.decisionRequested)) {
  failures.push('decisionRequested must be CONDITIONAL_GO or GO');
}

for (const id of requiredIds) {
  const item = byId.get(id);
  if (!item) {
    failures.push(`${id}: missing item`);
    continue;
  }
  if (item.status !== 'PASS') failures.push(`${id}: status is ${item.status}, expected PASS`);
  if (!item.owner.trim()) failures.push(`${id}: owner missing`);
  if (!item.evidenceRefs.length) failures.push(`${id}: evidenceRefs missing`);
  for (const ref of item.evidenceRefs) {
    if (!validateRef(ref)) failures.push(`${id}: unsafe or unsupported evidence ref "${ref}"`);
  }
}

const extraHuman = packet.items.filter((item) => item.status === 'HUMAN_ATTESTATION_REQUIRED');
for (const item of extraHuman) failures.push(`${item.id}: still HUMAN_ATTESTATION_REQUIRED`);

if (failures.length) {
  console.error('GateForge external evidence: FAIL');
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log('GateForge external evidence: PASS');
console.log(`  packet: ${path.relative(process.cwd(), packetPath)}`);
console.log(`  environment: ${packet.environment}`);
console.log(`  requested decision: ${packet.decisionRequested}`);
console.log(`  evidence items: ${packet.items.length}`);
