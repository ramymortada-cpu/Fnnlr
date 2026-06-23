# GitHub Secrets Presence Audit

Generated: `2026-06-23T20:53:49.581Z`

Status: `MISSING_SECRETS`

Source: `gh secret list --json name`

This audit checks secret names only. It does not read, print, or validate secret values.

## Summary

- Required secrets: `19`
- Present secrets: `0`
- Missing secrets: `19`

## Required Secret Presence

| Secret | Kind | Status |
| --- | --- | --- |
| `GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON` | attestation | MISSING |
| `GATEFORGE_HOSTED_STAGING_ATTESTATION_B64` | attestation | MISSING |
| `CONTROL_PLANE_DATABASE_URL` | runtime | MISSING |
| `TENANT_DB_ADMIN_URL` | runtime | MISSING |
| `TENANT_DB_HOST` | runtime | MISSING |
| `TENANT_CREDENTIAL_ENCRYPTION_KEY` | runtime | MISSING |
| `INTEGRATION_ENCRYPTION_KEY` | runtime | MISSING |
| `FNNLR_CRON_SECRET` | runtime | MISSING |
| `AUTH_MFA_ENCRYPTION_KEY` | runtime | MISSING |
| `FNNLR_AI_TENANT_DAILY_USD_CAP` | runtime | MISSING |
| `FNNLR_AI_GLOBAL_DAILY_USD_CAP` | runtime | MISSING |
| `SENTRY_DSN` | runtime | MISSING |
| `UPTIME_HEALTHCHECK_URL` | runtime | MISSING |
| `ALERT_EMAIL_TO` | runtime | MISSING |
| `ALERT_WEBHOOK_URL` | runtime | MISSING |
| `RESEND_API_KEY` | runtime | MISSING |
| `EMAIL_FROM` | runtime | MISSING |
| `EMAIL_REPLY_TO` | runtime | MISSING |
| `ANTHROPIC_API_KEY` | runtime | MISSING |

## Next Step

Set the missing GitHub Actions secrets, then rerun this audit before triggering `GateForge Hosted Staging Strict`.
