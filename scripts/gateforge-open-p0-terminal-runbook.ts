#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

type Safety = {
  secretValuesPrinted?: boolean;
  productionMutated?: boolean;
  sourceDumpsIncluded?: boolean;
};
type OpenP0 = {
  id: string;
  state: string;
  action: string;
  evidence: string;
  nextCommand: string;
  unblockEvidence: string;
};
type MoatStatus = {
  total?: number;
  byState?: Record<string, number>;
  openP0?: OpenP0[];
};
type OperatorPacket = {
  total?: number;
  counts?: Record<string, number>;
  rows?: {
    id: string;
    status: string;
    secrets?: string[];
    validationCommands?: string[];
    evidenceRequired?: string[];
    nextAction?: string;
  }[];
  safety?: Safety;
};
type DependencyChain = {
  decision?: string;
  chain?: {
    id: string;
    order: number;
    command: string;
    prerequisites?: string[];
    evidenceRequired?: string[];
    outputEvidence?: string[];
    downstream?: string[];
    failureMode?: string;
  }[];
  safety?: Safety;
};
type ReadinessContract = {
  decision?: string;
  currentGate?: {
    state?: string;
    scoreBand?: string;
    doctorDecision?: string;
    nextCommand?: string;
  };
  safety?: Safety;
};
type Result = {
  id: string;
  status: 'PASS' | 'FAIL';
  evidence: string;
};
type RunbookStep = {
  order: number;
  id: string;
  state: string;
  action: string;
  command: string;
  evidenceRequired: string[];
  unblockEvidence: string;
  source: string;
};

const runDir = 'gateforge-audit/run-2026-06-23-1035';
const moatPath = 'docs/SAAS_MOAT_EXECUTION_STATUS.json';
const operatorPath = `${runDir}/50_operator_execution_packet.json`;
const dependencyPath = `${runDir}/53_hosted_dependency_chain.json`;
const contractPath = `${runDir}/54_hosted_readiness_contract.json`;
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : `${runDir}/55_open_p0_terminal_runbook.md`;
const jsonOutIndex = process.argv.indexOf('--json-out');
const jsonOutPath = jsonOutIndex >= 0 ? process.argv[jsonOutIndex + 1] : `${runDir}/55_open_p0_terminal_runbook.json`;
const checkOnly = process.argv.includes('--check');

function fail(message: string): never {
  console.error(`GateForge open P0 terminal runbook: FAIL - ${message}`);
  process.exit(1);
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) fail(`missing ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function safe(safety: Safety | undefined): boolean {
  return safety?.secretValuesPrinted === false && safety.productionMutated === false && safety.sourceDumpsIncluded === false;
}

function ids(start: number, end: number): string[] {
  return Array.from({ length: end - start + 1 }, (_, index) => `GF-${String(start + index).padStart(3, '0')}`);
}

function sameSet(actual: string[], expected: string[]): boolean {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

function pass(id: string, evidence: string): Result {
  return { id, status: 'PASS', evidence };
}

function failResult(id: string, evidence: string): Result {
  return { id, status: 'FAIL', evidence };
}

function normalizeGenerated(text: string): string {
  return text.replace(/^Generated: `[^`]+`$/gm, 'Generated: `<normalized>`').replace(/"generatedAt": "[^"]+"/g, '"generatedAt": "<normalized>"');
}

function assertFresh(filePath: string, expected: string): void {
  if (!fs.existsSync(filePath)) fail(`${filePath} is missing`);
  const actual = fs.readFileSync(filePath, 'utf8');
  if (normalizeGenerated(actual) !== normalizeGenerated(expected)) fail(`${filePath} is stale; rerun npm run gateforge:open-p0-runbook`);
}

function toMdList(values: string[]): string {
  return values.length ? values.map((value) => `- ${value}`).join('\n') : '- None';
}

