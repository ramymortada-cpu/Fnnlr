# fnnlr — The Execution Blueprint
> ## ⚠️ ARCHITECTURE UPDATE — read this first (post-build amendment)
>
> This document was written **before** the foundation code existed. Two decisions changed during the build, and the **codebase is now the source of truth**. Where this document still describes the older plan, the code below overrides it:
>
> 1. **Tenancy is DATABASE-PER-TENANT, not shared-DB + RLS.** Every individual seller and every agency gets its **own physical PostgreSQL database**. A small shared **control-plane DB** holds only the tenant registry, routing, and **anonymized** benchmark aggregates (never raw tenant data). Cross-tenant access is impossible at the infrastructure layer. This is implemented and tested: `packages/db/src/router.ts` (connection router), `modules/provisioning` (creates/drops a dedicated DB per tenant), and the isolation tests. Per-tenant delete = dropping that tenant's whole database (true erasure).
>
> 2. **A production-grade Automation Engine is BUILT** (it was "plan only" here). It is WhatsApp-economics-aware (sends free inside the 24h/72h windows, waits/skips/▸requires-approval for paid), has anti-spam + cooldown guards, durable waits (a scheduler resumes them), DB-level idempotency, human-in-the-loop approval, an HTTP API, and an RTL-Arabic visual builder. See `modules/automation`, `modules/channels`, `apps/api`, `apps/automation-builder`, and `HANDOFF_FOR_CODEX.md`.
>
> Everywhere below, read "shared-DB + RLS" as **"database-per-tenant"**, and treat the automation engine as **already built**. The product/strategy decisions in this document are unchanged.
>
> ---
>
### The bridge from Product Bible to a real build — greenfield edition

> **Honest framing (consistent with the prior three responses).** This prompt assumes a repository is attached and asks for "current code status" throughout. **There is still no source code — this is a greenfield build.** That is not a gap to paper over; for an execution blueprint it's the single most important fact, because *greenfield means you get to set every foundation right the first time.* So everywhere the prompt asks "what current code supports," the honest, repeated answer is **"nothing exists yet — build it per this plan."** Claims from your docs are **[in docs]**; everything else is an architecture/execution recommendation. This document is designed to be handed directly to a founding team or a coding agent (Claude Code/Codex) to *start* the repo. When code exists, re-run this prompt against it and treat this as the plan it must converge to.

---

## 1. Product Bible → Execution Translation

- **Chosen category:** Arabic-Native Revenue Journey OS (نظام تشغيل الإيراد العربي).
- **Core promise:** *See where your revenue leaks, recover it, and prove it — every week.*
- **Main customer:** the overwhelmed, phone-first Arab SMB owner who sells in WhatsApp.
- **First wedge:** mid-ticket Arabic course/program sellers (Meta ads → WhatsApp → local payment, 1–3 sellers).
- **Full destination:** generate the journey → capture it as observed data → diagnose leaks → recover revenue → prove value → progressively operate it with an AI workforce → expand via agency channel.
- **Most important pillars:** Event Spine · System of Record · WhatsApp Spine · Payment Engine · Leak Intelligence · (then) AI Workforce · Data Vault · Value Engine.
- **Must-have trust layer:** tenant isolation + fnnlr Vault (visible, controllable memory).
- **Must-have data layer:** event-sourced spine with `Conversation` as a top-level object.
- **Must-have AI layer:** specialized Brains behind interfaces (not one monolithic prompt), every output versioned + scoreable.
- **Must-have UX layer:** RTL-native, mobile-first, 4-card dashboard, the #1 Leak Card as hero.
- **Must-have value proof:** Revenue Recovered + leak-fix attribution, visible from early.

### The smallest REAL version that still proves the category

Not a toy. The smallest version that proves *"fnnlr sees where my revenue leaks better than any tool I have"*:

> **A course-seller signs up, answers ~10 questions, gets a complete Arabic revenue blueprint in <20 min, generates a tracked click-to-WhatsApp link + a page snippet, and within days sees a Leak Board populated from REAL captured data — "68% of WhatsApp clickers waited >15 min for a reply; 74% never reached your price; est. impact 14,000 EGP" — with a one-tap fix and a weekly diagnosis report.**

The non-negotiable that makes it *real* and not a demo: **the leak numbers come from observed events (clicks, page scroll, reply timestamps, payment states), never from the onboarding survey.** That single property is the difference between proving the category and shipping a glorified questionnaire. Everything in Stage 0–1 exists to make that one sentence true.

---

## 2. Current Codebase Reality

**There is no codebase.** Mapping honestly against the prompt's categories:

| Category | Status |
|---|---|
| Already built | Nothing. Seven vision markdown docs + three strategy docs (Vision, Product Bible, this). |
| Partially built | Nothing. |
| Missing | Everything below the strategy layer: auth, tenancy, data model, event spine, Brains, instrumentation, UI. |
| Fragile | N/A (nothing to be fragile). |
| Overcomplicated | N/A — *the risk is future over-complication*; guard against it (§14). |
| Underdeveloped | The entire product. |
| Protect | The strategy itself: the category, the instrument-before-advise rule, the system-of-record identity, the WhatsApp-as-spine decision. |
| Simplify | N/A yet — but bias the first build toward radical simplicity. |
| Delete later | N/A. |
| Don't distract us now | WhatsApp API, payment gateway processing, autonomous agents, agency console, marketplace. |

