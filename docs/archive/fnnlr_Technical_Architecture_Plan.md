# fnnlr — Technical Architecture Plan
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
### The technical backbone — greenfield edition

> **Honest framing (consistent with all prior responses).** This prompt assumes a repository is attached and asks for "current code status," migration-from-existing-code, and "files that should move" throughout. **There is still no source code — this is greenfield.** For a technical architecture plan that's an advantage: no legacy to migrate, no smells to fight, no rewrite risk — I get to commit the backbone cleanly. So everywhere the prompt asks "what current code supports / what to migrate," the honest answer is **"nothing exists — this is the target to build to,"** and §21 ("migration") becomes **build order from zero.** Recommendations are committed and opinionated as the prompt demands; nothing is claimed as observed from code. When a repo exists, run this against it and treat this as the architecture it must converge to.
>
> **Stack commitment up front (so the rest reads concretely):** **Next.js (App Router, TypeScript) + a typed tRPC/REST service layer, PostgreSQL with TOTAL database-per-tenant isolation (one physical database per individual seller and per agency) coordinated by a small shared control-plane DB, Drizzle/Prisma ORM, a Redis-backed job queue (BullMQ), pgvector for AI memory, an LLM gateway abstraction, and object storage (S3-compatible).** One deployable modular monolith. Rationale throughout. **(UPDATED: see the Architecture Update banner at the top — the tenancy model is now database-per-tenant, not shared-DB+RLS; this is implemented and tested in the codebase.)**

---

## 1. Architecture Goal

- **Category to support:** Arabic-Native Revenue Journey OS.
- **Core user journey:** onboarding → journey blueprint → capture (click-to-WhatsApp + page + payment) → system of record → leak diagnosis → recovery → value proof.
- **First wedge:** mid-ticket Arabic course/program sellers.
- **Long-term platform direction:** AI revenue workforce + agency/multi-tenant platform + intelligence network across WhatsApp-commerce markets.
- **Most important product pillars:** Event Spine, System of Record (Conversation top-level), WhatsApp Spine, Payment Engine, Leak Intelligence, AI Workforce, Data Vault, Value Engine.
- **Most important technical pillars:** (1) hard multi-tenancy, (2) event-sourced spine, (3) modular Brain/AI orchestration, (4) capture/ingest pipelines, (5) trust/isolation, (6) honest value attribution.
- **Trust/privacy promise:** tenant data is isolated and owned by the tenant; visible, exportable, deletable AI memory; no cross-tenant learning without opt-in.
- **AI promise:** specialized Brains bound to the tenant's real revenue data, not a generic chatbot; human-in-the-loop graduating to autonomy.
- **Data/memory promise:** the system of record fills itself from observed events; per-tenant memory the owner can inspect.
- **Scale assumptions:** early = tens of tenants, thousands of events/day; growth = thousands of tenants, millions of events; agency = tenants-of-tenants; enterprise = isolation tiers. Design for growth-stage now, don't build enterprise-scale infra yet.
- **Operational assumptions:** small founding team; must move fast; cost-controlled AI; phone-first users; MENA latency (host in/near EU/ME region).
- **Architecture principles:** tenant-aware by default · event-sourced spine · Brains behind interfaces · capture before advise · isolation is non-negotiable · honest attribution · modular monolith until proven otherwise · config-driven market specifics (methods/dialects/playbooks) · prompts are versioned artifacts, never scattered.

**What kind of system are we building?** Primarily an **AI-native, multi-tenant, channel-first (WhatsApp) conversational-commerce operating layer with a self-filling system of record and a private-data trust layer.** Not "a CRM with AI bolted on," not "an integration-heavy automation platform." The center of gravity is *observed revenue events → diagnosis → action*, with WhatsApp as the primary channel.

---

## 2. Current Architecture Reality

**There is no current architecture — greenfield.** Honest classification:

| Bucket | Status |
|---|---|
| Strong foundations | None yet (strategy docs only). |
| Usable foundations | The chosen stack (below) + the four strategy docs as spec. |
| Fragile foundations | N/A. |
| Missing foundations | Everything: tenancy, event spine, data model, AI orchestration, capture, trust, observability. |
| Architecture smells | None to fix — *the risk is creating them*; this plan prevents the common ones. |
| Scaling risks | Premature: don't build for enterprise scale yet. |
| Security risks | The one that matters: shipping without tenant isolation. Prevented by **database-per-tenant isolation** (a separate physical DB per tenant — cross-tenant access is impossible at the infrastructure layer). |
| AI risks | Monolithic prompt; scattered AI logic; unbounded agents. Prevented by the Brain/orchestration design (§9). |
| Data risks | Conversation-as-sub-log (the funnel-brain mistake); no event spine. Prevented by §6. |
| UX/backend coupling risks | AI logic in components; tenant-unaware queries. Prevented by §5 rules. |
| Looks messy but acceptable | N/A. |
| Must fix before serious buildout | N/A — *must get right the first time*: tenancy, event spine, Brain interfaces. |

Every item ties to the same conclusion: **greenfield means the architecture's job is prevention, not remediation.** The rest of this document specifies the backbone that prevents the predictable failures named in the Execution Blueprint (generator drift, fake diagnosis, isolation leak, over-automation).

---

## 3. Recommended Target Architecture

**Final recommendation: a modular monolith (single deployable) with clean domain modules, an event spine, and worker processes — on Next.js + TypeScript + Postgres with DATABASE-PER-TENANT isolation (control-plane DB + one isolated DB per tenant) + Redis/BullMQ + pgvector + S3 + an LLM gateway.**

