#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type SecretStatus = 'READY' | 'MISSING' | 'EMPTY' | 'PLACEHOLDER' | 'INVALID';
type BlockerStatus = 'LOCAL_SECRET_PENDING' | 'GITHUB_SECRET_PENDING' | 'HOSTED_EVIDENCE_PENDING';
type SecretEntry = { name: string; status: SecretStatus };
type LocalSecretSummary = {
  runtime: SecretEntry[];
  attestationOptions: SecretEntry[];
};
type CloseoutBlocker = {
  id: string;
  owner: string;
  action: string;
  secrets: string[];
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
type GithubSecret = { name: string };

const runDir = 'gateforge-audit/run-2026-06-23-1035';
const closeoutPath = `${runDir}/48_remaining_external_blocker_closeout.json`;
const defaultDir = '/tmp/fnnlr-gateforge-secrets';
const dirIndex = process.argv.indexOf('--dir');
const secretDir = dirIndex >= 0 ? process.argv[dirIndex + 1] : defaultDir;
const fromFileIndex = process.argv.indexOf('--from-file');
const fromFile = fromFileIndex >= 0 ? process.argv[fromFileIndex + 1] : '';
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : `${runDir}/49_external_blocker_progress.md`;
const jsonOutIndex = process.argv.indexOf('--json-out');
const jsonOutPath = jsonOutIndex >= 0 ? process.argv[jsonOutIndex + 1] : `${runDir}/49_external_blocker_progress.json`;
const checkOnly = process.argv.includes('--check');

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function loadLocalSecrets(): Map<string, SecretStatus> {
  const result = run('npx', ['tsx', 'scripts/gateforge-local-secret-files-check.ts', '--dir', secretDir, '--json']);
  let parsed: LocalSecretSummary;
  try {
    parsed = JSON.parse(result.output) as LocalSecretSummary;
  } catch {
    throw new Error('could not parse local secret files check JSON');
  }
  return new Map([...parsed.runtime, ...parsed.attestationOptions].map((entry) => [entry.name, entry.status]));
}

function loadGithubSecretNames(): Set<string> {
  if (fromFile) return new Set(readJson<GithubSecret[]>(fromFile).map((entry) => entry.name));
  const result = run('gh', ['secret', 'list', '--json', 'name']);
  if (result.status !== 0) return new Set();
  return new Set((JSON.parse(result.output) as GithubSecret[]).map((entry) => entry.name));
}

function validateCloseout(closeout: CloseoutJson): string[] {
  const errors: string[] = [];
  const expectedIds = Array.from({ length: 16 }, (_, index) => `GF-${String(index + 1).padStart(3, '0')}`);
  const ids = closeout.blockers?.map((blocker) => blocker.id) || [];
  if (closeout.status !== 'BLOCKED_EXTERNAL') errors.push(`closeout status is ${closeout.status || 'missing'}`);
  if (closeout.count !== 16) errors.push(`closeout count is ${closeout.count ?? 'missing'}`);
  for (const id of expectedIds) if (!ids.includes(id)) errors.push(`closeout missing ${id}`);
  for (const id of ids) if (!expectedIds.includes(id)) errors.push(`closeout has unexpected ${id}`);
  if (closeout.safety?.secretValuesPrinted !== false) errors.push('closeout safety secretValuesPrinted is not false');
  if (closeout.safety?.productionMutated !== false) errors.push('closeout safety productionMutated is not false');
  if (closeout.safety?.sourceDumpsIncluded !== false) errors.push('closeout safety sourceDumpsIncluded is not false');
  return errors;
}

function statusFor(blocker: CloseoutBlocker, localStatuses: Map<string, SecretStatus>, githubNames: Set<string>): BlockerStatus {
  const localReady = blocker.secrets.every((secret) => localStatuses.get(secret) === 'READY');
  if (!localReady) return 'LOCAL_SECRET_PENDING';
  const githubReady = blocker.secrets.every((secret) => githubNames.has(secret));
  if (!githubReady) return 'GITHUB_SECRET_PENDING';
  return 'HOSTED_EVIDENCE_PENDING';
}

function nextActionFor(status: BlockerStatus) {
  if (status === 'LOCAL_SECRET_PENDING') return 'Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check.';
  if (status === 'GITHUB_SECRET_PENDING') return 'Upload ready local secret files with npm run gateforge:hosted-unblock -- --apply.';
  return 'Run hosted strict evidence and attach sanitized artifacts; do not mark PASS from local evidence alone.';
}

function renderMarkdown(generatedAt: string, rows: ReturnType<typeof buildRows>) {
  const counts = countStatuses(rows);
  const readiness = countReadiness(rows);
  const table = rows
    .map((row) => `| \`${row.id}\` | \`${row.status}\` | ${row.action} | ${row.secrets.map((secret) => `\`${secret}\``).join('<br>')} | ${row.localStatuses.map((entry) => `\`${entry.name}\`: \`${entry.status}\``).join('<br>')} | ${row.githubStatuses.map((entry) => `\`${entry.name}\`: \`${entry.present ? 'PRESENT' : 'MISSING'}\``).join('<br>')} | ${row.nextAction} |`)
    .join('\n');
  return `# GateForge External Blocker Progress

Generated: \`${generatedAt}\`

This progress board converts the 16 remaining external blockers into executable status. It uses secret names and readiness states only; no secret values are printed.

## Summary

- Total blockers: \`${rows.length}\`
- Local secret pending: \`${counts.LOCAL_SECRET_PENDING}\`
- GitHub secret pending: \`${counts.GITHUB_SECRET_PENDING}\`
- Hosted/provider evidence pending: \`${counts.HOSTED_EVIDENCE_PENDING}\`
- Unique local secret names not ready: \`${readiness.localUnreadySecretNames.length}\`
- Unique GitHub secret names missing: \`${readiness.githubMissingSecretNames.length}\`
- Source closeout: \`${closeoutPath}\`
- Local secret directory: \`${secretDir}\`
- GitHub secret source: \`${fromFile || 'gh secret list --json name'}\`

## Progress Matrix

| ID | Status | Action | Secret names | Local status | GitHub status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
${table}

## Interpretation

- \`LOCAL_SECRET_PENDING\`: a required local secret file is missing, empty, placeholder, or invalid.
- \`GITHUB_SECRET_PENDING\`: local secret files are ready, but GitHub Actions secret names are not present.
- \`HOSTED_EVIDENCE_PENDING\`: secret names are staged; the blocker still needs hosted/provider evidence before it can close.
- The unique GitHub/local readiness counts are independent diagnostics; they can be non-zero even while the sequential blocker status remains \`LOCAL_SECRET_PENDING\`.

## Safety

- Secret values printed: \`NO\`
- Production mutated: \`NO\`
- Source dumps included: \`NO\`
`;
}

