# fnnlr — Support Workflow

> A repeatable support process on top of the existing audit-backed issue log
> (Sprints 41/42). Not a ticket system. Every critical issue has an owner and a
> next action, and feeds the week review. No fake readiness, no hidden blockers.

## The loop
1. **Intake** — capture summary, source, severity (P0–P3), evidence. Run
   `support:intake`.
2. **Classify** — P0 (critical), P1 (customer blocked), P2 (degraded), P3 (info).
   See the operating-room incident classes for the canonical definitions.
3. **Assign owner** — platform / support / customer. **A P0/P1 without an owner
   and a next action is rejected** (the issue log enforces this).
4. **Next action** — concrete and safe. Manual DB edits are forbidden as a normal
   path (emergency-only, per triage).
5. **Resolve** — mark resolved with a resolution note (`issue_resolved`).
6. **Review** — `support:review` summarizes counts by severity and the open P0/P1
   blockers; this feeds `customer:week1-review`.

## Severity guide
- **P0**: security / availability / data-corruption risk → safe rollback/disable
  option required.
- **P1**: a real flow is broken after setup (e.g. clicks but no lead) → owner +
  next action required.
- **P2**: degraded but working (LLM fallback, accumulating retries) → monitor.
- **P3**: informational (no traffic yet, no payment states yet) → usually no
  action.

## What support does NOT do
- It does not send WhatsApp for the customer (no auto-send).
- It does not process payments (manual payment state only).
- It does not promise revenue or guaranteed results.
- It does not hide a BLOCKED status or an unresolved P0/P1.

## Customer responsibilities in support
The customer responds to leads and confirms payments; support helps with setup,
activation, go-live, and first-week operation — within the agreed window.
