#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const workflow = 'GateForge Hosted Staging Strict';
const evidenceWorkflow = 'GateForge GA Evidence';
const dryRun = process.argv.includes('--dry-run');
const fromFileIndex = process.argv.indexOf('--from-file');
const fromFile = fromFileIndex >= 0 ? process.argv[fromFileIndex + 1] : '';
const externalFileIndex = process.argv.indexOf('--external-file');
const externalPath =
  externalFileIndex >= 0
    ? process.argv[externalFileIndex + 1]
    : 'gateforge-audit/external-attestations/hosted-staging-attestation.json';
const reportOutIndex = process.argv.indexOf('--report-out');
const reportPath =
  reportOutIndex >= 0
    ? process.argv[reportOutIndex + 1]
    : dryRun || fromFile
      ? '/tmp/fnnlr-gateforge-hosted-strict-trigger-smoke.md'
      : 'gateforge-audit/run-2026-06-23-1035/41_hosted_strict_trigger_attempt.md';
const jsonOutIndex = process.argv.indexOf('--json-out');
const jsonPath =
  jsonOutIndex >= 0 ? process.argv[jsonOutIndex + 1] : reportPath.replace(/\.md$/, '.json');

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

const auditArgs = ['tsx', 'scripts/gateforge-github-secrets-audit.ts'];
if (fromFile) {
  auditArgs.push(
    '--from-file',
    fromFile,
    '--out',
    '/tmp/fnnlr-gateforge-trigger-secret-audit.md',
    '--remediation-out',
    '/tmp/fnnlr-gateforge-trigger-secret-remediation.md',
  );
}

const runbook = run('npx', ['tsx', 'scripts/gateforge-open-p0-terminal-runbook.ts', '--check']);
process.stdout.write(runbook.output);
if (runbook.status !== 0) {
  writeReport('BLOCKED_BY_OPEN_P0_RUNBOOK', [
    'The strict hosted staging workflow was not triggered.',
    'The open P0 terminal runbook is missing, stale, or internally inconsistent.',
    'Run `npm run gateforge:open-p0-runbook`, review `gateforge-audit/run-2026-06-23-1035/55_open_p0_terminal_runbook.md`, then rerun this trigger.',
  ]);
  console.error('GateForge hosted strict trigger: BLOCKED_BY_OPEN_P0_RUNBOOK');
  process.exit(runbook.status);
}

const audit = run('npx', auditArgs);
process.stdout.write(audit.output);
if (audit.status !== 0) {
  writeReport('BLOCKED_BY_SECRET_AUDIT', [
    'The strict hosted staging workflow was not triggered.',
    'Run `npm run gateforge:github-secrets-audit` and follow `gateforge-audit/run-2026-06-23-1035/40_missing_github_secrets_remediation.md`.',
  ]);
  console.error('GateForge hosted strict trigger: BLOCKED_BY_SECRET_AUDIT');
  process.exit(audit.status);
}

const external = run('npx', ['tsx', 'scripts/gateforge-external-check.ts', externalPath]);
process.stdout.write(external.output);
if (external.status !== 0) {
  writeReport('BLOCKED_BY_EXTERNAL_ATTESTATION_CONTRACT', [
    'The strict hosted staging workflow was not triggered.',
    `External attestation packet failed validation: \`${externalPath}\``,
    'Run `npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json` with real hosted evidence, then rerun this trigger.',
  ]);
  console.error('GateForge hosted strict trigger: BLOCKED_BY_EXTERNAL_ATTESTATION_CONTRACT');
  process.exit(external.status);
}

if (dryRun) {
  writeReport('DRY_RUN_READY', [
    'Open P0 terminal runbook preflight passed.',
    'Secret-name audit passed for the provided input.',
    'External attestation contract passed for the provided packet.',
    'GA Evidence success preflight skipped because this is a dry run.',
    `Dry run only; workflow was not triggered. Command would be: gh workflow run "${workflow}"`,
  ]);
  console.log('GateForge hosted strict trigger: DRY_RUN_READY');
  console.log(`  command: gh workflow run "${workflow}"`);
  process.exit(0);
}

