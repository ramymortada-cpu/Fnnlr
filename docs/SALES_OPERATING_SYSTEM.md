# fnnlr — Sales & Support Operating System

> A light, repeatable operating layer so selling and delivering fnnlr does not
> depend on anyone's memory. It is file/script-backed and built on the existing
> commercial docs and customer-zero tools. It is **not** a CRM, **not** billing,
> and adds **no** product feature. Every promise here matches the product: no
> auto-send, no payment processing, manual approval, evidence-based, and no
> guaranteed revenue. Customer responsibilities are explicit, never hidden.

## The 12 stages
Each stage has entry criteria, exit criteria, an owner, the evidence required,
the script/doc to run, and the common blocker.

### 1. Discovery — owner: sales
- Entry: a new lead. Exit: intake fields captured.
- Run: `INTERNAL_SALES_SCRIPT.md` · record into the intake schema.
- Blocker: vague offer → ask the discovery questions.

### 2. Qualification — owner: sales
- Entry: intake captured. Exit: a fit category.
- Run: `sales:score`. Evidence: the intake.
- Blocker: missing basics (WhatsApp motion, traffic, responder).

### 3. Expectation reset — owner: sales
- Entry: lead wrongly assumes fnnlr will auto-send, process payments, or
  guarantee sales — none of which it does.
- Exit: expectations corrected, or disqualify.
- Run: the resets from the fit result. Blocker: customer insists on the
  forbidden behavior → disqualify.

### 4. Proposal — owner: sales
- Entry: fit not bad, required inputs known. Exit: READY_TO_PROPOSE.
- Run: `sales:proposal-check` → `sales:proposal-draft` (`PROPOSAL_TEMPLATE.md`).
- Blocker: responsibilities / limitations / success criteria not accepted.

### 5. Agreement — owner: sales
- Entry: proposal accepted. Exit: agreement signed (lawyer-reviewed).
- Run: `CUSTOMER_AGREEMENT_DRAFT.md`. Blocker: legal review pending.

### 6. Customer config collection — owner: setup
- Entry: agreement done. Exit: required inputs collected (no placeholders left).
- Run: `sales:handoff`. Blocker: missing customer inputs (explicit placeholders).

### 7. Setup — owner: setup
- Entry: inputs collected. Exit: customer created (idempotent).
- Run: `customer:verify` → `customer:create`. Blocker: invalid config.

### 8. Execution lock — owner: setup
- Entry: setup done. Exit: READY/WARN (never launch on BLOCKED).
- Run: `customer:execution-lock`. Blocker: page/link/payment/activation missing.

### 9. Go live — owner: setup + customer response owner
- Entry: lock READY/WARN, launch window open. Exit: LAUNCHED.
- Run: `customer:go-live`. Blocker: a refused (BLOCKED) lock.

### 10. 72h monitor — owner: support
- Entry: launched. Exit: a clear status + decision.
- Run: `customer:72h-monitor` / `customer:72h-update`. Blocker: P0/P1 incidents.

### 11. Week-1 review — owner: support
- Entry: 72h elapsed. Exit: a decision.
- Run: `customer:week1-review`. Blocker: unresolved blockers.

### 12. Continue / Hold / Disqualify — owner: sales + support
- Decision is whatever the gate returns: CONTINUE, HOLD, NEEDS_CONFIGURATION, or
  ROLLBACK/DISABLE. We do not claim CONTINUE if the gate says otherwise.

## Ownership (every launch must name these)
sales owner · setup owner · support owner · customer response owner · payment
confirmation owner · rollback owner. A missing owner for a critical step
(setup, support, response, payment confirmation, rollback) **blocks** the handoff.

## Honest limits (restated)
fnnlr does not auto-send WhatsApp. fnnlr does not process payments — manual
payment state only. Recommendations require manual approval and are evidence-based.
There is no guaranteed revenue. Customer responsibilities are listed in the
agreement and the handoff.