function buildRows(closeout: CloseoutJson, localStatuses: Map<string, SecretStatus>, githubNames: Set<string>) {
  return (closeout.blockers || []).map((blocker) => {
    const localReady = blocker.secrets.filter((secret) => localStatuses.get(secret) === 'READY').length;
    const githubReady = blocker.secrets.filter((secret) => githubNames.has(secret)).length;
    const status = statusFor(blocker, localStatuses, githubNames);
    return {
      id: blocker.id,
      owner: blocker.owner,
      action: blocker.action,
      secrets: blocker.secrets,
      secretCount: blocker.secrets.length,
      localReady,
      githubReady,
      localStatuses: blocker.secrets.map((secret) => ({
        name: secret,
        status: localStatuses.get(secret) ?? 'MISSING',
      })),
      githubStatuses: blocker.secrets.map((secret) => ({
        name: secret,
        present: githubNames.has(secret),
      })),
      status,
      evidenceRequired: blocker.evidenceRequired,
      validationCommands: blocker.validationCommands,
      exitCriteria: blocker.exitCriteria,
      nextAction: nextActionFor(status),
    };
  });
}

function countStatuses(rows: ReturnType<typeof buildRows>): Record<BlockerStatus, number> {
  return {
    LOCAL_SECRET_PENDING: rows.filter((row) => row.status === 'LOCAL_SECRET_PENDING').length,
    GITHUB_SECRET_PENDING: rows.filter((row) => row.status === 'GITHUB_SECRET_PENDING').length,
    HOSTED_EVIDENCE_PENDING: rows.filter((row) => row.status === 'HOSTED_EVIDENCE_PENDING').length,
  };
}

