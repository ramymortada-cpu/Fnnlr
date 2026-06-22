## fnnlr — Sprint 47 Report (Category Proof Pack)

This sprint turns everything built into a clear evidence pack for the customer, the team, the investor, and partners — proving fnnlr is a category-grade candidate built on real code, real tests, and honest limits. No new feature, no cosmetic deck, no marketing-only copy. Every claim is tied to a module, a test, a sprint report, a live-DB proof, a script, or an explicit limitation — and a proof checker fails the build on any over-claim.

**Result: 473 tests, 445 pass, 0 fail, 28 skip without a DB. `npm run ci` returns SAFE TO RELEASE (now running both the commercial and proof checkers). All 8 proof docs pass the proof checker (0 forbidden claims, 0 missing honesty markers). Every evidence-index citation points at a file/test that actually exists. Typecheck clean. Web balanced, no `x-tenant-id` trust.**

### 1. Evidence index (`docs/EVIDENCE_INDEX.md`)
The source of truth: every important claim mapped to evidence type, files/modules, tests, live-DB proof, limitation, and an honest confidence. Each citation was verified to point at a real file/module/test (no fabricated references). Examples: tenant isolation → `packages/db/src/router.ts` + `tests/isolation.test.ts` + live `REPEATABILITY`; no fake revenue → recommendation/attribution/operating-room rules, "known only when `payment_states.amount` exists"; repeatable setup → `modules/repeatability` + the live `REPEATABILITY` block.

### 2. Product proof (`docs/PRODUCT_PROOF.md`)
What fnnlr is and does — core loop, evidence-based funnel building, WhatsApp-first capture, manual-payment-aware ops, Revenue Desk, learning engines, activation/go-live/operating room, repeatability — plus an explicit "what fnnlr does not do" and known limits.

### 3. Technical proof (`docs/TECHNICAL_PROOF.md`)
Architecture with real citations: database-per-tenant, control vs tenant plane, public/webhook routing, auth/security, data integrity, learning dedup, the real-Postgres live suite, the one-command CI, backup/restore, the deployment lock, and repeatability — 35 modules, 52 test files, 29 migrations.

### 4. Security & trust proof (`docs/SECURITY_TRUST_PROOF.md`)
Tenant isolation, no `x-tenant-id` trust, encrypted + fail-closed credentials, fail-closed webhooks, command-apply approval, no auto-send, no payment processing, audit logs, and non-destructive rollback — each with the test that proves it.

### 5. Customer proof pack (`docs/CUSTOMER_PROOF_PACK.md`)
For the operator: what you get, the 7-day plan, what fnnlr watches, what we need from you, what it will not do automatically, how success is measured, what happens if blocked, how support works, the repeatability proof, and honest limits — no internal stack traces, no overclaim.

### 6. Investor / partner proof (`docs/INVESTOR_PARTNER_PROOF.md`)
Category thesis, wedge, product depth, the built (not promised) moat, safety as a feature, technical credibility, commercial readiness, and honest remaining risks — with **no fabricated TAM or traction** (any market number must be sourced externally; none is invented).

### 7. Competitive positioning (`docs/COMPETITIVE_POSITIONING.md`)
Honest comparison against ClickFunnels, GoHighLevel, HubSpot, ManyChat, Wati, Respond.io, and Systeme.io — explicitly stating where each is **stronger** (integrations, templates, billing, enterprise admin, ecosystem), then the wedge. fnnlr is positioned as different for one motion, not "better at everything."

### 8. Proof assets checklist (`docs/PROOF_ASSETS_CHECKLIST.md`)
Every asset with an honest status: reproducible command outputs marked "available"; screenshots marked "needs screenshot"; and customer results / traction / revenue / TAM marked **"must not fabricate"** — empty until real, consented data exists.

### 9. Proof checker (`modules/proof/src/checker.ts`)
Reuses the commercial `FORBIDDEN_CLAIMS` and adds proof-specific over-claims (enterprise-ready-without-limits, proven traction, thousands-of-customers, market-leader), plus required honesty markers (evidence-based, no guaranteed revenue, no auto-send, no payment processing, human approval, known limitations, live DB tests, customer responsibilities). It collapses soft-wraps into sentences and skips questions/headings/negations, so it passes honest copy and fails real over-claims. Wired into `npm run ci`.

### Tests
- `tests/proof.test.ts` (9): `isProofDoc` matches the right files; the checker catches fake-revenue, auto-send, and proven-traction claims; it passes honest negated copy; the evidence index maps claims to real tests/modules and states the revenue limitation; competitive positioning includes competitor strengths; customer + investor packs include limitations/risks and disclaim fabricated traction; the real proof set passes.
- `npm run proof:check` (CLI) — PASS on all 8 docs.
- All prior suites remain green; `ci` ties them together and now guards the proof docs too.

### Acceptance — all met
Evidence index ✓ · product proof ✓ · technical proof ✓ · security/trust proof ✓ · customer proof pack ✓ · investor/partner proof ✓ · competitive positioning ✓ · proof assets checklist ✓ · proof checker ✓ · tests green ✓ · no forbidden claims ✓ · no fake traction ✓ · no fake revenue ✓ · no new feature ✓ · report + bundle present ✓.

### Remaining risks (honest)
- The proof checker is heuristic — it catches the listed over-claims and marker gaps, not every misleading phrasing; new proof copy should still be human-reviewed and new patterns added as they arise.
- The proof pack contains no real customer data; "available" assets are reproducible command outputs, but screenshots and customer results require the real running app and a consenting customer, and are explicitly marked must-not-fabricate.
- Confidence ratings in the evidence index are the author's honest assessment, not an external audit; the "medium" items (deployment readiness, scaling thresholds) carry the caveat that a target-environment drill and real telemetry are still needed.
- Market-size / TAM figures are deliberately absent; if needed they must be sourced externally, never invented.

### Status
fnnlr now has a proof pack that stands on evidence, not adjectives: an evidence index tying every claim to a real module/test/limit, product/technical/security proofs with honest citations, customer/investor/partner packs that state limits and risks, a competitive positioning that credits competitors' strengths, an assets checklist that refuses fabrication, and a proof checker that fails the build on any forbidden claim. It proves what fnnlr is and does — and is equally clear about what it does not claim.
