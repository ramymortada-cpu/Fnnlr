# Phase 1 Selected Fixes

| Finding ID | Control / Domain | Current Status | Desired Status After Fix | Files Likely Affected | Tests / Checks Required | Evidence That Proves Change | Rollback Plan |
|---|---|---|---|---|---|---|---|
| P0-001 | Tenant isolation / DB-per-tenant | CODE_READY / STAGING_REQUIRED | PASS after staging DB evidence | no further app code; staging env and audit evidence | `npm run test:pg`, `npm run ci:live` | live isolation tests pass with redacted logs | use disposable staging tenants only |
| P0-002/P0-003 | Health gate / backup / restore | CHECKER_READY / STAGING_REQUIRED | PASS after staging health and restore drill | deploy/backup scripts already present | `deploy:health-gate`, `deploy:smoke`, `db:backup`, `db:restore-test`, `db:verify-restore` | health gate plus restore logs | never restore over prod; use disposable restore DB |
| P0-007 | Admin MFA | IMPLEMENTED_LOCAL | PASS after migration + staging API proof | auth service, server routes, control migration, auth tests | focused auth tests, staging `/auth/mfa/*`, `/admin/*` reject/allow | MFA setup/verify and non-MFA admin reject logs | operator MFA recovery runbook |
| P0-008 | AI cost caps / usage logs | IMPLEMENTED_LOCAL | PASS after staging env proof | AI gateway, ai-ops usage, tenant migration, brain tests | focused brain tests and staging usage rows | allowed + kill-switch blocked `ai_usage_events` | unset caps/kill switch after test |
| P0-009 | Webhook replay/idempotency | IMPLEMENTED_LOCAL / PROVIDER_REQUIRED | PASS after signed provider proof | integrations provider/service, integration tests | focused integration tests and staging signed webhook script | accepted once, duplicate idempotent, stale timestamp rejected | disable staging connection secret |

## Out Of Batch

- SEO/GEO, UI polish, enterprise docs, broad UX: not Phase 1.
- Legal final approval and monitoring provider screenshots: Phase 1 evidence items but require human/external systems, so they are tracked as `HUMAN_ATTESTATION_REQUIRED` or `BLOCKED_BY_ENVIRONMENT` until supplied.