function evaluate() {
  const moat = readJson<MoatStatus>(moatPath);
  const operator = readJson<OperatorPacket>(operatorPath);
  const dependency = readJson<DependencyChain>(dependencyPath);
  const contract = readJson<ReadinessContract>(contractPath);
  const expectedExternal = ids(1, 16);
  const expectedDependencies = ['GF-017', 'GF-018', 'GF-019', 'GF-021', 'GF-022'];
  const expectedOpenP0 = [...expectedExternal, ...expectedDependencies];
  const openP0 = moat.openP0 ?? [];
  const operatorRows = operator.rows ?? [];
  const dependencySteps = dependency.chain ?? [];
  const results: Result[] = [];

  results.push(
    moat.total === 165
      ? pass('MOAT-TOTAL', 'The moat board still tracks 165 actions.')
      : failResult('MOAT-TOTAL', `expected 165 actions, found ${moat.total ?? 'missing'}`),
  );
  results.push(
    sameSet(openP0.map((row) => row.id), expectedOpenP0)
      ? pass('OPEN-P0-SCOPE', 'Open P0 scope is exactly GF-001..GF-016 plus GF-017, GF-018, GF-019, GF-021, GF-022.')
      : failResult('OPEN-P0-SCOPE', `unexpected open P0 ids: ${openP0.map((row) => row.id).join(', ')}`),
  );
  results.push(
    moat.byState?.EVIDENCE_FILE_PRESENT === 144 &&
      moat.byState.BLOCKED_EXTERNAL === 16 &&
      moat.byState.BLOCKED_BY_SECRET_READINESS === 2 &&
      moat.byState.BLOCKED_BY_HOSTED_ATTESTATION === 2 &&
      moat.byState.BLOCKED_BY_GITHUB_SECRET_READINESS === 1
      ? pass('OPEN-P0-STATE-COUNTS', 'Open state counts match the current 144/21 split.')
      : failResult('OPEN-P0-STATE-COUNTS', `unexpected state counts: ${JSON.stringify(moat.byState ?? {})}`),
  );
  results.push(
    operator.total === 16 && operatorRows.length === 16 && operator.counts?.LOCAL_SECRET_PENDING === 16
      ? pass('OPERATOR-PACKET-COVERS-EXTERNAL', 'Operator packet covers all 16 external blockers at LOCAL_SECRET_PENDING.')
      : failResult('OPERATOR-PACKET-COVERS-EXTERNAL', `operator total=${operator.total ?? 'missing'} rows=${operatorRows.length} counts=${JSON.stringify(operator.counts ?? {})}`),
  );
  results.push(
    sameSet(operatorRows.map((row) => row.id), expectedExternal) &&
      operatorRows.every((row) => row.secrets?.length && row.validationCommands?.length && row.evidenceRequired?.length && row.nextAction)
      ? pass('EXTERNAL-ROWS-COMPLETE', 'Every external blocker has secrets, validation commands, evidence requirements, and next action.')
      : failResult('EXTERNAL-ROWS-COMPLETE', 'one or more external blocker rows are incomplete.'),
  );
  results.push(
    dependency.decision === 'PASS' &&
      sameSet(dependencySteps.map((step) => step.id), expectedDependencies) &&
      dependencySteps.every((step) => step.command && step.evidenceRequired?.length && step.outputEvidence?.length)
      ? pass('DEPENDENCY-CHAIN-COVERS-GATES', 'Dependency chain covers the five remaining hosted-secret gates.')
      : failResult('DEPENDENCY-CHAIN-COVERS-GATES', `dependency decision=${dependency.decision ?? 'missing'} ids=${dependencySteps.map((step) => step.id).join(', ')}`),
  );
  results.push(
    contract.decision === 'PASS' &&
      contract.currentGate?.state === 'CANNOT_APPROVE_LOCAL_EVIDENCE' &&
      contract.currentGate.doctorDecision === 'REPLACE_LOCAL_SECRET_PLACEHOLDERS'
      ? pass('READINESS-CONTRACT-HONEST', 'Readiness contract confirms local-only approval is not allowed.')
      : failResult('READINESS-CONTRACT-HONEST', `contract=${contract.decision ?? 'missing'} gate=${JSON.stringify(contract.currentGate ?? {})}`),
  );
  results.push(
    safe(operator.safety) && safe(dependency.safety) && safe(contract.safety)
      ? pass('SOURCE-SAFETY', 'Source artifacts confirm no secrets printed, no production mutation, and no source dumps.')
      : failResult('SOURCE-SAFETY', 'one or more source artifact safety flags are unsafe.'),
  );

  const openById = new Map(openP0.map((row) => [row.id, row]));
  const externalSteps: RunbookStep[] = expectedExternal.map((id, index) => {
    const open = openById.get(id);
    const operatorRow = operatorRows.find((row) => row.id === id);
    return {
      order: index + 1,
      id,
      state: open?.state ?? 'UNKNOWN',
      action: open?.action ?? 'UNKNOWN',
      command: 'npm run gateforge:operator-execution-packet',
      evidenceRequired: operatorRow?.evidenceRequired ?? [open?.evidence ?? 'UNKNOWN'],
      unblockEvidence: open?.unblockEvidence ?? 'UNKNOWN',
      source: operatorPath,
    };
  });
  const dependencyRunbookSteps: RunbookStep[] = dependencySteps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((step, index) => {
      const open = openById.get(step.id);
      return {
        order: expectedExternal.length + index + 1,
        id: step.id,
        state: open?.state ?? step.failureMode ?? 'UNKNOWN',
        action: open?.action ?? 'UNKNOWN',
        command: step.command,
        evidenceRequired: step.evidenceRequired ?? [open?.evidence ?? 'UNKNOWN'],
        unblockEvidence: open?.unblockEvidence ?? 'UNKNOWN',
        source: dependencyPath,
      };
    });
  const steps = [...externalSteps, ...dependencyRunbookSteps];

  results.push(
    steps.length === 21 && sameSet(steps.map((step) => step.id), expectedOpenP0)
      ? pass('RUNBOOK-COVERS-21-P0', 'Terminal runbook has one ordered row for every open P0 blocker.')
      : failResult('RUNBOOK-COVERS-21-P0', `runbook steps=${steps.length} ids=${steps.map((step) => step.id).join(', ')}`),
  );

  const decision = results.every((result) => result.status === 'PASS') ? 'PASS' : 'FAIL';
  return {
    generatedAt: new Date().toISOString(),
    decision,
    currentGate: {
      state: contract.currentGate?.state ?? 'UNKNOWN',
      scoreBand: contract.currentGate?.scoreBand ?? 'UNKNOWN',
      doctorDecision: contract.currentGate?.doctorDecision ?? 'UNKNOWN',
      nextCommand: contract.currentGate?.nextCommand ?? 'UNKNOWN',
    },
    source: {
      moatPath,
      operatorPath,
      dependencyPath,
      contractPath,
    },
    counts: {
      totalMoatActions: moat.total ?? 0,
      evidenceFilePresent: moat.byState?.EVIDENCE_FILE_PRESENT ?? 0,
      openP0: openP0.length,
      externalBlockers: expectedExternal.length,
      dependencyGates: expectedDependencies.length,
    },
    commandOrder: [
      'npm run gateforge:local-secrets-env-template',
      'npm run gateforge:import-local-secrets -- --env-file /secure/path/fnnlr-staging.env --require-all',
      'npm run gateforge:local-secret-files-check',
      'npm run gateforge:hosted-readiness-doctor',
      'npm run gateforge:hosted-unblock -- --dry-run --prepare-attestation',
      'npm run gateforge:hosted-unblock -- --apply --prepare-attestation',
      'npm run gateforge:trigger-hosted-strict',
      'npm run gateforge:final-gate',
      'npm run gateforge:final-report',
    ],
    steps,
    results,
    safety: {
      secretValuesPrinted: false,
      productionMutated: false,
      sourceDumpsIncluded: false,
    },
  };
}

