## fnnlr — Sprint 44 Report (Sales & Support Operating System)

This sprint turns fnnlr from a sellable offer into a **repeatable sell → deliver → support process** — so selling fnnlr and onboarding a customer no longer depends on the founder's or a developer's memory. No new product feature, no CRM, no billing, no intelligence loop. It is a light, code-backed operating layer built on the existing commercial docs and customer-zero tools, and it encodes the product's real limits (no auto-send, no payment processing, no guaranteed revenue) as hard disqualifiers.

**Result: 446 tests, 419 pass, 0 fail, 27 skip without a DB. Typecheck clean. Web balanced, no `x-tenant-id` trust. All 12 sales/commercial docs pass the consistency checker (0 forbidden claims, 0 missing honesty markers).**

### 1. Sales lead intake + fit scoring (`modules/sales-ops/src/fit.ts`, pure)
A typed intake schema (WhatsApp motion, traffic source, manual payment, offer clarity, response owner, expected automation/payment/guarantee, urgency, notes) and a pure `scoreFit` engine. **Strong fit requires** WhatsApp selling, a traffic source (or planned), a clear offer, manual/local payment, a response owner, and no expectation of auto-send or guaranteed sales. **Bad fit** if the lead expects guaranteed revenue, fully autonomous sales, payment processing, or has no traffic and no responder. The engine returns a fit score, category (`strong_fit` / `workable_fit` / `needs_configuration` / `bad_fit`), reasons, risks, the expectation resets a rep must perform, and the next action.

### 2. Proposal readiness (`proposalReadiness`)
Builds on the fit result. Returns `READY_TO_PROPOSE` / `NEEDS_DISCOVERY` / `DISQUALIFY` / `BLOCKED_BY_EXPECTATIONS`. It blocks on a forbidden-behavior expectation, disqualifies a bad fit, and lists exactly which required inputs are missing (offer type, funnel count, support level, launch timeline, responsibilities accepted, limitations acknowledged, success criteria accepted).

### 3. Handoff pack generator (`buildHandoffPack`)
From a qualified lead + chosen tier + ownership, it produces a setup checklist, a customer-zero config **draft**, and an execution manifest **draft** — with **explicit `<<MISSING — collect from customer>>` placeholders** for anything not yet collected. It never fabricates values and never claims fake readiness. It is `BLOCKED` if a critical owner is missing.

### 4. Ownership map (`checkOwnership`)
Six roles (sales, setup, support, customer response, payment confirmation, rollback). The five critical owners (setup, support, response, payment confirmation, rollback) must be named — a missing one **blocks** the handoff.

### 5. Support workflow (`modules/sales-ops/src/support-workflow.ts`)
A repeatable process on top of the existing audit-backed issue log (no ticket system): `intakeSupportIssue` validates and shapes an intake and **rejects a P0/P1 without an owner and a next action** (mirroring the issue-log guard), attaching a safe rollback note for P0; `reviewSupport` summarizes counts by severity and the open P0/P1 blockers for the week review.

### 6. Sales-to-activation workflow (`docs/SALES_OPERATING_SYSTEM.md`)
The 12 stages (discovery → qualification → expectation reset → proposal → agreement → config collection → setup → execution lock → go live → 72h monitor → week-1 review → continue/hold/disqualify), each with entry/exit criteria, owner, evidence, the script/doc to run, and the common blocker.

### 7. Consistency guard extended
`isCommercialDoc` now also matches the sales-ops docs (proposal, support workflow, operating system, handoff), so the same forbidden-claim / required-marker checker that guards the commercial docs guards the sales materials too. Verified: all 12 docs pass.

### 8. Docs + CLI
Docs: `SALES_OPERATING_SYSTEM.md`, `PROPOSAL_TEMPLATE.md`, `SALES_TO_ACTIVATION_HANDOFF.md`, `SUPPORT_WORKFLOW.md` — all customer-/operator-facing, all passing the checker, all restating the honest limits. CLI (`scripts/sales-ops.ts`): `sales:score`, `sales:proposal-check`, `sales:handoff`, `sales:proposal-draft`, `support:intake`, `support:review` — each prints a clear status, reasons, next action, and missing data.

### Tests
- `tests/sales-ops.test.ts` (13): strong fit scores correctly; bad fit for guaranteed-sales / auto-send / payment-processing expectations; bad fit for no-traffic + no-responder; proposal BLOCKED_BY_EXPECTATIONS, NEEDS_DISCOVERY (responsibilities), and READY_TO_PROPOSE; handoff uses placeholders not fake values; handoff BLOCKED on a missing critical owner; `checkOwnership` flags missing roles; support intake requires owner + next action for P0/P1; sales-ops docs pass the checker.
- All prior suites remain green (the commercial checker now covers 12 docs).

### Acceptance — all met
Sales lead intake schema ✓ · fit scoring engine ✓ · proposal readiness checker ✓ · handoff pack generator ✓ · support ownership map ✓ · sales-to-activation workflow ✓ · proposal template ✓ · support workflow ✓ · CLI scripts ✓ · consistency guard ✓ · tests green ✓ · no forbidden claims ✓ · no fake readiness ✓ · no fake revenue ✓ · no new feature ✓ · report + bundle present ✓.

### Remaining risks (honest)
- The fit score thresholds (strong ≥ 80, workable ≥ 55, needs-config ≥ 30) are sensible defaults without real sales telemetry; they are centralized in `fit.ts` and should be tuned against actual outcomes. The category logic — not the raw score — carries the hard disqualifiers, so a high score can never override a forbidden-behavior expectation.
- This layer is pure and file/CLI-driven by design; there is no pipeline database and no billing. That is intentional — it is an operating process, not a CRM.
- The proposal and agreement are drafts; the agreement still needs lawyer review (carried over from Sprint 43).
- The consistency checker is heuristic (it catches the listed over-claims and marker gaps); new sales copy should still be human-reviewed, and new patterns added as they arise.

### Status
fnnlr now has a clear sales & support operating system: it scores fit honestly and rejects leads who want what the product does not do, gates proposals on accepted responsibilities and acknowledged limits, generates a handoff with explicit placeholders instead of fake values, blocks a launch with no owner for a critical step, and runs support as a repeatable owner-assigned loop — all guarded by a consistency checker that fails the build on any forbidden claim. We accept the right customer, reject the wrong one, hand off setup without confusion, and run support from day one without false promises.
