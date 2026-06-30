# Audit Log Viewer Backlog

Purpose: turn existing audit events into an admin/operator surface.

## Scope

| Capability | Acceptance criteria |
| --- | --- |
| Tenant-scoped audit view | Admin sees only current tenant events |
| Operator audit view | Operator can filter by tenant id and event type |
| Secret redaction | No secret values, tokens, raw provider keys, or passwords |
| Export | CSV/JSON export for enterprise review |
| Event detail | Actor, action, target, timestamp, request id, safe metadata |
| Permission | Admin/operator-only access |

## Negative Tests Required

- Non-admin cannot access admin audit view.
- Tenant A cannot view Tenant B audit events.
- Export contains no secret-like values.
