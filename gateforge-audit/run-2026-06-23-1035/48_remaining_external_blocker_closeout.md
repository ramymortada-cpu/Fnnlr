# GateForge Remaining External Blocker Closeout

Generated: `2026-07-01T09:32:59.202Z`

This is the execution checklist for the only remaining SaaS moat blockers after the local 165-point board was reduced to externally blocked GA evidence. It contains secret names, provider setup requirements, evidence requirements, and validation commands only. Do not paste secret values into this file.

## Current Truth

- Remaining blockers: `16`
- Scope: `GF-001..GF-016`
- Status: `BLOCKED_EXTERNAL`
- Target after closure: hosted strict evidence, then final GateForge gate review.
- Safety: no production mutation, no secret values, no source dump.

## Fast Matrix

| ID | Owner | Action | Secret names | Validation |
| --- | --- | --- | --- | --- |
| `GF-001` | Operator | Provision hosted staging control-plane Postgres. | `CONTROL_PLANE_DATABASE_URL` | `npm run ci:live`<br>`npm run deploy:health-gate` |
| `GF-002` | Operator | Provision tenant database admin access for staging. | `TENANT_DB_ADMIN_URL` | `npm run test:pg`<br>`npm run deploy:verify-restore` |
| `GF-003` | Operator | Set CONTROL_PLANE_DATABASE_URL in local secret pack and GitHub Actions. | `CONTROL_PLANE_DATABASE_URL` | `npm run gateforge:local-secret-files-check`<br>`npm run gateforge:github-secrets-audit` |
| `GF-004` | Operator | Set TENANT_DB_ADMIN_URL in local secret pack and GitHub Actions. | `TENANT_DB_ADMIN_URL` | `npm run gateforge:local-secret-files-check`<br>`npm run gateforge:github-secrets-audit`<br>`npm run test:pg` |
| `GF-005` | Operator | Set TENANT_DB_HOST in local secret pack and GitHub Actions. | `TENANT_DB_HOST` | `npm run gateforge:local-secret-files-check`<br>`npm run test:pg` |
| `GF-006` | Operator | Create staging Sentry or equivalent error-monitoring project. | `SENTRY_DSN` | `npm run deploy:health-gate` |
| `GF-007` | Operator | Set SENTRY_DSN for staging. | `SENTRY_DSN` | `npm run gateforge:local-secret-files-check`<br>`npm run gateforge:github-secrets-audit`<br>`npm run deploy:health-gate` |
| `GF-008` | Operator | Create uptime monitor for /health. | `UPTIME_HEALTHCHECK_URL` | `npm run deploy:health-gate` |
| `GF-009` | Operator | Set UPTIME_HEALTHCHECK_URL. | `UPTIME_HEALTHCHECK_URL` | `npm run gateforge:local-secret-files-check`<br>`npm run gateforge:github-secrets-audit`<br>`npm run deploy:health-gate` |
| `GF-010` | Operator | Set ALERT_EMAIL_TO for staging operations. | `ALERT_EMAIL_TO` | `npm run deploy:health-gate` |
| `GF-011` | Operator | Set ALERT_WEBHOOK_URL for staging alerts. | `ALERT_WEBHOOK_URL` | `npm run deploy:health-gate` |
| `GF-012` | Operator | Create Resend staging key or approved transactional email provider key. | `RESEND_API_KEY` | `npm run deploy:smoke` |
| `GF-013` | Operator | Set RESEND_API_KEY. | `RESEND_API_KEY` | `npm run gateforge:local-secret-files-check`<br>`npm run gateforge:github-secrets-audit`<br>`npm run deploy:smoke` |
| `GF-014` | Operator | Verify sender domain and set EMAIL_FROM. | `EMAIL_FROM` | `npm run deploy:smoke` |
| `GF-015` | Operator | Set EMAIL_REPLY_TO. | `EMAIL_REPLY_TO` | `npm run deploy:smoke` |
| `GF-016` | Operator | Create capped Anthropic staging key. | `ANTHROPIC_API_KEY` | `npm run verify:production-safety`<br>`npm run ci:live` |