function renderMarkdown(report: ReturnType<typeof evaluate>): string {
  const commandRows = report.commandOrder.map((command, index) => `| ${index + 1} | \`${command}\` |`).join('\n');
  const stepRows = report.steps
    .map((step) => `| ${step.order} | \`${step.id}\` | \`${step.state}\` | ${step.action.replace(/\|/g, '\\|')} | \`${step.command}\` |`)
    .join('\n');
  const resultRows = report.results
    .map((result) => `| \`${result.id}\` | \`${result.status}\` | ${result.evidence.replace(/\|/g, '\\|')} |`)
    .join('\n');
  const detailSections = report.steps
    .map(
      (step) => `### ${step.order}. ${step.id} - ${step.action}

State: \`${step.state}\`

Command:

\`\`\`bash
${step.command}
\`\`\`

Evidence required:
${toMdList(step.evidenceRequired)}

Unblock evidence: ${step.unblockEvidence}

Source: \`${step.source}\`
`,
    )
    .join('\n');

  return `# Open P0 Terminal Runbook

Generated: \`${report.generatedAt}\`

Decision: \`${report.decision}\`

This runbook is the terminal operator bridge for the remaining GateForge P0 work. It combines the 16 external provider/runtime blockers with the 5 hosted-secret dependency gates. It contains secret names and commands only, never secret values.

## Current Gate

- Gate state: \`${report.currentGate.state}\`
- Score band: \`${report.currentGate.scoreBand}\`
- Doctor decision: \`${report.currentGate.doctorDecision}\`
- Next command: \`${report.currentGate.nextCommand}\`

## Counts

- Total moat actions: \`${report.counts.totalMoatActions}\`
- Evidence-file present: \`${report.counts.evidenceFilePresent}\`
- Open P0: \`${report.counts.openP0}\`
- External blockers: \`${report.counts.externalBlockers}\`
- Dependency gates: \`${report.counts.dependencyGates}\`

## Command Order

| Order | Command |
| ---: | --- |
${commandRows}

## Open P0 Matrix

| Order | ID | State | Action | Command |
| ---: | --- | --- | --- | --- |
${stepRows}

## Validation Results

| Check | Status | Evidence |
| --- | --- | --- |
${resultRows}

## Details

${detailSections}
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
  if (report.decision !== 'PASS') fail(`runbook decision is ${report.decision}`);
  assertFresh(outPath, markdown);
  assertFresh(jsonOutPath, json);
  console.log('GateForge open P0 terminal runbook: PASS');
  console.log(`  checked ${outPath}`);
  console.log(`  checked ${jsonOutPath}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, markdown);
fs.mkdirSync(path.dirname(jsonOutPath), { recursive: true });
fs.writeFileSync(jsonOutPath, json);

if (report.decision !== 'PASS') fail(`runbook decision is ${report.decision}; wrote ${outPath}`);

console.log('GateForge open P0 terminal runbook: PASS');
console.log(`  wrote ${outPath}`);
console.log(`  wrote ${jsonOutPath}`);
