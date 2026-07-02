#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

type GateSummary = {
  evidenceContext?: string;
  score?: string;
  results?: { name: string; status: string; evidenceClass: string }[];
};

type EvidenceStatus = 'PASS' | 'FAIL' | 'MISSING' | 'HUMAN_ATTESTATION_REQUIRED';

type ExternalPacket = {
  environment?: string;
  decisionRequested?: string;
  items?: { id: string; title: string; status: EvidenceStatus; evidenceRefs: string[]; owner: string; notes?: string }[];
};

const runDir = 'gateforge-audit/run-2026-06-23-1035';
const summaryPath = `${runDir}/ga-unblock-evidence/summary.json`;
const externalIndex = process.argv.indexOf('--external-file');
const externalPath =
  externalIndex >= 0 ? process.argv[externalIndex + 1] : 'gateforge-audit/external-attestations/hosted-staging-attestation.json';
const templateIndex = process.argv.indexOf('--template-file');
const templatePath =
  templateIndex >= 0 ? process.argv[templateIndex + 1] : 'gateforge-audit/external-attestations/hosted-staging-attestation.template.json';
const runbookOutIndex = process.argv.indexOf('--runbook-out');
const runbookPath =
  runbookOutIndex >= 0 ? process.argv[runbookOutIndex + 1] : 'gateforge-audit/external-attestations/HOSTED_STAGING_WAR_ROOM.md';
const reportOutIndex = process.argv.indexOf('--report-out');
const reportPath = reportOutIndex >= 0 ? process.argv[reportOutIndex + 1] : `${runDir}/36_life_or_death_war_room.md`;
const checkOnly = process.argv.includes('--check');

const requiredItems = [
  {
    id: 'hosted_staging_gateforge_run',
    owner: 'Engineering/operator',
    acceptance: 'GitHub Actions or hosted staging artifact showing the GA unblock suite against real staging secrets.',
    command: 'GATEFORGE_EVIDENCE_CONTEXT=HOSTED_STAGING npm run gateforge:ga-unblock',
    scoreLift: '+1 to +2',
  },
  {
    id: 'provider_webhook_replay_idempotency',
    owner: 'Engineering/operator',
    acceptance: 'Signed provider event accepted once, duplicate handled idempotently, stale/replay event rejected.',
    command: 'npm run verify:production-safety',
    scoreLift: '+1 to +2',
  },
  {
    id: 'monitoring_alerting_proof',
    owner: 'Engineering/operator',
    acceptance: 'Sentry or equivalent alert, uptime health check, cron failure alert, and webhook failure alert references.',
    command: 'npm run deploy:health-gate',
    scoreLift: '+1 to +2',
  },
  {
    id: 'hosted_restore_drill',
    owner: 'Engineering/operator',
    acceptance: 'Backup, restore into disposable hosted restore DB, and restore verification PASS.',
    command: 'npm run db:backup && npm run db:restore-test && npm run db:verify-restore',
    scoreLift: '+2 to +3',
  },
  {
    id: 'email_deliverability_runtime_proof',
    owner: 'Engineering/operator',
    acceptance: 'Transactional provider test plus SPF, DKIM, and DMARC verified sender evidence.',
    command: 'npm run deploy:smoke',
    scoreLift: '+1 to +2',
  },
  {
    id: 'legal_commercial_final_approval',
    owner: 'Founder/legal',
    acceptance: 'Terms, Privacy, DPA, subprocessors, retention policy, and security contact final approved or signed off.',
    command: 'npm run gateforge:external-check',
    scoreLift: '+1 to +2',
  },
  {
    id: 'admin_mfa_runtime_proof',
    owner: 'Engineering/operator',
    acceptance: 'Hosted admin setup/verify evidence plus admin-sensitive route rejects non-MFA session.',
    command: 'npm run verify:production-safety',
    scoreLift: '+1 to +2',
  },
  {
    id: 'ai_budget_runtime_proof',
    owner: 'Engineering/operator',
    acceptance: 'Allowed AI call, cap-blocked call, kill-switch blocked call, and tenant-scoped ai_usage_events evidence.',
    command: 'npm run verify:production-safety',
    scoreLift: '+1 to +2',
  },
];

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function packetStatus(packet: ExternalPacket | null, id: string): EvidenceStatus | 'ABSENT' {
  const item = packet?.items?.find((entry) => entry.id === id);
  return item?.status || 'ABSENT';
}

