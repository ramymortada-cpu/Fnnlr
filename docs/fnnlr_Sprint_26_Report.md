# fnnlr — Sprint 26 Build Report (Opportunity Capture Learning Loop)

fnnlr stopped only detecting revenue opportunities and started learning **which ones actually convert** — and using that to rank the next ones smarter. The loop: Detect → Act → Observe → Capture / Miss → Learn → Better Ranking. Honest by construction: an opportunity is `captured` only with real evidence (payment confirmed, access delivered, stage progressed, task done, repair/application applied) or an explicit user confirmation with a reason; otherwise `awaiting_evidence`, `missed`, or `expired`. No fabricated revenue, no fabricated capture. **262 tests, 260 pass, 0 fail, 2 skip. Typecheck clean. RTL premium.**

## What was built

### 1. Outcome engine (`modules/opportunities/src/outcome-engine.ts`, pure & tested)
`interpretOpportunityOutcome` decides `captured / missed / expired / inconclusive / awaiting_evidence` from observed signals, with **evidence-based capture rules per type**: waiting-payment/proof captured on confirmation or paid stage (value from the observed amount); access-delivery on delivered; WhatsApp-first-reply on stage progression or inbound (progression captured, not revenue — value stays null); follow-up on stage movement/task done; leak-repair/playbook captured on a measured improvement, inconclusive when merely applied. Missed when an action was taken but the lead was lost / payment failed; expired when no action passed a per-type threshold (or window closed / lead lost). `aggregateLearning` rolls up per type — **capture rate over DECIDED outcomes only**, confidence honest about sample size (`<5 low`, `5–20 medium`, `>20 high`, **never high when mostly awaiting/inconclusive**). `applyLearningToScore` nudges the priority score by learning (±12) but **never lowers a critical/high-urgency opportunity** and does nothing when learning is limited.

### 2. Outcomes service (`modules/opportunities/src/outcomes.ts`)
`checkOpportunityOutcome` gathers real signals for an opportunity (lead stage/inbound, payment state, completed tasks, service window, repair/application status), runs the engine, persists an outcome + a learning record, computes time-to-action / time-to-capture, and **resolves the opportunity by evidence** (captured/expired) — never a fake capture. `markOutcome` is the user-confirmed path (captured/missed with a reason, high confidence). `getLearning` rolls up; `outcomesSummary` feeds the dashboard + weekly report.

### 3. Scoring feedback wired into detection
`refreshOpportunities` now loads the learning map and applies `applyLearningToScore` to every candidate — raising types that convert, gently lowering chronically low-converting ones (unless urgent), and attaching a learning note ("فرص مشابهة اتحصّلت في 6 من 12 حالة مقيسة") or an honest "learning data is limited."

### 4. Data model (migration 0024)
`opportunity_outcomes` (status, captured_value, evidence, action_taken, time_to_action/capture, confidence, interpretation), `opportunity_learning_records` (type/market/source/status/confidence/value/time/priority-at-detection/action-type), and `revenue_opportunities.acted_at / last_outcome_status`.

### 5. UI
Opportunity cards now show the last outcome status badge, the **learning note**, and buttons: **📊 قيس النتيجة** (evidence-based check), **اتحصّلت** / **ضاعت** (user-confirmed with a reason prompt), create task, dismiss. The summary line adds the outcomes rollup — captured / missed / expired / awaiting + known value captured.

### 6. Command Bar
New intents — "أي فرص اتحولت؟", "اتعلمنا إيه من فرص الإيراد؟", "قيس نتيجة الفرصة دي / هل اتحصلت؟", "رتّب الفرص بناءً على اللي بيتحول فعلاً", "فين فرص عالية الأولوية بس مش بتتحول؟" — return evidence-based outcome counts, the learned patterns, or the high-priority-but-low-conversion list. Outcome routing wins over the Sprint-25 detection routing.

### 7. Action Center
Surfaces opportunities acted on >24h ago still awaiting evidence — "X فرصة محتاجة قياس نتيجة" (priority 66).

### 8. Scheduled rhythm + weekly report
The daily refresh now **re-checks every open opportunity's outcome** (captured/expired by evidence, learning records written, ranking refreshed) and counts it. The weekly business report includes the opportunity outcomes summary.

### 9. API endpoints
```
POST /opportunities/:id/outcome/check · GET /opportunities/:id/outcome
POST /opportunities/:id/mark-captured | /mark-missed   (with reason)
GET  /opportunities/outcomes/summary · GET /opportunities/learning
```

## Tests added (17)
Capture rules per type (waiting/proof/access/whatsapp/followup) · **no fake capture without evidence** · expired past threshold · missed when lead lost after action · leak repair inconclusive→captured · learning rate over decided only · insufficient = low/limited · **high confidence not inflated by awaiting** · scoring raises on high capture with note · **scoring never lowers critical/high urgency** · limited learning doesn't change score · command routes outcome intents · outcome routes reject header tenant in production.

## Acceptance — all met
Opportunities have measurable outcomes ✓ · **captured only with evidence or explicit confirmation** ✓ · missed/expired rules ✓ · learning records generated ✓ · scoring uses learning cautiously ✓ · UI shows outcome/learning note ✓ · Command Bar explains what converted ✓ · Action Center shows opportunities needing outcome check ✓ · scheduled refresh checks outcomes ✓ · weekly report mentions outcomes ✓ · **no fake revenue** ✓ · **no fake capture** ✓ · tests green ✓ · RTL premium ✓.

## Strict prohibitions respected
No fake revenue · no fake capture · no conversion claimed without evidence · no black-box scoring (every adjustment is bounded + noted) · no auto-send · no auto-apply repairs · no payment processing · no huge analytics dashboard · no docs-instead-of-code · no polish-only.

## Needs credentials only
Postgres for the 2 skipped live-DB tests and real outcome accumulation over time · `ANTHROPIC_API_KEY` optional.

## The revenue loop is now self-correcting
fnnlr detects the nearest revenue, acts, observes the result from real evidence, learns which opportunity types actually convert, and feeds that back into the ranking — so tomorrow's "nearest revenue" is ordered by what genuinely converts, never by a fabricated number.

## Next: Sprint 27 — opportunity-to-action attribution (which specific action drove each capture, to recommend the action that works), or begin actual pilot onboarding.
