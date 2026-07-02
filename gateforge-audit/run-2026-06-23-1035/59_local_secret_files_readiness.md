# Local Secret Files Readiness

Generated: `2026-07-02T13:51:17.698Z`

Status: `BLOCKED`

Directory: `/tmp/fnnlr-gateforge-secrets`

This report records secret names and readiness states only. It never contains secret values.

## Summary

- Runtime ready: `6/17`
- Attestation options ready: `0/2`
- Required attestation options: at least `1`
- Open items: `13`

## Runtime Secrets

| Secret | Kind | Status | Reason |
| --- | --- | --- | --- |
| `CONTROL_PLANE_DATABASE_URL` | runtime | `PLACEHOLDER` |  |
| `TENANT_DB_ADMIN_URL` | runtime | `PLACEHOLDER` |  |
| `TENANT_DB_HOST` | runtime | `PLACEHOLDER` |  |
| `TENANT_CREDENTIAL_ENCRYPTION_KEY` | runtime | `READY` |  |
| `INTEGRATION_ENCRYPTION_KEY` | runtime | `READY` |  |
| `FNNLR_CRON_SECRET` | runtime | `READY` |  |
| `AUTH_MFA_ENCRYPTION_KEY` | runtime | `READY` |  |
| `FNNLR_AI_TENANT_DAILY_USD_CAP` | runtime | `READY` |  |
| `FNNLR_AI_GLOBAL_DAILY_USD_CAP` | runtime | `READY` |  |
| `SENTRY_DSN` | runtime | `PLACEHOLDER` |  |
| `UPTIME_HEALTHCHECK_URL` | runtime | `PLACEHOLDER` |  |
| `ALERT_EMAIL_TO` | runtime | `PLACEHOLDER` |  |
| `ALERT_WEBHOOK_URL` | runtime | `PLACEHOLDER` |  |
| `RESEND_API_KEY` | runtime | `PLACEHOLDER` |  |
| `EMAIL_FROM` | runtime | `PLACEHOLDER` |  |
| `EMAIL_REPLY_TO` | runtime | `PLACEHOLDER` |  |
| `ANTHROPIC_API_KEY` | runtime | `PLACEHOLDER` |  |

## Attestation Secret Options

| Secret | Kind | Status | Reason |
| --- | --- | --- | --- |
| `GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON` | attestation | `MISSING` |  |
| `GATEFORGE_HOSTED_STAGING_ATTESTATION_B64` | attestation | `PLACEHOLDER` |  |

## Safety

- Secret values printed: `NO`
- Production mutated: `NO`
- Source dumps included: `NO`
