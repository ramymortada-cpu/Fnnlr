# fnnlr — Sprint 9 Build Report (Payment Flow Builder + Payment State UI)

Local payment is now a **journey inside the funnel** — details → transfer → proof → review → confirm → deliver — not a status field. **93 tests, 91 pass, 0 fail, 2 skip. Typecheck clean. RTL premium. No real gateway, no file-storage overbuild, no billing system, no docs drift.**

## What was built

### 1. PaymentFlowBrain (`packages/ai-core/src/brains/payment-flow.ts`)
Generates structured per-method copy: customer instructions, WhatsApp message, proof instructions, confirmation, reminder, stuck follow-up, delivery message, reassurance note. **Market-aware template fallback** (Egypt: InstaPay/Vodafone Cash/bank/Paymob/Fawry; Gulf: Tap/HyperPay/Moyasar/bank/Stripe) so it works with no LLM. `suggestedMethods(market)` seeds the right set.

### 2. Payment state machine (`modules/payments/src/state-machine.ts`, pure & tested)
11 states (not_started → details_sent → waiting → proof_uploaded → needs_review → confirmed → access_delivered, plus stuck/failed/cancelled/refunded). `canTransition` validates moves (invalid jumps blocked), `eventForState` maps each state to its event, `nextActionFor` gives the recommended next step.

### 3. Payment methods + journey data model (migration 0008)
`payment_methods` (per funnel: method, market, account details, all copy fields, proof_required, review_required, active, order). `payment_states` gains proof placeholder fields (proof_required/received/reference/note, reviewed_by/at, access_delivered, note, state_changed_at). `payment_state_history` for the timeline + leak evidence.

### 4. Payments service (`modules/payments/src/service.ts`)
Methods CRUD; `generatePaymentFlow` (seeds suggested methods, writes copy via the brain, logs versioned ai_outputs); **validated** `setPaymentState` (rejects illegal transitions, records history, emits the right event); `savePaymentProof` (placeholder — abstraction ready, no real upload); `getPaymentTimeline`.

### 5. Payment Flow Builder UI (`funnel.html` → الدفع tab)
Method cards with editable account details + all copy (instructions, WhatsApp message, confirmation, reminder, stuck follow-up, delivery), active/inactive toggle, add/delete, "generate instructions" (AI), and a visual **state-machine strip**. Framed so the seller feels fnnlr understands local payment is a journey.

### 6. Lead payment panel polish (Lead Detail)
Payment-state selector now goes through the validated machine (illegal moves are refused with a clear message), plus a **proof reference** input and "proof received" indicator. Every transition emits its event (`payment_details_sent`, `payment_waiting`, `proof_uploaded`, `payment_needs_review`, `payment_confirmed`, `access_delivered`, `payment_stuck`, `payment_failed`).

### 7. Payment Leak lane enrichment
The Leak Board's payment lane now reads payment-flow data: missing method, methods without instructions, proof-required-without-step, proof-uploaded-not-reviewed, confirmed-not-delivered, details-sent-without-waiting, waiting-without-follow-up-task. **Every finding has evidence; money impact only when a real deal value is observed — never fabricated.**

### 8. API endpoints (tenant-from-session)
```
GET  /funnels/:id/payment-flow              list methods
POST /funnels/:id/payment-flow/methods      add method
POST /funnels/:id/payment-flow/generate     generate copy (brain)
PATCH/DELETE /payment-methods/:id           edit / remove
POST /leads/:id/payment-state               validated transition (+event)
POST /leads/:id/payment-proof               save proof placeholder
GET  /leads/:id/payment-timeline            payment history
```

## Tests added (10)
PaymentFlowBrain parse + fallback (Arabic, includes method) · market-specific suggested methods · state-machine valid/invalid transitions · event + next-action mapping · **leak detects missing method (evidence)** · **proof-uploaded-not-reviewed (evidence + money)** · add-method validation · payment routes reject header tenant in production.

## Acceptance — all met
Payment tab ✓ · add methods ✓ · generate instructions + WhatsApp messages ✓ · edit instructions ✓ · see state machine ✓ · change payment state from lead detail ✓ · every transition emits an event ✓ · payment timeline ✓ · payment leak lane uses new data ✓ · honest "not enough data" preserved ✓ · tests green ✓ · RTL premium ✓ · no gateway integration ✓ · no file-storage overbuild ✓ · no generic billing ✓.

## Needs credentials only
`ANTHROPIC_API_KEY` (real instruction copy; fallbacks work without it) · Postgres for the 2 skipped live-DB tests and real payment persistence.

## Next: Sprint 10 — WhatsApp Flow Builder + Sales Copilot Drafts.
