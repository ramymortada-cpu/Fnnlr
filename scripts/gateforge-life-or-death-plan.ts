#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

type SecretPlan = {
  owner: string;
  valueSource: string;
  purpose: string;
  validation: string;
  blockerIfMissing: string;
};

const runDir = 'gateforge-audit/run-2026-06-23-1035';
const mdPath = `${runDir}/42_life_or_death_execution_plan.md`;
const csvPath = `${runDir}/42_life_or_death_secret_collection.csv`;
const commandPackPath = `${runDir}/43_operator_secret_command_pack.md`;
const strictWorkflow = 'GateForge Hosted Staging Strict';
const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();
const requiredSecrets = [...attestationSecrets, ...runtimeSecrets];

const secretPlans: Record<string, SecretPlan> = {
  GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON: {
    owner: 'Operator + founder/legal',
    valueSource: 'Sanitized hosted staging attestation JSON packet.',
    purpose: 'Provides the seven external evidence decisions to the hosted gate.',
    validation: 'npm run gateforge:external-check',
    blockerIfMissing: 'External evidence packet cannot be evaluated.',
  },
  GATEFORGE_HOSTED_STAGING_ATTESTATION_B64: {
    owner: 'Operator + founder/legal',
    valueSource: 'Base64 encoded hosted staging attestation JSON packet.',
    purpose: 'Safer GitHub Actions transport for the same external packet.',
    validation: 'npm run gateforge:prepare-hosted-attestation',
    blockerIfMissing: 'Workflow needs JSON fallback or cannot load attestation.',
  },
  CONTROL_PLANE_DATABASE_URL: {
    owner: 'Engineering/operator',
    valueSource: 'Hosted staging control-plane Postgres connection string.',
    purpose: 'Runs control-plane migrations, auth, tenant routing, and live CI proof.',
    validation: 'npm run ci:live',
    blockerIfMissing: 'Hosted live CI and tenant-control proof cannot run.',
  },
  TENANT_DB_ADMIN_URL: {
    owner: 'Engineering/operator',
    valueSource: 'Hosted staging admin connection string that can create/drop tenant DBs.',
    purpose: 'Runs provisioning, restore, and DB-per-tenant isolation checks.',
    validation: 'npm run test:pg',
    blockerIfMissing: 'Tenant isolation and restore drill remain unproven.',
  },
  TENANT_DB_HOST: {
    owner: 'Engineering/operator',
    valueSource: 'Hosted staging tenant database host.',
    purpose: 'Allows tenant provisioning commands to target the staging database host.',
    validation: 'npm run test:pg',
    blockerIfMissing: 'Tenant provisioning cannot be proven in hosted staging.',
  },
  TENANT_CREDENTIAL_ENCRYPTION_KEY: {
    owner: 'Engineering/operator',
    valueSource: 'Strong staging encryption key from the secret manager.',
    purpose: 'Encrypts tenant database credentials before storage.',
    validation: 'npm run verify:production-safety',
    blockerIfMissing: 'Credential-at-rest evidence is missing.',
  },
  INTEGRATION_ENCRYPTION_KEY: {
    owner: 'Engineering/operator',
    valueSource: 'Strong staging encryption key from the secret manager.',
    purpose: 'Encrypts integration tokens and webhook connection secrets.',
    validation: 'npm run verify:production-safety',
    blockerIfMissing: 'Integration secret handling remains unproven.',
  },
  FNNLR_CRON_SECRET: {
    owner: 'Engineering/operator',
    valueSource: 'Random staging cron authorization secret.',
    purpose: 'Protects internal scheduled job routes.',
    validation: 'npm run deploy:health-gate',
    blockerIfMissing: 'Cron route authorization and alert proof remain incomplete.',
  },
  AUTH_MFA_ENCRYPTION_KEY: {
    owner: 'Engineering/operator',
    valueSource: 'Strong staging MFA encryption key from the secret manager.',
    purpose: 'Encrypts admin/workspace-owner MFA material.',
    validation: 'npm run verify:production-safety',
    blockerIfMissing: 'Admin MFA runtime proof remains incomplete.',
  },
  FNNLR_AI_TENANT_DAILY_USD_CAP: {
    owner: 'Product/operator',
    valueSource: 'Numeric staging tenant daily AI spend cap.',
    purpose: 'Proves tenant-level AI spend control before provider calls.',
    validation: 'npm run verify:production-safety',
    blockerIfMissing: 'Tenant AI budget proof remains incomplete.',
  },
  FNNLR_AI_GLOBAL_DAILY_USD_CAP: {
    owner: 'Product/operator',
    valueSource: 'Numeric staging global daily AI spend cap.',
    purpose: 'Proves platform-wide AI spend control before provider calls.',
    validation: 'npm run verify:production-safety',
    blockerIfMissing: 'Global AI budget proof remains incomplete.',
  },
  SENTRY_DSN: {
    owner: 'Engineering/operator',
    valueSource: 'Hosted staging Sentry or equivalent DSN.',
    purpose: 'Proves production-grade error reporting path.',
    validation: 'npm run deploy:health-gate',
    blockerIfMissing: 'Monitoring and alerting evidence remains incomplete.',
  },
  UPTIME_HEALTHCHECK_URL: {
    owner: 'Engineering/operator',
    valueSource: 'External uptime monitor endpoint for hosted staging /health.',
    purpose: 'Proves external health monitoring exists.',
    validation: 'npm run deploy:health-gate',
    blockerIfMissing: 'Uptime evidence remains incomplete.',
  },
  ALERT_EMAIL_TO: {
    owner: 'Engineering/operator',
    valueSource: 'Staging alert destination email.',
    purpose: 'Receives cron, webhook, restore, and health-gate alerts.',
    validation: 'npm run deploy:health-gate',
    blockerIfMissing: 'Alert routing proof remains incomplete.',
  },
  ALERT_WEBHOOK_URL: {
    owner: 'Engineering/operator',
    valueSource: 'Staging alert webhook destination.',
    purpose: 'Provides machine-readable alert delivery evidence.',
    validation: 'npm run deploy:health-gate',
    blockerIfMissing: 'Webhook alert proof remains incomplete.',
  },
  RESEND_API_KEY: {
    owner: 'Engineering/operator',
    valueSource: 'Resend staging API key or equivalent transactional provider key.',
    purpose: 'Proves transactional email can send account/admin messages.',
    validation: 'npm run deploy:smoke',
    blockerIfMissing: 'Email provider readiness remains incomplete.',
  },
  EMAIL_FROM: {
    owner: 'Founder/operator',
    valueSource: 'Verified staging sender address on the email provider.',
    purpose: 'Provides a deliverable sender for transactional messages.',
    validation: 'npm run deploy:smoke',
    blockerIfMissing: 'Email deliverability evidence remains incomplete.',
  },
  EMAIL_REPLY_TO: {
    owner: 'Founder/operator',
    valueSource: 'Support or founder reply-to address.',
    purpose: 'Ensures customer replies reach a monitored inbox.',
    validation: 'npm run deploy:smoke',
    blockerIfMissing: 'Support email loop evidence remains incomplete.',
  },
  ANTHROPIC_API_KEY: {
    owner: 'Engineering/operator',
    valueSource: 'Staging AI provider key with spend limits.',
    purpose: 'Proves AI gateway behavior for allowed, capped, and kill-switch cases.',
    validation: 'npm run verify:production-safety',
    blockerIfMissing: 'AI runtime proof remains incomplete.',
  },
};

