# Hosted Readiness Doctor

Generated: `2026-06-23T21:44:01.176Z`

This doctor checks readiness without printing secret values.

## Decision

- Status: `PREPARE_LOCAL_SECRET_FILES`
- Next command: `Follow gateforge-audit/run-2026-06-23-1035/43_operator_secret_command_pack.md, then run npm run gateforge:hosted-readiness-doctor.`

## Probes

| Probe | Status | Detail |
| --- | --- | --- |
| Local secret files | `FAIL` | local secret files are not ready |
| GitHub secret names | `FAIL` | GitHub secret names are missing |
| Hosted strict workflow | `UNKNOWN` | no hosted strict workflow run found |

## Notes

- Local secret directory: `/tmp/fnnlr-gateforge-secrets`
- GitHub secrets source: `gh secret list --json name`
- Workflow: `GateForge Hosted Staging Strict`

## Sanitized Probe Output

### Local Secret Files

```text
GateForge local secret files check: FAIL
  directory: /tmp/fnnlr-gateforge-secrets
  - missing one ready attestation file: GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON or GATEFORGE_HOSTED_STAGING_ATTESTATION_B64
  - GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON: MISSING
  - GATEFORGE_HOSTED_STAGING_ATTESTATION_B64: MISSING
  - CONTROL_PLANE_DATABASE_URL: MISSING
  - TENANT_DB_ADMIN_URL: MISSING
  - TENANT_DB_HOST: MISSING
  - TENANT_CREDENTIAL_ENCRYPTION_KEY: MISSING
  - INTEGRATION_ENCRYPTION_KEY: MISSING
  - FNNLR_CRON_SECRET: MISSING
  - AUTH_MFA_ENCRYPTION_KEY: MISSING
  - FNNLR_AI_TENANT_DAILY_USD_CAP: MISSING
  - FNNLR_AI_GLOBAL_DAILY_USD_CAP: MISSING
  - SENTRY_DSN: MISSING
  - UPTIME_HEALTHCHECK_URL: MISSING
  - ALERT_EMAIL_TO: MISSING
  - ALERT_WEBHOOK_URL: MISSING
  - RESEND_API_KEY: MISSING
  - EMAIL_FROM: MISSING
  - EMAIL_REPLY_TO: MISSING
  - ANTHROPIC_API_KEY: MISSING
No secret values were printed.
```

### GitHub Secret Names

```text
GateForge GitHub secrets audit: MISSING_SECRETS
  - missing one attestation secret: GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON or GATEFORGE_HOSTED_STAGING_ATTESTATION_B64
  - CONTROL_PLANE_DATABASE_URL
  - TENANT_DB_ADMIN_URL
  - TENANT_DB_HOST
  - TENANT_CREDENTIAL_ENCRYPTION_KEY
  - INTEGRATION_ENCRYPTION_KEY
  - FNNLR_CRON_SECRET
  - AUTH_MFA_ENCRYPTION_KEY
  - FNNLR_AI_TENANT_DAILY_USD_CAP
  - FNNLR_AI_GLOBAL_DAILY_USD_CAP
  - SENTRY_DSN
  - UPTIME_HEALTHCHECK_URL
  - ALERT_EMAIL_TO
  - ALERT_WEBHOOK_URL
  - RESEND_API_KEY
  - EMAIL_FROM
  - EMAIL_REPLY_TO
  - ANTHROPIC_API_KEY
wrote gateforge-audit/run-2026-06-23-1035/39_github_secrets_presence_audit.md
```

### Hosted Strict Workflow

```text
[]
```
