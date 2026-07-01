# Life Or Death GA Execution Plan

Generated: `2026-07-01T19:31:31.652Z`

This is the no-drama path from the current GateForge block to a defensible `CONDITIONAL_GO`. It contains secret names, owners, sources, and validation commands only. It must never contain secret values.

## Current Truth

- Latest pushed code: `main` contains the GateForge local rescue controls.
- Current external blocker: GitHub Actions has not been given the required hosted staging secrets/evidence.
- Known GitHub secret names: `19`
- Minimum secrets required to trigger: `18` (`17` runtime + `1` attestation)
- Attestation alternatives: `GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON` or `GATEFORGE_HOSTED_STAGING_ATTESTATION_B64`
- Runtime secrets: `17`
- Target gate after evidence closes: `CONDITIONAL_GO`

## Command Order

```bash
npm run gateforge:github-secrets-audit
npm run gateforge:hosted-setup-guide
npm run gateforge:trigger-hosted-strict
gh run list --workflow "GateForge Hosted Staging Strict" --limit 1
```

If the trigger refuses to run, the refusal is the plan: set every missing secret in `40_missing_github_secrets_remediation.md`, then rerun the trigger.

## One-Day War Board

| Order | Workstream | Owner | Exit evidence |
| --- | --- | --- | --- |
| 1 | Add one attestation secret, preferably `GATEFORGE_HOSTED_STAGING_ATTESTATION_B64` | Operator + founder/legal | `npm run gateforge:prepare-hosted-attestation` passes in GitHub Actions |
| 2 | Add hosted Postgres/control-plane secrets | Engineering/operator | `npm run ci:live` and `npm run test:pg` pass in hosted workflow |
| 3 | Add encryption/auth/cron secrets | Engineering/operator | admin MFA, route authz, cron route, and secret handling checks pass |
| 4 | Add AI budget/provider secrets | Product + engineering/operator | allowed, capped, and kill-switch AI scenarios are audited |
| 5 | Add observability/email secrets | Engineering/operator | health, alert, webhook alert, and email smoke evidence exists |
| 6 | Run strict hosted workflow | Operator | `GateForge Hosted Staging Strict` completes successfully |
| 7 | Rerun final gate/report | Operator | final GateForge report requests `CONDITIONAL_GO` without open P0 evidence gaps |

## Secret Collection Matrix

| Secret | Kind | Owner | Source | Validated By | Blocker If Missing |
| --- | --- | --- | --- | --- | --- |
| `GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON` | attestation | Operator + founder/legal | Sanitized hosted staging attestation JSON packet. | `npm run gateforge:external-check` | External evidence packet cannot be evaluated. |
| `GATEFORGE_HOSTED_STAGING_ATTESTATION_B64` | attestation | Operator + founder/legal | Base64 encoded hosted staging attestation JSON packet. | `npm run gateforge:prepare-hosted-attestation` | Workflow needs JSON fallback or cannot load attestation. |
| `CONTROL_PLANE_DATABASE_URL` | runtime | Engineering/operator | Hosted staging control-plane Postgres connection string. | `npm run ci:live` | Hosted live CI and tenant-control proof cannot run. |
| `TENANT_DB_ADMIN_URL` | runtime | Engineering/operator | Hosted staging admin connection string that can create/drop tenant DBs. | `npm run test:pg` | Tenant isolation and restore drill remain unproven. |
| `TENANT_DB_HOST` | runtime | Engineering/operator | Hosted staging tenant database host. | `npm run test:pg` | Tenant provisioning cannot be proven in hosted staging. |
| `TENANT_CREDENTIAL_ENCRYPTION_KEY` | runtime | Engineering/operator | Strong staging encryption key from the secret manager. | `npm run verify:production-safety` | Credential-at-rest evidence is missing. |
| `INTEGRATION_ENCRYPTION_KEY` | runtime | Engineering/operator | Strong staging encryption key from the secret manager. | `npm run verify:production-safety` | Integration secret handling remains unproven. |
| `FNNLR_CRON_SECRET` | runtime | Engineering/operator | Random staging cron authorization secret. | `npm run deploy:health-gate` | Cron route authorization and alert proof remain incomplete. |
| `AUTH_MFA_ENCRYPTION_KEY` | runtime | Engineering/operator | Strong staging MFA encryption key from the secret manager. | `npm run verify:production-safety` | Admin MFA runtime proof remains incomplete. |
| `FNNLR_AI_TENANT_DAILY_USD_CAP` | runtime | Product/operator | Numeric staging tenant daily AI spend cap. | `npm run verify:production-safety` | Tenant AI budget proof remains incomplete. |
| `FNNLR_AI_GLOBAL_DAILY_USD_CAP` | runtime | Product/operator | Numeric staging global daily AI spend cap. | `npm run verify:production-safety` | Global AI budget proof remains incomplete. |
| `SENTRY_DSN` | runtime | Engineering/operator | Hosted staging Sentry or equivalent DSN. | `npm run deploy:health-gate` | Monitoring and alerting evidence remains incomplete. |
| `UPTIME_HEALTHCHECK_URL` | runtime | Engineering/operator | External uptime monitor endpoint for hosted staging /health. | `npm run deploy:health-gate` | Uptime evidence remains incomplete. |
| `ALERT_EMAIL_TO` | runtime | Engineering/operator | Staging alert destination email. | `npm run deploy:health-gate` | Alert routing proof remains incomplete. |
| `ALERT_WEBHOOK_URL` | runtime | Engineering/operator | Staging alert webhook destination. | `npm run deploy:health-gate` | Webhook alert proof remains incomplete. |
| `RESEND_API_KEY` | runtime | Engineering/operator | Resend staging API key or equivalent transactional provider key. | `npm run deploy:smoke` | Email provider readiness remains incomplete. |
| `EMAIL_FROM` | runtime | Founder/operator | Verified staging sender address on the email provider. | `npm run deploy:smoke` | Email deliverability evidence remains incomplete. |
| `EMAIL_REPLY_TO` | runtime | Founder/operator | Support or founder reply-to address. | `npm run deploy:smoke` | Support email loop evidence remains incomplete. |
| `ANTHROPIC_API_KEY` | runtime | Engineering/operator | Staging AI provider key with spend limits. | `npm run verify:production-safety` | AI runtime proof remains incomplete. |

## Decision Rules

- `GO` is not allowed from this run; the correct target is `CONDITIONAL_GO`.
- Any missing required secret keeps the strict workflow blocked before runtime checks.
- Any hosted workflow failure stays a P0 blocker until it has a sanitized artifact or command output.
- Legal/commercial approval can be `HUMAN_ATTESTATION_REQUIRED`; it cannot be silently converted to `PASS`.
- SEO, GEO, and UI polish do not matter until P0 hosted evidence is closed.

## After Secrets Are Set

```bash
npm run gateforge:github-secrets-audit
npm run gateforge:trigger-hosted-strict
gh run watch "$(gh run list --workflow "GateForge Hosted Staging Strict" --limit 1 --json databaseId --jq '.[0].databaseId')"
```

When the workflow is green, collect artifact links and rerun:

```bash
npm run gateforge:final-gate
npm run gateforge:final-report
```