function packetRefs(packet: ExternalPacket | null, id: string): string {
  const item = packet?.items?.find((entry) => entry.id === id);
  if (!item?.evidenceRefs?.length) return 'None';
  return item.evidenceRefs.join('; ');
}

function externalContractStatus(): { status: 'PASS' | 'FAIL'; detail: string } {
  const result = spawnSync('npx', ['tsx', 'scripts/gateforge-external-check.ts', externalPath], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status === 0 ? 'PASS' : 'FAIL',
    detail:
      result.status === 0
        ? 'External packet satisfies the strict evidence contract.'
        : 'External packet does not satisfy the strict evidence contract.',
  };
}

const summary = readJson<GateSummary>(summaryPath);
const packet = readJson<ExternalPacket>(externalPath);
const template = readJson<ExternalPacket>(templatePath);
const runtimeResults = summary?.results || [];
const runtimeFailures = runtimeResults.filter((result) => result.status !== 'PASS');
const externalRows = requiredItems.map((item) => {
  const status = packetStatus(packet, item.id);
  return {
    ...item,
    status,
    evidenceRefs: packetRefs(packet, item.id),
  };
});
const openExternal = externalRows.filter((item) => item.status !== 'PASS');
const externalContract = externalContractStatus();
const decision = runtimeFailures.length || openExternal.length || externalContract.status !== 'PASS' ? 'CANNOT_APPROVE' : 'CONDITIONAL_GO';
const now = new Date().toISOString();

const table = externalRows
  .map(
    (item) =>
      `| \`${item.id}\` | \`${item.status}\` | ${item.owner} | ${item.acceptance} | \`${item.scoreLift}\` |`,
  )
  .join('\n');

function renderRunbook(generatedAt: string) {
  return `# Hosted Staging War Room

Generated: \`${generatedAt}\`

Purpose: close the remaining GateForge external evidence blockers without weakening the gate.

## Current Decision

- Decision: \`${decision}\`
- Runtime context: \`${summary?.evidenceContext || 'MISSING'}\`
- Runtime score: \`${summary?.score || 'NOT_RECOMPUTED'}\`
- Runtime checks: \`${runtimeResults.filter((result) => result.status === 'PASS').length}/${runtimeResults.length} PASS\`
- External packet: \`${packet ? externalPath : 'MISSING'}\`
- External contract: \`${externalContract.status}\` - ${externalContract.detail}

## Emergency Rule

Do not mark an item \`PASS\` unless it has a safe evidence reference. Missing evidence remains \`MISSING\`; legal signoff remains \`HUMAN_ATTESTATION_REQUIRED\` until final approval exists.

## Evidence Checklist

| Evidence item | Current status | Owner | Acceptance evidence | Score lift |
| --- | --- | --- | --- | --- |
${table}

## Exact Execution Order

1. Copy the template to the live packet path:

\`\`\`bash
cp ${templatePath} ${externalPath}
\`\`\`

2. Run the hosted staging suite with real staging secrets and keep only sanitized artifact links:

\`\`\`bash
GATEFORGE_EVIDENCE_CONTEXT=HOSTED_STAGING npm run gateforge:ga-unblock
npm run ci:live
npm run test:pg
npm run deploy:health-gate
npm run deploy:smoke
npm run deploy:verify-restore
\`\`\`

3. Prove restore, monitoring, admin MFA, AI budget controls, and webhook replay/idempotency using hosted artifacts or safe screenshots.

4. Replace each \`MISSING\` or \`HUMAN_ATTESTATION_REQUIRED\` status in \`${externalPath}\` with \`PASS\` only when the evidence reference exists.

5. Run the strict validators:

\`\`\`bash
npm run gateforge:external-check
npm run gateforge:final-gate
npm run gateforge:final-report
\`\`\`

## Final Gate

The target is \`CONDITIONAL_GO\`. The final gate must still fail closed until all eight external items are \`PASS\`.
`;
}