const currentHead = run('git', ['rev-parse', 'HEAD']);
if (currentHead.status !== 0) {
  writeReport('BLOCKED_BY_GIT_HEAD', [
    'The strict hosted staging workflow was not triggered.',
    'Could not resolve the current git HEAD before checking hosted evidence readiness.',
    currentHead.output.trim() || 'No git output was returned.',
  ]);
  console.error('GateForge hosted strict trigger: BLOCKED_BY_GIT_HEAD');
  process.exit(currentHead.status);
}

const gaEvidence = run('gh', [
  'run',
  'list',
  '--workflow',
  evidenceWorkflow,
  '--commit',
  currentHead.output.trim(),
  '--limit',
  '1',
  '--json',
  'conclusion,status,url,databaseId',
]);
if (gaEvidence.status !== 0) {
  writeReport('BLOCKED_BY_GA_EVIDENCE_LOOKUP', [
    'The strict hosted staging workflow was not triggered.',
    `Could not inspect the latest \`${evidenceWorkflow}\` run for the current commit.`,
    'Check GitHub CLI authentication, network availability, and Actions permissions.',
  ]);
  console.error('GateForge hosted strict trigger: BLOCKED_BY_GA_EVIDENCE_LOOKUP');
  process.exit(gaEvidence.status);
}

const evidenceRun = parseLatestRun(gaEvidence.output);
if (!evidenceRun || evidenceRun.status !== 'completed' || evidenceRun.conclusion !== 'success') {
  writeReport('BLOCKED_BY_GA_EVIDENCE', [
    'The strict hosted staging workflow was not triggered.',
    `Current commit: \`${currentHead.output.trim()}\``,
    evidenceRun
      ? `Latest \`${evidenceWorkflow}\` run for this commit is \`${evidenceRun.status}/${evidenceRun.conclusion || 'none'}\`: ${evidenceRun.url || 'no URL'}`
      : `No \`${evidenceWorkflow}\` run was found for the current commit.`,
    `Wait for \`${evidenceWorkflow}\` to complete successfully, then rerun this trigger.`,
  ]);
  console.error('GateForge hosted strict trigger: BLOCKED_BY_GA_EVIDENCE');
  process.exit(1);
}

const trigger = run('gh', ['workflow', 'run', workflow]);
process.stdout.write(trigger.output);
if (trigger.status !== 0) {
  writeReport('FAILED_TO_TRIGGER_WORKFLOW', [
    'Secret-name audit passed, but GitHub workflow dispatch failed.',
    'Check GitHub CLI authentication, repository permissions, and workflow availability.',
  ]);
  console.error('GateForge hosted strict trigger: FAILED_TO_TRIGGER_WORKFLOW');
  process.exit(trigger.status);
}

writeReport('TRIGGERED', [
  'Open P0 terminal runbook preflight passed.',
  'Secret-name audit passed.',
  `External attestation contract passed: ${externalPath}`,
  `GA Evidence preflight passed: ${evidenceRun.url || `run ${evidenceRun.databaseId || 'unknown'}`}`,
  `Triggered workflow: ${workflow}`,
  'Monitor with: gh run list --workflow "GateForge Hosted Staging Strict" --limit 1',
]);
console.log('GateForge hosted strict trigger: TRIGGERED');

function parseLatestRun(output: string): { status?: string; conclusion?: string; url?: string; databaseId?: number } | null {
  try {
    const parsed = JSON.parse(output) as Array<{
      status?: string;
      conclusion?: string;
      url?: string;
      databaseId?: number;
    }>;
    return parsed[0] || null;
  } catch {
    return null;
  }
}

function writeReport(status: string, details: string[]) {
  const generatedAt = new Date().toISOString();
  const source = fromFile ? fromFile : 'gh secret list --json name';
  const payload = {
    generatedAt,
    status,
    workflow,
    dryRun,
    source,
    externalPath,
    details,
    safety: {
      secretValuesRead: false,
      secretValuesPrinted: false,
      productionMutated: false,
    },
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    `# Hosted Strict Trigger Attempt

Generated: \`${generatedAt}\`

Status: \`${status}\`

Workflow: \`${workflow}\`

Dry run: \`${dryRun ? 'true' : 'false'}\`

Source: \`${source}\`

This report contains trigger status and secret names only. It does not contain secret values.

## Details

${details.map((detail) => `- ${detail}`).join('\n')}
`,
  );
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
}
