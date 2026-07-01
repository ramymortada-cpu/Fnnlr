# SaaS Moat Execution Status

Generated: `2026-07-01T14:02:40.312Z`

This status is derived from the 165-point board. It treats hosted/operator-only work as blocked until real external evidence exists.

## Summary By State

| State | Count |
| --- | ---: |
| `BLOCKED_BY_GITHUB_SECRET_READINESS` | 1 |
| `BLOCKED_BY_HOSTED_ATTESTATION` | 2 |
| `BLOCKED_BY_SECRET_READINESS` | 2 |
| `BLOCKED_EXTERNAL` | 16 |
| `EVIDENCE_FILE_PRESENT` | 130 |
| `OWNER_OR_DOC_ACTION_READY` | 14 |

## Summary By Phase

| Phase | Actions | Evidence-file present | Externally blocked | Dependency blocked |
| --- | ---: | ---: | ---: | ---: |
| GateForge GA unblock | 24 | 3 | 16 | 5 |
| Trust moat | 12 | 12 | 0 | 0 |
| SaaS packaging moat | 10 | 10 | 0 | 0 |
| Workflow intelligence moat | 8 | 8 | 0 | 0 |
| Activation moat | 8 | 8 | 0 | 0 |
| Distribution moat | 10 | 10 | 0 | 0 |
| Enterprise moat | 8 | 8 | 0 | 0 |
| Operating cadence | 8 | 8 | 0 | 0 |
| Trust center execution | 10 | 6 | 0 | 0 |
| Commercial moat execution | 15 | 13 | 0 | 0 |
| Industry template execution | 15 | 15 | 0 | 0 |
| Activation execution | 8 | 7 | 0 | 0 |
| AI intelligence execution | 8 | 8 | 0 | 0 |
| Sales execution | 6 | 4 | 0 | 0 |
| Enterprise execution | 8 | 3 | 0 | 0 |
| Operating execution | 7 | 7 | 0 | 0 |

## Open P0 Items

