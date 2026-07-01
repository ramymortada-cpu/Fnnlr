#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

type BlockerStatus = 'LOCAL_SECRET_PENDING' | 'GITHUB_SECRET_PENDING' | 'HOSTED_EVIDENCE_PENDING';
type CloseoutBlocker = {
  id: string;
  owner: string;
  action: string;
  secrets: string[];
  providerSetup: string[];
  evidenceRequired: string[];
  validationCommands: string[];
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
type ProgressRow = {
  id: string;
  status: BlockerStatus;
  localReady: number;
  githubReady: number;
  secretCount: number;
  nextAction: string;
};
type ProgressJson = {
  total?: number;
  counts?: Record<BlockerStatus, number>;
  rows?: ProgressRow[];
  safety?: {
    secretValuesPrinted?: boolean;
    productionMutated?: boolean;
    sourceDumpsIncluded?: boolean;
  };
};
type PacketRow = CloseoutBlocker & ProgressRow;

const runDir = 'gateforge-audit/run-2026-06-23-1035';
const closeoutPath = `${runDir}/48_remaining_external_blocker_closeout.json`;
const progressPath = `${runDir}/49_external_blocker_progress.json`;
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : `${runDir}/50_operator_execution_packet.md`;
const csvOutIndex = process.argv.indexOf('--csv-out');
const csvOutPath = csvOutIndex >= 0 ? process.argv[csvOutIndex + 1] : `${runDir}/50_operator_execution_packet.csv`;
const jsonOutIndex = process.argv.indexOf('--json-out');
const jsonOutPath = jsonOutIndex >= 0 ? process.argv[jsonOutIndex + 1] : `${runDir}/50_operator_execution_packet.json`;
const checkOnly = process.argv.includes('--check');

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function list(values: string[]) {
  return values.map((value) => `- ${value}`).join('\n');
}

function validateInputs(closeout: CloseoutJson, progress: ProgressJson): string[] {
  const errors: string[] = [];
  const expectedIds = Array.from({ length: 16 }, (_, index) => `GF-${String(index + 1).padStart(3, '0')}`);
  const closeoutIds = closeout.blockers?.map((row) => row.id) ?? [];
  const progressIds = progress.rows?.map((row) => row.id) ?? [];
  const safeCloseout =
    closeout.safety?.secretValuesPrinted === false &&
    closeout.safety?.productionMutated === false &&
    closeout.safety?.sourceDumpsIncluded === false;
  const safeProgress =
    progress.safety?.secretValuesPrinted === false &&
    progress.safety?.productionMutated === false &&
    progress.safety?.sourceDumpsIncluded === false;

  if (closeout.status !== 'BLOCKED_EXTERNAL') errors.push(`closeout status is ${closeout.status || 'missing'}`);
  if (closeout.count !== 16) errors.push(`closeout count is ${closeout.count ?? 'missing'}`);
  if (progress.total !== 16) errors.push(`progress total is ${progress.total ?? 'missing'}`);
  if (!safeCloseout) errors.push('closeout safety flags are not all false');
  if (!safeProgress) errors.push('progress safety flags are not all false');

  for (const id of expectedIds) {
    if (!closeoutIds.includes(id)) errors.push(`closeout missing ${id}`);
    if (!progressIds.includes(id)) errors.push(`progress missing ${id}`);
  }
  for (const id of closeoutIds) if (!expectedIds.includes(id)) errors.push(`closeout has unexpected ${id}`);
  for (const id of progressIds) if (!expectedIds.includes(id)) errors.push(`progress has unexpected ${id}`);

  return errors;
}

function buildRows(closeout: CloseoutJson, progress: ProgressJson): PacketRow[] {
  const progressById = new Map((progress.rows ?? []).map((row) => [row.id, row]));
  return (closeout.blockers ?? []).map((blocker) => {
    const progressRow = progressById.get(blocker.id);
    if (!progressRow) throw new Error(`missing progress row for ${blocker.id}`);
    return { ...blocker, ...progressRow };
  });
}

function secretMatrix(rows: PacketRow[]) {
  const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();
  const bySecret = new Map<string, { blockers: string[]; statuses: Set<string> }>();
  for (const secret of runtimeSecrets) {
    bySecret.set(secret, {
      blockers: ['HOSTED-RUNTIME'],
      statuses: new Set(['LOCAL_SECRET_PENDING']),
    });
  }
  for (const secret of attestationSecrets) {
    bySecret.set(secret, {
      blockers: ['HOSTED-ATTESTATION'],
      statuses: new Set(['LOCAL_SECRET_PENDING']),
    });
  }
  for (const row of rows) {
    for (const secret of row.secrets) {
      const entry = bySecret.get(secret) ?? { blockers: [], statuses: new Set<string>() };
      entry.blockers = entry.blockers.filter((blocker) => blocker !== 'HOSTED-RUNTIME');
      entry.blockers.push(row.id);
      entry.statuses.add(row.status);
      bySecret.set(secret, entry);
    }
  }
  return [...bySecret.entries()].map(([secret, entry]) => ({
    secret,
    blockers: [...new Set(entry.blockers)].sort(),
    statuses: [...entry.statuses].sort(),
  }));
}

function renderMarkdown(generatedAt: string, rows: PacketRow[]) {
  const pendingLocal = rows.filter((row) => row.status === 'LOCAL_SECRET_PENDING').length;
  const pendingGithub = rows.filter((row) => row.status === 'GITHUB_SECRET_PENDING').length;
  const pendingHosted = rows.filter((row) => row.status === 'HOSTED_EVIDENCE_PENDING').length;
  const fastRows = rows
    .map(
      (row) =>
        `| \`${row.id}\` | \`${row.status}\` | ${row.action} | ${row.secrets.map((secret) => `\`${secret}\``).join('<br>')} | ${row.validationCommands.map((command) => `\`${command}\``).join('<br>')} | ${row.nextAction} |`,
    )
    .join('\n');
  const secretRows = secretMatrix(rows)
    .map((row) => `| \`${row.secret}\` | ${row.blockers.map((id) => `\`${id}\``).join(', ')} | ${row.statuses.map((status) => `\`${status}\``).join(', ')} |`)
    .join('\n');
  const sections = rows
    .map(
      (row) => `### ${row.id} - ${row.action}

