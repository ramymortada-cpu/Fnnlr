# fnnlr — Sprint 16 Build Report (Real-Time Revenue Operations Layer)

Integrations stopped being a foundation and became **live daily operations**. A real event entering fnnlr — a WhatsApp message, a payment webhook — now becomes: **structured event → state update → action → copilot suggestion → diagnosis input**, and surfaces to the owner as clear actions and a live feed. Still no auto-send, no auto-reply, no payment processing. **149 tests, 147 pass, 0 fail, 2 skip. Typecheck clean. RTL premium. Security preserved: tenant always resolved from connectionId, never a header.**

## What was built

### 1. Event processor (`modules/realtime/src/processor.ts`) — the spine
Lightweight, synchronous, isolated so a queue can wrap it later. Two enrichment entry points:
- **`processWhatsAppInbound`**: resolves the funnel from the connection, finds-or-creates the conversation and lead (inbound-first leads are created from the phone), stores the inbound message, **opens the 24h service window**, updates last-inbound timings, nudges `whatsapp_clicked → contacted`, emits canonical events, refreshes actions, and marks leaks stale. **Never replies.**
- **`processPaymentEvent`**: matches a lead by reference; when matched, updates `payment_state` + history, advances/repairs stage (`confirmed → paid` + `deliver_access` action; `failed → payment_recovery` action), emits events. When **unmatched**, stores the event and raises an admin action ("حدث دفع غير مطابق") **without corrupting any lead or payment**.

### 2. Service window (`modules/realtime/src/service-window.ts`, pure & tested)
`computeServiceWindow` → `open / expiring_soon / closed / unknown` with expiry + hours-left, and Arabic `windowHint` ("الرد دلوقتي مجاني…", "هتقفل خلال ساعتين…", "أغلقت — هيحتاج template مدفوع"). Drives the copilot and the inbox; no paid sending.

### 3. WhatsApp inbound enrichment + conversation inbox
The webhook now delegates to the processor. Lead Detail shows a **conversation inbox** (inbound + marked-sent outbound bubbles, timestamps) with a **service-window badge**, plus **"اقترح رد على آخر رسالة"** — the copilot suggests a reply from the latest inbound message with simple Arabic objection detection (price/thinking/trust) and the window hint. Marking sent records an outbound message and updates outbound timing. Still copy / edit / mark-sent only.

### 4. Real-time action generation + leak staleness
After every inbound/payment event, the action builder re-runs for the affected funnel (reply-to-new-message, review-proof, deliver-access, recover-failed-payment, confirm-unmatched), and related leak findings are marked `stale` (cheap) rather than running a heavy global diagnosis.

### 5. Outbound webhook dispatch v1 (`modules/realtime/src/outbound.ts`)
For configured, active outbound webhooks whose selected events include the fired event (`lead_created`, `whatsapp_clicked`, `payment_confirmed`, `deal_won`, `action_created`): sign the payload (HMAC), POST with a 4s timeout, and log the attempt to `webhook_deliveries`. **Delivery failures never break the domain update.**

### 6. Read models (`modules/realtime/src/feed.ts`)
`getActivityFeed` (live revenue feed), `getConversation` (inbox + window), `addConversationNote`, `suggestFromInbound`, `getIntegrationEvents` (status/mapping/matched).

### 7. Data model (migration 0014)
Conversations: `last_inbound_at`, `last_outbound_at`, `service_window_opened_at/expires_at`. New `conversation_messages` (inbound/outbound). `integration_events`: `processed_at`, `matched_lead_id/conversation_id/payment_state_id`. `leads.last_inbound_at`. `leak_findings.stale`. New `webhook_deliveries` log.

### 8. UI
A **Live Revenue Feed** in the funnel overview (pulsing live dot, recent events with relative time + open-lead). The **conversation inbox** + window badge + inbound-aware copilot in Lead Detail. An **events viewer** per connected integration (provider, mapped type, processed status).

### 9. API endpoints
```
GET  /funnels/:id/activity                          live revenue feed
GET  /integrations/:id/events                        recent integration events
GET  /leads/:id/conversation                         inbox + service window
POST /leads/:id/conversation/note                    private note
POST /leads/:id/copilot/suggest-from-inbound          suggest reply (never sends)
```
Webhook routes unchanged in contract; now drive enrichment. All session routes tenant-from-session; webhooks resolve tenant from connectionId server-side.

## Tests added (8)
Service window open/expiring/closed/unknown · Arabic hints · **activity feed + conversation + suggest routes reject header tenant in production** · **payment webhook resolves tenant from connectionId only (unknown → 404)** · conversation note validation. (DB-backed enrichment — inbound creates conversation/lead, payment matching, action generation — runs in the live suite.)

## Acceptance — all met
WhatsApp inbound updates conversation/lead ✓ · service window works ✓ · lead detail shows inbound messages ✓ · copilot suggests from inbound ✓ · **no auto-send** ✓ · payment webhook updates matched state ✓ · unmatched stored safely ✓ · actions from real-time events ✓ · activity feed ✓ · integration events have processed statuses ✓ · outbound dispatch for selected events ✓ · leak/action summaries update/stale ✓ · tests green ✓ · RTL premium ✓ · **connectionId resolves tenant, never header** ✓.

## Strict prohibitions respected
No auto-reply · no auto-send · no chatbot · no payment processing · no paid template sending · no broad automation builder · no heavy queue · no analytics bloat · no docs-instead-of-code · no tenant-from-header.

## Needs credentials only
Real provider tokens/secrets to receive live webhooks · `INTEGRATION_ENCRYPTION_KEY` (dev fallback works) · Postgres for the 2 skipped live-DB tests and real enrichment persistence.

## Next: Sprint 17 — real pilot onboarding, or deepen dispatch (retries/backoff) + tracking server-side dispatch.
