#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

const defaultOutPath = 'gateforge-audit/external-attestations/hosted-staging-attestation.json';
const outPath = process.argv[2] || defaultOutPath;
const reportPath = 'gateforge-audit/run-2026-06-23-1035/37_hosted_staging_strict_dispatch.md';
const rawJson = process.env.GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON;
const rawB64 = process.env.GATEFORGE_HOSTED_STAGING_ATTESTATION_B64;

function writeReport(status: string, details: string[]) {
  if (outPath !== defaultOutPath) return;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    `# Hosted Staging Strict Dispatch

Generated: \`${new Date().toISOString()}\`

Status: \`${status}\`

## Details

${details.map((detail) => `- ${detail}`).join('\n')}

## Required Secret

Set one of these GitHub Actions secrets:

- \`GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON\`
- \`GATEFORGE_HOSTED_STAGING_ATTESTATION_B64\`

The value must be the sanitized JSON packet for \`${outPath}\`. Do not include raw secrets, tokens, database URLs, private keys, customer PII, or provider payloads.
`,
  );
}

function fail(message: string): never {
  writeReport('BLOCKED', [message]);
  console.error(`GateForge hosted attestation: FAIL - ${message}`);
  process.exit(1);
}

const candidate = rawJson || (rawB64 ? Buffer.from(rawB64, 'base64').toString('utf8') : '');
if (!candidate.trim()) fail('missing hosted attestation secret');

let parsed: unknown;
try {
  parsed = JSON.parse(candidate);
} catch (e: any) {
  fail(`hosted attestation is not valid JSON: ${String(e?.message ?? e)}`);
}

const serialized = JSON.stringify(parsed, null, 2);
if (/postgres(?:ql)?:\/\/|sk-[A-Za-z0-9_-]{8,}|private[_-]?key|password|secret=.*|token=.*/i.test(serialized)) {
  fail('hosted attestation appears to contain unsafe secret-like content');
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${serialized}\n`);
writeReport('PREPARED', [`wrote sanitized packet to \`${outPath}\``, 'packet content was not printed']);
console.log(`GateForge hosted attestation: wrote ${outPath}`);
