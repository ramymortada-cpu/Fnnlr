#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const workflow = 'GateForge Hosted Staging Strict';
const dryRun = process.argv.includes('--dry-run');
const fromFileIndex = process.argv.indexOf('--from-file');
const fromFile = fromFileIndex >= 0 ? process.argv[fromFileIndex + 1] : '';
const reportOutIndex = process.argv.indexOf('--report-out');
const reportPath =
  reportOutIndex >= 0
    ? process.argv[reportOutIndex + 1]
    : dryRun || fromFile
      ? '/tmp/fnnlr-gateforge-hosted-strict-trigger-smoke.md'
      : 'gateforge-audit/run-2026-06-23-1035/41_hosted_strict_trigger_attempt.md';

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

if (dryRun) {
  writeReport('DRY_RUN_READY', [
    'Open P0 terminal runbook preflight passed.',
    'Secret-name audit passed for the provided input.',
    `Dry run only; workflow was not triggered. Command would be: gh workflow run "${workflow}"`,
  ]);
  console.log('GateForge hosted strict trigger: DRY_RUN_READY');
  console.log(`  command: gh workflow run "${workflow}"`);
  process.exit(0);
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
  `Triggered workflow: ${workflow}`,
  'Monitor with: gh run list --workflow "GateForge Hosted Staging Strict" --limit 1',
]);
console.log('GateForge hosted strict trigger: TRIGGERED');

function writeReport(status: string, details: string[]) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    `# Hosted Strict Trigger Attempt

Generated: \`${new Date().toISOString()}\`

Status: \`${status}\`

Workflow: \`${workflow}\`

Dry run: \`${dryRun ? 'true' : 'false'}\`

Source: \`${fromFile ? fromFile : 'gh secret list --json name'}\`

This report contains trigger status and secret names only. It does not contain secret values.

## Details

${details.map((detail) => `- ${detail}`).join('\n')}
`,
  );
}
