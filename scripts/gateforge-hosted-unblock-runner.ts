#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';

const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run') || !apply;
const watch = process.argv.includes('--watch');
const prepareAttestation = process.argv.includes('--prepare-attestation');
const dirArgIndex = process.argv.indexOf('--dir');
const secretDir = dirArgIndex >= 0 ? process.argv[dirArgIndex + 1] : '/tmp/fnnlr-gateforge-secrets';
const packetArgIndex = process.argv.indexOf('--packet');
const packetPath =
  packetArgIndex >= 0 ? process.argv[packetArgIndex + 1] : 'gateforge-audit/external-attestations/hosted-staging-attestation.json';
const attestationPackOutIndex = process.argv.indexOf('--attestation-pack-out');
const attestationPackOut =
  attestationPackOutIndex >= 0 ? process.argv[attestationPackOutIndex + 1] : 'gateforge-audit/run-2026-06-23-1035/46_attestation_secret_pack.md';
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
console.log(`  prepare attestation: ${prepareAttestation ? 'yes' : 'no'}`);
console.log(`  watch: ${watch ? 'yes' : 'no'}`);
console.log('  No secret values are printed by this runner.');

if (prepareAttestation) {
  step('Prepare attestation B64 secret file', 'npx', [
    'tsx',
    'scripts/gateforge-attestation-secret-pack.ts',
    '--packet',
    packetPath,
    '--secret-dir',
    secretDir,
    '--out',
    attestationPackOut,
    '--write-b64',
  ]);
}

step('Validate local secret files', 'npx', ['tsx', 'scripts/gateforge-local-secret-files-check.ts', '--dir', secretDir]);

if (dryRun) {
  step('Plan local secret upload', 'npx', [
    'tsx',
    'scripts/gateforge-upload-local-secrets.ts',
    '--dry-run',
    '--dir',
    secretDir,
  ]);
  const triggerArgs = [
    'tsx',
    'scripts/gateforge-trigger-hosted-strict.ts',
    '--dry-run',
    '--external-file',
    packetPath,
  ];
  if (fromFile) triggerArgs.push('--from-file', fromFile);
  step('Plan hosted strict trigger', 'npx', triggerArgs);
  console.log('\nGateForge hosted unblock runner: dry run complete; rerun with --apply to upload and trigger.');
  process.exit(0);
}

step('Upload local secrets', 'npx', ['tsx', 'scripts/gateforge-upload-local-secrets.ts', '--apply', '--dir', secretDir]);
step('Audit GitHub secret names', 'npx', ['tsx', 'scripts/gateforge-github-secrets-audit.ts']);
step('Trigger hosted strict workflow', 'npx', [
  'tsx',
  'scripts/gateforge-trigger-hosted-strict.ts',
  '--external-file',
  packetPath,
]);

if (watch) {
  step('Watch hosted strict workflow', 'gh', ['run', 'watch', '--exit-status']);
} else {
  step('List hosted strict workflow', 'gh', ['run', 'list', '--workflow', 'GateForge Hosted Staging Strict', '--limit', '1']);
}

console.log('\nGateForge hosted unblock runner: complete.');
