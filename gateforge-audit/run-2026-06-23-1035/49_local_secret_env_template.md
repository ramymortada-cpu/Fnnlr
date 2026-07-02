# GateForge Local Secret Env Template

Generated: `2026-07-02T12:01:13.044Z`

This is a sanitized operator template. It contains placeholders only and is safe to commit as evidence of the required staging inputs.

## Use

```bash
cp gateforge-audit/run-2026-06-23-1035/49_local_secret_env_template.env /secure/path/fnnlr-staging.env
npm run gateforge:import-local-secrets -- --env-file /secure/path/fnnlr-staging.env --require-all
npm run gateforge:hosted-readiness-doctor
```

## Required Inputs

| Secret | Requirement | Purpose | Validation |
| --- | --- | --- | --- |
| `GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON` | One attestation option required | Optional raw hosted staging evidence packet JSON. Use B64 instead when uploading to GitHub. | JSON object with HOSTED_STAGING or PRODUCTION_READ_ONLY evidence and PASS items. |
| `GATEFORGE_HOSTED_STAGING_ATTESTATION_B64` | One attestation option required | Preferred base64 encoded hosted staging evidence packet. | Base64 text that decodes to a valid hosted staging attestation packet. |
| `CONTROL_PLANE_DATABASE_URL` | Required runtime secret | Staging control-plane Postgres URL. | postgres/postgresql URL with username, password, and host. |
| `TENANT_DB_ADMIN_URL` | Required runtime secret | Staging tenant database admin URL with create/drop permissions. | postgres/postgresql URL with username, password, and host. |
| `TENANT_DB_HOST` | Required runtime secret | Staging tenant database host only. | Host only; no protocol, credentials, or path. |
| `TENANT_CREDENTIAL_ENCRYPTION_KEY` | Required runtime secret | Staging-only tenant credential encryption key. | At least 24 characters. |
| `INTEGRATION_ENCRYPTION_KEY` | Required runtime secret | Staging-only integration secret encryption key. | At least 24 characters. |
| `FNNLR_CRON_SECRET` | Required runtime secret | Staging cron authentication secret. | At least 24 characters. |
| `AUTH_MFA_ENCRYPTION_KEY` | Required runtime secret | Staging admin MFA encryption key. | At least 24 characters. |
| `FNNLR_AI_TENANT_DAILY_USD_CAP` | Required runtime secret | Approved staging per-tenant AI daily spend cap. | Positive number. |
| `FNNLR_AI_GLOBAL_DAILY_USD_CAP` | Required runtime secret | Approved staging global AI daily spend cap. | Positive number. |
| `SENTRY_DSN` | Required runtime secret | Staging Sentry or equivalent error monitoring DSN. | HTTPS DSN. |
| `UPTIME_HEALTHCHECK_URL` | Required runtime secret | Public staging /health uptime monitor URL. | HTTPS URL. |
| `ALERT_EMAIL_TO` | Required runtime secret | Operations email address for staging alerts. | Valid email address. |
| `ALERT_WEBHOOK_URL` | Required runtime secret | Staging alert webhook URL for runtime failure alerts. | HTTPS URL. |
| `RESEND_API_KEY` | Required runtime secret | Staging transactional email provider key. | Non-trivial provider API key. |
| `EMAIL_FROM` | Required runtime secret | Verified staging transactional sender address. | Valid email address. |
| `EMAIL_REPLY_TO` | Required runtime secret | Support reply-to mailbox for staging emails. | Valid email address. |
| `ANTHROPIC_API_KEY` | Required runtime secret | Capped staging Anthropic API key. | Non-trivial provider API key. |

## Safety Rules

- Keep filled env files outside git.
- Never paste secret values into reports, issues, or chat.
- Use `gateforge:import-local-secrets` so all rows validate before any local secret file is written.
- Use `gateforge:hosted-unblock -- --apply` only after the readiness doctor says `UPLOAD_GITHUB_SECRETS`.
