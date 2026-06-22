# fnnlr — Sprints 1–3 Build Report (the visible product begins)

Built in order, no infra drift, no new strategy docs. **40 tests, 38 pass, 0 fail, 2 skip (live-DB). Typecheck clean.**

## Sprint 1 — Auth + Workspace + Tenant Hardening ✅
- **Real auth** (`modules/auth`): scrypt password hashing, opaque sessions (only the token *hash* is stored), signup/login/logout/me.
- **Control-plane migration 0002**: `users`, `workspaces`, `workspace_members` (roles: owner/admin/member), `workspace_businesses` (mirrors tenant business id), `sessions`.
- **Server-side tenant resolution** (`resolveSession`): tenant is derived from the session → workspace → tenant DB. **The client can never set it.**
- **Hardening in the API**: `x-tenant-id` is honored **only** when `FNNLR_DEV_MODE=true`; in production a header-only tenant is rejected with 401.
- **Signup provisions** a dedicated tenant DB + workspace + business in one chain.
- **Tests:** password hashing/salting/rejection; token-hash separation; **"in production mode, x-tenant-id header does NOT grant access"**; no-session rejected; dev-mode opt-in; isolation tests still green.

## Sprint 2 — RTL Product Shell ✅
- **`apps/web/index.html`** — Arabic-first, RTL-native, premium-light, mobile-first.
- Login/signup → app shell with sidebar nav + **workspace selector** (avatar, name, email).
- **Dashboard with exactly 4 cards**: إيراد الشهر · عملاء محتاجين تحرّك · أكبر تسريب · أسرع إصلاح النهاردة (placeholders with honest "not enough data yet" states).
- **Funnel list** + **create CTA** + respectful Arabic empty state.
- Talks to the API with **Bearer token only — never sends a tenant id** (tenant is server-resolved). Session restores on reload via `/auth/me`.

## Sprint 3 — Funnel Onboarding + Blueprint Screen ✅
- **`apps/web/onboarding.html`** — one-question-at-a-time wizard (11 questions: business, market, offer, price, buyer, traffic, sales channel, payment methods, tone, goal) with progress bar, RTL, mobile-first, validation per step.
- On finish → calls **existing** `POST /funnels` → runs **FunnelArchitectBrain + OfferBrain** → **persists editable records** (journey, offer, funnel_stages) → emits events.
- **AI Funnel Architect result screen**: funnel type, objective, ICP, main promise, stages (with per-stage expected leak), WhatsApp role, payment role, expected leaks, launch checklist. "Open the funnel & edit" CTA.
- **Degraded banner** shown when no AI key is configured — the brain falls back to a real, editable draft; no fake confidence.
- Records are editable (not a PDF/static text).
- **Tests:** onboarding answers → complete persistable blueprint (with LLM) · usable degraded blueprint (no key) · Arabic channel-aware offer.

## What works end-to-end now
Sign up → land in an RTL app scoped to your isolated tenant (server-resolved) → see the 4-card dashboard + empty funnel list → "+ قمع جديد" → answer the wizard → fnnlr builds a full Arabic funnel blueprint → it's saved as editable records → view the architect result. **First time fnnlr is a product the customer sees, not just a spine.**

## Still needs external credentials (not code)
- `ANTHROPIC_API_KEY` — real AI generation (fallbacks work without it).
- A Postgres with CREATE DATABASE rights — to run the 2 skipped live-DB tests + the real auth/persistence path.

## Run locally
```
cd code/fnnlr && npm install
# .env: CONTROL_PLANE_DATABASE_URL + TENANT_DB_ADMIN_URL  (+ optional ANTHROPIC_API_KEY)
npm run migrate:control        # applies control-plane 0001 + 0002 (auth)
npm run api                    # API on :8787
# serve apps/web/ statically (any static server) and open index.html
npm test                       # 40 tests
```

## Next (Sprint 4): Offer Builder + Funnel Map — edit the persisted records in the UI.