**Classification (all "missing" — this is the build list):**
1. *Usable foundations:* the strategy docs as spec; the chosen stack (recommend below).
2. *Risky foundations:* none yet — but the #1 future risk is shipping generation before instrumentation.
3. *Missing foundations:* tenancy, event spine, data model, Brain interfaces, RTL UI system, Data Vault.
4. *Product gaps:* everything — start from the Spine (§3).
5. *Architecture gaps:* multi-tenancy, event sourcing, Conversation-as-top-level-object.
6. *AI gaps:* no Brains, no policy/guardrail engine, no evaluation harness.
7. *Data gaps:* no capture (click/page/payment), no schema.
8. *UX gaps:* no RTL system, no screens.
9. *Trust/privacy gaps:* no isolation, no Vault.
10. *Monetization/value-proof gaps:* no billing, no Revenue Recovered engine.

**Recommended stack [recommendation]** (pick once, now, to avoid regret): a single full-stack TypeScript app (Next.js + a typed API layer), Postgres with **row-level security from day one** (tenant isolation), an event table as the spine, a job/queue runner for async (capture ingest, AI calls), a vector store with **per-tenant namespaces** (for AI memory later), and an LLM gateway abstraction (so models are swappable and cost-controlled). Brains are services behind interfaces. This stack supports Stages 0–3 without a rewrite; revisit at Stage 4 (platform scale).

---

## 3. The Product Spine *(7 core capabilities)*

The minimum set that makes the product *feel real* and proves the promise to a paying customer.

**Spine 1 — Multi-tenant foundation + event spine.**
*What:* Workspace→Business→Journey tenancy; every action is an `Event`. *Why first:* nothing is isolated or observable without it; retrofitting is a rewrite. *Proves:* (enabler) all diagnosis + trust. *Pillar:* Core Platform. *Code supports:* none — build. *Don't build yet:* user-facing automation editor. *Deps:* none. *Acceptance:* a second tenant can never read the first's data (tested); events ingest and are queryable. *Failure risk:* weak tenancy = fatal leak later.

**Spine 2 — Smart onboarding → Journey Blueprint.**
*What:* ~10-question RTL intake → generated Offer/Page/Script/Followup/Payment blueprint, stored as editable records. *Why first:* the activation wow; earns signup + first payment. *Proves:* "fnnlr builds a better revenue journey than I have." *Pillar:* Journey Architect. *Build:* onboarding flow + Offer/Page/Script/Followup/Payment Brains + blueprint storage. *Don't build yet:* page *builder*, real sends. *Deps:* Spine 1. *Acceptance:* a real course-seller gets a coherent, dialect-correct blueprint in <20 min and says it beats their setup. *Failure risk:* generic, translated-feeling output.

**Spine 3 — Click-to-WhatsApp capture (the instrumentation).**
*What:* generate tracked link/QR; each click → `Lead` + `Conversation` with source + timestamp. *Why first:* this is what makes the Leak Board *real* and turns fnnlr into a system of record. *Proves:* "fnnlr sees my actual leads." *Pillar:* WhatsApp Spine. *Build:* tracked redirect + ingest. *Don't build yet:* WhatsApp API. *Deps:* Spine 1. *Acceptance:* clicking a fnnlr link creates a lead + conversation with correct attribution and first-touch timestamp. *Failure risk:* skipping this and faking diagnosis from the survey.

**Spine 4 — Page tracking snippet.**
*What:* one script tag emitting `PageEvent`s (view, scroll, price_reach, cta_click). *Why first:* feeds Page Leak with real numbers. *Proves:* "fnnlr sees what happens on my page." *Pillar:* Page Intelligence. *Build:* snippet + ingest endpoint. *Deps:* Spine 1. *Acceptance:* scroll-to-price and CTA-click register per visitor. *Failure risk:* none significant; keep it lightweight + privacy-safe.

**Spine 5 — Mini-CRM pipeline + Conversation record (system of record).**
*What:* 8 stages; each lead with intent, trust level, risk score, payment status, recommended reply (manual logging in V1). `Conversation` is top-level. *Why first:* the retention engine; the place the user starts living in. *Proves:* "my leads don't fall through cracks." *Pillar:* System of Record. *Build:* pipeline UI + lead/conversation objects. *Don't build yet:* heavy CRM features. *Deps:* Spine 1, 3. *Acceptance:* a lead moves through stages and its thread/payment state are visible together. *Failure risk:* drifting into a generic CRM.

**Spine 6 — Payment state machine (manual).**
*What:* states started→…→confirmed→delivered→unpaid_24h→needs_followup; method registry; proof upload. *Why first:* makes Payment Leak real and seeds Payment Recovery. *Proves:* "fnnlr sees where payments stall." *Pillar:* Payment Engine. *Build:* state machine + manual transitions + proof upload. *Don't build yet:* gateway processing. *Deps:* Spine 1, 5. *Acceptance:* every transition logs an event; "requested transfer but no proof" is queryable. *Failure risk:* hardcoding methods instead of a registry.

**Spine 7 — Leak Board + weekly diagnosis (the wedge).**
*What:* six lanes from observed events; #1 leak with money impact + one-tap fix; weekly report. *Why first:* the daily reason to open the app; the thing customers pay for. *Proves:* the whole category. *Pillar:* Leak Intelligence. *Build:* Leak Brain over events + report generator. *Don't build yet:* benchmarks (need scale). *Deps:* Spine 1,3,4,5,6. *Acceptance:* the board shows a real, prioritized leak with a credible money number derived from captured data. *Failure risk:* self-report diagnosis; metrics-without-fixes.

**The Spine is complete when:** a real course-seller can sign up, launch a journey, capture real leads/conversations/payments, and open a Leak Board that tells them their biggest leak in money terms with a fix — all from observed data.

