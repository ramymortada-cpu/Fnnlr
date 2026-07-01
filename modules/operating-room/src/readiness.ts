export type OperatingCadenceCapabilityId =
  | 'customer_health_signal_model'
  | 'customer_health_owner_action'
  | 'support_triage_catalog'
  | 'critical_issue_ownership'
  | 'weekly_review_template'
  | 'hosted_issue_log_evidence';

export type OperatingCadenceStatus =
  | 'READY'
  | 'CONTRACT_READY'
  | 'HOSTED_PROOF_PENDING'
  | 'ROADMAP'
  | 'MISSING_EVIDENCE';

export type OperatingCadenceCapability = {
  id: OperatingCadenceCapabilityId;
  label: string;
  area: 'health' | 'support' | 'review';
  status: OperatingCadenceStatus;
  owner: 'Support' | 'Product' | 'Engineering' | 'Leadership';
  evidence: string[];
  requiredForOperatingClaim: boolean;
};

export type OperatingCadenceReadinessReview = {
  decision:
    | 'OPERATING_CADENCE_READY'
    | 'CONTRACT_READY_WITH_HOSTED_GAPS'
    | 'DO_NOT_CLAIM_OPERATING_CADENCE_READY';
  operatingCadenceClaimAllowed: boolean;
  readyCapabilities: OperatingCadenceCapabilityId[];
  gapCapabilities: OperatingCadenceCapabilityId[];
  blockedCapabilities: OperatingCadenceCapabilityId[];
  actions: Array<{
    owner: OperatingCadenceCapability['owner'];
    action: string;
    evidenceRequired: string;
  }>;
};

export const OPERATING_CADENCE_BASELINE: OperatingCadenceCapability[] = [
  cap('customer_health_signal_model', 'Customer health model covers activation, usage, signals, support, and AI risk', 'health', 'CONTRACT_READY', 'Support', [
    'modules/operating-room/src/health-score.ts',
    'docs/CUSTOMER_HEALTH_SCORE_SPEC.md',
    'tests/customer-health-score.test.ts',
  ], true),
  cap('customer_health_owner_action', 'Every non-healthy score returns owner and next action', 'health', 'CONTRACT_READY', 'Support', [
    'modules/operating-room/src/health-score.ts',
    'tests/customer-health-score.test.ts',
  ], true),
  cap('support_triage_catalog', 'Support triage categories map issues to default owners and escalation owners', 'support', 'CONTRACT_READY', 'Support', [
    'modules/sales-ops/src/support-workflow.ts',
    'docs/SUPPORT_TRIAGE_TAXONOMY.md',
    'tests/sales-ops.test.ts',
  ], true),
  cap('critical_issue_ownership', 'P0/P1 support issues require owner, next action, due date, and evidence link', 'support', 'CONTRACT_READY', 'Engineering', [
    'modules/sales-ops/src/support-workflow.ts',
    'tests/sales-ops.test.ts',
  ], true),
  cap('weekly_review_template', 'Weekly moat review template exists for leadership review', 'review', 'CONTRACT_READY', 'Leadership', [
    'docs/WEEKLY_MOAT_REVIEW_TEMPLATE.md',
  ], true),
  cap('hosted_issue_log_evidence', 'Hosted issue log and customer health review evidence attached', 'review', 'HOSTED_PROOF_PENDING', 'Support', [
    'gateforge-audit/run-2026-06-23-1035/12_war_board.csv',
  ], true),
];

export function reviewOperatingCadenceReadiness(
  capabilities: OperatingCadenceCapability[] = OPERATING_CADENCE_BASELINE,
): OperatingCadenceReadinessReview {
  const readyCapabilities = capabilities.filter(isReady).map((capability) => capability.id);
  const gapCapabilities = capabilities.filter(isGap).map((capability) => capability.id);
  const blockedCapabilities = capabilities.filter(isBlocked).map((capability) => capability.id);
  const operatingCadenceClaimAllowed = capabilities
    .filter((capability) => capability.requiredForOperatingClaim)
    .every(isReady);

  return {
    decision: operatingCadenceDecision(blockedCapabilities, operatingCadenceClaimAllowed),
    operatingCadenceClaimAllowed,
    readyCapabilities,
    gapCapabilities,
    blockedCapabilities,
    actions: operatingCadenceActions(capabilities, blockedCapabilities, gapCapabilities),
  };
}

function cap(
  id: OperatingCadenceCapabilityId,
  label: string,
  area: OperatingCadenceCapability['area'],
  status: OperatingCadenceStatus,
  owner: OperatingCadenceCapability['owner'],
  evidence: string[],
  requiredForOperatingClaim: boolean,
): OperatingCadenceCapability {
  return { id, label, area, status, owner, evidence, requiredForOperatingClaim };
}

function isReady(capability: OperatingCadenceCapability) {
  return ['READY', 'CONTRACT_READY'].includes(capability.status) && capability.evidence.length > 0;
}

function isGap(capability: OperatingCadenceCapability) {
  return ['HOSTED_PROOF_PENDING', 'ROADMAP'].includes(capability.status);
}

function isBlocked(capability: OperatingCadenceCapability) {
  return capability.status === 'MISSING_EVIDENCE' || capability.evidence.length === 0;
}

function operatingCadenceDecision(
  blockedCapabilities: OperatingCadenceCapabilityId[],
  operatingCadenceClaimAllowed: boolean,
): OperatingCadenceReadinessReview['decision'] {
  if (blockedCapabilities.length > 0) return 'DO_NOT_CLAIM_OPERATING_CADENCE_READY';
  return operatingCadenceClaimAllowed ? 'OPERATING_CADENCE_READY' : 'CONTRACT_READY_WITH_HOSTED_GAPS';
}

function operatingCadenceActions(
  capabilities: OperatingCadenceCapability[],
  blockedCapabilities: OperatingCadenceCapabilityId[],
  gapCapabilities: OperatingCadenceCapabilityId[],
): OperatingCadenceReadinessReview['actions'] {
  const actions: OperatingCadenceReadinessReview['actions'] = [];
  for (const capability of capabilities) {
    if (blockedCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Attach operating cadence evidence for ${capability.label}.`,
        evidenceRequired: 'Code, test, review note, issue log export, or hosted evidence proving this operating capability.',
      });
      continue;
    }
    if (gapCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Keep ${capability.label} gap-labeled until live operating evidence exists.`,
        evidenceRequired: 'Hosted issue log, customer health review output, owner, next action, due date, and evidence link.',
      });
    }
  }
  return actions;
}
