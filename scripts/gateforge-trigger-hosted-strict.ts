#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';

const workflow = 'GateForge Hosted Staging Strict';
const dryRun = process.argv.includes('--dry-run');
const fromFileIndex = process.argv.indexOf('--from-file');
const fromFile = fromFileIndex >= 0 ? process.argv[fromFileIndex + 1] : '';

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

const audit = run('npx', auditArgs);
process.stdout.write(audit.output);
if (audit.status !== 0) {
  console.error('GateForge hosted strict trigger: BLOCKED_BY_SECRET_AUDIT');
  process.exit(audit.status);
}

if (dryRun) {
  console.log('GateForge hosted strict trigger: DRY_RUN_READY');
  console.log(`  command: gh workflow run "${workflow}"`);
  process.exit(0);
}

const trigger = run('gh', ['workflow', 'run', workflow]);
process.stdout.write(trigger.output);
if (trigger.status !== 0) {
  console.error('GateForge hosted strict trigger: FAILED_TO_TRIGGER_WORKFLOW');
  process.exit(trigger.status);
}

console.log('GateForge hosted strict trigger: TRIGGERED');
