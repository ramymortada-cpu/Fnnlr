# fnnlr — Customer Deployment Runbook (repeatable)

This is the general runbook for deploying **any** customer — the first, the second,
the tenth. `CUSTOMER_ZERO_RUNBOOK.md` describes the same flow as the first-use
case; this doc makes explicit that the flow is **repeatable**, with no special-case
and no DB hacking. Every customer uses the same path, the same schema, the same
tools, with full tenant isolation.

## Same path for every customer
1. Qualify + handoff — `sales:score`, `sales:proposal-check`, `sales:handoff`.
2. Config — copy `customer-zero.config.example.json` (or
   `customer-one.config.example.json` as a second worked example) and fill real
   values. **Same schema for every customer.**
3. Setup — `customer:verify` then `customer:create` (idempotent; rerun is safe).
4. Execution lock — `customer:execution-lock` (launch only on READY/WARN).
5. Go live — `customer:go-live` → `customer:72h-monitor` → `customer:week1-review`.

## Repeatability is proven, not assumed
```
npm run customer:repeatability-check  -- <customerA.config.json> <customerB.config.json>
npm run customer:repeatability-report -- <customerA.config.json> <customerB.config.json>
```
This sets up two customers via the same runner and proves: distinct tenants /
businesses / funnels, idempotent reruns (no duplicate records), and **signal
isolation** — a smoke signal for customer B does not change customer A's page
events, leads, or Revenue Desk. The report decision is `REPEATABLE`, `RISK`, or
`BLOCKED`.

## Isolation guarantees (every customer)
- Each customer is a separate tenant with its own database — there is no
  cross-tenant data access (no `x-tenant-id` trust; tenant resolved server-side).
- Distinct business ids, funnel ids, activation state, Revenue Desk, support
  snapshot, and operating-room decisions per customer.

## Honest limits (unchanged, every customer)
No auto-send WhatsApp. No payment processing — manual payment state only.
Recommendations require manual approval and are evidence-based. No guaranteed
revenue. Customer responsibilities are explicit in the agreement and handoff.

## Not a one-off
Nothing in the deployment path is specific to "customer zero." The same scripts,
schema, and checks run customer one, two, three — proven by the repeatability
check above.
