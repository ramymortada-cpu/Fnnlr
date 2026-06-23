# GitHub Secrets Presence Audit

Generated: `2026-06-23T13:01:43.603Z`

Status: `READY`

Source: `tests/fixtures/gateforge-gh-secrets-pass.json`

This audit checks secret names only. It does not read, print, or validate secret values.

## Summary

- Required secrets: `19`
- Present secrets: `19`
- Missing secrets: `0`

## Required Secret Presence

| Secret | Kind | Status |
| --- | --- | --- |
| `GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON` | attestation | PRESENT |
| `GATEFORGE_HOSTED_STAGING_ATTESTATION_B64` | attestation | PRESENT |
| `CONTROL_PLANE_DATABASE_URL` | runtime | PRESENT |
| `TENANT_DB_ADMIN_URL` | runtime | PRESENT |
| `TENANT_DB_HOST` | runtime | PRESENT |
| `TENANT_CREDENTIAL_ENCRYPTION_KEY` | runtime | PRESENT |
| `INTEGRATION_ENCRYPTION_KEY` | runtime | PRESENT |
| `FNNLR_CRON_SECRET` | runtime | PRESENT |
| `AUTH_MFA_ENCRYPTION_KEY` | runtime | PRESENT |
| `FNNLR_AI_TENANT_DAILY_USD_CAP` | runtime | PRESENT |
| `FNNLR_AI_GLOBAL_DAILY_USD_CAP` | runtime | PRESENT |
| `SENTRY_DSN` | runtime | PRESENT |
| `UPTIME_HEALTHCHECK_URL` | runtime | PRESENT |
| `ALERT_EMAIL_TO` | runtime | PRESENT |
| `ALERT_WEBHOOK_URL` | runtime | PRESENT |
| `RESEND_API_KEY` | runtime | PRESENT |
| `EMAIL_FROM` | runtime | PRESENT |
| `EMAIL_REPLY_TO` | runtime | PRESENT |
| `ANTHROPIC_API_KEY` | runtime | PRESENT |

## Next Step

Trigger `GateForge Hosted Staging Strict`.
