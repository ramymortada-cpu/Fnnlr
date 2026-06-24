# Hosted Readiness Doctor

Generated: `2026-06-24T11:27:55.895Z`

This doctor checks readiness without printing secret values.

## Decision

- Status: `REPLACE_LOCAL_SECRET_PLACEHOLDERS`
- Next command: `npm run gateforge:secret-replacement-packet, then replace the listed local secret values and rerun npm run gateforge:hosted-readiness-doctor.`

## Probes

| Probe | Status | Detail |
| --- | --- | --- |
| Local secret files | `FAIL` | local secret files exist but placeholders remain |
| GitHub secret names | `FAIL` | GitHub secret names are missing |
| Hosted strict workflow | `UNKNOWN` | no hosted strict workflow run found |

## Notes

- Local secret directory: `/tmp/fnnlr-gateforge-secrets`
- GitHub secrets source: `gh secret list --json name`
- Workflow: `GateForge Hosted Staging Strict`
- Secret replacement packet: `gateforge-audit/run-2026-06-23-1035/45_secret_replacement_packet.md`

## Sanitized Probe Output

### Local Secret Files

```text
{
  "ok": false,
  "directory": "/tmp/fnnlr-gateforge-secrets",
  "attestationReady": 0,
  "attestationRequired": 1,
  "attestationOptions": [
    {
      "name": "GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON",
      "kind": "attestation",
      "status": "MISSING"
    },
    {
      "name": "GATEFORGE_HOSTED_STAGING_ATTESTATION_B64",
      "kind": "attestation",
      "status": "PLACEHOLDER"
    }
  ],
  "runtimeReady": 6,
  "runtimeRequired": 17,
  "runtime": [
    {
      "name": "CONTROL_PLANE_DATABASE_URL",
      "kind": "runtime",
      "status": "PLACEHOLDER"
    },
    {
      "name": "TENANT_DB_ADMIN_URL",
      "kind": "runtime",
      "status": "PLACEHOLDER"
    },
    {
      "name": "TENANT_DB_HOST",
      "kind": "runtime",
      "status": "PLACEHOLDER"
    },
    {
      "name": "TENANT_CREDENTIAL_ENCRYPTION_KEY",
      "kind": "runtime",
      "status": "READY"
    },
    {
      "name": "INTEGRATION_ENCRYPTION_KEY",
      "kind": "runtime",
      "status": "READY"
    },
    {
      "name": "FNNLR_CRON_SECRET",
      "kind": "runtime",
      "status": "READY"
    },
    {
      "name": "AUTH_MFA_ENCRYPTION_KEY",
      "kind": "runtime",
      "status": "READY"
    },
    {
      "name": "FNNLR_AI_TENANT_DAILY_USD_CAP",
      "kind": "runtime",
      "status": "READY"
    },
    {
      "name": "FNNLR_AI_GLOBAL_DAILY_USD_CAP",
      "kind": "runtime",
      "status": "READY"
    },
    {
      "name": "SENTRY_DSN",
      "kind": "runtime",
      "status": "PLACEHOLDER"
    },
    {
      "name": "UPTIME_HEALTHCHECK_URL",
      "kind": "runtime",
      "status": "PLACEHOLDER"
    },
    {
      "name": "ALERT_EMAIL_TO",
      "kind": "runtime",
      "status": "PLACEHOLDER"
    },
    {
      "name": "ALERT_WEBHOOK_URL",
      "kind": "runtime",
      "status": "PLACEHOLDER"
    },
    {
      "name": "RESEND_API_KEY",
      "kind": "runtime",
      "status": "PLACEHOLDER"
    },
    {
      "name": "EMAIL_FROM",
      "kind": "runtime",
      "status": "PLACEHOLDER"
    },
    {
      "name": "EMAIL_REPLY_TO",
      "kind": "runtime",
      "status": "PLACEHOLDER"
    },
    {
      "name": "ANTHROPIC_API_KEY",
      "kind": "runtime",
      "status": "PLACEHOLDER"
    }
  ]
}
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