## Closeout Steps

1. Run `npm run gateforge:scaffold-local-secrets`.
2. Replace placeholder local files under `/tmp/fnnlr-gateforge-secrets`.
3. Run `npm run gateforge:local-secret-files-check`.
4. Upload names with `npm run gateforge:upload-local-secrets -- --apply`.
5. Run `npm run gateforge:github-secrets-audit`.
6. Run `npm run gateforge:hosted-unblock -- --apply --prepare-attestation`.
7. Watch `GateForge Hosted Staging Strict` and attach sanitized artifact links.
8. Run `npm run gateforge:final-gate && npm run gateforge:final-report`.

## Blocker Details

### GF-001 - Provision hosted staging control-plane Postgres.

Owner: Operator

Secret names:
- `CONTROL_PLANE_DATABASE_URL`

Provider setup:
- Create a hosted staging Postgres database dedicated to the control plane.

Evidence required:
- Provider database identifier and sanitized successful hosted health gate output.

Validation commands:
- `npm run ci:live`
- `npm run deploy:health-gate`

Exit criteria: Hosted control-plane database is reachable from GitHub Actions without local-only evidence.

### GF-002 - Provision tenant database admin access for staging.

Owner: Operator

Secret names:
- `TENANT_DB_ADMIN_URL`

Provider setup:
- Create a hosted staging admin connection that can create/drop tenant databases.

Evidence required:
- Hosted tenant provision/delete test output and sanitized DB-per-tenant proof.

Validation commands:
- `npm run test:pg`
- `npm run deploy:verify-restore`

Exit criteria: Tenant DB creation, deletion, and isolation pass in hosted staging.

### GF-003 - Set CONTROL_PLANE_DATABASE_URL in local secret pack and GitHub Actions.

Owner: Operator

Secret names:
- `CONTROL_PLANE_DATABASE_URL`

Provider setup:
- Write the staging control-plane URL to the local secret file, then upload by secret name only.

Evidence required:
- Local secret files check PASS and GitHub secret name present.

Validation commands:
- `npm run gateforge:local-secret-files-check`
- `npm run gateforge:github-secrets-audit`

Exit criteria: Secret exists locally and in GitHub without printing the value.

### GF-004 - Set TENANT_DB_ADMIN_URL in local secret pack and GitHub Actions.

Owner: Operator

Secret names:
- `TENANT_DB_ADMIN_URL`

Provider setup:
- Write the staging tenant admin URL to the local secret file, then upload by secret name only.

Evidence required:
- Hosted strict live DB tests PASS.

Validation commands:
- `npm run gateforge:local-secret-files-check`
- `npm run gateforge:github-secrets-audit`
- `npm run test:pg`

Exit criteria: Tenant admin secret is available to hosted strict checks.

### GF-005 - Set TENANT_DB_HOST in local secret pack and GitHub Actions.

Owner: Operator

Secret names:
- `TENANT_DB_HOST`

Provider setup:
- Extract the staging tenant DB host from the provider without credentials.

Evidence required:
- Local secret files check READY and hosted tenant routing proof.

Validation commands:
- `npm run gateforge:local-secret-files-check`
- `npm run test:pg`

Exit criteria: Tenant DB host is present and matches the hosted tenant admin target.

### GF-006 - Create staging Sentry or equivalent error-monitoring project.

Owner: Operator

Secret names:
- `SENTRY_DSN`

Provider setup:
- Create a staging error-monitoring project with alert routing enabled.

Evidence required:
- Sanitized project reference and alert proof attached to hosted attestation.

Validation commands:
- `npm run deploy:health-gate`

Exit criteria: Error monitoring is a real hosted service, not a doc-only claim.

### GF-007 - Set SENTRY_DSN for staging.

Owner: Operator

Secret names:
- `SENTRY_DSN`

Provider setup:
- Write the staging DSN to the local secret file, then upload it to GitHub Actions.

Evidence required:
- Hosted strict monitoring item PASS.

