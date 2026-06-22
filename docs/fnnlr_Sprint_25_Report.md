# fnnlr — Sprint 25 Build Report (Revenue Opportunity Engine)

fnnlr stopped saying "you have problems" and started saying "**here are your nearest revenue opportunities, with this evidence, and this is the first action.**" It turns the real records already inside fnnlr — leads, payment states, leaks, transferable playbooks — into prioritized, evidence-backed opportunities. Honest by construction: a money value appears **only when an observed deal amount exists**; otherwise it's an actionable count, never fake revenue. Scoring is rule-based and fully explained — no black box. **245 tests, 243 pass, 0 fail, 2 skip. Typecheck clean. RTL premium.**

## What was built

### 1. Detection + scoring engine (`modules/opportunities/src/engine.ts`, pure & tested)
`detectOpportunities` turns gathered records into candidates across the types: waiting_payment_recovery, proof_review, access_delivery, whatsapp_first_reply, followup_reactivation, leak_repair, playbook_application. **`estimatedValue` is set ONLY from an observed `payment_states.amount`** — never invented. Scoring is transparent and additive: each opportunity carries its `scoreReasons` ("الترتيب: دفعة مؤكَّدة بدون تسليم (+70)، قيمة معروفة (+10)") so it can always answer "why this is prioritized." Examples: confirmed payment not delivered → critical; expiring service window boosts the WhatsApp-first-reply score; an existing delivery/review task lowers the score (a dedup signal). `valueSummary` sums only known amounts and reports the rest as a count.

### 2. Opportunity service (`modules/opportunities/src/service.ts`)
`refreshOpportunities` gathers real records (leads with stage age + service window, payment states with amount/proof/delivery + task presence, high/critical leaks, transferable playbooks targeting the funnel), runs the engine, and **upserts idempotently** — one live row per `dedupe_key`, refreshing score/urgency without overriding a user's `in_progress`, and **skipping anything the user dismissed in the last 24h**. Opportunities that no longer appear are resolved: **captured** if the underlying condition is genuinely resolved (paid/delivered, verified from events), else **expired** — never a fake capture. Status transitions (`in_progress`/`captured`/`dismissed`) are audited in `opportunity_status_history`. `createTaskForOpportunity` creates a real follow-up/review/delivery task and links it — no auto-send.

### 3. Data model (migration 0023)
`revenue_opportunities` (type, dedupe_key, evidence, affected_objects, estimated_value/currency, confidence, priority_score, urgency, recommended_action, status, source, linked_task_id) with a **partial unique index** on `dedupe_key` for live rows, and `opportunity_status_history`.

### 4. Opportunity UI
A new **فرص الإيراد** screen — an actionable list, not a dashboard: a summary line (known value when available, otherwise "X actionable opportunities"), filters (all / payment / WhatsApp / follow-up / leaks / playbooks / known-value / urgent), and opportunity cards with title, type, urgency, priority score, evidence, the "why prioritized" reasons, estimated value with the **"estimated from observed deal value"** caveat when present, and actions: create task / mark captured / mark in progress / dismiss. The **dashboard** gains a top-opportunity strip (nearest opportunity + honest value-or-count).

### 5. Command Bar
New intents — "فين أقرب فلوس؟", "هات فرص الإيراد", "إيه أسرع فرصة؟", "هات العملاء الأقرب للدفع", "افتح فرص الدفع", "اعمل tasks لأعلى فرص الإيراد", "لخّص فرص الأسبوع", "إيه الفرص اللي قيمتها معروفة؟" — return the top opportunity with evidence, confidence, value-if-known, and the first action. Value is shown only with the observed-value caveat.

### 6. Action Center (no duplication)
Opportunities whose work is already represented by the per-lead action loops (waiting/proof/delivery/WhatsApp/follow-up) are **not** re-listed; only the types not otherwise covered (leak repair, playbook application) surface as actions, linked to the opportunity.

### 7. Scheduled rhythm + weekly report
The daily refresh now **regenerates opportunities per funnel** (counted in its summary) and resolves/expires gone ones. The weekly business report includes an opportunities summary — open count, top opportunity, known-value honesty.

### 8. API endpoints
```
POST /funnels/:id/opportunities/refresh
GET  /funnels/:id/opportunities[?filter=] · GET /opportunities[?filter=] · GET /opportunities/summary
GET  /opportunities/:id · PATCH /opportunities/:id
POST /opportunities/:id/create-task | /mark-captured | /dismiss
```

## Tests added (12)
Access-delivery critical + value from observed amount · proof review without fake value · waiting payment · **service-window urgency boosts WhatsApp-first-reply score** · **no fake value anywhere without an amount** · scoring is explained · existing task lowers score (dedup) · leak repair only for high/critical with data · valueSummary sums known only / null when none · command routes opportunity intents · opportunity routes reject header tenant in production.

## Acceptance — all met
Opportunities module ✓ · detects from real records ✓ · every opportunity has evidence ✓ · explained priority score ✓ · **estimated value only when known** ✓ · UI ✓ · dashboard top opportunity ✓ · Command Bar nearest opportunity ✓ · Action Center integrates without duplication ✓ · scheduled refresh regenerates ✓ · resolve/dismiss safely ✓ · tests green ✓ · RTL premium ✓ · **no fake revenue** ✓ · **no auto action** ✓.

## Strict prohibitions respected
No fake revenue/ROI · no black-box scoring (every score is explained) · no value without a known deal value · no auto-send · no auto-apply repairs · no payment processing · no huge analytics dashboard · no docs-instead-of-code · no polish-only.

## Needs credentials only
Postgres for the 2 skipped live-DB tests and real opportunity accumulation · `ANTHROPIC_API_KEY` optional.

## fnnlr now points at the money
It no longer just diagnoses and refreshes. It looks at the real state of every funnel and says, in priority order with the evidence attached: here is the nearest revenue, here is why it's ranked here, and here is the first safe action — value attached only when the deal value is actually known.

## Next: Sprint 26 — opportunity capture loop (measure which surfaced opportunities actually converted, feed back into scoring), or begin actual pilot onboarding.
