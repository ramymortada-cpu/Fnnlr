# SSO/OIDC Readiness

Status: `CONTRACT_READY_ROADMAP`

Code evidence:

- `modules/enterprise/src/identity-readiness.ts` defines OIDC/SAML readiness requirements and decisions.
- `tests/enterprise-identity-readiness.test.ts` verifies roadmap honesty, missing-evidence blocking, pilot-ready requirements, and customer-claim gating.

## Why It Matters

Enterprise buyers often require centralized identity and access control.

## Requirements

| Requirement | Notes |
| --- | --- |
| OIDC provider configuration | Per enterprise tenant |
| Domain verification | Prevent unauthorized SSO binding |
| Just-in-time provisioning | Optional, with role defaults |
| Role mapping | Map IdP groups to fnnlr roles |
| Break-glass admin | Operator runbook required |
| Audit events | Log SSO login, mapping, failures |
| SAML metadata rotation | Required before SAML customer claim |

## Readiness Decisions

| Decision | Meaning |
| --- | --- |
| `ROADMAP` | Requirements are documented but not implemented enough to sell. |
| `PILOT_READY` | Core safety requirements are ready, but some scoped requirements remain roadmap. |
| `READY` | Every scoped requirement has implementation evidence. |
| `BLOCKED` | Any required evidence is missing. |

## Claim Rule

Do not mark OIDC or SAML as customer-claimable unless every scoped requirement is `READY` with evidence.

## Not Required For Initial Conditional GO

SSO/OIDC can remain roadmap for the first GA segment, but it must be represented honestly in enterprise sales.
