# fnnlr Trust Center Index

Status: `HUMAN_ATTESTATION_REQUIRED` until hosted staging evidence and final legal approval are attached.

Hosted runtime state: `HOSTED_PROOF_PENDING` until staging secrets, hosted strict checks, restore drill, monitoring alert proof, and email provider/DNS proof are attached.

## Trust Position

fnnlr is an Arabic-first AI Revenue Operations OS. Its trust posture is built around DB-per-tenant isolation, human-approved automation, no payment processing in GA v1, no auto-send WhatsApp, explicit data lifecycle controls, and evidence-based launch gates.

## Core Proof Links

| Area | Evidence | Current state |
| --- | --- | --- |
| Security proof | `SECURITY_TRUST_PROOF.md` | Code-supported; `HOSTED_PROOF_PENDING` |
| Tenant isolation | `TECHNICAL_PROOF.md` | Local proven; live staging proof is `HOSTED_PROOF_PENDING` |
| Legal readiness | `LEGAL_READINESS_STATUS.md` | `HUMAN_ATTESTATION_REQUIRED` |
| Legal approval tracker | `LEGAL_APPROVAL_TRACKER.md` | `HUMAN_ATTESTATION_REQUIRED` |
| Subprocessors | `SUBPROCESSORS.md` | Draft ready; `HUMAN_ATTESTATION_REQUIRED` |
| Security contact | `SECURITY_CONTACT_AND_DISCLOSURE.md` | Draft ready; `HUMAN_ATTESTATION_REQUIRED` |
| Data lifecycle | `DATA_LIFECYCLE.md` | Export/delete command proof exists; `HOSTED_PROOF_PENDING` |
| Data lifecycle workflow | `DATA_EXPORT_DELETE_UI_BACKLOG.md` | Product backlog ready |
| Backup/restore | `BACKUP_RESTORE_RUNBOOK.md` | Runbook exists; hosted restore drill is `HOSTED_PROOF_PENDING` |
| Observability | `OBSERVABILITY_GA_RUNBOOK.md` | Runbook exists; provider proof is `HOSTED_PROOF_PENDING` |
| Incident drill | `INCIDENT_RESPONSE_EXERCISE.md` | Drill template ready |
| Email deliverability | `EMAIL_DELIVERABILITY.md` | Provider/DNS proof is `HOSTED_PROOF_PENDING` |
| Dependency security | `DEPENDENCY_SECURITY.md` | Local audit/SBOM supported |
| Support workflow | `SUPPORT_WORKFLOW.md` | Operational process documented |
| Procurement packet | `PROCUREMENT_CHECKLIST.md` | Buyer checklist ready; evidence attachments remain gated |
| Evidence index | `EVIDENCE_INDEX.md` | Claim-to-proof source of truth |
| Usage limits | `USAGE_LIMIT_ENFORCEMENT_MAP.md` | Enforcement backlog ready |
| Data residency | `DATA_RESIDENCY_POSITION.md` | Draft ready, approval required |
| SSO/OIDC | `SSO_OIDC_READINESS.md` | Roadmap |
| SOC2 | `SOC2_READINESS_OUTLINE.md` | Roadmap |
| GateForge status | `../gateforge-audit/run-2026-06-23-1035/47_ga_unblock_status.md` | Current launch decision |
| GateForge external blocker closeout | `../gateforge-audit/run-2026-06-23-1035/48_remaining_external_blocker_closeout.md` | Exact remaining hosted/operator blocker map |
| SaaS moat board | `SAAS_MOAT_ACTION_PLAN.md` | 165 execution actions |

## Readiness Contract

The trust center is guarded by `modules/proof/src/trust-center-readiness.ts` and `tests/trust-center-readiness.test.ts`.

This contract requires security, legal, data lifecycle, backup/restore, observability, incident response, email deliverability, dependency security, support, procurement, and evidence-index links before the trust center can be treated as buyer-ready. It also blocks unsafe claims such as GA approval, SOC2 certification, guaranteed revenue, payment-processing readiness, or enterprise readiness unless the wording is explicitly evidence-backed, roadmap-labeled, `HOSTED_PROOF_PENDING`, or `HUMAN_ATTESTATION_REQUIRED`.

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
