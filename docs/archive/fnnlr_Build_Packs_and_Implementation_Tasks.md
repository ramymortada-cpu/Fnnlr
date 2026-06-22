# fnnlr — Build Packs & Implementation Tasks
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
### Architecture → executable build units — greenfield edition

> **Honest framing (final in the series).** This prompt assumes an attached repo and says *"do not create tasks for files you have not verified"* and *"if file paths are inferred, label them as inferred."* **There is still no source code — greenfield.** So: every "Current Code Status" is **greenfield — nothing exists yet**, and **all file paths are *proposed*** (marked `[proposed]`), consistent with the folder structure committed in the Technical Architecture Plan. Nothing is claimed as observed from code. This is exactly the right output to hand a coding agent to *start* the repo — the natural next step after five planning docs. §19 gives copy-paste execution prompts for the first three packs.
>
> **Committed stack (from the Architecture Plan):** Next.js (App Router, TS) · Postgres + RLS · tRPC + REST(webhooks) · Drizzle/Prisma · Redis/BullMQ · pgvector · S3 · LLM gateway. One modular monolith.

---

## ✅ BUILD STATUS (what already exists in the codebase)

The foundation has been **built and tested** (24 tests, 22 pass, 2 skip-needs-live-DB; clean typecheck). This changes several Build Packs from "to do" to "done / partially done." Codex should **not rebuild these** — extend them.

