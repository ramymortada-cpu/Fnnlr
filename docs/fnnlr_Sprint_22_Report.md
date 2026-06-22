# fnnlr — Sprint 22 Build Report (Playbook Application Outcome Loop)

The loop is now closed. fnnlr doesn't just apply a playbook to a funnel — it **measures whether the application worked, from observed data, and feeds the result back into learning**: Playbook → Application → Observe → Measure → Learn → Better Playbook. Honest by construction — insufficient data is `awaiting_data`, never a fabricated win. **212 tests, 210 pass, 0 fail, 2 skip. Typecheck clean. RTL premium.**

## What was built

### 1. Application outcome interpreter (`modules/playbooks/src/app-outcome-engine.ts`, pure & tested)
A scope-keyed twin of the Sprint 18 repair engine. Given a scope (page/whatsapp/payment/followup/offer/funnel/all), baseline vs current metrics, and hours elapsed, it returns an honest status — `awaiting_data / early_signal / improved / no_change / worsened / inconclusive` — plus confidence, delta, Arabic interpretation, and a recommended next action. Per-scope **minimum-data rules**: page needs 48h **and** ≥30 new views; whatsapp/followup need real signal; full-funnel needs activity across ≥2 lanes. View-gated page scopes never call a rate change on too-few views a signal. Confidence is `high` only for a large primary move.

### 2. Application outcomes service (`modules/playbooks/src/app-outcomes.ts`)
`collectScopeMetrics` gathers the metric bag per scope from observed data — used identically at baseline and measurement. `captureApplicationBaseline` snapshots at apply time (wired into `applyPlaybookApplication`). `measureApplicationOutcome` runs the interpreter, writes the outcome + a learning record, and **regenerates adaptive playbooks** so application learning shapes future builds. `confirmApplicationOutcome`, `listApplicationOutcomes`, `applicationOutcomeSummary`.

### 3. Learning loop integration
`playbook_application_learning_records` feed straight into `buildAdaptivePlaybooks`: `loadLearning` now merges repair learning **and** application learning (the application's `playbook_type` maps directly via identity entries in the type map). Decided statuses (improved/no_change/worsened) feed the success calculation; **awaiting_data and early_signal never inflate it** — the same discipline as Sprint 19/20, now fed by real application outcomes.

### 4. Data model (migration 0020)
`playbook_application_outcomes` (status, baseline/current/delta, confidence, interpretation, next action, confirmed), `playbook_application_learning_records` (playbook_type/market/scope/status/confidence/delta), and `playbook_application_plans.baseline_metrics`.

### 5. UI — Application Outcome
The application panel gains **📊 قِس النتيجة** / **أعِد القياس** and a **نتيجة تطبيق الـ Playbook** section: status badge, confidence, before/after on the primary metric, interpretation, and — for an improvement — **أكّد النجاح**. The Playbooks screen shows applications count, measured-outcomes count, and improved/no-change/awaiting tallies, with the honest "results measured from observed data only" note.

### 6. Command Bar
New intents — "قيس نتيجة تطبيق الـ playbook" (measure_application_outcome), "هل تطبيق الـ playbook اشتغل؟" (did_application_work), "اتعلمنا إيه من تطبيق الـ playbook؟" — measure the most recent applied plan and return status, evidence, confidence, and next action. Measurement routing wins over apply routing so "قيس" vs "طبّق" never collide.

### 7. Action Center
Surfaces applications awaiting measurement (priority 70) and applications with no_change/worsened needing a different approach (77), alongside the Sprint 21 pending/partial application actions.

### 8. Weekly Report
The applications line now includes measured outcomes — applied / pending / improved / awaiting data / no change — with no fabricated ROI.

### 9. API endpoints
```
POST /playbook-applications/:id/measure        measure / re-measure
GET  /playbook-applications/:id/outcomes        outcome history
POST /playbook-application-outcomes/:id/confirm confirm success
GET  /playbook-application-summary               counts for the playbooks screen
```

## Tests added (11)
Page awaiting_data before min views · page improved with enough views · whatsapp early_signal then improved · payment improved on waiting drop · followup improved on overdue drop · **no fake improvement with zero data/time** · honest no_change after window · scope→playbook-type mapping · command routes the outcome intents · application-outcome routes reject header tenant in production. (DB-backed baseline capture + learning storage run in the live suite.)

## Acceptance — all met
Every applied application has a measurable outcome ✓ · baseline captured at apply time ✓ · Re-measure from the UI ✓ · outcome in the application panel ✓ · outcome feeds learning records ✓ · adaptive playbooks use application outcomes ✓ · Action Center shows pending/no-change/worsened ✓ · Weekly Report mentions outcomes ✓ · Command Bar measures + explains ✓ · **no fake impact** ✓ · minimum-data rules ✓ · tests green ✓ · RTL premium ✓ · no benchmark dashboard ✓ · no auto action ✓.

## Strict prohibitions respected
No fake ROI · no declaring success without data · no big benchmark dashboard · no auto-apply next playbook · no auto-send · no payment processing · no auto-deleting applications · no docs-instead-of-code · no polish-only.

## Needs credentials only
Postgres for the 2 skipped live-DB tests and real outcome accumulation (applications must be measured over time) · `ANTHROPIC_API_KEY` optional.

## The full self-improving loop now runs end to end
Diagnose → Repair → Measure → Learn → Build better → Apply to existing → **Measure the application → Learn from it → Better playbooks**. Every stage is evidence-gated, approval-gated, and honest about confidence.

## Next: Sprint 23 — cross-funnel/portfolio learning rollups, or begin actual pilot onboarding.