---

## 4. Execution Stages

### Stage 0 — Stabilize the Foundation *(greenfield: "establish," not "stabilize")*
*Goal:* a repo that's safe to build the company on. *Product:* none yet. *Technical:* tenancy (Postgres + RLS), event spine, Brain service interfaces, LLM gateway, RTL component system, CI + deploy. *AI:* gateway + one Brain interface proven end-to-end. *Data:* core schema + event table. *UX:* RTL design tokens, base components. *Trust:* tenant isolation + audit log skeleton. *Value:* none. *Key screens:* none (or a stub dashboard). *Key services:* auth, tenancy, event ingest, LLM gateway. *Key objects:* Workspace, Business, Journey, Event, AuditEvent. *Deps:* stack decision. *Don't build:* any feature, any integration. *Success signal:* isolation tests pass; an event flows end-to-end; one Brain returns a structured result. *Biggest risk:* over-engineering Stage 0 — keep Brains as thin interfaces. *Ready for Stage 1 when:* foundation is tested and deployable.

### Stage 1 — Build the Product Spine
*Goal:* the product is real (the 7 Spine capabilities). *Product:* onboarding→blueprint, click capture, page snippet, mini-CRM, payment state machine, Leak Board, weekly report. *Technical:* ingest pipelines, state machine, blueprint storage. *AI:* Offer/Page/Script/Followup/Payment/Leak Brains. *Data:* Lead, Conversation, Offer, Page, PageEvent, PaymentState, LeakFinding. *UX:* onboarding, dashboard, leak board, pipeline, lead page, payment track. *Trust:* isolation enforced; Vault foundation. *Value:* first leak with money impact. *Don't build:* WhatsApp API, payment webhooks, agents, agency. *Success:* ≥1 leak fixed/user/week; retention curve flattens; design partners say it beats their setup. *Biggest risk:* faking diagnosis; generator drift. *Ready for Stage 2 when:* real users live in the Leak Board weekly and pay.

### Stage 2 — First Market-Winning Version
*Goal:* meaningfully better than generic tools. *Product:* WhatsApp Cloud API (free-window-optimized), payment webhooks (Paymob/Fawry/Tap/Moyasar/HyperPay), in-inbox co-pilot, conversation summaries, lead scoring, payment recovery, Arabic copy scoring, owner WhatsApp briefing. *Technical:* BSP integration, webhook ingest, auto-capture. *AI:* Sales Co-pilot, Follow-up, Payment Recovery agents (human-in-loop); policy/guardrail engine. *Data:* auto-captured conversations + payments. *UX:* co-pilot inbox, Calm Digest, ROI card. *Trust:* memory viewer, audit logs, approval queue. *Value:* Revenue Recovered counter. *Don't build:* full autonomy, marketplace, enterprise. *Success:* NRR >100%; auto-capture > manual. *Biggest risk:* WhatsApp quality-rating issues; no guardrails before agents. *Ready for Stage 3 when:* value is provable and churn is low.

### Stage 3 — Monetizable Version
*Goal:* easy to sell, hard to churn. *Product:* pricing gates, usage limits, packages, polished onboarding, ROI/value reporting, trust visibility, sector packs. *Technical:* billing, metering, gating. *AI:* CRO, Offer Optimizer, Campaign Diagnosis agents. *Data:* conversation-outcome moat forming; benchmarks v1. *UX:* value dashboards, Benchmark Mirror, upgrade flows. *Trust:* two-tier opt-in benchmarks, export/delete. *Value:* leak-fix attribution; weekly + monthly reports. *Success:* clean tier conversion; expansion revenue. *Biggest risk:* pricing complexity; benchmark privacy. *Ready for Stage 4 when:* unit economics work and the wedge is won.

### Stage 4 — Platform Layer
*Goal:* beyond one use case. *Product:* agency console, white-label, multi-channel (IG/TikTok DMs), API/webhooks, automation plays, Data Vault tiers. *Technical:* sub-account tenancy, public API, channel adapters. *AI:* advanced + per-client agents. *Data:* cross-client (consented) playbooks. *UX:* agency dashboard, client switcher, branded reports. *Trust:* enterprise isolation tiers. *Success:* agency-sourced acquisition grows. *Biggest risk:* integration chaos; tenancy strain. *Ready for Stage 5 when:* platform is stable and partners self-serve.

### Stage 5 — Category Leader
*Goal:* the default Arab revenue OS. *Product:* ecosystem, marketplace, enterprise trust, AI evaluation system, cross-channel, distribution moats. *AI:* graduated-autonomy workforce + eval harness. *Data:* the Arab revenue intelligence network. *Trust:* the Vault as a market standard. *Success:* "fnnlr" = the category. *Biggest risk:* losing focus / diluting the POV.

---

## 5. Detailed Build Map *(17 workstreams)*

For each: purpose · why it matters · current status (greenfield) · required · objects · screens · AI · deps · risk · acceptance · priority · what can wait. (Compressed; "current status" = nothing built for all.)

