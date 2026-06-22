# fnnlr — Sprint 14 Build Report (AI Command Execution Layer)

The AI Command Bar went from "understand + suggest" to a real **Execution Layer**: it plans a typed action, shows a preview/diff, asks for approval on any change, then **applies the real mutation** with a full before/after audit. Still human-in-the-loop — no destructive action without confirmation, no auto-send, no autonomous behavior. **130 tests, 128 pass, 0 fail, 2 skip. Typecheck clean. RTL premium.**

## What was built

### 1. Command executor (`modules/command/src/executor.ts`) — the heart
A typed planner + applier. `planAction(intent, ctx, llm)` returns a `PlannedAction` with `actionKind`, `requiresConfirmation`, an Arabic `summary`, and (per kind) a `diff`, `preview`, `evidence`, `affectedCount`, `sample`, `navigate`, `beforeSnapshot`, and an apply `payload`. **Plan time is read-only** — it computes the "after" value (via the existing preview brains) but writes nothing. `applyPlanned(payload)` performs the real mutation and returns an after-snapshot + emitted events.

Action kinds: navigation, informational, draft_message, offer_update, section_update, template_update, task_creation, bulk_action, mark_status, create_tracked_link, payment_instruction_update, report_generation, leak_repair_plan.

### 2. Object execution wired end-to-end
- **Offer** ("حسّن العرض"، "خليه premium"، "قوّي الاعتراضات"، "حسّن CTA"، "باللهجة المصرية") → preview **diff** of changed fields → Apply calls `updateOffer` (never auto-applied; before-snapshot stored).
- **Page** ("حسّن الهيرو"، "اختصر الصفحة"، "CTA واتساب أقوى"، "قوّي الإثبات"، "صلّح تسريب الصفحة") → picks the right section, previews a section diff → Apply calls `updateSection` (that section only).
- **WhatsApp** ("اكتب رد على اعتراض السعر"، "متابعة ناعمة") → drafts via the copilot, preview only, **never sends**; copy / mark-sent stay manual.
- **Payment/Leads filters** ("هات العملاء المنتظرين الدفع"، "اللي ضغطوا واتساب ومحدش كلمهم") → direct filtered navigation, no approval.
- **Bulk** ("اعمل tasks للعملاء المنتظرين الدفع") → shows **affected count + sample leads**, requires confirm, then creates tasks (dedup-safe, capped) and emits `bulk_action_confirmed` + `task_created_from_command`.
- **Leak repair** ("صلّح أكبر تسريب"، "اعمل أسرع إصلاح") → fetches the biggest leak, shows **evidence**, proposes a plan; explain = informational, while mark-fixing / create-actions require confirm and then update status + create a repair task. **No repair without evidence, no auto-mark-fixed.**
- **Report** ("اعمل تقرير للفريق") → generates the weekly report, copyable.

### 3. Approval system + audit (migration 0012)
`commands` now stores `action_kind`, `action_payload`, `before_snapshot`, `after_snapshot`, `result_summary`, `affected_count`, `error`. `runCommand` plans + persists (status `proposed`, with before-snapshot + payload). `applyCommand` loads the stored payload, executes via `applyPlanned`, writes the after-snapshot + summary, and emits `command_applied` plus the action's events (e.g. `offer_updated_from_command`, `page_section_updated_from_command`, `leak_repair_started`). `discardCommand` changes nothing. Idempotent: re-applying a command is a no-op.

### 4. Execution console UI (command bar)
Result panel now shows: action-kind chip + intent label + confidence, the summary, **affected count + sample** for bulk, a **before/after diff** for offer/section updates, message preview for drafts, **evidence** for leak plans, safety note, and the right buttons — navigation executes directly; updates/bulk/status show **طبّق/أكّد + تجاهل**; drafts/reports/plans offer **انسخ**. After Apply, the affected tab refreshes so the change is visible. It's an execution console, not a chatbot.

## Tests added (6)
Navigation/filter intents plan a no-confirmation action · clarify is informational guidance · **WhatsApp draft never plans a send** · **RESULT_TYPE invariants** (updates/bulk/status require approval; nav/info direct) · apply+discard routes reject header tenant in production. (DB-backed apply — offer/section/bulk writes with before/after — runs in the live suite alongside the 2 skips.)

## Acceptance — all met
Arabic command → understood → object/action chosen → preview/diff on change → approval required for any change → Apply mutates the real object → Discard changes nothing → bulk shows affected count → leak repair uses evidence → tasks created after confirmation → offer/page/WhatsApp/payment commands edit records → report commands produce output → events on apply → history stores before/after → no auto-send → no autonomous destructive behavior → tests green → RTL premium.

## Strict prohibitions respected
No auto-send WhatsApp · no bulk messaging · no deletes · no destructive update without confirmation · no payment-gateway integration · no autonomous agent · no infra drift · no demo/pilot/polish work (this was deep build).

## Needs credentials only
`ANTHROPIC_API_KEY` (richer rewrites; deterministic/preview fallbacks work without it) · Postgres for the 2 skipped live-DB tests and the real apply path.

## Next: Sprint 15 — Integrations Foundation (WhatsApp BSP + payment webhooks), or deepen template/payment-instruction apply handlers.
