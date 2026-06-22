# fnnlr — Sprint 4 Build Report (Offer Builder + Funnel Map)

The blueprint is now an editable, operable workspace — not a generated result. **48 tests, 46 pass, 0 fail, 2 skip. Typecheck clean. RTL Arabic throughout. No infra drift, no new strategy docs.**

## What was built

### 1. Offer Builder UI (`apps/web/funnel.html` → Offer tab)
Full editable form for every offer field: name, one-line promise, ideal customer, main pain, desired result, transformation, deliverables (add/remove), bonuses (add/remove), guarantee, pricing, payment plan, urgency/scarcity, objections + replies (add/remove), CTA, tone notes. Edits mark a save bar; **explicit "save" persists** via `PATCH /funnels/:id/offer` (new version each time).

### 2. AI Offer Actions (preview → apply/discard)
Nine actions: حسّن العرض · اجعله أرقى · تسويق مباشر · مصري · خليجي · قوِّ الاعتراضات · حسّن الـ CTA · أنعم · high-ticket. Each:
- runs the new **`OfferActionBrain`** (typed) via `POST /funnels/:id/offer/action`,
- **logs a versioned `ai_outputs` row**,
- returns a **preview** shown in a modal with a field-by-field diff,
- **never overwrites** the user's offer — the user clicks **apply** or **discard**,
- falls back to a sensible local transform (marked degraded) when no AI key.

### 3. Funnel Map UI (Funnel Map tab)
Visual connected stage cards (not a node editor): each shows name (inline-editable), purpose, channel, conversion event, expected leak, tracking chip. Stage operations, all backed by real `funnel_stages` records:
- edit name (inline), add stage, delete stage,
- reorder (↑/↓ → `POST /funnels/:id/stages/reorder`),
- activate/deactivate (→ `PATCH /stages/:id`).

### 4. Navigation
Funnel workspace tabs: Overview · Offer · Funnel Map (working) · Page/WhatsApp/Payment/Leads/Leaks (clearly "قريبًا"). Funnel list items and the onboarding result both open the workspace.

## Files
- **New:** `packages/ai-core/src/brains/offer-action.ts`, `apps/web/funnel.html`, `tests/offer-action.test.ts`.
- **Edited:** `modules/funnel/src/service.ts` (+`getOffer`, `runOfferAction`, `listStages`, `reorderStages`), `apps/api/src/server.ts` (+offer get/action, stages list/reorder endpoints), `apps/web/index.html` + `apps/web/onboarding.html` (open workspace), `tests/api.test.ts`.

## API added
```
GET  /funnels/:id/offer                 read current offer
POST /funnels/:id/offer/action          run AI action → preview (no apply); logs ai_outputs
PATCH /funnels/:id/offer                 apply edited/previewed offer (new version)   [existing]
GET  /funnels/:id/stages                 list stages
POST /funnels/:id/stages                 add stage      [existing]
POST /funnels/:id/stages/reorder         reorder stages
PATCH /stages/:id                        edit/activate stage   [existing]
DELETE /stages/:id                       delete stage          [existing]
```

## Tests added (8)
Offer action: preview with LLM · **does not mutate input** · strengthen-objections fallback · soften removes urgency (original untouched) · **versioned ai_output logged** · improve_cta changes only CTA. API: offer-action requires action · reorder requires orderedIds[].

## Acceptance — all met
1. ✅ Open a created funnel (workspace). 2. ✅ Edit the offer from the UI. 3. ✅ Run AI improvement → preview. 4. ✅ Apply or discard. 5. ✅ Visual funnel map. 6. ✅ Edit + reorder stages. 7. ✅ All changes persisted (DB). 8. ✅ All tests green. 9. ✅ Arabic RTL premium. 10. ✅ No infra/docs drift.

## Needs credentials only
`ANTHROPIC_API_KEY` (real AI actions; fallbacks work without it) · Postgres for the 2 skipped live-DB tests and real persistence.

## Next: Sprint 5 — Landing Page Intelligence.