1. **Product foundation** — repo, stack, CI/CD, RTL system. *Required:* monorepo, design tokens, deploy. *Priority:* P0. *Wait:* theming polish.
2. **Data model & DB** — Postgres + RLS + event table. *Objects:* all core. *Priority:* P0. *Wait:* enterprise entities. *Acceptance:* migrations + isolation tests.
3. **Auth & tenant isolation** — signup, roles, Workspace scoping. *Priority:* P0. *Risk:* cross-tenant leak. *Acceptance:* RLS proven.
4. **Core workflow/channel** — click-to-WhatsApp capture, page snippet, payment state machine. *Objects:* Lead, Conversation, PageEvent, PaymentState. *Screens:* pipeline, payment track. *Priority:* P0–P1. *Wait:* WhatsApp API.
5. **AI orchestration** — LLM gateway, Brain interfaces, prompt architecture. *Priority:* P0–P1. *Risk:* monolithic prompt. *Acceptance:* each Brain returns typed output.
6. **AI memory & knowledge** — per-tenant vector namespaces, account memory. *Priority:* P2. *Wait:* until co-pilot needs retrieval.
7. **Human approval & control** — approval queue, takeback, guardrails. *Priority:* P2 (before any agent acts). *Risk:* over-automation.
8. **Owner/admin experience** — dashboard, weekly report, briefing, Calm Digest. *Screens:* dashboard, digest. *Priority:* P1.
9. **Staff/team experience** — co-pilot inbox, recommended reply, scoreboard. *Priority:* P1–P2.
10. **End-customer experience** — page, WhatsApp flow, payment + proof. *Priority:* P1.
11. **Revenue/value tracking** — Revenue Recovered, leak-fix attribution. *Priority:* P1 (early, honest version).
12. **Trust/Data Vault** — isolation, memory viewer, export/delete, audit. *Priority:* P0 (isolation) / P2 (viewer).
13. **Integrations** — WhatsApp API, payment webhooks, Meta Ads, GA4. *Priority:* P2–P3. *Risk:* chaos if early.
14. **Analytics & reporting** — Leak Board, benchmarks, weekly/monthly. *Priority:* P1 (board) / P3 (benchmarks).
15. **Billing & packaging** — tiers, metering, gates. *Priority:* P2–P3.
16. **QA/testing/observability** — isolation tests, state-machine tests, Brain contract tests, logging. *Priority:* P0 (isolation) onward.
17. **Deployment & operations** — environments, secrets, monitoring, cost controls. *Priority:* P0.

---

## 6. Data Model Execution Plan

**Must-have NOW (Stage 0–1):**

| Entity | Why | Key fields | Created by | Updated by | AI use | Isolation | Stage |
|---|---|---|---|---|---|---|---|
| **Workspace** | Tenant root | id, name, plan, isolation_tier | signup | owner | scope | RLS root | 0 |
| **Business** | Multi-brand | id, ws_id, sector, market, dialect, currency | onboarding | owner | tailor | by ws_id | 0 |
| **Journey** | Revenue path | id, business_id, offer_id, channel, methods[], status | blueprint | owner | diagnose | by ws_id | 1 |
| **Offer/Page/ScriptPack/FollowupSeq/PaymentFlow** | Blueprint records | structured content, version, score | Brains | user edits | optimize | by ws_id | 1 |
| **Lead** | Buyer | id, business_id, source, stage, intent, trust_level, risk_score, payment_status, dialect, consent | capture/manual | events | prioritize | by ws_id | 1 |
| **Conversation** (top-level) | WhatsApp thread | id, business_id, lead_id?, first_reply_latency, summary, drop_point, sentiment | capture/API | messages | suggest replies | by ws_id | 1 |
| **Message** | Exchange | conv_id, dir, type, text, ts, intent | ingest | — | objection detect | by ws_id | 1 |
| **PageEvent** | Page behavior | page_id, type(view/scroll/price/cta), ts, visitor | snippet | — | page leak | by ws_id | 1 |
| **PaymentState** | Money machine | lead_id, method, state, amount, currency, proof_url | payment flow | transitions | recovery | by ws_id | 1 |
| **Event** | Spine | type, payload, ts, source, ws_id | all | — | everything | by ws_id | 0 |
| **LeakFinding** | Diagnosis | journey_id, lane, severity, money_impact, fix, status | Leak Brain | fix actions | rank | by ws_id | 1 |
| **AIOutput** | Versioned AI | type, content, score, version, edits | Brains | corrections | learn | by ws_id | 1 |
| **AuditEvent** | Trust | actor, action, target, ts | all access | — | governance | by ws_id | 0 |

**Indexes:** `Event(ws_id, type, ts)`, `Lead(ws_id, stage)`, `Conversation(ws_id, first_reply_latency)`, `PaymentState(ws_id, state)`, `PageEvent(ws_id, page_id, type)`.

**Must-have SOON (Stage 2):** Task, Objection, ApprovalRequest, ConsentRecord, vector-memory tables (per-tenant namespaces).
**Later platform (Stage 4):** Automation, Integration, AgencyAccount, ClientWorkspace, ApiKey, Webhook.
**Enterprise-only (Stage 5):** per-tenant encryption keys, isolation-tier config, retention-policy records.

**Cross-cutting:** every table carries `ws_id`; RLS enforces it; audit on sensitive access; retention/deletion honored via the Vault; benchmark aggregates read from a **separate anonymized projection**, never raw tenant rows.

---

## 7. AI Architecture Execution Plan

**Roles needed first (Stage 1):** the *generation + diagnosis* Brains — Offer, Page, Script, Followup, PaymentFlow, **Leak**, CopyScore. These are advisory; no autonomous actions, so guardrails are light. **Roles that wait (Stage 2+):** Sales Co-pilot, Follow-up, Payment Recovery (need conversation data + API + policy engine), then CRO, Offer Optimizer, Campaign Diagnosis.

