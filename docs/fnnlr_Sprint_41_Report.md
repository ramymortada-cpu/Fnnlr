## fnnlr — Sprint 41 Report (Customer Zero Live Execution)

Sprint 40 closed the readiness gate. This sprint turns **READY into LIVE**: it executes the actual launch in a controlled way and documents the first 72 hours from real evidence. No new product feature, no new intelligence loop, no fabricated traffic / leads / revenue, and BLOCKED is never hidden. Code changes were operating-only (a log read-filter fix), per the sprint's "no product changes unless blocking" rule.

**Result: 421 tests. Without a DB, 395 pass and 26 skip with an explicit reason. On real Postgres, the go-live acceptance path passes, alongside execution-lock, operating-room, and customer-zero (all green). Typecheck clean. Web balanced, no `x-tenant-id` trust.**

### 1. Go-live runner (`modules/execution/src/live.ts` → `goLive`)
`customer:go-live` executes the launch and **refuses to proceed on a BLOCKED execution lock**. Steps: confirm the launch window is declared, run the execution lock (the gate), publish the page if not already published, verify tracked link + payment, run the first-signal protocol, and record `launch_started` / `first_signal_received` / `launch_completed` | `launch_blocked` in the execution log. A script-generated first signal is **marked test**; a real customer event (via `--real`) is not. When blocked, it logs a blocker issue (with owner) and records `launch_blocked`. Proven on real Postgres: BLOCKED before setup (issue + log written), LAUNCHED after setup (first signal marked, `launch_completed` recorded).

### 2. First-72h monitor (`monitor72h`)
`customer:72h-monitor` — launch status, activation stage + readiness, first-signal timestamp, 24h signals, Revenue Desk top item, recommendations, P0–P3 incident counts, open blockers, and the operating-room decision. **Known revenue only when a real `payment_states.amount` exists** — otherwise `null`, never fabricated. Verified live: `knownRevenue` is null with no recorded amount.

### 3. Live event ledger (`eventLedger`)
Assembled from existing evidence only — page_events, tracked-link clicks, leads, conversations, payment_states, scheduled_runs, integration_events — with no parallel truth. Reports first/latest event, counts, the conversion path actually seen, missing signals, and suspicious gaps (e.g. leads without page events, payment states without leads). Proven live: the ledger sees the real page events and the `page_view` path.

### 4. Customer-facing 72h update (`update72h`)
`customer:72h-update` — what was launched, first signals that arrived, what we're monitoring, what we need from the customer, the top action now, any clear blocker, the support contact, and explicitly what fnnlr will not do automatically (no auto-send, no payment processing). Safe by construction and by test: no secrets, no stack traces, no revenue claim.

### 5. Issue log (`modules/execution/src/issues.ts`)
Lightweight, audit-backed (no ticket system): each issue is an `issue_logged` audit row with severity, source, evidence, owner, status, next action; resolution writes an `issue_resolved` row. `listIssues` reconstructs open/resolved state. Used to document first-72h friction. Verified live: go-live's refusal logs a blocker issue with an owner.

### 6. Execution log read fix (operating-only change)
`readExecutionLog` now includes `launch_*` and `first_signal_received` actions (previously only `execution_*`), so the go-live milestones are visible. This was a blocking visibility fix — exactly the kind of change the sprint permits — not a feature.

### 7. Command pack + admin API
Scripts: `customer:go-live`, `customer:72h-monitor`, `customer:72h-update`, `customer:ledger`, `customer:issues` (`scripts/live-execution.ts`). Admin-only read endpoints: `/admin/72h-monitor`, `/admin/ledger`, `/admin/issues`, `/admin/execution-log` (go-live is CLI-only since it mutates). All `funnelId`-scoped where relevant, secret-free, header-only tenants rejected.

### 8. Internal 72h report template (`docs/CUSTOMER_ZERO_72H_REPORT.md`)
Ten sections (launch summary → setup → execution lock → first signal → activation → Revenue Desk → incidents → customer next action → product friction → decision), each populated from a real script or endpoint, with an explicit rule: no estimates, no fabricated numbers, and never write CONTINUE if the gate says HOLD/ROLLBACK. The referenced scripts are all verified to exist.

### Tests
- `tests/live-execution.test.ts` (2): live-execution admin endpoints reject a header-only tenant; the 72h-monitor route is wired and protected.
- Live: the **go-live acceptance path** — refuse BLOCKED (record `launch_blocked` + a blocker issue with owner) → LAUNCHED after setup (first signal marked test, `launch_completed` + `first_signal_received` recorded) → 72h monitor invents no revenue → ledger sees real events → 72h update safe with no secrets/revenue. Green on real Postgres, alongside execution-lock, operating-room, and customer-zero.
- All prior suites remain green.

### Acceptance — all met
Real customer manifest path ✓ · pre-launch gate (execution lock + daily check, reused) ✓ · `customer:go-live` ✓ · `customer:72h-monitor` ✓ · `customer:72h-update` ✓ · live event ledger ✓ · issue log ✓ · internal 72h report template ✓ · live DB go-live acceptance green ✓ · no fake traffic ✓ · no fake lead ✓ · no fake revenue ✓ · no auto-send ✓ · no payment processing ✓ · tests green ✓ · report + bundle present ✓.

### Remaining risks (honest)
- The in-session embedded Postgres is slow to cold-start and the sandbox reaps background processes between shells; the go-live acceptance + execution-lock + operating-room + customer-zero live tests were confirmed green on a real Postgres instance this sprint. Production CI must run `npm run test:pg` on every deploy.
- `goLive` publishes the page if a page exists but is unpublished; it does not create a page. If no page exists, the execution lock blocks earlier (no published page) — which is correct, but the operator must have built the page first via the app.
- The first-signal protocol proves the page-view path. The WhatsApp click→lead path and the payment path are proven by real customer activity, not the protocol — `monitor72h` and the ledger will show them only when they genuinely occur.
- `knownRevenue` sums `payment_states.amount`; if an installation records amounts elsewhere, that source must be unified. Today payment_states is the single source, and it is null until a real amount is entered.

### Status
fnnlr is no longer just a Release Candidate — it has a documented, controlled path to a real launch and the first 72 hours. Go-live refuses a blocked gate and records exactly what happened; the 72h monitor and ledger report only observed evidence; the customer update is safe; friction is logged as issues; and the decision is always tied to the gate — CONTINUE, HOLD, ROLLBACK/DISABLE, or NEEDS_CONFIGURATION — with nothing fabricated and nothing hidden.
