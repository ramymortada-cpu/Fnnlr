# GitHub Secrets Presence Audit

Generated: `2026-06-23T21:44:00.179Z`

Status: `MISSING_SECRETS`

Source: `gh secret list --json name`

This audit checks secret names only. It does not read, print, or validate secret values.

## Summary

- Known secret names: `19`
- Required runtime secrets: `17`
- Required attestation secrets: `1 of 2`
- Present known secret names: `0`
- Missing runtime secrets: `17`
- Attestation present: `no`

## Required Secret Presence

| Secret | Kind | Requirement | Status |
| --- | --- | --- | --- |
| `GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON` | attestation | one_of_attestation | MISSING |
| `GATEFORGE_HOSTED_STAGING_ATTESTATION_B64` | attestation | one_of_attestation | MISSING |
| `CONTROL_PLANE_DATABASE_URL` | runtime | required | MISSING |
| `TENANT_DB_ADMIN_URL` | runtime | required | MISSING |
| `TENANT_DB_HOST` | runtime | required | MISSING |
| `TENANT_CREDENTIAL_ENCRYPTION_KEY` | runtime | required | MISSING |
| `INTEGRATION_ENCRYPTION_KEY` | runtime | required | MISSING |
| `FNNLR_CRON_SECRET` | runtime | required | MISSING |
| `AUTH_MFA_ENCRYPTION_KEY` | runtime | required | MISSING |
| `FNNLR_AI_TENANT_DAILY_USD_CAP` | runtime | required | MISSING |
| `FNNLR_AI_GLOBAL_DAILY_USD_CAP` | runtime | required | MISSING |
| `SENTRY_DSN` | runtime | required | MISSING |
| `UPTIME_HEALTHCHECK_URL` | runtime | required | MISSING |
| `ALERT_EMAIL_TO` | runtime | required | MISSING |
| `ALERT_WEBHOOK_URL` | runtime | required | MISSING |
| `RESEND_API_KEY` | runtime | required | MISSING |
| `EMAIL_FROM` | runtime | required | MISSING |
| `EMAIL_REPLY_TO` | runtime | required | MISSING |
| `ANTHROPIC_API_KEY` | runtime | required | MISSING |

## Next Step

Set every missing runtime secret and at least one attestation secret, then rerun this audit before triggering `GateForge Hosted Staging Strict`.
