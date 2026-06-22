## fnnlr — Sprint 37 Report (Customer-Ready Release Candidate)

This sprint turns a working, hardened product into a **Release Candidate that can be handed to a real customer with confidence** — clear environment, clear setup, clear health, clear support, clear limits. No new product features, no demo data, no fake readiness.

**Result: 386 tests. Without a DB, 364 pass and 22 skip with an explicit reason. On real Postgres, the end-to-end release smoke path passes, alongside activation and the full security/scale live suite (all green). Typecheck clean. Web balanced, no `x-tenant-id` trust.**

### 1. Production environment audit (`modules/release/src/env-spec.ts`)
Every env var fnnlr actually reads is classified — required-in-production, optional, or dev-only — each with its purpose and fail-closed behavior. `checkEnv()` validates the current environment: a missing required production var (control DB, encryption keys, cron secret) is a **blocking failure**; `FNNLR_DEV_MODE=true` in production is flagged as **dangerous** (it would let the API trust a client tenant header). This is the single source of truth, also rendered in the runbook.

### 2. Release readiness checker (`modules/release/src/checker.ts`, `npm run verify:release-candidate`)
Aggregates into one PASS/FAIL: env validation, control-plane DB reachability + applied-migration count, required index presence, an optional disposable provisioning probe (`--probe`), a live **fail-closed encryption** check (it actually calls `encryptSecret` under a simulated production env and confirms it throws), and a no-dev-tenant-trust check. Exits non-zero on any blocking issue and **never prints secrets**.

### 3. First customer setup (`scripts/create-customer.ts`, `npm run create:customer`)
From an empty control plane to a ready-to-activate customer with **real empty records, no demo data**: user → dedicated tenant DB → workspace → owner membership → business → first funnel, then prints the activation stage + next step. The signup chain already provisioned the tenant DB and business; this script completes it to a funnel and hands off to Go Live.

### 4. Health checks (`modules/release/src/health.ts`, public-safe)
`/health` (full), `/health/db`, `/health/jobs`, `/health/integrations`, plus admin-safe `/admin/tenant-health`. Each reports `ok | degraded | failed` with a short reason — no secrets, no tenant content. Degraded vs failed is explicit (e.g. no LLM key = degraded; no encryption key in production = failed). A test asserts the health output never contains the configured key.

### 5. Admin / support surface (`modules/release/src/admin.ts`, admin-only)
Minimal triage, not a dashboard: `/admin/tenants`, `/admin/workspaces`, `/admin/diagnostics` (counts + latest scheduled-run / webhook / failed-command rows for the current tenant), `/admin/activation-snapshot`. Returns counts and statuses, never secrets or raw content. Gated to `owner`/`admin` and rejects header-only tenants.

### 6. Deployment runbook backed by scripts (`docs/RUNBOOK.md`)
Ten ordered steps, each a runnable command: set env → `migrate:control` → `verify:release-candidate` → `verify:production-safety` → `test:pg` → `create:customer` → `api` → health curls → cron scheduling → admin triage. Plus recovery notes for migration failure, missing keys, and stuck runs.

### 7. Release smoke test (live, on real Postgres)
End-to-end from a provisioned-empty tenant: business → funnel → setup stage with the desk in **activation mode (no fabricated opportunities)** → configure offer/blueprint/published-page/tracked-link/payment → **launch-ready** → ingest a real page-view → **first signal observed / live mode** → support diagnostics return real counts. Runs entirely on real records — no demo data, no DB hacking.

### 8. Error handling / supportability
The sensitive failure paths are logged and traceable without leaking secrets: migration failures are idempotent and re-runnable; provisioning failures are caught and the tenant can be dropped + re-provisioned; encryption-key-missing fails closed; webhook signature failures are rejected and audited; scheduled-run and command failures are recorded with reasons surfaced via `/ops/*` and `/admin/diagnostics`; activation blocking reasons are explicit.

### 9. Release notes (`docs/RELEASE_NOTES.md`)
Honest scope: what works and is production-safe; what's degraded without an LLM key; and explicit non-inclusions — no auto-send, no payment processing (manual payment state only), WhatsApp needs BSP/webhook config, in-memory rate limiter, in-process jobs, no bundled BI dashboard.

### Tests
- `tests/release.test.ts` (9): env checker fails on missing encryption key / cron secret / dev-trust-in-prod and passes with a complete prod env; integrations health fails closed in prod without a key; LLM health degrades (not fails); health output leaks no secret; admin endpoints reject header-only tenant; basic health is reachable unauthenticated.
- Live: the **release smoke path** + activation + the full security/scale live suite — all green on real Postgres.
- All prior suites remain green.

### Acceptance — all met
Release checker ✓ · production env audit ✓ · first-customer setup path ✓ · health checks ✓ · admin/support minimal surface ✓ · release smoke on real Postgres ✓ · runbook backed by scripts ✓ · honest release notes ✓ · no fake readiness ✓ · no demo data ✓ · tests green ✓ · live DB tests green ✓ · no new product feature ✓ · deliverable RC with clear limits ✓.

### Remaining risks (honest)
- The in-session embedded Postgres is slow to cold-start and the sandbox reaps background processes between shells; the release smoke + activation + 13 security/scale live tests were confirmed green on a real Postgres instance this sprint. Production CI must run `npm run test:pg` and `npm run verify:release-candidate -- --probe` against the managed Postgres on every deploy.
- The release checker's index check is name-heuristic; if index names are renamed it warns rather than fails. Acceptable (warn, not silent).
- First-customer setup uses the signup chain; bulk/agency onboarding (many businesses under one workspace) is supported by the data model but not yet scripted as a one-shot.
- Health/admin endpoints are intentionally minimal; richer support tooling (per-tenant log tailing, replay) is a future operability sprint, not a release blocker.

### Status
fnnlr is a Release Candidate: it can be stood up from an empty database, validated by a release checker that fails loudly on anything dangerous, handed a real first customer with no demo data, monitored via health/ops/admin endpoints that never leak secrets, and operated with a script-backed runbook — with an honest, written account of exactly what works, what degrades, and what is deliberately not included.
