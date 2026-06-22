# fnnlr — Full Rebuild Plan
### The Strongest Arabic-Native AI Funnel Builder + Revenue Journey OS for Egypt & the Gulf

> Grounded in a **direct audit of the actual repo and docs** (not memory). Current verified state: 6 strategy docs; a tested spine (database-per-tenant, automation engine, scheduler, API); a started product layer (ai-core brains, funnel + capture services, migration 0003); **33 tests, 31 pass, 2 skip (live-DB), typecheck clean**; plus a few stray empty folders. Every decision below references what's really there.

---

## 1. Executive Decision

**Do not reset the repo. Reorganize and build forward on it.** The two hardest-to-retrofit pieces (database-per-tenant isolation, durable automation engine) are built and tested — throwing them away would be malpractice. The real gap is the **user-facing product** (auth, web app, the funnel-builder screens, page intelligence, leak board). So this is a *documentation reset* + a *product-layer build sprint system*, not a code reset. One archive of the pre-code strategy docs, one clean final doc set, and a 16-sprint plan to a pilot-ready V1.

## 2. Final Product Definition

fnnlr is an **Arabic-native AI Funnel Builder + Revenue Journey OS** for Egypt & the Gulf. It helps course creators, consultants, coaches, training companies, digital-product and service sellers (and later agencies/SMBs) **build → launch → track → diagnose → improve** the revenue journey: *Ad → Landing Page → WhatsApp → Qualification → Payment → Proof/Confirmation → Delivery → Follow-up → Leak Diagnosis → AI Optimization.* Arabic-first, RTL-native, WhatsApp-spined, local-payment-aware, observed-data-driven, a system of record with a compounding data moat.

## 3. What Exists Now: Truth Audit

**Verified present & tested (the spine):**
- `packages/db/src/router.ts` — database-per-tenant router (control-plane + isolated tenant DBs). ✅
- `modules/provisioning` — create/drop a dedicated DB per tenant; applies all migrations. ✅
- `modules/automation` — durable, idempotent, WhatsApp-window-aware engine + guards + scheduler + synthetic triggers + recipes. ✅ tested
- `modules/channels/src/whatsapp.ts` — WhatsApp Cloud API sender + window tracking. ⚠️ inert (needs BSP creds; `leads.phone` now added in 0003).
- `apps/api/src/server.ts` — dependency-free HTTP API. ⚠️ trusts `x-tenant-id` (must die in prod).
- `apps/automation-builder/index.html` — RTL automation builder. ✅ (a tool, not the product).

**Verified present & tested (product layer, started this cycle):**
- `packages/ai-core` — AI gateway + Brain base + `FunnelArchitectBrain` + `OfferBrain` + mock/real LLM clients. ✅ tested (mocked LLM + fallbacks).
- `modules/funnel/src/service.ts` — onboarding → brains → persisted editable records (journey/offer/stages). ✅
- `modules/capture/src/service.ts` — tracked WhatsApp links → lead+conversation+events; page-event ingest. ✅
- `packages/db/tenant/migrations/0003_funnel_builder.sql` — funnel_stages, page_sections, whatsapp_flows, templates, recommendations, tracked_links, lead contact fields. ✅

**Verified ABSENT (the real gap):**
- ❌ No **Auth** module (the grep hits are crypto/HTTP, not auth).
- ❌ No **web app** (only the standalone automation-builder HTML). No Next.js, no screens, no RTL design system.
- ❌ No **PageBrain / WhatsAppSalesBrain / PaymentFlowBrain / FollowupBrain / LeakDiagnosisBrain / CRO / Optimizer / Report** brains (only Architect + Offer exist).
- ❌ No **Leak Board**, no **pipeline UI**, no **payment-flow UI**, no **hosted page**.

**Stray/empty (cleanup):** `modules/offer/` (empty — offer logic lives in `ai-core/brains/offer.ts`), `apps/api/src/routes/` (empty), `packages/prompts/src/` (empty), and a literally mis-created folder named `modules/automation/src/{triggers,conditions,actions,guards}` (a shell-glob artifact). The 6 strategy docs are pre-code and partly superseded by the build.

## 4. Keep / Harden / Rewrite / Merge / Archive table

