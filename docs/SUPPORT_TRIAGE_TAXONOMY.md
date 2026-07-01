# Support Triage Taxonomy

Status: `CONTRACT_READY`

Code evidence:

- `modules/sales-ops/src/support-workflow.ts` defines the canonical support categories, default owners, category inference, and P0/P1 validation.
- `modules/operating-room/src/readiness.ts` checks support triage as part of the operating cadence readiness gate.
- `tests/sales-ops.test.ts` proves category classification, default ownership, and incomplete P0/P1 rejection.
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
