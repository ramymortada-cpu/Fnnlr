# Data Export and Deletion Workflow Backlog

Status: CONTRACT_READY_WITH_PRODUCT_GAPS

Purpose: productize the existing export/delete commands into customer-operable lifecycle workflows.

## Current Evidence

- `scripts/export-tenant.ts` generates sanitized tenant export evidence with table counts and SHA-256 hash.
- `scripts/delete-tenant.ts` drops the dedicated tenant database through the provisioning module.
- `modules/data-lifecycle/src/readiness.ts` defines the customer workflow readiness gate.
- `tests/data-lifecycle-readiness.test.ts` proves command readiness cannot be marketed as customer-operable export/delete readiness while request, approval, delivery, confirmation, and negative-auth evidence remain roadmap-only.

## Export Workflow

| Step | Acceptance criteria |
| --- | --- |
| Request export | Admin requests tenant export |
| Operator review | Operator confirms scope and destination |
| Generate export | Uses `export-tenant` sanitized bundle |
| Audit event | Export request and completion recorded |
| Delivery | Customer receives approved export bundle |

## Deletion Workflow

| Step | Acceptance criteria |
| --- | --- |
| Request deletion | Admin/customer submits request |
| Legal/support review | Retention and contract constraints checked |
| Confirmation | Explicit human confirmation required |
| Execute deletion | Uses tenant deletion path |
| Audit event | Request, approval, execution, and proof recorded |

## Safety Rules

- No self-service destructive deletion in GA v1.
- No raw secrets in export bundles.
- All lifecycle operations need audit evidence.

## Claim Gate

Do not claim "customer-operable data export/delete workflows are ready" until all required capabilities in `DATA_LIFECYCLE_WORKFLOW_BASELINE` are `READY` or `CONTRACT_READY` with evidence attached. Command-level evidence is useful, but it does not replace request, approval, delivery, confirmation, and negative-auth proof.
