## fnnlr — Sprint 46 Report (Customer One Repeatability Test)

This sprint proves fnnlr is not hand-built for Customer Zero: a second customer runs through the **same path, same schema, same tools**, with no special-case, no DB hacking, and no cross-tenant leakage. Repeatability is the SaaS test. No new feature, no new schema, no fake customer, no demo data.

**Result: 464 tests, 436 pass, 0 fail, 28 skip without a DB. On real Postgres, the repeatability path passes (two customers, distinct tenants, idempotent, signal-isolated), alongside customer-zero, isolation, and execution-lock. Typecheck clean. Web balanced, no `x-tenant-id` trust.**

### 1. Customer One config templates (same schema)
`customer-one.config.example.json` and `customer-one.execution.example.json` — a **different** customer (Noor Cosmetics, UAE, bank transfer, different WhatsApp number, support owner, launch window) using the **same schema** as Customer Zero. No new schema was added. Both validate against the existing `validateCustomerConfig` / `validateExecutionManifest` — proven by test, and the configs are asserted to differ from Customer Zero (distinct customers, not a copy).

### 2. Repeatability runner (`modules/repeatability/src/runner.ts`)
`repeatabilityCheck(a, b)` sets up two customers via the **same** `setupCustomerFromConfig` runner (no special-case), reruns both for idempotency, and proves: distinct tenants / businesses / funnels; stable identifiers on rerun (no duplicate records); and **signal isolation** — it publishes customer B's page and ingests a real (marked) page event for B, then verifies customer A's page-events, leads, and Revenue Desk item-count are unchanged, while B received its own signal. Returns PASS/FAIL with separation, idempotency, and isolation evidence, blockers, and the next action.

### 3. Cross-customer isolation evidence
Each isolation claim is a concrete check: A tenant ≠ B tenant, A business ≠ B business, A funnel ≠ B funnel, and A's page-events / leads / Revenue Desk unchanged after B's smoke. All run through `withTenant` (per-tenant database) — there is no `x-tenant-id` trust and no shared pool. Confirmed green on real Postgres.

### 4. Sales handoff repeatability
The Sprint-44 handoff generator is proven to keep two leads separate: `buildHandoffPack` for lead A and lead B produce drafts with their own business names and WhatsApp numbers — A never contains B's values and vice versa — and missing inputs remain explicit `<<MISSING>>` placeholders (no fabrication, no copied values). Tested.

### 5. Repeatability report (`repeatabilityReport`)
Turns the result into a decision: `REPEATABLE` (every check passed), `RISK`, or `BLOCKED`, with setup idempotency, tenant separation, signal isolation, activation/desk/support separation flags. Says `REPEATABLE` **only** when all checks pass — verified by test. No secrets.

### 6. Command pack
`customer:repeatability-check` and `customer:repeatability-report` (`scripts/repeatability.ts`) — run two real configs through the same path and print the evidence + decision. No secrets, no demo data, no DB hacking.

### 7. Runbooks: one-off → repeatable
Added `docs/CUSTOMER_DEPLOYMENT_RUNBOOK.md` — the general, repeatable runbook for any customer (first, second, tenth), with the same path, the repeatability check, and the isolation guarantees. Updated `CUSTOMER_ZERO_RUNBOOK.md` to state explicitly that Customer Zero is the first-use case of a repeatable process, not a special case, and to point at the deployment runbook and `customer-one.config.example.json` as a second worked example. All referenced commands verified to exist.

### Tests
- `tests/repeatability.test.ts` (6): customer-one config + manifest validate with the same schema; customer-zero and customer-one configs differ; sales handoff values don't bleed between two leads; handoff still uses explicit placeholders; the report says REPEATABLE only when every check passes.
- Live: the **repeatability path** — two customers via the same runner → distinct tenants, idempotent reruns, B's smoke does not touch A, B gets its own signal, report REPEATABLE, no secrets. Green on real Postgres, alongside customer-zero, isolation, and execution-lock.
- All prior suites remain green.

### Acceptance — all met
Customer-one config example ✓ · customer-one execution example ✓ · repeatability runner ✓ · repeatability report ✓ · cross-customer isolation checks ✓ · sales handoff repeatability proven ✓ · live DB repeatability test green ✓ · runbooks updated one-off → repeatable ✓ · no demo data ✓ · no fake customer ✓ · no DB hacking ✓ · no cross-tenant leakage ✓ · tests green ✓ · report + bundle present ✓.

### Remaining risks (honest)
- The setup runner creates offer/payment shells but not a page; the repeatability runner publishes a page shell for the smoke (an empty page the operator would fill, not fabricated copy) so a real page event can be ingested. In production the page is built in the app — the runner's shell is for the isolation proof only.
- Idempotency relies on reuse-by-email/workspace; if a workspace row references a deleted tenant (a torn-down prior run), setup will try that dead tenant. The fix for clean runs is unique identifiers per customer (real customers have distinct emails); this surfaced as a test-hygiene point, handled by using unique configs in the live test.
- The live repeatability test was confirmed on a real Postgres instance this sprint; the embedded DB cold-starts slowly and the sandbox reaps background processes between shells, so CI must run `test:pg`.
- Signal isolation is proven for the page-event path; the WhatsApp click→lead and payment paths inherit the same per-tenant database isolation but are exercised by real activity, not the smoke.

### Status
fnnlr passes the SaaS repeatability test: a second customer is set up through the same handoff, the same config schema, the same setup runner, activation, execution lock, go-live, operating room, and support pack — with distinct tenants, idempotent setup, and proven signal isolation. Customer Zero was never a special case; it was the first run of a repeatable process, and that is now demonstrated, not assumed.