Status: \`${row.status}\`

Secret files:
${list(row.secrets.map((secret) => `\`${secret}\``))}

Provider setup:
${list(row.providerSetup)}

Evidence required:
${list(row.evidenceRequired)}

Validation commands:
${list(row.validationCommands.map((command) => `\`${command}\``))}

Exit criteria: ${row.exitCriteria}

Next action: ${row.nextAction}
`,
    )
    .join('\n');

  return `# GateForge Operator Execution Packet

Generated: \`${generatedAt}\`

This packet is the operator-facing execution map for closing the remaining 16 GateForge GA blockers. It contains secret names, provider setup, validation commands, and evidence requirements only. It must never contain secret values.

## Source Of Truth

- Closeout checklist: \`${closeoutPath}\`
- Progress board: \`${progressPath}\`
- Current blocker count: \`${rows.length}\`
- Local secret pending: \`${pendingLocal}\`
- GitHub secret pending: \`${pendingGithub}\`
- Hosted/provider evidence pending: \`${pendingHosted}\`

## Command Path

1. \`npm run gateforge:scaffold-local-secrets\`
2. Replace placeholder files under \`/tmp/fnnlr-gateforge-secrets\`.
3. \`npm run gateforge:local-secret-files-check\`
4. \`npm run gateforge:external-blocker-progress\`
5. \`npm run gateforge:hosted-unblock -- --dry-run --prepare-attestation\`
6. \`npm run gateforge:hosted-unblock -- --apply --prepare-attestation\`
7. \`npm run gateforge:trigger-hosted-strict\`
8. \`npm run gateforge:ga-unblock-status\`

## Fast Matrix

| ID | Status | Action | Secret names | Validation | Next action |
| --- | --- | --- | --- | --- | --- |
${fastRows}

## Secret File Matrix

| Secret file | Blockers | Current blocker statuses |
| --- | --- | --- |
${secretRows}

## Blocker Details

${sections}

## Safety

- Secret values printed: \`NO\`
- Production mutated: \`NO\`
- Source dumps included: \`NO\`
`;
}