| Layer | Recommendation | Why | Alternatives / why not yet | Build now / wait / mistake |
|---|---|---|---|---|
| **Style** | Modular monolith | One small team, fast iteration, transactional integrity across domains | Microservices (premature ops cost); serverless-everything (cold-starts, stateful jobs awkward) | Now. *Mistake:* microservices pre-PMF. |
| **Frontend** | Next.js App Router, RTL-native design system, server components + minimal client state (TanStack Query) | SSR for speed on mobile MENA; RTL from day one | SPA (worse SEO/first-load); heavy Redux (overkill) | Now. *Mistake:* retrofitting RTL later. |
| **Backend** | tRPC (typed) for app, REST for webhooks/public | End-to-end types, fast dev; REST where external | GraphQL (over-engineered for one client now) | Now; add public REST at Stage 4. |
| **Database** | Postgres, **database-per-tenant** (control-plane DB routes to one isolated DB per tenant), Drizzle or Prisma | Total physical isolation — strongest possible tenancy; trivial per-tenant export/delete/residency | Shared-DB+RLS (weaker isolation; chosen against for fnnlr); Mongo (weak relations) | Now. *Mistake:* a code path reaching tenant data without the router. |
| **API** | Typed contracts, Zod validation, middleware (auth→tenant→perms) | Safety + consistency | Untyped JSON (bug farm) | Now. |
| **AI orchestration** | Brain registry + LLM gateway + tool layer | Swappable models, cost control, no monolith prompt | Single mega-prompt (unmaintainable, ungradeable) | Now (interfaces); agents at Stage 2. *Mistake:* AI in components. |
| **Events/jobs** | Postgres event table (spine) + Redis/BullMQ (queue) | Durable events + reliable async; no Kafka yet | Kafka/event-sourcing-framework (premature) | Now (table + queue). *Mistake:* complex event sourcing early. |
| **Integrations** | Adapter pattern → normalized internal events | External chaos never leaks into core | Direct coupling (fragile) | Stage 2 (WhatsApp/payments); adapters designed now. |
| **File/media** | S3-compatible, tenant-scoped keys, signed URLs | Screenshots/voice notes are first-class here | DB blobs (bad) | Now (basic), expand Stage 2. |
| **Analytics/events** | The same event spine + aggregation jobs + a separate anonymized projection for benchmarks | One source of truth; clean separation for privacy | External warehouse before clean events (premature) | Spine now; warehouse later. |
| **Tenant isolation** | **Database-per-tenant** (separate DB/role/password per tenant) + tenant-scoped jobs/cache/storage/vectors | Strongest isolation — no shared connection to leak through | Shared-DB+RLS (logical only) | Now. *Mistake:* bypassing the connection router. |
| **Permissions** | RBAC (owner/seller/agency/admin), ABAC later | Simple, sufficient | Full ABAC now (overkill) | Now RBAC. |
| **Observability** | Structured logs + error tracking + AI/cost telemetry | Debug AI + protect margin | Heavy APM early (cost) | Basics now. |
| **Deployment** | Managed Postgres + Redis + a container/host (Vercel for web + a worker host, or a single platform like Railway/Render/Fly) | Low ops overhead, EU/ME region | Self-managed k8s (premature) | Now. *Mistake:* k8s pre-scale. |

---

## 4. Domain Architecture

Modules in one monolith, each owning its tables/services, communicating via typed calls + events. For each: responsibility · owns · must-not-own · key entities · services · events emitted/consumed · location.

1. **Accounts/Tenancy** — owns Workspace/Business/membership; *not* domain logic. Entities: Workspace, Business, Membership. Emits: `business.created`. Location: `modules/tenancy`.
2. **Identity/Auth/Perms** — owns users, roles, sessions; *not* business data. Emits: `user.invited`. Location: `modules/auth`.
3. **Journey** — owns Journey/Offer/Page/ScriptPack/FollowupSequence/PaymentFlow; *not* runtime leads. Emits: `journey.published`. Location: `modules/journey`.
4. **Capture/Channel** — owns ingest of click/page/message events; *not* diagnosis. Emits: `lead.captured`, `page.event`, `message.received`. Consumes: webhooks. Location: `modules/capture`.
5. **System of Record (CRM)** — owns Lead, Conversation (top-level), Message; *not* AI generation. Emits: `lead.stage_changed`. Consumes: capture events. Location: `modules/record`.
6. **Payments** — owns PaymentState machine, method registry, proof; *not* actual processing (orchestration only). Emits: `payment.state_changed`, `payment.recovered`. Location: `modules/payments`.
7. **Leak Intelligence** — owns LeakFinding + diagnosis; *not* sending. Consumes: all events. Emits: `leak.detected`. Location: `modules/leaks`.
8. **AI Orchestration** — owns Brain registry, LLM gateway, tools, prompts; *not* domain data. Emits: `ai.output_generated`. Location: `modules/ai`.
9. **AI Memory** — owns per-tenant vectors + account memory; *not* cross-tenant anything. Location: `modules/ai-memory`.
10. **Approvals/Control** — owns ApprovalRequest, human-in-loop gates; *not* the actions themselves. Emits: `action.approved/rejected`. Location: `modules/approvals`.
11. **Data Vault/Trust** — owns isolation policy, export/delete, audit, consent; *not* feature logic. Emits: `data.exported`, `admin.access_granted`. Location: `modules/vault`.
12. **Value/Analytics** — owns metrics, attribution, reports; *not* raw mutation. Consumes: all events. Location: `modules/value`.
13. **Integrations** — owns adapters (WhatsApp/payments/Meta/GA4); *not* core domain. Normalizes to internal events. Location: `modules/integrations`.
14. **Notifications** — owns owner/seller pushes (WhatsApp briefing, digest); *not* content decisions. Location: `modules/notify`.
15. **Billing** — owns plans, metering, gates; *not* feature logic. Location: `modules/billing` (Stage 3).
16. **Admin/Support** — owns audited internal access; *not* silent reach. Location: `modules/admin`.

**Boundary rule:** modules talk via typed service interfaces + the event bus, never by reaching into each other's tables.

---

## 5. Repository & Folder Structure

```
fnnlr/
├─ apps/
│  ├─ web/                  # Next.js App Router (RTL-native)
│  │  ├─ app/               # routes (locale-aware, RTL)
│  │  ├─ components/        # UI ONLY — no AI logic, no direct DB
│  │  ├─ features/          # screen-level composition
│  │  └─ lib/               # client utils, query hooks
│  └─ worker/               # BullMQ workers (capture ingest, AI jobs, reports)
├─ modules/                 # domain modules (the monolith's spine)
│  ├─ tenancy/  auth/  journey/  capture/  record/  payments/
│  ├─ leaks/  ai/  ai-memory/  approvals/  vault/  value/
│  ├─ integrations/  notify/  billing/  admin/
│  │   each: index.ts (public API) · service.ts · repo.ts · events.ts · types.ts · tests/
├─ packages/
│  ├─ db/                   # schema, migrations, RLS policies, seed
│  ├─ events/               # event types + bus
│  ├─ ai-core/              # LLM gateway, Brain base, tool registry
│  ├─ prompts/              # ALL prompts (versioned) — never scattered
│  ├─ ui/                   # RTL design system, tokens, primitives
│  ├─ types/                # shared types/contracts (Zod schemas)
│  └─ config/               # market registries: payment methods, dialects, playbooks, leak thresholds
├─ tests/                   # e2e, isolation, integration
├─ docs/                    # ADRs, runbooks, this plan
└─ infra/                   # IaC, deploy, env templates
```