| ID | State | Action | Evidence required | Next command | Unblock evidence |
| --- | --- | --- | --- | --- | --- |
| `GF-001` | `BLOCKED_EXTERNAL` | Provision hosted staging control-plane Postgres. | Provider database URL and successful hosted health gate. | `npm run gateforge:operator-execution-packet` | Real provider/staging evidence listed in 50_operator_execution_packet.md. |
| `GF-002` | `BLOCKED_EXTERNAL` | Provision tenant database admin access for staging. | TENANT_DB_ADMIN_URL validated by live tenant provision/delete test. | `npm run gateforge:operator-execution-packet` | Real provider/staging evidence listed in 50_operator_execution_packet.md. |
| `GF-003` | `BLOCKED_EXTERNAL` | Set CONTROL_PLANE_DATABASE_URL in the local secret pack and GitHub Actions. | npm run gateforge:local-secret-files-check and GitHub secrets audit PASS. | `npm run gateforge:operator-execution-packet` | Real provider/staging evidence listed in 50_operator_execution_packet.md. |
| `GF-004` | `BLOCKED_EXTERNAL` | Set TENANT_DB_ADMIN_URL in the local secret pack and GitHub Actions. | Hosted strict live DB tests PASS. | `npm run gateforge:operator-execution-packet` | Real provider/staging evidence listed in 50_operator_execution_packet.md. |
| `GF-005` | `BLOCKED_EXTERNAL` | Set TENANT_DB_HOST in the local secret pack and GitHub Actions. | Local secret files check reports READY. | `npm run gateforge:operator-execution-packet` | Real provider/staging evidence listed in 50_operator_execution_packet.md. |
| `GF-006` | `BLOCKED_EXTERNAL` | Create staging Sentry or equivalent error-monitoring project. | SENTRY_DSN present and alert proof attached. | `npm run gateforge:operator-execution-packet` | Real provider/staging evidence listed in 50_operator_execution_packet.md. |
| `GF-007` | `BLOCKED_EXTERNAL` | Set SENTRY_DSN for staging. | Hosted strict monitoring item PASS. | `npm run gateforge:operator-execution-packet` | Real provider/staging evidence listed in 50_operator_execution_packet.md. |
| `GF-008` | `BLOCKED_EXTERNAL` | Create uptime monitor for /health. | UPTIME_HEALTHCHECK_URL and screenshot/log reference in attestation. | `npm run gateforge:operator-execution-packet` | Real provider/staging evidence listed in 50_operator_execution_packet.md. |
| `GF-009` | `BLOCKED_EXTERNAL` | Set UPTIME_HEALTHCHECK_URL. | GateForge secret check READY and hosted attestation item PASS. | `npm run gateforge:operator-execution-packet` | Real provider/staging evidence listed in 50_operator_execution_packet.md. |
| `GF-010` | `BLOCKED_EXTERNAL` | Set ALERT_EMAIL_TO for staging operations. | Alert delivery proof in hosted evidence packet. | `npm run gateforge:operator-execution-packet` | Real provider/staging evidence listed in 50_operator_execution_packet.md. |
| `GF-011` | `BLOCKED_EXTERNAL` | Set ALERT_WEBHOOK_URL for staging alerts. | Cron/webhook failure alert proof. | `npm run gateforge:operator-execution-packet` | Real provider/staging evidence listed in 50_operator_execution_packet.md. |
| `GF-012` | `BLOCKED_EXTERNAL` | Create Resend staging key or approved transactional email provider key. | Provider test send and DNS posture evidence. | `npm run gateforge:operator-execution-packet` | Real provider/staging evidence listed in 50_operator_execution_packet.md. |
| `GF-013` | `BLOCKED_EXTERNAL` | Set RESEND_API_KEY. | Hosted strict email readiness evidence. | `npm run gateforge:operator-execution-packet` | Real provider/staging evidence listed in 50_operator_execution_packet.md. |
| `GF-014` | `BLOCKED_EXTERNAL` | Verify sender domain and set EMAIL_FROM. | SPF/DKIM/DMARC evidence and provider verified sender. | `npm run gateforge:operator-execution-packet` | Real provider/staging evidence listed in 50_operator_execution_packet.md. |
| `GF-015` | `BLOCKED_EXTERNAL` | Set EMAIL_REPLY_TO. | Transactional provider config proof. | `npm run gateforge:operator-execution-packet` | Real provider/staging evidence listed in 50_operator_execution_packet.md. |
| `GF-016` | `BLOCKED_EXTERNAL` | Create capped Anthropic staging key. | ANTHROPIC_API_KEY present with provider-side cap proof. | `npm run gateforge:operator-execution-packet` | Real provider/staging evidence listed in 50_operator_execution_packet.md. |
| `GF-017` | `BLOCKED_BY_SECRET_READINESS` | Run local secret replacement packet after operator values exist. | npm run gateforge:secret-replacement-packet PASS. | `npm run gateforge:scaffold-local-secrets && npm run gateforge:local-secret-files-check` | All runtime secret files and one attestation option are READY without printing values. |
| `GF-018` | `BLOCKED_BY_HOSTED_ATTESTATION` | Generate hosted staging attestation packet from real evidence only. | hosted-staging-attestation.json validates with external-check. | `npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json` | Hosted staging attestation packet exists, is sanitized, and validates. |
| `GF-019` | `BLOCKED_BY_HOSTED_ATTESTATION` | Encode validated attestation as the preferred B64 secret. | npm run gateforge:attestation-secret-pack -- --write-b64 PASS. | `npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json` | Hosted staging attestation packet exists, is sanitized, and validates. |
| `GF-021` | `BLOCKED_BY_SECRET_READINESS` | Upload local secret pack to GitHub Actions after validation. | GitHub secrets audit READY. | `npm run gateforge:scaffold-local-secrets && npm run gateforge:local-secret-files-check` | All runtime secret files and one attestation option are READY without printing values. |
| `GF-022` | `BLOCKED_BY_GITHUB_SECRET_READINESS` | Trigger GateForge Hosted Staging Strict. | Hosted strict workflow success URL. | `npm run gateforge:github-secrets-audit` | GitHub Actions has all runtime secrets and one hosted attestation secret. |
