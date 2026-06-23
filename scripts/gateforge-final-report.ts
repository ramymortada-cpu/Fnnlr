#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

type GateSummary = {
  evidenceContext?: string;
  score?: string;
  results?: { name: string; status: string; evidenceClass: string }[];
};

type ExternalPacket = {
  environment?: string;
  decisionRequested?: string;
  items?: { id: string; status: string; evidenceRefs: string[]; owner: string }[];
};

const runDir = 'gateforge-audit/run-2026-06-23-1035';
const summaryPath = process.argv[2] || `${runDir}/ga-unblock-evidence/summary.json`;
const externalPath = process.argv[3] || 'gateforge-audit/external-attestations/hosted-staging-attestation.json';
const outPath = process.argv[4] || `${runDir}/34_final_gate_current_decision.md`;
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

const summary = readJson<GateSummary>(summaryPath);
const external = readJson<ExternalPacket>(externalPath);
const reasons: string[] = [];

if (!summary) {
  reasons.push(`runtime summary missing: ${summaryPath}`);
}

const runtimeResults = summary?.results || [];
const runtimeFailures = runtimeResults.filter((result) => result.status !== 'PASS');
for (const failure of runtimeFailures) reasons.push(`runtime ${failure.name}: ${failure.status}`);

if (!external) {
  reasons.push(`external attestation packet missing: ${externalPath}`);
} else {
  const byId = new Map((external.items || []).map((item) => [item.id, item]));
  for (const id of requiredExternalIds) {
    const item = byId.get(id);
    if (!item) {
      reasons.push(`external ${id}: missing`);
      continue;
    }
    if (item.status !== 'PASS') reasons.push(`external ${id}: ${item.status}`);
    if (!item.evidenceRefs?.length) reasons.push(`external ${id}: missing evidenceRefs`);
    if (!item.owner?.trim()) reasons.push(`external ${id}: missing owner`);
  }
}

const decision = reasons.length ? 'CANNOT_APPROVE' : 'CONDITIONAL_GO';
const now = new Date().toISOString();
const body = `# Final Gate Current Decision

Generated: \`${now}\`

Decision: \`${decision}\`

Runtime context: \`${summary?.evidenceContext || 'MISSING'}\`

Score: \`${summary?.score || 'NOT_RECOMPUTED'}\`

Runtime checks: \`${runtimeResults.filter((result) => result.status === 'PASS').length}/${runtimeResults.length} PASS\`

External packet: \`${external ? externalPath : 'MISSING'}\`

## Blocking Reasons

${reasons.map((reason) => `- ${reason}`).join('\n') || '- None'}

## Next Command

\`\`\`bash
npm run gateforge:final-gate
\`\`\`

## Interpretation

This report is archival and always writes a current decision. The strict gate remains \`npm run gateforge:final-gate\`, which exits non-zero unless the decision can become \`CONDITIONAL_GO\`.
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, body);
console.log(`GateForge final report: ${decision}`);
console.log(`wrote ${outPath}`);
