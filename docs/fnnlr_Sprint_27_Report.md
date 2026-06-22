# fnnlr — Sprint 27 Build Report (Revenue Attribution Engine)

fnnlr stopped only knowing *that* an opportunity converted and started asking **which action drove it** — associating each capture with the nearest, strongest action by evidence. This is evidence-weighted association, **not causal proof**, and the language stays honest throughout: strong / medium / weak / no clear attribution, "happened after", "likely influenced by". No fabricated causality, no fabricated revenue. **275 tests, 273 pass, 0 fail, 2 skip. Typecheck clean. RTL premium.**

## What was built

### 1. Attribution engine (`modules/attribution/src/engine.ts`, pure & tested)
`attributeCapture` takes a capture + candidate actions (each with a type, a minutes-before-capture delta, and a direct/indirect flag) and picks the winning attribution. **Windows are respected per opportunity type** (access delivery 24h, proof review 48h, WhatsApp 72h, payment 96h, repair/playbook 14d); an action outside the window — or *after* the capture — is ignored (no fake causality). Ranking favors the expected action for that opportunity type, direct lead/object links, a measured outcome improvement, and proximity. Strength is transparent: expected + direct + (improved or uniquely dominant) → **strong/high**; expected + direct but a near-tie → **medium**; indirect/scheduled-only → **weak/low**; nothing in window → **unknown/none**. Every result carries an Arabic explanation ("التحصيل حصل بعد 42 دقيقة من تذكير دفع. Attribution: strong."). `aggregateAttribution` rolls up by action type (excluding `unknown`) with honest confidence by sample size, and `recommendedAction` returns the best-converting expected action only when the data isn't limited.

### 2. Attribution service (`modules/attribution/src/service.ts`)
`runAttribution` gathers candidates from the real timeline — completed tasks (with the new `done_at`), WhatsApp replies marked sent, applied repair plans (with outcome), applied playbook applications, and recent command-bar actions — all filtered to before the capture. It only attributes a genuinely **captured** opportunity, then persists a `revenue_attribution` + an `attribution_learning_record`. `getAttribution`, `getAttributionLearning`, `recommendedActionFor`, and `attributionSummary` serve the UI, command bar, and report.

### 3. Data model (migration 0025)
`tasks.done_at` (completion timestamp for windows), `revenue_attributions` (attributed_action_type, attributed_object_id, strength, confidence, time_delta_minutes, evidence, explanation, captured value/currency), and `attribution_learning_records` (action type, opportunity type, market, captured, value, confidence, time delta).

### 4. Wired into the outcome loop
When an opportunity becomes captured — whether by evidence (`checkOpportunityOutcome`) or user confirmation (`markOutcome`) — attribution runs automatically in its own tenant scope. `tasks.done_at` is now set when a task is marked done.

### 5. Scoring feedback (cautious, explained)
`refreshOpportunities` now also loads attribution learning and attaches an `attributionNote` to each opportunity — "الإجراء الأكثر تأثيرًا تاريخيًا: تذكير دفع." — so the next opportunity of that type recommends the action that historically converts. It never overrides obvious urgency and stays out of black-box territory: the note explains the influence.

### 6. UI
Each **captured** opportunity card gets a "ما الذي ساعد في التحصيل؟" section — the attributed action, strength, and the explanation — fetched from `/opportunities/:id/attribution`. The opportunities screen gains an **أكثر الإجراءات تأثيرًا** insights panel (action type, captured count, strong-attribution count, known value), with the standing caveat "ارتباط بالدليل، مش إثبات سببية." Opportunity cards also show the `attributionNote` when present.

### 7. Command Bar
New intents — "إيه اللي جاب التحصيل؟", "أنهي actions بتجيب فلوس؟", "إيه أكتر إجراء بيحوّل waiting payment؟", "هل رسائل واتساب بتجيب نتيجة؟", "رتّب الفرص حسب الإجراءات اللي بتشتغل", "اشرح attribution للفرصة" — each returns evidence, strength, confidence, action type, and value-if-known, with the association-not-causality caveat. Attribution routing wins over the Sprint-26 outcome routing.

### 8. Weekly report
Now includes the attribution summary — top attributed actions, strong-attribution counts, known value attributed honestly, and the unknown-attribution count.

### 9. API endpoints
```
POST /opportunities/:id/attribution/run · GET /opportunities/:id/attribution
GET  /attribution/summary · GET /attribution/learning · POST /attribution/recompute
```

## Tests added (13)
Strong attribution (payment reminder / delivery task / WhatsApp reply) · multiple candidates → medium · **no action timeline → unknown** · **windows respected** · **no fake causality (action after capture ignored)** · indirect-only → weak · repair applied+improved → strong · learning aggregation by action type (unknown excluded) · recommendedAction needs non-limited data · command routes attribution intents · attribution routes reject header tenant in production.

## Acceptance — all met
Captured opportunity can run attribution ✓ · engine picks a likely action ✓ · strength/confidence clear ✓ · evidence present ✓ · **unknown shown when no evidence** ✓ · learning records stored ✓ · UI shows attribution ✓ · scoring uses attribution learning cautiously ✓ · Command Bar explains which actions work ✓ · weekly report mentions attributed actions ✓ · **no fake causality** ✓ · **no fake revenue** ✓ · tests green ✓ · RTL premium ✓.

## Strict prohibitions respected
No causality claimed without evidence · no black-box attribution (windows + ranking + strength all explained) · no fake revenue attribution · no auto-send · no payment processing · no huge analytics dashboard · no automatic deletion/reassignment of outcomes · no docs-instead-of-code · no polish-only.

## Needs credentials only
Postgres for the 2 skipped live-DB tests and real attribution accumulation over time · `ANTHROPIC_API_KEY` optional.

## fnnlr now knows what works
It detects the nearest revenue, acts, observes the capture, and now associates that capture with the action that most likely drove it — by evidence, with honest strength. That learning flows back into ranking, so fnnlr increasingly recommends the actions that actually convert, never a fabricated cause.

## Next: Sprint 28 — action recommendation engine (turn attribution learning into proactive "do this next" suggestions per live opportunity), or begin actual pilot onboarding.