function renderCsv(rows: PacketRow[]) {
  const header = [
    'id',
    'status',
    'owner',
    'action',
    'secret_names',
    'provider_setup',
    'evidence_required',
    'validation_commands',
    'exit_criteria',
    'next_action',
  ];
  const body = rows.map((row) =>
    [
      row.id,
      row.status,
      row.owner,
      row.action,
      row.secrets.join('; '),
      row.providerSetup.join('; '),
      row.evidenceRequired.join('; '),
      row.validationCommands.join('; '),
      row.exitCriteria,
      row.nextAction,
    ]
      .map(csvEscape)
      .join(','),
  );
  return `${header.join(',')}\n${body.join('\n')}\n`;
}

function renderJson(generatedAt: string, rows: PacketRow[]) {
  return {
    generatedAt,
    total: rows.length,
    source: {
      closeoutPath,
      progressPath,
    },
    counts: {
      LOCAL_SECRET_PENDING: rows.filter((row) => row.status === 'LOCAL_SECRET_PENDING').length,
      GITHUB_SECRET_PENDING: rows.filter((row) => row.status === 'GITHUB_SECRET_PENDING').length,
      HOSTED_EVIDENCE_PENDING: rows.filter((row) => row.status === 'HOSTED_EVIDENCE_PENDING').length,
    },
    secrets: secretMatrix(rows),
    rows,
    safety: {
      secretValuesPrinted: false,
      productionMutated: false,
      sourceDumpsIncluded: false,
    },
  };
}

const closeout = readJson<CloseoutJson>(closeoutPath);
const progress = readJson<ProgressJson>(progressPath);
const inputErrors = validateInputs(closeout, progress);
if (inputErrors.length) {
  console.error('GateForge operator execution packet: FAIL');
  inputErrors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}

const rows = buildRows(closeout, progress);
const generatedAt = new Date().toISOString();
const payload = renderJson(generatedAt, rows);

if (checkOnly) {
  const expectedGeneratedAt = 'CHECK_TIMESTAMP';
  const expectedMd = `${renderMarkdown(expectedGeneratedAt, rows).trimEnd()}\n`;
  const expectedCsv = renderCsv(rows);
  const expectedJson = `${JSON.stringify(renderJson(expectedGeneratedAt, rows), null, 2)}\n`;
  const errors: string[] = [];

  if (!fs.existsSync(outPath)) {
    errors.push(`missing generated markdown: ${outPath}`);
  } else {
    const currentMd = fs.readFileSync(outPath, 'utf8').replace(/Generated: `[^`]+`/, `Generated: \`${expectedGeneratedAt}\``);
    if (currentMd !== expectedMd) errors.push(`stale generated markdown: ${outPath}`);
  }

  if (!fs.existsSync(csvOutPath)) {
    errors.push(`missing generated csv: ${csvOutPath}`);
  } else if (fs.readFileSync(csvOutPath, 'utf8') !== expectedCsv) {
    errors.push(`stale generated csv: ${csvOutPath}`);
  }

  if (!fs.existsSync(jsonOutPath)) {
    errors.push(`missing generated json: ${jsonOutPath}`);
  } else {
    const currentJson = JSON.parse(fs.readFileSync(jsonOutPath, 'utf8')) as ReturnType<typeof renderJson>;
    const normalizedJson = `${JSON.stringify({ ...currentJson, generatedAt: expectedGeneratedAt }, null, 2)}\n`;
    if (normalizedJson !== expectedJson) errors.push(`stale generated json: ${jsonOutPath}`);
  }

  if (errors.length) {
    console.error('GateForge operator execution packet: FAIL');
    errors.forEach((error) => console.error(`  - ${error}`));
    console.error('Run: npm run gateforge:operator-execution-packet');
    process.exit(1);
  }

  console.log(`GateForge operator execution packet: PASS (${rows.length} blockers)`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${renderMarkdown(generatedAt, rows).trimEnd()}\n`);
fs.writeFileSync(csvOutPath, renderCsv(rows));
fs.writeFileSync(jsonOutPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log('GateForge operator execution packet: wrote packet');
console.log(`  wrote ${outPath}`);
console.log(`  wrote ${csvOutPath}`);
console.log(`  wrote ${jsonOutPath}`);
