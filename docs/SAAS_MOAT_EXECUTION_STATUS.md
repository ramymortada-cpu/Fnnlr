# SaaS Moat Execution Status

Generated: `2026-07-01T00:49:00.437Z`

This status is derived from the 165-point board. It treats hosted/operator-only work as blocked until real external evidence exists.

## Summary By State

| State | Count |
| --- | ---: |
| `BLOCKED_EXTERNAL` | 16 |
| `COMMAND_READY` | 7 |
| `EVIDENCE_FILE_PRESENT` | 89 |
| `OWNER_OR_DOC_ACTION_READY` | 53 |

## Summary By Phase

| Phase | Actions | Evidence-file present | Externally blocked |
| --- | ---: | ---: | ---: |
| GateForge GA unblock | 24 | 0 | 16 |
| Trust moat | 12 | 12 | 0 |
| SaaS packaging moat | 10 | 10 | 0 |
| Workflow intelligence moat | 8 | 8 | 0 |
| Activation moat | 8 | 8 | 0 |
| Distribution moat | 10 | 10 | 0 |
| Enterprise moat | 8 | 8 | 0 |
| Operating cadence | 8 | 8 | 0 |
| Trust center execution | 10 | 1 | 0 |
| Commercial moat execution | 15 | 1 | 0 |
| Industry template execution | 15 | 5 | 0 |
| Activation execution | 8 | 2 | 0 |
| AI intelligence execution | 8 | 1 | 0 |
| Sales execution | 6 | 5 | 0 |
| Enterprise execution | 8 | 3 | 0 |
| Operating execution | 7 | 7 | 0 |

## Open P0 Items

| ID | State | Action | Evidence required |
| --- | --- | --- | --- |
| `GF-001` | `BLOCKED_EXTERNAL` | Provision hosted staging control-plane Postgres. | Provider database URL and successful hosted health gate. |
| `GF-002` | `BLOCKED_EXTERNAL` | Provision tenant database admin access for staging. | TENANT_DB_ADMIN_URL validated by live tenant provision/delete test. |
| `GF-003` | `BLOCKED_EXTERNAL` | Set CONTROL_PLANE_DATABASE_URL in the local secret pack and GitHub Actions. | npm run gateforge:local-secret-files-check and GitHub secrets audit PASS. |
| `GF-004` | `BLOCKED_EXTERNAL` | Set TENANT_DB_ADMIN_URL in the local secret pack and GitHub Actions. | Hosted strict live DB tests PASS. |
| `GF-005` | `BLOCKED_EXTERNAL` | Set TENANT_DB_HOST in the local secret pack and GitHub Actions. | Local secret files check reports READY. |
| `GF-006` | `BLOCKED_EXTERNAL` | Create staging Sentry or equivalent error-monitoring project. | SENTRY_DSN present and alert proof attached. |
| `GF-007` | `BLOCKED_EXTERNAL` | Set SENTRY_DSN for staging. | Hosted strict monitoring item PASS. |
| `GF-008` | `BLOCKED_EXTERNAL` | Create uptime monitor for /health. | UPTIME_HEALTHCHECK_URL and screenshot/log reference in attestation. |
| `GF-009` | `BLOCKED_EXTERNAL` | Set UPTIME_HEALTHCHECK_URL. | GateForge secret check READY and hosted attestation item PASS. |
| `GF-010` | `BLOCKED_EXTERNAL` | Set ALERT_EMAIL_TO for staging operations. | Alert delivery proof in hosted evidence packet. |
| `GF-011` | `BLOCKED_EXTERNAL` | Set ALERT_WEBHOOK_URL for staging alerts. | Cron/webhook failure alert proof. |
| `GF-012` | `BLOCKED_EXTERNAL` | Create Resend staging key or approved transactional email provider key. | Provider test send and DNS posture evidence. |
| `GF-013` | `BLOCKED_EXTERNAL` | Set RESEND_API_KEY. | Hosted strict email readiness evidence. |
| `GF-014` | `BLOCKED_EXTERNAL` | Verify sender domain and set EMAIL_FROM. | SPF/DKIM/DMARC evidence and provider verified sender. |
| `GF-015` | `BLOCKED_EXTERNAL` | Set EMAIL_REPLY_TO. | Transactional provider config proof. |
| `GF-016` | `BLOCKED_EXTERNAL` | Create capped Anthropic staging key. | ANTHROPIC_API_KEY present with provider-side cap proof. |
| `GF-017` | `COMMAND_READY` | Run local secret replacement packet after operator values exist. | npm run gateforge:secret-replacement-packet PASS. |
| `GF-018` | `COMMAND_READY` | Generate hosted staging attestation packet from real evidence only. | hosted-staging-attestation.json validates with external-check. |
| `GF-019` | `COMMAND_READY` | Encode validated attestation as the preferred B64 secret. | npm run gateforge:attestation-secret-pack -- --write-b64 PASS. |
| `GF-020` | `COMMAND_READY` | Run hosted readiness doctor. | 44_hosted_readiness_doctor.md says UPLOAD_GITHUB_SECRETS or later. |
| `GF-021` | `COMMAND_READY` | Upload local secret pack to GitHub Actions after validation. | GitHub secrets audit READY. |
| `GF-022` | `OWNER_OR_DOC_ACTION_READY` | Trigger GateForge Hosted Staging Strict. | Hosted strict workflow success URL. |
| `GF-023` | `COMMAND_READY` | Run final gate and final report. | final-gate CONDITIONAL_GO or precise blockers. |
| `GF-024` | `COMMAND_READY` | Refresh GA unblock status dashboard. | 47_ga_unblock_status.md/json updated. |
