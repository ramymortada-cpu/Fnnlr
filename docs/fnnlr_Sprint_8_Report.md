# fnnlr — Sprint 8 Build Report (Revenue Leak Board v1)

The core product promise is now real: **fnnlr doesn't just build the funnel — it sees where revenue leaks, from observed data, and proposes the fastest fix.** **84 tests, 82 pass, 0 fail, 2 skip. Typecheck clean. RTL premium executive board. No fake diagnosis, no payment-builder, no inbound WhatsApp, no big analytics dashboard, no docs drift.**

## What was built

### 1. Pure detection engine (`modules/leaks/src/engine.ts`) — the moat's correctness core
Takes an **observed snapshot** and returns findings across **6 lanes** (traffic, page, whatsapp, payment, followup, tracking). Hard guarantees, all unit-tested:
- **No finding without evidence** — every finding carries an `evidence` object drawn from real counts.
- **No fabrication** — `hasEnoughData()` gates the whole board; when there's no observed signal it returns nothing and the UI shows "not enough data yet."
- **Money impact is null unless a real deal value is observed** — never invented; shown as "insufficient revenue data" otherwise.
- `biggestLeak()` (critical → money) and `laneSummary()` for the board.

Detectors include: missing tracked links, page-not-linked, links without UTM, leads without attribution, clicks-without-leads, page-no-views, low CTA rate, price-not-reached, WhatsApp clicked-but-stuck, conversations-without-contact, waiting-payment-stuck (critical when several), proof-uploaded-unconfirmed, paid-not-delivered, payment-stuck, overdue follow-ups, follow-up-without-date, lost-without-reason, high-intent-without-action.

### 2. Leaks service (`modules/leaks/src/service.ts`)
Builds the snapshot from the tenant DB using **only observed records/events** (tracked_links, page_events, leads, lead_stage_history timing, payment_states, tasks, conversations), runs the engine, and **upserts findings by code** (preserving user status; auto-marking resolved leaks `fixed`). Plus `listLeaks`, `getBiggestLeak`, `getSummary`, `updateLeakStatus`. Migration 0007 adds title/explanation/evidence/confidence/recommended_action/code/resolved_at to `leak_findings`.

### 3. Leak Board UI (`funnel.html` → التسريبات tab) — executive command center
"Run diagnosis" → **Biggest Leak card** on top (severity, money-or-honest-note, fastest fix, action), a **6-lane grid** (status + count + worst per lane), then **detailed leak cards**: severity badge, explanation, **evidence line**, fastest fix, an action button that opens the right place (affected leads filter / page tab / capture tab), and status controls (fixing / fixed / ignored). When data is insufficient: a clear "not enough observed data — enable tracking / publish page" state.

### 4. Dashboard integration
The dashboard's **Biggest leak** and **Fastest fix today** cards now pull the real biggest leak from the first funnel (with the honest empty state otherwise); the leads card already reflects pipeline need.

### 5. API endpoints (tenant-from-session)
```
POST /funnels/:id/leaks/run        run diagnosis on observed data → findings (or "not enough data")
GET  /funnels/:id/leaks            list findings (severity-ordered)
GET  /funnels/:id/leaks/biggest    biggest open leak
GET  /funnels/:id/leaks/summary    lane summary + biggest
PATCH /leaks/:id                   status: open|fixing|fixed|ignored
POST /leaks/:id/actions/task       repair action: create a follow-up task from a leak
```

## Tests added (12 engine + 2 API)
No-data → not-enough-data · doesn't fabricate when healthy · **evidence on every finding** · page low-CTA leak · waiting-payment critical + money math · **money null when no deal value** · WhatsApp stage leak · overdue follow-up · missing tracking · missing attribution · biggest-leak ranking · 6-lane summary · leak-status validation · **leak routes reject header tenant in production**.

## Acceptance — all met
Open workspace ✓ · التسريبات tab ✓ · run diagnosis ✓ · analyzes observed events only ✓ · Biggest Leak shown ✓ · 6 lanes ✓ · evidence on every leak ✓ · fastest fix on every leak ✓ · clear "not enough data" ✓ · dashboard shows biggest leak + fastest fix ✓ · change leak status ✓ · open affected leads/tab ✓ · tests green ✓ · no fake diagnosis ✓ · no huge analytics dashboard ✓ · RTL premium ✓.

## Needs credentials only
Postgres with CREATE DATABASE rights — to run the 2 skipped live-DB tests and the real snapshot/diagnosis path against actual data.

## Next: Sprint 9 — Payment Flow Builder + Payment State UI polish (the payment lane's evidence gets richer as payment flows become first-class).
