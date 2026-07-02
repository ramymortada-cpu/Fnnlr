#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

type Safety = {
  secretValuesPrinted?: boolean;
  productionMutated?: boolean;
  sourceDumpsIncluded?: boolean;
  sourceCodeFixesAppliedByThisCommand?: boolean;
};
type MoatRow = {
  id: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  executionState: string;
  nextCommand?: string;
  unblockEvidence?: string;
};
type MoatStatus = {
  total?: number;
  byState?: Record<string, number>;
  rows?: MoatRow[];
  openP0?: { id: string; state: string }[];
};
type DoctorJson = {
  decision?: string;
  nextCommand?: string;
  workflow?: string;
  secretDir?: string;
  probes?: {
    localSecretFiles?: {
      status?: string;
      localState?: string;
      attestationReady?: boolean;
      runtimeReady?: boolean;
    };
    attestationSecretPack?: { status?: string };
    remainingExternalBlockerCloseout?: { status?: string; blockerIds?: string[] };
    githubSecretNames?: { status?: string };
    hostedStrictWorkflow?: { status?: string };
  };
  artifactRefs?: Record<string, string>;
  safety?: Safety;
};
type GateStatus = {
  decision?: { state?: string; scoreBand?: string; nextAction?: string };
  probes?: Record<string, { status?: string; detail?: string; url?: string }>;
  blockers?: {
    openExternalBlockers?: string[];
    externalBlockerProgressCounts?: Record<string, number>;
    externalBlockerReadiness?: {
      localUnreadySecretNames?: string[];
      githubMissingSecretNames?: string[];
    };
  };
  evidenceScope?: {
    localSecretReadinessIsGaEvidence?: boolean;
    hostedStrictWorkflowRequiredForGa?: boolean;
  };
  safety?: Safety;
};
type ExternalBlockerProgress = {
  total?: number;
  counts?: Record<string, number>;
  readiness?: {
    localUnreadySecretNames?: string[];
    githubMissingSecretNames?: string[];
  };
  safety?: Safety;
};
type OperatorPacket = {
  total?: number;
  counts?: Record<string, number>;
  rows?: { id: string; status?: string; nextAction?: string }[];
  safety?: Safety;
};
type Result = {
  id: string;
  status: 'PASS' | 'FAIL';
  evidence: string;
};

const runDir = 'gateforge-audit/run-2026-06-23-1035';
const moatPath = 'docs/SAAS_MOAT_EXECUTION_STATUS.json';
const doctorPath = `${runDir}/44_hosted_readiness_doctor.json`;
const gatePath = `${runDir}/47_ga_unblock_status.json`;
const progressPath = `${runDir}/49_external_blocker_progress.json`;
const operatorPath = `${runDir}/50_operator_execution_packet.json`;
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : `${runDir}/54_hosted_readiness_contract.md`;
const jsonOutIndex = process.argv.indexOf('--json-out');
const jsonOutPath = jsonOutIndex >= 0 ? process.argv[jsonOutIndex + 1] : `${runDir}/54_hosted_readiness_contract.json`;
const checkOnly = process.argv.includes('--check');

