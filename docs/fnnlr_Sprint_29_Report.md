# fnnlr — Sprint 29 Build Report (Recommendation Outcome Loop)

fnnlr stopped only recommending the next action and started measuring **whether the recommendations it made actually produced a result** — closing the loop: Recommendation → Apply → Observe → Attribute → Learn → Better Recommendation. Honest by construction: a recommendation is `worked` only with real evidence (task done + movement, draft sent + reply/progression, opportunity captured, attribution crediting the object the recommendation created); thin evidence stays `awaiting_evidence`, early movement is `early_signal`, and no movement past the window is `no_result`. No fake success, no fake revenue, no causal claim without attribution. **303 tests, 301 pass, 0 fail, 2 skip. Typecheck clean. RTL premium.**

## What was built

### 1. Outcome engine (`modules/recommendations/src/outcome-engine.ts`, pure & tested)
`interpretRecommendationOutcome` judges an applied recommendation from observed signals, with **evidence-based `worked` rules per type**: create_task on task-done + movement (or attribution); draft WhatsApp/payment **awaiting until the draft is marked sent**, then worked on reply/progression/capture; review_proof on confirmation; deliver_access on delivery; repair/playbook on a measured improvement; page/payment edits on movement after the window. `failed` when the lead is lost after the action; `early_signal` for movement still inside the window; `no_result` once the window passes with nothing. **Minimum-data gates per type** prevent early judgement. `aggregateRecLearning` rolls up by type — work rate over DECIDED outcomes only, confidence honest by sample size (`<5 low`, `5–20 medium`, `>20 high`, **never high when mostly awaiting**). `applyRecLearningToScore` nudges the score ±12 and **never lowers a critical/high-urgency recommendation**.

### 2. Outcomes service (`modules/recommendations/src/outcomes.ts`)
`checkRecommendationOutcome` gathers the linked object's state (task done/overdue, draft sent), lead movement, payment state, opportunity capture, **attribution linkage** (does the attribution credit the exact object this recommendation created?), and repair/playbook improvement — then persists an outcome + a learning record. `markRecOutcome` is the user-confirmed path (worked / no_result with a reason). `getRecLearning` and `recOutcomesSummary` serve the UI, command bar, and report.

### 3. Scoring feedback wired in
`refreshRecommendations` now loads recommendation outcome learning and applies `applyRecLearningToScore` to every candidate, attaching a `recLearningNote` ("توصيات مشابهة اشتغلت في 7 من 13 حالة مقيسة") — raising types that work, gently lowering chronically no-result ones unless urgent, never a black box.

### 4. Data model (migration 0027)
`recommendation_outcomes` (status, evidence, baseline/current/delta metrics, attributed_to_recommendation, attribution_id, captured_value, confidence, interpretation, recommended_next_action, window) and `recommendation_learning_records` (type, opportunity/attributed-action type, status, confidence, value, time-to-result), plus `action_recommendations.last_outcome_status`.

### 5. UI
The Best Next Actions panel now shows applied recommendations with an outcome badge (اشتغلت / مفيش نتيجة / إشارة مبكرة / مستنية دليل / فشلت), the `recLearningNote`, and buttons **📊 قيس النتيجة** / **اشتغلت** / **مفيش نتيجة** (user-confirmed with a reason). Proposed ones keep their طبّق (بموافقة) / تجاهل.

### 6. Command Bar
New intents — "هل التوصية دي اشتغلت؟", "قيس نتيجة التوصيات", "إيه التوصيات اللي جابت نتيجة؟", "رتب التوصيات حسب اللي اشتغل", "إيه التوصيات اللي مش بتشتغل؟", "اتعلمنا إيه من التوصيات؟" — return evidence-based outcome counts, the learned patterns, or the low-result types. Outcome routing wins over the Sprint-28 recommendation routing.

### 7. Action Center + scheduled + weekly
Action Center surfaces applied recommendations >24h old still awaiting a check ("X توصية محتاجة قياس نتيجة"). The daily refresh **checks the outcomes of applied recommendations** (after refreshing them), writes outcomes + learning, and counts it. The weekly report includes the recommendation outcomes summary.

### 8. API endpoints
```
POST /recommendations/:id/outcome/check · GET /recommendations/:id/outcome
GET  /recommendations/outcomes/summary · GET /recommendations/learning
POST /recommendations/:id/mark-worked | /mark-no-result   (with reason)
```

## Tests added (16)
Task worked on done+progression · draft awaiting until sent · draft worked on sent+progression · payment reminder worked with attribution + value · repair/playbook worked on improvement · **no fake worked without evidence** · failed on lead lost · early signal in window · learning work-rate over decided only · no high confidence from low sample · **high not inflated by awaiting** · scoring cautious + never lowers critical · limited learning unchanged score · command routes outcome intents · outcome routes reject header tenant in production.

## Acceptance — all met
Recommendation outcomes exist ✓ · applied recommendations measurable ✓ · **worked only with evidence or user confirmation** ✓ · learning records generated ✓ · scoring uses outcome learning cautiously ✓ · UI shows status/evidence per recommendation ✓ · Command Bar explains what worked / didn't ✓ · Action Center shows recommendations needing outcome ✓ · scheduled refresh measures outcomes ✓ · weekly report mentions outcomes ✓ · **no fake success** ✓ · **no fake revenue** ✓ · tests green ✓ · RTL premium ✓.

## Strict prohibitions respected
No fake recommendation success · no fake revenue · no causal claim without attribution · no auto-send (drafts only) · no auto-apply · no black-box scoring (every adjustment bounded + noted) · no huge analytics dashboard · no docs-instead-of-code · no polish-only.

## Needs credentials only
Postgres for the 2 skipped live-DB tests and real outcome accumulation over time · `ANTHROPIC_API_KEY` optional.

## The full revenue intelligence loop is now closed
Detect the nearest revenue → recommend the best next action → observe whether the applied recommendation worked → attribute the capture → learn which recommendation types actually convert → rank the next recommendations smarter. Every link is evidence-based and honest about what it doesn't yet know, and nothing executes behind the owner's back.

## Next: Sprint 30 — strategy synthesis (turn the accumulated loop into a per-business "what's working / what to change" playbook), or begin actual pilot onboarding.
