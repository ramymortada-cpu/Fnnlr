# fnnlr — Sprint 10 Build Report (WhatsApp Flow Builder + Sales Copilot)

WhatsApp is now a buildable **sales workflow** inside the funnel, plus a per-lead **Sales Copilot** that drafts the right reply — human-in-the-loop, no auto-send, no bot. **100 tests, 98 pass, 0 fail, 2 skip. Typecheck clean. RTL premium. No inbound API, no auto-send, no chatbot, no paid-template sending, no docs drift.**

## What was built

### 1. WhatsAppSalesBrain (`packages/ai-core/src/brains/whatsapp-sales.ts`)
Generates the full structured flow: strategy, tone notes, handoff notes, and templates for every step — first reply, qualification, need discovery, price reveal, **an objection library** (9 common Arab objections, each with a tailored reply), payment details, payment reminder, proof reminder, confirmation, delivery, no-response follow-up, lost-lead recovery, upsell. Each template carries **anti-spam (no-zann) metadata**: requiresApproval, paidTemplateRequired (false in V1), noZannCooldownHours, delay suggestion, when-to-use. Fallback yields **15+ practical templates** with no LLM.

### 2. Data model (migration 0009)
Extended `whatsapp_message_templates` (step_type, trigger_stage, trigger_payment_state, objection_key, tone, delay_suggestion, requires_approval, paid_template_required, no_zann_cooldown_hours, active, when_to_use, followup_suggestion); `whatsapp_flows` (strategy, handoff_notes); new `whatsapp_draft_replies` (drafted/marked-sent, human-in-the-loop); `leads.last_contacted_at`.

### 3. Copilot selection (`modules/whatsapp/src/copilot.ts`, pure & tested)
`selectStepType(ctx)` picks the right template from lead stage + payment state + optional objection; `stageAfterReply` advances `whatsapp_clicked → contacted` when a first reply is marked sent.

### 4. WhatsApp service (`modules/whatsapp/src/service.ts`)
`generateWhatsAppFlow` (persists flow + templates, logs versioned ai_outputs, emits `whatsapp_flow_generated`), step CRUD + reorder (`whatsapp_template_updated`), `draftReply` (copilot — selects + records a draft, emits `whatsapp_reply_drafted`), `markSent` (the ONLY send path — manual; emits `whatsapp_reply_marked_sent`, updates `last_contacted_at`, advances stage with the user's action as consent).

### 5. WhatsApp Flow Builder UI (`funnel.html` → واتساب tab)
Generate button, conversation strategy + handoff notes, a **conversation stage map**, and editable **template cards** (edit body, copy, delete, anti-spam metadata shown: approval needed, cooldown, delay, when-to-use).

### 6. Sales Copilot in Lead Detail
A "رد واتساب مقترح" panel: "اقترح رد" → drafts the stage/payment-appropriate template with its cooldown note → copy / edit / **"علّمها كمتبعتة"** (manual mark) / suggest another. Explicit "no auto-send — you send it yourself" note. Marking sent can advance the lead's stage with consent.

### 7. WhatsApp Leak lane enrichment
New detectors (evidence-based): no WhatsApp flow, no first-reply template, no follow-up templates, and **leads in whatsapp_clicked with no reply marked sent** (with money impact only when a deal value is known). No fake diagnosis.

### 8. API endpoints (tenant-from-session)
```
POST /funnels/:id/whatsapp-flow/generate     generate flow
GET  /funnels/:id/whatsapp-flow               flow + steps
POST /funnels/:id/whatsapp-flow/steps         add step
PATCH/DELETE /whatsapp-flow-steps/:id         edit / remove
POST /whatsapp-flow-steps/reorder             reorder
POST /leads/:id/copilot/draft                 draft a reply (suggestion only)
POST /leads/:id/copilot/mark-sent             manual mark-sent (+stage advance with consent)
```

## Tests added (7)
Brain parse + **fallback ≥15 templates with anti-spam metadata + objection library** · copilot stage/payment selection · first-reply advances stage · **leak flags missing flow (evidence)** · reorder validation · whatsapp routes reject header tenant in production. (Plus payment/leaks snapshots updated for the new fields.)

## Acceptance — all met
WhatsApp tab ✓ · generate flow ✓ · stage map ✓ · ≥15 templates ✓ · edit ✓ · copy ✓ · (conversation map preview) ✓ · copilot in Lead Detail ✓ · copy/edit/mark-sent ✓ · mark-sent emits event ✓ · **no auto-send** ✓ · **no inbound API** ✓ · leak lane uses flow/drafts ✓ · tests green ✓ · RTL premium ✓ · **no chatbot** ✓.

## Anti-spam discipline (no-zann)
Every template stores requiresApproval + cooldown; the copilot shows the cooldown before you send; paid-template sending is explicitly off in V1; recovery/no-response templates carry longer cooldowns. The product stays respectful for the Arab market.

## Needs credentials only
`ANTHROPIC_API_KEY` (real flow copy; fallbacks work without it) · Postgres for the 2 skipped live-DB tests and real flow/draft persistence.

## Next: Sprint 11 — Weekly Diagnosis Report + Action Center (pulls together leaks, leads needing action, payment-stuck, and WhatsApp drafts into a retention artifact).