function countReadiness(rows: ReturnType<typeof buildRows>) {
  const localUnreadySecretNames = Array.from(
    new Set(
      rows.flatMap((row) =>
        row.localStatuses
          .filter((entry) => entry.status !== 'READY')
          .map((entry) => entry.name),
      ),
    ),
  ).sort();
  const githubMissingSecretNames = Array.from(
    new Set(
      rows.flatMap((row) =>
        row.githubStatuses
          .filter((entry) => !entry.present)
          .map((entry) => entry.name),
      ),
    ),
  ).sort();
  return {
    localUnreadySecretNames,
    githubMissingSecretNames,
  };
}

function renderJson(generatedAt: string, rows: ReturnType<typeof buildRows>) {
  return {
    generatedAt,
    total: rows.length,
    counts: countStatuses(rows),
    readiness: countReadiness(rows),
    rows,
    safety: {
      secretValuesPrinted: false,
      productionMutated: false,
      sourceDumpsIncluded: false,
    },
  };
}

const closeout = readJson<CloseoutJson>(closeoutPath);
const closeoutErrors = validateCloseout(closeout);
if (closeoutErrors.length) {
  console.error('GateForge external blocker progress: FAIL');
  closeoutErrors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}

const localStatuses = loadLocalSecrets();
const githubNames = loadGithubSecretNames();
const rows = buildRows(closeout, localStatuses, githubNames);
const generatedAt = new Date().toISOString();
const payload = renderJson(generatedAt, rows);

if (checkOnly) {
  const expectedGeneratedAt = 'CHECK_TIMESTAMP';
  const expectedMarkdown = `${renderMarkdown(expectedGeneratedAt, rows).trimEnd()}\n`;
  const expectedJson = `${JSON.stringify(renderJson(expectedGeneratedAt, rows), null, 2)}\n`;
  const errors: string[] = [];

  if (rows.length !== 16) errors.push(`expected 16 progress rows, found ${rows.length}`);

  if (!fs.existsSync(outPath)) {
    errors.push(`missing generated markdown: ${outPath}`);
  } else {
    const currentMarkdown = fs.readFileSync(outPath, 'utf8').replace(/Generated: `[^`]+`/, `Generated: \`${expectedGeneratedAt}\``);
    if (currentMarkdown !== expectedMarkdown) errors.push(`stale generated markdown: ${outPath}`);
  }

  if (!fs.existsSync(jsonOutPath)) {
    errors.push(`missing generated json: ${jsonOutPath}`);
  } else {
    const currentJson = JSON.parse(fs.readFileSync(jsonOutPath, 'utf8')) as ReturnType<typeof renderJson>;
    const normalizedJson = `${JSON.stringify({ ...currentJson, generatedAt: expectedGeneratedAt }, null, 2)}\n`;
    if (normalizedJson !== expectedJson) errors.push(`stale generated json: ${jsonOutPath}`);
  }

  if (errors.length) {
    console.error('GateForge external blocker progress: FAIL');
    errors.forEach((error) => console.error(`  - ${error}`));
    console.error('Run: npm run gateforge:external-blocker-progress');
    process.exit(1);
  }

  console.log(`GateForge external blocker progress: PASS (${rows.length} blockers)`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${renderMarkdown(generatedAt, rows).trimEnd()}\n`);
fs.writeFileSync(jsonOutPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log('GateForge external blocker progress: wrote progress board');
console.log(`  wrote ${outPath}`);
console.log(`  wrote ${jsonOutPath}`);