**Prompt architecture:** one Brain = one service with a typed input/output contract; system prompts encode Arab-market + dialect knowledge; **no monolithic "do everything" prompt.** **Tool/function calling:** Brains that read data use typed tools (e.g. `getJourneyEvents`, `getLeadHistory`) rather than raw DB access. **Retrieval:** per-tenant vector namespaces for account memory (Stage 2). **Account memory:** tenant-scoped; visible in the Vault. **Policy guardrails:** a rules layer between every agent and every action — no prices/promises outside config; required before any agent *sends*. **Human approval:** all outbound sends start human-in-loop. **Escalation:** high-value/angry/uncertain → human. **Confidence scoring:** each output carries a confidence; low confidence routes to human. **Evaluation:** a harness scoring Brain outputs against real conversion (the AIOutput corrections + outcomes); this *is* the moat instrument. **Logging/observability:** every prompt, output, cost, latency logged per tenant. **Failure modes:** LLM error → graceful fallback + "needs you"; never silent. **Cost controls:** the LLM gateway caps spend, caches, and selects models by task (cheap for classification, stronger for generation). **Model selection:** abstracted; swappable.

**First-stage Brain spec (example — Leak Brain):**
*Input:* journey events (clicks, page events, reply latencies, payment states). *Output:* ranked `LeakFinding`s with lane, severity, money_impact, fastest_fix. *Tools:* `getJourneyEvents`, `getBenchmark` (later). *Reads:* events, journey config. *Writes:* LeakFinding, AIOutput. *Actions:* none (advisory). *Approval:* n/a. *Escalation:* n/a. *Eval metrics:* did the recommended fix move the metric? *Test cases:* event fixtures → expected leak ranking (proves it runs on observed data, not self-report). *UI surface:* the Leak Board + #1 Leak Card.

---

## 8. UX Execution Plan *(screens by stage)*

For each: user · purpose · core components · key actions · data · AI · empty/error/success · magical · simple · status (none built). Compressed.

**Stage 1 screens:**
- **Onboarding** — owner — capture journey inputs — one-question-at-a-time RTL cards — answer/continue — ends on blueprint reveal. *Magical:* the blueprint appears. *Simple:* one question per screen.
- **Dashboard** — owner — the 4 cards — tap a card → detail. *Magical:* "biggest leak = 18,000 EGP." *Simple:* exactly 4 cards, no 5th.
- **Leak Board** — owner — six lanes, #1 leak hero — apply fix — money impact. *Magical:* one-tap fix. *Simple:* one leak prominent.
- **Lead pipeline** — owner+seller — 8 stages — drag/advance — intent/risk/payment. *Magical:* nothing falls through. *Simple:* kanban, not a grid.
- **Lead/entity page** — seller — full context — recommended reply — AI summary + timeline. *Magical:* "the reply that closes." *Simple:* summary first.
- **Payment track** — owner — state machine visual — advance/upload proof — stuck leads glow. *Magical:* paste screenshot → confirmed. *Simple:* a horizontal track.
- **Journey builder** — owner — editable blueprint cards — edit/regenerate. *Simple:* cards, not a canvas.
- **Weekly diagnosis report** — owner — top-3 leaks + fix — share. *Magical:* it arrives Sunday automatically.

**Stage 2+ screens:** co-pilot inbox, AI memory/Vault viewer, owner Calm Digest, ROI/Revenue-Recovered, seller scoreboard, approval queue, settings, billing, Benchmark Mirror, agency dashboard (Stage 4).

**Cross-cutting UX rules:** RTL-native (correct bidi for numbers/currency/Latin names), mobile-first, low cognitive load, one primary action per screen, the AI Command Bar omnipresent.

---

## 9. Trust & Data Isolation Execution Plan

| Item | Product behavior | Technical approach | Stage | Acceptance | Risk if ignored |
|---|---|---|---|---|---|
| **Tenant isolation** | No cross-tenant data ever | Postgres RLS by ws_id; per-tenant vector namespaces | 0 | Isolation tests pass | Fatal leak |
| **Role-based access** | Owner vs seller vs agency | Roles + scoped queries | 0–1 | Permissions enforced | Internal overreach |
| **Audit logs** | Who accessed what | AuditEvent on sensitive ops | 0 | All access logged | No accountability |
| **Admin/support access** | Approved + logged | Support-access approval flow | 2 | Approval required + logged | Trust breach |
| **AI memory visibility** | "What does it know?" | Vault memory viewer | 2 | Owner sees+edits memory | Black-box distrust |
| **Export/delete** | "My data is mine" | One-click export + delete | 2 | Full export; verified delete | Lock-in resentment |
| **Training consent** | Opt-in only | Two-tier model; consent flag | 2 | No raw data in shared training | Fatal trust break |
| **Redaction** | PII stripped from aggregates | Redaction before projection | 3 | Aggregates carry no PII | Privacy violation |
| **Object/vector/job/cache/log isolation** | All tenant-scoped | Scoped storage + namespaces | 0–2 | No cross-tenant artifacts | Leak vectors |
| **Data retention** | Honored | Retention policies + purge jobs | 3 | Data purged per policy | Compliance risk |

**Default now:** RLS isolation, audit logs, role-based access. **Premium later:** schema/DB-per-tenant, tenant encryption (enterprise). **Must never happen:** public cross-tenant training; raw tenant data in benchmarks; un-audited admin access.

---

## 10. Revenue / Value Proof Execution Plan

Honest attribution that still sells (no fake ROI):

