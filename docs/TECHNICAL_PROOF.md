# fnnlr — Technical Proof

Architecture and the evidence behind it. Citations are real modules / tests /
scripts. fnnlr is evidence-based, requires human approval, does not auto-send, and
does not process payments.

## Architecture overview
A dependency-light TypeScript service: a control plane (tenants, auth, sessions,
routing) and per-tenant databases, an HTTP API (`apps/api/src/server.ts`), an AI
core with a degraded fallback, and a web UI. 35 modules, 52 test files, 29 tenant
migrations.

## Database-per-tenant
`packages/db/src/router.ts` (`withTenant`, `withTenantTx`, `getTenantPool`,
`resolveTenant`). Each tenant is a separate physical database — a different pool
means a different database, so cross-tenant access is structurally impossible.
Proof: `tests/isolation.test.ts` and the live `REPEATABILITY` block (distinct
tenant DBs, signal isolation).

## Control plane vs tenant plane
Control plane holds tenants/users/workspaces/members/routes; tenant plane holds
business data. No `ws_id` in tenant DBs; webhook tenant always resolved from the
connection server-side.

## Public routing
Public page read + tracking routes (`/p/:slug`, `/track/page-event[s]`) resolve
tenant server-side; invalid routes fail safely. Proof: `deploy:smoke`.

## Webhook routing
Tenant resolved from `connectionId` via the control plane; a configured secret is
fail-closed. Proof: live `SECURITY: webhook ... rejects a missing/wrong signature`.

## Auth / session / security
No `x-tenant-id` trust in production (dev opt-in only via `FNNLR_DEV_MODE`).
Proof: `SECURITY: x-tenant-id header does NOT grant access`, `spoofed x-tenant-id
grants nothing in production`.

## Data integrity
Idempotent event processing (ON CONFLICT), guarded row counts, per-step snapshots
for repairs. Proof: `tests/scaling.test.ts`, repair/command tests.

## Learning deduplication
Opportunities use a dedupe key; learning rates over decided outcomes only and
gates confidence by sample size. Proof: attribution/recommendation tests.

## Live DB validation
A real Postgres suite (`tests/live-db.test.ts`, 26 blocks; `tests/isolation.test.ts`)
covering provisioning, isolation, execution lock, go-live, operating room,
repeatability, scaling, webhook security. Run with `npm run test:pg`.

## CI / release checks
`scripts/ci.ts` (`npm run ci`) runs typecheck, unit tests, the commercial+proof
consistency checkers, the production-safety verify, and web/security checks, then
prints SAFE / NOT SAFE TO RELEASE.

## Backup / restore
`scripts/backup-restore.ts` (`db:backup`, `db:restore-test`, `db:verify-restore`)
— refuse without a DB URL, never print secrets, verify critical tables. Pure
`verifyRestore` tested both ways.

## Deployment lock
`modules/deployment` + `scripts/deploy.ts` — env template generated from
`ENV_SPEC`, a health gate (READY/DEGRADED/BLOCKED), a deploy smoke, and a
non-destructive-by-default rollback that never drops a tenant DB. Proof:
`tests/deployment.test.ts`.

## Repeatability
`modules/repeatability` proves a second customer through the same path. Proof:
`tests/repeatability.test.ts` + the live `REPEATABILITY` block.

## Known limits
Production CI must run `test:pg` against managed Postgres; a real backup/restore
drill is pending in the target environment; thresholds are defaults pending
telemetry. No real customer traction is claimed.
