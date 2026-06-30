# fnnlr Trust Center Index

Status: `HUMAN_ATTESTATION_REQUIRED` until hosted staging evidence and final legal approval are attached.

## Trust Position

fnnlr is an Arabic-first AI Revenue Operations OS. Its trust posture is built around DB-per-tenant isolation, human-approved automation, no payment processing in GA v1, no auto-send WhatsApp, explicit data lifecycle controls, and evidence-based launch gates.

## Core Proof Links

| Area | Evidence | Current state |
| --- | --- | --- |
| Security proof | `SECURITY_TRUST_PROOF.md` | Code-supported, hosted evidence pending |
| Tenant isolation | `TECHNICAL_PROOF.md` | Local proven, live staging proof pending |
| Legal readiness | `LEGAL_READINESS_STATUS.md` | Human attestation required |
| Data lifecycle | `DATA_LIFECYCLE.md` | Export/delete command proof exists; hosted proof pending |
| Backup/restore | `BACKUP_RESTORE_RUNBOOK.md` | Runbook exists; hosted restore drill pending |
| Observability | `OBSERVABILITY_GA_RUNBOOK.md` | Runbook exists; provider proof pending |
| Email deliverability | `EMAIL_DELIVERABILITY.md` | Provider/DNS proof pending |
| Dependency security | `DEPENDENCY_SECURITY.md` | Local audit/SBOM supported |
| Support workflow | `SUPPORT_WORKFLOW.md` | Operational process documented |
| GateForge status | `../gateforge-audit/run-2026-06-23-1035/47_ga_unblock_status.md` | Current launch decision |
| SaaS moat board | `SAAS_MOAT_ACTION_PLAN.md` | 165 execution actions |

## Buyer-Safe Commitments

- fnnlr does not guarantee revenue.
- fnnlr does not process customer payments in GA v1.
- fnnlr does not auto-send WhatsApp messages.
- Mutating recommendations require human approval.
- Secrets must not be pasted into docs, tickets, reports, or chat.
- GA approval requires hosted staging evidence, not local implementation alone.

## Missing Before Full GA

- Hosted staging secrets.
- Hosted strict workflow success.
- Hosted restore drill proof.
- Monitoring alert proof.
- Email DNS/provider proof.
- Final legal approval or explicit human attestation.
