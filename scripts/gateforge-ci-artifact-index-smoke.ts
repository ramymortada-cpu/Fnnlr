#!/usr/bin/env tsx
import fs from 'node:fs';

const workflowPath = '.github/workflows/gateforge-ga-evidence.yml';
const indexPath = 'gateforge-audit/run-2026-06-23-1035/35_ci_artifact_index.md';
const requiredArtifacts = [
  '24_ga_unblock_evidence_pack.md',
  '25_live_command_results.md',
  '26_remaining_blockers.md',
  '27_recomputed_score.md',
  '28_conditional_go_request.md',
  '33_final_gate_evaluator.md',
  '34_final_gate_current_decision.md',
  '47_ga_unblock_status.md',
  '47_ga_unblock_status.json',
  '48_remaining_external_blocker_closeout.md',
  '48_remaining_external_blocker_closeout.json',
  '49_external_blocker_progress.md',
  '49_external_blocker_progress.json',
  '50_operator_execution_packet.md',
  '50_operator_execution_packet.csv',
  '50_operator_execution_packet.json',
];

function fail(message: string): never {
  console.error(`GateForge CI artifact index smoke: FAIL - ${message}`);
  process.exit(1);
}

const workflow = fs.readFileSync(workflowPath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');

for (const artifact of requiredArtifacts) {
  if (!workflow.includes(artifact)) fail(`${workflowPath} does not upload ${artifact}`);
  if (!index.includes(artifact)) fail(`${indexPath} does not list ${artifact}`);
}

console.log('GateForge CI artifact index smoke: PASS');
console.log(`  required artifacts: ${requiredArtifacts.length}`);
