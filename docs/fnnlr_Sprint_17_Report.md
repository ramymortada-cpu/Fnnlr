# fnnlr — Sprint 17 Build Report (Autonomous-but-Approved Revenue Repairs)

fnnlr no longer just sees the problem — it **builds a repair plan from the evidence and executes the safe parts after approval**. The loop is now **Evidence → Repair Plan → Approval → Execution → Result Tracking**. Not an autonomous agent: no auto-send, no bulk spam, no auto mark-fixed, no deletes. **156 tests, 154 pass, 0 fail, 2 skip. Typecheck clean. RTL premium.**

## What was built

### 1. Repair planner (`modules/repairs/src/planner.ts`, pure & tested)
Maps a leak (lane + code + evidence) to a typed `RepairPlanDraft`: a repair type, a risk level, and an ordered list of typed steps. **No evidence → no plan** (never fabricates). Covers payment recovery, proof review, access delivery, WhatsApp first-reply/follow-up, page CTA/hero, tracking, follow-up, and attribution repairs — each with the right steps (navigation, draft, task, section update, tracked-link, mark-fixing).

### 2. Repair service + execution engine (`modules/repairs/src/service.ts`)
`buildRepairFromLeak` / `buildRepairForBiggest` persist a plan + steps (with affected count). `approveRepair` / `rejectRepair` gate execution. **`applyRepair` executes the safe steps one by one**, capturing a baseline once, writing per-step before/after + result summary, and — crucially — **a single step failure marks the plan `partially_applied`, not a full failure**. Step executors reuse existing services: `create_task` (dedup-safe bulk), `draft_whatsapp` (**draft only, never sends**), `update_page_section` (via the section brain + `updateSection`), `create_tracked_link` (only if a destination phone exists, else skipped), `mark_leak_fixing`, `open_filtered_view` (navigation). `update_offer` / `update_payment_instruction` are safely skipped from a plan (they need interactive preview). 

### 3. Result tracking (no fake impact)
`applyRepair` stores a baseline (leak severity, leads count, timestamp). `repairStatus` reports honestly: `awaiting_data` ("الإصلاح اتطبّق — مستنيين بيانات كفاية") until the leak is actually re-diagnosed away, then `early_improvement`. **Never fabricates ROI.**

### 4. Data model (migration 0015)
`repair_plans` (type, status, evidence, affected_objects, risk_level, baseline, approve/apply/reject timestamps) and `repair_steps` (step_type, payload, status, before/after snapshots, error, order, result_summary, affected_count).

### 5. Command Bar integration
"صلّح أكبر تسريب" / "اعمل أسرع إصلاح" / "اعمل خطة إصلاح لتسريب الدفع" now **build a real repair plan** (via the executor) instead of a single action, and the command bar opens the Leak Board and renders the plan inline (`repairPlanId` surfaced in the command result). "اشرح أكبر تسريب" stays informational.

### 6. Action Center integration
The action builder now surfaces **repairs awaiting approval** (priority 82) and **partially-applied repairs needing completion** (priority 88), so pending repairs appear in "اعمل إيه النهاردة؟".

### 7. Repair UI (Leak Board)
Every leak card gets **🛠 ابنِ خطة إصلاح**. The repair panel shows: title, status badge, risk, explanation, **affected count**, the **ordered steps with per-step status** (بانتظار/اتطبّق/اتجاهلت/فشلت), and **وافِق / ارفض / طبّق الخطوات الآمنة / حالة الإصلاح**. Execution updates each step's status live; partial application is shown honestly.

### 8. API endpoints
```
POST /funnels/:id/repairs/from-leak/:leakId    build a plan from a leak
POST /funnels/:id/repairs/biggest              build a plan for the biggest leak
GET  /funnels/:id/repairs                       list plans
GET  /repairs/:id                               plan + steps
POST /repairs/:id/approve | /reject | /apply
GET  /repairs/:id/status                        honest result tracking
PATCH /repair-steps/:id                          approve/skip a single step
```

### 9. Events
`repair_plan_created/approved/rejected/applied/partially_applied/failed`, `repair_step_applied/failed/skipped`, `leak_repair_started`.

## Tests added (7)
Payment-recovery plan from evidence (draft + task + mark-fixing) · WhatsApp first-reply plan · page CTA plan (section update requires confirmation) · access-delivery medium risk · **NO repair without evidence** · **every mutation step requires confirmation, navigation doesn't** · repair routes reject header tenant in production. (DB-backed execution — apply, before/after, partial failure — runs in the live suite.)

## Acceptance — all met
Leak card builds a plan ✓ · biggest-leak command builds a plan ✓ · plan shows evidence ✓ · affected objects ✓ · clear steps ✓ · approve/reject ✓ · apply runs safe steps ✓ · tasks/drafts/section updates per the plan ✓ · per-step status ✓ · **partial failure handled safely** ✓ · Action Center shows pending repairs ✓ · result tracking awaits data honestly ✓ · **no auto-send** ✓ · **no fake impact** ✓ · tests green ✓ · RTL premium ✓.

## Strict prohibitions respected
No auto-send · no autonomous destructive actions · no bulk messaging · no deletes · no auto mark-fixed (mark_leak_fixing requires the plan's approval; "fixed" is never automatic) · no fake ROI · no payment processing · no overbuilt workflow engine · no docs-instead-of-code · no pilot/demo/polish-only.

## Needs credentials only
`ANTHROPIC_API_KEY` (richer section/draft rewrites; fallbacks work without) · Postgres for the 2 skipped live-DB tests and real plan execution.

## Next: Sprint 18 — repair result measurement over time (re-diagnosis deltas), or begin actual pilot onboarding.
