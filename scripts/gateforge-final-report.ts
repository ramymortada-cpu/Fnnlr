#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

type GateSummary = {
  evidenceContext?: string;
  score?: string;
  results?: { name: string; status: string; evidenceClass: string }[];
};

type ExternalPacket = {
  environment?: string;
  decisionRequested?: string;
  items?: { id: string; status: string; evidenceRefs: string[]; owner: string; blockerIdsClosed?: string[] }[];
};

const runDir = 'gateforge-audit/run-2026-06-23-1035';
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const positionalArgs = args.filter((arg) => !arg.startsWith('--'));
const summaryPath = positionalArgs[0] || `${runDir}/ga-unblock-evidence/summary.json`;
const externalPath = positionalArgs[1] || 'gateforge-audit/external-attestations/hosted-staging-attestation.json';
const outPath = positionalArgs[2] || `${runDir}/34_final_gate_current_decision.md`;
const requiredExternalIds = [
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
  const externalContract = spawnSync('npx', ['tsx', 'scripts/gateforge-external-check.ts', externalPath], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (externalContract.status !== 0) {
    reasons.push('external attestation contract failed; run npm run gateforge:external-check with the hosted staging packet');
  }
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
  const closedBlockerIds = new Set(
    (external.items || [])
      .filter((item) => item.status === 'PASS')
      .flatMap((item) => item.blockerIdsClosed ?? []),
  );
  for (const id of requiredBlockerIds) {
    if (!closedBlockerIds.has(id)) reasons.push(`external ${id}: missing explicit blocker closure mapping`);
  }
}

const decision = reasons.length ? 'CANNOT_APPROVE' : 'CONDITIONAL_GO';
const now = new Date().toISOString();

function renderReport(generatedAt: string) {
  return `# Final Gate Current Decision

Generated: \`${generatedAt}\`

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
}

const body = renderReport(now);

if (checkOnly) {
  const expectedGeneratedAt = 'CHECK_TIMESTAMP';
  const expected = renderReport(expectedGeneratedAt);
  const current = fs.existsSync(outPath)
    ? fs.readFileSync(outPath, 'utf8').replace(/Generated: `[^`]+`/, `Generated: \`${expectedGeneratedAt}\``)
    : '';

  if (current !== expected) {
    console.error('GateForge final report: FAIL');
    if (!current) console.error(`  - missing generated report: ${outPath}`);
    else console.error(`  - stale generated report: ${outPath}`);
    console.error('Run: npm run gateforge:final-report');
    process.exit(1);
  }

  console.log(`GateForge final report: PASS (${decision})`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, body);
console.log(`GateForge final report: ${decision}`);
console.log(`wrote ${outPath}`);
