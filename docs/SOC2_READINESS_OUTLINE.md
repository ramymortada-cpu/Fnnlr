# SOC2 Readiness Outline

Status: `CONTRACT_READY_ROADMAP`

This is not a SOC2 claim. It is a control-readiness outline.

Code evidence:
- `modules/enterprise/src/soc2-readiness.ts`
- `tests/soc2-readiness.test.ts`

| Control area | Current evidence | Gap |
| --- | --- | --- |
| Access control | Auth, admin MFA, route matrix | Enterprise RBAC depth |
| Change management | GitHub Actions, tests, evidence artifacts | Formal approval workflow |
| Availability | Health gate, smoke checks, backup runbooks | Hosted restore/rollback drills |
| Confidentiality | Tenant isolation, encryption fail-closed | Production evidence packet |
| Incident response | Runbooks and exercise template | Completed drill evidence |
| Vendor management | Subprocessor draft | Approved vendor review |
| Monitoring | Observability runbook | Hosted alert proof |

## Next Step

After Conditional GO, convert GateForge evidence artifacts into a control evidence library.

## Claim Gate

fnnlr must not claim SOC2 certification, SOC2 readiness, or SOC2-equivalent assurance in customer-facing material until every control area is `EVIDENCE_READY` with evidence attached. The current allowed language is: "SOC2 readiness roadmap exists; formal certification is not claimed."

The code contract enforces:
- `MISSING_EVIDENCE` or empty evidence produces `DO_NOT_CLAIM_SOC2`.
- Any customer-facing claim on a non-evidence-ready control produces `DO_NOT_CLAIM_SOC2`.
- `CONTROL_LIBRARY_READY` is allowed only when every control area is `EVIDENCE_READY`.
