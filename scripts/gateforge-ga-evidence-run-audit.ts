#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type AnnotationLevel = 'notice' | 'warning' | 'failure';
type Annotation = {
  annotation_level?: AnnotationLevel;
  message?: string;
  path?: string;
  start_line?: number;
};
type RunAuditInput = {
  run?: {
    databaseId?: number;
    status?: string;
    conclusion?: string;
    headSha?: string;
    url?: string;
  };
  annotations?: Annotation[];
};

const workflow = 'GateForge GA Evidence';
const runDir = 'gateforge-audit/run-2026-06-23-1035';
const fromFileIndex = process.argv.indexOf('--from-file');
const fromFile = fromFileIndex >= 0 ? process.argv[fromFileIndex + 1] : '';
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : `${runDir}/51_ga_evidence_run_audit.md`;
const jsonOutIndex = process.argv.indexOf('--json-out');
const jsonOutPath = jsonOutIndex >= 0 ? process.argv[jsonOutIndex + 1] : `${runDir}/51_ga_evidence_run_audit.json`;

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

function fail(message: string): never {
  console.error(`GateForge GA evidence run audit: FAIL - ${message}`);
  process.exit(1);
}

function readInput(): RunAuditInput {
  if (fromFile) return JSON.parse(fs.readFileSync(fromFile, 'utf8')) as RunAuditInput;

  const repo = run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
  if (repo.status !== 0) fail(`could not inspect GitHub repo: ${repo.output.trim()}`);
  const repoName = repo.output.trim();
  const latestRun = run('gh', [
    'run',
    'list',
    '--workflow',
    workflow,
    '--status',
    'completed',
    '--limit',
    '1',
    '--json',
    'databaseId,status,conclusion,headSha,url',
  ]);
  if (latestRun.status !== 0) fail(`could not inspect latest ${workflow} run: ${latestRun.output.trim()}`);
  const runRow = (JSON.parse(latestRun.output) as NonNullable<RunAuditInput['run']>[])[0];
  if (!runRow?.databaseId) fail(`no ${workflow} run found`);

  const jobs = run('gh', ['api', `repos/${repoName}/actions/runs/${runRow.databaseId}/jobs`, '--jq', '.jobs[].id']);
  if (jobs.status !== 0) fail(`could not inspect ${workflow} jobs: ${jobs.output.trim()}`);
  const jobIds = jobs.output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const annotations = jobIds.flatMap((jobId) => {
    const result = run('gh', ['api', `repos/${repoName}/check-runs/${jobId}/annotations`]);
    if (result.status !== 0) fail(`could not inspect annotations for job ${jobId}: ${result.output.trim()}`);
    return JSON.parse(result.output) as Annotation[];
  });

  return { run: runRow, annotations };
}

function mdList(values: string[]) {
  return values.length ? values.map((value) => `- ${value}`).join('\n') : '- None';
}

const input = readInput();
const annotations = input.annotations ?? [];
const failureAnnotations = annotations.filter((annotation) => annotation.annotation_level === 'failure');
const warningAnnotations = annotations.filter((annotation) => annotation.annotation_level === 'warning');
const noticeAnnotations = annotations.filter((annotation) => annotation.annotation_level === 'notice');
const runPass = input.run?.status === 'completed' && input.run?.conclusion === 'success';
const decision = runPass && failureAnnotations.length === 0 ? 'PASS' : 'FAIL';
const generatedAt = new Date().toISOString();
const json = {
  generatedAt,
  workflow,
  decision,
  run: input.run ?? null,
  counts: {
    failureAnnotations: failureAnnotations.length,
    warningAnnotations: warningAnnotations.length,
    noticeAnnotations: noticeAnnotations.length,
    totalAnnotations: annotations.length,
  },
  failureAnnotations: failureAnnotations.map((annotation) => ({
    path: annotation.path ?? 'unknown',
    startLine: annotation.start_line ?? null,
    message: annotation.message ?? '',
  })),
  safety: {
    secretValuesPrinted: false,
    productionMutated: false,
    sourceDumpsIncluded: false,
  },
};
const body = `# GateForge GA Evidence Run Audit

Generated: \`${generatedAt}\`

This audit checks the latest \`${workflow}\` run status and annotations. It validates workflow evidence quality only; it does not read or print secret values.

## Decision

- Audit decision: \`${decision}\`
- Run status: \`${input.run?.status ?? 'UNKNOWN'}\`
- Run conclusion: \`${input.run?.conclusion ?? 'UNKNOWN'}\`
- Run ID: \`${input.run?.databaseId ?? 'UNKNOWN'}\`
- Head SHA: \`${input.run?.headSha ?? 'UNKNOWN'}\`
- URL: ${input.run?.url ?? 'UNKNOWN'}

## Annotation Summary

- Failure annotations: \`${failureAnnotations.length}\`
- Warning annotations: \`${warningAnnotations.length}\`
- Notice annotations: \`${noticeAnnotations.length}\`
- Total annotations: \`${annotations.length}\`

## Failure Annotations

${mdList(failureAnnotations.map((annotation) => `\`${annotation.path ?? 'unknown'}:${annotation.start_line ?? '?'}\` ${annotation.message ?? ''}`))}

## Safety Guarantees

- Secret values printed: \`NO\`
- Production mutated: \`NO\`
- Source dumps included: \`NO\`
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, body);
fs.writeFileSync(jsonOutPath, `${JSON.stringify(json, null, 2)}\n`);

console.log(`GateForge GA evidence run audit: ${decision}`);
console.log(`  failure annotations: ${failureAnnotations.length}`);
console.log(`  wrote ${outPath}`);
console.log(`  wrote ${jsonOutPath}`);

if (decision !== 'PASS') process.exit(1);
