# P0/P1 Gate Reassessment

| Gate | Previous | After Remediation | Remaining Evidence Required |
|---|---|---|---|
| Tenant isolation / DB-per-tenant | PARTIAL | CODE_READY / STAGING_REQUIRED | Run `npm run test:pg` and `npm run ci:live` with staging Postgres. |
| Route-level authz | PARTIAL | IMPLEMENTED | Keep route matrix current; hosted CI artifact. |
| Admin MFA | MISSING_EVIDENCE | IMPLEMENTED | Run migration and verify owner/admin MFA setup in staging. |
| AI cost caps | MISSING_EVIDENCE | IMPLEMENTED | Configure caps in staging/prod and archive degraded/allowed usage event evidence. |
| AI usage logs | MISSING_EVIDENCE | IMPLEMENTED | Run one allowed and one blocked AI call in staging. |
| Webhook replay/idempotency | PARTIAL | IMPLEMENTED_PARTIAL | Provider-specific signed webhook replay test in staging. |
| Backup/restore | PARTIAL | CHECKER_READY | Run real `db:backup`, `db:restore-test`, `db:verify-restore` against staging DBs. |
| Monitoring/alerting | PARTIAL | READINESS_CHECK_IMPLEMENTED | Configure Sentry/uptime/alert recipient and archive proof. |
| Email deliverability | MISSING_EVIDENCE | ADAPTER_READY | Verify SPF/DKIM/DMARC + provider test. |
| Dependency/SBOM | MISSING_EVIDENCE | PASS_LOCAL | Hosted CI artifact still needed for GA evidence. |
| Legal/privacy | PARTIAL | HUMAN_ATTESTATION_REQUIRED | Final legal approval/publication. |
| Data export/delete | PARTIAL | IMPLEMENTED | Run export/delete proof on staging tenant. |

## Decision

- Local code/evidence posture: `CONDITIONAL_GO_CANDIDATE`
- GA decision: `PENDING_STAGING_EVIDENCE`
- Reason: implemented controls are in place, but GateForge cannot mark live P0s as PASS without staging/runtime artifacts.
