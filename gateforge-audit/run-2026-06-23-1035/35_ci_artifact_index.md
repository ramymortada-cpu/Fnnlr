# GateForge CI Artifact Index

Status: `COMPLETE_EVIDENCE_UPLOAD_ENABLED`

This index defines the expected contents of the `gateforge-ga-evidence` GitHub Actions artifact.

## Core Decision Files

- `24_ga_unblock_evidence_pack.md`
- `25_live_command_results.md`
- `26_remaining_blockers.md`
- `27_recomputed_score.md`
- `28_conditional_go_request.md`
- `29_disposable_staging_evidence.md`
- `30_disposable_staging_repeatable_run.md`
- `31_external_attestation_closeout.md`
- `32_external_evidence_intake.md`
- `33_final_gate_evaluator.md`
- `34_final_gate_current_decision.md`
- `35_ci_artifact_index.md`
- `45_secret_replacement_packet.json`
- `46_attestation_secret_pack.md`
- `46_attestation_secret_pack.json`
- `49_local_secret_env_template.env`
- `49_local_secret_env_template.md`
- `47_ga_unblock_status.md`
- `47_ga_unblock_status.json`
- `48_remaining_external_blocker_closeout.md`
- `48_remaining_external_blocker_closeout.json`
- `49_external_blocker_progress.md`
- `49_external_blocker_progress.json`
- `50_operator_execution_packet.md`
- `50_operator_execution_packet.csv`
- `50_operator_execution_packet.json`
- `44_hosted_readiness_doctor.json`
- `51_ga_evidence_run_audit.md`
- `51_ga_evidence_run_audit.json`
- `52_external_closeout_validator.md`
- `52_external_closeout_validator.json`
- `53_hosted_dependency_chain.md`
- `53_hosted_dependency_chain.json`
- `54_hosted_readiness_contract.md`
- `54_hosted_readiness_contract.json`
- `55_open_p0_terminal_runbook.md`
- `55_open_p0_terminal_runbook.json`
- `56_hosted_strict_trigger_readiness.md`
- `56_hosted_strict_trigger_readiness.json`
- `57_secret_upload_attempt.md`
- `57_secret_upload_attempt.json`
- `58_current_head_ga_evidence_proof.md`
- `58_current_head_ga_evidence_proof.json`
- `39_github_secrets_presence_audit.json`
- `40_missing_github_secrets_remediation.json`
- `41_hosted_strict_trigger_attempt.md`
- `41_hosted_strict_trigger_attempt.json`

## External Evidence Intake

- `gateforge-audit/external-attestations/README.md`
- `gateforge-audit/external-attestations/hosted-staging-attestation.template.json`

## Machine Evidence

- `gateforge-audit/evidence/sbom.json`
- `gateforge-audit/run-2026-06-23-1035/ga-unblock-evidence/*.log`
- `gateforge-audit/run-2026-06-23-1035/ga-unblock-evidence/summary.json`

## Interpretation

The artifact is complete enough for a reviewer to answer:

- What is the current GateForge decision?
- Which runtime evidence passed?
- Which external attestations remain?
- What command turns complete external evidence into `CONDITIONAL_GO`?
- Which logs support the current score estimate?

Current expected decision before hosted/provider/legal attestations:

`CANNOT_APPROVE`
