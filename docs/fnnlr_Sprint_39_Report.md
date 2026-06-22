## fnnlr — Sprint 39 Report (Customer Zero Operating Room)

Sprint 38 made it possible to deploy the first real customer. This sprint makes the **first operating week** controlled: what to watch daily, when a customer is healthy vs blocked, when to escalate, how to triage webhook/payment/tracking/activation issues, how to write a first-week review, and how to decide go / hold / rollback — all backed by code and scripts, not prose. No new product features, no new intelligence loop, no parallel truth: every output is composed from the evidence surfaces that already exist.

**Result: 408 tests. Without a DB, 384 pass and 24 skip with an explicit reason. On real Postgres, the operating-room smoke path passes, alongside customer-zero, release smoke, and activation (all green). Typecheck clean. Web balanced, no `x-tenant-id` trust.**

### 1. Incident classifier (`modules/operating-room/src/incidents.ts`, pure)
Rule-based severity from observed evidence. **P0** (critical): control DB unreachable, dev tenant-trust enabled in production, encryption not failing closed in production, release checker failing in production. **P1** (customer blocked): Revenue Desk empty despite real leads/payments, WhatsApp clicks with no lead created, jobs failing repeatedly. **P2** (degraded): LLM fallback, accumulating retries, recent webhook failures. **P3** (informational): no traffic yet, no payment states yet, insufficient evidence for recommendations. Every incident carries reason, evidence, suggested fix, owner, and a safe rollback/disable option — and points at a real signal, never an invented one.

### 2. Decision gate (`modules/operating-room/src/decision.ts`, pure)
`CONTINUE` (healthy, activation progressing, no P0/P1) · `HOLD` (launch-ready but a real flow is broken — a P1) · `ROLLBACK_OR_DISABLE` (any P0 — security/availability/corruption) · `NEEDS_CONFIGURATION` (activation not launch-ready: missing page/link/payment/public URL). Confidence is honest: CONTINUE is `high` only when signals are actually flowing, `low` when merely launch-ready with no traffic. The gate never returns CONTINUE while a P0/P1 or missing config is open.

### 3. Operating Room service (`modules/operating-room/src/service.ts`)
Composes the existing surfaces — `fullHealth`, `runReleaseChecker`, `getActivationStatus`, `customerSnapshot`, `getRevenueDesk`, and scoped ops counts — into one `OperatingEvidence`, with no duplicate storage. On top of it:
- **`dailyCheck`** → `PASS | WARN | BLOCKED` with activation stage/score, 24h signals, desk top item, recommendations/outcomes, the full incident list, highest severity, the gate decision, and the next action.
- **`customerStatus`** → a safe, plain customer-facing summary (configured / signals arrived / still missing / what fnnlr is watching / next action / needs-customer-input) with no stack traces, no secrets, no fake results.
- **`week1Review`** → activation stage, first-signal timestamp, totals, top desk items, recommendations, actions applied, outcomes measured, incidents, unresolved blockers, a data-quality assessment, and the decision. `knownPaymentAmount` is `null` unless a real recorded amount exists — **revenue is never invented**.
- **`triage`** → for nine issue types (activation_stuck, no_page_events, no_whatsapp_leads, webhook_failure, payment_state_issue, revenue_desk_empty, recommendation_missing, login_issue, jobs_failed): concrete diagnostic checks, a probable cause, a safe next action, and an explicit `manualDbEdit: forbidden | emergency_only`.

### 4. Command pack + admin API
Scripts: `customer:daily-check`, `customer:triage`, `customer:status`, `customer:week1-review` (`scripts/operating-room.ts`). Admin-only endpoints: `/admin/daily-check`, `/admin/customer-status`, `/admin/week1-review`, `/admin/triage` (all `funnelId`-scoped, `NO_STORE`, gated to owner/admin, header-only tenants rejected). No secrets in any output.

### 5. Evidence retention — no parallel truth
The operating room creates no new tables and no second source of truth. It reads activation, support snapshot, ops, health, integration events, scheduled runs, revenue desk, and recommendations/outcomes — the same records the rest of fnnlr already trusts.

### Tests
- `tests/operating-room.test.ts` (12): P0 for DB-unreachable / dev-trust-in-prod / encryption-not-fail-closed; P1 for clicks-without-leads and repeated job failures; P2 for degraded LLM; P3 for no-traffic; decision gate CONTINUE / NEEDS_CONFIGURATION / HOLD / ROLLBACK; admin endpoints reject header-only tenant.
- Live: the **operating-room smoke path** — daily check is WARN/BLOCKED before setup (gate NEEDS_CONFIGURATION), customer status leaks no secrets, then CONTINUE after launch-ready + a real signal, and week1 review records the real first-signal timestamp while inventing no revenue. Green on real Postgres, alongside customer-zero, release smoke, and activation.
- All prior suites remain green.

### Acceptance — all met
Daily check ✓ · incident classifier ✓ · support triage ✓ · customer-facing status ✓ · first-week review ✓ · decision gate ✓ · admin endpoints + scripts ✓ · no secrets in output ✓ · no fake revenue ✓ · no fake success ✓ · tests green ✓ · live DB smoke green ✓ · no new feature ✓ · no demo data ✓.

### Remaining risks (honest)
- The in-session embedded Postgres is slow to cold-start and the sandbox reaps background processes between shells; the operating-room smoke + customer-zero + release smoke + activation live tests were confirmed green on a real Postgres instance this sprint. Production CI must run `npm run test:pg` on every deploy.
- Incident thresholds (e.g. jobFailures24h ≥ 3, retriesPending ≥ 10) are sensible defaults chosen without production telemetry; they should be tuned against real first-week data and are centralized in the classifier for easy adjustment.
- The decision gate is intentionally conservative: it prefers HOLD/NEEDS_CONFIGURATION over CONTINUE when evidence is ambiguous. That can produce a "false hold" when a customer is fine but quiet; the `confidence: low` CONTINUE path mitigates this for the launch-ready-no-traffic case.
- `week1Review.actionsApplied` reads applied recommendations for the funnel; if an installation tracks applied actions elsewhere, that count should be unified — today it uses the recommendation table as the single source.

### Status
The first real customer is no longer left to the system alone. fnnlr now has an operating room for the first week: it watches (daily check), classifies (P0–P3 incidents), triages (nine issue types with safe next actions), summarizes for the customer without leaking anything, reviews the week without inventing revenue, and decides — CONTINUE, HOLD, ROLLBACK/DISABLE, or NEEDS_CONFIGURATION — always grounded in real evidence, with blocking issues surfaced and never hidden.
