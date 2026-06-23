# Operator Secret Command Pack

Generated: `2026-06-23T21:40:06.007Z`

This file is an execution helper for closing the current GateForge blocker. It contains commands and secret names only. Do not paste real secret values into this file or commit generated secret files.

## Safety Rules

- Put temporary secret value files under `/tmp/fnnlr-gateforge-secrets` only.
- Upload with `gh secret set NAME --body-file FILE`; do not echo values into the terminal.
- Delete the temporary folder after GitHub confirms the secret names exist.
- Use one attestation secret: prefer `GATEFORGE_HOSTED_STAGING_ATTESTATION_B64`; keep `GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON` empty unless needed as fallback.

## Prepare Temporary Folder

```bash
mkdir -p /tmp/fnnlr-gateforge-secrets
chmod 700 /tmp/fnnlr-gateforge-secrets
```

## Generate Random Local Values

These commands generate values for secrets that can be random staging-only credentials. They do not cover database URLs, provider keys, email addresses, or external monitor URLs.

```bash
openssl rand -base64 32 > /tmp/fnnlr-gateforge-secrets/TENANT_CREDENTIAL_ENCRYPTION_KEY
openssl rand -base64 32 > /tmp/fnnlr-gateforge-secrets/INTEGRATION_ENCRYPTION_KEY
openssl rand -base64 32 > /tmp/fnnlr-gateforge-secrets/FNNLR_CRON_SECRET
openssl rand -base64 32 > /tmp/fnnlr-gateforge-secrets/AUTH_MFA_ENCRYPTION_KEY
printf '5\n' > /tmp/fnnlr-gateforge-secrets/FNNLR_AI_TENANT_DAILY_USD_CAP
printf '25\n' > /tmp/fnnlr-gateforge-secrets/FNNLR_AI_GLOBAL_DAILY_USD_CAP
```

## Create Manual Value Files

Fill these files locally with real staging values. The placeholders below are intentionally not valid.

```bash
printf 'postgres://USER:PASSWORD@HOST:5432/CONTROL_DB?sslmode=require\n' > /tmp/fnnlr-gateforge-secrets/CONTROL_PLANE_DATABASE_URL
printf 'postgres://ADMIN:PASSWORD@HOST:5432/postgres?sslmode=require\n' > /tmp/fnnlr-gateforge-secrets/TENANT_DB_ADMIN_URL
printf 'HOST\n' > /tmp/fnnlr-gateforge-secrets/TENANT_DB_HOST
printf 'REPLACE_WITH_STAGING_SENTRY_DSN\n' > /tmp/fnnlr-gateforge-secrets/SENTRY_DSN
printf 'REPLACE_WITH_STAGING_HEALTHCHECK_URL\n' > /tmp/fnnlr-gateforge-secrets/UPTIME_HEALTHCHECK_URL
printf 'REPLACE_WITH_STAGING_ALERT_EMAIL\n' > /tmp/fnnlr-gateforge-secrets/ALERT_EMAIL_TO
printf 'REPLACE_WITH_STAGING_ALERT_WEBHOOK_URL\n' > /tmp/fnnlr-gateforge-secrets/ALERT_WEBHOOK_URL
printf 'REPLACE_WITH_RESEND_STAGING_KEY\n' > /tmp/fnnlr-gateforge-secrets/RESEND_API_KEY
printf 'REPLACE_WITH_VERIFIED_EMAIL_FROM\n' > /tmp/fnnlr-gateforge-secrets/EMAIL_FROM
printf 'REPLACE_WITH_SUPPORT_REPLY_TO\n' > /tmp/fnnlr-gateforge-secrets/EMAIL_REPLY_TO
printf 'REPLACE_WITH_ANTHROPIC_STAGING_KEY\n' > /tmp/fnnlr-gateforge-secrets/ANTHROPIC_API_KEY
```

Now edit each file and replace the placeholder with the real staging value before upload.

## Prepare Attestation Secret

```bash
cp gateforge-audit/external-attestations/hosted-staging-attestation.template.json gateforge-audit/external-attestations/hosted-staging-attestation.json
npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json
base64 -i gateforge-audit/external-attestations/hosted-staging-attestation.json > /tmp/fnnlr-gateforge-secrets/GATEFORGE_HOSTED_STAGING_ATTESTATION_B64
```

Only change attestation item statuses to `PASS` when the evidence references exist.

## Validate Local Secret Files

Run this before any upload. It checks file presence and placeholder replacement by secret name only; it never prints secret values.

```bash
npm run gateforge:local-secret-files-check
```

## Upload Secrets

```bash
npm run gateforge:upload-local-secrets -- --dry-run
npm run gateforge:upload-local-secrets -- --apply
```

## Verify And Trigger

```bash
npm run gateforge:hosted-readiness-doctor
npm run gateforge:hosted-unblock -- --dry-run
npm run gateforge:hosted-unblock -- --apply
```

Manual fallback:

```bash
npm run gateforge:github-secrets-audit
npm run gateforge:trigger-hosted-strict
gh run list --workflow "GateForge Hosted Staging Strict" --limit 1
```

## Cleanup

```bash
rm -rf /tmp/fnnlr-gateforge-secrets
```

If the trigger still says `BLOCKED_BY_SECRET_AUDIT`, rerun `npm run gateforge:github-secrets-audit` and set exactly the missing names. If the hosted workflow runs and fails, use the failed step name as the next P0, not the score.
