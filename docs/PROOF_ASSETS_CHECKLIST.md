# fnnlr — Proof Assets Checklist

Assets for sales / investor / customer proof. Status is honest. **Anything marked
"must not fabricate" stays empty until real data exists.**

| Asset | Status | Note |
|---|---|---|
| Product screenshots | needs screenshot | from the running app UI |
| Revenue Desk screenshot | needs screenshot | show activation mode + a live item |
| Go Live screenshot | needs screenshot | from `customer:go-live` UI/output |
| Execution lock output | available | `npm run customer:execution-lock` (text output) |
| Repeatability report output | available | `npm run customer:repeatability-report` |
| CI output (SAFE / NOT SAFE) | available | `npm run ci` |
| Health gate output | available | `npm run deploy:health-gate` |
| Deploy smoke output | available | `npm run deploy:smoke` |
| Commercial packaging | available | `docs/COMMERCIAL_PACKAGING.md` |
| Customer agreement draft | available | `docs/CUSTOMER_AGREEMENT_DRAFT.md` (needs lawyer review) |
| Support runbook | available | `docs/SUPPORT_WORKFLOW.md` |
| Security proof | available | `docs/SECURITY_TRUST_PROOF.md` |
| Deployment proof | available | `docs/DEPLOYMENT_RUNBOOK.md`, `TECHNICAL_PROOF.md` |
| Live DB test output | available | `npm run test:pg` against real Postgres |
| Evidence index | available | `docs/EVIDENCE_INDEX.md` |
| Real customer results | must not fabricate | empty until a real customer runs and consents |
| Market traction metrics | must not fabricate | none claimed; source externally if needed |
| Revenue / ROI numbers | must not fabricate | only from real `payment_states.amount` |
| TAM / market size | needs real customer data | source externally; never invented |

## Rules
- Screenshots must come from the real running app, never mocked.
- No fabricated metrics, customer results, traction, or revenue.
- "Available" outputs are command outputs anyone can reproduce from the bundle.
- Customer-specific assets require the customer's real data and consent.
