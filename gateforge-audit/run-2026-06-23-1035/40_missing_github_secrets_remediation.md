# Missing GitHub Secrets Remediation

Generated: `2026-07-02T12:25:53.416Z`

Status: `ACTION_REQUIRED`

This file contains secret names and setup commands only. It must not contain secret values.

## Summary

- Known secret names: `19`
- Required runtime secrets: `17`
- Required attestation secrets: `1 of 2`
- Missing runtime secrets: `17`
- Missing attestation requirement: `yes`

## Commands

Set exactly one attestation secret. Prefer the base64 packet:

```bash
gh secret set GATEFORGE_HOSTED_STAGING_ATTESTATION_B64
gh secret set GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON
```

Run these commands locally and paste each staging value when prompted:

```bash
gh secret set CONTROL_PLANE_DATABASE_URL
gh secret set TENANT_DB_ADMIN_URL
gh secret set TENANT_DB_HOST
gh secret set TENANT_CREDENTIAL_ENCRYPTION_KEY
gh secret set INTEGRATION_ENCRYPTION_KEY
gh secret set FNNLR_CRON_SECRET
gh secret set AUTH_MFA_ENCRYPTION_KEY
gh secret set FNNLR_AI_TENANT_DAILY_USD_CAP
gh secret set FNNLR_AI_GLOBAL_DAILY_USD_CAP
gh secret set SENTRY_DSN
gh secret set UPTIME_HEALTHCHECK_URL
gh secret set ALERT_EMAIL_TO
gh secret set ALERT_WEBHOOK_URL
gh secret set RESEND_API_KEY
gh secret set EMAIL_FROM
gh secret set EMAIL_REPLY_TO
gh secret set ANTHROPIC_API_KEY
```

## Verification

```bash
npm run gateforge:github-secrets-audit
npm run gateforge:trigger-hosted-strict
```