Validation commands:
- `npm run gateforge:local-secret-files-check`
- `npm run gateforge:github-secrets-audit`
- `npm run deploy:health-gate`

Exit criteria: Hosted runtime can initialize observability without exposing the DSN.

### GF-008 - Create uptime monitor for /health.

Owner: Operator

Secret names:
- `UPTIME_HEALTHCHECK_URL`

Provider setup:
- Create an external uptime monitor pointed at the hosted staging /health endpoint.

Evidence required:
- Monitor URL, screenshot/log reference, and successful health gate.

Validation commands:
- `npm run deploy:health-gate`

Exit criteria: External uptime evidence exists outside local tests.

### GF-009 - Set UPTIME_HEALTHCHECK_URL.

Owner: Operator

Secret names:
- `UPTIME_HEALTHCHECK_URL`

Provider setup:
- Write the uptime monitor URL to the local secret file, then upload it to GitHub Actions.

Evidence required:
- GateForge secret check READY and hosted attestation item PASS.

Validation commands:
- `npm run gateforge:local-secret-files-check`
- `npm run gateforge:github-secrets-audit`
- `npm run deploy:health-gate`

Exit criteria: Hosted gate can prove the configured uptime monitor.

### GF-010 - Set ALERT_EMAIL_TO for staging operations.

Owner: Operator

Secret names:
- `ALERT_EMAIL_TO`

Provider setup:
- Choose a monitored staging operations inbox.

Evidence required:
- Alert delivery proof in hosted evidence packet.

Validation commands:
- `npm run deploy:health-gate`

Exit criteria: Operational alerts have a human recipient.

### GF-011 - Set ALERT_WEBHOOK_URL for staging alerts.

Owner: Operator

Secret names:
- `ALERT_WEBHOOK_URL`

Provider setup:
- Create a staging alert webhook destination in the team response channel.

Evidence required:
- Cron/webhook failure alert proof.

Validation commands:
- `npm run deploy:health-gate`

Exit criteria: Machine-readable alert delivery proof exists.

### GF-012 - Create Resend staging key or approved transactional email provider key.

Owner: Operator

Secret names:
- `RESEND_API_KEY`

Provider setup:
- Create a staging transactional email provider key with limited scope.

Evidence required:
- Provider test send and DNS posture evidence.

Validation commands:
- `npm run deploy:smoke`

Exit criteria: Transactional email provider is real and testable in staging.

### GF-013 - Set RESEND_API_KEY.

Owner: Operator

Secret names:
- `RESEND_API_KEY`

Provider setup:
- Write the staging provider key to the local secret file, then upload it to GitHub Actions.

Evidence required:
- Hosted strict email readiness evidence.

Validation commands:
- `npm run gateforge:local-secret-files-check`
- `npm run gateforge:github-secrets-audit`
- `npm run deploy:smoke`

Exit criteria: Hosted smoke can send or validate transactional email readiness.

### GF-014 - Verify sender domain and set EMAIL_FROM.

Owner: Operator

Secret names:
- `EMAIL_FROM`

Provider setup:
- Verify the sender domain/address with SPF, DKIM, and DMARC evidence.

Evidence required:
- SPF/DKIM/DMARC evidence and provider verified sender.

Validation commands:
- `npm run deploy:smoke`

Exit criteria: Outbound transactional messages use a verified sender.

### GF-015 - Set EMAIL_REPLY_TO.

Owner: Operator

Secret names:
- `EMAIL_REPLY_TO`

Provider setup:
- Choose a monitored support or founder reply-to address.

Evidence required:
- Transactional provider config proof.

Validation commands:
- `npm run deploy:smoke`

Exit criteria: Customer replies route to a monitored inbox.

### GF-016 - Create capped Anthropic staging key.

Owner: Operator

Secret names:
- `ANTHROPIC_API_KEY`

Provider setup:
- Create a staging AI provider key with provider-side spend limits.

Evidence required:
- Provider-side cap proof and AI gateway hosted smoke evidence.

Validation commands:
- `npm run verify:production-safety`
- `npm run ci:live`

Exit criteria: AI provider access is capped and audited before GA.
