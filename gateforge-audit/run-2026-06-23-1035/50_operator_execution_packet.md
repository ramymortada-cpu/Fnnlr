# GateForge Operator Execution Packet

Generated: `2026-07-01T12:50:47.004Z`

This packet is the operator-facing execution map for closing the remaining 16 GateForge GA blockers. It contains secret names, provider setup, validation commands, and evidence requirements only. It must never contain secret values.

## Source Of Truth

- Closeout checklist: `gateforge-audit/run-2026-06-23-1035/48_remaining_external_blocker_closeout.json`
- Progress board: `gateforge-audit/run-2026-06-23-1035/49_external_blocker_progress.json`
- Current blocker count: `16`
- Local secret pending: `16`
- GitHub secret pending: `0`
- Hosted/provider evidence pending: `0`

## Command Path

1. `npm run gateforge:scaffold-local-secrets`
2. Replace placeholder files under `/tmp/fnnlr-gateforge-secrets`.
3. `npm run gateforge:local-secret-files-check`
4. `npm run gateforge:external-blocker-progress`
5. `npm run gateforge:hosted-unblock -- --dry-run --prepare-attestation`
6. `npm run gateforge:hosted-unblock -- --apply --prepare-attestation`
7. `npm run gateforge:trigger-hosted-strict`
8. `npm run gateforge:ga-unblock-status`

## Fast Matrix

