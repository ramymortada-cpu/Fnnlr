#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

type EvidenceStatus = 'PASS' | 'FAIL' | 'MISSING' | 'HUMAN_ATTESTATION_REQUIRED';

type EvidenceItem = {
  id: string;
  title: string;
  status: EvidenceStatus;
  evidenceRefs: string[];
  owner: string;
  notes?: string;
  blockerIdsClosed?: string[];
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
  'email_deliverability_runtime_proof',
  'legal_commercial_final_approval',
  'admin_mfa_runtime_proof',
  'ai_budget_runtime_proof',
];
const requiredBlockerIds = Array.from({ length: 16 }, (_, index) => `GF-${String(index + 1).padStart(3, '0')}`);
const requiredEvidenceRefPatterns: Record<string, RegExp[]> = {
  hosted_staging_gateforge_run: [
    /^https:\/\/github\.com\/ramymortada-cpu\/Fnnlr\/actions\/runs\/[0-9]+$/,
    /^artifact:hosted-staging-ga-evidence-summary$/,
  ],
  provider_webhook_replay_idempotency: [
    /^artifact:provider-webhook-replay-proof$/,
    /^log:webhook-replay-idempotency-pass$/,
  ],
  monitoring_alerting_proof: [
    /^screenshot:sentry-test-alert$/,
    /^screenshot:uptime-health-check$/,
    /^artifact:alert-delivery-proof$/,
  ],
  hosted_restore_drill: [/^artifact:hosted-restore-verify-pass$/, /^log:deploy-verify-restore-pass$/],
  email_deliverability_runtime_proof: [
    /^artifact:email-deliverability-provider-test$/,
    /^screenshot:spf-dkim-dmarc-verified$/,
  ],
  legal_commercial_final_approval: [/^docs\/LEGAL_READINESS_STATUS\.md$/, /^ticket:legal-final-approved-[A-Za-z0-9._-]+$/],
  admin_mfa_runtime_proof: [/^artifact:admin-mfa-hosted-proof$/, /^log:admin-sensitive-route-mfa-reject-pass$/],
  ai_budget_runtime_proof: [/^artifact:ai-budget-hosted-proof$/, /^log:ai-budget-kill-switch-cap-pass$/],
};

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

function hasRequiredRef(refs: string[], pattern: RegExp): boolean {
  return refs.some((ref) => pattern.test(ref));
}

function verifyGithubRunRef(ref: string): string | null {
  const match = ref.match(/^https:\/\/github\.com\/ramymortada-cpu\/Fnnlr\/actions\/runs\/([0-9]+)$/);
  if (!match) return null;
  const runId = match[1];
  const result = spawnSync('gh', ['run', 'view', runId, '--json', 'status,conclusion,headSha,url'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if ((result.status ?? 1) !== 0) {
    return `could not verify GitHub Actions run ${runId}`;
  }
  try {
    const parsed = JSON.parse(result.stdout || '{}') as {
      status?: string;
      conclusion?: string;
      url?: string;
    };
    if (parsed.status !== 'completed' || parsed.conclusion !== 'success') {
      return `GitHub Actions run ${runId} is ${parsed.status || 'unknown'}/${parsed.conclusion || 'none'}, expected completed/success`;
    }
    if (parsed.url && parsed.url !== ref) {
      return `GitHub Actions run ${runId} URL mismatch`;
    }
  } catch {
    return `could not parse GitHub Actions run ${runId}`;
  }
  return null;
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
    const githubRunFailure = id === 'hosted_staging_gateforge_run' ? verifyGithubRunRef(ref) : null;
    if (githubRunFailure) failures.push(`${id}: ${githubRunFailure}`);
  }
  for (const pattern of requiredEvidenceRefPatterns[id] ?? []) {
    if (!hasRequiredRef(item.evidenceRefs, pattern)) failures.push(`${id}: missing required evidence ref pattern ${pattern}`);
  }
}

const closedBlockerIds: string[] = [];
for (const item of packet.items) {
  const itemBlockers = item.blockerIdsClosed ?? [];
  for (const blockerId of itemBlockers) {
    if (!requiredBlockerIds.includes(blockerId)) failures.push(`${item.id}: unsupported blockerIdsClosed value ${blockerId}`);
  }
  if (item.status !== 'PASS' && itemBlockers.length) {
    failures.push(`${item.id}: blockerIdsClosed can only be claimed by PASS items`);
  }
  if (item.status === 'PASS') closedBlockerIds.push(...itemBlockers);
}

for (const blockerId of requiredBlockerIds) {
  if (!closedBlockerIds.includes(blockerId)) failures.push(`${blockerId}: missing explicit PASS blocker closure mapping`);
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
