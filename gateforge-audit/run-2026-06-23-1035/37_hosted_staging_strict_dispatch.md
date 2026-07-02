# Hosted Staging Strict Dispatch

Generated: `2026-07-02T12:38:14.102Z`

Status: `BLOCKED`

## Details

- missing hosted attestation secret

## Purpose

This is the strict GitHub Actions path that can move fnnlr from `CANNOT_APPROVE` to `CONDITIONAL_GO` once real hosted staging secrets and sanitized external attestation evidence exist.

## Workflow

Run:

```text
GateForge Hosted Staging Strict
```

from GitHub Actions `workflow_dispatch`.

## Required Secret

Set one of these GitHub Actions secrets:

- `GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON`
- `GATEFORGE_HOSTED_STAGING_ATTESTATION_B64`

The value must be the sanitized JSON packet for `gateforge-audit/external-attestations/hosted-staging-attestation.json`. Do not include raw secrets, tokens, database URLs, private keys, customer PII, or provider payloads.

The packet must validate as:

```bash
npm run gateforge:external-check
```

## Required Runtime Secrets

- `CONTROL_PLANE_DATABASE_URL`
- `TENANT_DB_ADMIN_URL`
- `TENANT_DB_HOST`
- `TENANT_CREDENTIAL_ENCRYPTION_KEY`
- `INTEGRATION_ENCRYPTION_KEY`
- `FNNLR_CRON_SECRET`
- `AUTH_MFA_ENCRYPTION_KEY`
- `FNNLR_AI_TENANT_DAILY_USD_CAP`
- `FNNLR_AI_GLOBAL_DAILY_USD_CAP`
- `SENTRY_DSN`
- `UPTIME_HEALTHCHECK_URL`
- `ALERT_EMAIL_TO`
- `ALERT_WEBHOOK_URL`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`
- `ANTHROPIC_API_KEY`

## Strict Gate

The workflow intentionally fails if any hosted/runtime/external evidence is missing. A successful run is the GitHub-hosted proof needed to request `CONDITIONAL_GO`.