| ID | Status | Action | Secret names | Validation | Next action |
| --- | --- | --- | --- | --- | --- |
| `GF-001` | `LOCAL_SECRET_PENDING` | Provision hosted staging control-plane Postgres. | `CONTROL_PLANE_DATABASE_URL` | `npm run ci:live`<br>`npm run deploy:health-gate` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-002` | `LOCAL_SECRET_PENDING` | Provision tenant database admin access for staging. | `TENANT_DB_ADMIN_URL` | `npm run test:pg`<br>`npm run deploy:verify-restore` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-003` | `LOCAL_SECRET_PENDING` | Set CONTROL_PLANE_DATABASE_URL in local secret pack and GitHub Actions. | `CONTROL_PLANE_DATABASE_URL` | `npm run gateforge:local-secret-files-check`<br>`npm run gateforge:github-secrets-audit` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-004` | `LOCAL_SECRET_PENDING` | Set TENANT_DB_ADMIN_URL in local secret pack and GitHub Actions. | `TENANT_DB_ADMIN_URL` | `npm run gateforge:local-secret-files-check`<br>`npm run gateforge:github-secrets-audit`<br>`npm run test:pg` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-005` | `LOCAL_SECRET_PENDING` | Set TENANT_DB_HOST in local secret pack and GitHub Actions. | `TENANT_DB_HOST` | `npm run gateforge:local-secret-files-check`<br>`npm run test:pg` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-006` | `LOCAL_SECRET_PENDING` | Create staging Sentry or equivalent error-monitoring project. | `SENTRY_DSN` | `npm run deploy:health-gate` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-007` | `LOCAL_SECRET_PENDING` | Set SENTRY_DSN for staging. | `SENTRY_DSN` | `npm run gateforge:local-secret-files-check`<br>`npm run gateforge:github-secrets-audit`<br>`npm run deploy:health-gate` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-008` | `LOCAL_SECRET_PENDING` | Create uptime monitor for /health. | `UPTIME_HEALTHCHECK_URL` | `npm run deploy:health-gate` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-009` | `LOCAL_SECRET_PENDING` | Set UPTIME_HEALTHCHECK_URL. | `UPTIME_HEALTHCHECK_URL` | `npm run gateforge:local-secret-files-check`<br>`npm run gateforge:github-secrets-audit`<br>`npm run deploy:health-gate` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-010` | `LOCAL_SECRET_PENDING` | Set ALERT_EMAIL_TO for staging operations. | `ALERT_EMAIL_TO` | `npm run deploy:health-gate` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-011` | `LOCAL_SECRET_PENDING` | Set ALERT_WEBHOOK_URL for staging alerts. | `ALERT_WEBHOOK_URL` | `npm run deploy:health-gate` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-012` | `LOCAL_SECRET_PENDING` | Create Resend staging key or approved transactional email provider key. | `RESEND_API_KEY` | `npm run deploy:smoke` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-013` | `LOCAL_SECRET_PENDING` | Set RESEND_API_KEY. | `RESEND_API_KEY` | `npm run gateforge:local-secret-files-check`<br>`npm run gateforge:github-secrets-audit`<br>`npm run deploy:smoke` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-014` | `LOCAL_SECRET_PENDING` | Verify sender domain and set EMAIL_FROM. | `EMAIL_FROM` | `npm run deploy:smoke` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-015` | `LOCAL_SECRET_PENDING` | Set EMAIL_REPLY_TO. | `EMAIL_REPLY_TO` | `npm run deploy:smoke` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-016` | `LOCAL_SECRET_PENDING` | Create capped Anthropic staging key. | `ANTHROPIC_API_KEY` | `npm run verify:production-safety`<br>`npm run ci:live` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |

## Secret File Matrix

| Secret file | Blockers | Current blocker statuses |
| --- | --- | --- |
| `CONTROL_PLANE_DATABASE_URL` | `GF-001`, `GF-003` | `LOCAL_SECRET_PENDING` |
| `TENANT_DB_ADMIN_URL` | `GF-002`, `GF-004` | `LOCAL_SECRET_PENDING` |
| `TENANT_DB_HOST` | `GF-005` | `LOCAL_SECRET_PENDING` |
| `TENANT_CREDENTIAL_ENCRYPTION_KEY` | `HOSTED-RUNTIME` | `LOCAL_SECRET_PENDING` |
| `INTEGRATION_ENCRYPTION_KEY` | `HOSTED-RUNTIME` | `LOCAL_SECRET_PENDING` |
| `FNNLR_CRON_SECRET` | `HOSTED-RUNTIME` | `LOCAL_SECRET_PENDING` |
| `AUTH_MFA_ENCRYPTION_KEY` | `HOSTED-RUNTIME` | `LOCAL_SECRET_PENDING` |
| `FNNLR_AI_TENANT_DAILY_USD_CAP` | `HOSTED-RUNTIME` | `LOCAL_SECRET_PENDING` |
| `FNNLR_AI_GLOBAL_DAILY_USD_CAP` | `HOSTED-RUNTIME` | `LOCAL_SECRET_PENDING` |
| `SENTRY_DSN` | `GF-006`, `GF-007` | `LOCAL_SECRET_PENDING` |
| `UPTIME_HEALTHCHECK_URL` | `GF-008`, `GF-009` | `LOCAL_SECRET_PENDING` |
| `ALERT_EMAIL_TO` | `GF-010` | `LOCAL_SECRET_PENDING` |
| `ALERT_WEBHOOK_URL` | `GF-011` | `LOCAL_SECRET_PENDING` |
| `RESEND_API_KEY` | `GF-012`, `GF-013` | `LOCAL_SECRET_PENDING` |
| `EMAIL_FROM` | `GF-014` | `LOCAL_SECRET_PENDING` |
| `EMAIL_REPLY_TO` | `GF-015` | `LOCAL_SECRET_PENDING` |
| `ANTHROPIC_API_KEY` | `GF-016` | `LOCAL_SECRET_PENDING` |
| `GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON` | `HOSTED-ATTESTATION` | `LOCAL_SECRET_PENDING` |
| `GATEFORGE_HOSTED_STAGING_ATTESTATION_B64` | `HOSTED-ATTESTATION` | `LOCAL_SECRET_PENDING` |

## Blocker Details

### GF-001 - Provision hosted staging control-plane Postgres.

Status: `LOCAL_SECRET_PENDING`

Secret files:
- `CONTROL_PLANE_DATABASE_URL`

Provider setup:
- Create a hosted staging Postgres database dedicated to the control plane.

Evidence required:
- Provider database identifier and sanitized successful hosted health gate output.

Validation commands:
- `npm run ci:live`
- `npm run deploy:health-gate`

Exit criteria: Hosted control-plane database is reachable from GitHub Actions without local-only evidence.

Next action: Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check.

### GF-002 - Provision tenant database admin access for staging.

Status: `LOCAL_SECRET_PENDING`

Secret files:
- `TENANT_DB_ADMIN_URL`

Provider setup:
- Create a hosted staging admin connection that can create/drop tenant databases.

Evidence required:
- Hosted tenant provision/delete test output and sanitized DB-per-tenant proof.

Validation commands:
- `npm run test:pg`
- `npm run deploy:verify-restore`

Exit criteria: Tenant DB creation, deletion, and isolation pass in hosted staging.

Next action: Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check.

### GF-003 - Set CONTROL_PLANE_DATABASE_URL in local secret pack and GitHub Actions.

Status: `LOCAL_SECRET_PENDING`

Secret files:
- `CONTROL_PLANE_DATABASE_URL`

Provider setup:
- Write the staging control-plane URL to the local secret file, then upload by secret name only.

Evidence required:
- Local secret files check PASS and GitHub secret name present.

Validation commands:
- `npm run gateforge:local-secret-files-check`
- `npm run gateforge:github-secrets-audit`

Exit criteria: Secret exists locally and in GitHub without printing the value.

Next action: Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check.

### GF-004 - Set TENANT_DB_ADMIN_URL in local secret pack and GitHub Actions.

Status: `LOCAL_SECRET_PENDING`

Secret files:
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

Next action: Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check.

### GF-005 - Set TENANT_DB_HOST in local secret pack and GitHub Actions.

Status: `LOCAL_SECRET_PENDING`

Secret files:
- `TENANT_DB_HOST`

Provider setup:
- Extract the staging tenant DB host from the provider without credentials.

Evidence required:
- Local secret files check READY and hosted tenant routing proof.

Validation commands:
- `npm run gateforge:local-secret-files-check`
- `npm run test:pg`

Exit criteria: Tenant DB host is present and matches the hosted tenant admin target.

Next action: Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check.

### GF-006 - Create staging Sentry or equivalent error-monitoring project.

Status: `LOCAL_SECRET_PENDING`

Secret files:
- `SENTRY_DSN`

Provider setup:
- Create a staging error-monitoring project with alert routing enabled.

Evidence required:
- Sanitized project reference and alert proof attached to hosted attestation.

Validation commands:
- `npm run deploy:health-gate`

Exit criteria: Error monitoring is a real hosted service, not a doc-only claim.

Next action: Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check.

### GF-007 - Set SENTRY_DSN for staging.

Status: `LOCAL_SECRET_PENDING`

Secret files:
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

Next action: Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check.

### GF-008 - Create uptime monitor for /health.

Status: `LOCAL_SECRET_PENDING`

Secret files:
- `UPTIME_HEALTHCHECK_URL`

Provider setup:
- Create an external uptime monitor pointed at the hosted staging /health endpoint.

Evidence required:
- Monitor URL, screenshot/log reference, and successful health gate.

Validation commands:
- `npm run deploy:health-gate`

Exit criteria: External uptime evidence exists outside local tests.

Next action: Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check.

### GF-009 - Set UPTIME_HEALTHCHECK_URL.

Status: `LOCAL_SECRET_PENDING`

Secret files:
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

Next action: Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check.

### GF-010 - Set ALERT_EMAIL_TO for staging operations.

Status: `LOCAL_SECRET_PENDING`

Secret files:
- `ALERT_EMAIL_TO`

Provider setup:
- Choose a monitored staging operations inbox.

Evidence required:
- Alert delivery proof in hosted evidence packet.

Validation commands:
- `npm run deploy:health-gate`

Exit criteria: Operational alerts have a human recipient.

Next action: Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check.

### GF-011 - Set ALERT_WEBHOOK_URL for staging alerts.

Status: `LOCAL_SECRET_PENDING`

Secret files:
- `ALERT_WEBHOOK_URL`

Provider setup:
- Create a staging alert webhook destination in the team response channel.

Evidence required:
- Cron/webhook failure alert proof.

Validation commands:
- `npm run deploy:health-gate`

Exit criteria: Machine-readable alert delivery proof exists.

Next action: Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check.

### GF-012 - Create Resend staging key or approved transactional email provider key.

Status: `LOCAL_SECRET_PENDING`

Secret files:
- `RESEND_API_KEY`

Provider setup:
- Create a staging transactional email provider key with limited scope.

Evidence required:
- Provider test send and DNS posture evidence.

Validation commands:
- `npm run deploy:smoke`

Exit criteria: Transactional email provider is real and testable in staging.

Next action: Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check.

### GF-013 - Set RESEND_API_KEY.

Status: `LOCAL_SECRET_PENDING`

Secret files:
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

Next action: Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check.

### GF-014 - Verify sender domain and set EMAIL_FROM.

Status: `LOCAL_SECRET_PENDING`

Secret files:
- `EMAIL_FROM`

Provider setup:
- Verify the sender domain/address with SPF, DKIM, and DMARC evidence.

Evidence required:
- SPF/DKIM/DMARC evidence and provider verified sender.

Validation commands:
- `npm run deploy:smoke`

Exit criteria: Outbound transactional messages use a verified sender.

Next action: Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check.

### GF-015 - Set EMAIL_REPLY_TO.

Status: `LOCAL_SECRET_PENDING`

Secret files:
- `EMAIL_REPLY_TO`

Provider setup:
- Choose a monitored support or founder reply-to address.

Evidence required:
- Transactional provider config proof.

Validation commands:
- `npm run deploy:smoke`

Exit criteria: Customer replies route to a monitored inbox.

Next action: Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check.

### GF-016 - Create capped Anthropic staging key.

Status: `LOCAL_SECRET_PENDING`

Secret files:
- `ANTHROPIC_API_KEY`

Provider setup:
- Create a staging AI provider key with provider-side spend limits.

Evidence required:
- Provider-side cap proof and AI gateway hosted smoke evidence.

Validation commands:
- `npm run verify:production-safety`
- `npm run ci:live`

Exit criteria: AI provider access is capped and audited before GA.

Next action: Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check.


## Safety

- Secret values printed: `NO`
- Production mutated: `NO`
- Source dumps included: `NO`