**Anti-mess rules (enforced in review/lint):** no business logic duplicated across modules · **no AI logic inside UI components** (UI calls a server action that calls a Brain) · **no tenant-unaware queries** (all repo methods take a tenant context; RLS backstops) · no direct DB access outside a module's `repo.ts` · **no untyped API payloads** (Zod everywhere) · **all prompts live in `packages/prompts`**, versioned, never inline in routes · integration code stays in `modules/integrations`, never in core domain.

---

## 6. Database & Data Architecture

**Must-have NOW (Stage 0–1):** Workspace, Business, Membership, User, Journey, Offer, Page, PageEvent, ScriptPack, FollowupSequence, PaymentFlow, Lead, Conversation, Message, PaymentState, Event, LeakFinding, AIOutput, AuditEvent.
**Must-have SOON (Stage 2):** Task, Objection, ApprovalRequest, ConsentRecord, vector-memory tables, integration-credential vault.
**Later platform (Stage 4):** Automation, Integration, AgencyAccount, ClientWorkspace, ApiKey, Webhook, BenchmarkProjection.
**Enterprise-only (Stage 5):** TenantEncryptionKey, IsolationTierConfig, RetentionPolicy.

Per-entity (key ones): purpose · tenant key · who writes/reads · AI use · lifecycle · stage.

| Entity | Tenant key | Writes / Reads | AI | Lifecycle | Stage |
|---|---|---|---|---|---|
| **Workspace** | (root) | auth / all | — | soft-delete | 0 |
| **Business** | ws_id | onboarding / all | tailors output | soft-delete | 0 |
| **Event** (spine) | ws_id | all modules / value+leaks | reads all | append-only, retained | 0 |
| **Lead** | ws_id | capture+record / record+leaks | prioritizes | soft-delete | 1 |
| **Conversation** (top-level) | ws_id | capture / record+ai | suggests replies | soft-delete | 1 |
| **Message** | ws_id | capture / ai | objection detect | append-only | 1 |
| **PageEvent** | ws_id | snippet / leaks | page leak | append-only | 1 |
| **PaymentState** | ws_id | payments / leaks+value | recovery | mutable + history | 1 |
| **LeakFinding** | ws_id | leaks / owner UI | ranks | mutable (fix status) | 1 |
| **AIOutput** | ws_id | ai / eval | learns from edits | versioned | 1 |
| **AuditEvent** | ws_id | vault / admin | — | append-only, long-retain | 0 |

