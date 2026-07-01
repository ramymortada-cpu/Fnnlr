#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

type Safety = {
  secretValuesPrinted?: boolean;
  productionMutated?: boolean;
  sourceDumpsIncluded?: boolean;
  sourceCodeFixesAppliedByThisCommand?: boolean;
};
type MoatStatusRow = {
  id: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  phase: string;
  executionState: string;
  nextCommand?: string;
  unblockEvidence?: string;
};
type MoatStatus = {
  total?: number;
  byState?: Record<string, number>;
  rows?: MoatStatusRow[];
  openP0?: MoatStatusRow[];
};
type GateStatus = {
  decision?: {
    state?: string;
    scoreBand?: string;
    nextAction?: string;
  };
  probes?: Record<string, { status?: string; detail?: string; url?: string }>;
  blockers?: {
    openExternalBlockers?: string[];
    openRuntimeSecrets?: string[];
    openAttestationSecrets?: string[];
    externalBlockerProgressCounts?: Record<string, number>;
  };
  evidenceScope?: {
    localSecretReadinessIsGaEvidence?: boolean;
    hostedStrictWorkflowRequiredForGa?: boolean;
  };
  safety?: Safety;
};
type OperatorPacketRow = {
  id: string;
  status: string;
  secrets?: string[];
  evidenceRequired?: string[];
  validationCommands?: string[];
  exitCriteria?: string;
  nextAction?: string;
};
type OperatorPacket = {
  total?: number;
  counts?: Record<string, number>;
  rows?: OperatorPacketRow[];
  safety?: Safety;
};
type RunAudit = {
  decision?: string;
  run?: {
    databaseId?: number;
    status?: string;
    conclusion?: string;
    url?: string;
  };
  counts?: {
    failureAnnotations?: number;
  };
  safety?: Safety;
};
type ValidationResult = {
  id: string;
  status: 'PASS' | 'FAIL';
  evidence: string;
};

const runDir = 'gateforge-audit/run-2026-06-23-1035';
const moatStatusPath = 'docs/SAAS_MOAT_EXECUTION_STATUS.json';
const gateStatusPath = `${runDir}/47_ga_unblock_status.json`;
const operatorPacketPath = `${runDir}/50_operator_execution_packet.json`;
const runAuditPath = `${runDir}/51_ga_evidence_run_audit.json`;
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : `${runDir}/52_external_closeout_validator.md`;
const jsonOutIndex = process.argv.indexOf('--json-out');
const jsonOutPath = jsonOutIndex >= 0 ? process.argv[jsonOutIndex + 1] : `${runDir}/52_external_closeout_validator.json`;
const checkOnly = process.argv.includes('--check');
const allowFailures = process.argv.includes('--allow-failures');

function fail(message: string): never {
  console.error(`GateForge external closeout validator: FAIL - ${message}`);
  process.exit(1);
}

