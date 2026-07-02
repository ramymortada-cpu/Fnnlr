#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const runDir = 'gateforge-audit/run-2026-06-23-1035';
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : `${runDir}/49_local_secret_env_template.env`;
const markdownOutIndex = process.argv.indexOf('--md-out');
const markdownOutPath =
  markdownOutIndex >= 0 ? process.argv[markdownOutIndex + 1] : `${runDir}/49_local_secret_env_template.md`;
const checkOnly = process.argv.includes('--check');

type SecretDoc = {
  purpose: string;
  placeholder: string;
  validation: string;
};

const docsBySecret: Record<string, SecretDoc> = {
  GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON: {
    purpose: 'Optional raw hosted staging evidence packet JSON. Use B64 instead when uploading to GitHub.',
    placeholder: 'REPLACE_WITH_HOSTED_STAGING_ATTESTATION_JSON',
    validation: 'JSON object with HOSTED_STAGING or PRODUCTION_READ_ONLY evidence and PASS items.',
  },
  GATEFORGE_HOSTED_STAGING_ATTESTATION_B64: {
    purpose: 'Preferred base64 encoded hosted staging evidence packet.',
    placeholder: 'REPLACE_WITH_HOSTED_STAGING_ATTESTATION_B64',
    validation: 'Base64 text that decodes to a valid hosted staging attestation packet.',
  },
  CONTROL_PLANE_DATABASE_URL: {
    purpose: 'Staging control-plane Postgres URL.',
    placeholder: 'REPLACE_WITH_STAGING_CONTROL_PLANE_DATABASE_URL',
    validation: 'postgres/postgresql URL with username, password, and host.',
  },
  TENANT_DB_ADMIN_URL: {
    purpose: 'Staging tenant database admin URL with create/drop permissions.',
    placeholder: 'REPLACE_WITH_STAGING_TENANT_DB_ADMIN_URL',
    validation: 'postgres/postgresql URL with username, password, and host.',
  },
  TENANT_DB_HOST: {
    purpose: 'Staging tenant database host only.',
    placeholder: 'REPLACE_WITH_STAGING_TENANT_DB_HOST',
    validation: 'Host only; no protocol, credentials, or path.',
  },
  TENANT_CREDENTIAL_ENCRYPTION_KEY: {
    purpose: 'Staging-only tenant credential encryption key.',
    placeholder: 'REPLACE_WITH_STAGING_TENANT_CREDENTIAL_ENCRYPTION_KEY',
    validation: 'At least 24 characters.',
  },
  INTEGRATION_ENCRYPTION_KEY: {
    purpose: 'Staging-only integration secret encryption key.',
    placeholder: 'REPLACE_WITH_STAGING_INTEGRATION_ENCRYPTION_KEY',
    validation: 'At least 24 characters.',
  },
  FNNLR_CRON_SECRET: {
    purpose: 'Staging cron authentication secret.',
    placeholder: 'REPLACE_WITH_STAGING_FNNLR_CRON_SECRET',
    validation: 'At least 24 characters.',
  },
  AUTH_MFA_ENCRYPTION_KEY: {
    purpose: 'Staging admin MFA encryption key.',
    placeholder: 'REPLACE_WITH_STAGING_AUTH_MFA_ENCRYPTION_KEY',
    validation: 'At least 24 characters.',
  },
  FNNLR_AI_TENANT_DAILY_USD_CAP: {
    purpose: 'Approved staging per-tenant AI daily spend cap.',
    placeholder: 'REPLACE_WITH_STAGING_AI_TENANT_DAILY_USD_CAP',
    validation: 'Positive number.',
  },
  FNNLR_AI_GLOBAL_DAILY_USD_CAP: {
    purpose: 'Approved staging global AI daily spend cap.',
    placeholder: 'REPLACE_WITH_STAGING_AI_GLOBAL_DAILY_USD_CAP',
    validation: 'Positive number.',
  },
  SENTRY_DSN: {
    purpose: 'Staging Sentry or equivalent error monitoring DSN.',
    placeholder: 'REPLACE_WITH_STAGING_SENTRY_DSN',
    validation: 'HTTPS DSN.',
  },
  UPTIME_HEALTHCHECK_URL: {
    purpose: 'Public staging /health uptime monitor URL.',
    placeholder: 'REPLACE_WITH_STAGING_UPTIME_HEALTHCHECK_URL',
    validation: 'HTTPS URL.',
  },
  ALERT_EMAIL_TO: {
    purpose: 'Operations email address for staging alerts.',
    placeholder: 'REPLACE_WITH_STAGING_ALERT_EMAIL_TO',
    validation: 'Valid email address.',
  },
  ALERT_WEBHOOK_URL: {
    purpose: 'Staging alert webhook URL for runtime failure alerts.',
    placeholder: 'REPLACE_WITH_STAGING_ALERT_WEBHOOK_URL',
    validation: 'HTTPS URL.',
  },
  RESEND_API_KEY: {
    purpose: 'Staging transactional email provider key.',
    placeholder: 'REPLACE_WITH_STAGING_RESEND_API_KEY',
    validation: 'Non-trivial provider API key.',
  },
  EMAIL_FROM: {
    purpose: 'Verified staging transactional sender address.',
    placeholder: 'REPLACE_WITH_STAGING_EMAIL_FROM',
    validation: 'Valid email address.',
  },
  EMAIL_REPLY_TO: {
    purpose: 'Support reply-to mailbox for staging emails.',
    placeholder: 'REPLACE_WITH_STAGING_EMAIL_REPLY_TO',
    validation: 'Valid email address.',
  },
  ANTHROPIC_API_KEY: {
    purpose: 'Capped staging Anthropic API key.',
    placeholder: 'REPLACE_WITH_STAGING_ANTHROPIC_API_KEY',
    validation: 'Non-trivial provider API key.',
  },
};

