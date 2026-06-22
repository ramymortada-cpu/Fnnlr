# fnnlr Automation Engine

A durable, event-sourced automation engine built **inside** the database-per-tenant
foundation. Each tenant's automations run on that tenant's own isolated database.

## Why it's stronger than HighLevel / ManyChat / Zapier

| Capability | Typical engines | fnnlr engine |
|---|---|---|
| Triggers | generic "if this then that" | **event-sourced** on real observed behavior (the fnnlr event spine) |
| WhatsApp cost | blast paid templates blindly | **window-aware**: sends free inside 24h/72h windows, *waits* or *skips* instead of paying, or requires approval for paid sends |
| Trust safety | unlimited blasts | **anti-spam**: max-runs-per-entity, cooldowns, no-zann limits |
| Human control | optional | **approval gates** built in; paid sends auto-require approval |
| Durability | best-effort | **durable runs**: waits survive restarts, scheduler resumes due steps |
| Idempotency | weak | same trigger never starts duplicate runs; same step never sends twice |
| Isolation | shared DB | runs inside the **tenant's own database** |
| Conditions | varies | **safe declarative rule tree** (no arbitrary code execution) |

## Model

```
WHEN <trigger_event>          ← an event on the tenant's spine
IF   <conditions>             ← safe JSON rule tree (all/any/not/leaf)
THEN <actions>                ← ordered steps: send_whatsapp, wait, create_task,
                                update_lead, notify_owner, request_approval, ...
WITH <guards>                 ← window-aware sends + anti-spam + approval
```

## Files

| Path | Purpose |
|---|---|
| `types.ts` | triggers, conditions, actions, run context |
| `conditions.ts` | safe rule-tree evaluator (no eval) |
| `guards/whatsapp.ts` | the window-aware send decision (free/paid/wait/skip) |
| `guards/safety.ts` | anti-spam, cooldown, approval rules |
| `dispatcher.ts` | executes one action, idempotent, via injected ports |
| `engine.ts` | event handling + durable run lifecycle |
| `recipes.ts` | ready-made fnnlr-native plays |
| `../../packages/db/tenant/migrations/0002_automation_engine.sql` | tenant schema |

## Built-in recipes
- **price_no_reply_nudge** — price sent, no reply in 1h → gentle nudge in a free window.
- **payment_recovery** — transfer requested, no proof in 2h → reminder + human task.
- **high_value_stall_escalate** — high-value lead goes quiet → notify owner (no auto-message).
- **abandoned_thread_recovery** — abandoned thread → paid recovery send, approval required.

## Tested (in-memory, no DB needed)
`tests/automation.test.ts` proves: event→run, condition gating, durable waits,
idempotency, WhatsApp free/paid/wait decisions, paid-send approval, anti-spam,
cooldown math, and the approval-resume flow. **11/11 pass.**

## Production wiring (now included)

The engine is now wired to the database and runnable end-to-end:

| Piece | File | What it does |
|---|---|---|
| **RunStore (DB-backed)** | `src/store.ts` | `makeTenantRunStore(tenantId)` — runs/steps/approvals persisted inside the tenant's OWN isolated database; idempotency + dedupe enforced by unique DB indexes |
| **ActionPorts (DB-backed)** | `src/ports.ts` | `makeTenantActionPorts(tenantId, senders)` — tasks/lead-updates/owner-notifications write to the tenant DB; sends go through injected WhatsApp/email senders |
| **Scheduler** | `src/scheduler.ts` | `AutomationScheduler` — every tick, pulls active tenants from the control-plane and advances each tenant's due `wait` runs (`next_run_at <= now`) inside that tenant's DB |
| **Synthetic triggers** | `src/synthetic.ts` | detects absence-of-activity events (`payment.stalled`, `conversation.stalled`, `message.no_reply`) by scanning the tenant DB |
| **Runnable scheduler** | `../../scripts/run-scheduler.ts` | `npm run scheduler` — loops with no-op senders (swap for real BSP/email in prod) |
| **Visual builder UI** | `../../apps/automation-builder/index.html` | RTL Arabic canvas (WHEN → IF → THEN + safety) that emits the exact `AutomationDef` JSON the engine consumes; includes the 4 built-in recipes and a live, syntax-highlighted JSON output |

### Run it
```
npm run scheduler            # start the durable wait/loop scheduler
open apps/automation-builder/index.html   # design automations visually
```

### End-to-end flow
1. An event hits the tenant's spine → `engine.onEvent(ctx)` (store = `makeTenantRunStore`).
2. A matching automation starts a run; `wait` steps set `next_run_at` and park.
3. The **scheduler** ticks, finds due runs per tenant, calls `engine.advanceRun()`.
4. Sends pass the WhatsApp economics guard; paid sends park for approval.
5. A human approves → `engine.onApproved(runId)` resumes the run.

Everything runs **inside each tenant's isolated database** — one tenant's automations can never touch another's.

## Tested (in-memory, no DB needed)
- `tests/automation.test.ts` — 11 engine behaviors.
- `tests/scheduler.test.ts` — durable wait → resume → complete.
**18 tests total across the project; 16 pass, 2 (live-DB) skip without Postgres.**
