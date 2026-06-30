# Data Export and Deletion Workflow Backlog

Purpose: productize the existing export/delete commands into customer-operable lifecycle workflows.

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