function fail(message: string): never {
  console.error(`GateForge hosted readiness contract: FAIL - ${message}`);
  process.exit(1);
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) fail(`missing ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function pass(id: string, evidence: string): Result {
  return { id, status: 'PASS', evidence };
}

function failResult(id: string, evidence: string): Result {
  return { id, status: 'FAIL', evidence };
}

function safe(safety: Safety | undefined, allowNoSourceDumpFlag = false): boolean {
  const base = safety?.secretValuesPrinted === false && safety.productionMutated === false;
  if (!base) return false;
  return allowNoSourceDumpFlag || safety.sourceDumpsIncluded === false || safety.sourceCodeFixesAppliedByThisCommand === false;
}

function ids(start: number, end: number): string[] {
  return Array.from({ length: end - start + 1 }, (_, index) => `GF-${String(start + index).padStart(3, '0')}`);
}

function sameSet(actual: string[] | undefined, expected: string[]): boolean {
  return JSON.stringify([...(actual ?? [])].sort()) === JSON.stringify([...expected].sort());
}

function sameNames(actual: string[] | undefined, expected: string[] | undefined): boolean {
  return JSON.stringify([...(actual ?? [])].sort()) === JSON.stringify([...(expected ?? [])].sort());
}

function evaluate() {
  const moat = readJson<MoatStatus>(moatPath);
  const doctor = readJson<DoctorJson>(doctorPath);
  const gate = readJson<GateStatus>(gatePath);
  const progress = readJson<ExternalBlockerProgress>(progressPath);
  const operator = readJson<OperatorPacket>(operatorPath);
  const expectedExternalIds = ids(1, 16);
  const rows = moat.rows ?? [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const results: Result[] = [];

  results.push(
    moat.total === 165 && rows.length === 165
      ? pass('MOAT-BOARD-SCOPE', 'SaaS moat board still has exactly 165 tracked actions.')
      : failResult('MOAT-BOARD-SCOPE', `expected 165 rows, found total=${moat.total ?? 'missing'} rows=${rows.length}`),
  );
  results.push(
    moat.byState?.EVIDENCE_FILE_PRESENT === 144 &&
      moat.byState.BLOCKED_EXTERNAL === 16 &&
      moat.byState.BLOCKED_BY_SECRET_READINESS === 2 &&
      moat.byState.BLOCKED_BY_HOSTED_ATTESTATION === 2 &&
      moat.byState.BLOCKED_BY_GITHUB_SECRET_READINESS === 1
      ? pass('MOAT-STATE-DISTRIBUTION', 'Moat state distribution matches the current honest GA unblock boundary.')
      : failResult('MOAT-STATE-DISTRIBUTION', `unexpected state counts: ${JSON.stringify(moat.byState ?? {})}`),
  );

  const expectedSecretBlocked = ['GF-017', 'GF-021'];
  results.push(
    expectedSecretBlocked.every((id) => byId.get(id)?.executionState === 'BLOCKED_BY_SECRET_READINESS')
      ? pass('SECRET-DEPENDENCY-BLOCKS', 'GF-017 and GF-021 remain blocked by secret readiness until local staged values are real.')
      : failResult(
          'SECRET-DEPENDENCY-BLOCKS',
          expectedSecretBlocked.map((id) => `${id}=${byId.get(id)?.executionState ?? 'missing'}`).join(', '),
        ),
  );
  results.push(
    ['GF-018', 'GF-019'].every((id) => byId.get(id)?.executionState === 'BLOCKED_BY_HOSTED_ATTESTATION')
      ? pass('ATTESTATION-DEPENDENCY-BLOCKS', 'GF-018 and GF-019 remain blocked by hosted attestation evidence.')
      : failResult('ATTESTATION-DEPENDENCY-BLOCKS', 'hosted attestation dependency rows drifted.'),
  );
  results.push(
    byId.get('GF-022')?.executionState === 'BLOCKED_BY_GITHUB_SECRET_READINESS'
      ? pass('STRICT-TRIGGER-BLOCK', 'GF-022 remains blocked until GitHub secret names and hosted strict proof exist.')
      : failResult('STRICT-TRIGGER-BLOCK', `GF-022=${byId.get('GF-022')?.executionState ?? 'missing'}`),
  );

  results.push(
    doctor.decision === 'REPLACE_LOCAL_SECRET_PLACEHOLDERS' &&
      doctor.probes?.localSecretFiles?.status === 'FAIL' &&
      doctor.probes.localSecretFiles.localState === 'PLACEHOLDERS' &&
      doctor.probes.localSecretFiles.attestationReady === false &&
      doctor.probes.localSecretFiles.runtimeReady === false
      ? pass('DOCTOR-LOCAL-PLACEHOLDER-DECISION', 'Hosted readiness doctor correctly points to local placeholder replacement.')
      : failResult('DOCTOR-LOCAL-PLACEHOLDER-DECISION', `doctor decision/local probe=${JSON.stringify(doctor.probes?.localSecretFiles ?? {})}`),
  );
  results.push(
    String(doctor.nextCommand ?? '').includes('gateforge:secret-replacement-packet') &&
      String(doctor.nextCommand ?? '').includes('gateforge:hosted-readiness-doctor')
      ? pass('DOCTOR-NEXT-COMMAND', 'Doctor next command routes through secret replacement and a repeat readiness check.')
      : failResult('DOCTOR-NEXT-COMMAND', `unexpected nextCommand=${doctor.nextCommand ?? 'missing'}`),
  );
  results.push(
    sameSet(doctor.probes?.remainingExternalBlockerCloseout?.blockerIds, expectedExternalIds) &&
      doctor.probes?.remainingExternalBlockerCloseout?.status === 'PASS'
      ? pass('DOCTOR-EXTERNAL-SCOPE', 'Doctor maps GF-001..GF-016 as the current external blocker scope.')
      : failResult('DOCTOR-EXTERNAL-SCOPE', `unexpected blockerIds=${doctor.probes?.remainingExternalBlockerCloseout?.blockerIds?.join(',') ?? 'missing'}`),
  );
  results.push(
    doctor.probes?.githubSecretNames?.status === 'FAIL' && doctor.probes.hostedStrictWorkflow?.status === 'UNKNOWN'
      ? pass('DOCTOR-NO-HOSTED-CLAIM', 'Doctor does not claim GitHub secret readiness or hosted strict success.')
      : failResult('DOCTOR-NO-HOSTED-CLAIM', `github=${doctor.probes?.githubSecretNames?.status ?? 'missing'} strict=${doctor.probes?.hostedStrictWorkflow?.status ?? 'missing'}`),
  );
  results.push(
    safe(doctor.safety, true)
      ? pass('DOCTOR-SAFETY', 'Doctor JSON safety flags confirm no secret values printed and no production mutation.')
      : failResult('DOCTOR-SAFETY', 'doctor safety flags are not safe.'),
  );
  results.push(
    safe(progress.safety)
      ? pass('PROGRESS-SAFETY', 'External blocker progress safety flags confirm no secret values printed, no production mutation, and no source dump.')
      : failResult('PROGRESS-SAFETY', 'external blocker progress safety flags are not safe.'),
  );

  results.push(
    gate.decision?.state === 'CANNOT_APPROVE_LOCAL_EVIDENCE' &&
      gate.evidenceScope?.localSecretReadinessIsGaEvidence === false &&
      gate.evidenceScope.hostedStrictWorkflowRequiredForGa === true
      ? pass('GATE-HONESTY', 'Gate status still requires hosted strict evidence and refuses local-only approval.')
      : failResult('GATE-HONESTY', `gate=${gate.decision?.state ?? 'missing'} scope=${JSON.stringify(gate.evidenceScope ?? {})}`),
  );
  results.push(
    sameSet(gate.blockers?.openExternalBlockers, expectedExternalIds) &&
      gate.blockers?.externalBlockerProgressCounts?.LOCAL_SECRET_PENDING === 16
      ? pass('GATE-BLOCKER-ALIGNMENT', 'Gate status aligns with 16 local-secret-pending external blockers.')
      : failResult('GATE-BLOCKER-ALIGNMENT', `gate blockers/counts=${JSON.stringify(gate.blockers ?? {})}`),
  );
  results.push(
    progress.total === 16 &&
      progress.counts?.LOCAL_SECRET_PENDING === 16 &&
      progress.counts.GITHUB_SECRET_PENDING === 0 &&
      progress.counts.HOSTED_EVIDENCE_PENDING === 0
      ? pass('PROGRESS-BLOCKER-COUNTS', 'External blocker progress still has 16 blockers at LOCAL_SECRET_PENDING.')
      : failResult('PROGRESS-BLOCKER-COUNTS', `progress counts=${JSON.stringify(progress.counts ?? {})}`),
  );
  results.push(
    progress.readiness?.localUnreadySecretNames?.length === 11 &&
      progress.readiness.githubMissingSecretNames?.length === 11 &&
      sameNames(progress.readiness.localUnreadySecretNames, progress.readiness.githubMissingSecretNames)
      ? pass('PROGRESS-UNIQUE-SECRET-READINESS', 'Progress board reports the same 11 unique secret names missing locally and on GitHub.')
      : failResult('PROGRESS-UNIQUE-SECRET-READINESS', `progress readiness=${JSON.stringify(progress.readiness ?? {})}`),
  );
  results.push(
    sameNames(gate.blockers?.externalBlockerReadiness?.localUnreadySecretNames, progress.readiness?.localUnreadySecretNames) &&
      sameNames(gate.blockers?.externalBlockerReadiness?.githubMissingSecretNames, progress.readiness?.githubMissingSecretNames)
      ? pass('GATE-PROGRESS-READINESS-ALIGNMENT', 'Gate status and external blocker progress agree on unique missing secret names.')
      : failResult(
          'GATE-PROGRESS-READINESS-ALIGNMENT',
          `gate=${JSON.stringify(gate.blockers?.externalBlockerReadiness ?? {})} progress=${JSON.stringify(progress.readiness ?? {})}`,
        ),
  );

  results.push(
    operator.total === 16 &&
      operator.counts?.LOCAL_SECRET_PENDING === 16 &&
      operator.counts.GITHUB_SECRET_PENDING === 0 &&
      operator.counts.HOSTED_EVIDENCE_PENDING === 0 &&
      (operator.rows ?? []).every((row) => expectedExternalIds.includes(row.id) && row.status === 'LOCAL_SECRET_PENDING')
      ? pass('OPERATOR-PACKET-ALIGNMENT', 'Operator packet keeps all 16 external blockers at LOCAL_SECRET_PENDING.')
      : failResult('OPERATOR-PACKET-ALIGNMENT', `operator counts=${JSON.stringify(operator.counts ?? {})}`),
  );
  results.push(
    safe(operator.safety)
      ? pass('OPERATOR-SAFETY', 'Operator packet safety flags confirm no secret values printed, no production mutation, and no source dump.')
      : failResult('OPERATOR-SAFETY', 'operator packet safety flags are not safe.'),
  );

  return {
    generatedAt: new Date().toISOString(),
    decision: results.every((result) => result.status === 'PASS') ? 'PASS' : 'FAIL',
    source: { moatPath, doctorPath, gatePath, progressPath, operatorPath },
    currentGate: {
      state: gate.decision?.state ?? 'UNKNOWN',
      scoreBand: gate.decision?.scoreBand ?? 'UNKNOWN',
      doctorDecision: doctor.decision ?? 'UNKNOWN',
      nextCommand: doctor.nextCommand ?? 'UNKNOWN',
    },
    counts: {
      totalMoatActions: moat.total ?? 0,
      evidenceFilePresent: moat.byState?.EVIDENCE_FILE_PRESENT ?? 0,
      externalBlockers: moat.byState?.BLOCKED_EXTERNAL ?? 0,
      localSecretPending: operator.counts?.LOCAL_SECRET_PENDING ?? 0,
      uniqueLocalSecretsNotReady: progress.readiness?.localUnreadySecretNames?.length ?? 0,
      uniqueGithubSecretsMissing: progress.readiness?.githubMissingSecretNames?.length ?? 0,
    },
    results,
    safety: {
      secretValuesPrinted: false,
      productionMutated: false,
      sourceDumpsIncluded: false,
    },
  };
}

function normalizeGenerated(text: string): string {
  return text.replace(/^Generated: `[^`]+`$/gm, 'Generated: `<normalized>`').replace(/"generatedAt": "[^"]+"/g, '"generatedAt": "<normalized>"');
}

