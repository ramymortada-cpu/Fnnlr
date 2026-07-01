export type IncidentDrillCapabilityId =
  | 'scenario_catalog'
  | 'severity_mapping'
  | 'owner_assignment'
  | 'sanitized_evidence_capture'
  | 'mitigation_decision'
  | 'customer_comm_decision'
  | 'follow_up_actions'
  | 'hosted_drill_output';

export type IncidentDrillStatus =
  | 'READY'
  | 'CONTRACT_READY'
  | 'ROADMAP'
  | 'HOSTED_PROOF_PENDING'
  | 'MISSING_EVIDENCE';

export type IncidentDrillCapability = {
  id: IncidentDrillCapabilityId;
  label: string;
  status: IncidentDrillStatus;
  owner: 'Engineering' | 'Support' | 'Founder/legal' | 'Operator';
  evidence: string[];
  requiredForDrillClaim: boolean;
};

export type IncidentDrillReadinessReview = {
  decision: 'DRILL_READY' | 'CONTRACT_READY_WITH_HOSTED_GAP' | 'DO_NOT_CLAIM_DRILL_READY';
  drillClaimAllowed: boolean;
  readyCapabilities: IncidentDrillCapabilityId[];
  gapCapabilities: IncidentDrillCapabilityId[];
  blockedCapabilities: IncidentDrillCapabilityId[];
  actions: Array<{
    owner: IncidentDrillCapability['owner'];
    action: string;
    evidenceRequired: string;
  }>;
};

export const INCIDENT_DRILL_BASELINE: IncidentDrillCapability[] = [
  cap('scenario_catalog', 'P0/P1/P2/P3 scenario catalog', 'CONTRACT_READY', 'Engineering', [
    'docs/INCIDENT_RESPONSE_EXERCISE.md',
  ], true),
  cap('severity_mapping', 'Incident classifier severity mapping', 'CONTRACT_READY', 'Engineering', [
    'modules/operating-room/src/incidents.ts',
    'tests/operating-room.test.ts',
  ], true),
  cap('owner_assignment', 'Owner assigned for every drill scenario', 'CONTRACT_READY', 'Operator', [
    'docs/INCIDENT_RESPONSE_EXERCISE.md',
    'modules/operating-room/src/incidents.ts',
  ], true),
  cap('sanitized_evidence_capture', 'Sanitized incident evidence capture', 'ROADMAP', 'Operator', [
    'docs/INCIDENT_RESPONSE_EXERCISE.md',
    'docs/OBSERVABILITY_GA_RUNBOOK.md',
  ], true),
  cap('mitigation_decision', 'Mitigation or rollback decision recorded', 'CONTRACT_READY', 'Engineering', [
    'modules/operating-room/src/decision.ts',
    'tests/operating-room.test.ts',
  ], true),
  cap('customer_comm_decision', 'Customer communication decision recorded', 'ROADMAP', 'Support', [
    'docs/INCIDENT_RESPONSE_EXERCISE.md',
    'docs/SUPPORT_WORKFLOW.md',
  ], true),
  cap('follow_up_actions', 'Closeout follow-up actions captured', 'ROADMAP', 'Operator', [
    'docs/INCIDENT_RESPONSE_EXERCISE.md',
  ], true),
  cap('hosted_drill_output', 'Hosted staging drill output attached before GA', 'HOSTED_PROOF_PENDING', 'Operator', [
    'docs/INCIDENT_RESPONSE_EXERCISE.md',
  ], true),
];

export function reviewIncidentDrillReadiness(
  capabilities: IncidentDrillCapability[] = INCIDENT_DRILL_BASELINE,
): IncidentDrillReadinessReview {
  const readyCapabilities = capabilities.filter(isReady).map((capability) => capability.id);
  const gapCapabilities = capabilities.filter(isGap).map((capability) => capability.id);
  const blockedCapabilities = capabilities.filter(isBlocked).map((capability) => capability.id);
  const drillClaimAllowed = capabilities
    .filter((capability) => capability.requiredForDrillClaim)
    .every(isReady);

  return {
    decision: incidentDrillDecision(blockedCapabilities, drillClaimAllowed),
    drillClaimAllowed,
    readyCapabilities,
    gapCapabilities,
    blockedCapabilities,
    actions: incidentDrillActions(capabilities, blockedCapabilities, gapCapabilities),
  };
}

function cap(
  id: IncidentDrillCapabilityId,
  label: string,
  status: IncidentDrillStatus,
  owner: IncidentDrillCapability['owner'],
  evidence: string[],
  requiredForDrillClaim: boolean,
): IncidentDrillCapability {
  return { id, label, status, owner, evidence, requiredForDrillClaim };
}

function isReady(capability: IncidentDrillCapability) {
  return ['READY', 'CONTRACT_READY'].includes(capability.status) && capability.evidence.length > 0;
}

function isGap(capability: IncidentDrillCapability) {
  return ['ROADMAP', 'HOSTED_PROOF_PENDING'].includes(capability.status);
}

function isBlocked(capability: IncidentDrillCapability) {
  return capability.status === 'MISSING_EVIDENCE' || capability.evidence.length === 0;
}

function incidentDrillDecision(
  blockedCapabilities: IncidentDrillCapabilityId[],
  drillClaimAllowed: boolean,
): IncidentDrillReadinessReview['decision'] {
  if (blockedCapabilities.length > 0) return 'DO_NOT_CLAIM_DRILL_READY';
  return drillClaimAllowed ? 'DRILL_READY' : 'CONTRACT_READY_WITH_HOSTED_GAP';
}

function incidentDrillActions(
  capabilities: IncidentDrillCapability[],
  blockedCapabilities: IncidentDrillCapabilityId[],
  gapCapabilities: IncidentDrillCapabilityId[],
): IncidentDrillReadinessReview['actions'] {
  const actions: IncidentDrillReadinessReview['actions'] = [];
  for (const capability of capabilities) {
    if (blockedCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Attach incident drill evidence for ${capability.label}.`,
        evidenceRequired: 'Scenario output, owner record, sanitized log reference, mitigation decision, customer comms decision, or hosted drill artifact.',
      });
      continue;
    }
    if (gapCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Keep ${capability.label} gap-labeled until drill proof exists.`,
        evidenceRequired: 'Hosted or staging drill output proving the checklist was executed, not only documented.',
      });
    }
  }
  return actions;
}