function renderReport(generatedAt: string) {
  return `# Life or Death GateForge War Room

Generated: \`${generatedAt}\`

## Situation

The code-side rescue path is in place. The remaining blocker is external production-readiness evidence, not a broad product rebuild.

## Current Gate

- Decision: \`${decision}\`
- Runtime context: \`${summary?.evidenceContext || 'MISSING'}\`
- Runtime score: \`${summary?.score || 'NOT_RECOMPUTED'}\`
- Runtime checks: \`${runtimeResults.filter((result) => result.status === 'PASS').length}/${runtimeResults.length} PASS\`
- External blockers: \`${openExternal.length}\`
- External contract: \`${externalContract.status}\` - ${externalContract.detail}

## Non-Negotiable Blockers

${openExternal.map((item, index) => `${index + 1}. \`${item.id}\` - ${item.acceptance}`).join('\n') || 'None.'}

## Required External Packet

- Path: \`${externalPath}\`
- Template available: \`${templatePath}\`
- Template items: \`${template?.items?.length || 0}\`

## Command Center

\`\`\`bash
npm run typecheck
npm run gateforge:war-room
npm run gateforge:external-check
npm run gateforge:final-gate
npm run gateforge:final-report
\`\`\`

## Expected Movement

- Current defensible score: \`${summary?.score || '78-84/100 pending legal/provider attestation'}\`
- With all eight external items PASS: \`CONDITIONAL_GO\`
- Do not claim \`GO\` until production/live legal, monitoring, provider, and restore evidence is complete.

See \`${runbookPath}\` for the operator runbook.
`;
}

const runbook = renderRunbook(now);
const report = renderReport(now);

if (checkOnly) {
  const expectedGeneratedAt = 'CHECK_TIMESTAMP';
  const expectedRunbook = renderRunbook(expectedGeneratedAt);
  const expectedReport = renderReport(expectedGeneratedAt);
  const errors: string[] = [];
  const currentRunbook = fs.existsSync(runbookPath)
    ? fs.readFileSync(runbookPath, 'utf8').replace(/Generated: `[^`]+`/, `Generated: \`${expectedGeneratedAt}\``)
    : '';
  const currentReport = fs.existsSync(reportPath)
    ? fs.readFileSync(reportPath, 'utf8').replace(/Generated: `[^`]+`/, `Generated: \`${expectedGeneratedAt}\``)
    : '';

  if (!currentRunbook) errors.push(`missing generated runbook: ${runbookPath}`);
  else if (currentRunbook !== expectedRunbook) errors.push(`stale generated runbook: ${runbookPath}`);
  if (!currentReport) errors.push(`missing generated report: ${reportPath}`);
  else if (currentReport !== expectedReport) errors.push(`stale generated report: ${reportPath}`);

  if (errors.length) {
    console.error('GateForge war room: FAIL');
    errors.forEach((error) => console.error(`  - ${error}`));
    console.error('Run: npm run gateforge:war-room');
    process.exit(1);
  }

  console.log(`GateForge war room: PASS (${decision})`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(runbookPath), { recursive: true });
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(runbookPath, runbook);
fs.writeFileSync(reportPath, report);

console.log(`GateForge war room: ${decision}`);
console.log(`external blockers: ${openExternal.length}`);
console.log(`wrote ${runbookPath}`);
console.log(`wrote ${reportPath}`);
