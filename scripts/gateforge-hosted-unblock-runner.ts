#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';

const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run') || !apply;
const watch = process.argv.includes('--watch');
const dirArgIndex = process.argv.indexOf('--dir');
const secretDir = dirArgIndex >= 0 ? process.argv[dirArgIndex + 1] : '/tmp/fnnlr-gateforge-secrets';
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

function step(label: string, command: string, args: string[]) {
  console.log(`\n== ${label} ==`);
  const result = run(command, args);
  process.stdout.write(result.output);
  if (result.status !== 0) {
    console.error(`GateForge hosted unblock runner: FAIL at ${label}`);
    process.exit(result.status);
  }
}

console.log(`GateForge hosted unblock runner: ${dryRun ? 'DRY_RUN' : 'APPLY'}`);
console.log(`  secret directory: ${secretDir}`);
console.log(`  watch: ${watch ? 'yes' : 'no'}`);
console.log('  No secret values are printed by this runner.');

step('Validate local secret files', 'npx', ['tsx', 'scripts/gateforge-local-secret-files-check.ts', '--dir', secretDir]);

if (dryRun) {
  step('Plan local secret upload', 'npx', [
    'tsx',
    'scripts/gateforge-upload-local-secrets.ts',
    '--dry-run',
    '--dir',
    secretDir,
  ]);
  const triggerArgs = ['tsx', 'scripts/gateforge-trigger-hosted-strict.ts', '--dry-run'];
  if (fromFile) triggerArgs.push('--from-file', fromFile);
  step('Plan hosted strict trigger', 'npx', triggerArgs);
  console.log('\nGateForge hosted unblock runner: dry run complete; rerun with --apply to upload and trigger.');
  process.exit(0);
}

step('Upload local secrets', 'npx', ['tsx', 'scripts/gateforge-upload-local-secrets.ts', '--apply', '--dir', secretDir]);
step('Audit GitHub secret names', 'npx', ['tsx', 'scripts/gateforge-github-secrets-audit.ts']);
step('Trigger hosted strict workflow', 'npx', ['tsx', 'scripts/gateforge-trigger-hosted-strict.ts']);

if (watch) {
  step('Watch hosted strict workflow', 'gh', ['run', 'watch', '--exit-status']);
} else {
  step('List hosted strict workflow', 'gh', ['run', 'list', '--workflow', 'GateForge Hosted Staging Strict', '--limit', '1']);
}

console.log('\nGateForge hosted unblock runner: complete.');