| Area / File | Current status | Decision | Why | Action |
|---|---|---|---|---|
| `packages/db/*` (router, migrations 0001–0003) | tested | **Keep** | isolation core, correct | minor: add migration locking |
| `modules/provisioning` | tested | **Harden** | works; no backup/monitoring | add backup/restore, pool registry |
| `modules/automation` | tested | **Keep** | strong, reused for sends/follow-up | none |
| `modules/channels/whatsapp` | inert | **Harden** | needs BSP creds + inbound webhook | wire creds + `/webhooks/whatsapp` |
| `apps/api/server.ts` | works | **Harden** | trusts `x-tenant-id` | replace with session→tenant (Sprint 1) |
| `packages/ai-core` | tested | **Keep** | typed, mockable, correct pattern | extend with more brains |
| `modules/funnel`, `modules/capture` | tested | **Keep** | product core, on the spine | extend |
| `apps/automation-builder` | works | **Keep (internal)** | useful ops tool | move under an "advanced" area later |
| `modules/offer/` (empty) | empty | **Delete** | duplicate; logic is in ai-core | remove folder |
| `apps/api/src/routes/` (empty) | empty | **Delete** | unused scaffold | remove |
| `packages/prompts/src/` (empty) | empty | **Rewrite** | prompts belong here, not inline | populate from brains |
| `modules/.../{triggers,...}` folder | glob artifact | **Delete** | created by a shell mistake | remove |
| 6 strategy docs (`fnnlr_*`) | pre-code | **Archive + Merge** | superseded by build | move to `/docs/archive`; replace with final set |
| Old prompt files (`0X_*_Prompt.md`, `Masar_AI_*`) | stale | **Archive** | old name / pre-code | `/docs/archive` |
| `HANDOFF_FOR_CODEX.md` | current | **Rewrite** | becomes `docs/10_CODEX_EXECUTION_HANDOFF.md` | regenerate |

## 5. Final Architecture

Four layers on one modular monolith (Next.js app + worker), database-per-tenant.

```
LAYER 3 OPTIMIZE  Leak Board · Optimizer/CRO/Report brains · Copilots · Weekly Report
LAYER 2 TRACK     Capture (links/QR/snippet) · Event spine · Pipeline · Payment states
LAYER 1 BUILD     Onboarding · Funnel Architect · Offer · Funnel Map · Page Intelligence ·
                  Hosted page · WhatsApp Flow · Payment Flow
LAYER 0 SPINE     DB-per-tenant · Automation engine · Scheduler · API · WhatsApp sender   ✅ built
CROSS-CUTTING     Auth/session→tenant · AI gateway (12 brains) · Web app (RTL) · Event spine
```
Rule preserved: **instrument (Layer 2) before you advise (Layer 3).**

## 6. Final Product Modules

`auth` (new) · `ai` (ai-core, extend) · `funnels` (extend) · `offer` (in ai-core) · `pages` (new) · `whatsapp-flow` (new) · `payments` (build UI on existing `payment_states`) · `pipeline` (new on `leads`) · `capture` (extend) · `leaks` (new on `leak_findings`) · `optimizer` (new) · `channels` (harden) · `automation` (keep) · `provisioning` (harden) · `reports` (new). Each: typed public API, events, tests, tenant-scoped via `withTenant`.

## 7. Final Data Model

**Control-plane DB:** `tenants` (exists), `tenant_users`, `benchmark_aggregates` (exists), `control_audit` (exists), **+new** `users`, `sessions`, `roles`, `tenant_credentials` (encrypted BSP/payment tokens).
**Tenant DB (isolated, no `ws_id`):** existing `businesses, journeys, offers, pages, page_events, leads, conversations, messages, payment_states, events, leak_findings, ai_outputs, audit_events`, automation tables, and 0003's `funnel_stages, page_sections, whatsapp_flows, whatsapp_message_templates, recommendations, tracked_links`. **+to add:** `payment_methods` (config registry), `followup_sequences` (table), `reports`, `tasks`, `integration_connections`.
**Operational answers:** benchmarks = anonymized aggregates pushed to control-plane only; migrations = `migrate-all` loops every tenant DB (add advisory locks); deletion = drop the tenant DB (true erasure); backups = per-DB PITR; pooling = per-tenant pool registry with idle eviction; audit = `audit_events` per tenant + `control_audit` centrally.

## 8. Final AI Brain System

