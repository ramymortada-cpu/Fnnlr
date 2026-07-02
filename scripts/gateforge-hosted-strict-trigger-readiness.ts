#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type RunRow = {
  databaseId?: number;
  status?: string;
  conclusion?: string;
  headSha?: string;
  url?: string;
};

const runDir = 'gateforge-audit/run-2026-06-23-1035';
const workflow = 'GateForge GA Evidence';
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : `${runDir}/56_hosted_strict_trigger_readiness.md`;
const jsonOutIndex = process.argv.indexOf('--json-out');
const jsonOutPath =
  jsonOutIndex >= 0 ? process.argv[jsonOutIndex + 1] : `${runDir}/56_hosted_strict_trigger_readiness.json`;
const secretsFromFileIndex = process.argv.indexOf('--secrets-from-file');
const secretsFromFile = secretsFromFileIndex >= 0 ? process.argv[secretsFromFileIndex + 1] : '';
const gaRunFromFileIndex = process.argv.indexOf('--ga-run-from-file');
const gaRunFromFile = gaRunFromFileIndex >= 0 ? process.argv[gaRunFromFileIndex + 1] : '';
const allowNotReady = process.argv.includes('--allow-not-ready');
const checkOnly = process.argv.includes('--check');

function fail(message: string): never {
  console.error(`GateForge hosted strict trigger readiness: FAIL - ${message}`);
  process.exit(1);
}

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

function loadLatestGaRun(): { headSha: string; row: RunRow | null; source: string; lookupStatus: number; lookupOutput: string } {
  if (gaRunFromFile) {
    const parsed = JSON.parse(fs.readFileSync(gaRunFromFile, 'utf8')) as RunRow | RunRow[];
    const row = Array.isArray(parsed) ? parsed[0] || null : parsed;
    return {
      headSha: row?.headSha || 'fixture',
      row,
      source: gaRunFromFile,
      lookupStatus: 0,
      lookupOutput: '',
    };
  }

  const head = run('git', ['rev-parse', 'HEAD']);
  if (head.status !== 0) {
    return { headSha: 'UNKNOWN', row: null, source: 'git rev-parse HEAD', lookupStatus: head.status, lookupOutput: head.output };
  }
  const headSha = head.output.trim();
  const latest = run('gh', [
    'run',
    'list',
    '--workflow',
    workflow,
    '--commit',
    headSha,
    '--limit',
    '1',
    '--json',
    'databaseId,status,conclusion,headSha,url',
  ]);
  if (latest.status !== 0) {
    return { headSha, row: null, source: `gh run list --workflow "${workflow}" --commit ${headSha}`, lookupStatus: latest.status, lookupOutput: latest.output };
  }
  try {
    const rows = JSON.parse(latest.output) as RunRow[];
    return {
      headSha,
      row: rows[0] || null,
      source: `gh run list --workflow "${workflow}" --commit ${headSha}`,
      lookupStatus: 0,
      lookupOutput: '',
    };
  } catch (error) {
    return { headSha, row: null, source: 'gh run list JSON parse', lookupStatus: 1, lookupOutput: String(error) };
  }
}

function statusLabel(ok: boolean, blocked: string) {
  return ok ? 'PASS' : blocked;
}

