#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

type CloseoutBlocker = {
  id: string;
  secrets: string[];
  validationCommands: string[];
  evidenceRequired: string[];
  exitCriteria: string;
};

type CloseoutJson = {
  status?: string;
  count?: number;
  blockers?: CloseoutBlocker[];
  safety?: {
    secretValuesPrinted?: boolean;
    productionMutated?: boolean;
    sourceDumpsIncluded?: boolean;
  };
};

type AcceptanceRow = {
  secret: string;
  kind: 'runtime' | 'attestation';
  requirement: 'required' | 'one_of_attestation';
  blockerIds: string[];
  validationCommands: string[];
  evidenceRequired: string[];
  acceptanceRule: string;
};

const runDir = 'gateforge-audit/run-2026-06-23-1035';
const closeoutPath = `${runDir}/48_remaining_external_blocker_closeout.json`;
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : `${runDir}/60_hosted_secret_acceptance_matrix.md`;
const jsonOutIndex = process.argv.indexOf('--json-out');
const jsonOutPath = jsonOutIndex >= 0 ? process.argv[jsonOutIndex + 1] : `${runDir}/60_hosted_secret_acceptance_matrix.json`;
const checkOnly = process.argv.includes('--check');

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function unique(values: string[]) {
  return [...new Set(values)].sort();
}

function validateCloseout(closeout: CloseoutJson): string[] {
  const errors: string[] = [];
  const expectedIds = Array.from({ length: 16 }, (_, index) => `GF-${String(index + 1).padStart(3, '0')}`);
  const ids = closeout.blockers?.map((blocker) => blocker.id) ?? [];
  const safe =
    closeout.safety?.secretValuesPrinted === false &&
    closeout.safety?.productionMutated === false &&
    closeout.safety?.sourceDumpsIncluded === false;

  if (closeout.status !== 'BLOCKED_EXTERNAL') errors.push(`closeout status is ${closeout.status || 'missing'}`);
  if (closeout.count !== 16) errors.push(`closeout count is ${closeout.count ?? 'missing'}`);
  if (!safe) errors.push('closeout safety flags are not all false');
  for (const id of expectedIds) if (!ids.includes(id)) errors.push(`closeout missing ${id}`);
  for (const id of ids) if (!expectedIds.includes(id)) errors.push(`closeout has unexpected ${id}`);
  return errors;
}

function acceptanceRule(secret: string, kind: AcceptanceRow['kind']) {
  if (kind === 'attestation') {
    return `${secret} may be missing only when the alternate attestation option is READY; at least one attestation option must pass strict external evidence validation.`;
  }
  return `${secret} must be present, non-empty, non-placeholder, provider-valid for hosted staging, uploaded to GitHub Actions by name, and proven by the listed validation commands. Values with MISSING, EMPTY, PLACEHOLDER, or INVALID status are rejected.`;
}

function buildRows(closeout: CloseoutJson): AcceptanceRow[] {
  const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();
  const blockers = closeout.blockers ?? [];
  const rows: AcceptanceRow[] = [];

  for (const secret of runtimeSecrets) {
    const mapped = blockers.filter((blocker) => blocker.secrets.includes(secret));
    const blockerIds = unique([...mapped.map((blocker) => blocker.id), 'GF-017', 'GF-022']);
    const validationCommands = unique([
      ...mapped.flatMap((blocker) => blocker.validationCommands),
      'npm run gateforge:local-secret-files-check',
      'npm run gateforge:github-secrets-audit',
    ]);
    const evidenceRequired = unique([
      ...mapped.flatMap((blocker) => blocker.evidenceRequired),
      'Local secret file readiness PASS without printing values.',
      'GitHub Actions secret name present without printing values.',
    ]);
    rows.push({
      secret,
      kind: 'runtime',
      requirement: 'required',
      blockerIds,
      validationCommands,
      evidenceRequired,
      acceptanceRule: acceptanceRule(secret, 'runtime'),
    });
  }

  for (const secret of attestationSecrets) {
    rows.push({
      secret,
      kind: 'attestation',
      requirement: 'one_of_attestation',
      blockerIds: ['GF-018', 'GF-019', 'GF-022'],
      validationCommands: ['npm run gateforge:external-check', 'npm run gateforge:attestation-secret-pack'],
      evidenceRequired: ['Hosted staging attestation packet with explicit PASS mapping for GF-001..GF-016.'],
      acceptanceRule: acceptanceRule(secret, 'attestation'),
    });
  }

  return rows;
}

function validateRows(rows: AcceptanceRow[]): string[] {
  const errors: string[] = [];
  const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();
  const allSecrets = [...runtimeSecrets, ...attestationSecrets];
  const rowSecrets = rows.map((row) => row.secret);
  const requiredCommands = [
    'npm run gateforge:local-secret-files-check',
    'npm run gateforge:github-secrets-audit',
    'npm run gateforge:external-check',
    'npm run gateforge:attestation-secret-pack',
  ];

  for (const secret of allSecrets) if (!rowSecrets.includes(secret)) errors.push(`missing acceptance row for ${secret}`);
  for (const secret of rowSecrets) if (!allSecrets.includes(secret)) errors.push(`unexpected acceptance row for ${secret}`);
  for (const row of rows) {
    if (!row.blockerIds.length) errors.push(`${row.secret} has no blocker mapping`);
    if (!row.validationCommands.length) errors.push(`${row.secret} has no validation commands`);
    if (!row.evidenceRequired.length) errors.push(`${row.secret} has no evidence requirements`);
    if (
      row.kind === 'runtime' &&
      !/MISSING, EMPTY, PLACEHOLDER, or INVALID status are rejected\./.test(row.acceptanceRule)
    ) {
      errors.push(`${row.secret} runtime acceptance rule must reject placeholders without ambiguity`);
    }
  }
  const commandCoverage = rows.flatMap((row) => row.validationCommands);
  for (const command of requiredCommands) {
    if (!commandCoverage.includes(command)) errors.push(`matrix does not include required command ${command}`);
  }
  return errors;
}