- **First value metric:** journeys built + blueprint quality (activation).
- **Assisted value metric:** leads captured that would otherwise be untracked.
- **Recovered value metric:** payments confirmed after a fnnlr reminder/recovery action (the headline).
- **Time saved metric:** auto-captured vs manual logging hours.
- **Quality metric:** reply-time improvement; copy-score lift.
- **AI contribution metric:** % of recommended fixes applied that moved the metric.
- **Staff contribution metric:** per-seller close-rate, reply-time.
- **Retention/churn signal:** weekly Leak Board engagement + leaks fixed.
- **Weekly report:** top-3 leaks, fastest fix, revenue recovered this week.
- **Monthly report:** trend, recovered total, benchmark position.
- **Attribution method:** event-based, conservative — only count recovery where a fnnlr action preceded the confirmed payment; label assisted vs direct; never overclaim.
- **Limitations (state them honestly in-product):** WhatsApp-internal actions before API integration are partly manual-attributed; pre/post comparisons are directional.
- **Required event tracking:** click, page, reply-latency, payment transitions, fix-applied, reminder-sent.
- **Required UI:** Revenue Recovered card, leak-fix attribution, weekly/monthly report.
- **Required backend:** the Value Engine reading outcome events.

---

## 11. Prioritization Framework

**Score each feature (0–3) on:** proves the category · customer value · trust · value-proof · data moat · risk reduction · unlocks future · (minus) complexity · (minus) dependencies · (minus) distraction risk.

### Top 25 to build (ranked)
1. Tenant foundation + RLS *(P0, S0 — unlocks everything; isolation tests)*
2. Event spine *(P0, S0 — enables diagnosis)*
3. LLM gateway + Brain interfaces *(P0, S0 — swappable, cost-controlled)*
4. RTL component system *(P0, S0 — avoids retrofit)*
5. Onboarding → Journey Blueprint *(P0, S1 — activation wow)*
6. Click-to-WhatsApp capture *(P0, S1 — the moat seed)*
7. Page tracking snippet *(P1, S1 — real Page leak)*
8. Lead pipeline + Conversation object *(P1, S1 — system of record)*
9. Payment state machine *(P1, S1 — real Payment leak)*
10. Leak Brain + Leak Board *(P0, S1 — the wedge)*
11. Weekly diagnosis report *(P1, S1 — retention)*
12. Data Vault foundation (isolation + audit) *(P0, S0–1 — trust)*
13. Value Engine v1 (Revenue Recovered) *(P1, S1–2 — proof)*
14. Arabic copy scoring v1 *(P1, S2 — differentiation)*
15. WhatsApp Cloud API (free-window-optimized) *(P2, S2 — auto-capture)*
16. Payment webhooks *(P2, S2 — auto state)*
17. Sales Co-pilot (human-in-loop) *(P2, S2 — staff value)*
18. Policy/guardrail engine *(P2, S2 — safe autonomy)*
19. Payment Recovery Agent *(P2, S2 — recovered revenue)*
20. Owner WhatsApp briefing + Calm Digest *(P2, S2 — engagement)*
21. AI memory viewer (Vault) *(P2, S2 — trust weapon)*
22. Benchmarks v1 (two-tier opt-in) *(P3, S3 — network effect)*
23. Billing + packaging *(P2–3, S3 — monetize)*
24. CRO + Offer Optimizer + Campaign Diagnosis *(P3, S3 — depth)*
25. Agency console foundation *(P3, S4 — distribution)*

### Top 15 to delay
Full page builder · automation canvas · marketplace · enterprise isolation tiers · multi-channel (IG/TikTok) · public API · advanced benchmarks · full autonomy · white-label · custom integrations · mobile native app · advanced analytics suite · multi-language beyond Arabic · CRM bridges · loyalty/referral systems.

### Top 10 to avoid completely (now)
Becoming a PSP · public cross-tenant training · autonomous sales bot pre-trust · generic chatbot UI · dashboard-without-diagnosis · feature-parity chase with HighLevel · agency-services-as-SaaS · per-feature à-la-carte pricing · WhatsApp API as a launch gate · building for investors over owners.

### Top 10 to simplify
Onboarding (one question per screen) · dashboard (4 cards only) · CRM (8 stages, no more) · payment UI (a track, not a builder) · journey builder (cards, not a canvas) · pricing (3 tiers + agency) · Brains (thin interfaces, not a mega-prompt) · reports (top-3, not 40 metrics) · follow-up (reasons, not blasts) · settings (sane defaults).

---

## 12. Build Packs

Coherent implementation units. Each: objective · user value · business value · scope · objects · API · UI · AI · events · trust · deps · notes · acceptance · QA · rollback risk · what NOT to include. (Current-files column omitted — greenfield.)

**Build Pack 0 — Foundation.** *Stage 0.* *Objective:* tenancy + event spine + LLM gateway + RTL system + CI/deploy. *Objects:* Workspace, Business, Journey, Event, AuditEvent. *API:* auth, event ingest. *UI:* stub dashboard. *AI:* gateway + one Brain interface. *Trust:* RLS + audit skeleton. *Acceptance:* isolation tests pass; event flows end-to-end. *Not included:* any feature.

**Build Pack 1 — Product Spine: Onboarding → Blueprint.** *Stage 1.* *Objective:* intake → generated, stored, editable blueprint. *Objects:* Offer, Page, ScriptPack, FollowupSequence, PaymentFlow, AIOutput. *AI:* generation Brains. *UI:* onboarding, blueprint/journey builder. *Acceptance:* real seller gets a coherent dialect-correct blueprint <20 min. *Not included:* page builder, sends.

**Build Pack 2 — Core Data Model.** *Stage 1.* *Objective:* Lead, Conversation, Message, PageEvent, PaymentState, LeakFinding + indexes + RLS. *Acceptance:* all carry ws_id; isolation tested. *Not included:* platform/enterprise entities.