12 typed brains behind the existing `AIGateway`, each: typed I/O · versioned `ai_outputs` · deterministic mocked-LLM tests · explicit fallback · `degraded` flag. **Built:** FunnelArchitect, Offer. **To build:** Page, WhatsAppSales, PaymentFlow, Followup, LeakDiagnosis, ArabicCopyScoring, CRO, FunnelOptimizer, RevenueImpact, Report. UI surfaces: Architect→onboarding result; Offer→offer builder; Page→page editor; WhatsAppSales→flow builder; Leak/Report→leak board + weekly report; Optimizer/CRO/CopyScore→AI command bar. **No giant prompt; no hallucinated confidence.**

## 9. Final Event & Tracking System

Spine table exists; emitters partly wired (funnel_created, offer_generated, whatsapp_clicked, lead_created, page events). **Complete the set:** `funnel_created, offer_generated/edited, page_generated/published, page_view, scroll_depth, price_reached, cta_clicked, whatsapp_clicked, lead_created, conversation_created, first_reply_logged, price_sent, payment_details_sent, proof_uploaded, payment_confirmed, access_delivered, followup_due/sent, deal_won/lost, leak_detected, recommendation_created/applied.` Events feed automation, leak board, weekly report, future benchmarks. **Leak board reads only real events** — else show "not enough data."

## 10. Final UI/UX Screen Map (26 screens)

Login · Workspace selector · Business setup · Dashboard (4 cards) · Funnel list · Onboarding wizard · Architect result · Funnel map · Offer Builder · Page Intelligence editor · Hosted page preview · Hosted page publish/settings · WhatsApp Flow Builder · Payment Flow Builder · Capture/tracking setup · Lead pipeline · Lead detail · Conversation detail · Payment state · Leak Board · AI Command Bar · Weekly Diagnosis Report · Settings · Integrations · Team/roles · Data Vault. Each (per the full doc) defines: purpose · primary action · data · API endpoints · AI features · events emitted · empty state · mobile behavior. RTL-native, mobile-first, premium-calm, one primary action per screen.

## 11. Final Integration Architecture

All third-party creds in control-plane `tenant_credentials` (encrypted). **WhatsApp**: BSP/Meta Cloud API (send via `channels`, inbound via `/webhooks/whatsapp`, signature-verified, opens free window). **Payments**: state-machine-first; gateways (Paymob/Fawry/Tap/HyperPay/Moyasar) added later as webhook adapters; manual proof works day one. **Attribution**: Meta/GA via tracked links + UTM. Adapters are swappable; nothing hard-coded.

## 12. Security & Multi-Tenancy Plan

1) **Kill `x-tenant-id` trust** → server-side session resolves user→workspace→business→tenant (Sprint 1, blocking). 2) Auth + RBAC (owner/admin/member; agency-ready). 3) Encrypted per-tenant credentials. 4) Migration advisory locks. 5) Pool registry caps. 6) Per-tenant backup/restore + monitoring; per-tenant encryption + region pin for enterprise. 7) Benchmarks anonymized only. 8) **Never** tenant data without `withTenant(tenantId)`; isolation tests stay green and block deploy.

## 13. File-Level Rebuild Plan

- `/apps/api` → **harden** (auth, kill header trust). `/apps/web` → **create** (Next.js RTL app — the biggest new build). `/apps/automation-builder` → **keep** internal.
- `/modules/auth` → **create**. `/modules/ai`(ai-core) → **keep+extend** (10 more brains). `/modules/funnels` → **keep+extend**. `/modules/capture` → **keep+extend** (QR, UTM, snippet). `/modules/analytics` → **create** (reports). `/modules/leaks` → **create**. `/modules/payments` → **create UI** on existing states. `/modules/channels` → **harden**. `/modules/automation`,`/provisioning` → **keep/harden**. `/modules/offer` → **delete** (empty).
- `/packages/db` → **keep** (+`payment_methods`,`followup_sequences`,`reports`,`tasks` migrations). `/packages/config` → **create**. `/packages/ui` → **create** (RTL tokens). `/packages/types` → **create** (or fold into ai-core/contracts). `/packages/prompts` → **populate**.
- `/docs` → **archive old, create final set**. `/tests` → **keep+extend**. Root `README` → **rewrite**. Handoff/old strategy/build packs → **archive**.