function docFor(name: string): SecretDoc {
  return (
    docsBySecret[name] ?? {
      purpose: 'Operator-provided GateForge staging secret.',
      placeholder: `REPLACE_WITH_${name}`,
      validation: 'Must pass gateforge:import-local-secrets validation.',
    }
  );
}

function envBlock(name: string, required: boolean) {
  const doc = docFor(name);
  return [`# ${doc.purpose}`, `# Validation: ${doc.validation}`, `# Required: ${required ? 'YES' : 'ONE_OF_ATTESTATION_OPTIONS'}`, `${name}=${doc.placeholder}`].join('\n');
}

function mdRow(name: string, required: boolean) {
  const doc = docFor(name);
  return `| \`${name}\` | ${required ? 'Required runtime secret' : 'One attestation option required'} | ${doc.purpose} | ${doc.validation} |`;
}

const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();
const now = new Date().toISOString();

function renderEnv(generatedAt: string) {
  return [
    '# GateForge local secret import template',
    `# Generated: ${generatedAt}`,
    '# Fill this file outside git, then run:',
    '# npm run gateforge:import-local-secrets -- --env-file /secure/path/fnnlr-staging.env --require-all',
    '# Do not commit a filled copy of this file.',
    '',
    '# Attestation options: at least one must be real and valid.',
    ...attestationSecrets.map((name) => envBlock(name, false)),
    '',
    '# Runtime secrets: every runtime secret is required for hosted GA evidence.',
    ...runtimeSecrets.map((name) => envBlock(name, true)),
  ].join('\n\n') + '\n';
}

function renderMarkdown(generatedAt: string) {
  return `# GateForge Local Secret Env Template

Generated: \`${generatedAt}\`

This is a sanitized operator template. It contains placeholders only and is safe to commit as evidence of the required staging inputs.

## Use

\`\`\`bash
cp ${outPath} /secure/path/fnnlr-staging.env
npm run gateforge:import-local-secrets -- --env-file /secure/path/fnnlr-staging.env --require-all
npm run gateforge:hosted-readiness-doctor
\`\`\`

## Required Inputs

| Secret | Requirement | Purpose | Validation |
| --- | --- | --- | --- |
${[...attestationSecrets.map((name) => mdRow(name, false)), ...runtimeSecrets.map((name) => mdRow(name, true))].join('\n')}

## Safety Rules

- Keep filled env files outside git.
- Never paste secret values into reports, issues, or chat.
- Use \`gateforge:import-local-secrets\` so all rows validate before any local secret file is written.
- Use \`gateforge:hosted-unblock -- --apply\` only after the readiness doctor says \`UPLOAD_GITHUB_SECRETS\`.
`;
}

const envBody = renderEnv(now);
const mdBody = renderMarkdown(now);

if (checkOnly) {
  const expectedGeneratedAt = 'CHECK_TIMESTAMP';
  const expectedEnv = renderEnv(expectedGeneratedAt);
  const expectedMd = renderMarkdown(expectedGeneratedAt);
  const currentEnv = fs.existsSync(outPath)
    ? fs.readFileSync(outPath, 'utf8').replace(/^# Generated: .+$/m, `# Generated: ${expectedGeneratedAt}`)
    : '';
  const currentMd = fs.existsSync(markdownOutPath)
    ? fs.readFileSync(markdownOutPath, 'utf8').replace(/Generated: `[^`]+`/, `Generated: \`${expectedGeneratedAt}\``)
    : '';
  const errors: string[] = [];

  if (!currentEnv) errors.push(`missing generated env template: ${outPath}`);
  else if (currentEnv !== expectedEnv) errors.push(`stale generated env template: ${outPath}`);
  if (!currentMd) errors.push(`missing generated markdown template: ${markdownOutPath}`);
  else if (currentMd !== expectedMd) errors.push(`stale generated markdown template: ${markdownOutPath}`);

  if (errors.length) {
    console.error('GateForge local secret env template: FAIL');
    errors.forEach((error) => console.error(`  - ${error}`));
    console.error('Run: npm run gateforge:local-secrets-env-template');
    process.exit(1);
  }

  console.log('GateForge local secret env template: PASS');
  process.exit(0);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, envBody);
fs.writeFileSync(markdownOutPath, mdBody);

console.log('GateForge local secret env template: READY');
console.log(`  wrote ${outPath}`);
console.log(`  wrote ${markdownOutPath}`);
console.log(`  attestation options: ${attestationSecrets.length}`);
console.log(`  runtime secrets: ${runtimeSecrets.length}`);
console.log('  No secret values were printed.');