**Build Pack 3 — Core Workflow/Channel: Capture.** *Stage 1.* *Objective:* click-to-WhatsApp capture + page snippet ingest. *Objects:* Lead, Conversation, PageEvent. *API:* tracked redirect, snippet ingest. *UI:* pipeline. *Events:* click, page events. *Acceptance:* click creates lead+conversation with attribution; scroll/price/cta register. *Not included:* WhatsApp API.

**Build Pack 4 — First AI Employee: Leak Brain.** *Stage 1.* *Objective:* diagnosis from observed events → Leak Board. *AI:* Leak Brain. *UI:* Leak Board + #1 card. *Acceptance:* real prioritized leak with money impact from captured data (fixtures-tested). *Not included:* benchmarks, autonomous fixes.

**Build Pack 5 — Human Approval & Control.** *Stage 2.* *Objective:* approval queue + takeback + guardrail engine (before any agent sends). *Objects:* ApprovalRequest. *Acceptance:* no agent action sends without human approval; takeback works. *Not included:* full autonomy.

**Build Pack 6 — Owner/Admin Brief.** *Stage 1–2.* *Objective:* 4-card dashboard + weekly report + (S2) WhatsApp briefing. *AI:* Owner Analyst. *Acceptance:* weekly report generates with top-3 leaks + recovered revenue. *Not included:* heavy analytics.

**Build Pack 7 — Staff/Team Workspace.** *Stage 1–2.* *Objective:* co-pilot inbox, recommended reply, context sidebar, scoreboard. *AI:* Sales Co-pilot (S2). *Acceptance:* seller sees context + a one-tap recommended reply. *Not included:* auto-send early.

**Build Pack 8 — Value/Revenue Tracking.** *Stage 1–2.* *Objective:* Value Engine + Revenue Recovered + leak-fix attribution. *Acceptance:* conservative, honest recovered-revenue number with labels. *Not included:* fake ROI.

**Build Pack 9 — Trust/Data Vault Basics.** *Stage 0–2.* *Objective:* isolation (S0) + memory viewer + export/delete + training consent (S2). *Acceptance:* owner can view memory, export, delete; consent enforced. *Not included:* enterprise tiers.

**Build Pack 10 — First Market-Native Wow.** *Stage 1–2.* *Objective:* the signature moment — **Screenshot-to-Lead** (OCR a payment proof → advance state) or **the #1 Leak Card with money impact**. *Acceptance:* the demo moment lands ("this was built for me"). *Not included:* scope creep beyond the one wow.

---

## 13. Definition of Done *(per stage)*

**Stage 0 done:** tenancy + RLS tested; event spine works; LLM gateway live; RTL system in place; CI/deploy green. *Technical done.* *Not done even if impressive:* a slick UI with no isolation.

