# SSO/OIDC Readiness

Status: `ROADMAP`

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

## Not Required For Initial Conditional GO

SSO/OIDC can remain roadmap for the first GA segment, but it must be represented honestly in enterprise sales.
