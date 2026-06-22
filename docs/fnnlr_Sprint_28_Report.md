# fnnlr — Sprint 28 Build Report (Action Recommendation Engine)

fnnlr stopped only knowing the opportunities and started telling the owner **what to do next**: "the best action now is X, because similar opportunities converted after this kind of action, with this evidence, at this confidence." Recommendations are explainable, evidence-backed, confidence-aware, and approval-gated whenever they mutate data — with an explicit fallback when learning is thin. No auto-send, no auto-apply, no fake confidence. **287 tests, 285 pass, 0 fail, 2 skip. Typecheck clean. RTL premium.**

## What was built

### 1. Recommendation engine (`modules/recommendations/src/engine.ts`, pure & tested)
`recommendForOpportunity` maps a live opportunity to its best next action using the attribution learning from Sprint 27. Confidence is **honest**: `high` only when non-limited attribution learning shows a real capture rate (≥0.5); otherwise it falls back to a stage/urgency heuristic and **says so** ("بيانات التعلّم محدودة — توصية افتراضية مبنية على المرحلة والإلحاح"). Access delivery stays high-urgency even with no learning. Scoring is transparent and additive — starting from the opportunity priority, then +learning, +known value, +expiring service window — and every recommendation carries its reasons ("الترتيب عالي علشان: فرصة waiting_payment + قيمة معروفة + إجراءات مشابهة حصّلت 6/10 + نافذة الخدمة مفتوحة"). `rankRecommendations` orders by urgency then score. Every mutating recommendation is `requiresApproval = true`.

### 2. Recommendation service (`modules/recommendations/src/service.ts`)
`refreshRecommendations` gathers live opportunities (with service window + existing-task signals) and attribution learning, runs the engine, and **upserts idempotently** (one live row per dedupe_key, 24h dismiss cooldown), expiring recommendations whose opportunity is gone. `applyRecommendation` is **approval-gated**: a mutating recommendation without `approved=true` returns `needsApproval`; with approval it creates the real task or a **draft-only** WhatsApp/payment message (never sent) and **links** the created object back. `recommendForOpportunityId`, `dismissRecommendation`, and `recommendationsSummary` complete the surface.

### 3. Data model (migration 0026)
`action_recommendations` (type, dedupe_key, explanation, evidence, confidence, learning_source, priority_score, urgency, expected_effect, proposed_action, **requires_approval**, status, linked_object_type/id) with a partial unique index on dedupe_key for live rows, and `recommendation_status_history`.

### 4. UI
The opportunities screen gains a **أفضل الإجراءات الآن** panel: each recommendation shows the action, the "ranked high because" explanation, confidence, learning source, expected effect, and **طبّق (بموافقة)** / تجاهل buttons — applying a mutating one asks for confirmation first, and a draft result is clearly "راجِعها قبل الإرسال." The standing caveat: "كل إجراء بيغيّر بيانات بيتطبّق بموافقتك بس — مفيش إرسال تلقائي."

### 5. Command Bar
New intents — "اعمل إيه دلوقتي؟", "إيه أفضل إجراء للفرصة دي؟", "هات أفضل ٥ إجراءات النهارده", "رتّب الإجراءات حسب اللي بيحوّل", "اكتب الرسالة المقترحة", "اعمل task لأفضل فرصة" — return the top recommended action with evidence, confidence, learning source, and expected effect. The draft-message and task intents stay approval-aware.

### 6. Action Center
The action list is enriched with the top recommendations — "موصى به علشان…" with confidence — deduped against the opportunity/task signals so the same work isn't listed twice.

### 7. Scheduled rhythm + weekly report
The daily refresh now **regenerates recommendations** per funnel (after refreshing opportunities + checking outcomes) and counts them. The weekly business report includes the recommendations summary (top action, applied-this-week).

### 8. API endpoints
```
POST /recommendations/refresh · GET /recommendations[?funnelId&filter] · GET /recommendations/summary
GET  /recommendations/:id · POST /recommendations/:id/apply · POST /recommendations/:id/dismiss
POST /opportunities/:id/recommendations
```

## Tests added (12)
Waiting payment recommends payment reminder when learning supports it · access delivery high-priority without learning · **no high confidence without learning (explicit fallback note)** · limited sample ≠ high confidence · scoring explanation exists · service-window expiry boosts WhatsApp score · **every mutating recommendation requires approval** · known-value/high-rate raises score · ranking by urgency then score · unknown type → no recommendation · command routes recommendation intents · recommendation routes reject header tenant in production.

## Acceptance — all met
Recommendation engine ✓ · every recommendation built on opportunity/context/learning or explicit fallback ✓ · every recommendation has an explanation ✓ · honest confidence ✓ · UI shows best action per opportunity ✓ · Best Next Actions section ✓ · Command Bar returns best action ✓ · Action Center uses recommendations to rank ✓ · scheduled refresh regenerates ✓ · **applying a mutating recommendation requires approval** ✓ · **no auto-send** ✓ · **no fake confidence** ✓ · tests green ✓ · RTL premium ✓.

## Strict prohibitions respected
No auto-send WhatsApp (drafts only) · no auto-apply repairs (approval-gated, and repair build stays in its own flow) · no fake confidence · no black-box recommendations (scoring + reasons explained) · no duplicate task spam (dedup + 24h cooldown) · no payment processing · no huge analytics dashboard · no docs-instead-of-code · no polish-only.

## Needs credentials only
Postgres for the 2 skipped live-DB tests and real recommendation/learning accumulation · `ANTHROPIC_API_KEY` optional.

## fnnlr now says "do this next"
It detects the nearest revenue, learns which actions actually convert, and turns that into a ranked, explained "best next action" for every live opportunity — proposed, never executed behind the owner's back. The owner stays in control; fnnlr just makes the next move obvious and backs it with evidence.

## Next: Sprint 29 — recommendation outcome loop (did applied recommendations actually convert, closing the learning circle), or begin actual pilot onboarding.
