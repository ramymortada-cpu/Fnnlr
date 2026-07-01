#!/usr/bin/env tsx
import fs from 'node:fs';

const workflowPath = '.github/workflows/gateforge-ga-evidence.yml';
const hostedStrictWorkflowPath = '.github/workflows/gateforge-hosted-staging-strict.yml';
const indexPath = 'gateforge-audit/run-2026-06-23-1035/35_ci_artifact_index.md';
const requiredArtifacts = [
  '24_ga_unblock_evidence_pack.md',
  '25_live_command_results.md',
  '26_remaining_blockers.md',
  '27_recomputed_score.md',
  '28_conditional_go_request.md',
  '33_final_gate_evaluator.md',
  '34_final_gate_current_decision.md',
  '35_ci_artifact_index.md',
  '46_attestation_secret_pack.md',
  '49_local_secret_env_template.env',
  '49_local_secret_env_template.md',
  '47_ga_unblock_status.md',
  '47_ga_unblock_status.json',
  '48_remaining_external_blocker_closeout.md',
  '48_remaining_external_blocker_closeout.json',
  '49_external_blocker_progress.md',
  '49_external_blocker_progress.json',
  '50_operator_execution_packet.md',
  '50_operator_execution_packet.csv',
  '50_operator_execution_packet.json',
  '44_hosted_readiness_doctor.json',
  '51_ga_evidence_run_audit.md',
  '51_ga_evidence_run_audit.json',
  '52_external_closeout_validator.md',
  '52_external_closeout_validator.json',
  '53_hosted_dependency_chain.md',
  '53_hosted_dependency_chain.json',
  '54_hosted_readiness_contract.md',
  '54_hosted_readiness_contract.json',
  '55_open_p0_terminal_runbook.md',
  '55_open_p0_terminal_runbook.json',
  '56_hosted_strict_trigger_readiness.md',
  '56_hosted_strict_trigger_readiness.json',
];
const hostedStrictArtifacts = [
  '24_ga_unblock_evidence_pack.md',
  '25_live_command_results.md',
  '26_remaining_blockers.md',
  '27_recomputed_score.md',
  '28_conditional_go_request.md',
  '34_final_gate_current_decision.md',
  '38_hosted_staging_operator_setup.md',
  '44_hosted_readiness_doctor.md',
  '44_hosted_readiness_doctor.json',
  '45_secret_replacement_packet.md',
  '46_attestation_secret_pack.md',
  '49_local_secret_env_template.env',
  '49_local_secret_env_template.md',
  '47_ga_unblock_status.md',
  '47_ga_unblock_status.json',
  '48_remaining_external_blocker_closeout.md',
  '48_remaining_external_blocker_closeout.json',
  '49_external_blocker_progress.md',
  '49_external_blocker_progress.json',
  '50_operator_execution_packet.md',
  '50_operator_execution_packet.csv',
  '50_operator_execution_packet.json',
  '52_external_closeout_validator.md',
  '52_external_closeout_validator.json',
  '53_hosted_dependency_chain.md',
  '53_hosted_dependency_chain.json',
  '54_hosted_readiness_contract.md',
  '54_hosted_readiness_contract.json',
  '55_open_p0_terminal_runbook.md',
  '55_open_p0_terminal_runbook.json',
  '56_hosted_strict_trigger_readiness.md',
  '56_hosted_strict_trigger_readiness.json',
];

function fail(message: string): never {
  console.error(`GateForge CI artifact index smoke: FAIL - ${message}`);
  process.exit(1);
}

const workflow = fs.readFileSync(workflowPath, 'utf8');
const hostedStrictWorkflow = fs.readFileSync(hostedStrictWorkflowPath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');

for (const artifact of requiredArtifacts) {
  if (!workflow.includes(artifact)) fail(`${workflowPath} does not upload ${artifact}`);
  if (!index.includes(artifact)) fail(`${indexPath} does not list ${artifact}`);
}
for (const artifact of hostedStrictArtifacts) {
  if (!hostedStrictWorkflow.includes(artifact)) fail(`${hostedStrictWorkflowPath} does not upload ${artifact}`);
}

console.log('GateForge CI artifact index smoke: PASS');
console.log(`  GA evidence artifacts checked: ${requiredArtifacts.length}`);
console.log(`  hosted strict artifacts checked: ${hostedStrictArtifacts.length}`);
