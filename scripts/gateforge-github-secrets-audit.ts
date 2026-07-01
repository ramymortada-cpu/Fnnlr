#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

type GhSecret = { name: string };

const defaultReportPath = 'gateforge-audit/run-2026-06-23-1035/39_github_secrets_presence_audit.md';
const defaultRemediationPath = 'gateforge-audit/run-2026-06-23-1035/40_missing_github_secrets_remediation.md';
const fromFileIndex = process.argv.indexOf('--from-file');
const fromFile = fromFileIndex >= 0 ? process.argv[fromFileIndex + 1] : '';
const sourceLabelIndex = process.argv.indexOf('--source-label');
const sourceLabel =
  sourceLabelIndex >= 0 ? process.argv[sourceLabelIndex + 1] : fromFile ? fromFile : 'gh secret list --json name';
const outIndex = process.argv.indexOf('--out');
const reportPath = outIndex >= 0 ? process.argv[outIndex + 1] : defaultReportPath;
const remediationOutIndex = process.argv.indexOf('--remediation-out');
const remediationPath = remediationOutIndex >= 0 ? process.argv[remediationOutIndex + 1] : defaultRemediationPath;
const checkMode = process.argv.includes('--check');
const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();
const knownSecretNames = [...attestationSecrets, ...runtimeSecrets];

function fail(message: string): never {
  console.error(`GateForge GitHub secrets audit: FAIL - ${message}`);
  process.exit(1);
}

function loadSecretNames(): string[] {
  if (fromFile) {
    const parsed = JSON.parse(fs.readFileSync(fromFile, 'utf8')) as GhSecret[];
    return parsed.map((entry) => entry.name);
  }
  const result = spawnSync('gh', ['secret', 'list', '--json', 'name'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    fail(`gh secret list failed; authenticate gh or pass --from-file. ${String(result.stderr || '').trim()}`);
  }
  const parsed = JSON.parse(result.stdout) as GhSecret[];
  return parsed.map((entry) => entry.name);
}

function normalizeGenerated(text: string): string {
  return text.replace(/^Generated: `[^`]+`$/gm, 'Generated: `<normalized>`');
}

function assertFresh(filePath: string, expected: string): void {
  if (!fs.existsSync(filePath)) {
    fail(`${filePath} is missing`);
  }
  const actual = fs.readFileSync(filePath, 'utf8');
  if (normalizeGenerated(actual) !== normalizeGenerated(expected)) {
    fail(`${filePath} is stale; rerun the matching GateForge GitHub secrets audit generator`);
  }
}

const present = new Set(loadSecretNames());
const hasAttestation = attestationSecrets.some((name) => present.has(name));
const missingRuntime = runtimeSecrets.filter((name) => !present.has(name));
const blockingMissing = [...missingRuntime];
const missingAttestationAlternatives = hasAttestation ? [] : [...attestationSecrets];
const now = new Date().toISOString();
const status = missingRuntime.length || !hasAttestation ? 'MISSING_SECRETS' : 'READY';

const rows = knownSecretNames
  .map((name) => {
    const kind = attestationSecrets.includes(name) ? 'attestation' : 'runtime';
    const requirement = kind === 'attestation' ? 'one_of_attestation' : 'required';
    return `| \`${name}\` | ${kind} | ${requirement} | ${present.has(name) ? 'PRESENT' : 'MISSING'} |`;
  })
  .join('\n');

const body = `# GitHub Secrets Presence Audit

Generated: \`${now}\`

Status: \`${status}\`

Source: \`${sourceLabel}\`

This audit checks secret names only. It does not read, print, or validate secret values.

## Summary

- Known secret names: \`${knownSecretNames.length}\`
- Required runtime secrets: \`${runtimeSecrets.length}\`
- Required attestation secrets: \`1 of ${attestationSecrets.length}\`
- Present known secret names: \`${knownSecretNames.filter((name) => present.has(name)).length}\`
- Missing runtime secrets: \`${missingRuntime.length}\`
- Attestation present: \`${hasAttestation ? 'yes' : 'no'}\`

## Required Secret Presence

| Secret | Kind | Requirement | Status |
| --- | --- | --- | --- |
${rows}

## Next Step

${status === 'READY' ? 'Trigger `GateForge Hosted Staging Strict`.' : 'Set every missing runtime secret and at least one attestation secret, then rerun this audit before triggering `GateForge Hosted Staging Strict`.'}
`;

const remediationBody = renderRemediation(missingRuntime, missingAttestationAlternatives, knownSecretNames.length, now);

if (checkMode) {
  assertFresh(reportPath, body);
  assertFresh(remediationPath, remediationBody);
  console.log('GateForge GitHub secrets remediation check: PASS');
  console.log(`  status baseline: ${status}`);
  console.log(`  checked ${reportPath}`);
  console.log(`  checked ${remediationPath}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, body);
fs.mkdirSync(path.dirname(remediationPath), { recursive: true });
fs.writeFileSync(remediationPath, remediationBody);

if (status !== 'READY') {
  console.error('GateForge GitHub secrets audit: MISSING_SECRETS');
  if (!hasAttestation) console.error(`  - missing one attestation secret: ${attestationSecrets.join(' or ')}`);
  missingRuntime.forEach((name) => console.error(`  - ${name}`));
  console.error(`wrote ${reportPath}`);
  process.exit(1);
}

console.log('GateForge GitHub secrets audit: READY');
console.log(`  runtime secrets present: ${runtimeSecrets.length}/${runtimeSecrets.length}`);
console.log(`  attestation secret present: yes`);
console.log(`  wrote ${reportPath}`);

function renderRemediation(
  missingRuntimeSecrets: string[],
  attestationAlternatives: string[],
  knownSecretCount: number,
  generatedAt: string,
): string {
  const missingCount = missingRuntimeSecrets.length + (attestationAlternatives.length ? 1 : 0);
  const missingCommands = missingRuntimeSecrets.map((name) => `gh secret set ${name}`).join('\n');
  const attestationCommands = [...attestationAlternatives]
    .sort((a, b) => (a.endsWith('_B64') ? -1 : b.endsWith('_B64') ? 1 : a.localeCompare(b)))
    .map((name) => `gh secret set ${name}`)
    .join('\n');
  const status = missingCount ? 'ACTION_REQUIRED' : 'READY';
  const remediation = `# Missing GitHub Secrets Remediation

Generated: \`${generatedAt}\`

Status: \`${status}\`

This file contains secret names and setup commands only. It must not contain secret values.

## Summary

- Known secret names: \`${knownSecretCount}\`
- Required runtime secrets: \`${runtimeSecrets.length}\`
- Required attestation secrets: \`1 of ${attestationSecrets.length}\`
- Missing runtime secrets: \`${missingRuntimeSecrets.length}\`
- Missing attestation requirement: \`${attestationAlternatives.length ? 'yes' : 'no'}\`

## Commands

${attestationAlternatives.length ? `Set exactly one attestation secret. Prefer the base64 packet:

\`\`\`bash
${attestationCommands}
\`\`\`

` : ''}${missingRuntimeSecrets.length ? `Run these commands locally and paste each staging value when prompted:

\`\`\`bash
${missingCommands}
\`\`\`` : attestationAlternatives.length ? '' : 'No missing GitHub Actions secrets were detected.'}

## Verification

\`\`\`bash
npm run gateforge:github-secrets-audit
npm run gateforge:trigger-hosted-strict
\`\`\`
`;
  return remediation;
}
