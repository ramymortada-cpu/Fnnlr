# fnnlr — Sprint 19 Build Report (Evidence-Weighted Repair Planner)

The repair planner stopped being purely generic. It now consults fnnlr's own memory — past repair outcomes — to weight plans, attach honest learning notes, and offer an alternative strategy: **Leak Evidence + Historical Outcomes + Market Context → Better Repair Plan**. This is the start of the real moat: fnnlr learns *which* repair works, for *which* funnel, in *which* market. No fabricated wisdom — with thin data it says so and falls back to the heuristic planner. **176 tests, 174 pass, 0 fail, 2 skip. Typecheck clean. RTL premium.**

## What was built

### 1. Repair strategy memory (`modules/repairs/src/learning.ts`, pure core + DB layer)
`summarizeLearning` (PURE) aggregates learning records per repair type (and market) into honest signals: sample size, improved/early-signal/no-change/worsened/inconclusive/awaiting counts, **decided count**, and **success rate over decided outcomes only** (awaiting_data and early_signal never inflate it). Confidence is gated by decided sample size — `<3 → low`, `3–10 → medium`, `>10 → high` — and is **never `high` when most records are still awaiting/inconclusive**. `getLearning` prefers market-specific data when it has ≥3 decided outcomes, else falls back to all-market. `learningRollup` aggregates across types.

### 2. Evidence-weighted planning (`service.ts` + `planner.ts`)
`buildRepairFromLeak` now: resolves the business market, queries learning, computes whether the type is **historically weak** (≥3 decided and success rate <34%), and persists `learning_confidence`, `learning_notes` (note, sample size, decided count, success rate, market, fallback reason), `alternative_strategy`, `selected_strategy`, and `strategy_source` (`heuristic` when data is limited, else `learned`). Each step records a `learning_score` + `step_reason` ("مرتّبة حسب نتائج سابقة" vs "استراتيجية افتراضية"). The plan never loses steps — with thin data it simply uses the default order and says so.

### 3. Alternative strategies (`planner.ts`)
`ALTERNATIVES` + `alternativeFor()` define a plan B per type — payment (simplify instructions + proof reminder), page CTA (rewrite hero + proof near CTA), WhatsApp (tone + objection template + timing), follow-up (explicit next action) — each with a title, when-to-use, and steps. `switchToAlternative` swaps a *proposed* plan's pending steps to the alternative (still all confirm-gated), setting `selected_strategy='alternative'`, `strategy_source='mixed'`.

### 4. Data model (migration 0017)
`repair_plans`: `learning_confidence`, `learning_notes`, `alternative_strategy`, `selected_strategy`, `strategy_source`. `repair_steps`: `weight`, `evidence_score`, `learning_score`, `step_reason`.

### 5. Repair Plan UI upgrade
The panel now shows **📚 ملاحظات التعلّم** (note, confidence, source, sample/decided counts, an explicit "بيانات التعلّم محدودة — الترتيب افتراضي" when thin, and a "historically weak → consider the alternative" flag) and an **استراتيجية بديلة** card (title, when-to-use, steps, and a **بدّل للاستراتيجية البديلة** button). Honest, not over-clever.

### 6. Command Bar
Repair-building commands ("صلّح أكبر تسريب" / "اقترح أفضل إصلاح") now surface the learning note (📚) and learning confidence in the command result before opening the plan.

### 7. Action Center
Proposed plans with **low learning confidence** now appear as "راجِع خطة إصلاح (ثقة منخفضة)" needing review (priority 80). No-change/worsened outcomes already route to "build another" from Sprint 18.

### 8. Weekly Report
Adds a learning-patterns section: decided patterns with confidence, or an honest "بيانات التعلّم لسه محدودة" / "لسه مفيش بيانات تعلّم كفاية" when there isn't enough. No exaggeration.

### 9. API endpoints
```
POST /repairs/:id/switch-strategy    swap a proposed plan to its alternative
GET  /repair-learning                 learning rollup across repair types
```
(plus learning now flows through the existing build/get repair endpoints).

## Tests added (9)
Aggregation by repair type · confidence low <3 decided · medium/high by size · **no false high confidence when mostly awaiting** · awaiting/early-signal never count as decided · market scoping · empty → honest no-data · alternatives exist for the main types · learning + switch-strategy routes reject header tenant in production.

## Acceptance — all met
Planner reads learning records ✓ · adds learning notes ✓ · plan shows confidence/sample size ✓ · alternative strategy shown ✓ · **low-data cases say so honestly** ✓ · learning affects ordering/strategy when evidence exists (historically-weak flag + step reasons) ✓ · Command Bar uses learning ✓ · Action Center surfaces low-confidence + no_change ✓ · Weekly Report mentions patterns without exaggeration ✓ · tests green ✓ · **no fake confidence** ✓ · no benchmark dashboard ✓ · no auto-repair without approval ✓.

## Strict prohibitions respected
No fake confidence · no benchmark dashboard · no claiming "best" without data · no autonomous execution · no auto-send · no payment processing · no auto-closing leaks · no docs-instead-of-code · no polish-only.

## Needs credentials only
Postgres for the 2 skipped live-DB tests and real learning accumulation (outcomes must be measured over time to build the records the planner reads) · `ANTHROPIC_API_KEY` optional.

## Next: Sprint 20 — surface cross-funnel learning benchmarks into onboarding/templates, or begin actual pilot onboarding.