## 14. Documentation Rebuild Plan

Archive the 6 pre-code docs + old prompt files to `/docs/archive`. Create the final, non-conflicting set: `README.md`, `00_PRODUCT_CONSTITUTION`, `01_FINAL_PRODUCT_VISION`, `02_ARCHITECTURE`, `03_DATA_MODEL`, `04_AI_BRAINS`, `05_EVENT_TRACKING`, `06_UI_UX_SCREEN_MAP`, `07_INTEGRATIONS_EGYPT_GULF`, `08_SECURITY_TENANCY`, `09_SPRINT_PLAN`, `10_CODEX_EXECUTION_HANDOFF`, `11_TESTING_QA`, `12_PILOT_READINESS`. Each concise but implementation-complete; single source of truth per topic.

## 15. Sprint Plan: Sprint 0 → Sprint 15

Each sprint: objective · user-visible outcome · modules · acceptance · tests · not-now · deps · risks. (Condensed here; expanded in `09_SPRINT_PLAN`.)

- **S0 Repo reset & truth audit** — delete stray dirs, archive old docs, write final docs, CI with isolation gate. *Outcome:* clean repo, one truth. *Test:* suite green in CI.
- **S1 Auth, workspace, tenant hardening** — auth/session→tenant, RBAC, kill `x-tenant-id`. *Outcome:* secure login scoped to a tenant. *Test:* spoofed tenant rejected; isolation green. *Risk:* the one blocking dependency.
- **S2 Product shell & RTL SaaS layout** — Next.js app, RTL tokens, nav, dashboard shell, funnel list. *Outcome:* user logs in, sees the app.
- **S3 Onboarding + Funnel Architect** — wizard → `createFunnelFromOnboarding` (built) → blueprint screen. *Outcome:* user creates a funnel, gets a blueprint. *Test:* persistence + brain contract (exist).
- **S4 Offer Builder + Funnel Map** — edit offer (versioned), editable stage cards. *Outcome:* editable system of record. *Test:* offer version + stage CRUD.
- **S5 Landing Page Intelligence** — PageBrain + editable sections. *Test:* PageBrain contract (mocked).
- **S6 Hosted funnel page + tracking** — publish RTL page + snippet emitting page events. *Outcome:* a real tracked page. *Test:* page-event ingestion.
- **S7 Tracked WhatsApp links + capture** — links/QR (service built) + UI; clicks create lead/conversation. *Outcome:* WhatsApp becomes observable. *Test:* redirect creates lead+conversation.
- **S8 WhatsApp Flow Builder** — WhatsAppSalesBrain + flow records + UI (copilot, approval). *Test:* brain contract; no paid send w/o approval.
- **S9 Payment Flow Builder + states** — methods registry + state-machine UI + manual proof. *Test:* state transitions.
- **S10 Funnel CRM / pipeline** — 12 stages + filters + lead detail. *Test:* stage changes.
- **S11 Leak Board v1** — LeakDiagnosisBrain on observed events + board + money impact + "not enough data" guard. *Test:* fixture events → ranking; no-hallucination guard.
- **S12 AI Command Bar** — context-bound actions on funnel objects. *Test:* command routes to correct brain.
- **S13 Weekly Diagnosis Report** — ReportBrain artifact. *Test:* report from fixtures.
- **S14 Integrations foundation** — inbound WhatsApp webhook, payment-webhook + Meta/GA scaffolding. *Test:* signature verify.
- **S15 V1 QA, polish, pilot readiness** — E2E, perf, 10–20 pilot businesses. *Test:* full-journey E2E green.

## 16. V0 → V5 Roadmap

- **V0 Internal prototype** *(now)* — spine + funnel creation + capture. Success: internal flow works.
- **V1 Pilot-ready** — auth + web app + build/track/leak board (S1–S11). Customer: EG/Gulf course/consult sellers. Success: 10–20 pilots build+publish+see a real leak. Risk: web-app scope.
- **V2 Live channels** — WhatsApp API send/receive, payment webhooks, copilots. Success: automated follow-up/recovery in production.
- **V3 Optimization & benchmarking** — Optimizer/CRO + anonymized benchmarks. Success: measurable conversion lift.
- **V4 Agency layer & white-label** — multi-client console, branding. Customer: agencies. Success: agency retention.
- **V5 AI revenue workforce** — supervised autonomous agents across the journey. Success: revenue recovered per tenant.

