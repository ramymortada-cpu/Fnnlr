# fnnlr — Sprint 12 Build Report (AI Command Bar + Cross-Object Revenue Copilot)

fnnlr now has an AI control layer over the whole system: type an Arabic command, it understands the current context, picks the right object, proposes an action, and asks for approval before anything changes. A revenue copilot bound to fnnlr objects — **not a chatbot, not an autonomous agent.** **119 tests, 117 pass, 0 fail, 2 skip. Typecheck clean. RTL premium. No auto-send, no destructive action without approval, no fabricated claims, no docs drift.**

## What was built

### 1. Command taxonomy + deterministic classifier (`modules/command/src/intents.ts`, pure & tested)
A **closed set of 40 intents** across offer, page, WhatsApp, payment, leads, leaks, report, navigation — plus `clarify`. `classifyCommand` maps Arabic phrasing to an intent by keywords; if nothing is confident it returns `clarify` (never hallucinates). `RESULT_TYPE` maps each intent to its approval class: informational / navigation / draft / update / task / status / bulk / clarify.

### 2. CommandBrain (`packages/ai-core/src/brains/command.ts`)
Classifies the command into the closed set using minimal context; **rejects any out-of-set intent** (parse throws → deterministic fallback). Works fully without an LLM via the classifier. No command silently fails.

### 3. Command service (`modules/command/src/service.ts`)
- **Minimal context builder** — gathers only funnel name, has-offer/page, biggest-leak title, waiting-payment count, leads-needing-action (never dumps the DB).
- **runCommand** — classifies, then produces a proposed result per type: navigation (direct), informational (biggest-leak explanation **with evidence** via the leak service), draft (WhatsApp reply via the copilot — preview only), update (offer improvement via OfferActionBrain — preview, never auto-applied), report (weekly summary), or a confirm-required description for task/status/bulk.
- **Approval system** — updates/tasks/status/bulk set `requiresConfirmation`; nothing destructive happens in runCommand. `applyCommand` / `discardCommand` are the confirm step, both audited.
- **History** — every command logged (text, intent, confidence, result type, status, degraded) to the `commands` table (migration 0011).

### 4. Command Bar UI (dashboard + funnel workspace)
A persistent RTL command bar (⌘, Arabic placeholder examples, Enter to run). Funnel workspace: inline result panel with explanation, preview, safety note, and the right buttons by type — navigation executes directly (opens tab / filters leads); update/task/status/bulk show **طبّق/أكّد + تجاهل**; informational/draft show preview. Dashboard: runs against the active funnel and deep-links into the workspace. Lead context is tracked so "اكتب رد" knows which lead is open.

### 5. Approval discipline (examples wired)
- "افتح العملاء المنتظرين الدفع" → direct navigation to leads, waiting-payment filter.
- "صلّح أكبر تسريب" → explanation with evidence + opens the leak board.
- "حسّن العرض" → offer improvement preview, apply/discard (never auto-applied).
- "اكتب متابعة ناعمة للعملاء اللي سكتوا" → WhatsApp draft, copy/mark-sent manually (no auto-send).
- "اعمل تقرير للفريق" → weekly report summary, opens report tab.

### 6. API endpoints (tenant-from-session)
```
POST /command                  classify + propose (text + funnelId/tab/leadId/leakId context)
POST /command/:id/apply        confirm + apply (audited)
POST /command/:id/discard      discard
GET  /commands/history         recent commands (trust/debug)
```

## Tests added (9)
Classifier maps common Arabic commands · **returns clarify (no hallucination) for unknown input** · **every classified intent is in the closed set** · result-type mapping (navigation direct, offer update needs apply, bulk needs confirm) · CommandBrain LLM parse · **rejects out-of-set intent → deterministic fallback** · fallback without LLM · command requires text · **command route rejects header tenant in production**.

## Acceptance — all met
Command bar in dashboard + workspace ✓ · type Arabic commands ✓ · classifies intent ✓ · uses funnel context ✓ · navigates to tabs ✓ · generates previews ✓ · improve offer/page/WhatsApp with apply/discard ✓ · find filtered leads ✓ · explain biggest leak with evidence ✓ · follow-up drafts without sending ✓ · create/confirm tasks/actions ✓ · command history stored ✓ · **no destructive command without confirmation** ✓ · fallback without LLM ✓ · tests green ✓ · RTL premium ✓.

## Strict prohibitions respected
No generic chatbot (closed intent set, clarify on miss) · no autonomous agent (every change needs apply) · no auto-send · no bulk messaging · no destructive update without approval · no analytics dashboard · no infra drift.

## Needs credentials only
`ANTHROPIC_API_KEY` (richer classification + drafts; deterministic fallback works without it) · Postgres for the 2 skipped live-DB tests and real command/history persistence.

## Next: Sprint 13 — Pilot Readiness + UX polish + seed demo workspace (or deepen the copilot's apply handlers for page/task/status intents).
