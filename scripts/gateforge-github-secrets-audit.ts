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
const outIndex = process.argv.indexOf('--out');
const reportPath = outIndex >= 0 ? process.argv[outIndex + 1] : defaultReportPath;
const remediationOutIndex = process.argv.indexOf('--remediation-out');
const remediationPath = remediationOutIndex >= 0 ? process.argv[remediationOutIndex + 1] : defaultRemediationPath;
const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();
const required = [...attestationSecrets, ...runtimeSecrets];

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

const present = new Set(loadSecretNames());
const missing = required.filter((name) => !present.has(name));
const now = new Date().toISOString();
const status = missing.length ? 'MISSING_SECRETS' : 'READY';

const rows = required
  .map((name) => {
    const kind = attestationSecrets.includes(name) ? 'attestation' : 'runtime';
    return `| \`${name}\` | ${kind} | ${present.has(name) ? 'PRESENT' : 'MISSING'} |`;
  })
  .join('\n');

const body = `# GitHub Secrets Presence Audit

Generated: \`${now}\`

Status: \`${status}\`

Source: \`${fromFile ? fromFile : 'gh secret list --json name'}\`

This audit checks secret names only. It does not read, print, or validate secret values.

## Summary

- Required secrets: \`${required.length}\`
- Present secrets: \`${required.length - missing.length}\`
- Missing secrets: \`${missing.length}\`

## Required Secret Presence

| Secret | Kind | Status |
| --- | --- | --- |
${rows}

## Next Step

${missing.length ? 'Set the missing GitHub Actions secrets, then rerun this audit before triggering `GateForge Hosted Staging Strict`.' : 'Trigger `GateForge Hosted Staging Strict`.'}
`;

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, body);
writeRemediation(missing, required.length, now);

if (missing.length) {
  console.error('GateForge GitHub secrets audit: MISSING_SECRETS');
  missing.forEach((name) => console.error(`  - ${name}`));
  console.error(`wrote ${reportPath}`);
  process.exit(1);
}

console.log('GateForge GitHub secrets audit: READY');
console.log(`  required secrets present: ${required.length}/${required.length}`);
console.log(`  wrote ${reportPath}`);

function writeRemediation(missingSecrets: string[], requiredCount: number, generatedAt: string) {
  const missingCommands = missingSecrets.map((name) => `gh secret set ${name}`).join('\n');
  const status = missingSecrets.length ? 'ACTION_REQUIRED' : 'READY';
  const remediation = `# Missing GitHub Secrets Remediation

Generated: \`${generatedAt}\`

Status: \`${status}\`

This file contains secret names and setup commands only. It must not contain secret values.

## Summary

- Required secrets: \`${requiredCount}\`
- Missing secrets: \`${missingSecrets.length}\`

## Commands

${missingSecrets.length ? `Run these commands locally and paste each staging value when prompted:

\`\`\`bash
${missingCommands}
\`\`\`` : 'No missing GitHub Actions secrets were detected.'}

## Verification

\`\`\`bash
npm run gateforge:github-secrets-audit
gh workflow run "GateForge Hosted Staging Strict"
\`\`\`
`;
  fs.writeFileSync(remediationPath, remediation);
}
