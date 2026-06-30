# Enterprise Readiness Backlog

Status: `CONTRACT_READY`

This is not required for initial Conditional GO, but it is required for a global SaaS moat.

Code evidence:

- `modules/enterprise/src/readiness.ts` defines the enterprise capability contract and sales-posture gate.
- `tests/enterprise-readiness.test.ts` verifies roadmap honesty, unsupported-claim blocking, missing-evidence blocking, and the strict enterprise-ready condition.

| Area | Requirement | Priority |
| --- | --- | --- |
| RBAC | Granular permissions beyond owner/admin/member | P2 |
| Workspace policies | Admin-controlled team and workflow policies | P2 |
| Audit export | Exportable audit logs for security review | P2 |
| SSO/OIDC | Enterprise identity readiness | P2 |
| SAML | Traditional enterprise identity support | P3 |
| Data residency | Clear MENA/global hosting position | P2 |
| Procurement | Security/legal checklist for buyer review | P2 |
| SOC2 | Control roadmap and evidence owners | P3 |

## Rule

Do not sell enterprise guarantees before evidence exists. Mark unsupported items as roadmap or human-attestation-required.

## Sales Posture Rules

- `ENTERPRISE_READY`: every P2 enterprise capability is `READY` or `CONTRACT_READY` with evidence.
- `LIMITED_ENTERPRISE_ROADMAP`: some P2 enterprise capabilities remain roadmap, but no unsupported customer-facing claim is allowed.
- `DO_NOT_SELL_ENTERPRISE`: any customer-facing claim points to an unready capability, or any capability has missing evidence.

Current baseline posture: `LIMITED_ENTERPRISE_ROADMAP`.