**Stage 1 done:** *Product* — a real seller completes onboarding→blueprint, captures real leads/conversations/payments, opens a Leak Board with a real money-quantified leak. *AI* — Brains return structured, dialect-correct output; Leak Brain runs on fixtures. *UX* — RTL, 4-card dashboard, leak board, pipeline. *Trust* — isolation enforced, audit logging. *Analytics* — core events tracked. *Testing* — isolation + state-machine + Brain-contract tests. *Deployment* — deployable. *Customer validation* — design partners say it beats their setup and use the Leak Board weekly. *Not done even if impressive:* a beautiful blueprint generator with no capture (that's a demo, not the product).

**Stage 2 done:** auto-capture > manual; co-pilot in use; payment recovery producing confirmed payments; Revenue Recovered visible; guardrails before any agent sends; NRR >100%. *Not done:* agents sending without approval.

**Stage 3 done:** tiers + billing + gating live; honest ROI reporting; benchmarks opt-in; clean tier conversion. *Not done:* pricing no one understands.

**Stage 4–5 done:** agency console self-serve; platform stable; ecosystem forming; the Vault as a standard. *Not done:* breadth that dilutes the POV.

---

## 14. Risks & Kill Switches

| Risk | Shows up as | Why dangerous | Early sign | Prevention | Mitigation | Kill switch | Signal to watch |
|---|---|---|---|---|---|---|---|
| **Building too wide** | Many half-features | No depth, no moat | Roadmap sprawl | Own one wedge | Cut to Spine | Freeze new features until Spine ships | Feature count up, retention flat |
| **Generic AI** | "It's just ChatGPT" | No differentiation | Mega-prompt | Brains bound to data | Refactor to interfaces | Stop shipping AI until bound | Outputs feel generic |
| **Weak data model** | Rework, migrations | Blocks everything | Conversation as sub-log | Conversation top-level + event spine | Re-model early | Halt features, fix model | Frequent schema churn |
| **Weak trust model** | Late tenancy | Fatal leak | Isolation deferred | RLS from commit 1 | Lock down + audit | Stop onboarding new tenants | Any cross-tenant access |
| **Over-automation** | Auto-send bot | Brand/trust damage | Agents send pre-trust | Human-in-loop default | Revert to co-pilot | Disable autonomous sends | A bad auto-message |
| **No value attribution** | "Is it worth it?" | Silent churn | No Revenue Recovered | Value Engine early | Add honest attribution | Pause expansion pricing | Churn with "unsure" |
| **Bad onboarding** | Drop-off | No activation | Long forms | One-question flow | Simplify | Rebuild onboarding | Low blueprint completion |
| **Dashboard complexity** | Metric grids | Kills the promise | 5th, 6th card | 4 cards only | Strip back | Remove non-diagnostic views | Owners ignore dashboard |
| **Integration chaos** | API sprawl early | Distraction, fragility | WhatsApp API in Stage 0 | Defer to Stage 2 | Sequence | Pause integrations | Eng time on connectors pre-PMF |
| **Unclear ownership** | Drift | No accountability | "Whose is this?" | Workstream owners | Assign | Re-org | Stalled workstreams |
| **Poor AI evaluation** | Unmeasured AI | No improvement loop | No eval harness | Build eval early | Add harness | Gate AI changes on eval | Can't tell if AI helps |
| **Expensive AI** | Cost spikes | Margin death | No caps | Gateway caps + caching | Model selection | Throttle | Cost per active user rising |
| **No tenant isolation** | (see weak trust) | Fatal | — | RLS | — | Halt | — |
| **Demo-driven dev** | Polished demos, no capture | Fake product | Generator before instrumentation | Instrument first | Re-sequence | Stop demo polish, build capture | Demos improve, retention doesn't |

---

## 15. Actual Recommended Execution Order

1. **First to inspect:** the three strategy docs (Vision, Bible, this) — they are the spec; there's no code to inspect.
2. **First to establish (not "stabilize"):** the stack + tenancy + RLS + event spine + LLM gateway + RTL system + CI/deploy.
3. **First data model to create:** Workspace → Business → Journey → Event → Lead → Conversation (top-level) → PaymentState → LeakFinding, all ws_id-scoped.
4. **First user flow to complete:** onboarding → Journey Blueprint (the activation wow).
5. **First AI behavior to ship:** the generation Brains, then the **Leak Brain** on observed events.
6. **First trust feature to expose:** tenant isolation + audit log (and the Vault foundation).
7. **First value metric to track:** leads captured + biggest leak's money impact → Revenue Recovered.
8. **First wow moment to demo:** the **#1 Leak Card** ("your biggest leak = 18,000 EGP — fix it") from real captured data; close second: Screenshot-to-Lead.
9. **First thing to monetize:** the Growth tier (system of record + Leak Board + follow-ups) — never free.
10. **First thing to postpone:** WhatsApp API, payment gateway processing, autonomous agents, agency console.

**30/60/90:**
- **Day 0–30 (Foundation + activation wow):** establish foundation (Build Pack 0); ship onboarding→blueprint (BP1) + core data model (BP2). *Outcome:* a real seller gets a blueprint that beats their setup, on isolated infrastructure.
- **Day 31–60 (Make it real — the system of record):** capture (BP3) + Leak Brain/Board (BP4) + pipeline/payment state machine + weekly report + Vault basics (BP9). *Outcome:* the Leak Board shows a real money-quantified leak from observed data; users start living in the app.
- **Day 61–90 (Prove value with pilots):** Value Engine/Revenue Recovered (BP8) + staff co-pilot (BP7) + owner brief (BP6) + first market-native wow (BP10); pilot with 10 design-partner course-sellers. *Outcome:* provable recovered revenue + weekly active usage → readiness for Stage 2 (WhatsApp API + payment webhooks + agents).

---

## 16. Final Execution Memo

You're at the best possible moment: **greenfield, with the strategy already done.** Most teams build first and discover their foundation is wrong. You get to set it right on commit one. Don't waste that.

**What to build first:** the foundation that can't be retrofitted — tenancy + RLS + event spine + Brain interfaces + RTL system — then the activation wow (onboarding→blueprint), then the instrumentation (click capture, page snippet, payment state machine), then the Leak Board on real data. In that order. The blueprint earns the signup; the instrumentation earns the company.

**What to protect:** the **instrument-before-advise** rule (it's the whole moat), the **system-of-record identity** (Conversation as a top-level object), **tenant isolation** (one leak ends you), and **focus on the one wedge.**

**What to ignore (for now):** WhatsApp API, payment processing, autonomous agents, agency console, marketplace, multi-channel, enterprise. All real, all later. Naming them as "not now" out loud is how you protect the team's attention.

**What to delay:** anything in the "top 15 to delay" list — especially the page builder and automation canvas, the two classic time-sinks that feel productive and build no moat.

**What to simplify:** everything user-facing — 4 cards, 8 stages, one question per onboarding screen, top-3 leaks not 40 metrics. Complexity is the enemy of the calm you're selling.

**Where the (absent) repo helps:** it can't constrain you — there's no legacy to fight. **Where the absence is dangerous:** there's also no scaffolding, so discipline must come from this plan. The danger is "demo-driven development" — building the parts that demo well (generation) and skipping the parts that make it a company (capture, isolation, value proof). The Definition of Done (§13) exists to stop exactly that: *a beautiful blueprint generator with no capture is not done — it's a demo.*

**What makes it feel real:** the Leak Board showing a real money number from the user's own captured data. **What makes it sellable:** the Revenue Recovered counter proving it pays for itself. **What makes it hard to copy:** the accumulating conversation-outcome dataset — which only exists if you instrument from day one. **What makes it technically solid:** tenancy + event spine + Brain interfaces done right at the start.

**The one decision you need to make now:** commit to the stack and the **instrument-before-advise** sequencing — i.e., agree that Stage 1 ships *capture + observed-data diagnosis*, not just the generator, even though the generator is the part that demos beautifully and would be faster to ship alone. Make that call, and the rest of this blueprint executes cleanly.

Now go establish the foundation. When the repo exists, run this prompt against it — and this document becomes the plan it must converge to.

---

*Grounded in: the seven fnnlr vision documents and the prior Expert Review, Company Vision (Pre-Code), and Product Bible. The prompt's code-grounded sections were adapted, not fabricated, because no source code exists yet (greenfield). This is the plan to start the repo; re-run against real code once it exists.*
