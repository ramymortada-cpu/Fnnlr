# Legal Approval Tracker

Status: `HUMAN_ATTESTATION_REQUIRED`

This tracker exists so GateForge does not confuse draft legal material with final legal approval.

| Item | Required state before GA | Current state | Owner | Evidence required |
| --- | --- | --- | --- | --- |
| Terms of Service | `FINAL_APPROVED` or signed human attestation | `HUMAN_ATTESTATION_REQUIRED` | Founder/legal | Published URL or signed approval note |
| Privacy Policy | `FINAL_APPROVED` or signed human attestation | `HUMAN_ATTESTATION_REQUIRED` | Founder/legal | Published URL or signed approval note |
| DPA | Available for business customers or explicit exception | `HUMAN_ATTESTATION_REQUIRED` | Founder/legal | DPA document or launch exception |
| Subprocessors | Published and reviewed | `DRAFT_READY` | Founder/legal | `SUBPROCESSORS.md` approved |
| Retention policy | Confirmed against product behavior | `DRAFT_READY` | Founder/legal + Engineering | `DATA_LIFECYCLE.md` approved |
| Security contact | Published | `DRAFT_READY` | Engineering | `SECURITY_CONTACT_AND_DISCLOSURE.md` approved |

## GateForge Rule

No legal row can be marked `PASS` by code alone. Use `HUMAN_ATTESTATION_REQUIRED` until the named owner approves it.
