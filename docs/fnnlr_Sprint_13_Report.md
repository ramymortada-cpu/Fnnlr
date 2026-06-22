# fnnlr — Sprint 13 Build Report (Pilot Readiness + UX Polish + Seed Demo Workspace)

fnnlr is now demo-ready: one click builds a complete, realistic Egyptian funnel workspace so anyone can see the product at full power in three minutes. **124 tests, 122 pass, 0 fail, 2 skip. Typecheck clean. RTL premium. No new big features, no infra drift.**

## What was built

### 1. Demo seed (`modules/demo/src/seed.ts`)
`seedDemo()` builds a full workspace by driving the **real services** (not raw inserts), so the demo exercises the same code paths a pilot user hits. Scenario: **أكاديمية نمو** — a paid training program selling Meta Ads → landing page → WhatsApp → InstaPay/Vodafone Cash. It creates: user+tenant+workspace (via real signup), funnel+offer+stages (onboarding brains, mock LLM → template fallback), a generated+published landing page, a tracked WhatsApp link (42 clicks), 120 page views funneling down, 12 leads across every stage, conversations, payment methods+copy, payment states+history (incl. proof-not-reviewed, confirmed, delivered), a WhatsApp flow, overdue tasks, then runs **leak diagnosis + action refresh + weekly report**, and seeds command-history examples. Idempotent (`destroyDemo` first); `mockLLM` keeps it working with no API key.

### 2. Pilot checklist (`modules/demo/src/checklist.ts`, pure & tested)
`computeChecklist(state)` → 14 ordered readiness items, each with done/CTA/target-tab, plus progress % and the missing list. `getChecklist` reads the real funnel state from the DB.

### 3. Demo service (`modules/demo/src/service.ts`)
`getChecklist` (DB-backed readiness), `isDemoTenant` (drives the demo banner).

### 4. UX polish + demo UX
- **Login:** a "🎬 جرّب مساحة ديمو جاهزة" button — seeds (if needed) and auto-logs-in.
- **Dashboard:** a demo banner ("أنت داخل مساحة ديمو جاهزة …") with **إعادة ضبط الديمو** (reset), shown only for the demo tenant.
- **Funnel Overview:** a **Pilot Readiness checklist** with a progress bar and per-gap CTAs that jump to the right tab.
- Removed the last stale "(Sprint 5)" placeholder button; every tab is live.

### 5. API endpoints
```
POST /demo/seed            public — build the demo, returns login
POST /demo/reset           public — rebuild the demo
GET  /demo/credentials     public — does the demo exist + login
GET  /demo/status          session — is this the demo workspace? (banner)
GET  /funnels/:id/pilot/checklist   session — readiness
```

### 6. PILOT_DEMO.md
A single practical file: run locally, seed, demo login, a 10-minute click-through, what value to show a pilot client, how to reset, and known limitations/credentials. No bloated docs.

## Tests added (5)
Checklist fully-set-up → 100% / empty → low progress with CTAs / proportional progress · demo credentials endpoint is public (no 401) · **pilot checklist route rejects header tenant in production**. The full seed (provisions a tenant DB) runs in the live suite alongside the 2 existing skips.

## Acceptance — all met
Demo seed works ✓ · demo login opens a rich dashboard ✓ · every funnel tab shows real value ✓ · public page published + polished ✓ · tracked links ✓ · leads across stages ✓ · payment states ✓ · WhatsApp flow ✓ · leak board has findings ✓ · action center has actions ✓ · weekly report exists ✓ · command-bar examples work on demo data ✓ · pilot checklist works ✓ · UX polish (banner, checklist, empty states, CTAs) ✓ · tests green ✓ · ready to show a pilot client ✓.

## Prohibitions respected
No new big features · no WhatsApp inbound/sending · no real payment integration · no autonomous agents · no big analytics dashboard · no infra drift · no strategy change.

## Needs credentials only
Postgres with CREATE DATABASE rights (the seed provisions a tenant DB) · `ANTHROPIC_API_KEY` optional (demo uses fallbacks otherwise).

## Next: Sprint 14 — Integrations Foundation, or begin actual pilot onboarding.
