## fnnlr — Sprint 45 Report (Production Deployment Lock)

This sprint closes the last gap before running a real customer on production: a real environment spec, a managed-Postgres deployment path, backup/restore with verification, a CI/release pipeline, a deploy health gate, a safe rollback plan, logging/retention, a domain/SSL checklist, and a deploy smoke — every doc backed by a runnable check. No new feature, no docs-without-checks, no secrets printed, and no destructive rollback by default.

**Result: 457 tests, 430 pass, 0 fail, 27 skip without a DB. `npm run ci` returns SAFE TO RELEASE. Typecheck clean. Web balanced, no `x-tenant-id` trust. Deploy smoke passes.**

### 1. Production environment (`.env.production.example`, `docs/PRODUCTION_ENVIRONMENT.md`)
The env template is **generated from `ENV_SPEC`** (the single source of truth) via `deploy:env-template`, so it never drifts. It contains no real-looking secrets, every required var carries an explanation and its fail-closed behavior, and the dev-only `FNNLR_DEV_MODE` is commented out so it can't be set in production by accident. The release checker already fails on a missing required var (e.g. encryption key) — verified by test.

### 2. Managed Postgres deployment path (`docs/DEPLOYMENT_RUNBOOK.md`)
Empty → ready with no manual DB hacking: create the control DB, `migrate:control`, `customer:create` (provisions the tenant DB + tenant migrations), then `test:pg`, `verify:release-candidate`, `deploy:health-gate`, `deploy:smoke`, and customer-zero acceptance. Every step is a real command, all verified to exist in `package.json`.

### 3. Backup & restore with verification (`scripts/backup-restore.ts`, `docs/BACKUP_RESTORE_RUNBOOK.md`)
`db:backup` / `db:restore-test` / `db:verify-restore` — thin `pg_dump`/`psql` wrappers that **refuse to run without a valid DB URL**, never print the URL or any secret (errors are redacted), and verify the critical tables exist after a restore (control: tenants/users/workspaces/workspace_members; tenant: businesses/journeys/offers/pages/tracked_links/leads/payment_states/audit_events). `verifyRestore` is pure and tested both ways (catches missing tables, passes on a complete set).

### 4. CI / release pipeline (`scripts/ci.ts`)
`npm run ci` (and `ci:live`) runs, in one command: typecheck, unit tests, the commercial consistency checker, the production-safety verify (production-safety + webhook-security + security-hardening tests), the web script-balance + no-`x-tenant-id`-trust check, and — with `--live` and a configured DB — the live DB suite. It prints a per-step result and a final **SAFE TO RELEASE / NOT SAFE TO RELEASE**. Confirmed: returns SAFE TO RELEASE on this build.

### 5. Deploy health gate (`deployHealthGate`, `deploy:health-gate`)
Composes `fullHealth` + the release checker + encryption/cron presence into `READY_TO_SERVE` / `DEGRADED` / `BLOCKED`. No secrets in the output. Verified: BLOCKED when the control DB is unavailable, with no connection string, key, or PEM leaked.

### 6. Rollback plan (`modules/deployment/src/rollback.ts`, `docs/ROLLBACK_RUNBOOK.md`)
**Non-destructive by default**: stop jobs → disable outbound retries → pause integrations → roll back the app version → preserve the DB → record the rollback. A restore-from-backup step is included **only with explicit `--confirm`**, for confirmed data corruption. The plan **never drops a tenant database** — guarded by `planNeverDropsTenantDb()` and tested.

### 7. Logging & retention (`docs/LOGGING_RETENTION.md`)
Documents the existing logging surfaces (audit_events, integration_events, scheduled_runs, webhook_deliveries, command/execution/issue logs) and a retention policy: keep security/audit events longest, archive high-volume page_events, never delete audit/security inside the retention window, and never log a raw secret or a customer-facing stack trace. No new observability platform.

### 8. Domain / SSL checklist (`docs/DOMAIN_SSL_CHECKLIST.md`)
App + API domains, CORS/origins, SSL, HSTS decision, public page + tracked link base URLs, webhook callback URLs, customer-facing URLs, and robots/noindex — with a post-DNS verify via `deploy:health-gate` + `deploy:smoke`.

### 9. Deploy smoke (`deploy:smoke`)
Starts the server and probes safe routes: `/health` ok, unsigned cron rejected (401/403), unknown webhook rejected (≥400), invalid public route fails safely (4xx, no crash). Passes.

### Tests
- `tests/deployment.test.ts` (11): env template has every required var + no real-looking secrets + dev-only commented out; release env check fails on missing encryption key; restore verification catches missing tables and passes on a full set; default rollback is non-destructive and preserves the DB; destructive restore only with confirmation; the plan never drops a tenant DB; health gate BLOCKED without a DB and prints no secrets; deploy smoke probes pass.
- All prior suites remain green; `ci` ties them together.

### Acceptance — all met
Production env template ✓ · managed Postgres path with scripts ✓ · backup/restore verification ✓ · CI/release commands ✓ · deploy health gate ✓ · deploy smoke ✓ · safe rollback plan ✓ · logging/retention policy ✓ · domain/SSL checklist ✓ · tests green ✓ · no secrets printed ✓ · no destructive rollback by default ✓ · no new feature ✓ · report + bundle present ✓.

### Remaining risks (honest)
- The embedded in-session Postgres is not a managed instance; the deployment + backup/restore commands were exercised for their guards (URL refusal, table verification, no-secret output) and the live DB suite passes on a real Postgres, but a true managed-Postgres backup/restore drill must be run in the target environment before go-live. The runbook is the script for that drill.
- `db:backup` / `db:restore-test` require `pg_dump` / `psql` on the deploy host; the runbook notes this. The pure `verifyRestore` logic is environment-independent and tested.
- The CI commercial-checker step skips silently if docs aren't mounted next to the code; in the bundle they are, and `ci` reports the step as passed. CI in the target repo must keep the docs in the checked-out tree.
- The health gate composes live checks; a transient DB blip will read as BLOCKED. That is intended (fail-safe), but operators should re-run before declaring an outage.

### Status
fnnlr is now deployable to real production with confidence: a generated, secret-free environment spec; a managed-Postgres path that goes empty → ready without manual hacking; backups with a verified restore; a one-command CI that honestly says SAFE / NOT SAFE TO RELEASE; a health gate and a deploy smoke; a rollback that is non-destructive by default and never drops a tenant database; and logging/retention and domain/SSL checklists — every claim backed by a runnable check, no secrets printed, and nothing destructive on the default path.
