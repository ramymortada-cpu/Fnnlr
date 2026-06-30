# Procurement Checklist

Status: `CONTRACT_READY_WITH_GAPS`

Code evidence:

- `modules/enterprise/src/procurement-readiness.ts` defines buyer-safe procurement answers and gap states.
- `tests/procurement-readiness.test.ts` verifies buyer-safe-with-gaps, no-evidence blocking, unsafe-claim blocking, and ready packet conditions.

Buyer-safe packet for larger customers.

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

## Packet Decision Rules

- `BUYER_SAFE_PACKET_READY`: every answer is ready or not applicable and has evidence.
- `BUYER_SAFE_WITH_GAPS`: answers are safe to share only when gaps are explicit as hosted proof pending, roadmap, or human attestation required.
- `DO_NOT_SEND_PACKET`: any answer has missing evidence or unsafe wording.

Current baseline: `BUYER_SAFE_WITH_GAPS`.