function readJson<T>(file: string): T {
  if (!fs.existsSync(file)) fail(`missing ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function safeFlags(safety: Safety | undefined, allowSourceCodeFlag = false) {
  const baseSafe =
    safety?.secretValuesPrinted === false &&
    safety?.productionMutated === false;
  if (!baseSafe) return false;
  if (allowSourceCodeFlag) return safety?.sourceCodeFixesAppliedByThisCommand === false;
  return safety?.sourceDumpsIncluded === false;
}

function ids(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => `GF-${String(start + index).padStart(3, '0')}`);
}

function pass(id: string, evidence: string): ValidationResult {
  return { id, status: 'PASS', evidence };
}

function failResult(id: string, evidence: string): ValidationResult {
  return { id, status: 'FAIL', evidence };
}

function evaluate() {
  const moat = readJson<MoatStatus>(moatStatusPath);
  const gate = readJson<GateStatus>(gateStatusPath);
  const operator = readJson<OperatorPacket>(operatorPacketPath);
  const runAudit = readJson<RunAudit>(runAuditPath);
  const expectedExternalIds = ids(1, 16);
  const expectedDependencyIds = ['GF-017', 'GF-018', 'GF-019', 'GF-021', 'GF-022'];
  const results: ValidationResult[] = [];
  const rows = moat.rows ?? [];
  const openP0 = moat.openP0 ?? [];
  const byState = moat.byState ?? {};
  const operatorRows = operator.rows ?? [];

  results.push(
    moat.total === 165 && rows.length === 165
      ? pass('MOAT-165-ROWS', 'docs/SAAS_MOAT_EXECUTION_STATUS.json has 165 row-level records.')
      : failResult('MOAT-165-ROWS', `expected 165 rows, found total=${moat.total ?? 'missing'} rows=${rows.length}`),
  );
  results.push(
    byState.EVIDENCE_FILE_PRESENT === 144
      ? pass('MOAT-LOCAL-EVIDENCE', '144 actions are backed by evidence files.')
      : failResult('MOAT-LOCAL-EVIDENCE', `expected 144 evidence-file-present actions, found ${byState.EVIDENCE_FILE_PRESENT ?? 'missing'}`),
  );
  results.push(
    byState.BLOCKED_EXTERNAL === 16
      ? pass('MOAT-EXTERNAL-COUNT', '16 remaining items are externally blocked provider/runtime evidence.')
      : failResult('MOAT-EXTERNAL-COUNT', `expected 16 external blockers, found ${byState.BLOCKED_EXTERNAL ?? 'missing'}`),
  );

  const openP0Ids = openP0.map((row) => row.id).sort();
  const expectedOpenP0Ids = [...expectedExternalIds, ...expectedDependencyIds].sort();
  results.push(
    JSON.stringify(openP0Ids) === JSON.stringify(expectedOpenP0Ids)
      ? pass('P0-SCOPE', 'Open P0 scope is exactly GF-001..GF-016 plus hosted-secret dependency gates GF-017, GF-018, GF-019, GF-021, GF-022.')
      : failResult('P0-SCOPE', `unexpected open P0 ids: ${openP0Ids.join(', ') || 'none'}`),
  );

  const gateExternalIds = gate.blockers?.openExternalBlockers ?? [];
  results.push(
    JSON.stringify([...gateExternalIds].sort()) === JSON.stringify(expectedExternalIds)
      ? pass('GATE-EXTERNAL-SCOPE', 'GA unblock status lists GF-001..GF-016 as the only open external blockers.')
      : failResult('GATE-EXTERNAL-SCOPE', `unexpected gate external ids: ${gateExternalIds.join(', ') || 'none'}`),
  );
  results.push(
    gate.decision?.state === 'CANNOT_APPROVE_LOCAL_EVIDENCE' && gate.decision.scoreBand === '65-70/100'
      ? pass('GATE-DECISION-HONESTY', 'Gate remains CANNOT_APPROVE_LOCAL_EVIDENCE at 65-70/100 until hosted proof exists.')
      : failResult('GATE-DECISION-HONESTY', `decision=${gate.decision?.state ?? 'missing'} score=${gate.decision?.scoreBand ?? 'missing'}`),
  );
  results.push(
    gate.evidenceScope?.localSecretReadinessIsGaEvidence === false && gate.evidenceScope.hostedStrictWorkflowRequiredForGa === true
      ? pass('EVIDENCE-SCOPE', 'Local secret readiness is not treated as GA evidence; hosted strict workflow remains required.')
      : failResult('EVIDENCE-SCOPE', 'evidence scope does not clearly require hosted strict proof.'),
  );
  results.push(
    safeFlags(gate.safety, true)
      ? pass('GATE-SAFETY', 'GA unblock status safety flags confirm no secrets printed and no production mutation.')
      : failResult('GATE-SAFETY', 'GA unblock status safety flags are not all safe.'),
  );

  results.push(
    operator.total === 16 && operatorRows.length === 16
      ? pass('OPERATOR-PACKET-SCOPE', 'Operator packet has 16 blocker rows.')
      : failResult('OPERATOR-PACKET-SCOPE', `operator total=${operator.total ?? 'missing'} rows=${operatorRows.length}`),
  );
  const incompleteOperatorRows = operatorRows.filter(
    (row) =>
      !expectedExternalIds.includes(row.id) ||
      !row.secrets?.length ||
      !row.evidenceRequired?.length ||
      !row.validationCommands?.length ||
      !row.exitCriteria?.trim() ||
      !row.nextAction?.trim(),
  );
  results.push(
    incompleteOperatorRows.length === 0
      ? pass('OPERATOR-PACKET-COMPLETE', 'Every operator blocker has secret names, evidence requirements, validation commands, exit criteria, and next action.')
      : failResult('OPERATOR-PACKET-COMPLETE', `incomplete rows: ${incompleteOperatorRows.map((row) => row.id).join(', ')}`),
  );
  results.push(
    operator.counts?.LOCAL_SECRET_PENDING === 16 && operator.counts.GITHUB_SECRET_PENDING === 0 && operator.counts.HOSTED_EVIDENCE_PENDING === 0
      ? pass('OPERATOR-PACKET-STATE', 'Current next step is local secret replacement for all 16 external blockers.')
      : failResult('OPERATOR-PACKET-STATE', `unexpected counts: ${JSON.stringify(operator.counts ?? {})}`),
  );
  results.push(
    safeFlags(operator.safety)
      ? pass('OPERATOR-PACKET-SAFETY', 'Operator packet safety flags confirm no secrets printed, no production mutation, and no source dump.')
      : failResult('OPERATOR-PACKET-SAFETY', 'operator packet safety flags are not all safe.'),
  );

  results.push(
    runAudit.decision === 'PASS' && runAudit.run?.status === 'completed' && runAudit.run.conclusion === 'success'
      ? pass('GA-EVIDENCE-WORKFLOW', `GateForge GA Evidence workflow passed: ${runAudit.run.url ?? `run ${runAudit.run.databaseId}`}.`)
      : failResult('GA-EVIDENCE-WORKFLOW', `workflow audit decision=${runAudit.decision ?? 'missing'} status=${runAudit.run?.status ?? 'missing'} conclusion=${runAudit.run?.conclusion ?? 'missing'}`),
  );
  results.push(
    runAudit.counts?.failureAnnotations === 0
      ? pass('GA-EVIDENCE-ANNOTATIONS', 'Latest successful GA evidence workflow has zero failure annotations.')
      : failResult('GA-EVIDENCE-ANNOTATIONS', `failure annotations=${runAudit.counts?.failureAnnotations ?? 'missing'}`),
  );
  results.push(
    safeFlags(runAudit.safety)
      ? pass('GA-EVIDENCE-SAFETY', 'GA evidence run audit safety flags confirm no secrets printed, no production mutation, and no source dump.')
      : failResult('GA-EVIDENCE-SAFETY', 'GA evidence run audit safety flags are not all safe.'),
  );

  return {
    generatedAt: new Date().toISOString(),
    decision: results.every((result) => result.status === 'PASS') ? 'PASS' : 'FAIL',
    scoreBand: gate.decision?.scoreBand ?? 'UNKNOWN',
    gateState: gate.decision?.state ?? 'UNKNOWN',
    nextAction: gate.decision?.nextAction ?? 'UNKNOWN',
    source: {
      moatStatusPath,
      gateStatusPath,
      operatorPacketPath,
      runAuditPath,
    },
    counts: {
      totalMoatActions: moat.total ?? 0,
      evidenceFilePresent: byState.EVIDENCE_FILE_PRESENT ?? 0,
      externalBlockers: byState.BLOCKED_EXTERNAL ?? 0,
      dependencyBlockers:
        (byState.BLOCKED_BY_SECRET_READINESS ?? 0) +
        (byState.BLOCKED_BY_HOSTED_ATTESTATION ?? 0) +
        (byState.BLOCKED_BY_GITHUB_SECRET_READINESS ?? 0),
      operatorRows: operatorRows.length,
      runtimeSecretsOpen: gate.blockers?.openRuntimeSecrets?.length ?? 0,
      attestationSecretOptionsOpen: gate.blockers?.openAttestationSecrets?.length ?? 0,
    },
    results,
    safety: {
      secretValuesPrinted: false,
      productionMutated: false,
      sourceDumpsIncluded: false,
    },
  };
}

function renderMarkdown(report: ReturnType<typeof evaluate>) {
  const resultRows = report.results
    .map((result) => `| \`${result.id}\` | \`${result.status}\` | ${result.evidence.replace(/\|/g, '\\|')} |`)
    .join('\n');
  return `# GateForge External Closeout Validator

Generated: \`${report.generatedAt}\`

Decision: \`${report.decision}\`

Gate state: \`${report.gateState}\`

Score band: \`${report.scoreBand}\`

This validator proves the current local execution boundary for the 165-point SaaS moat board. It does not approve GA. It confirms that local evidence is organized, the remaining P0 work is explicitly external/hosted, and no secret values or source dumps are included.

## Source Files

- Moat status: \`${report.source.moatStatusPath}\`
- GA unblock status: \`${report.source.gateStatusPath}\`
- Operator packet: \`${report.source.operatorPacketPath}\`
- GA evidence run audit: \`${report.source.runAuditPath}\`

## Counts

- Total moat actions: \`${report.counts.totalMoatActions}\`
- Evidence-file-present actions: \`${report.counts.evidenceFilePresent}\`
- External blockers: \`${report.counts.externalBlockers}\`
- Hosted dependency blockers: \`${report.counts.dependencyBlockers}\`
- Operator packet rows: \`${report.counts.operatorRows}\`
- Open runtime secrets: \`${report.counts.runtimeSecretsOpen}\`
- Open attestation secret options: \`${report.counts.attestationSecretOptionsOpen}\`

## Validation Results

| Check | Status | Evidence |
| --- | --- | --- |
${resultRows}

## Next Action

${report.nextAction}

## Safety

- Secret values printed: \`NO\`
- Production mutated: \`NO\`
- Source dumps included: \`NO\`
`;
}

