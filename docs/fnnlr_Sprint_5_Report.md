# fnnlr — Sprint 5 Build Report (Landing Page Intelligence + Hosted Page)

The Offer + Funnel Map now become a generatable, editable, publishable, tracked Arabic landing page. **57 tests, 55 pass, 0 fail, 2 skip. Typecheck clean. RTL premium. No infra/docs drift, no Webflow clone, no drag-and-drop.**

## What was built

### 1. PageBrain (`packages/ai-core/src/brains/page.ts`)
Typed. Inputs: funnel, offer, market, product type, tone, sales channel, payment methods, WhatsApp role, expected leaks. Outputs a **structured** page plan (not a blob): goal, angle, section order, sections (hero/problem/promise/offer/benefits/proof/pricing/guarantee/faq/cta_whatsapp/cta_payment/final_cta — each with title/body/bullets/CTA), mobile notes, trust elements, expected leaks, tracking requirements. **WhatsApp-first CTA** when the channel is WhatsApp. Fallback produces a complete, usable Arabic page without an LLM (degraded).

### 2. Page records (migration 0004)
`pages` gains `slug`, `published`, `published_at`, `goal`, `angle`, `whatsapp_destination`. `page_sections` (from 0003) holds each editable section as a record: type, content `{title, body, bullets, ctaLabel, ctaTarget}`, visible, position.

### 3. API endpoints (all tenant-from-session)
```
POST /funnels/:id/page/generate          run PageBrain → persist page + sections
GET  /funnels/:id/page                    read page + sections
POST /funnels/:id/page/sections           add section
POST /funnels/:id/page/sections/reorder   reorder
POST /funnels/:id/page/publish            slug + mark published
POST /funnels/:id/page/unpublish
PATCH  /sections/:id                       edit content / toggle visible
DELETE /sections/:id                       delete
POST /sections/:id/action                  per-section AI action → preview (no apply)
GET  /p/:slug                              PUBLIC read (no login) — published + visible only
POST /track/page-event                     PUBLIC tracking ingest
```

### 4. Landing Page Intelligence UI (`apps/web/funnel.html` → Page tab, now active)
Generate button → page goal/angle + per-section editor: edit title/body/CTA, show/hide, reorder (↑/↓), delete. **Per-section AI actions** (rewrite hero, CTA WhatsApp-first, premium, shorter, add FAQ objections, strengthen proof, Egyptian, Gulf) — each **preview → apply/discard**, versioned `ai_outputs`, never overwrites without consent.

### 5. Hosted public page (`apps/web/p.html`)
Clean, mobile-first RTL page that renders **only published + visible** sections. Hero, sections, pricing, FAQ, sticky WhatsApp CTA. **No login to view.** Premium-light, not a builder.

### 6. Publish flow
Publish → generates a slug, marks published, exposes `/p/:slug`. Preview, publish/unpublish, copy public link, tracking-status shown in the Page tab.

### 7. Tracking
The hosted page emits `page_view`, `scroll_depth` (25/50/75/100), `price_reached`, `cta_clicked`, `whatsapp_clicked`, `payment_clicked` to `/track/page-event` → stored in `page_events` + `events`. **No fake leak diagnosis** — events are just stored correctly, seeding real Page Leak Diagnosis later.

## Files
- **New:** `packages/ai-core/src/brains/page.ts`, `page-section-action.ts`; `modules/pages/src/service.ts`; `packages/db/tenant/migrations/0004_page_publish.sql`; `apps/web/p.html`; `tests/page.test.ts`.
- **Edited:** `apps/api/src/server.ts` (page + public + section routes), `apps/web/funnel.html` (Page tab), `tests/api.test.ts`.

## Tests added (10)
PageBrain: parse valid JSON · full fallback page (WhatsApp-first hero) · malformed → fallback. Section action: preview + input untouched · versioned log. API: reorder validation · section-action validation · **public page needs no auth but tenant context** · page-event needs type.

## Security held
- App pages send **only the Bearer token** — never a tenant id.
- Protected page endpoints resolve tenant from session; spoofing still rejected in production (Sprint 1 tests green).
- Public read exposes **only** published pages, **only** visible sections, **only** presentational fields — no private tenant data.
- The `/p/:slug` demo uses a `?t=` dev param for tenant; production maps slug→tenant in the control-plane (no header trust).

## Acceptance — all met
Open workspace ✓ · Page tab ✓ · Generate ✓ · structured Arabic page ✓ · edit sections ✓ · hide/show ✓ · reorder ✓ · preview ✓ · publish public ✓ · public page no login ✓ · page events recorded ✓ · tests green ✓ · app sends no x-tenant-id ✓ · no drag-and-drop overbuild ✓ · RTL premium ✓.

## Needs credentials only
`ANTHROPIC_API_KEY` (real generation; fallbacks work without it) · Postgres for the 2 skipped live-DB tests + real persistence.

## Next: Sprint 6 — Tracked WhatsApp Links + Capture screen + Lead creation polish.
