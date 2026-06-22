# fnnlr — Customer Zero 72h Report (template)

Fill this in from real evidence only. Every number must come from a script
(`customer:72h-monitor`, `customer:ledger`, `customer:issues`, `customer:week1-review`)
or an admin endpoint. No estimates, no fabricated traffic/leads/revenue. Known
revenue only if `payment_states.amount` exists.

> How to populate (commands):
> ```
> npm run customer:72h-monitor -- <tenantId> <funnelId>
> npm run customer:ledger      -- <tenantId> <funnelId>
> npm run customer:issues      -- <tenantId>
> npm run customer:week1-review -- <tenantId> <funnelId>
> ```

## 1. Launch summary
- Customer: …
- Launch window (from manifest): …
- Launch status (`72h-monitor.launchStatus`): launched | blocked | unknown
- Launched at: …

## 2. Customer setup
- Workspace / business / tenant / funnel ids: …
- Offer / page / tracked link / payment method present: …

## 3. Execution lock result
- Final `execution-lock` status: READY | WARN | BLOCKED
- If WARN: the explanation + owner
- If it was ever BLOCKED: what was missing, and how it was resolved (no override)

## 4. First signal evidence
- First signal timestamp (`72h-monitor.firstSignalAt`): …
- Seen in (`first_signal.seenIn`): page_events / activation / revenue_desk / operating_room
- Marked test? (script-generated yes / real customer event no)

## 5. Activation progression
- Stage (`72h-monitor.activationStage`) + readiness score: …
- Steps still open: …

## 6. Revenue Desk observations
- Desk top item (`72h-monitor.revenueDeskTop`): …
- Activation mode vs live mode: …
- Recommendations generated (only if evidence existed): …

## 7. Incidents and blockers
- P0 / P1 / P2 / P3 counts (`72h-monitor.incidents`): …
- Open blockers (`72h-monitor.openBlockers`): …
- Issue log (`customer:issues`): id · severity · source · owner · status · next action

## 8. Customer-facing next action
- From `customer:72h-update.topActionNow`: …
- What we need from the customer: …

## 9. Product friction found
- Real friction observed during launch (operating-only notes). No new features
  were added in the live-execution sprint unless a blocker required it; list any
  that did, with the reason.

## 10. Decision
- From `72h-monitor.decision` / `week1-review.decision`:
  - [ ] CONTINUE
  - [ ] HOLD
  - [ ] ROLLBACK_OR_DISABLE
  - [ ] NEEDS_CONFIGURATION
- Rationale (tie to evidence above). Do not write CONTINUE if the decision gate
  says HOLD or ROLLBACK.
