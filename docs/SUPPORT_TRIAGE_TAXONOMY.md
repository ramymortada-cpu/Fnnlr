# Support Triage Taxonomy

Status: `CONTRACT_READY`

Code evidence:

- `modules/sales-ops/src/support-workflow.ts` defines the canonical support categories, default owners, category inference, and P0/P1 validation.
- `modules/sales-ops/src/support-workflow.ts` also produces support operating readiness, escalation actions, and repeated-category product intelligence actions.
- `modules/operating-room/src/readiness.ts` checks support triage as part of the operating cadence readiness gate.
- `tests/sales-ops.test.ts` proves category classification, default ownership, incomplete P0/P1 rejection, support operating blockers, and hotspot product-intelligence actions.
- `tests/operating-cadence-readiness.test.ts` proves hosted issue-log evidence is required before claiming live operating cadence readiness.
- P0/P1 issues require owner, next action, due date, and evidence link.

| Category | Severity trigger | Owner |
| --- | --- | --- |
| Tenant isolation | Any cross-tenant suspicion | Engineering |
| Auth/MFA | Admin access issue | Engineering |
| Workflow blocked | Customer cannot publish or run workflow | Support + Engineering |
| Email deliverability | Verification/reset/admin alert failure | Support |
| Webhook failure | Signed provider event rejected incorrectly | Engineering |
| AI degraded | Provider unavailable or budget capped | Support + Engineering |
| Data export/delete | Customer data lifecycle request | Support + Founder/legal |
| Billing/commercial | Plan, agreement, or payment-state confusion | Sales |

P0/P1 tickets require owner, next action, due date, and evidence link.

## Weekly Operating Review

Support review outputs:

- Counts by severity.
- Counts by category.
- Open P0/P1 blockers with owner, next action, due date, and evidence link.
- Escalation actions for every unresolved P0/P1.
- Hotspot categories when the same category appears repeatedly in the review window.
- Product-intelligence actions for hotspots with affected customer count, sample evidence links, owner, due date, and follow-up decision.

Decision states:

- `SUPPORT_OPERATING_READY`: no open P0/P1 blockers.
- `SUPPORT_OPERATING_HAS_BLOCKERS`: open P0/P1 blockers exist, but ownership and evidence are complete.
- `SUPPORT_OPERATING_NEEDS_EVIDENCE`: an open P0/P1 lacks owner, next action, due date, or evidence link.
