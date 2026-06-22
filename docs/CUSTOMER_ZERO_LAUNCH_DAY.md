# fnnlr — Customer Zero Launch Day Runbook

Run the first real customer launch with no improvisation. Every step is a real
command. Nothing here uses demo data or claims readiness the checkers don't give.

The manifest is `customer-zero.execution.example.json` (copy → fill → it holds
NO secrets; keys are env-only, the owner password is passed on the CLI).

## Before launch
```
npm run deploy:check                                            # READY_FOR_CUSTOMER_ZERO | BLOCKED
npm run customer:verify          -- customer-zero.config.json   # base config validation
npm run customer:execution-verify -- customer-zero.execution.json   # manifest validation (stricter)
npm run customer:create          -- customer-zero.config.json "<ownerPassword>"   # idempotent setup
npm run customer:execution-lock  -- customer-zero.execution.json <tenantId> <funnelId>   # THE FINAL GATE
```
- Confirm the launch **owner** and **rollback owner** from the manifest.
- Confirm rollback controls are understood (see `CUSTOMER_ZERO_RUNBOOK.md`).
- Confirm the support contact (manifest `supportOwner`).
- **Do not launch unless `customer:execution-lock` is READY or WARN.** BLOCKED
  means a real gap — fix it, don't override it.

## During launch
```
# publish the page + create the tracked link + payment method (via the app UI, or
# the setup runner created shells to fill in). Then:
npm run customer:launch-check    -- <tenantId> <funnelId>       # env + customer + funnel + signals + operating room
npm run customer:first-signal    -- <tenantId> <funnelId>       # script-marked test signal (use --real for a genuine event)
npm run customer:daily-check     -- <tenantId> <funnelId>       # PASS | WARN | BLOCKED + decision
```
Watch, in order: page event → WhatsApp click → lead → Revenue Desk item →
Operating Room decision. Each is visible via `launch-check` and `daily-check`.

## If blocked (triage)
```
npm run customer:triage -- <tenantId> <funnelId> <issue> [connectionId]
```
Issue types: `activation_stuck`, `no_page_events`, `no_whatsapp_leads`,
`webhook_failure`, `payment_state_issue`, `revenue_desk_empty`,
`recommendation_missing`, `login_issue`, `jobs_failed`. Each returns concrete
checks, a probable cause, a safe next action, and whether a manual DB edit is
forbidden or emergency-only.

## After launch
```
npm run customer:status        -- <tenantId> <funnelId>        # safe customer-facing status
npm run customer:launch-summary -- customer-zero.execution.json <tenantId> <funnelId>   # send to customer (no secrets)
npm run customer:daily-check   -- <tenantId> <funnelId>        # daily, first week
npm run customer:week1-review  -- <tenantId> <funnelId>        # end of week 1 → CONTINUE | HOLD | ROLLBACK | NEEDS_CONFIGURATION
```
The execution log records each milestone (config validated, lock checked, first
signal, decision, blocker, rollback) in `audit_events`:
```
GET /admin/execution-log     (admin-only)
```

## Hard rules
- No auto-send WhatsApp. fnnlr drafts; the human sends.
- No payment processing. Payment state is manual; fnnlr records, it does not move money.
- No demo data, no fake traffic, no fake revenue.
- Never tell the customer a BLOCKED status is fine. Surface it.
- Manual DB edits are forbidden as a normal path (emergency-only, and only for
  the few cases triage marks `emergency_only`).
```
```
