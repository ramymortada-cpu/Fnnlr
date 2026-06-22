# fnnlr — Sprint 11 Build Report (Action Center + Weekly Diagnosis Report)

fnnlr is now a daily operating system, not just strong screens: one place that answers **"what do I do today?"** and, each week, **"what leaked, what improved, what's the fastest fix, who do we chase?"** — all from real records. **110 tests, 108 pass, 0 fail, 2 skip. Typecheck clean. RTL premium. No big analytics dashboard, no vanity reports, no fabricated numbers, no docs drift.**

## What was built

### 1. Action builder (`modules/actions/src/builder.ts`, pure & tested)
Turns observed records into a **prioritized** action list — every action points at a real lead/leak/task/payment record, nothing generic. 13 action types (follow_up_lead, review_payment_proof, confirm_payment, deliver_access, contact_whatsapp_click, resolve_leak, add_next_action, mark_lost_reason, …). Priority order: proof-to-review and paid-not-delivered at the top, then waiting-payment, overdue tasks, WhatsApp-clicked, follow-ups, next-action, leaks by severity.

### 2. Actions service (`modules/actions/src/service.ts`)
Gathers the records, runs the builder, **upserts action_items by code** (status survives; actions whose record no longer needs work auto-close). `listActions` with filters (today/overdue/payment/whatsapp/leaks/followup, snooze-aware), `topAction` (for the dashboard), `updateActionStatus` (done/snoozed/ignored → events).

### 3. ReportBrain (`packages/ai-core/src/brains/report.ts`)
Plain-Arabic executive weekly summary: executiveSummary, topPriorities, narrative, nextWeekFocus, ownerMessage. **Narrates only the numbers it's given — never invents figures or revenue.** Rule-based fallback fully works with no LLM and states clearly when data is insufficient.

### 4. Report service (`modules/reports/src/service.ts`)
Refreshes actions, assembles the period summary from observed data (top-3 leaks, leads needing action, payment-stuck, WhatsApp clicked-no-contact, page views/CTA, wins), runs ReportBrain (versioned ai_output), and persists the report with `degraded` honesty. `getLatestReport`, `markReportReviewed`.

### 5. Data model (migration 0010)
`action_items` (journey/lead/leak/task refs, type, title, explanation, priority, due, status, recommended_action, target_route, evidence, code, snooze_until) and `reports` (period, summary, biggest_leak_id, status, ai_output_id, metadata, degraded).

### 6. Action Center UI (dashboard)
A "مركز الإجراءات — اعمل إيه النهاردة؟" section with filter chips (today/overdue/payment/whatsapp/leaks/followup) and action cards: icon, title, explanation, recommended action, and **افتح / تم / أجّل / تجاهل**. "افتح" deep-links into the right funnel tab or opens the exact lead.

### 7. Weekly Report UI (funnel → التقرير tab)
"ولّد التقرير" → executive summary, top leaks, top actions, lead/payment/WhatsApp stat tiles, next-week focus, owner message, and **انسخ النص** (markdown the owner can paste to the team). Degraded banner when rule-based.

### 8. Dashboard integration
"أسرع إصلاح النهاردة" now reads the **top Action Center action**; "عملاء محتاجين تحرّك" and "أكبر تسريب" stay wired; revenue card still shows the honest "not available until you add deal value" state.

### 9. API endpoints (tenant-from-session)
```
GET  /funnels/:id/actions?filter=        refresh + list (today/overdue/payment/whatsapp/leaks/followup)
GET  /funnels/:id/actions/top            top action (dashboard fastest fix)
PATCH /actions/:id                       status: done | snoozed | ignored
POST /funnels/:id/report/generate        weekly diagnosis report
GET  /funnels/:id/report                 latest report
POST /reports/:id/reviewed               mark reviewed
```

## Tests added (10)
No-record → no action · action from waiting-payment / overdue-task / open-leak (each tied to its record) · **priority ordering** · ReportBrain fallback writes Arabic + narrates given numbers, doesn't invent · fallback states insufficient-data clearly · LLM parse path · action-status validation · **action routes reject header tenant in production**.

## Acceptance — all met
Action Center ✓ · real record-based actions ✓ · open lead/leak/payment/page from action ✓ · done/snooze/ignore ✓ · dashboard fastest-fix from actions ✓ · generate weekly report ✓ · top leaks/actions/summaries ✓ · **no fabricated numbers** ✓ · ReportBrain fallback without LLM ✓ · copy/share report as text ✓ · tests green ✓ · RTL premium ✓ · no big analytics dashboard ✓ · no vanity reports ✓.

## Needs credentials only
`ANTHROPIC_API_KEY` (richer report prose; rule-based fallback works without it) · Postgres for the 2 skipped live-DB tests and real action/report persistence.

## Next: Sprint 12 — AI Command Bar tying all objects together, or Pilot Readiness + UX polish + seed demo workspace.
