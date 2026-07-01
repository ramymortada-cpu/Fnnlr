#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

type MoatRow = {
  id: string;
  phase: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  status: string;
  executionState: string;
  owner: string;
  action: string;
  evidence: string;
  nextCommand: string;
  unblockEvidence: string;
};
type MoatStatus = {
  total?: number;
  rows?: MoatRow[];
  byState?: Record<string, number>;
};
type ChainStep = {
  id: string;
  order: number;
  sourceAction: string;
  command: string;
  prerequisites: string[];
  evidenceRequired: string[];
  outputEvidence: string[];
  downstream: string[];
  failureMode: string;
};

const runDir = 'gateforge-audit/run-2026-06-23-1035';
const statusPath = 'docs/SAAS_MOAT_EXECUTION_STATUS.json';
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : `${runDir}/53_hosted_dependency_chain.md`;
const jsonOutIndex = process.argv.indexOf('--json-out');
const jsonOutPath = jsonOutIndex >= 0 ? process.argv[jsonOutIndex + 1] : `${runDir}/53_hosted_dependency_chain.json`;
const checkOnly = process.argv.includes('--check');

const chain: ChainStep[] = [
  {
    id: 'GF-017',
    order: 1,
    sourceAction: 'Run local secret replacement packet after operator values exist.',
    command: 'npm run gateforge:secret-replacement-packet',
    prerequisites: [
      'GF-001..GF-016 provider/runtime values have been created outside git.',
      'Local secret scaffold exists under the configured secure local secret directory.',
    ],
    evidenceRequired: [
      '45_secret_replacement_packet.md lists every runtime and attestation secret without values.',
      'Local secret files check reports every runtime secret READY and at least one attestation option READY.',
    ],
    outputEvidence: [
      'gateforge-audit/run-2026-06-23-1035/45_secret_replacement_packet.md',
      'gateforge-audit/run-2026-06-23-1035/45_secret_replacement_packet.csv',
    ],
    downstream: ['GF-018', 'GF-021'],
    failureMode: 'BLOCKED_BY_SECRET_READINESS',
  },
  {
    id: 'GF-018',
    order: 2,
    sourceAction: 'Generate hosted staging attestation packet from real evidence only.',
    command: 'npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json',
    prerequisites: [
      'Hosted staging evidence packet exists and contains sanitized provider/runtime proof.',
      'No local-only command output is treated as hosted proof.',
    ],
    evidenceRequired: [
      'hosted-staging-attestation.json validates with external-check.',
      'Attestation references live hosted evidence for DB, observability, email, AI cap, and smoke checks.',
    ],
    outputEvidence: [
      'gateforge-audit/external-attestations/hosted-staging-attestation.json',
      'gateforge-audit/external-attestations/HOSTED_STAGING_WAR_ROOM.md',
    ],
    downstream: ['GF-019', 'GF-022'],
    failureMode: 'BLOCKED_BY_HOSTED_ATTESTATION',
  },
  {
    id: 'GF-019',
    order: 3,
    sourceAction: 'Encode validated attestation as the preferred B64 secret.',
    command: 'npm run gateforge:attestation-secret-pack -- --write-b64',
    prerequisites: [
      'GF-018 validated the hosted attestation packet.',
      'Operator chose one attestation secret strategy: B64 preferred or JSON alternative.',
    ],
    evidenceRequired: [
      '46_attestation_secret_pack.md reports READY without printing the packet value.',
      'At least one attestation local secret file is READY.',
    ],
    outputEvidence: [
      'gateforge-audit/run-2026-06-23-1035/46_attestation_secret_pack.md',
    ],
    downstream: ['GF-021'],
    failureMode: 'BLOCKED_BY_HOSTED_ATTESTATION',
  },
  {
    id: 'GF-021',
    order: 4,
    sourceAction: 'Upload local secret pack to GitHub Actions after validation.',
    command: 'npm run gateforge:hosted-unblock -- --apply --prepare-attestation',
    prerequisites: [
      'GF-017 local runtime secrets are READY.',
      'GF-019 attestation secret is READY.',
      'GitHub CLI is authenticated for the target repository.',
    ],
    evidenceRequired: [
      '39_github_secrets_presence_audit.md reports READY.',
      '40_missing_github_secrets_remediation.md reports READY or no missing runtime/attestation secrets.',
    ],
    outputEvidence: [
      'gateforge-audit/run-2026-06-23-1035/39_github_secrets_presence_audit.md',
      'gateforge-audit/run-2026-06-23-1035/40_missing_github_secrets_remediation.md',
    ],
    downstream: ['GF-022'],
    failureMode: 'BLOCKED_BY_SECRET_READINESS',
  },
  {
    id: 'GF-022',
    order: 5,
    sourceAction: 'Trigger GateForge Hosted Staging Strict.',
    command: 'npm run gateforge:trigger-hosted-strict',
    prerequisites: [
      'GF-021 confirms GitHub secret names are present.',
      'GateForge Hosted Staging Strict workflow exists and is dispatchable.',
    ],
    evidenceRequired: [
      '41_hosted_strict_trigger_attempt.md reports TRIGGERED or dry-run readiness in smoke.',
      'Hosted Staging Strict GitHub workflow completes successfully with sanitized artifact upload.',
    ],
    outputEvidence: [
      'gateforge-audit/run-2026-06-23-1035/41_hosted_strict_trigger_attempt.md',
      'GitHub Actions artifact: gateforge-hosted-staging-strict',
    ],
    downstream: ['GF-023', 'GF-024'],
    failureMode: 'BLOCKED_BY_GITHUB_SECRET_READINESS',
  },
];

function fail(message: string): never {
  console.error(`GateForge hosted dependency chain: FAIL - ${message}`);
  process.exit(1);
}