**Cross-cutting:** every table carries `ws_id` + RLS policy. **Soft-delete** for user-facing entities (recoverable); **hard-delete** on Vault deletion requests (with propagation, §15). **Audit** on sensitive reads/writes. **Event sourcing — pragmatic:** the `Event` table is the append-only spine (source of truth for diagnosis/value), but domain tables hold current state (not full CQRS — that's premature). **Vector DB:** pgvector now (one fewer system), per-tenant namespace; revisit a dedicated vector store only at large scale. **Analytics warehouse:** none yet — aggregate from the event spine; add a warehouse only when query load demands it. **Backup/restore:** managed Postgres PITR; test restores.

**Key indexes:** `Event(ws_id, type, ts)`, `Lead(ws_id, stage)`, `Conversation(ws_id, first_reply_latency)`, `PaymentState(ws_id, state)`, `PageEvent(ws_id, page_id, type, ts)`.

---

## 7. Multi-Tenancy & Isolation Architecture

**The most important section.** Defense in depth, not a single guard.

- **Tenant model:** Workspace = tenant root; Business = brand under it; Membership = user↔workspace with role. Agencies (Stage 4) = workspace-of-workspaces.
- **Enforcement layers:** (1) **Postgres RLS** keyed on `ws_id` from a session variable set per request — the backstop that catches any missed filter; (2) **application tenant-context** passed to every repo method; (3) **tenant middleware** resolves ws from auth before any handler runs.
- **Tenant-scoped everything:** queries (RLS), services (context), **background jobs** (ws_id in payload + RLS in worker), **cache** (keys prefixed `ws:{id}:`), **object storage** (key prefix `ws/{id}/`), **vector memory** (per-tenant namespace/collection), **logs** (ws_id tag, never raw PII), **analytics** (scoped; benchmarks via anonymized projection only).
- **Admin/support access:** separate role; every access creates an `AuditEvent`; Stage 2 adds explicit approval flow.
- **Export/delete:** per-workspace pipeline (§15).

**Model comparison & recommendation:**

| Model | Verdict |
|---|---|
| **Database-per-tenant** | ✅ **CHOSEN & BUILT** — one physical DB per individual seller and per agency. Total isolation; cross-tenant access impossible at the infrastructure layer. |
| Shared DB + RLS | Considered; weaker (logical) isolation. Not used for fnnlr. |
| Shared DB + app-filter only | ❌ One missed `WHERE` = leak. Never. |
| Schema-per-tenant | Growth/large tenants if needed; more ops. |
| **DB-per-tenant** | Enterprise/regulated tier only. |
| Isolated vector indexes | ✅ Now (per-tenant namespace in pgvector). |
| Tenant encryption keys | Enterprise tier (Stage 5). |

**Recommendation (BUILT):** database-per-tenant for ALL tiers from day one — every individual seller and agency gets its own physical DB; a small shared control-plane DB holds only the tenant registry, routing, and anonymized benchmark aggregates (never raw tenant data). **Implemented:** the connection router (`packages/db/src/router.ts`), provisioning (`modules/provisioning`), and isolation tests. **Premium later:** per-tenant encryption keys, region pinning. **Must never happen:** a data path that bypasses the tenant router; raw tenant data in benchmarks or shared training.

**Preventing cross-tenant leakage concretely (BUILT):** each tenant resolves to its own physical database via the control-plane router — there is no shared connection to leak through; isolation tests provision two tenants and assert tenant B cannot see tenant A's data and that no API returns another tenant's database; deletion drops the tenant's entire database (true erasure).

---

## 8. API & Service Architecture

- **Style:** **tRPC** for the web app (end-to-end types), **REST** for webhooks + future public API. **Middleware chain:** auth → tenant-context → permissions → handler. **Validation:** Zod on every input; typed response contracts. **Errors:** typed error envelope, never leak internals. **Rate limiting:** per-tenant + per-IP (Redis). **Idempotency:** keys on webhooks + outgoing sends. **Pagination:** cursor-based. **Webhooks:** signature-verified, normalized to internal events.

**Service boundaries (public methods, deps, events, failure modes, tests):**
- **TenancyService** — createWorkspace/Business, addMember. Emits `business.created`. Tests: isolation.
- **AuthService** — login, invite, role-check. Tests: permission matrix.
- **JourneyService** — generate/publish blueprint (calls AI). Emits `journey.published`. Failure: AI timeout → partial save + retry.
- **CaptureService** — ingest click/page/message. Emits `lead.captured`/`page.event`/`message.received`. Idempotent. Tests: dedup.
- **RecordService** — lead/conversation CRUD, stage changes. Emits `lead.stage_changed`.
- **PaymentService** — state transitions, proof. Emits `payment.state_changed`/`payment.recovered`. Tests: valid/invalid transitions.
- **LeakService** — run diagnosis from events. Emits `leak.detected`. Tests: fixture → expected ranking.
- **AIOrchestrationService** — run a Brain (input→output), with guardrails. Emits `ai.output_generated`.
- **ApprovalService** — queue/approve/reject actions. Emits `action.approved`.
- **VaultService** — export/delete/consent/audit.
- **ValueService** — compute recovered/assisted value.
- **IntegrationService** — connect, webhook handling, outgoing pipeline.
- **BillingService** — plans, metering, gates (Stage 3).

**Never in the API layer:** business logic in route handlers (delegate to services) · DB access bypassing repos · untyped payloads · tenant-unaware calls · prompt strings inline · long-running work in request path (enqueue it).

---

## 9. AI Architecture

**Not one prompt. Not AI-in-components. Not unbounded agents.** A registry of Brains over a gateway, with tools, memory, guardrails, approval, and evaluation.

- **Orchestration layer:** `AIOrchestrationService` runs a named Brain: resolves prompt (versioned) → assembles context (account instructions + retrieval) → calls LLM via gateway → validates output (Zod) → applies guardrails → writes `AIOutput` + logs cost/latency.
- **Brain/agent registry:** each Brain declares inputs, outputs, tools, readable/writable data, allowed actions, approval-required actions, escalation triggers, eval tests.
- **Prompt architecture:** system prompt (Arab-market + dialect) + role prompt + account instructions + policy block + task. All in `packages/prompts`, versioned.
- **Tool/function calling:** typed tools (`getJourneyEvents`, `getLeadHistory`, `proposeFix`) with permissioning + audit; tool results validated before use.
- **Retrieval:** per-tenant pgvector namespace; short-term context (recent thread) + long-term memory (account facts, past outcomes) + conversation summaries.
- **Structured extraction:** intent/objection/sentiment from messages → structured fields.
- **Confidence scoring:** each output carries confidence; low → human. **Escalation:** high-value/angry/uncertain → human. **Approval:** all outbound sends start human-in-loop. **AI action permissions:** declared per Brain; enforced centrally.
- **Logging:** every call (prompt version, tokens, cost, latency, tenant) logged. **Evaluation:** harness scoring outputs vs real conversion (the moat instrument). **Cost controls:** gateway caps, caching, model routing (cheap for classification, stronger for generation). **Fallback:** on error → graceful degrade + "needs you," never silent or wrong.

**First-stage Brains (advisory; safe):**

| Brain | Inputs | Outputs | Tools | Writes | Approval | Eval |
|---|---|---|---|---|---|---|
| **Offer** | onboarding | structured offer | — | Offer, AIOutput | adopt variant | offer→conversion |
| **Page** | offer+market | page+copy | — | Page | publish | scroll/CTA outcomes |
| **Script** | offer+dialect | WhatsApp scripts | — | ScriptPack | — | reply→outcome |
| **Followup** | stage+timing | cadence+messages | — | FollowupSequence | send | reply rate |
| **PaymentFlow** | method+market | flow+instructions | — | PaymentFlow | — | completion |
| **Leak** | journey events | ranked LeakFindings | getJourneyEvents | LeakFinding | none | fix moved metric |
| **CopyScore** | Arabic copy | score+fixes | — | AIOutput | — | score↔conversion |

**Shared private account brain:** all Brains read/write *one tenant-scoped memory* via `ai-memory`; **cross-tenant retrieval is structurally impossible** (namespace per ws_id, RLS on memory tables); the Vault viewer (§15) inspects what the AI knows; **corrections write only to that tenant's memory**; new Brains register without touching others (open/closed).

---

## 10. Prompt & AI Tooling Architecture

- **Where prompts live:** `packages/prompts`, one file per prompt, exported as versioned templates (`offer.v3.ts`). **Versioning:** semantic; `AIOutput` records which version produced it (enables rollback + A/B). **Testing:** each prompt has an eval dataset (input→expected-shape/quality). **Variables/templates:** typed interpolation; **reusable instruction blocks** (market, dialect, tone, policy, safety) composed in. **Account-specific instructions:** loaded from the tenant's memory at runtime, never hardcoded.
- **Tool schemas:** typed (Zod) + permissioned + audited; **tool result validation** before the model consumes them. **Fallback prompts** for degraded mode. **Evaluation datasets** versioned alongside prompts.
- **Naming/structure:** `system/*`, `role/*`, `extraction/*`, `summarize/*`, `reply/*`, `classify/*`, `score/*`, `report/*`, `review/*`.
- **Avoiding sprawl:** all prompts in one package, lint rule bans inline prompt strings elsewhere. **Debugging AI decisions:** every output links prompt version + inputs + retrieval used. **Rollback:** pin to a prior prompt version. **Measuring quality over time:** the eval harness tracks score trends per prompt version.

---

## 11. Channel & Integration Architecture

**Adapter pattern → normalized internal events. External chaos never reaches the core.**

| Channel/integration | Connection | Credentials | Webhooks | Normalize to | Stage |
|---|---|---|---|---|---|
| **Click-to-WhatsApp** (own) | generate tracked link/QR | — | redirect hit | `lead.captured` | 1 |
| **Page snippet** (own) | paste tag | — | event POST | `page.event` | 1 |
| **WhatsApp Cloud API** (BSP) | OAuth/BSP onboarding | encrypted vault | message/status webhooks | `message.received`/`message.status` | 2 |
| **Payments** (Paymob/Fawry/Tap/Moyasar/HyperPay) | per-provider connect | encrypted vault | payment webhooks | `payment.state_changed` | 2 |
| **Meta Ads / Pixel / CAPI** | OAuth | encrypted vault | — (read/push) | `ad.spend`/server events | 2–3 |
| **GA4/GTM** | tag | — | — | `page.event` enrich | 2 |
| **Calendly** | OAuth/embed | encrypted vault | booking webhook | `booking.created` | 2–3 |
| **Zapier/Make/n8n, public webhooks** | API key | hashed | inbound/outbound | generic events | 4 |

Per integration: **retries** (exponential + dead-letter), **idempotency** (provider event id), **rate limits** (respect + queue), **status tracking** (per-tenant integration health), **failure handling** (surface "needs you," never silent), **logging + audit**, **tenant isolation** (credentials per ws), **UI health indicator**, **admin debug tools**.

**Normalized internal event model:** `{ id, ws_id, type, source, occurred_at, payload }` — every adapter maps to this; the core only ever sees normalized events. **WhatsApp economics baked in:** the outgoing pipeline tags each send with window-state (free 24h service / 72h CTWA / paid template) and prefers free windows; paid templates require a deliberate flag.

---

## 12. Background Jobs & Event Architecture

- **Queue:** **Redis + BullMQ** (reliable, simple, tenant-id in every job). **Event bus:** the Postgres `Event` table is the durable spine; an in-process emitter fans out to consumers + enqueues async work. **No Kafka yet.**
- **Job types:** capture ingest, AI generation/diagnosis, summarization, report generation (weekly/monthly), payment-recovery checks, media/OCR processing, integration sync, retention/cleanup, analytics aggregation, benchmark projection (Stage 3).
- **Reliability:** retries with backoff, **dead-letter queue**, **idempotency keys**, **tenant scoping** (RLS in workers too), job visibility + monitoring, **priority queues** (user-facing AI > batch reports), rate-limited queues (WhatsApp/LLM).

**Key events (producer → consumers · payload · scope · retry · analytics value):**
`lead.captured` (capture → record, value · {lead, source} · ws · retry · attribution), `message.received` (capture → ai, record · {conv, msg} · ws · retry · conversation moat), `message.sent` (ai/seller → record, value · {conv, msg, window_state} · ws · retry · cost+reply-time), `ai.output_generated` (ai → eval, record · {output} · ws · no-retry · quality), `action.approved/rejected` (approvals → integrations · {action} · ws · retry · governance), `payment.state_changed` (payments → leaks, value · {lead, state} · ws · retry · recovery), `payment.recovered` (payments → value, notify · {amount} · ws · retry · ROI proof), `leak.detected` (leaks → notify · {finding} · ws · no-retry · core value), `owner.brief_generated` (value → notify · {report} · ws · retry · engagement), `integration.failed` (integrations → notify, admin · {err} · ws · retry · health), `data.export_requested`/`admin.access_granted` (vault → audit · {req} · ws · retry · trust).

---

## 13. Frontend Architecture

- **Structure:** Next.js App Router; **RTL-native** layout (dir=rtl, logical CSS properties, bidi-correct number/currency/Latin handling); locale-aware routes. **Server components** for data-heavy reads; **minimal client state** (TanStack Query for server cache, small local UI state — no Redux). **Forms:** typed + Zod-validated; **optimistic updates** for pipeline/stage changes. **Permissions-aware + tenant-aware UI** (render by role/plan). **Realtime:** lightweight (polling or SSE) for inbox/leak updates — not a heavy socket layer yet. **Design system** in `packages/ui` (tokens, primitives, RTL-first), mobile-first, accessible.

**Key screens (data deps · API · realtime · AI surface · perms · complexity risk):**
- **Dashboard** — 4 cards — leak/lead/value queries — light realtime — AI: leak summary — owner — *risk: a 5th card*.
- **Leak Board** — LeakFindings — leak API — realtime on new — AI: Leak Brain — owner — *risk: metric grid creep*.
- **Inbox/work hub** — conversations+leads — record API — realtime — AI: recommended reply — seller — *risk: overload*.
- **Lead/entity page** — lead+conversation+payment — record API — — AI: summary — seller/owner.
- **AI memory sidebar / Vault** — memory+audit — vault API — — AI: shows knowledge — owner — *risk: exposing too much raw*.
- **Owner brief/digest** — report — value API — — AI: narrative — owner.
- **Payment track** — PaymentState — payment API — realtime — — owner/seller.
- **Onboarding** — none→blueprint — journey API — — AI: generation — owner — *risk: long forms*.
- **Reports/value, settings, integrations health** — respective APIs — — — by role.

---

## 14. Security Architecture

| Area | Recommended | Priority | Acceptance | Risk if ignored |
|---|---|---|---|---|
| Authentication | Managed auth (email/OTP/social), secure sessions | P0 | Sessions expire, rotate | Account takeover |
| Authorization (RBAC) | owner/seller/agency/admin; checks in middleware | P0 | Permission matrix tested | Privilege escalation |
| Tenant isolation | RLS + scoped everything (§7) | P0 | Cross-tenant tests fail-closed | Fatal leak |
| Secret management | Vault/KMS, no secrets in code | P0 | No secrets in repo | Breach |
| Integration credential encryption | Encrypt at rest, per-tenant | P1 | Creds encrypted | Provider compromise |
| Input/output validation | Zod in+out; output sanitization | P0 | Invalid rejected | Injection |
| Webhook verification | Signature checks | P1 | Unsigned rejected | Spoofing |
| Rate limiting/abuse | Per-tenant+IP | P1 | Limits enforced | DoS/cost abuse |
| Audit logging | AuditEvent on sensitive ops | P0 | Access logged | No accountability |
| File upload security | Type/size checks, scan, signed URLs | P1 | Unsafe rejected | Malware/leak |
| PII handling/redaction | Classify, redact in logs/aggregates | P1 | No PII in logs | Privacy breach |
| Secure deletion | Hard-delete + propagation | P2 | Verified delete | Compliance |
| AI data exposure | No cross-tenant context; output filters | P0 | No leakage in retrieval | Trust collapse |

**Must never happen:** secrets in code · tenant-unaware query path · raw PII in logs · cross-tenant AI context · unsigned webhooks accepted · un-audited admin access · public cross-tenant training.

---

## 15. Trust, Privacy & Data Vault Architecture

Making the product's Vault **technically real**:

- **Data inventory + classification:** every table tagged (tenant-private / aggregate-eligible / system). **AI memory visibility:** the Vault viewer reads the tenant's vector + account-memory records and renders them human-readably. **Export pipeline:** a job assembles all ws-scoped data → signed download. **Delete pipeline:** hard-delete across Postgres + vectors + object storage + cache + derived projections (**deletion propagation** via a `data.delete_requested` event consumed by every module). **Training consent:** a `ConsentRecord` gates whether anonymized aggregates may include this tenant; default off. **Redaction pipeline:** PII stripped before any aggregate/benchmark projection. **Audit logs:** every sensitive access. **Support access approval:** request → owner/policy approval → time-boxed, audited. **Retention policies:** per-tier purge jobs. **Vector/object isolation:** per-tenant namespace/prefix. **Integration access control:** scoped tokens. **Data lineage:** events carry source; AIOutputs link inputs.
- **Per question:** *stored* — tenant data in Postgres/S3/pgvector, all ws-scoped; *access* — role-gated + RLS; *encryption* — at rest (DB/storage) + secrets in KMS, tenant keys at enterprise tier; *audited* — AuditEvent; *deleted* — propagated hard-delete; *exported* — one-click job; *AI use* — only this tenant's memory; *user sees* — the Vault viewer.

**This is a trust weapon:** the Vault is a *screen the owner can open*, not a policy PDF. Default now: isolation + audit + export/delete + consent-off. Premium later: tenant encryption, isolation tiers.

---

## 16. Analytics, Revenue & Value Tracking Architecture

Honest attribution from the event spine.

| Metric | Definition | Source events | Calculation | Limitation | UI | Stage |
|---|---|---|---|---|---|---|
| Activation | journeys built + blueprint quality | `journey.published` | count + score | proxy for value | onboarding/dashboard | 1 |
| Assisted value | captured leads otherwise untracked | `lead.captured` | count × est. value | est. value approximate | dashboard | 1 |
| **Recovered value** | payments confirmed after a fnnlr action | `payment.recovered` preceded by reminder/fix | sum, action-attributed | only counts where action preceded | Revenue Recovered card | 1–2 |
| Time saved | auto vs manual capture | capture events | modeled hours | modeled, directional | ROI report | 2 |
| Quality | reply-time / copy-score lift | message ts, AIOutput | before/after | confounders exist | reports | 2 |
| AI contribution | applied fixes that moved metric | `leak.detected`+fix+outcome | % moved | correlation not causation (labeled) | value view | 2 |
| Staff contribution | per-seller close/reply | message+payment | per-seller | small samples noisy | scoreboard | 2 |
| Retention signal | weekly Leak Board engagement + fixes | usage events | cohort | — | internal | 1+ |

**Attribution method:** event-based, conservative; label **direct vs assisted**; **never overclaim** (a `payment.recovered` only counts if a fnnlr action is causally upstream in time). **No fake ROI.** Aggregation jobs roll events into weekly/monthly reports; data-quality checks flag gaps. Benchmarks read a **separate anonymized projection**, never raw tenant rows.

---

## 17. Observability & Operations Architecture

- **Log:** structured logs (ws_id, request id, no PII), request tracing, error tracking (Sentry-class), **AI call telemetry** (tokens/cost/latency/prompt-version), job monitoring, integration/webhook/queue/DB health, cost monitoring (per-tenant AI spend). **Never log:** raw PII, secrets, full message bodies in plaintext logs, prompt-injected content unescaped.
- **Dashboards:** system health, AI cost per active tenant, queue depth, integration health, error rate. **Alert thresholds:** error-rate spike, queue backlog, AI cost anomaly, webhook failure rate, any cross-tenant access attempt (page immediately). **Runbooks:** WhatsApp quality-rating drop, payment webhook outage, LLM provider outage (failover), queue stall. **Tenant-level debugging:** scoped log views. **Admin operational dashboard.** **Incident response + rollback** (feature flags + prompt-version pinning + deploy rollback). **Environment separation:** dev/staging/prod with isolated data.

---

## 18. Testing & Quality Architecture

| Category | Test first | Lives | Acceptance | Blocks deploy? |
|---|---|---|---|---|
| **Tenant isolation** | cross-tenant read fails | `tests/isolation` | fail-closed | **Yes** |
| Permission | role matrix | per module | enforced | **Yes** |
| Unit | services, state machine | module `tests/` | logic correct | Yes |
| DB/migration | RLS policies, constraints | `packages/db` | RLS active | **Yes** |
| API | contracts, validation | per module | typed, validated | Yes |
| **AI behavior/prompt eval** | Brain output shape+quality on fixtures | `packages/prompts` | meets eval bar | Yes (for AI changes) |
| Integration/webhook | signature, idempotency, retries | `modules/integrations` | handled | Yes |
| Background job | retries, dead-letter, idempotency | `apps/worker` | reliable | Yes |
| Frontend component | RTL snapshots, states | `apps/web` | renders correctly | No (warn) |
| E2E | onboarding→blueprint→capture→leak | `tests/e2e` | golden path works | Yes (release) |
| Data export/delete | full export; verified delete+propagation | `modules/vault` | complete | **Yes** |
| Security | authz, injection, upload | `tests/security` | pass | Yes |
| Load/perf | event ingest, report queries | later | within budget | No (pre-scale) |

**Minimum quality gate before shipping a serious feature:** isolation tests green · RLS active · permission tests green · the feature's Brain passes its eval · export/delete intact · no secrets in repo.

---

## 19. Performance, Scale & Cost Architecture

- **Likely bottlenecks:** AI cost (biggest), event ingest spikes (capture/webhooks), report/aggregation queries, vector search at scale, WhatsApp/LLM rate limits.
- **Strategy:** **AI cost** — model routing (cheap classification vs strong generation), caching, gateway budgets, batch where possible; **ingest** — queue + idempotency, never block request path; **reports** — precompute via aggregation jobs, not on-demand heavy queries; **vector** — pgvector now, per-tenant namespaces, revisit dedicated store at large scale; **caching** — Redis (tenant-scoped); **pagination** — cursor everywhere; **rate limiting** — per tenant.
- **Scale assumptions:** *early* (10s tenants) — single DB/worker fine; *growth* (1000s) — read replicas, queue scaling; *agency* — heavier tenancy, possibly schema-per-large-tenant; *enterprise* — DB-per-tenant + dedicated infra.
- **Optimize now:** AI cost controls + ingest reliability + RLS query indexes. **Defer:** read replicas, warehouse, dedicated vector store, multi-region. **Don't prematurely optimize**, but the event spine + queue mean scaling is additive, not a rewrite.

---

## 20. Deployment & DevOps Architecture

- **Environments:** dev / staging / prod, isolated data. **CI/CD:** lint + typecheck + tests (isolation gate) → build → deploy; preview envs per PR. **Migrations:** versioned, **expand-then-contract** (never break running tenants); RLS policies in migrations. **Seed data:** demo workspace. **Secrets:** managed (KMS/vault), per-env. **Build/deploy:** web (Vercel or platform) + worker host + managed Postgres + Redis, **EU/ME region** for latency/data-residency. **Rollback:** deploy rollback + feature flags + prompt-version pinning. **Backups:** Postgres PITR, tested restores. **DR:** documented. **Scheduled jobs:** worker cron (reports, recovery checks, retention). **Release checklist:** migration safe · isolation tests green · flags set · rollback ready.
- **Automate now:** CI/CD, migrations, backups. **Manual OK temporarily:** some ops dashboards. **Dangerous if manual later:** migrations, secret rotation, backups. **Deploy without breaking tenant data:** expand/contract migrations + backward-compatible deploys.

---

## 21. Migration Plan — *Build Order From Zero* (greenfield)

**No existing code to migrate — so "migration" = the order to build the backbone.** The prompt's phases map cleanly to greenfield foundation work; nothing to keep/wrap/refactor/delete.

- **Phase 0 — Architecture Safety:** repo scaffold, stack, **RLS tenancy**, event spine, CI/CD, secrets, audit skeleton. *Acceptance:* isolation tests pass; event flows. *Don't touch:* features.
- **Phase 1 — Domain Boundaries:** module structure + service interfaces + event bus. *Acceptance:* modules communicate only via interfaces/events.
- **Phase 2 — Data Model Hardening:** all Stage-0/1 entities + indexes + RLS policies + soft/hard-delete strategy. *Acceptance:* migrations + isolation green.
- **Phase 3 — AI Layer Extraction:** LLM gateway + Brain registry + `packages/prompts` + eval harness. *Acceptance:* each Brain returns typed, evaluated output.
- **Phase 4 — Trust/Tenant Layer:** Vault foundation (audit, export/delete skeleton, consent), scoped jobs/cache/storage/vectors. *Acceptance:* export/delete works; scoped artifacts.
- **Phase 5 — Product Spine Architecture:** onboarding→blueprint, capture, record, payment state machine, Leak Board — wired through the above. *Acceptance:* the Execution Blueprint's Spine works end-to-end.
- **Phase 6 — Platform Readiness:** integration adapters (WhatsApp/payments), billing, agency tenancy scaffolding. *Acceptance:* Stage-2 integrations land without core changes.

Each phase: rollback = revert deploy + migration down (expand/contract makes this safe); risk = scope creep into features before foundation is solid; "what not to touch" = anything from a later phase.

---

## 22. Architecture Decision Records (ADRs)

Concise ADRs (decision · context · options · chosen · why · tradeoffs · revisit).

1. **Monolith vs services →** *Modular monolith.* Small team, transactional integrity. Revisit at Stage 4 / clear scaling pain.
2. **Tenancy →** *Database-per-tenant* (CHOSEN & BUILT): control-plane DB + one isolated physical DB per individual seller and per agency. Strongest isolation; trivial per-tenant export/delete/residency. Trade-off (accepted): migrations run across all tenant DBs (handled by the migration runner) and benchmarks use an anonymized control-plane aggregate stream.
3. **API →** *tRPC (app) + REST (webhooks/public).* Types + speed. Revisit if multi-client/public API grows (Stage 4).
4. **AI orchestration →** *Brain registry + LLM gateway + tools.* No mega-prompt; gradeable, swappable. Revisit per model landscape.
5. **Vector memory →** *pgvector, per-tenant namespace.* One fewer system. Revisit at large scale → dedicated store.
6. **Background jobs →** *Redis/BullMQ + Postgres event spine.* Reliable, simple; no Kafka. Revisit at very high event volume.
7. **Integrations →** *Adapter → normalized events.* Isolate external chaos. Stable pattern.
8. **Frontend state →** *Server components + TanStack Query, minimal local state.* Avoid Redux bloat. Revisit if realtime grows.
9. **Auth/permissions →** *Managed auth + RBAC.* Sufficient now; ABAC later for enterprise.
10. **Event tracking →** *One event spine; anonymized projection for benchmarks.* Single source; privacy-clean. Warehouse later.
11. **Observability →** *Structured logs + error+AI/cost telemetry.* Right-sized. Add APM at scale.
12. **Deployment →** *Managed Postgres/Redis + web/worker hosts, EU/ME region.* Low ops. Revisit for multi-region/enterprise.
13. **Testing →** *Isolation + eval gates block deploy.* Protects the two things that kill the company (leaks, bad AI).

---

## 23. Technical Roadmap *(by stage)*

- **Stage 0 (Foundation):** DB+RLS+event spine; module skeleton; LLM gateway+1 Brain; RTL system; CI/CD. *Tests:* isolation. *Signal:* event flows, isolation green. *Not yet:* features.
- **Stage 1 (Spine):** all Stage-1 entities; CaptureService (click+page); RecordService; PaymentState machine; LeakService+Board; generation Brains; weekly report job; Vault foundation. *Tests:* state machine, leak fixtures, export/delete. *Signal:* real leak from observed data. *Not yet:* WhatsApp API, agents.
- **Stage 2 (Market-winning):** WhatsApp Cloud API + payment webhooks (adapters→events); co-pilot + summaries + scoring Brains; approval/guardrail engine; AI memory + retrieval; owner briefing; Value Engine. *Tests:* webhook/integration, AI eval, approval. *Signal:* auto-capture>manual, NRR>100%. *Not yet:* full autonomy, marketplace.
- **Stage 3 (Monetizable):** billing+metering+gates; benchmark projection (opt-in); reports/ROI; CRO/Offer/Campaign Brains. *Tests:* billing, privacy of aggregates. *Signal:* clean conversion. *Not yet:* enterprise infra.
- **Stage 4 (Platform):** agency tenancy + sub-accounts; public API/webhooks; multi-channel adapters; automation plays; Vault tiers. *Signal:* agency-sourced growth.
- **Stage 5 (Category leader):** ecosystem/marketplace; enterprise isolation+encryption; eval system maturity; multi-region. *Signal:* "fnnlr" = the category.

---

## 24. Build Pack Readiness *(architecture-ready)*

Each: objective · domains · DB · API · FE · AI · trust · tests · deps · risk.

- **BP0 — Architecture Safety Layer.** Tenancy+RLS, event spine, CI/CD, secrets, audit skeleton. Domains: tenancy, auth, vault. *Risk:* low if disciplined. *Tests:* isolation. **No deps.**
- **BP1 — Domain Structure & Service Boundaries.** Module scaffolds + event bus. Deps: BP0.
- **BP2 — Core Data Model.** Stage-1 entities + indexes + RLS + soft/hard-delete. Deps: BP0–1. *Tests:* migration+isolation.
- **BP3 — Tenant/Auth/Permissions Hardening.** RBAC, tenant middleware, scoped cache/storage/jobs. Deps: BP0. *Risk:* high if skipped.
- **BP4 — Core Workflow Architecture.** CaptureService (click+page), RecordService, PaymentState machine. Deps: BP2–3. *Tests:* state machine.
- **BP5 — AI Orchestration Layer.** Gateway, Brain registry, prompts package, eval harness, guardrail hooks. Deps: BP1.
- **BP6 — AI Memory & Retrieval.** pgvector namespaces, account memory, summaries. Deps: BP5. *Risk:* cross-tenant retrieval — test hard.
- **BP7 — Human Approval Architecture.** ApprovalRequest, queue, takeback, policy engine (before any send). Deps: BP5. *Risk:* over-automation.
- **BP8 — Owner/Admin Intelligence Architecture.** Report jobs, dashboard data, briefing/notify. Deps: BP4, value events.
- **BP9 — Trust/Data Vault Architecture.** Export/delete pipeline + propagation, consent, audit, memory viewer. Deps: BP2–3, BP6.
- **BP10 — Analytics/Value Tracking Architecture.** Event aggregation, attribution, Revenue Recovered. Deps: BP4.
- **BP11 — Integration/Event Pipeline.** Adapter pattern, WhatsApp/payment webhooks, normalized events, health. Deps: BP1, BP4. *Stage 2.*
- **BP12 — Observability & QA Foundation.** Structured logs, AI/cost telemetry, alerts, isolation/eval gates in CI. Deps: BP0. *Do early.*

---

## 25. What NOT to Architect Yet

| Trap | Tempting because | Dangerous because | Instead | Appropriate when |
|---|---|---|---|---|
| Microservices | "scalable," "clean" | Ops overhead, distributed bugs, slow | Modular monolith | Stage 4+, clear scaling pain |
| Full event sourcing/CQRS | "audit, replay" | Complexity, slow dev | Event spine + current-state tables | Only if replay becomes essential |
| Automation canvas | "powerful" | No one uses it; huge build | Pre-built revenue plays | Stage 4 if demanded |
| Marketplace arch | "platform!" | Premature abstraction | Hardcode integrations first | Stage 5 |
| Enterprise isolation for all | "secure" | Cost, complexity for tiny tenants | RLS default, tiers later | Enterprise deals |
| Many integrations | "completeness" | Maintenance + fragility | WhatsApp + payments first | After PMF |
| Unbounded AI agents | "autonomous!" | Trust/safety disaster | Human-in-loop + guardrails | Earned per-tenant on data |
| Generic plugin system | "extensible" | Premature, insecure | Internal modules | Stage 4–5 |
| Analytics warehouse | "data-driven" | Garbage-in without clean events | Event spine first | Query load demands it |
| Full rewrite | "cleaner" | N/A (greenfield) — but don't churn the foundation | Commit and build | Never without proof |
| Complex billing | "revenue!" | Before value proof, wasted | Simple tiers after value | Stage 3 |
| Dashboards before workflow | "looks done" | Vanity, not value | Capture+diagnosis first | After spine |
| Optimize scale before correctness | "fast" | Premature, hides bugs | Correctness + RLS | At real load |
| Ignoring tenant isolation | "ship faster" | Fatal | RLS from commit 1 | Never skip |
| Prompts in random files | "quick" | Sprawl, no rollback | `packages/prompts` | Never scatter |
| Build without eval gates | "speed" | Unmeasurable AI | Eval harness early | Now |

---

## 26. Final Technical Architecture Memo

You're architecting greenfield with the strategy already locked — the rare luxury of building the backbone right the first time. Don't squander it on either extreme: not an enterprise monster, not a demo that collapses.

**Recommended architecture:** a **modular monolith** — Next.js + TypeScript, **Postgres with RLS**, tRPC, Redis/BullMQ, pgvector, S3, an **LLM gateway with a Brain registry** — one deployable, clean domain modules, an **event spine**, worker processes. It carries you through ~12 months and Stage 1–3 without a rewrite, and the event spine + adapters mean Stage 4–5 scaling is *additive*.

**Build first:** BP0 (tenancy + RLS + event spine + CI) then BP2–4 (data model, auth hardening, capture/record/payment) then BP5 (AI orchestration). **Stabilize first:** isolation — it's the one thing that can't be added later. **Protect:** tenant isolation, the event spine, Brains-behind-interfaces, prompts-in-one-package, capture-before-advise. **Simplify:** UI (4 cards, RTL, mobile-first), tenancy model (RLS shared-DB), jobs (BullMQ, no Kafka), vectors (pgvector, no separate store). **Delay:** WhatsApp API, payment processing, agents, agency console, marketplace, warehouse, multi-region. **Never compromise:** cross-tenant isolation, honest attribution, human-in-loop before autonomy.

**Where the (absent) repo helps:** no legacy to fight, no rewrite, no smells. **Where the absence is dangerous:** no guardrails exist yet, so the discipline must come from this document and the CI gates (isolation + eval block deploy) — they are how you stop "demo-driven development" from quietly skipping capture and isolation.

**The architecture decision that matters most — already made & built:** **database-per-tenant isolation, implemented from commit one, with the event spine as the single source of truth.** **What makes it scalable:** the event spine + queue + stateless services + per-tenant DBs (shard naturally). **What makes it trustworthy:** total physical isolation + the Vault (export/delete/consent/audit) — and per-tenant delete is a literal database drop. **What makes the AI safe:** the Brain registry + guardrail engine + human-in-loop + eval gates. **What makes it hard to copy:** the per-tenant conversation-outcome data accumulating in the spine + memory — which only exists because you instrument from day one.

**The first implementation pack:** **BP0 — Architecture Safety Layer.** Stand up the repo, the stack, **RLS tenancy**, the event spine, CI with the isolation gate, and one Brain through the gateway end-to-end. Everything else builds on that floor.

When the repo exists, run this prompt against it — and treat this plan as the architecture the code must converge to. I can turn BP0 (or any pack) into actual scaffolding code whenever you're ready.

---

*Grounded in: the seven fnnlr vision documents and the prior Expert Review, Company Vision (Pre-Code), Product Bible, and Execution Blueprint. The prompt's code-grounded and migration sections were adapted to greenfield, not fabricated, because no source code exists yet.*
