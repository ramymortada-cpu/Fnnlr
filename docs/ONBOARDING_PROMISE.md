# fnnlr — Onboarding Promise (first 7 days)

> Honest and concrete. Each day maps to a real script proven in Sprints 38–42.
> No fake results; the day-7 decision is whatever the gate actually returns.

## Day 0 — setup
- Config validation (`customer:verify`, `customer:execution-verify`).
- Workspace / business setup (`customer:create`, idempotent).
- First funnel created.
- Activation begins (`/activation`).

## Day 1 — publish + first signal
- Publish the offer page and create the tracked WhatsApp link.
- First-signal check (`customer:first-signal` — a script signal is marked test; a
  real customer event is not).
- Execution lock confirms readiness (`customer:execution-lock`) — launch only on
  READY/WARN, never on BLOCKED.

## Day 2–3 — monitor
- First-72h monitor (`customer:72h-monitor`).
- Customer-facing update (`customer:72h-update`) — safe, no secrets, no fake
  revenue.

## Day 7 — first-week review
- Week-1 review (`customer:week1-review`).
- Decision, whatever the gate returns: **CONTINUE**, **HOLD**,
  **NEEDS_CONFIGURATION**, or **ROLLBACK/DISABLE**. We do not claim CONTINUE if
  the decision gate says otherwise.

## What we do not promise
- We do not promise revenue, sales, or a specific number of leads.
- We do not auto-send WhatsApp and we do not process payments.
- Recommendations appear only when there is enough observed data.

## What we need from you to keep this schedule
The customer responsibilities checklist in `CUSTOMER_AGREEMENT_DRAFT.md` —
especially the WhatsApp number, payment instructions, traffic source, and the
people who respond to leads and confirm payments.
