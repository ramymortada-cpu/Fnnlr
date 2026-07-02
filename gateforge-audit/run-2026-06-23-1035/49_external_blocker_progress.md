# GateForge External Blocker Progress

Generated: `2026-07-02T10:47:27.044Z`

This progress board converts the 16 remaining external blockers into executable status. It uses secret names and readiness states only; no secret values are printed.

## Summary

- Total blockers: `16`
- Local secret pending: `16`
- GitHub secret pending: `0`
- Hosted/provider evidence pending: `0`
- Unique local secret names not ready: `11`
- Unique GitHub secret names missing: `11`
- Source closeout: `gateforge-audit/run-2026-06-23-1035/48_remaining_external_blocker_closeout.json`
- Local secret directory: `/tmp/fnnlr-gateforge-secrets`
- GitHub secret source: `gh secret list --json name`

## Progress Matrix

| ID | Status | Action | Secret names | Local status | GitHub status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `GF-001` | `LOCAL_SECRET_PENDING` | Provision hosted staging control-plane Postgres. | `CONTROL_PLANE_DATABASE_URL` | `CONTROL_PLANE_DATABASE_URL`: `PLACEHOLDER` | `CONTROL_PLANE_DATABASE_URL`: `MISSING` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-002` | `LOCAL_SECRET_PENDING` | Provision tenant database admin access for staging. | `TENANT_DB_ADMIN_URL` | `TENANT_DB_ADMIN_URL`: `PLACEHOLDER` | `TENANT_DB_ADMIN_URL`: `MISSING` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-003` | `LOCAL_SECRET_PENDING` | Set CONTROL_PLANE_DATABASE_URL in local secret pack and GitHub Actions. | `CONTROL_PLANE_DATABASE_URL` | `CONTROL_PLANE_DATABASE_URL`: `PLACEHOLDER` | `CONTROL_PLANE_DATABASE_URL`: `MISSING` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-004` | `LOCAL_SECRET_PENDING` | Set TENANT_DB_ADMIN_URL in local secret pack and GitHub Actions. | `TENANT_DB_ADMIN_URL` | `TENANT_DB_ADMIN_URL`: `PLACEHOLDER` | `TENANT_DB_ADMIN_URL`: `MISSING` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-005` | `LOCAL_SECRET_PENDING` | Set TENANT_DB_HOST in local secret pack and GitHub Actions. | `TENANT_DB_HOST` | `TENANT_DB_HOST`: `PLACEHOLDER` | `TENANT_DB_HOST`: `MISSING` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-006` | `LOCAL_SECRET_PENDING` | Create staging Sentry or equivalent error-monitoring project. | `SENTRY_DSN` | `SENTRY_DSN`: `PLACEHOLDER` | `SENTRY_DSN`: `MISSING` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-007` | `LOCAL_SECRET_PENDING` | Set SENTRY_DSN for staging. | `SENTRY_DSN` | `SENTRY_DSN`: `PLACEHOLDER` | `SENTRY_DSN`: `MISSING` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-008` | `LOCAL_SECRET_PENDING` | Create uptime monitor for /health. | `UPTIME_HEALTHCHECK_URL` | `UPTIME_HEALTHCHECK_URL`: `PLACEHOLDER` | `UPTIME_HEALTHCHECK_URL`: `MISSING` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-009` | `LOCAL_SECRET_PENDING` | Set UPTIME_HEALTHCHECK_URL. | `UPTIME_HEALTHCHECK_URL` | `UPTIME_HEALTHCHECK_URL`: `PLACEHOLDER` | `UPTIME_HEALTHCHECK_URL`: `MISSING` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-010` | `LOCAL_SECRET_PENDING` | Set ALERT_EMAIL_TO for staging operations. | `ALERT_EMAIL_TO` | `ALERT_EMAIL_TO`: `PLACEHOLDER` | `ALERT_EMAIL_TO`: `MISSING` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-011` | `LOCAL_SECRET_PENDING` | Set ALERT_WEBHOOK_URL for staging alerts. | `ALERT_WEBHOOK_URL` | `ALERT_WEBHOOK_URL`: `PLACEHOLDER` | `ALERT_WEBHOOK_URL`: `MISSING` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-012` | `LOCAL_SECRET_PENDING` | Create Resend staging key or approved transactional email provider key. | `RESEND_API_KEY` | `RESEND_API_KEY`: `PLACEHOLDER` | `RESEND_API_KEY`: `MISSING` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-013` | `LOCAL_SECRET_PENDING` | Set RESEND_API_KEY. | `RESEND_API_KEY` | `RESEND_API_KEY`: `PLACEHOLDER` | `RESEND_API_KEY`: `MISSING` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-014` | `LOCAL_SECRET_PENDING` | Verify sender domain and set EMAIL_FROM. | `EMAIL_FROM` | `EMAIL_FROM`: `PLACEHOLDER` | `EMAIL_FROM`: `MISSING` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-015` | `LOCAL_SECRET_PENDING` | Set EMAIL_REPLY_TO. | `EMAIL_REPLY_TO` | `EMAIL_REPLY_TO`: `PLACEHOLDER` | `EMAIL_REPLY_TO`: `MISSING` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |
| `GF-016` | `LOCAL_SECRET_PENDING` | Create capped Anthropic staging key. | `ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY`: `PLACEHOLDER` | `ANTHROPIC_API_KEY`: `MISSING` | Create or replace local staging secret files, then run npm run gateforge:local-secret-files-check. |

## Interpretation

- `LOCAL_SECRET_PENDING`: a required local secret file is missing, empty, placeholder, or invalid.
- `GITHUB_SECRET_PENDING`: local secret files are ready, but GitHub Actions secret names are not present.
- `HOSTED_EVIDENCE_PENDING`: secret names are staged; the blocker still needs hosted/provider evidence before it can close.
- The unique GitHub/local readiness counts are independent diagnostics; they can be non-zero even while the sequential blocker status remains `LOCAL_SECRET_PENDING`.

## Safety

- Secret values printed: `NO`
- Production mutated: `NO`
- Source dumps included: `NO`
