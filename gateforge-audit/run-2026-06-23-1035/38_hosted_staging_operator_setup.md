# Hosted Staging Operator Setup

Generated: `2026-06-24T13:06:47.205Z`

This is the operator checklist for converting GateForge from `CANNOT_APPROVE` to a defensible `CONDITIONAL_GO`. It does not contain secret values.

## Workflow To Run

```bash
gh workflow run "GateForge Hosted Staging Strict"
```

Preferred trigger command:

```bash
npm run gateforge:trigger-hosted-strict
```

The trigger runs the secret-name audit first and refuses to start the workflow if any required secret name is missing.

Then monitor:

```bash
gh run list --workflow "GateForge Hosted Staging Strict" --limit 1
```

To audit repository secret names without triggering:

```bash
npm run gateforge:github-secrets-audit
```

If secrets are missing, follow `gateforge-audit/run-2026-06-23-1035/40_missing_github_secrets_remediation.md`.

## Attestation Packet

Preferred secret:

```bash
npm run gateforge:attestation-secret-pack -- --write-b64
npm run gateforge:hosted-unblock -- --dry-run --prepare-attestation
npm run gateforge:hosted-unblock -- --apply --prepare-attestation
```

Alternative secret:

```bash
gh secret set GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON --body-file gateforge-audit/external-attestations/hosted-staging-attestation.json
```

The packet must pass locally before upload:

```bash
npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json
npm run gateforge:attestation-secret-pack
```

## Runtime Secrets

Set these repository secrets with safe staging values:

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

## Required Secret Names

### Attestation

- `GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON`
- `GATEFORGE_HOSTED_STAGING_ATTESTATION_B64`

### Runtime

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

## Pass Criteria

The strict workflow must complete these steps:

1. Hosted secrets preflight.
2. Prepare hosted attestation packet.
3. Validate external evidence packet.
4. Typecheck.
5. Hosted live CI.
6. Hosted Postgres tests.
7. Hosted health gate.
8. Hosted deploy smoke.
9. GateForge GA unblock hosted evidence.
10. GateForge final report.
11. GateForge final gate.

## Failure Interpretation

- Missing attestation secret: upload the sanitized packet using one of the attestation commands above.
- GitHub secrets audit failure: set every missing repository secret name, then rerun `npm run gateforge:github-secrets-audit`.
- Hosted secrets preflight failure: set every listed GitHub Actions secret; the preflight prints names only, never values.
- External evidence failure: a required packet item is not `PASS`, has no owner, has no evidence refs, or contains an unsafe ref.
- Hosted live CI or Postgres failure: staging database/runtime evidence is still not accepted.
- Final gate failure: at least one applicable P0 is still missing runtime or external evidence.

Do not mark items `PASS` unless the evidence exists and is safe to reference.
