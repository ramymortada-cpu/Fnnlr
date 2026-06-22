# fnnlr — Sprint 21 Build Report (Playbook Application Engine)

fnnlr no longer only uses playbooks when building a new funnel — it can take an **existing** funnel and apply what it learned, safely and with approval. The loop: read current state → compare to the recommended playbook → build a change plan → preview the diff → approve → apply the safe steps one-by-one → record the application. No auto-apply, no destructive overwrite, no fake confidence. **201 tests, 199 pass, 0 fail, 2 skip. Typecheck clean. RTL premium.**

## What was built

### 1. Application diff (`modules/playbooks/src/apply-diff.ts`, pure & tested)
`diffPlaybook` compares a funnel's **current object state** against what a playbook recommends and emits typed change steps with before/after — only where it adds value (empty diff when the funnel already matches, so a plan is created only when it's useful). Changes are **additive or reorder/copy improvements, never deletions**: add a missing guarantee/payment-plan to the offer (only if the field is empty — never overwriting user content), move the WhatsApp CTA before pricing, add proof/FAQ sections, add payment/proof-reminder WhatsApp templates, reprioritize InstaPay/wallet, add a proof-reminder funnel stage, add tracking requirements, add follow-up next-action defaults. **Low-confidence playbooks flag every step** with an honest "learning data is limited; this is a default optimization" note. `planRisk` raises medium risk for reorder/reprioritize.

### 2. Application service + executor (`modules/playbooks/src/apply-service.ts`)
`planPlaybookApplication(funnelId, scope|all)` reads the real current state (offer, page sections, WhatsApp templates, payment methods, funnel stages), builds the diff per type, and persists a plan + steps with the **worst (most conservative) confidence** across included types. `approve/reject` gate execution. `applyPlaybookApplication` applies the **approved** steps one-by-one with per-step status; **a single failure → `partially_applied`**, never a full wipe. The executor reuses existing services (`updateOffer`, `reorderSections`, `addStage`) and is strictly additive — the offer mutations re-check emptiness at apply time so a value the user added in the meantime is never overwritten. Each applied plan writes a `playbook_applications` audit row (linking to the learning loop for later attribution).

### 3. Data model (migration 0019)
`playbook_application_plans` (scope, status, confidence, learning_notes, before/after snapshots, changes, risk) and `playbook_application_steps` (object_type, change_type, before/after, status, requires_confirmation, low_confidence, order).

### 4. Command Bar
New intents — "طبّق أفضل playbook على القمع" (apply_best_playbook), "حسّن القمع بناءً على التعلم" (optimize_funnel_from_learning), and per-object "طبّق playbook الصفحة/واتساب/الدفع" — build a real application plan and open it. The result carries the plan's confidence and an honest preview ("learning data is limited" when low). "طبّق…" routing wins over "اعرض playbook" so explain vs apply never collide.

### 5. UI — Application panel
The Leaks workspace gains **⚙ اعمل Optimization Plan**. The panel shows the plan's status, confidence badge, risk, a low-confidence warning when relevant, and **each change as object-tagged before → after** with per-step status, plus **وافِق / ارفض / طبّق التغييرات الآمنة**. Applying updates step statuses live and reloads the funnel.

### 6. Action Center
Surfaces pending applications (priority 81), partially-applied applications needing completion (86), and low-confidence application plans needing review (79).

### 7. Weekly Report
Adds a playbook-applications line — how many applied, how many pending — alongside the playbook/learning/repair rollups, with the honest note that results are measured later.

### 8. API endpoints
```
POST /funnels/:id/playbook-application/:scope   build a plan (scope: all|offer|page|whatsapp|payment|followup|funnel)
GET  /funnels/:id/playbook-applications          list plans
GET  /playbook-applications/:id                   plan + steps
POST /playbook-applications/:id/approve | /reject | /apply
PATCH /playbook-application-steps/:id              skip a single step
```

## Tests added (12)
Offer additive guarantee with before/after · **no overwrite of existing content** · low-confidence flags every step honestly · page CTA-before-pricing reorder · additive proof+FAQ · WhatsApp reminder templates · payment reprioritization · funnel proof-stage · reorder raises risk · **empty diff when nothing to add** · command routes the application intents · application routes reject header tenant in production. (DB-backed apply + partial-failure run in the live suite.)

## Acceptance — all met
User can plan an application for an existing funnel ✓ · shows confidence/sample size ✓ · shows before/after ✓ · approve/reject ✓ · apply mutates real objects step-by-step ✓ · partial failure handled safely ✓ · Command Bar builds optimization plans ✓ · Action Center shows pending applications ✓ · Weekly Report mentions applications ✓ · every application audited ✓ · **no auto-apply** ✓ · **no destructive overwrite** ✓ · tests green ✓ · RTL premium ✓.

## Strict prohibitions respected
No auto-apply · no fake confidence · no destructive overwrite · no deleting content · no silent low-confidence changes (flagged + approval-gated) · no auto-send · no payment processing · no benchmark dashboard · no docs-instead-of-code · no polish-only.

## Needs credentials only
Postgres for the 2 skipped live-DB tests and real application execution · `ANTHROPIC_API_KEY` optional.

## Next: Sprint 22 — attribute measured improvements back to specific playbook applications (close the learning loop on applications), or begin actual pilot onboarding.
