# Audit Log Viewer Backlog

Purpose: turn existing audit events into an admin/operator surface.

Status: `CONTRACT_READY_WITH_GAPS`

Code evidence:
- `modules/security/src/audit.ts` writes tenant audit events.
- `modules/enterprise/src/audit-log-readiness.ts` defines the audit viewer readiness gate.
- `tests/audit-log-readiness.test.ts` proves the viewer cannot be claimed ready while tenant view, export, permission, or negative-test evidence is still roadmap-only.

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

## Claim Gate

Do not claim "audit log viewer ready" until all required capabilities in `AUDIT_LOG_VIEWER_BASELINE` are `READY` or `CONTRACT_READY` with evidence attached. Roadmap-only rows remain honest gaps.