function normalizeGenerated(text: string): string {
  return text
    .replace(/^Generated: `[^`]+`$/gm, 'Generated: `<normalized>`')
    .replace(/"generatedAt": "[^"]+"/g, '"generatedAt": "<normalized>"');
}

function assertFresh(filePath: string, expected: string): void {
  if (!fs.existsSync(filePath)) fail(`${filePath} is missing`);
  const actual = fs.readFileSync(filePath, 'utf8');
  if (normalizeGenerated(actual) !== normalizeGenerated(expected)) {
    fail(`${filePath} is stale; rerun npm run gateforge:hosted-strict-trigger-readiness`);
  }
}

const generatedAt = new Date().toISOString();
const runbook = run('npx', ['tsx', 'scripts/gateforge-open-p0-terminal-runbook.ts', '--check']);
const secretAuditArgs = ['tsx', 'scripts/gateforge-github-secrets-audit.ts'];
if (secretsFromFile) {
  secretAuditArgs.push(
    '--from-file',
    secretsFromFile,
    '--out',
    '/tmp/fnnlr-gateforge-trigger-readiness-secret-audit.md',
    '--remediation-out',
    '/tmp/fnnlr-gateforge-trigger-readiness-secret-remediation.md',
  );
}
const secrets = run('npx', secretAuditArgs);
const gaRun = loadLatestGaRun();
const gaOk = gaRun.lookupStatus === 0 && gaRun.row?.status === 'completed' && gaRun.row?.conclusion === 'success';
const runbookOk = runbook.status === 0;
const secretsOk = secrets.status === 0;
const decision = runbookOk && secretsOk && gaOk ? 'READY_TO_TRIGGER' : 'NOT_READY';
const blockers = [
  ...(runbookOk ? [] : ['OPEN_P0_RUNBOOK_NOT_FRESH']),
  ...(secretsOk ? [] : ['GITHUB_SECRETS_NOT_READY']),
  ...(gaOk ? [] : ['GA_EVIDENCE_NOT_SUCCESSFUL_FOR_HEAD']),
];
const json = {
  generatedAt,
  decision,
  workflowToTrigger: 'GateForge Hosted Staging Strict',
  prerequisites: {
    openP0Runbook: statusLabel(runbookOk, 'BLOCKED'),
    githubSecrets: statusLabel(secretsOk, 'BLOCKED'),
    gaEvidenceForCurrentHead: statusLabel(gaOk, 'BLOCKED'),
  },
  blockers,
  gaEvidence: {
    source: gaRun.source,
    lookupStatus: gaRun.lookupStatus,
    currentHead: gaRun.headSha,
    run: gaRun.row,
  },
  safety: {
    secretValuesPrinted: false,
    productionMutated: false,
    workflowTriggered: false,
  },
};
const body = `# Hosted Strict Trigger Readiness

Generated: \`${generatedAt}\`

Decision: \`${decision}\`

This report is a pre-trigger readiness check for \`GateForge Hosted Staging Strict\`. It does not trigger workflows, read secret values, mutate production, or dump source code.

## Prerequisites

| Prerequisite | Status | Evidence |
| --- | --- | --- |
| Open P0 terminal runbook is fresh | ${json.prerequisites.openP0Runbook} | \`npm run gateforge:open-p0-runbook-check\` |
| GitHub secret names are ready | ${json.prerequisites.githubSecrets} | \`npm run gateforge:github-secrets-audit\` |
| Latest GA Evidence run for current HEAD succeeded | ${json.prerequisites.gaEvidenceForCurrentHead} | ${gaRun.row?.url || gaRun.source} |

## GA Evidence Run

- Current HEAD: \`${gaRun.headSha}\`
- Source: \`${gaRun.source}\`
- Run ID: \`${gaRun.row?.databaseId ?? 'NONE'}\`
- Run status: \`${gaRun.row?.status ?? 'NONE'}\`
- Run conclusion: \`${gaRun.row?.conclusion ?? 'NONE'}\`
- Run URL: ${gaRun.row?.url || 'NONE'}

## Blockers

${blockers.length ? blockers.map((blocker) => `- \`${blocker}\``).join('\n') : '- None'}

## Next Command

${decision === 'READY_TO_TRIGGER' ? '`npm run gateforge:trigger-hosted-strict`' : 'Resolve the blockers above before triggering hosted strict staging.'}

## Safety

- Secret values printed: \`NO\`
- Production mutated: \`NO\`
- Workflow triggered: \`NO\`
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
const jsonBody = `${JSON.stringify(json, null, 2)}\n`;

if (checkOnly) {
  assertFresh(outPath, body);
  assertFresh(jsonOutPath, jsonBody);
  console.log(`GateForge hosted strict trigger readiness: PASS (${decision})`);
  console.log(`  checked ${outPath}`);
  console.log(`  checked ${jsonOutPath}`);
  process.exit(0);
}

fs.writeFileSync(outPath, body);
fs.writeFileSync(jsonOutPath, jsonBody);

console.log(`GateForge hosted strict trigger readiness: ${decision}`);
console.log(`  blockers: ${blockers.length}`);
console.log(`  wrote ${outPath}`);
console.log(`  wrote ${jsonOutPath}`);

if (decision !== 'READY_TO_TRIGGER' && !allowNotReady) process.exit(1);
