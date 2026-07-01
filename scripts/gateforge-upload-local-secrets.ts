#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const defaultDir = '/tmp/fnnlr-gateforge-secrets';
const dirArgIndex = process.argv.indexOf('--dir');
const secretDir = dirArgIndex >= 0 ? process.argv[dirArgIndex + 1] : defaultDir;
const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run') || !apply;
const reportOutIndex = process.argv.indexOf('--report-out');
const reportPath =
  reportOutIndex >= 0
    ? process.argv[reportOutIndex + 1]
    : 'gateforge-audit/run-2026-06-23-1035/57_secret_upload_attempt.md';
const jsonOutIndex = process.argv.indexOf('--json-out');
const jsonPath =
  jsonOutIndex >= 0
    ? process.argv[jsonOutIndex + 1]
    : 'gateforge-audit/run-2026-06-23-1035/57_secret_upload_attempt.json';
const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();
type UploadRow = {
  name: string;
  kind: 'attestation' | 'runtime';
  action: 'WOULD_UPLOAD' | 'UPLOADED' | 'FAILED';
  status: 'PASS' | 'FAIL';
};

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

function fileReady(name: string): boolean {
  const file = path.join(secretDir, name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  return Boolean(fs.readFileSync(file, 'utf8').trim());
}

function fail(message: string): never {
  console.error(`GateForge upload local secrets: FAIL - ${message}`);
  process.exit(1);
}

const validation = run('npx', ['tsx', 'scripts/gateforge-local-secret-files-check.ts', '--dir', secretDir]);
process.stdout.write(validation.output);
if (validation.status !== 0) {
  writeReport('BLOCKED_LOCAL_SECRET_VALIDATION', [], [
    'Local secret files are not ready; upload was not attempted.',
    'Run `npm run gateforge:secret-replacement-packet` and replace every missing, placeholder, empty, or invalid value with real staging values.',
  ]);
  fail('local secret files are not ready; upload was not attempted');
}

const attestation = attestationSecrets.find((name) => fileReady(name));
if (!attestation) fail('no ready attestation file after validation');
const uploadNames = [attestation, ...runtimeSecrets];

console.log(`GateForge upload local secrets: ${dryRun ? 'DRY_RUN' : 'APPLY'}`);
console.log(`  directory: ${secretDir}`);
console.log(`  attestation selected: ${attestation}`);
console.log(`  runtime secrets: ${runtimeSecrets.length}/${runtimeSecrets.length}`);
console.log('  No secret values were printed.');

const rows: UploadRow[] = [];
for (const name of uploadNames) {
  const file = path.join(secretDir, name);
  const kind = name === attestation ? 'attestation' : 'runtime';
  if (dryRun) {
    console.log(`  would upload: ${name} from ${file}`);
    rows.push({ name, kind, action: 'WOULD_UPLOAD', status: 'PASS' });
    continue;
  }
  const result = run('gh', ['secret', 'set', name, '--body-file', file]);
  if (result.status !== 0) {
    rows.push({ name, kind, action: 'FAILED', status: 'FAIL' });
    writeReport('FAILED_UPLOAD', rows, [
      `GitHub secret upload failed for \`${name}\`.`,
      'No secret values were printed.',
      'Check GitHub CLI authentication, repository permissions, and network availability.',
    ]);
    fail(`gh secret set failed for ${name}: ${result.output.trim()}`);
  }
  console.log(`  uploaded: ${name}`);
  rows.push({ name, kind, action: 'UPLOADED', status: 'PASS' });
}

if (dryRun) {
  writeReport('DRY_RUN_READY', rows, ['Dry run only; no GitHub secrets were written.']);
  console.log('GateForge upload local secrets: dry run complete; rerun with --apply to upload.');
} else {
  writeReport('UPLOAD_COMPLETE', rows, [
    'GitHub secret upload commands completed.',
    'Run `npm run gateforge:github-secrets-audit` next.',
  ]);
  console.log('GateForge upload local secrets: upload complete; run npm run gateforge:github-secrets-audit next.');
}

function writeReport(status: string, rows: UploadRow[], details: string[]) {
  const generatedAt = new Date().toISOString();
  const json = {
    generatedAt,
    status,
    mode: dryRun ? 'DRY_RUN' : 'APPLY',
    directory: secretDir,
    selectedAttestation: rows.find((row) => row.kind === 'attestation')?.name ?? null,
    uploadRows: rows,
    details,
    safety: {
      secretValuesPrinted: false,
      productionMutated: false,
      sourceDumpsIncluded: false,
    },
  };
  const tableRows = rows.length
    ? rows.map((row) => `| \`${row.name}\` | ${row.kind} | \`${row.action}\` | \`${row.status}\` |`).join('\n')
    : '| None | None | None | None |';
  const body = `# GateForge Secret Upload Attempt

Generated: \`${generatedAt}\`

Status: \`${status}\`

Mode: \`${dryRun ? 'DRY_RUN' : 'APPLY'}\`

Directory: \`${secretDir}\`

This report records secret names and upload actions only. It never contains secret values.

## Upload Rows

| Secret | Kind | Action | Status |
| --- | --- | --- | --- |
${tableRows}

## Details

${details.map((detail) => `- ${detail}`).join('\n')}

## Safety

- Secret values printed: \`NO\`
- Production mutated: \`NO\`
- Source dumps included: \`NO\`
`;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, body);
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(json, null, 2)}\n`);
}
