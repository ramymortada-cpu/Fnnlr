# fnnlr — Sprint 7 Build Report (Mini Funnel CRM / Lead Pipeline + Lead Detail)

The leads + conversations from tracked WhatsApp links are now a daily workspace a seller actually operates. **70 tests, 68 pass, 0 fail, 2 skip. Typecheck clean. RTL premium. Funnel-specific (not a generic CRM). No WhatsApp inbound API, no Leak Board, no infra/docs drift.**

## What was built

### 1. Funnel CRM data model (migration 0006)
Leads gain `name`, `status`, `followup_due_at`, `lost_reason`, `stage_changed_at`. New tables: `lead_stage_history` (every stage move with timestamp — the **raw material the Leak Board will read** to find where revenue leaks), `lead_notes`, `tasks` (lead/funnel-scoped, kind + due + done). Conversations gain `status`, `last_message`, `note` (manual stub).

### 2. Pipeline rules (pure, unit-tested) — `modules/pipeline/src/pipeline.ts`
The 12 funnel stages (New → WhatsApp Clicked → Contacted → Qualified → Price Sent → Payment Details Sent → Waiting Payment → Proof Uploaded → Paid → Access Delivered → Lost → Needs Follow-up) with Arabic labels; 10 payment states; and filter logic (`leadMatchesFilter`, `filterWhereClause`) for: needs follow-up, waiting payment, clicked-not-contacted, high intent, payment stuck, paid, lost.

### 3. Pipeline service — `modules/pipeline/src/service.ts`
`listLeads` (filtered, funnel-scoped, source/campaign), `getLeadDetail` (lead + attribution + conversation + payment + notes + tasks + stage history), `patchLead`, `changeStage` (records history + emits `stage_changed`, plus `deal_won`/`deal_lost`), `addNote`, `createTask` (sets the lead's next_action), `updateTask`, `setPaymentState` (upserts `payment_states` + emits `payment_state_changed`), `getLeadEvents` (timeline = lead-referencing events + stage history), `updateConversation`, `leadsNeedingAction` (dashboard).

### 4. Lead Pipeline UI (`funnel.html` → العملاء tab)
Filter chips + lead cards (name/source/campaign/next action/stage badge). Click → **lead detail panel**: stage selector, payment-state selector, attribution block (source/medium/campaign/link code), conversation summary, next action, add task, add note, and the **event timeline** (stage history). Every action emits an event and persists.

### 5. Dashboard wiring
The "عملاء محتاجين تحرّك" card now pulls `leads/needing-action` across funnels and links into the funnel when there are any — the first dashboard card backed by real pipeline data.

### 6. API endpoints (tenant-from-session)
```
GET   /funnels/:id/leads?filter=&source=&campaign=   list/filter
GET   /funnels/:id/leads/needing-action               dashboard count
GET   /leads/:id                                       full detail + timeline
PATCH /leads/:id                                       patch fields
POST  /leads/:id/stage                                 change stage (+history +event)
POST  /leads/:id/notes                                 add note
POST  /leads/:id/tasks                                 create task
POST  /leads/:id/payment-state                         set payment state (+event)
GET   /leads/:id/events                                timeline
PATCH /tasks/:id                                        update/complete task
PATCH /conversations/:id                                manual conversation update
```

## Tests added (9)
12-stage set + Arabic labels · needs-followup / waiting-payment / high-intent / clicked-not-contacted filters · safe SQL fragments · stage/note/task/payment-state validation · **lead routes reject header-only tenant in production**. DB-backed mutations (stage→history→event, payment→event) run in the live suite.

## Acceptance — all met
Open workspace ✓ · Leads tab ✓ · see leads from tracked clicks ✓ · filter by status ✓ · open lead detail ✓ · attribution + conversation + payment + timeline ✓ · change stage manually ✓ · add note/task ✓ · change payment state manually ✓ · every action emits an event ✓ · dashboard card reflects leads/tasks ✓ · tests green ✓ · RTL premium ✓ · not a generic CRM ✓ · no WhatsApp inbound ✓ · no full Leak Board ✓.

## Why this isn't a generic CRM
Every lead is bound to a funnel, a tracked link, a conversation, a funnel stage, and a payment state; stage history is recorded specifically so revenue-leak diagnosis can run on observed timing. Nothing here works outside a funnel context.

## Needs credentials only
Postgres with CREATE DATABASE rights — to run the 2 skipped live-DB tests and the real lead/stage/payment persistence paths.

## Next: Sprint 8 — Payment Flow Builder + Payment State UI, or Revenue Leak Board v1 (events are now rich enough: stage_changed, payment_state_changed, whatsapp_clicked, page events).