| Pack / capability | Status | Where |
|---|---|---|
| BP0 Architecture Safety (tenancy + event spine) | ✅ **BUILT** as **database-per-tenant** (not RLS) | `packages/db/src/router.ts`, `modules/provisioning`, control-plane + tenant migrations |
| Tenant provisioning + delete (true erasure) | ✅ BUILT | `modules/provisioning/src/provision.ts`, `scripts/provision-tenant.ts`, `scripts/delete-tenant.ts` |
| Isolation tests (the company-ending risk) | ✅ BUILT & GREEN | `tests/isolation*.test.ts` |
| BP3 Core Data Model (tenant schema) | ✅ BUILT (leads, conversations top-level, payments, events, automations…) | `packages/db/tenant/migrations/0001`, `0002` |
| Automation Engine (was a later pack) | ✅ **BUILT** — durable, idempotent, WhatsApp-economics-aware, approval gates | `modules/automation/src/*` |
| DB-backed RunStore + ActionPorts | ✅ BUILT | `modules/automation/src/store.ts`, `ports.ts` |
| Scheduler (durable waits) | ✅ BUILT | `modules/automation/src/scheduler.ts`, `scripts/run-scheduler.ts` |
| Synthetic triggers (stalled/no-reply) | ✅ BUILT | `modules/automation/src/synthetic.ts` |
| WhatsApp Cloud API sender + window tracking | ✅ BUILT (needs BSP creds) | `modules/channels/src/whatsapp.ts` |
| HTTP API (automations, events, approvals) | ✅ BUILT & TESTED | `apps/api/src/server.ts`, `tests/api.test.ts` |
| Visual automation builder (RTL Arabic) | ✅ BUILT | `apps/automation-builder/index.html` |
| Codex handoff (what's left, in order) | ✅ written | `HANDOFF_FOR_CODEX.md` |

**Still to build (Codex):** auth + session→tenant resolution (replace the `x-tenant-id` header), BSP credentials + `phone` column on leads, inbound WhatsApp webhook, capture module (click-to-WhatsApp + page snippet), Leak Brain + Leak Board, owner dashboard, Data Vault screens. The event spine + isolation they depend on already exist.

> **Note on tenancy wording below:** the original Build Packs assumed shared-DB + RLS with a `ws_id` column. The built model is **database-per-tenant**: there is **no `ws_id` column** inside a tenant DB (the database boundary *is* the tenant boundary). Read "RLS / ws_id" in the specs below as "the tenant's own isolated database, reached via `withTenant(tenantId)`."

---

## 1. Build Strategy Summary

- **Category:** Arabic-Native Revenue Journey OS.
- **First wedge:** mid-ticket Arabic course/program sellers (Meta ads → WhatsApp → local pay).
- **Product spine:** onboarding→blueprint · click-to-WhatsApp capture · page snippet · system of record (Conversation top-level) · payment state machine · Leak Board · weekly diagnosis.
- **Technical starting point:** nothing built; the four strategy docs + this are the spec.
- **Architecture direction:** modular monolith, RLS multi-tenancy, event spine, Brains behind a gateway.
- **First customer-facing milestone:** a course-seller gets a blueprint that beats their setup, then sees a *real* leak from captured data.
- **First technical milestone:** tenancy + RLS + event spine proven (isolation tests green, an event flows end-to-end).
- **First trust/privacy milestone:** tenant isolation enforced + audit logging + Vault foundation.
- **First AI milestone:** the generation Brains + the Leak Brain returning typed, evaluated output.
- **First revenue/value milestone:** biggest leak's money impact → Revenue Recovered counter.

**Right build philosophy for this repo:** **harden tenant isolation and the event spine first; build one complete workflow (the spine) before many partial modules; instrument capture before AI advice; ship AI suggestions before any AI autonomy; track value from day one.** In one line: **foundation → one real workflow → observed-data diagnosis → proof — never the generator alone.**

---

## 2. Current Repo Implementation Readiness

**Greenfield — there is no repo.** Honest classification:

| Bucket | Status / what it means for the build |
|---|---|
| Ready-to-build | Nothing exists; *but* the spec is ready and the stack is chosen → ready to scaffold. |
| Needs light refactor | N/A. |
| Needs hardening before features | The foundation itself (tenancy, event spine) — handled by **BP0** before any feature. |
| Should be isolated | N/A. |
| Don't touch yet | N/A. |
| May need replacement later | N/A. |
| Risks that could break implementation | Skipping isolation/event-spine and jumping to the generator (the one real risk). Mitigated by sequencing BP0 first. |
| Missing foundations that block BP1 | All of BP0: repo scaffold, RLS tenancy, event spine, CI with isolation gate, LLM gateway. **BP1 cannot start until BP0 is done.** |

Every observation points to the same plan: **BP0 establishes the floor; nothing else can be verified or safe without it.**

---

## 3. Build Pack Rules

- One pack = one coherent product/technical outcome; **no mixing unrelated concerns.**
- Independently reviewable and independently shippable (behind a flag if needed).
- **Mandatory in every pack:** acceptance criteria · tests/verification · tenant-isolation preserved · explicit out-of-scope.
- **AI-touching packs** must include logging + evaluation cases.
- **Data-touching packs** must include migrations + rollback thinking (expand/contract).
- **UX-touching packs** must include empty/loading/error/success states (RTL, mobile).
- **Integration-touching packs** must include retries + idempotency + failure handling.
- **Max scope per pack:** roughly one to two weeks for one engineer/agent; if larger, **split.**
- **Split when:** it crosses two domains, or mixes schema + AI + UI in a way that can't be reviewed together.
- **Merge when:** two packs are so coupled that one can't be tested without the other.
- **Unsafe pack:** touches tenant data without isolation tests; adds an AI action without approval/guardrails; migrates without rollback.
- **Ready-to-implement pack:** dependencies done · scope + out-of-scope written · acceptance criteria concrete · file list proposed · tests named.

---

## 4. Build Pack Dependency Map

```
BP0 Architecture Safety Layer  ── floor for everything
 ├─► BP2 Domain Structure & Service Boundaries
 │     └─► BP3 Core Data Model & Migrations
 │            ├─► BP4 Tenant/Auth/Permissions Hardening
 │            ├─► BP5 Core Workflow / Capture (click + page)
 │            │      └─► BP6 System of Record (Lead/Conversation/Payment SM)
 │            │             ├─► BP10 Owner/Admin Experience (dashboard, weekly report)
 │            │             ├─► BP11 Staff/Team Workspace
 │            │             └─► BP14 Revenue/Value Tracking
 │            └─► BP7 AI Orchestration Layer
 │                   ├─► BP8 First AI Employee (Leak Brain + generation Brains)
 │                   │      └─► BP16 Market-Native Wow (Leak Card / Screenshot-to-Lead)
 │                   ├─► BP9 AI Memory & Knowledge  ──► BP10/11 (co-pilot)
 │                   └─► BP12 Human Approval & Control ──► (gates any future send)
 └─► BP15 Trust/Data Vault Basics (isolation+audit start in BP0/BP4; export/delete here)
        └─► BP17 Analytics/Reporting · BP18 Integrations/Webhooks (Stage 2)
               └─► BP19 Billing (Stage 3) · BP20 Observability/QA (start early, mature late)
```

- **Must be first:** BP0 (no exceptions).
- **Critical path:** BP0 → BP2 → BP3 → BP5 → BP6 → BP8 → BP16 (the path that produces the demoable category proof).
- **Can run in parallel (after BP3):** BP4 (auth hardening) ∥ BP7 (AI orchestration) ∥ BP15 (vault basics).
- **Depends on DB:** BP3 onward. **Depends on auth/tenancy:** BP4+, all feature packs. **Depends on AI arch:** BP8, BP9. **Depends on UI foundation:** BP10, BP11, BP16. **Depends on events:** BP14, BP17. **Depends on integrations:** BP18.
- **Risky dependency:** BP9 (AI memory) on isolation — cross-tenant retrieval must be impossible; test hard.
- **Must NOT start too early:** BP12 autonomy (before approval layer), BP18 integrations (before spine), BP19 billing (before value proof), BP13 customer-experience polish (before the workflow works).

---

## 5. Complete Build Pack Inventory

| # | Title | Stage | Priority | Objective | Unlocks | Deps | Complexity | Risk | Size | Pre-launch? |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | Architecture Safety Layer | 0 | P0 | Repo+stack+RLS+event spine+CI+gateway | everything | — | M | low if disciplined | M | required |
| 2 | Domain Structure & Service Boundaries | 0 | P0 | modules + event bus | clean growth | 0 | S | low | S | required |
| 3 | Core Data Model & Migrations | 1 | P0 | Stage-1 entities + RLS | features | 2 | M | med | M | required |
| 4 | Tenant/Auth/Permissions Hardening | 1 | P0 | RBAC + tenant middleware | safe features | 3 | M | high | M | required |
| 5 | Core Workflow / Capture | 1 | P0 | click + page capture | observed data | 3,4 | M | med | M | required |
| 6 | System of Record / CRM | 1 | P0 | Lead/Conversation/Payment SM | retention | 5 | M | med | L | required |
| 7 | AI Orchestration Layer | 1 | P0 | gateway+Brain registry+prompts+eval | all AI | 2 | M | med | M | required |
| 8 | First AI Employee | 1 | P0 | generation Brains + Leak Brain | the wedge | 6,7 | M | med | L | required |
| 9 | AI Memory & Knowledge | 2 | P1 | per-tenant vectors + account memory | co-pilot | 7,4 | M | high (isolation) | M | no |
| 10 | Owner/Admin Experience | 1 | P1 | dashboard + weekly report | engagement | 6,8 | S | low | M | required |
| 11 | Staff/Team Workspace | 1–2 | P1 | inbox + recommended reply | seller value | 6,8 | M | med | M | soon |
| 12 | Human Approval & Control | 2 | P1 | approval queue + guardrails | safe autonomy | 7 | M | high | M | before sends |
| 13 | End-Customer Experience Quality | 2 | P2 | page/WA/payment polish | conversion | 6 | M | med | M | no |
| 14 | Revenue/Value Tracking | 1–2 | P1 | Revenue Recovered + attribution | proof | 6 | M | med | M | soon |
| 15 | Trust/Data Vault Basics | 1–2 | P0/P1 | isolation + export/delete + audit | trust | 0,4 | M | high | M | required (isolation) |
| 16 | Market-Native Wow Moment | 1–2 | P1 | Leak Card / Screenshot-to-Lead | activation | 8 | S | low | S | required |
| 17 | Analytics & Reporting | 2 | P2 | aggregation + reports | insight | 14 | M | low | M | no |
| 18 | Integrations / Webhooks | 2 | P1 | WhatsApp API + payment webhooks | auto-capture | 5,6 | L | high | L | no |
| 19 | Billing / Packaging | 3 | P2 | tiers + metering + gates | monetize | 14 | M | med | M | before charging |
| 20 | Observability, QA, Release | 0→ongoing | P0 | logs+AI/cost telemetry+gates | safety | 0 | M | low | M | start early |

*(BP1 from the prompt's template = "Product Spine," which here is realized as BP3+BP5+BP6+BP8+BP10 together; kept the architecture-aligned numbering from the Technical Plan.)*

---

## 6. Detailed Build Pack Specifications

Full spec for the **critical-path packs** (0, 3, 5, 6, 7, 8, 15, 16). Others follow the same format and the inventory above; expand on request.

---

### Build Pack 0 — Architecture Safety Layer

**Objective.** Stand up the repo, the committed stack, hard multi-tenancy (Postgres RLS), the event spine, the LLM gateway skeleton, the RTL UI shell, and CI with an isolation gate — so every later pack builds on a safe, tenant-isolated, testable floor.

**Why it matters.** Greenfield's one advantage is getting the foundation right once. Tenancy and the event spine cannot be retrofitted without a rewrite; CI gates are what stop "demo-driven development" from skipping isolation later.

**User outcome.** None directly (internal). A developer can create a workspace, and data is provably isolated.
**Business outcome.** Enables a trustworthy multi-tenant product; protects against the one fatal failure (cross-tenant leak).
**Technical outcome.** A deployable monolith with RLS, an append-only `Event` table, a job runner, an LLM gateway, and green isolation tests in CI.

**Current Code Status.** Greenfield — nothing exists.

**Scope.** Repo scaffold (folder structure from the Architecture Plan) · stack wiring · `Workspace`/`Business`/`Membership`/`User` + RLS · session→tenant-context middleware · `Event` table + emitter + BullMQ queue · LLM gateway abstraction (one provider) + one trivial Brain interface end-to-end · RTL app shell + design tokens · CI (lint, typecheck, **isolation test gate**) · secrets/env validation · managed Postgres/Redis deploy.
**Out of scope.** Any feature, any real Brain logic, any integration, any UI beyond a stub dashboard, billing, analytics dashboards.

**Dependencies.** None.

**Files Likely Touched** `[all proposed]`
- *Create:* `packages/db/{schema,migrations,rls}`, `packages/events/`, `packages/ai-core/{gateway,brain-base}`, `packages/prompts/`, `packages/ui/{tokens,primitives}`, `packages/types/`, `packages/config/`, `apps/web/app/`, `apps/worker/`, `modules/tenancy/`, `modules/auth/`, `infra/`, `.github/workflows/ci.yml`, `tests/isolation/`.
- *Edit:* root `package.json`, `tsconfig`, env templates.
- *Avoid:* any `modules/*` feature module (later packs).

**Database Changes.** Tables: Workspace, Business, Membership, User, Event, AuditEvent. RLS policies keyed on `ws_id` (default-deny). Indexes: `Event(ws_id,type,ts)`. Migration = first; rollback = drop (greenfield, safe). Seed: one demo workspace.

**API/Backend.** Auth routes; tenant-context middleware (sets Postgres session `ws_id`); event ingest service; LLM gateway service; one stub Brain. Emits `business.created`.

**Frontend/UX.** RTL app shell, locale layout, stub dashboard, loading/error/empty primitives. Mobile-first.

**AI Changes.** Gateway abstraction + Brain base interface + one trivial Brain (e.g., echo/classify) proven end-to-end + cost/latency logging. Prompt lives in `packages/prompts`.

**Trust/Security.** RLS default-deny; tenant middleware; AuditEvent skeleton; secrets in env/KMS; no PII in logs.

**Analytics/Events.** `Event` spine live; emit a `system.bootstrapped` test event.

**Tests Required.** **Isolation test (cross-tenant read fails) — blocking.** Migration test (RLS active). Gateway test (Brain returns typed output). CI green.

**Acceptance Criteria.** (1) Two workspaces created; workspace B cannot read A's rows via any path — test proves it. (2) An event is emitted, stored, and consumed. (3) The stub Brain runs through the gateway and logs cost. (4) RTL shell renders on mobile. (5) CI runs lint+typecheck+isolation and blocks on failure. (6) Deploys to staging.

**QA Checklist.** RLS on all tables ✓ · tenant middleware sets context ✓ · no secrets in repo ✓ · isolation test green ✓ · worker runs a job ✓ · staging deploy ✓.

**Rollback/Safety.** Greenfield — revert deploy; migrations are additive/droppable.

**Risks.** *Over-engineering* (endless "foundation"). *Mitigation:* the Acceptance Criteria above are the whole pack — when they pass, BP0 is DONE; no extra polish.

**Definition of Done.** All acceptance criteria pass in CI + staging. Nothing more.

**Implementation Notes.** Set `ws_id` via `SET LOCAL` per request inside a transaction; RLS reads it. Keep the Brain trivial — the point is the *pipe*, not intelligence. Resist building any feature.

---

### Build Pack 3 — Core Data Model & Migrations

**Objective.** Create all Stage-1 entities with RLS, indexes, and soft/hard-delete strategy, so the workflow and AI packs have a typed, isolated data layer.

**Why it matters.** The data model is the product's skeleton; `Conversation` as a top-level object is the architectural decision that makes fnnlr a system of record, not a CRM clone.

**Current Code Status.** Greenfield (BP0 created tenancy + Event only).
**Scope.** Journey, Offer, Page, PageEvent, ScriptPack, FollowupSequence, PaymentFlow, Lead, Conversation (top-level), Message, PaymentState, LeakFinding, AIOutput + relationships + indexes + RLS + soft-delete. **Out of scope.** Task, Objection, ApprovalRequest, vector tables, billing entities (later packs).
**Dependencies.** BP0, BP2.
**Files** `[proposed]`: `packages/db/schema/*`, `packages/db/migrations/*`, `modules/*/types.ts`, `modules/*/repo.ts`.
**DB.** All above with `ws_id` + RLS; `Conversation.lead_id` nullable; indexes per Architecture Plan §6. Rollback: down migrations.
**Tests.** Migration + RLS + isolation on every new table (blocking); relationship integrity.
**Acceptance.** All entities created, ws-scoped, isolation-tested; `Conversation` exists independently of `Lead`.
**DoD.** Migrations apply/rollback cleanly; isolation green for every table.

---

### Build Pack 5 — Core Workflow / Capture

**Objective.** Implement click-to-WhatsApp capture and the page tracking snippet so real leads, conversations, and page events flow in as observed data.

**Why it matters.** This is the **instrument-before-advise** rule made concrete — the seed of the data moat and the thing that makes the Leak Board real.

**Current Code Status.** Greenfield.
**Scope.** Tracked link/QR generator; redirect endpoint → creates `Lead` + `Conversation` (source, first-touch ts); page snippet + ingest endpoint → `PageEvent` (view/scroll/price_reach/cta_click). Idempotent ingest. **Out of scope.** WhatsApp API, payment webhooks, message auto-capture (Stage 2 / BP18).
**Dependencies.** BP3, BP4.
**Files** `[proposed]`: `modules/capture/{service,repo,events,routes}.ts`, `apps/web/app/(public)/r/[code]/route.ts` (redirect), `apps/web/app/api/track/route.ts` (snippet ingest), `packages/ui` snippet docs.
**API/Backend.** `GET /r/:code` (tracked redirect → WhatsApp), `POST /api/track` (page events). Idempotency keys. Emits `lead.captured`, `page.event`.
**Frontend.** Link/QR generator UI; snippet install screen with copy button + states.
**Trust.** All writes ws-scoped; no PII in tracking beyond consented; rate-limited ingest.
**Analytics.** `lead.captured`, `page.event` → spine (feeds attribution + leaks).
**Tests.** Redirect creates lead+conversation with correct attribution; dedup; isolation; snippet events register scroll/price/cta.
**Acceptance.** Clicking a fnnlr link creates a ws-scoped Lead+Conversation with source+timestamp; page snippet records the four event types.
**DoD.** Capture works end-to-end; events visible in the spine; isolation green.

---

### Build Pack 6 — System of Record / CRM

**Objective.** The lead pipeline + Conversation timeline + Payment state machine — the retention engine where the user starts living.

**Current Code Status.** Greenfield.
**Scope.** Lead pipeline (8 stages) UI+service; Conversation timeline; Message records (manual log in V1); PaymentState machine (config-driven method registry, manual transitions, proof upload). **Out of scope.** Auto-capture of messages, gateway webhooks, autonomous follow-up.
**Dependencies.** BP5.
**Files** `[proposed]`: `modules/record/*`, `modules/payments/*`, `apps/web/app/(app)/pipeline/*`, `.../leads/[id]/*`, `.../payments/*`, `packages/config/payment-methods.ts`.
**DB.** Uses BP3 entities; payment state history; method registry from config.
**Frontend.** Kanban pipeline (optimistic), lead entity page (context + timeline + recommended-reply slot), payment track (states, proof upload), all states.
**Trust.** ws-scoped; audit on payment confirmations.
**Analytics.** `lead.stage_changed`, `payment.state_changed`, `payment.recovered`.
**Tests.** State-machine transitions (valid/invalid); pipeline moves; isolation; proof upload security.
**Acceptance.** A lead moves through stages; its thread + payment state are visible together; "requested transfer, no proof" is queryable.
**DoD.** The system of record is usable; payment SM logs every transition.

---

### Build Pack 7 — AI Orchestration Layer

**Objective.** The Brain registry + LLM gateway + prompts package + eval harness + guardrail hooks — so AI is modular, swappable, logged, and gradeable.

**Current Code Status.** Greenfield (BP0 created the gateway skeleton).
**Scope.** Brain registry; typed Brain interface (input/output/tools/permissions); `packages/prompts` with versioning; eval harness (fixture→expected); guardrail hook points; cost/model routing; structured-output validation (Zod). **Out of scope.** Specific Brains' domain logic (BP8), AI memory (BP9), agent autonomy (BP12).
**Dependencies.** BP2.
**Files** `[proposed]`: `packages/ai-core/{registry,gateway,tools,guardrails}.ts`, `packages/prompts/*`, `modules/ai/{service,eval}.ts`.
**AI.** Registry + base; gateway with caps/caching/routing; eval harness; logging (prompt version, tokens, cost, latency, tenant).
**Tests.** A registered Brain runs, validates output, logs cost; eval harness scores a fixture; guardrail hook blocks a forbidden action.
**Acceptance.** A new Brain can be registered and invoked through one path; every output is versioned, validated, logged, and evaluable.
**DoD.** The orchestration layer is the *only* way AI runs; no inline prompts elsewhere.

---

### Build Pack 8 — First AI Employee (Generation Brains + Leak Brain)

**Objective.** Ship the generation Brains (Offer/Page/Script/Followup/PaymentFlow) powering the onboarding blueprint, and the **Leak Brain** that turns observed events into a ranked, money-quantified Leak Board.

**Why it matters.** This is the wedge — the moment a user says "this understands my revenue problem." The Leak Brain **must run on captured events, never the onboarding survey.**

**Current Code Status.** Greenfield.
**Scope.** The five generation Brains (advisory, no actions) + onboarding→blueprint flow; Leak Brain over events → `LeakFinding`s with severity, money_impact, fastest_fix; Leak Board UI + #1 Leak Card. **Out of scope.** Autonomous fixes, benchmarks (need scale), co-pilot sends.
**Dependencies.** BP6, BP7.
**Files** `[proposed]`: `modules/ai/brains/{offer,page,script,followup,payment,leak}.ts`, `packages/prompts/{offer,page,script,followup,payment,leak}.*`, `apps/web/app/(app)/onboarding/*`, `.../leaks/*`.
**AI.** Generation Brains (input: onboarding/journey; output: structured records). Leak Brain (input: journey events via `getJourneyEvents` tool; output: ranked findings). All logged + evaluable.
**Trust.** ws-scoped; Leak Brain reads only this tenant's events.
**Analytics.** `ai.output_generated`, `leak.detected`.
**Tests.** **Leak Brain fixture test: given event fixtures → expected leak ranking + money impact (proves observed-data, not self-report).** Generation Brains return valid, dialect-correct structures.
**Acceptance.** Onboarding produces a coherent blueprint <20 min; the Leak Board shows a real, prioritized leak with a credible money number from captured data.
**DoD.** Blueprint + Leak Board live; Leak Brain provably runs on events.

---

### Build Pack 15 — Trust/Data Vault Basics

**Objective.** Make isolation real and visible: enforce tenant-scoped everything, audit logging, and an export/delete pipeline with deletion propagation; consent default-off.

**Current Code Status.** Greenfield (RLS + audit skeleton from BP0/BP4).
**Scope.** Scoped jobs/cache/storage/vectors; AuditEvent on sensitive ops; export job (ws data → signed download); delete pipeline (`data.delete_requested` consumed by every module → hard-delete across Postgres/storage/vectors/cache/projections); `ConsentRecord` (default off). **Out of scope.** Tenant encryption, isolation tiers, enterprise controls (Stage 5).
**Dependencies.** BP0, BP4.
**Files** `[proposed]`: `modules/vault/{service,export,delete,consent,audit}.ts`, `apps/web/app/(app)/vault/*`.
**Trust.** The core of the trust promise; deletion must propagate everywhere.
**Tests.** Full export completeness; delete removes across all stores (verified); audit captures access; isolation holds.
**Acceptance.** Owner can export all data and delete it with verified propagation; sensitive access is audited; consent defaults off.
**DoD.** Export/delete/audit/consent work and are tested.

---

### Build Pack 16 — Market-Native Wow Moment

**Objective.** The signature demo moment — the **#1 Leak Card** ("your biggest leak = 18,000 EGP — fix it") and/or **Screenshot-to-Lead** (OCR a payment proof → advance PaymentState).
**Current Code Status.** Greenfield.
**Scope.** The Leak Card hero treatment with money impact + one-tap fix; (optional) screenshot OCR → state transition. **Out of scope.** Full autonomy, multi-wow scope creep.
**Dependencies.** BP8 (Leak Card); BP6 (Screenshot-to-Lead).
**Files** `[proposed]`: `apps/web/app/(app)/dashboard/leak-card.tsx`, `modules/capture/ocr.ts`.
**Tests.** Leak Card renders the top finding with money + fix; OCR advances state on a sample proof.
**Acceptance.** The demo lands ("this was built for me").
**DoD.** One wow moment works cleanly end-to-end.

---

## 7. Atomic Implementation Tasks *(BP0 fully decomposed; later packs summarized)*

### BP0 tasks

**Task 0.1 — Repo scaffold & stack wiring.** *Type:* infra. *Objective:* monorepo with the committed folder structure + stack. *New files* `[proposed]`: root config, `apps/web`, `apps/worker`, `packages/*`, `modules/*` stubs. *Steps:* init monorepo → add Next.js(TS) → tRPC → Drizzle/Prisma → Redis/BullMQ → set up `packages/ui` tokens (RTL). *Acceptance:* app builds + boots; worker boots. *Tests:* build/typecheck pass. *Out of scope:* features.

**Task 0.2 — Postgres + RLS tenancy.** *Type:* database/security. *Objective:* Workspace/Business/Membership/User + RLS default-deny. *Steps:* schema → migration → RLS policies on `ws_id` → request middleware sets `SET LOCAL ws_id`. *Acceptance:* cross-tenant read fails. *Tests:* **isolation (blocking).** *Risk:* missing a policy → leak; default-deny prevents.

**Task 0.3 — Event spine + queue.** *Type:* backend. *Objective:* append-only `Event` + emitter + BullMQ. *Steps:* table+index → emitter API → worker consumer → demo `system.bootstrapped`. *Acceptance:* event emitted→stored→consumed. *Tests:* ingest + consume.

**Task 0.4 — LLM gateway + stub Brain.** *Type:* AI. *Objective:* one provider behind a gateway + Brain base + trivial Brain + cost logging. *Steps:* gateway (caps/cache) → Brain interface → echo/classify Brain → prompt in `packages/prompts`. *Acceptance:* Brain runs through gateway, logs cost. *Tests:* gateway contract.

**Task 0.5 — RTL app shell + primitives.** *Type:* frontend. *Objective:* dir=rtl layout, tokens, loading/error/empty primitives, stub dashboard. *Acceptance:* renders mobile-first RTL. *Tests:* render snapshot.

**Task 0.6 — CI with isolation gate + secrets/env validation.** *Type:* tests/infra. *Objective:* CI runs lint+typecheck+isolation and blocks on failure; env schema validated at boot. *Acceptance:* failing isolation blocks merge. *Tests:* CI green path + red path.

**Task 0.7 — Staging deploy.** *Type:* infra. *Objective:* managed Postgres/Redis + web/worker hosts (EU/ME region), PITR backups. *Acceptance:* staging reachable; migration applied. *Tests:* smoke.

### Later packs (task headlines; expand on request)
- **BP3:** 3.1 entity schemas · 3.2 RLS+indexes per table · 3.3 soft/hard-delete · 3.4 isolation tests per table.
- **BP5:** 5.1 tracked-link generator · 5.2 redirect→Lead/Conversation · 5.3 page snippet+ingest · 5.4 idempotency · 5.5 capture tests.
- **BP6:** 6.1 pipeline UI/service · 6.2 conversation timeline · 6.3 payment state machine · 6.4 method registry · 6.5 proof upload · 6.6 transition tests.
- **BP7:** 7.1 registry · 7.2 prompts package+versioning · 7.3 eval harness · 7.4 guardrail hooks · 7.5 cost/routing.
- **BP8:** 8.1 generation Brains · 8.2 onboarding→blueprint · 8.3 Leak Brain · 8.4 Leak Board UI · 8.5 Leak-Brain fixture eval.
- **BP15:** 15.1 scoped jobs/cache/storage/vectors · 15.2 audit · 15.3 export · 15.4 delete propagation · 15.5 consent.

---

## 8. Build Pack 0 — Extra Detail
*(Fully specified in §6 and decomposed in §7.)* **Exact goal:** the safe, isolated, testable floor — RLS tenancy + event spine + gateway + RTL shell + CI isolation gate + staging. **What not to touch:** any feature module. **How to know it's complete:** the seven §6 acceptance criteria pass in CI + staging. **How to avoid endless cleanup:** treat those criteria as the *entire* definition — when green, STOP and move to BP3. No extra refactors, no "nice-to-haves."

---

## 9. Build Pack 1 — Product Spine *(realized as BP3+BP5+BP6+BP8+BP10)*

**Exact product spine:** onboarding→blueprint (BP8) · capture (BP5) · system of record (BP6) · Leak Board (BP8) · dashboard+weekly report (BP10), all on the BP3 data model.
**First customer-facing flow:** sign up → onboarding → blueprint → install tracked link + snippet → leads/conversations/payments captured → Leak Board shows the #1 leak with money impact → weekly report.
**First internal/admin flow:** owner dashboard (4 cards) + weekly diagnosis.
**First AI-assisted moment:** the generated blueprint + the Leak Card.
**First value proof:** biggest leak's money impact (→ Revenue Recovered once recovery actions exist).
**Deliberately excluded:** WhatsApp API, payment webhooks, agents, co-pilot sends, benchmarks, billing.
**Acceptance:** a real course-seller completes the flow and sees a credible, money-quantified leak from observed data.
**Demo script:** "Sign up → answer 10 questions → here's your Arabic revenue journey → install this link + snippet → [drive a few clicks/visits] → open fnnlr: *your biggest leak this week is slow WhatsApp replies costing ~14,000 EGP; fastest fix: …* → here's your weekly diagnosis." **Not a toy — small but real.**

---

## 10. Data & Migration Task Plan

**Migration order & buckets:**
1. **Before Product Spine (BP0/BP3):** Workspace, Business, Membership, User, Event, AuditEvent, Journey, Offer, Page, PageEvent, ScriptPack, FollowupSequence, PaymentFlow, Lead, Conversation, Message, PaymentState, LeakFinding, AIOutput.
2. **During Product Spine:** indexes, soft-delete columns, payment state history.
3. **Before AI memory (BP9):** vector tables (per-tenant namespace), account-memory, ConsentRecord.
4. **Before value tracking (BP14):** value/attribution projections, aggregation tables.
5. **Before Data Vault (BP15):** audit retention, delete-propagation hooks.
6. **Can wait:** Automation, Integration, AgencyAccount, ClientWorkspace, ApiKey, Webhook, BenchmarkProjection, enterprise entities.

Every table: `ws_id` + RLS + isolation test; audit fields (`created_at`, `updated_at`, `deleted_at`); soft-delete for user-facing, hard-delete on Vault request; rollback via down migrations; seed = demo workspace.

---

## 11. API & Service Task Plan *(key endpoints)*

| Build Pack | Endpoint/Service | Purpose | Request | Response | Perms | Tenant rule | Errors | Tests |
|---|---|---|---|---|---|---|---|---|
| 0 | `auth.*` | login/invite | creds | session | public/owner | sets ws context | invalid creds | authz |
| 0 | EventService.emit | spine | {type,payload} | ok | internal | ws_id required | — | ingest |
| 3 | repo methods | typed CRUD | ws-scoped | entities | role | ws param + RLS | not-found | isolation |
| 5 | `GET /r/:code` | tracked redirect | code | 302→WA | public | resolves ws | bad code | redirect/dedup |
| 5 | `POST /api/track` | page events | event | ok | public+sig | ws via code | invalid | ingest |
| 6 | RecordService | lead/stage | ws-scoped | lead | seller+ | ws+RLS | invalid stage | transitions |
| 6 | PaymentService | state transition | {lead,state} | state | seller+ | ws+RLS | invalid transition | state machine |
| 7 | AIOrchestration.run | run Brain | {brain,input} | output | internal | ws context | LLM error→fallback | contract+eval |
| 8 | LeakService.diagnose | leaks | journey | findings | owner | ws+RLS | no data | fixture eval |
| 15 | VaultService.export/delete | trust | ws | file/ok | owner | ws+RLS | — | completeness |

**Never in the API layer:** business logic in handlers · DB bypassing repos · untyped payloads · tenant-unaware calls · inline prompts · long work in request path.

---

## 12. Frontend & UX Task Plan *(screens)*

| BP | Screen | User | Purpose | Data | API | AI surface | States | Acceptance |
|---|---|---|---|---|---|---|---|---|
| 0 | App shell + stub dashboard | all | RTL foundation | — | — | — | loading/empty | renders RTL mobile |
| 8 | Onboarding | owner | inputs→blueprint | — | journey | generation | per-step states | blueprint <20 min |
| 8 | Leak Board + #1 Card | owner | the wedge | findings | leaks | Leak Brain | empty(no data yet)/loaded | real leak w/ money |
| 10 | Dashboard (4 cards) | owner | daily pulse | leak/lead/value | multiple | leak summary | empty/loaded | exactly 4 cards |
| 6 | Pipeline (kanban) | seller | system of record | leads | record | recommended-reply slot | empty/optimistic | stage moves |
| 6 | Lead entity page | seller/owner | context | lead+conv+pay | record | AI summary | loading/error | shows thread+payment |
| 6 | Payment track | owner | payment states | PaymentState | payments | — | stuck-glow | transitions + proof |
| 5 | Link/snippet install | owner | instrument | — | capture | — | copy/success | events register |
| 15 | Vault | owner | trust | memory+audit | vault | shows knowledge | export/delete states | export+delete work |
| 10 | Weekly report | owner | recurring value | report | value | narrative | empty/loaded | top-3 + recovered |

UX rules: RTL-native, mobile-first, one primary action/screen, the #1 Leak Card is the hero, AI Command Bar present from BP8.

---

## 13. AI Task Plan

**First AI roles (advisory, safe — no autonomy):** Offer, Page, Script, Followup, PaymentFlow, **Leak**, CopyScore (BP8), all via the BP7 orchestration. **No autonomous actions until BP12 (approval/guardrails) ships.**

| BP | AI behavior | Input | Output | Reads | Writes | Allowed | Blocked | Approval | UI | Eval |
|---|---|---|---|---|---|---|---|---|---|---|
| 8 | Offer Brain | onboarding | offer | onboarding | Offer, AIOutput | generate | send/act | — | onboarding | offer→conversion fixture |
| 8 | Page Brain | offer+market | page+copy | offer | Page | generate | publish-live | publish | onboarding | scroll/CTA outcomes |
| 8 | Script Brain | offer+dialect | scripts | offer | ScriptPack | generate | send | send | blueprint | reply→outcome |
| 8 | Followup Brain | stage+timing | cadence | leads | FollowupSequence | draft | auto-send | send | blueprint | reply rate |
| 8 | PaymentFlow Brain | method+market | flow | journey | PaymentFlow | generate | charge | — | blueprint | completion |
| 8 | Leak Brain | journey events | findings | events(tool) | LeakFinding | diagnose | act | — | Leak Board | **fixture→ranking (observed-data proof)** |
| 8 | CopyScore Brain | Arabic copy | score+fix | copy | AIOutput | score | publish | — | copy editor | score↔conversion |

Guardrails: outputs validated (Zod); no Brain may *send* or *act* in Stage 1; all logged with prompt version + cost; low confidence → flag. Memory (BP9) and autonomy (BP12) are explicitly later.

---

## 14. Trust, Security & Tenant Isolation Task Plan

| BP | Risk addressed | Approach | Files `[proposed]` | Acceptance | Tests |
|---|---|---|---|---|---|
| 0 | cross-tenant leak | RLS default-deny + tenant middleware | `packages/db/rls`, `modules/auth` | B can't read A | isolation (blocking) |
| 4 | privilege escalation | RBAC + permission checks | `modules/auth` | roles enforced | permission matrix |
| 0/15 | unaccountable access | AuditEvent | `modules/vault` | access logged | audit |
| 15 | data ownership | export/delete + propagation | `modules/vault` | verified delete | completeness |
| 15 | unwanted training | consent default-off | `modules/vault` | no aggregate w/o consent | consent |
| 9 | memory leak | per-tenant vector namespace | `modules/ai-memory` | no cross-tenant retrieval | retrieval isolation |
| 18 | credential theft | encrypted per-tenant creds | `modules/integrations` | creds encrypted | security |
| 0 | log leakage | no PII/secret logging | `packages/*` | clean logs | log hygiene |

**Must never happen:** a tenant-unaware query path · cross-tenant AI context/retrieval · raw PII in logs · unsigned webhooks accepted · un-audited admin access · public cross-tenant training · an AI send before the approval layer.

---

## 15. Analytics & Value Tracking Task Plan

| BP | Event/Metric | Trigger | Payload | Scope | Calculation | UI | Acceptance | Misleading risk |
|---|---|---|---|---|---|---|---|---|
| 5 | `lead.captured` | redirect hit | {lead,source,ts} | ws | count | dashboard | fires on click | bot clicks (filter) |
| 5 | `page.event` | snippet | {type,ts,visitor} | ws | funnel | leak board | scroll/price/cta register | — |
| 6 | `payment.state_changed` | transition | {lead,state} | ws | funnel | payment track | logs each | — |
| 8 | `leak.detected` | diagnosis | {finding,impact} | ws | ranked | leak card | real leak w/ money | over-stated impact (conservative est.) |
| 14 | **Recovered value** | `payment.recovered` after action | {amount} | ws | action-attributed sum | Revenue Recovered | only counts action-preceded | attribution overclaim (label direct/assisted) |
| 14 | Assisted value | captured-otherwise-lost | {lead} | ws | count×est | dashboard | shown w/ caveat | est. value rough |

**No fake ROI:** conservative, event-based, labeled direct vs assisted; benchmarks read an anonymized projection only.

---

## 16. QA & Testing Plan Per Build Pack

- **BP0 gate (minimum):** isolation test green · RLS active · CI blocks on failure · staging smoke.
- **Product Spine gate (BP3–8,10):** state-machine tests · capture dedup · Leak-Brain fixture eval · per-table isolation · onboarding e2e.
- **Before any AI action (pre-BP12):** approval-required enforced · guardrail blocks forbidden actions · no Brain can send.
- **Before real customer data:** export/delete verified · audit logging · credential encryption (if integrations) · PII log hygiene.
- **Before monetization (BP19):** billing/metering tests · gate enforcement · honest-attribution checks.

Per-pack: required automated + manual + regression + isolation + permission (+ AI eval / integration / migration / FE-state / failure-mode where relevant).

---

## 17. Release & Rollback Plan

- **Branching:** trunk-based + short-lived PR branches; CI isolation gate required to merge. **Feature flags** for every user-facing pack. **Environments:** dev/staging/prod, isolated data. **Migrations:** expand→contract (never break running tenants). **Preview deploys** per PR. **Release checklist:** migration safe · isolation green · flags set · rollback ready · monitoring on. **Rollback checklist:** revert deploy · migration down (or forward-fix) · disable flag. **After release:** error tracking, AI cost watch, data-integrity checks. **Disable AI safely:** flag per Brain → fallback to manual. **Disable integrations safely:** flag per adapter → queue/hold.

**Early-pack visibility:** BP0/2/3/4/7/15 = internal-only. BP5/6/8/10 = test accounts → flagged production. BP16 = flagged demo → production. BP18/19 = flagged, staged rollout.

---

## 18. Implementation Order

1. **Inspect:** the five strategy docs (no code to read).
2. **Stabilize/establish:** stack + RLS tenancy + event spine (BP0).
3. **Organize:** the module/folder structure (BP0/BP2).
4. **First migration:** Workspace/Business/Membership/User/Event/AuditEvent (BP0), then Stage-1 entities (BP3).
5. **First service:** EventService + TenancyService (BP0), then CaptureService (BP5).
6. **First API route:** `GET /r/:code` tracked redirect (BP5).
7. **First screen:** onboarding→blueprint (BP8) (after the RTL shell in BP0).
8. **First AI behavior:** generation Brains, then the Leak Brain (BP8).
9. **First trust feature:** tenant isolation + audit (BP0/BP4), then export/delete (BP15).
10. **First event tracked:** `lead.captured` (BP5).
11. **First test:** the cross-tenant isolation test (BP0).
12. **First demo flow:** the Product Spine demo (§9).
13. **First to monetize later:** the Growth tier (BP19, Stage 3).
14. **First to delay:** WhatsApp API + payment webhooks (BP18).
15. **First to avoid completely:** autonomous AI sends before BP12.

**Build Pack order:** **BP0 → BP2 → BP3 → BP4 → BP7 → BP5 → BP6 → BP8 → BP16 → BP10 → BP15 → BP14 → BP11 → BP9 → BP12 → BP13 → BP18 → BP17 → BP19 → BP20(ongoing).**

---

## 19. Build Pack Execution Prompts *(copy-paste ready)*

### ▶ Prompt to Execute Build Pack 0 — **NOTE: BP0 IS ALREADY BUILT**

BP0 (the architecture safety layer) is **done and tested** — as **database-per-tenant**, not shared-DB+RLS. Do **not** rebuild it. The prompt below is a **verify-and-onboard** prompt: confirm the foundation passes, then move to the next unbuilt pack.

```
You are onboarding to the fnnlr codebase. BUILD PACK 0 (Architecture Safety Layer) is ALREADY BUILT and TESTED. Do NOT rebuild it.

WHAT EXISTS (verify, don't recreate):
1. Database-per-tenant isolation: a control-plane DB (tenant registry + routing + anonymized benchmark aggregates) and one physical PostgreSQL database per individual seller and per agency. Connection router: packages/db/src/router.ts. Provisioning/delete: modules/provisioning/src/provision.ts.
2. Per-tenant schema (leads, conversations [top-level], payments, events spine, automations…): packages/db/tenant/migrations/0001, 0002.
3. A full automation engine (durable, idempotent, WhatsApp-economics-aware, approval gates): modules/automation/src/*. RunStore + ActionPorts wired to the tenant DB. Scheduler: modules/automation/src/scheduler.ts. WhatsApp sender: modules/channels/src/whatsapp.ts. HTTP API: apps/api/src/server.ts. Visual builder: apps/automation-builder/index.html.

TASKS (verification only):
- Run `npm install && npm test` — confirm the suite is green (live-DB tests skip without Postgres; that's expected).
- Run `npx tsc --noEmit` — confirm a clean typecheck.
- Read HANDOFF_FOR_CODEX.md — it lists exactly what remains, in priority order.

THEN STOP. Report: tests green? typecheck clean? Confirm you understand the tenancy model is database-per-tenant (NO ws_id column inside a tenant DB — reach tenant data only via withTenant(tenantId)).

DO NOT: rebuild tenancy, add a ws_id column, switch to shared-DB+RLS, or rewrite the automation engine. The next real work is the "Still to build" list in HANDOFF_FOR_CODEX.md (auth/session→tenant, BSP creds + lead.phone, inbound WhatsApp webhook, capture module), each as its own focused pack.
```

### ▶ Prompt to Execute Build Pack 1 (= Core Data Model, BP3 — first pack after BP0)

```
You are implementing BUILD PACK 3 — Core Data Model & Migrations — for fnnlr, and NOTHING else. Build Pack 0 is complete (tenancy + RLS + event spine + gateway exist).

SCOPE (build ONLY this):
1. Create Stage-1 entities with ws_id + RLS + indexes + soft-delete (deleted_at):
   Journey, Offer, Page, PageEvent, ScriptPack, FollowupSequence, PaymentFlow,
   Lead, Conversation, Message, PaymentState, LeakFinding, AIOutput.
2. CRITICAL: Conversation is a TOP-LEVEL object with a NULLABLE lead_id (a thread can exist before identification). Do NOT make Conversation a child of Lead.
3. Indexes: Event(ws_id,type,ts), Lead(ws_id,stage), Conversation(ws_id,first_reply_latency), PaymentState(ws_id,state), PageEvent(ws_id,page_id,type,ts).
4. Typed repo methods per module; every method takes a tenant context; RLS backstops.
5. Up AND down migrations.

OUT OF SCOPE: Task, Objection, ApprovalRequest, vector/AI-memory tables, billing entities, any service logic, any UI, any AI behavior, any capture/ingest.

ACCEPTANCE CRITERIA:
- All listed entities exist, ws-scoped, with RLS; isolation test passes for EVERY new table.
- Conversation exists and can be created with lead_id = null.
- Migrations apply and roll back cleanly.

TESTS REQUIRED: per-table isolation (blocking), migration up/down, relationship integrity.

SAFETY RULES: every table ws_id + RLS; no table without an isolation test; soft-delete for user-facing entities.

DO NOT DRIFT: data model + migrations + tests only. No services, no UI, no AI. Report the schema and how isolation is proven per table.
```

### ▶ Prompt to Execute Build Pack 2 (= Domain Structure & Service Boundaries — can run alongside/after BP3 setup)

```
You are implementing BUILD PACK 2 — Domain Structure & Service Boundaries — for fnnlr, and NOTHING else. Build Pack 0 is complete.

SCOPE (build ONLY this):
1. Scaffold domain modules under modules/: tenancy, auth, journey, capture, record, payments, leaks, ai, ai-memory, approvals, vault, value, integrations, notify, billing, admin. Each exposes: index.ts (public API), service.ts, repo.ts, events.ts, types.ts, tests/.
2. Implement the typed event bus in packages/events: a strongly-typed event registry + emit/subscribe, backed by the BP0 Event table, fanning out to in-process consumers and enqueuing async work via BullMQ.
3. Enforce boundary rules in lint/config: modules communicate ONLY via index.ts public APIs and events — never by importing another module's repo/tables. No prompts outside packages/prompts. No DB access outside a module's repo.ts.

OUT OF SCOPE: any domain logic inside the modules (just scaffolds + interfaces), any UI, any AI behavior, any migration beyond what BP0/BP3 created.

ACCEPTANCE CRITERIA:
- All modules scaffolded with the standard file set.
- The typed event bus emits and consumes a sample event end-to-end via the Event table.
- A lint rule fails the build if one module imports another module's repo/internal files.

TESTS REQUIRED: event bus emit/consume; a boundary-violation lint test (a deliberate cross-module import must fail CI).

SAFETY RULES: preserve tenant context across event handlers (ws_id in every event payload; RLS in workers).

DO NOT DRIFT: structure + event bus + boundary enforcement only. No features. Report the module map and how boundary rules are enforced.
```

---

## 20. Final Implementation Memo

**The first Build Pack to execute is BP0 — Architecture Safety Layer.** Nothing else can be built safely or verifiably until the floor exists.

**Why it's the right first move:** greenfield's one luxury is setting tenancy and the event spine correctly *once*. Both are impossible to retrofit without a rewrite, and the CI isolation gate you install in BP0 is the mechanism that prevents every later pack from quietly skipping isolation. BP0 is also tightly bounded — seven acceptance criteria — so it won't sprawl into endless cleanup if you hold the line.

**What must be protected:** tenant isolation (RLS from commit one), the event spine as the single source of truth, `Conversation` as a top-level object, Brains-behind-the-gateway, prompts-in-one-package, and the **instrument-before-advise** sequencing (BP5 capture before BP8 advice).

**What must not distract us:** WhatsApp API, payment gateway processing, autonomous agents, the agency console, integrations, billing — all real, all later. Naming them "not now" out loud protects the team's focus.

**What must be delayed:** BP18 (integrations), BP19 (billing), BP12 autonomy until the approval layer, BP9 memory until isolation is battle-tested.

**Where implementation can go wrong:** the classic failure is "demo-driven development" — building BP8's beautiful blueprint generator and skipping BP5's capture and BP0's isolation because they don't demo. The execution-prompt discipline (`DO NOT DRIFT`, explicit out-of-scope, blocking isolation test) is engineered to prevent exactly that.

**How to keep the build aligned with the Product Bible:** every pack ties to a pillar; if a proposed task doesn't serve the revenue-journey thesis (it recovers revenue, saves time, increases trust, improves memory, or reduces risk), cut it. **How to keep the architecture clean:** modules talk via interfaces + events only; no cross-module table access; one prompts package. **How to keep AI safe:** no Brain sends or acts before BP12; everything logged + evaluated; guardrails between agent and action. **How to keep trust strong:** RLS + the Vault as real screens; isolation tests block deploys.

**How to know you're ready to move from BP0 to BP1/BP3:** all seven BP0 acceptance criteria pass in CI and on staging — provable cross-tenant isolation, a working event spine, a Brain through the gateway, an RTL shell, a blocking isolation gate, and a staging deploy. When that's green, start BP3.

Execute BP0 using the copy-paste prompt in §19. When it's done, send me the result and I'll help you run BP3 and BP2 — and from there the critical path (BP5 → BP6 → BP8 → BP16) gives you a demoable proof of the category.

That's the whole series turned into a build machine. The planning is done; the next message can be code.

---

*Grounded in: the seven fnnlr vision documents and the prior Expert Review, Company Vision (Pre-Code), Product Bible, Execution Blueprint, and Technical Architecture Plan. All file paths are proposed (greenfield); no code was inspected because none exists. Run these packs to start the repo, beginning with BP0.*