const missingMetadata = requiredSecrets.filter((name) => !secretPlans[name]);
if (missingMetadata.length) {
  throw new Error(`missing life-or-death metadata for required secrets: ${missingMetadata.join(', ')}`);
}

const unexpectedMetadata = Object.keys(secretPlans).filter((name) => !requiredSecrets.includes(name));
if (unexpectedMetadata.length) {
  throw new Error(`life-or-death metadata references non-manifest secrets: ${unexpectedMetadata.join(', ')}`);
}

const csvRows = [
  'secret,kind,owner,value_source,purpose,validation,blocker_if_missing',
  ...requiredSecrets.map((name) => {
    const plan = secretPlans[name];
    const kind = attestationSecrets.includes(name) ? 'attestation' : 'runtime';
    return [
      name,
      kind,
      plan.owner,
      plan.valueSource,
      plan.purpose,
      plan.validation,
      plan.blockerIfMissing,
    ]
      .map(csv)
      .join(',');
  }),
];

const md = `# Life Or Death GA Execution Plan

Generated: \`${new Date().toISOString()}\`

This is the no-drama path from the current GateForge block to a defensible \`CONDITIONAL_GO\`. It contains secret names, owners, sources, and validation commands only. It must never contain secret values.

## Current Truth

- Latest pushed code: \`main\` contains the GateForge local rescue controls.
- Current external blocker: GitHub Actions has not been given the required hosted staging secrets/evidence.
- Known GitHub secret names: \`${requiredSecrets.length}\`
- Minimum secrets required to trigger: \`${runtimeSecrets.length + 1}\` (\`${runtimeSecrets.length}\` runtime + \`1\` attestation)
- Attestation alternatives: \`${attestationSecrets.join('` or `')}\`
- Runtime secrets: \`${runtimeSecrets.length}\`
- Target gate after evidence closes: \`CONDITIONAL_GO\`

## Command Order

\`\`\`bash
npm run gateforge:github-secrets-audit
npm run gateforge:hosted-setup-guide
npm run gateforge:trigger-hosted-strict
gh run list --workflow "${strictWorkflow}" --limit 1
\`\`\`

If the trigger refuses to run, the refusal is the plan: set every missing secret in \`40_missing_github_secrets_remediation.md\`, then rerun the trigger.

## One-Day War Board

| Order | Workstream | Owner | Exit evidence |
| --- | --- | --- | --- |
| 1 | Add one attestation secret, preferably \`GATEFORGE_HOSTED_STAGING_ATTESTATION_B64\` | Operator + founder/legal | \`npm run gateforge:prepare-hosted-attestation\` passes in GitHub Actions |
| 2 | Add hosted Postgres/control-plane secrets | Engineering/operator | \`npm run ci:live\` and \`npm run test:pg\` pass in hosted workflow |
| 3 | Add encryption/auth/cron secrets | Engineering/operator | admin MFA, route authz, cron route, and secret handling checks pass |
| 4 | Add AI budget/provider secrets | Product + engineering/operator | allowed, capped, and kill-switch AI scenarios are audited |
| 5 | Add observability/email secrets | Engineering/operator | health, alert, webhook alert, and email smoke evidence exists |
| 6 | Run strict hosted workflow | Operator | \`${strictWorkflow}\` completes successfully |
| 7 | Rerun final gate/report | Operator | final GateForge report requests \`CONDITIONAL_GO\` without open P0 evidence gaps |

## Secret Collection Matrix

| Secret | Kind | Owner | Source | Validated By | Blocker If Missing |
| --- | --- | --- | --- | --- | --- |
${requiredSecrets
  .map((name) => {
    const plan = secretPlans[name];
    const kind = attestationSecrets.includes(name) ? 'attestation' : 'runtime';
    return `| \`${name}\` | ${kind} | ${plan.owner} | ${plan.valueSource} | \`${plan.validation}\` | ${plan.blockerIfMissing} |`;
  })
  .join('\n')}

