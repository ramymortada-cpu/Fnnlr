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
  createdAt?: string;
};

const workflow = 'GateForge GA Evidence';
const runDir = 'gateforge-audit/run-2026-06-23-1035';
const fromFileIndex = process.argv.indexOf('--from-file');
const fromFile = fromFileIndex >= 0 ? process.argv[fromFileIndex + 1] : '';
const headIndex = process.argv.indexOf('--head-sha');
const headOverride = headIndex >= 0 ? process.argv[headIndex + 1] : '';
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : `${runDir}/58_current_head_ga_evidence_proof.md`;
const jsonOutIndex = process.argv.indexOf('--json-out');
const jsonOutPath =
  jsonOutIndex >= 0 ? process.argv[jsonOutIndex + 1] : `${runDir}/58_current_head_ga_evidence_proof.json`;
const allowNotReady = process.argv.includes('--allow-not-ready');
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

function currentHead() {
  if (headOverride) return { status: 0, headSha: headOverride, output: '' };
  const result = run('git', ['rev-parse', 'HEAD']);
  return { status: result.status, headSha: result.output.trim(), output: result.output };
}

function loadRuns(headSha: string) {
  if (fromFile) {
    const parsed = JSON.parse(fs.readFileSync(fromFile, 'utf8')) as RunRow[] | RunRow;
    return {
      status: 0,
      source: fromFile,
      runs: Array.isArray(parsed) ? parsed : [parsed],
      output: '',
    };
  }

  const result = run('gh', [
    'run',
    'list',
    '--workflow',
    workflow,
    '--commit',
    headSha,
    '--limit',
    '10',
    '--json',
    'databaseId,status,conclusion,headSha,url,createdAt',
  ]);
  if (result.status !== 0) {
    return {
      status: result.status,
      source: `gh run list --workflow "${workflow}" --commit ${headSha}`,
      runs: [] as RunRow[],
      output: result.output,
    };
  }
  try {
    return {
      status: 0,
      source: `gh run list --workflow "${workflow}" --commit ${headSha}`,
      runs: JSON.parse(result.output) as RunRow[],
      output: '',
    };
  } catch (error) {
    return {
      status: 1,
      source: 'gh run list JSON parse',
      runs: [] as RunRow[],
      output: String(error),
    };
  }
}

function mdList(values: string[]) {
  return values.length ? values.map((value) => `- ${value}`).join('\n') : '- None';
}

function fail(message: string): never {
  console.error(`GateForge current-head GA evidence proof: FAIL - ${message}`);
  process.exit(1);
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
    fail(`${filePath} is stale; rerun npm run gateforge:current-head-ga-proof -- --allow-not-ready`);
  }
}

const generatedAt = new Date().toISOString();
const head = currentHead();
const runLoad = head.status === 0 ? loadRuns(head.headSha) : { status: head.status, source: 'git rev-parse HEAD', runs: [] as RunRow[], output: head.output };
const matchingRuns = runLoad.runs.filter((row) => !row.headSha || row.headSha === head.headSha);
const successfulRun = matchingRuns.find((row) => row.status === 'completed' && row.conclusion === 'success') ?? null;
const inProgressRun = matchingRuns.find((row) => row.status && row.status !== 'completed') ?? null;
const failedCompletedRun = matchingRuns.find((row) => row.status === 'completed' && row.conclusion && row.conclusion !== 'success') ?? null;
const decision = successfulRun ? 'PASS' : inProgressRun ? 'IN_PROGRESS' : 'NOT_READY';
const blockers = [
  ...(head.status === 0 ? [] : ['CURRENT_HEAD_NOT_READABLE']),
  ...(runLoad.status === 0 ? [] : ['GA_EVIDENCE_RUN_LOOKUP_FAILED']),
  ...(successfulRun ? [] : ['NO_SUCCESSFUL_COMPLETED_GA_EVIDENCE_RUN_FOR_CURRENT_HEAD']),
  ...(failedCompletedRun ? ['LATEST_COMPLETED_RUN_FOR_HEAD_IS_NOT_SUCCESS'] : []),
];
const json = {
  generatedAt,
  workflow,
  decision,
  currentHead: head.headSha || 'UNKNOWN',
  source: runLoad.source,
  runsFoundForHead: matchingRuns.length,
  successfulRun,
  inProgressRun,
  failedCompletedRun,
  blockers,
  safety: {
    secretValuesPrinted: false,
    productionMutated: false,
    workflowTriggered: false,
    sourceDumpsIncluded: false,
  },
};
const body = `# Current-Head GA Evidence Proof

Generated: \`${generatedAt}\`

Decision: \`${decision}\`

This report verifies whether the current repository HEAD has a successful completed \`${workflow}\` run. It is intentionally separate from the in-workflow evidence generator because a workflow cannot prove its own final completion before it finishes.

## Current Head

- HEAD: \`${head.headSha || 'UNKNOWN'}\`
- Lookup source: \`${runLoad.source}\`
- Runs found for HEAD: \`${matchingRuns.length}\`

## Successful Run

- Run ID: \`${successfulRun?.databaseId ?? 'NONE'}\`
- Status: \`${successfulRun?.status ?? 'NONE'}\`
- Conclusion: \`${successfulRun?.conclusion ?? 'NONE'}\`
- URL: ${successfulRun?.url ?? 'NONE'}

## In-Progress Run

- Run ID: \`${inProgressRun?.databaseId ?? 'NONE'}\`
- Status: \`${inProgressRun?.status ?? 'NONE'}\`
- URL: ${inProgressRun?.url ?? 'NONE'}

## Blockers

${mdList(blockers.map((blocker) => `\`${blocker}\``))}

## Safety

- Secret values printed: \`NO\`
- Production mutated: \`NO\`
- Workflow triggered: \`NO\`
- Source dumps included: \`NO\`
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
const jsonBody = `${JSON.stringify(json, null, 2)}\n`;

if (checkOnly) {
  assertFresh(outPath, body);
  assertFresh(jsonOutPath, jsonBody);
  console.log(`GateForge current-head GA evidence proof: PASS (${decision})`);
  console.log(`  checked ${outPath}`);
  console.log(`  checked ${jsonOutPath}`);
  process.exit(0);
}

fs.writeFileSync(outPath, body);
fs.writeFileSync(jsonOutPath, jsonBody);

console.log(`GateForge current-head GA evidence proof: ${decision}`);
console.log(`  head: ${head.headSha || 'UNKNOWN'}`);
console.log(`  runs found for head: ${matchingRuns.length}`);
console.log(`  wrote ${outPath}`);
console.log(`  wrote ${jsonOutPath}`);

if (decision !== 'PASS' && !allowNotReady) process.exit(1);