function renderMarkdown(generatedAt: string, rows: AcceptanceRow[]) {
  const runtimeRows = rows.filter((row) => row.kind === 'runtime').length;
  const attestationRows = rows.filter((row) => row.kind === 'attestation').length;
  const table = rows
    .map(
      (row) =>
        `| \`${row.secret}\` | \`${row.kind}\` | \`${row.requirement}\` | ${row.blockerIds.map((id) => `\`${id}\``).join(', ')} | ${row.validationCommands.map((command) => `\`${command}\``).join('<br>')} | ${row.acceptanceRule} |`,
    )
    .join('\n');

  return `# GateForge Hosted Secret Acceptance Matrix

Generated: \`${generatedAt}\`

This matrix is the machine-checkable acceptance contract for the hosted secret and attestation work still blocking GA. It contains names and rules only; it must never contain secret values.

## Scope

- Runtime secret rows: \`${runtimeRows}\`
- Attestation option rows: \`${attestationRows}\`
- External blocker source: \`${closeoutPath}\`
- Status: \`BLOCKED_UNTIL_REAL_STAGING_VALUES_AND_HOSTED_ATTESTATION\`

## Acceptance Matrix

| Secret | Kind | Requirement | Blockers | Validation commands | Acceptance rule |
| --- | --- | --- | --- | --- | --- |
${table}

## Global Rules

- Every runtime secret must reject \`MISSING\`, \`EMPTY\`, \`PLACEHOLDER\`, and invalid provider-shaped values.
- At least one attestation option must be READY; prefer \`GATEFORGE_HOSTED_STAGING_ATTESTATION_B64\`.
- Hosted attestation must explicitly close every \`GF-001..GF-016\` blocker before it can support \`CONDITIONAL_GO\`.
- Passing local checks is not GA approval without hosted runtime evidence.
- Secret values printed: \`NO\`
- Production mutated: \`NO\`
- Source dumps included: \`NO\`
`;
}

function renderJson(generatedAt: string, rows: AcceptanceRow[]) {
  return {
    generatedAt,
    status: 'BLOCKED_UNTIL_REAL_STAGING_VALUES_AND_HOSTED_ATTESTATION',
    source: closeoutPath,
    counts: {
      runtimeSecrets: rows.filter((row) => row.kind === 'runtime').length,
      attestationOptions: rows.filter((row) => row.kind === 'attestation').length,
      totalRows: rows.length,
    },
    rows,
    safety: {
      secretValuesPrinted: false,
      productionMutated: false,
      sourceDumpsIncluded: false,
    },
  };
}

const closeout = readJson<CloseoutJson>(closeoutPath);
const inputErrors = validateCloseout(closeout);
const rows = buildRows(closeout);
const rowErrors = validateRows(rows);
const errors = [...inputErrors, ...rowErrors];
if (errors.length) {
  console.error('GateForge hosted secret acceptance matrix: FAIL');
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}

if (checkOnly) {
  const expectedGeneratedAt = 'CHECK_TIMESTAMP';
  const expectedMd = `${renderMarkdown(expectedGeneratedAt, rows).trimEnd()}\n`;
  const expectedJson = `${JSON.stringify(renderJson(expectedGeneratedAt, rows), null, 2)}\n`;
  const checkErrors: string[] = [];

  if (!fs.existsSync(outPath)) {
    checkErrors.push(`missing generated markdown: ${outPath}`);
  } else {
    const currentMd = fs.readFileSync(outPath, 'utf8').replace(/Generated: `[^`]+`/, `Generated: \`${expectedGeneratedAt}\``);
    if (currentMd !== expectedMd) checkErrors.push(`stale generated markdown: ${outPath}`);
  }

  if (!fs.existsSync(jsonOutPath)) {
    checkErrors.push(`missing generated json: ${jsonOutPath}`);
  } else {
    const currentJson = JSON.parse(fs.readFileSync(jsonOutPath, 'utf8')) as ReturnType<typeof renderJson>;
    const normalizedJson = `${JSON.stringify({ ...currentJson, generatedAt: expectedGeneratedAt }, null, 2)}\n`;
    if (normalizedJson !== expectedJson) checkErrors.push(`stale generated json: ${jsonOutPath}`);
  }

  if (checkErrors.length) {
    console.error('GateForge hosted secret acceptance matrix: FAIL');
    checkErrors.forEach((error) => console.error(`  - ${error}`));
    console.error('Run: npm run gateforge:hosted-secret-acceptance-matrix');
    process.exit(1);
  }

  console.log(`GateForge hosted secret acceptance matrix: PASS (${rows.length} rows)`);
  process.exit(0);
}

const generatedAt = new Date().toISOString();
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${renderMarkdown(generatedAt, rows).trimEnd()}\n`);
fs.writeFileSync(jsonOutPath, `${JSON.stringify(renderJson(generatedAt, rows), null, 2)}\n`);
console.log(`GateForge hosted secret acceptance matrix: wrote ${outPath}`);
console.log(`GateForge hosted secret acceptance matrix: wrote ${jsonOutPath}`);