## Decision Rules

- \`GO\` is not allowed from this run; the correct target is \`CONDITIONAL_GO\`.
- Any missing required secret keeps the strict workflow blocked before runtime checks.
- Any hosted workflow failure stays a P0 blocker until it has a sanitized artifact or command output.
- Legal/commercial approval can be \`HUMAN_ATTESTATION_REQUIRED\`; it cannot be silently converted to \`PASS\`.
- SEO, GEO, and UI polish do not matter until P0 hosted evidence is closed.

## After Secrets Are Set

\`\`\`bash
npm run gateforge:github-secrets-audit
npm run gateforge:trigger-hosted-strict
gh run watch "$(gh run list --workflow "${strictWorkflow}" --limit 1 --json databaseId --jq '.[0].databaseId')"
\`\`\`

When the workflow is green, collect artifact links and rerun:

\`\`\`bash
npm run gateforge:final-gate
npm run gateforge:final-report
\`\`\`
`;

const operatorCommandPack = `# Operator Secret Command Pack

Generated: \`${new Date().toISOString()}\`

This file is an execution helper for closing the current GateForge blocker. It contains commands and secret names only. Do not paste real secret values into this file or commit generated secret files.

## Safety Rules

- Put temporary secret value files under \`/tmp/fnnlr-gateforge-secrets\` only.
- Upload with \`gh secret set NAME --body-file FILE\`; do not echo values into the terminal.
- Delete the temporary folder after GitHub confirms the secret names exist.
- Use one attestation secret: prefer \`GATEFORGE_HOSTED_STAGING_ATTESTATION_B64\`; keep \`GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON\` empty unless needed as fallback.

## Prepare Temporary Folder

\`\`\`bash
mkdir -p /tmp/fnnlr-gateforge-secrets
chmod 700 /tmp/fnnlr-gateforge-secrets
\`\`\`

## Generate Random Local Values

These commands generate values for secrets that can be random staging-only credentials. They do not cover database URLs, provider keys, email addresses, or external monitor URLs.

\`\`\`bash
openssl rand -base64 32 > /tmp/fnnlr-gateforge-secrets/TENANT_CREDENTIAL_ENCRYPTION_KEY
openssl rand -base64 32 > /tmp/fnnlr-gateforge-secrets/INTEGRATION_ENCRYPTION_KEY
openssl rand -base64 32 > /tmp/fnnlr-gateforge-secrets/FNNLR_CRON_SECRET
openssl rand -base64 32 > /tmp/fnnlr-gateforge-secrets/AUTH_MFA_ENCRYPTION_KEY
printf '5\\n' > /tmp/fnnlr-gateforge-secrets/FNNLR_AI_TENANT_DAILY_USD_CAP
printf '25\\n' > /tmp/fnnlr-gateforge-secrets/FNNLR_AI_GLOBAL_DAILY_USD_CAP
\`\`\`

## Create Manual Value Files

Fill these files locally with real staging values. The placeholders below are intentionally not valid.

\`\`\`bash
printf 'postgres://USER:PASSWORD@HOST:5432/CONTROL_DB?sslmode=require\\n' > /tmp/fnnlr-gateforge-secrets/CONTROL_PLANE_DATABASE_URL
printf 'postgres://ADMIN:PASSWORD@HOST:5432/postgres?sslmode=require\\n' > /tmp/fnnlr-gateforge-secrets/TENANT_DB_ADMIN_URL
printf 'HOST\\n' > /tmp/fnnlr-gateforge-secrets/TENANT_DB_HOST
printf 'REPLACE_WITH_STAGING_SENTRY_DSN\\n' > /tmp/fnnlr-gateforge-secrets/SENTRY_DSN
printf 'REPLACE_WITH_STAGING_HEALTHCHECK_URL\\n' > /tmp/fnnlr-gateforge-secrets/UPTIME_HEALTHCHECK_URL
printf 'REPLACE_WITH_STAGING_ALERT_EMAIL\\n' > /tmp/fnnlr-gateforge-secrets/ALERT_EMAIL_TO
printf 'REPLACE_WITH_STAGING_ALERT_WEBHOOK_URL\\n' > /tmp/fnnlr-gateforge-secrets/ALERT_WEBHOOK_URL
printf 'REPLACE_WITH_RESEND_STAGING_KEY\\n' > /tmp/fnnlr-gateforge-secrets/RESEND_API_KEY
printf 'REPLACE_WITH_VERIFIED_EMAIL_FROM\\n' > /tmp/fnnlr-gateforge-secrets/EMAIL_FROM
printf 'REPLACE_WITH_SUPPORT_REPLY_TO\\n' > /tmp/fnnlr-gateforge-secrets/EMAIL_REPLY_TO
printf 'REPLACE_WITH_ANTHROPIC_STAGING_KEY\\n' > /tmp/fnnlr-gateforge-secrets/ANTHROPIC_API_KEY
\`\`\`

Now edit each file and replace the placeholder with the real staging value before upload.

## Prepare Attestation Secret

\`\`\`bash
cp gateforge-audit/external-attestations/hosted-staging-attestation.template.json gateforge-audit/external-attestations/hosted-staging-attestation.json
npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json
base64 -i gateforge-audit/external-attestations/hosted-staging-attestation.json > /tmp/fnnlr-gateforge-secrets/GATEFORGE_HOSTED_STAGING_ATTESTATION_B64
\`\`\`

Only change attestation item statuses to \`PASS\` when the evidence references exist.

## Validate Local Secret Files

Run this before any upload. It checks file presence and placeholder replacement by secret name only; it never prints secret values.

\`\`\`bash
npm run gateforge:local-secret-files-check
\`\`\`

## Upload Secrets

\`\`\`bash
npm run gateforge:upload-local-secrets -- --dry-run
npm run gateforge:upload-local-secrets -- --apply
\`\`\`

## Verify And Trigger

\`\`\`bash
npm run gateforge:hosted-unblock -- --dry-run
npm run gateforge:hosted-unblock -- --apply
\`\`\`

Manual fallback:

\`\`\`bash
npm run gateforge:github-secrets-audit
npm run gateforge:trigger-hosted-strict
gh run list --workflow "${strictWorkflow}" --limit 1
\`\`\`

## Cleanup

\`\`\`bash
rm -rf /tmp/fnnlr-gateforge-secrets
\`\`\`

If the trigger still says \`BLOCKED_BY_SECRET_AUDIT\`, rerun \`npm run gateforge:github-secrets-audit\` and set exactly the missing names. If the hosted workflow runs and fails, use the failed step name as the next P0, not the score.
`;

fs.mkdirSync(runDir, { recursive: true });
fs.writeFileSync(mdPath, md);
fs.writeFileSync(csvPath, `${csvRows.join('\n')}\n`);
fs.writeFileSync(commandPackPath, operatorCommandPack);

console.log(`GateForge life-or-death plan: wrote ${mdPath}`);
console.log(`GateForge life-or-death secrets CSV: wrote ${csvPath}`);
console.log(`GateForge operator command pack: wrote ${commandPackPath}`);
console.log(`required secrets mapped: ${requiredSecrets.length}/${requiredSecrets.length}`);

function csv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