## 17. What Not To Build Yet

Generic CRM · full drag-drop/Webflow clone · automation node editor · autonomous WhatsApp bot · course platform · payment processor · giant analytics dashboard · template marketplace · social scheduler · generic chatbot · enterprise white-label before pilot. Each returns only if it serves build→launch→track→diagnose→improve.

## 18. Testing & QA Plan

Keep the green suite (33/31/2-skip). Add per layer: auth→tenant resolution + spoof rejection; isolation (stay green, blocking); funnel creation + persistence; each brain contract with mocked LLM + fallback; page publish + event ingestion; tracked redirect → lead/conversation; payment state transitions; pipeline stage changes; **leak detection from fixtures + no-hallucination when data insufficient**; RTL render sanity; full-journey E2E. Gates: isolation + auth + leak-fixture block deploy.

## 19. Pilot Readiness Plan

Ready when: auth + tenant resolution solid; onboarding→blueprint→edit works; hosted page publishes + tracks; tracked WhatsApp links capture leads; pipeline + manual payment states usable; Leak Board shows a real leak or an honest "not enough data"; weekly report sends; per-tenant backup + monitoring on; isolation/auth/leak tests green. Pilot: 10–20 EG/Gulf sellers, weekly leak review, one headline metric (revenue recovered or reply-time improvement).

## 20. Codex Execution Handoff

```
PRE: read docs/00–12. Run npm install && npm test (33 tests, expect 31 pass / 2 skip). tsc --noEmit clean.
     Tenancy = database-per-tenant. NO ws_id. Reach tenant data only via withTenant(tenantId).
S0  delete: modules/offer/, apps/api/src/routes/, packages/prompts/src(empty), the {triggers,...} glob folder.
    archive: 6 strategy docs + old prompt/Masar files → docs/archive. write docs/00–12. CI isolation gate.
S1  modules/auth (control-plane users/sessions/OTP + RBAC); resolve tenant from session; DELETE x-tenant-id trust.
S2  apps/web (Next.js RTL shell, tokens, nav, dashboard, funnel list).
S3  onboarding wizard → existing createFunnelFromOnboarding → architect result screen.
S4  offer builder (versioned) + funnel map (stage CRUD — endpoints exist).
S5  PageBrain + page sections editor.
S6  hosted RTL page + tracking snippet (page_view/scroll/price/cta).
S7  tracked links UI + QR (createTrackedLink/handleTrackedClick exist).
S8  WhatsAppSalesBrain + flow builder (reuse automation guards for sends).
S9  payments UI on payment_states + payment_methods registry + manual proof.
S10 pipeline (12 stages) + lead detail.
S11 LeakDiagnosisBrain on observed events + Leak Board + "not enough data" guard.
S12 AI command bar (route to brains). S13 ReportBrain weekly report.
S14 inbound WhatsApp webhook + payment webhook scaffolding. S15 E2E + pilot.
RULES: no tenant data without withTenant · no paid WhatsApp send without approval · benchmarks anonymized ·
       leak diagnosis from observed events only · AI outputs versioned · degraded flag, never fake confidence ·
       don't break existing tests · keep RTL correct.
```

## 21. Final Founder-Level Recommendation

The honest position: you have a **strong spine and a correctly-started product layer** — better than most pre-seed teams. The risk now is the opposite of before: **drifting back into infrastructure** instead of shipping the visible product. The single highest-leverage move is **Sprint 1 + Sprint 2 + Sprint 3** — auth, the RTL web shell, and onboarding→blueprint on screen — because that turns invisible plumbing into something a real Egyptian/Gulf seller can touch in 10 minutes. Build the web app, wire the brains you already have to real screens, make capture real, then let the Leak Board prove the category. Keep the moat discipline (instrument before advise; system of record; WhatsApp spine; local payment; observed-data diagnosis) and don't widen scope until 10–20 pilots are live. The spine is done; **now build the product the customer actually sees.**

---

*Grounded in a direct audit of `code/fnnlr` (modules, migrations, tests, stray dirs) and the six strategy docs. Current suite: 33 tests, 31 pass, 2 skip (live-DB), typecheck clean. No claims beyond what the repo shows.*
