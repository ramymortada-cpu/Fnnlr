# Procurement Checklist

Status: `CONTRACT_READY_WITH_GAPS`

Hosted runtime state: `HOSTED_PROOF_PENDING` until staging/live evidence, restore drill proof, monitoring proof, and email/provider evidence are attached.
Legal state: `HUMAN_ATTESTATION_REQUIRED` until Terms, Privacy, DPA, subprocessors, and data residency language are founder/legal approved.

Code evidence:

- `modules/enterprise/src/procurement-readiness.ts` defines buyer-safe procurement answers and gap states.
- `tests/procurement-readiness.test.ts` verifies buyer-safe-with-gaps, no-evidence blocking, unsafe-claim blocking, ready packet conditions, and required packet links.

Buyer-safe packet for larger customers.

## Procurement Packet Contents

| Packet item | Evidence | Current state |
| --- | --- | --- |
| Trust center | `TRUST_CENTER_INDEX.md` | Buyer-safe index; `HOSTED_PROOF_PENDING` remains explicit |
| Evidence index | `EVIDENCE_INDEX.md` | Claim-to-proof source of truth |
| Customer agreement | `CUSTOMER_AGREEMENT_DRAFT.md` | Draft; `HUMAN_ATTESTATION_REQUIRED` |
| Commercial packaging | `COMMERCIAL_PACKAGING.md` | GA v1 packaging and exclusions |
| Pricing and limits | `PRICING_AND_LIMITS_MATRIX.md` | Enterprise limits require contract-specific proof |
| Security proof | `SECURITY_TRUST_PROOF.md` | Code-supported; `HOSTED_PROOF_PENDING` |
| Data lifecycle | `DATA_LIFECYCLE.md` | Export/delete proof exists; hosted proof pending |
| Backup/restore | `BACKUP_RESTORE_RUNBOOK.md` | Runbook exists; hosted restore drill pending |
| Observability | `OBSERVABILITY_GA_RUNBOOK.md` | Runbook exists; provider proof pending |
| Legal approval tracker | `LEGAL_APPROVAL_TRACKER.md` | `HUMAN_ATTESTATION_REQUIRED` |
| Subprocessors | `SUBPROCESSORS.md` | Draft ready; `HUMAN_ATTESTATION_REQUIRED` |
| Data residency | `DATA_RESIDENCY_POSITION.md` | No unconditional guarantee; provider-region evidence required |
| SSO/OIDC | `SSO_OIDC_READINESS.md` | Roadmap |
| SOC2 | `SOC2_READINESS_OUTLINE.md` | Roadmap only, not a SOC2 claim |
| Support workflow | `SUPPORT_WORKFLOW.md` | Support operating model documented |

| Question | Current answer |
| --- | --- |
| Is tenant data isolated? | DB-per-tenant architecture; hosted proof pending |
| Are secrets encrypted? | Yes, production fails closed without keys |
| Does fnnlr process payments? | No, GA v1 records payment state only |
| Does fnnlr auto-send WhatsApp? | No, human approval/send remains required |
| Is there a DPA? | Human/legal approval required |
| Is there a subprocessor list? | Required before GA |
| Is there a restore drill? | Runbook exists; hosted proof pending |
| Is there monitoring? | Runbook exists; provider proof pending |
| Can fnnlr guarantee regional data residency? | No unconditional GA v1 guarantee; enterprise commitments require provider-region evidence |
| Is there SSO? | Roadmap |
| Is there SOC2? | Roadmap |

## Buyer-Safe Commitments

- fnnlr does not process payments in GA v1.
- fnnlr does not auto-send WhatsApp.
- fnnlr does not guarantee revenue.
- Enterprise, SOC2, SSO, regional residency, SLA, and custom-security commitments must stay roadmap-labeled, contract-specific, `HOSTED_PROOF_PENDING`, or `HUMAN_ATTESTATION_REQUIRED` until evidence closes.

## Packet Decision Rules

- `BUYER_SAFE_PACKET_READY`: every answer is ready or not applicable and has evidence.
- `BUYER_SAFE_WITH_GAPS`: answers are safe to share only when gaps are explicit as hosted proof pending, roadmap, or human attestation required.
- `DO_NOT_SEND_PACKET`: any answer has missing evidence or unsafe wording.

Current baseline: `BUYER_SAFE_WITH_GAPS`.
