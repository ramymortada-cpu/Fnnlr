## fnnlr — Sprint 38 Report (Customer Zero Deployment Pack)

This sprint makes running the **first real customer** a controlled, repeatable, supportable operation — from config to first live signal to monitoring to weekly review — with no improvisation, no DB hacking as a normal path, no demo data, and no fake success. No new product features.

**Result: 395 tests. Without a DB, 372 pass and 23 skip with an explicit reason. On real Postgres, the Customer Zero acceptance path passes, alongside the release smoke, activation, and security live tests (all green). Typecheck clean. Web balanced, no `x-tenant-id` trust.**

### 1. Customer config + validator (`modules/customer-zero/src/config.ts`, `customer-zero.config.example.json`)
A declarative customer description (workspace, owner, business, market/language, WhatsApp number, offer basics, payment instructions, public URLs, support owner, allowed integrations) that **contains no secrets** — keys/tokens are env-only, the owner password is passed separately. `validateCustomerConfig` is production-aware: missing business name / owner email is a hard fail; missing public URL fails in production; missing payment method blocks activation (fail in prod, warn in dev); an invalid WhatsApp number fails; and any secret-looking field key is rejected. `safeConfigEcho` masks the WhatsApp number to its last four digits and omits anything sensitive.

### 2. Idempotent setup runner (`modules/customer-zero/src/setup.ts`)
`setupCustomerFromConfig(cfg, ownerPassword, { production })` stands up a real customer: user → dedicated tenant DB → workspace → owner membership → business → first funnel (with an empty offer shell and one blueprint stage — real empty records, **not fabricated copy**) → payment method. It is **idempotent**: re-running reuses the user (by email), workspace (by owner-membership + name), business (by name in tenant), and funnel (first existing), and only creates a payment method if absent. Proven on real Postgres: a second run produces zero duplicate workspace/business/funnel/payment rows.

### 3. Smoke runner (`modules/customer-zero/src/smoke.ts`)
`smokeCustomer(tenantId, funnelId)` verifies the pipe end to end: tenant health, page publish status, tracked link, a **test-marked** page-view ingestion (`visitor = smoke:customer-zero`, identifiable and removable via `cleanupSmoke`), activation status, and Revenue Desk mode. It never fabricates revenue, payments, or opportunities — the desk stays in activation mode (no fake opportunities) until real signals exist.

### 4. Support snapshot + release decision (`modules/customer-zero/src/support.ts`)
`customerSnapshot` gives support a one-call triage view: activation stage + readiness + next action, Revenue Desk top item, live-signal counts, errors/webhook-failures/retries/scheduled-runs over 24h, recommendations, outcomes measured — **counts and statuses only, never secrets, never a revenue claim**. `releaseDecision` wraps the release checker into a clear `READY_FOR_CUSTOMER_ZERO` / `BLOCKED` with blocking issues, warnings, manual steps, next action, and owner.

### 5. Command pack (`scripts/customer-zero.ts`, npm scripts)
`deploy:check` · `customer:verify <cfg>` · `customer:create <cfg> <pass>` · `customer:smoke <tid> <fid>` · `ops:customer <tid> <fid>`. Each prints PASS/FAIL + a next action, exits non-zero on failure, and never prints secrets. Plus an admin-only `GET /admin/customer-snapshot?funnelId=` endpoint.

### 6. Support runbook + disable controls (`docs/CUSTOMER_ZERO_RUNBOOK.md`)
The full Customer Zero checklist (pre-deployment → setup → first live signal → monitoring → weekly review), a first-week support playbook (daily checks; webhook-failure triage; activation-stuck triage; customer-reports-issue collection), and rollback/disable controls — each backed by a real mechanism, verified against the code: global job kill-switch (`FNNLR_DISABLE_JOBS`), per-connection outbound pause (`webhook_deliveries.paused`, respected by the retry worker), integration disconnect (`deleteConnection`, which removes stored credentials), session revoke, safe funnel archive (`journeys.deleted_at` soft delete), and last-resort `delete-tenant`. No destructive delete by default.

### 7. Customer Zero acceptance test (live, real Postgres)
From a clean control DB: read + validate config → setup → **rerun setup and confirm idempotency** (no duplicate business/funnel/workspace/payment) → publish page + tracked link → smoke (test-marked event present and identifiable) → real lead → **activation progresses** (traffic/lead ready) → support snapshot returns a safe summary with **no secret leak and no revenue claim**. All on real records.

### Tests
- `tests/customer-zero.test.ts` (8): config validation (missing business name, missing public URL in prod, payment fail-in-prod/warn-in-dev, secret-looking fields rejected, invalid WhatsApp, complete config passes), safe echo masks the WhatsApp number and leaks nothing, and the customer-snapshot endpoint is admin-only / rejects a header-only tenant.
- Live: the **Customer Zero acceptance path** + release smoke + activation + security — all green on real Postgres.
- All prior suites remain green.

### Acceptance — all met
Config template ✓ · config validator ✓ · setup runner ✓ · setup runner idempotent ✓ · smoke runner ✓ · support snapshot ✓ · support runbook ✓ · rollback/disable controls ✓ · live acceptance test green ✓ · no demo data ✓ · no fake revenue ✓ · no fake readiness ✓ · no auto-send ✓ · no payment processing ✓ · tests green ✓ · report + bundle present ✓.

### Remaining risks (honest)
- The in-session embedded Postgres is slow to cold-start and the sandbox reaps background processes between shells; the Customer Zero acceptance + release smoke + activation + security live tests were confirmed green on a real Postgres instance this sprint. Production CI must run `npm run test:pg` and `npm run deploy:check` on every deploy.
- The setup runner targets a single-business individual workspace (the Customer Zero shape). Agency onboarding (many businesses under one workspace) is supported by the data model and reuse logic but is not yet a one-shot config.
- Disable controls are operational (env flags, status columns, soft delete, scripts) rather than a single admin UI; that is intentional for a controlled first deployment and documented as such.
- The smoke runner creates a marked page view to prove ingestion; it deliberately does not synthesize a lead or payment (no fake success) — lead/payment readiness is proven by real customer activity, not the smoke.

### Status
fnnlr can now onboard its first real customer from a config file in a repeatable, guarded way: validated config, idempotent setup, a test-marked smoke that proves the pipe without faking outcomes, an admin-only support snapshot that never leaks secrets, a script-backed runbook with real disable/rollback controls, and a live acceptance test on real Postgres — with every step grounded in observed evidence and blocking issues always surfaced, never hidden.