function assertFresh(filePath: string, expected: string): void {
  if (!fs.existsSync(filePath)) fail(`${filePath} is missing`);
  const actual = fs.readFileSync(filePath, 'utf8');
  if (normalizeGenerated(actual) !== normalizeGenerated(expected)) fail(`${filePath} is stale; rerun npm run gateforge:hosted-readiness-contract`);
}

function renderMarkdown(report: ReturnType<typeof evaluate>): string {
  const resultRows = report.results
    .map((result) => `| \`${result.id}\` | \`${result.status}\` | ${result.evidence.replace(/\|/g, '\\|')} |`)
    .join('\n');
  return `# Hosted Readiness Contract

Generated: \`${report.generatedAt}\`

Decision: \`${report.decision}\`

This contract verifies that the hosted readiness doctor, the 165-item moat board, the GA unblock status, and the operator packet agree on the current GA boundary. It does not contain secret values and does not claim GA approval.

## Current Gate

- Gate state: \`${report.currentGate.state}\`
- Score band: \`${report.currentGate.scoreBand}\`
- Doctor decision: \`${report.currentGate.doctorDecision}\`
- Next command: \`${report.currentGate.nextCommand}\`

## Counts

- Total moat actions: \`${report.counts.totalMoatActions}\`
- Evidence-file present: \`${report.counts.evidenceFilePresent}\`
- External blockers: \`${report.counts.externalBlockers}\`
- Local secret pending: \`${report.counts.localSecretPending}\`
- Unique local secret names not ready: \`${report.counts.uniqueLocalSecretsNotReady}\`
- Unique GitHub secret names missing: \`${report.counts.uniqueGithubSecretsMissing}\`

## Results

| Check | Status | Evidence |
| --- | --- | --- |
${resultRows}

## Safety

- Secret values printed: \`NO\`
- Production mutated: \`NO\`
- Source dumps included: \`NO\`
`;
}

const report = evaluate();
const markdown = renderMarkdown(report);
const json = `${JSON.stringify(report, null, 2)}\n`;

if (checkOnly) {
  if (report.decision !== 'PASS') fail(`contract decision is ${report.decision}`);
  assertFresh(outPath, markdown);
  assertFresh(jsonOutPath, json);
  console.log('GateForge hosted readiness contract: PASS');
  console.log(`  checked ${outPath}`);
  console.log(`  checked ${jsonOutPath}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, markdown);
fs.mkdirSync(path.dirname(jsonOutPath), { recursive: true });
fs.writeFileSync(jsonOutPath, json);

if (report.decision !== 'PASS') fail(`contract decision is ${report.decision}; wrote ${outPath}`);

console.log('GateForge hosted readiness contract: PASS');
console.log(`  wrote ${outPath}`);
console.log(`  wrote ${jsonOutPath}`);
