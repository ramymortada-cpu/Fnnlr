# fnnlr — Sprint 18 Build Report (Repair Impact Measurement + Learning Loop)

fnnlr no longer just applies a repair — it **measures whether the repair worked, from observed data, and learns from it**. The loop is now **Before → Apply → Observe → Compare → Learn → Recommend**. Honest by construction: insufficient data → "awaiting more data"; weak movement → "early signal"; a real drop → "improved". Never fabricates impact. **167 tests, 165 pass, 0 fail, 2 skip. Typecheck clean. RTL premium.**

## What was built

### 1. Outcome interpreter (`modules/repairs/src/outcome-engine.ts`, pure & tested)
Given a repair type, baseline vs current metrics, and hours elapsed, it returns an honest status — `awaiting_data / early_signal / improved / no_change / worsened / inconclusive` — plus confidence, the metric delta, an Arabic interpretation, and a recommended next action. Per-type **minimum-data rules** gate every judgment: payment needs 24h, page CTA needs 48h **and** ≥30 new views, WhatsApp/tracking need real signal (replies/links/events). View-gated page repairs never call a rate change on too-few views a "signal" — they wait. Confidence is `high` only for a large primary move.

### 2. Outcomes service (`modules/repairs/src/outcomes.ts`)
`collectMetrics` gathers the exact metric bag per repair type from observed data (waiting-payment counts, clicked→contacted, replies-marked-sent, page view/CTA rates, tracked links + attribution coverage, overdue tasks, …) — used **identically** at baseline (apply time) and at measurement, so deltas are honest. `captureBaselineMetrics` snapshots at apply time. `measureOutcome` runs the interpreter, writes the outcome row + per-metric snapshots, and stores a **learning record** (repair type, market, success status, confidence, delta). `confirmOutcome` resolves the leak **only when the user confirms an improvement** (no auto mark-fixed). `listOutcomes`, `listFunnelOutcomes`, `outcomeSummary`, `learningAggregate`.

### 3. Data model (migration 0016)
`repair_outcomes` (status, baseline/current/delta metrics, interpretation, confidence, recommended next action, confirmed), `repair_metric_snapshots` (key/value/source), and `repair_learning_records` (type/market/product/funnel/success/confidence/delta) for the learning loop.

### 4. Leak Board + Repair panel integration
The repair panel now has a **"نتيجة الإصلاح"** section: status badge, confidence, before/after on the primary metric, interpretation, **📊 قِس النتيجة** / **أعِد القياس**, and — for an improvement — **أكّد النجاح واقفل التسريب**. A leak is never shown fixed automatically; only a confirmed improvement resolves it.

### 5. Action Center integration
New actions: **قيس نتيجة إصلاح** (applied but unmeasured, priority 72) and **إصلاح مفيش منه تحسّن** (no_change/worsened → build another, priority 78). Pending-approval and partially-applied repairs from Sprint 17 still surface.

### 6. Weekly Report integration
The report now includes a repairs rollup — **applied / improved / awaiting data / no change** — from observed outcomes, with an explicit "الأثر بيتقاس من البيانات المرصودة فقط — مفيش أرقام مفبركة" note. No fake ROI.

### 7. Learning loop (storage + basic aggregation)
Every measured outcome writes a structured learning record; `learningAggregate` rolls up by repair type × market × success status. No benchmark dashboard — just the structured foundation for future "payment recovery works better for InstaPay flows" insights.

### 8. API endpoints
```
POST /repairs/:id/outcomes/measure        measure / re-measure now
GET  /repairs/:id/outcomes                 outcome history
GET  /funnels/:id/repair-outcomes          latest per plan
GET  /funnels/:id/repair-outcomes/summary  rollup
POST /repair-outcomes/:id/confirm          confirm success → resolve leak
POST /repair-outcomes/:id/next-action      guidance for the next repair
```

## Tests added (11)
Payment awaiting_data / improved / early_signal / no_change · WhatsApp improved from movement · **page CTA waits for minimum views** · page CTA improved with enough views · tracking improved from attribution · **no fake improvement with zero data/time** · confidence strong only for a large move · outcome routes reject header tenant in production. (DB-backed measurement + learning storage run in the live suite.)

## Acceptance — all met
Every applied plan has a measurable outcome ✓ · manual Re-measure ✓ · outcome in repair panel ✓ · outcome on leak board ✓ · Action Center shows repairs needing measurement ✓ · Weekly Report mentions outcomes ✓ · **no fake impact** ✓ · minimum-data rules ✓ · status/confidence clear ✓ · learning records stored ✓ · tests green ✓ · RTL premium ✓ · no benchmark dashboard ✓ · no fabricated ROI ✓ · no auto action ✓.

## Strict prohibitions respected
No fake ROI · no declaring success without data · no big benchmark dashboard · no autonomous re-apply · no auto-send · no payment processing · no auto-deleting leaks (confirm-gated resolution only) · no docs-instead-of-code · no polish-only.

## Needs credentials only
Postgres for the 2 skipped live-DB tests and real measurement/learning persistence · `ANTHROPIC_API_KEY` optional.

## Next: Sprint 19 — surface learning benchmarks into the planner (evidence-weighted repair suggestions), or begin actual pilot onboarding.
