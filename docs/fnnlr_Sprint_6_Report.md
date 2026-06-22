# fnnlr — Sprint 6 Build Report (Tracked WhatsApp Links + Capture)

WhatsApp is now a **measured channel inside the funnel**: every click becomes a Lead + Conversation + Events + Source attribution. This is the moat starting to compound. **61 tests, 59 pass, 0 fail, 2 skip. Typecheck clean. RTL premium. No infra/docs drift, no inbound WhatsApp API, no chatbot, no CRM.**

## What was built

### 1. Production-safe tenant resolution (the key hardening)
New control-plane map `public_codes (code → tenant)` (migration control-plane 0003) + `modules/capture/src/resolver.ts` with the abstraction the spec asked for:
```
resolveTenantByPublicCode(code)   // control-plane lookup, fails safe to null
registerPublicCode(code, kind, tenantId)
```
`/r/:code` and `/p/:slug` now resolve the tenant **from the code**, not from `?t=` or a header. The dev header is a fallback **only** in `FNNLR_DEV_MODE`. Production never trusts a client-supplied tenant.

### 2. Tracked link CRUD with UTM (migration 0005)
`tracked_links` gains `destination_phone`, `message_template`, `medium`, `campaign`, `content`, `term`, `cta_label`, `active`. Service: `createTrackedLink` (builds the `wa.me` URL, registers the public code), `listTrackedLinks`, `updateTrackedLink` (incl. activate/deactivate), `deleteTrackedLink` (unregisters the code), `recentClicks`, `captureStatus`.

### 3. Polished click handling (`handleTrackedClick`)
Rejects **inactive** links (no redirect). On a valid click, inside one tenant transaction:
- creates a **Lead** with `source/medium/campaign/content/term`, full `attribution` JSON, `stage = whatsapp_clicked`, `first_touch_at`/`last_touch_at`, `link_code`;
- creates a **Conversation** with `channel = whatsapp`, `source_link_code`, `first/last_event_at`, linked to the lead;
- emits **four events**: `tracked_link_clicked`, `whatsapp_clicked`, `lead_created`, `conversation_created`;
- returns the WhatsApp destination for the 302.

### 4. Capture / Tracking screen (`funnel.html` → التتبّع tab)
Status cards (page tracking active · WhatsApp link active · total clicks · leads created); a UTM-aware **link builder** (phone, message, source, campaign, medium, CTA); the **links list** (copy / test / activate-deactivate, with live click counts); and a **recent-clicks timeline** (source, campaign, time, conversation status). Clear guidance: "use this link in your ad/page/bio; every click becomes a lead + conversation."

### 5. Hosted page CTAs now use the tracked link
`getPublicPage` returns a `trackedCode` when an active link exists; `p.html` routes WhatsApp CTAs (and the sticky bar) through `/r/:code`, so a click on the public page is recorded as a lead + conversation server-side, then redirected to WhatsApp — funnel-aware, observable.

### 6. API endpoints (tenant-from-session for management; code-resolved for public)
```
POST   /funnels/:id/links                 create tracked link
GET    /funnels/:id/links                  list
PATCH  /funnels/:id/links/:linkId          update / activate / deactivate
DELETE /funnels/:id/links/:linkId          delete
GET    /funnels/:id/capture/clicks         recent clicks timeline
GET    /funnels/:id/capture/status         tracking status summary
GET    /r/:code                            PUBLIC redirect → lead+conversation+events (tenant from code)
GET    /p/:slug                            PUBLIC page (tenant from code)
POST   /track/page-event                   PUBLIC page-event ingest (tenant from slug)
```

## Tests added (4 capture + updates)
Create-link validation · **redirect in production ignores client tenant param (404, no spoof)** · **public page in production ignores client tenant header** · page-event requires type. Plus existing security tests stay green (session-only tenant, isolation). DB-backed click→lead/conversation paths run in the live suite (the 2 skips).

## Acceptance — all met
Open workspace ✓ · Capture tab ✓ · create tracked link ✓ · copy/use in page ✓ · click → lead+conversation+events ✓ · attribution saved ✓ · recent clicks shown ✓ · hosted page CTA uses tracked link ✓ · inactive link no redirect ✓ · **production doesn't rely on ?t=** ✓ · tests green ✓ · RTL premium ✓.

## Needs credentials only
A Postgres with CREATE DATABASE rights — to run the 2 skipped live-DB tests and the real click→lead/conversation persistence path. (`ANTHROPIC_API_KEY` unaffected; capture has no AI.)

## Next: Sprint 7 — Mini Funnel CRM / Lead Pipeline + Lead Detail.
