#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

const defaultOutPath = 'gateforge-audit/external-attestations/hosted-staging-attestation.json';
const defaultReportPath = 'gateforge-audit/run-2026-06-23-1035/37_hosted_staging_strict_dispatch.md';

const outArgIndex = process.argv.indexOf('--out');
const reportOutIndex = process.argv.indexOf('--report-out');
const jsonOutIndex = process.argv.indexOf('--json-out');
const checkOnly = process.argv.includes('--check');
const positionalOutPath = process.argv.slice(2).find((arg, index, args) => {
  const previous = args[index - 1];
  return !arg.startsWith('--') && previous !== '--out' && previous !== '--report-out' && previous !== '--json-out';
});
const outPath = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : positionalOutPath || defaultOutPath;
const reportPath = reportOutIndex >= 0 ? process.argv[reportOutIndex + 1] : defaultReportPath;
const jsonPath = jsonOutIndex >= 0 ? process.argv[jsonOutIndex + 1] : reportPath.replace(/\.md$/, '.json');

const rawJson = process.env.GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON;
const rawB64 = process.env.GATEFORGE_HOSTED_STAGING_ATTESTATION_B64;

function normalizeGenerated(text: string): string {
  return text
    .replace(/^Generated: `[^`]+`$/gm, 'Generated: `<normalized>`')
    .replace(/"generatedAt": "[^"]+"/g, '"generatedAt": "<normalized>"');
}

function failCheck(message: string): never {
  console.error(`GateForge hosted attestation: FAIL - ${message}`);
  process.exit(1);
}

function assertFresh(filePath: string, expected: string): void {
  if (!fs.existsSync(filePath)) failCheck(`${filePath} is missing`);
  const actual = fs.readFileSync(filePath, 'utf8');
  if (normalizeGenerated(actual) !== normalizeGenerated(expected)) {
    failCheck(`${filePath} is stale; rerun npm run gateforge:prepare-hosted-attestation`);
  }
}

function reportBody(status: string, details: string[], generatedAt: string): string {
  return `# Hosted Staging Strict Dispatch

Generated: \`${generatedAt}\`

Status: \`${status}\`

## Details

${details.map((detail) => `- ${detail}`).join('\n')}

## Purpose

This is the strict GitHub Actions path that can move fnnlr from \`CANNOT_APPROVE\` to \`CONDITIONAL_GO\` once real hosted staging secrets and sanitized external attestation evidence exist.

## Workflow

Run:

\`\`\`text
GateForge Hosted Staging Strict
\`\`\`

from GitHub Actions \`workflow_dispatch\`.

## Required Secret

Set one of these GitHub Actions secrets:

- \`GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON\`
- \`GATEFORGE_HOSTED_STAGING_ATTESTATION_B64\`

The value must be the sanitized JSON packet for \`${outPath}\`. Do not include raw secrets, tokens, database URLs, private keys, customer PII, or provider payloads.

The packet must validate as:

\`\`\`bash
npm run gateforge:external-check
\`\`\`

## Required Runtime Secrets

- \`CONTROL_PLANE_DATABASE_URL\`
- \`TENANT_DB_ADMIN_URL\`
- \`TENANT_DB_HOST\`
- \`TENANT_CREDENTIAL_ENCRYPTION_KEY\`
- \`INTEGRATION_ENCRYPTION_KEY\`
- \`FNNLR_CRON_SECRET\`
- \`AUTH_MFA_ENCRYPTION_KEY\`
- \`FNNLR_AI_TENANT_DAILY_USD_CAP\`
- \`FNNLR_AI_GLOBAL_DAILY_USD_CAP\`
- \`SENTRY_DSN\`
- \`UPTIME_HEALTHCHECK_URL\`
- \`ALERT_EMAIL_TO\`
- \`ALERT_WEBHOOK_URL\`
- \`RESEND_API_KEY\`
- \`EMAIL_FROM\`
- \`EMAIL_REPLY_TO\`
- \`ANTHROPIC_API_KEY\`

## Strict Gate

The workflow intentionally fails if any hosted/runtime/external evidence is missing. A successful run is the GitHub-hosted proof needed to request \`CONDITIONAL_GO\`.
`;
}

function jsonBody(status: string, details: string[], generatedAt: string): string {
  return `${JSON.stringify(
    {
      generatedAt,
      status,
      outputPath: outPath,
      details,
      safety: {
        secretValuesPrinted: false,
        productionMutated: false,
        sourceDumpsIncluded: false,
      },
    },
    null,
    2,
  )}\n`;
}

function writeReport(status: string, details: string[], generatedAt: string) {
  if (outPath !== defaultOutPath) return;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, reportBody(status, details, generatedAt));
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, jsonBody(status, details, generatedAt));
}

function finishBlocked(message: string): never {
  const generatedAt = new Date().toISOString();
  const details = [message];
  if (checkOnly) {
    assertFresh(reportPath, reportBody('BLOCKED', details, generatedAt));
    assertFresh(jsonPath, jsonBody('BLOCKED', details, generatedAt));
    console.log('GateForge hosted attestation: PASS (BLOCKED)');
    process.exit(0);
  }
  writeReport('BLOCKED', details, generatedAt);
  console.error(`GateForge hosted attestation: FAIL - ${message}`);
  process.exit(1);
}

const candidate = rawJson || (rawB64 ? Buffer.from(rawB64, 'base64').toString('utf8') : '');
if (!candidate.trim()) finishBlocked('missing hosted attestation secret');

let parsed: unknown;
try {
  parsed = JSON.parse(candidate);
} catch (error: any) {
  finishBlocked(`hosted attestation is not valid JSON: ${String(error?.message ?? error)}`);
}

const serialized = JSON.stringify(parsed, null, 2);
if (/postgres(?:ql)?:\/\/|sk-[A-Za-z0-9_-]{8,}|private[_-]?key|password|secret=.*|token=.*/i.test(serialized)) {
  finishBlocked('hosted attestation appears to contain unsafe secret-like content');
}

const generatedAt = new Date().toISOString();
const details = [`wrote sanitized packet to \`${outPath}\``, 'packet content was not printed'];

if (checkOnly) {
  assertFresh(reportPath, reportBody('PREPARED', details, generatedAt));
  assertFresh(jsonPath, jsonBody('PREPARED', details, generatedAt));
  if (outPath === defaultOutPath) assertFresh(outPath, `${serialized}\n`);
  console.log(`GateForge hosted attestation: PASS (${outPath})`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${serialized}\n`);
writeReport('PREPARED', details, generatedAt);
console.log(`GateForge hosted attestation: wrote ${outPath}`);