const report = evaluate();
const md = renderMarkdown(report);
const json = `${JSON.stringify(report, null, 2)}\n`;

if (checkOnly) {
  const expectedTimestamp = 'CHECK_TIMESTAMP';
  const expectedMd = renderMarkdown({ ...report, generatedAt: expectedTimestamp });
  const expectedJson = `${JSON.stringify({ ...report, generatedAt: expectedTimestamp }, null, 2)}\n`;
  const currentMd = fs.existsSync(outPath)
    ? fs.readFileSync(outPath, 'utf8').replace(/Generated: `[^`]+`/, `Generated: \`${expectedTimestamp}\``)
    : '';
  const currentJson = fs.existsSync(jsonOutPath)
    ? `${JSON.stringify({ ...JSON.parse(fs.readFileSync(jsonOutPath, 'utf8')), generatedAt: expectedTimestamp }, null, 2)}\n`
    : '';
  if (currentMd !== expectedMd || currentJson !== expectedJson) fail('generated external closeout validator is stale');
  if (report.decision !== 'PASS') fail('external closeout validator checks are failing');
  console.log('GateForge external closeout validator: PASS');
  process.exit(0);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md);
fs.writeFileSync(jsonOutPath, json);
console.log(`GateForge external closeout validator: ${report.decision}`);
console.log(`  wrote ${outPath}`);
console.log(`  wrote ${jsonOutPath}`);
if (report.decision !== 'PASS' && !allowFailures) process.exit(1);
