#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';
import { validateGateForgeSecretValue } from './gateforge-secret-value-validation.js';

const defaultDir = '/tmp/fnnlr-gateforge-secrets';
const dirArgIndex = process.argv.indexOf('--dir');
const secretDir = dirArgIndex >= 0 ? process.argv[dirArgIndex + 1] : defaultDir;
const json = process.argv.includes('--json');
const checkOnly = process.argv.includes('--check');
const reportOutIndex = process.argv.indexOf('--report-out');
const reportPath =
  reportOutIndex >= 0
    ? process.argv[reportOutIndex + 1]
    : 'gateforge-audit/run-2026-06-23-1035/59_local_secret_files_readiness.md';
const jsonOutIndex = process.argv.indexOf('--json-out');
const jsonPath =
  jsonOutIndex >= 0
    ? process.argv[jsonOutIndex + 1]
    : 'gateforge-audit/run-2026-06-23-1035/59_local_secret_files_readiness.json';
const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

type CheckResult = {
  name: string;
  kind: 'runtime' | 'attestation';
  status: 'READY' | 'MISSING' | 'EMPTY' | 'PLACEHOLDER' | 'INVALID';
  reason?: string;
};

function normalizeGenerated(text: string): string {
  return text
    .replace(/^Generated: `[^`]+`$/gm, 'Generated: `<normalized>`')
    .replace(/"generatedAt": "[^"]+"/g, '"generatedAt": "<normalized>"');
}

function failCheck(message: string): never {
  console.error(`GateForge local secret files readiness: FAIL - ${message}`);
  process.exit(1);
}

function assertFresh(filePath: string, expected: string): void {
  if (!fs.existsSync(filePath)) failCheck(`${filePath} is missing`);
  const actual = fs.readFileSync(filePath, 'utf8');
  if (normalizeGenerated(actual) !== normalizeGenerated(expected)) {
    failCheck(`${filePath} is stale; rerun npm run gateforge:local-secret-files-readiness`);
  }
}

function readSecretFile(name: string): string | null {
  const file = path.join(secretDir, name);
  if (!fs.existsSync(file)) return null;
  if (!fs.statSync(file).isFile()) return null;
  return fs.readFileSync(file, 'utf8').trim();
}

function statusFor(name: string, kind: CheckResult['kind']): CheckResult {
  const value = readSecretFile(name);
  const validation = validateGateForgeSecretValue(name, value);
  return { name, kind, ...validation };
}

const attestationResults = attestationSecrets.map((name) => statusFor(name, 'attestation'));
const runtimeResults = runtimeSecrets.map((name) => statusFor(name, 'runtime'));
const readyAttestations = attestationResults.filter((result) => result.status === 'READY');
const failedRuntime = runtimeResults.filter((result) => result.status !== 'READY');
const ok = readyAttestations.length >= 1 && failedRuntime.length === 0;
const summary = {
  generatedAt: new Date().toISOString(),
  status: ok ? 'READY' : 'BLOCKED',
  ok,
  directory: secretDir,
  attestationReady: readyAttestations.length,
  attestationRequired: 1,
  attestationOptions: attestationResults,
  runtimeReady: runtimeResults.filter((result) => result.status === 'READY').length,
  runtimeRequired: runtimeResults.length,
  runtime: runtimeResults,
  safety: {
    secretValuesPrinted: false,
    productionMutated: false,
    sourceDumpsIncluded: false,
  },
};

function markdownRows(results: CheckResult[]) {
  return results
    .map((result) => `| \`${result.name}\` | ${result.kind} | \`${result.status}\` | ${result.reason || ''} |`)
    .join('\n');
}

function buildReport() {
  const failed = [...attestationResults, ...runtimeResults].filter((entry) => entry.status !== 'READY');
  const body = `# Local Secret Files Readiness

Generated: \`${summary.generatedAt}\`

Status: \`${summary.status}\`

Directory: \`${secretDir}\`

This report records secret names and readiness states only. It never contains secret values.

## Summary

- Runtime ready: \`${summary.runtimeReady}/${summary.runtimeRequired}\`
- Attestation options ready: \`${summary.attestationReady}/${attestationSecrets.length}\`
- Required attestation options: at least \`1\`
- Open items: \`${failed.length}\`

## Runtime Secrets

| Secret | Kind | Status | Reason |
| --- | --- | --- | --- |
${markdownRows(runtimeResults)}

## Attestation Secret Options

| Secret | Kind | Status | Reason |
| --- | --- | --- | --- |
${markdownRows(attestationResults)}

## Safety

- Secret values printed: \`NO\`
- Production mutated: \`NO\`
- Source dumps included: \`NO\`
`;
  return {
    body,
    jsonBody: `${JSON.stringify(summary, null, 2)}\n`,
  };
}

if (checkOnly) {
  const { body, jsonBody } = buildReport();
  assertFresh(reportPath, body);
  assertFresh(jsonPath, jsonBody);
  console.log(`GateForge local secret files readiness: PASS (${summary.status})`);
  console.log(`  checked ${reportPath}`);
  console.log(`  checked ${jsonPath}`);
  process.exit(0);
}

if (!json || reportOutIndex >= 0 || jsonOutIndex >= 0) {
  const { body, jsonBody } = buildReport();
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, body);
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, jsonBody);
}

if (json) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(ok ? 0 : 1);
}

if (!ok) {
  console.error('GateForge local secret files check: FAIL');
  console.error(`  directory: ${secretDir}`);
  if (!readyAttestations.length) {
    console.error(`  - missing one ready attestation file: ${attestationSecrets.join(' or ')}`);
  }
  for (const result of [...attestationResults, ...runtimeResults].filter((entry) => entry.status !== 'READY')) {
    console.error(`  - ${result.name}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
  }
  console.error('No secret values were printed.');
  process.exit(1);
}

console.log('GateForge local secret files check: PASS');
console.log(`  directory: ${secretDir}`);
console.log(`  attestation files ready: ${readyAttestations.length}/${attestationSecrets.length}`);
console.log(`  runtime files ready: ${runtimeSecrets.length}/${runtimeSecrets.length}`);