function readStatus(): MoatStatus {
  if (!fs.existsSync(statusPath)) fail(`missing ${statusPath}`);
  return JSON.parse(fs.readFileSync(statusPath, 'utf8')) as MoatStatus;
}

function validate(status: MoatStatus) {
  const errors: string[] = [];
  const rows = status.rows ?? [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const expectedIds = chain.map((step) => step.id);

  if (status.total !== 165 || rows.length !== 165) errors.push(`expected 165 moat rows, found total=${status.total ?? 'missing'} rows=${rows.length}`);
  for (const step of chain) {
    const row = byId.get(step.id);
    if (!row) {
      errors.push(`missing ${step.id} in moat status`);
      continue;
    }
    if (row.priority !== 'P0') errors.push(`${step.id} must remain P0 until hosted evidence closes`);
    if (!row.nextCommand?.trim()) errors.push(`${step.id} missing next command in moat status`);
    if (!row.unblockEvidence?.trim()) errors.push(`${step.id} missing unblock evidence in moat status`);
    if (!row.action.includes(step.sourceAction.replace(/\.$/, ''))) errors.push(`${step.id} action drifted from dependency chain source`);
  }
  for (let index = 0; index < chain.length; index += 1) {
    const step = chain[index];
    if (step.order !== index + 1) errors.push(`${step.id} has invalid order ${step.order}`);
    if (!step.command.trim()) errors.push(`${step.id} missing command`);
    if (!step.prerequisites.length) errors.push(`${step.id} missing prerequisites`);
    if (!step.evidenceRequired.length) errors.push(`${step.id} missing evidence required`);
    if (!step.outputEvidence.length) errors.push(`${step.id} missing output evidence`);
    if (!step.failureMode.trim()) errors.push(`${step.id} missing failure mode`);
  }
  const unknownDownstream = chain.flatMap((step) => step.downstream.filter((id) => !expectedIds.includes(id) && !['GF-023', 'GF-024'].includes(id)));
  if (unknownDownstream.length) errors.push(`unknown downstream ids: ${unknownDownstream.join(', ')}`);
  return errors;
}

function mdList(values: string[]) {
  return values.map((value) => `- ${value}`).join('\n');
}

function renderMarkdown(generatedAt: string, status: MoatStatus) {
  const rows = chain
    .map((step) => `| ${step.order} | \`${step.id}\` | \`${step.failureMode}\` | \`${step.command}\` | ${step.downstream.map((id) => `\`${id}\``).join(', ')} |`)
    .join('\n');
  const sections = chain
    .map(
      (step) => `### ${step.order}. ${step.id} - ${step.sourceAction}

Command:

\`\`\`bash
${step.command}
\`\`\`

Prerequisites:
${mdList(step.prerequisites)}

Evidence required:
${mdList(step.evidenceRequired)}

Output evidence:
${mdList(step.outputEvidence.map((item) => `\`${item}\``))}

Downstream:
${mdList(step.downstream.map((id) => `\`${id}\``))}
`,
    )
    .join('\n');
  return `# GateForge Hosted Dependency Chain

Generated: \`${generatedAt}\`

Decision: \`PASS\`

This file turns the remaining hosted dependency gates into an ordered, machine-checked execution chain. It does not contain secret values and does not claim GA approval.

## Chain Summary

- Source status: \`${statusPath}\`
- Total moat actions: \`${status.total ?? 'UNKNOWN'}\`
- Dependency gates covered: \`${chain.length}\`
- Scope: \`GF-017, GF-018, GF-019, GF-021, GF-022\`

| Order | ID | Current failure mode | Command | Downstream |
| ---: | --- | --- | --- | --- |
${rows}

## Details

${sections}
## Safety

- Secret values printed: \`NO\`
- Production mutated: \`NO\`
- Source dumps included: \`NO\`
`;
}

function renderJson(generatedAt: string, status: MoatStatus) {
  return {
    generatedAt,
    decision: 'PASS',
    source: statusPath,
    totalMoatActions: status.total ?? null,
    dependencyGateCount: chain.length,
    chain,
    safety: {
      secretValuesPrinted: false,
      productionMutated: false,
      sourceDumpsIncluded: false,
    },
  };
}

const status = readStatus();
const errors = validate(status);
if (errors.length) {
  console.error('GateForge hosted dependency chain: FAIL');
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}

const generatedAt = new Date().toISOString();
const md = renderMarkdown(generatedAt, status);
const json = `${JSON.stringify(renderJson(generatedAt, status), null, 2)}\n`;

if (checkOnly) {
  const expectedTimestamp = 'CHECK_TIMESTAMP';
  const expectedMd = renderMarkdown(expectedTimestamp, status);
  const expectedJson = `${JSON.stringify(renderJson(expectedTimestamp, status), null, 2)}\n`;
  const currentMd = fs.existsSync(outPath)
    ? fs.readFileSync(outPath, 'utf8').replace(/Generated: `[^`]+`/, `Generated: \`${expectedTimestamp}\``)
    : '';
  const currentJson = fs.existsSync(jsonOutPath)
    ? `${JSON.stringify({ ...JSON.parse(fs.readFileSync(jsonOutPath, 'utf8')), generatedAt: expectedTimestamp }, null, 2)}\n`
    : '';
  if (currentMd !== expectedMd || currentJson !== expectedJson) fail('generated hosted dependency chain is stale');
  console.log('GateForge hosted dependency chain: PASS');
  process.exit(0);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md);
fs.writeFileSync(jsonOutPath, json);
console.log('GateForge hosted dependency chain: PASS');
console.log(`  wrote ${outPath}`);
console.log(`  wrote ${jsonOutPath}`);
