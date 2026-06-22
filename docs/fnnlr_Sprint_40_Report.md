## fnnlr — Sprint 40 Report (Customer Zero Execution Lock)

Sprint 38 built the deployment pack; Sprint 39 built the operating room. This sprint closes the **practical execution** of the first real customer — from a real config to a real signal to a real decision — without relying on a developer's memory. No new product features, no new intelligence loop, no parallel truth: the execution lock composes the checkers that already exist and claims readiness only when all of them agree.

**Result: 418 tests. Without a DB, 393 pass and 25 skip with an explicit reason. On real Postgres, the execution acceptance path passes, alongside operating-room, customer-zero, and release smoke (all green). Typecheck clean. Web balanced, no `x-tenant-id` trust.**

### 1. Execution manifest + validator (`modules/execution/src/manifest.ts`, `customer-zero.execution.example.json`)
The execution manifest extends the customer config with launch-day fields: customer name, WhatsApp provider status (`manual_link_only` / `webhook_connected` / `pending_bsp`), payment kind, first funnel name, page slug, traffic source, launch window, support owner, rollback owner. It carries **no secrets**. `validateExecutionManifest` is stricter than the base config — it additionally requires support owner, launch window, and payment instructions, and validates the provider status — so a launch never proceeds on a half-filled manifest. `safeManifestEcho` masks the WhatsApp number and drops anything secret-like.

### 2. Execution lock — the final gate (`executionLock`)
Composes, in one call: the release checker, manifest validation, customer-setup existence, activation launch-readiness, explicit page/link/payment presence, the operating-room decision (no P0, not ROLLBACK), and support-snapshot safety. Returns `READY | WARN | BLOCKED` with a per-check breakdown. **BLOCKED on any fail; WARN on needs-config / hold / P2; READY only when everything is clean.** Proven on real Postgres: BLOCKED before publish (naming the exact missing steps), READY/WARN after publish + link + payment, and idempotent across consecutive runs with no state change.

### 3. Launch check (`launchCheck`)
The executable launch checklist across five sections — environment (DB, encryption, cron), customer (workspace/business/tenant/funnel), funnel (offer/page/published/link/payment), signals (page event, lead), and operating room (no P0, daily-check status). Each item is ok/warn/fail with a clear message; the section view makes the gap obvious.

### 4. First-signal protocol (`firstSignal`)
Ingests the first controlled event and verifies it appears across page_events, activation, Revenue Desk, and the operating-room daily check. A script-generated signal is **marked as a smoke test** (`smoke:first-signal`, identifiable and removable); a real customer event arriving through the normal ingest path is **not** marked. It never creates fake revenue or payment state.

### 5. Customer-facing launch summary (`launchSummary`)
Safe to send to the customer: what's configured, what's live, what we need from you, what we're monitoring, the first next action, the support contact, and — explicitly — what fnnlr will not do automatically (no auto-send WhatsApp, no payment processing). No stack traces, no secrets, no fake results. Verified by test: the summary leaks nothing and claims no revenue.

### 6. Execution log (`modules/execution/src/log.ts`)
Lightweight traceability written to the existing `audit_events` table (no new workflow system, no parallel truth): config validated, setup verified, lock checked, launch checked, first signal, decision, blocker found, rollback used. Readable via `/admin/execution-log` (admin-only). Details are safe — no secrets.

### 7. Command pack + admin API
Scripts: `customer:execution-verify`, `customer:execution-lock`, `customer:launch-check`, `customer:first-signal`, `customer:launch-summary` (`scripts/execution.ts`). Admin-only endpoints: `/admin/launch-check`, `/admin/execution-log` (the lock/first-signal/summary are CLI-driven for launch operators). All `funnelId`-scoped, secret-free, header-only tenants rejected.

### 8. Launch Day runbook (`docs/CUSTOMER_ZERO_LAUNCH_DAY.md`)
Before / during / if-blocked / after, each step a real command, every referenced script verified to exist in `package.json`. Hard rules restated: no auto-send, no payment processing, no demo data, never tell the customer a BLOCKED status is fine, manual DB edits forbidden as a normal path.

### Tests
- `tests/execution.test.ts` (9): complete manifest passes; missing support owner / launch window / payment instructions / public-URL-in-prod block; invalid WhatsApp number and invalid provider status block; safe echo masks the number and carries no secrets; admin endpoints reject a header-only tenant.
- Live: the **execution acceptance path** — validate → setup → lock BLOCKED before publish (exact missing steps) → publish + link + payment → lock READY/WARN → idempotent rerun → first-signal (marked test, seen in page_events + activation) → real lead → daily-check decision (not ROLLBACK) → launch summary safe with no revenue claim. Green on real Postgres, alongside operating-room, customer-zero, and release smoke.
- All prior suites remain green.

### Acceptance — all met
Execution manifest ✓ · config validator ✓ · `customer:execution-lock` ✓ · `customer:launch-check` ✓ · `customer:first-signal` ✓ · `customer:launch-summary` ✓ · launch day runbook ✓ · execution log ✓ · live DB execution acceptance green ✓ · no fake revenue ✓ · no fake readiness ✓ · no demo data ✓ · no auto-send ✓ · no payment processing ✓ · tests green ✓ · report + bundle present ✓.

### Remaining risks (honest)
- The in-session embedded Postgres is slow to cold-start and the sandbox reaps background processes between shells; the execution acceptance + operating-room + customer-zero + release smoke live tests were confirmed green on a real Postgres instance this sprint. Production CI must run `npm run test:pg` on every deploy.
- The execution lock folds in the operating-room decision; WARN can therefore reflect a benign "launch-ready but no traffic yet" state. That is intended (WARN proceeds), but operators should read the per-check breakdown, not just the headline, before launching.
- The lock and launch-check are CLI/admin-only by design; there is no customer-facing launch button. For a controlled Customer Zero that is correct — launch is operator-driven.
- `firstSignal` proves the page-view path end to end; it deliberately does not synthesize a WhatsApp inbound or a payment (no fake success). The click→lead and payment paths are proven by real customer activity, not the protocol.

### Status
The first real launch is now locked: a validated manifest, a final execution gate that only says READY when the release checker, activation, operating room, and support snapshot all agree, an executable launch checklist, a marked first-signal protocol, a safe customer-facing summary, an audit-backed execution log, and a launch-day runbook of real commands — with BLOCKED always surfaced and never overridden, and no fabricated traffic, revenue, or readiness anywhere in the path.
