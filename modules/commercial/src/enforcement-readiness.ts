export type LimitEnforcementCapabilityId =
  | 'plan_limit_source'
  | 'seat_enforcement_point'
  | 'workflow_enforcement_point'
  | 'contact_enforcement_point'
  | 'integration_enforcement_point'
  | 'ai_budget_enforcement_point'
  | 'support_tier_mapping'
  | 'negative_overage_tests'
  | 'customer_safe_errors';

export type LimitEnforcementStatus =
  | 'READY'
  | 'CONTRACT_READY'
  | 'PARTIAL_CODE_READY'
  | 'ROADMAP'
  | 'HOSTED_PROOF_PENDING'
  | 'MISSING_EVIDENCE';

export type LimitEnforcementCapability = {
  id: LimitEnforcementCapabilityId;
  label: string;
  status: LimitEnforcementStatus;
  owner: 'Engineering' | 'Product' | 'Support';
  evidence: string[];
  requiredForEnforcementClaim: boolean;
};

export type LimitEnforcementReadinessReview = {
  decision:
    | 'ENFORCEMENT_READY'
    | 'CONTRACT_READY_WITH_ROUTE_GAPS'
    | 'DO_NOT_CLAIM_ENFORCEMENT_READY';
  enforcementClaimAllowed: boolean;
  readyCapabilities: LimitEnforcementCapabilityId[];
  gapCapabilities: LimitEnforcementCapabilityId[];
  blockedCapabilities: LimitEnforcementCapabilityId[];
  actions: Array<{
    owner: LimitEnforcementCapability['owner'];
    action: string;
    evidenceRequired: string;
  }>;
};

export const LIMIT_ENFORCEMENT_BASELINE: LimitEnforcementCapability[] = [
  cap('plan_limit_source', 'Plan limit source of truth', 'CONTRACT_READY', 'Engineering', [
    'modules/commercial/src/limits.ts',
    'docs/PRICING_AND_LIMITS_MATRIX.md',
    'tests/commercial-limits.test.ts',
  ], true),
  cap('seat_enforcement_point', 'Workspace seat invite/create enforcement point', 'PARTIAL_CODE_READY', 'Engineering', [
    'docs/USAGE_LIMIT_ENFORCEMENT_MAP.md',
    'modules/commercial/src/limits.ts',
  ], true),
  cap('workflow_enforcement_point', 'Workflow create/publish enforcement point', 'PARTIAL_CODE_READY', 'Engineering', [
    'docs/USAGE_LIMIT_ENFORCEMENT_MAP.md',
    'modules/commercial/src/limits.ts',
  ], true),
  cap('contact_enforcement_point', 'Contact import/create enforcement point', 'PARTIAL_CODE_READY', 'Engineering', [
    'docs/USAGE_LIMIT_ENFORCEMENT_MAP.md',
    'modules/commercial/src/limits.ts',
  ], true),
  cap('integration_enforcement_point', 'Integration connection enforcement point', 'PARTIAL_CODE_READY', 'Engineering', [
    'docs/USAGE_LIMIT_ENFORCEMENT_MAP.md',
    'modules/commercial/src/limits.ts',
  ], true),
  cap('ai_budget_enforcement_point', 'AI tenant/global budget enforcement point', 'CONTRACT_READY', 'Engineering', [
    'packages/ai-core/src/gateway.ts',
    'tests/brains.test.ts',
    'docs/USAGE_LIMIT_ENFORCEMENT_MAP.md',
  ], true),
  cap('support_tier_mapping', 'Support tier mapped to plans', 'CONTRACT_READY', 'Support', [
    'docs/SUPPORT_WORKFLOW.md',
    'docs/PRICING_AND_LIMITS_MATRIX.md',
  ], true),
  cap('negative_overage_tests', 'Negative overage acceptance tests', 'CONTRACT_READY', 'Engineering', [
    'tests/commercial-limits.test.ts',
  ], true),
  cap('customer_safe_errors', 'Customer-safe limit errors and upgrade hint', 'CONTRACT_READY', 'Product', [
    'modules/commercial/src/limits.ts',
    'tests/commercial-limits.test.ts',
  ], true),
];

export function reviewLimitEnforcementReadiness(
  capabilities: LimitEnforcementCapability[] = LIMIT_ENFORCEMENT_BASELINE,
): LimitEnforcementReadinessReview {
  const readyCapabilities = capabilities.filter(isReady).map((capability) => capability.id);
  const gapCapabilities = capabilities.filter(isGap).map((capability) => capability.id);
  const blockedCapabilities = capabilities.filter(isBlocked).map((capability) => capability.id);
  const enforcementClaimAllowed = capabilities
    .filter((capability) => capability.requiredForEnforcementClaim)
    .every(isReady);

  return {
    decision: enforcementDecision(blockedCapabilities, enforcementClaimAllowed),
    enforcementClaimAllowed,
    readyCapabilities,
    gapCapabilities,
    blockedCapabilities,
    actions: enforcementActions(capabilities, blockedCapabilities, gapCapabilities),
  };
}

function cap(
  id: LimitEnforcementCapabilityId,
  label: string,
  status: LimitEnforcementStatus,
  owner: LimitEnforcementCapability['owner'],
  evidence: string[],
  requiredForEnforcementClaim: boolean,
): LimitEnforcementCapability {
  return { id, label, status, owner, evidence, requiredForEnforcementClaim };
}

function isReady(capability: LimitEnforcementCapability) {
  return ['READY', 'CONTRACT_READY'].includes(capability.status) && capability.evidence.length > 0;
}

function isGap(capability: LimitEnforcementCapability) {
  return ['PARTIAL_CODE_READY', 'ROADMAP', 'HOSTED_PROOF_PENDING'].includes(capability.status);
}

function isBlocked(capability: LimitEnforcementCapability) {
  return capability.status === 'MISSING_EVIDENCE' || capability.evidence.length === 0;
}

function enforcementDecision(
  blockedCapabilities: LimitEnforcementCapabilityId[],
  enforcementClaimAllowed: boolean,
): LimitEnforcementReadinessReview['decision'] {
  if (blockedCapabilities.length > 0) return 'DO_NOT_CLAIM_ENFORCEMENT_READY';
  return enforcementClaimAllowed ? 'ENFORCEMENT_READY' : 'CONTRACT_READY_WITH_ROUTE_GAPS';
}

function enforcementActions(
  capabilities: LimitEnforcementCapability[],
  blockedCapabilities: LimitEnforcementCapabilityId[],
  gapCapabilities: LimitEnforcementCapabilityId[],
): LimitEnforcementReadinessReview['actions'] {
  const actions: LimitEnforcementReadinessReview['actions'] = [];
  for (const capability of capabilities) {
    if (blockedCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Attach limit enforcement evidence for ${capability.label}.`,
        evidenceRequired: 'Code, route guard, negative test, UI proof, or hosted smoke evidence proving the enforcement point.',
      });
      continue;
    }
    if (gapCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Keep ${capability.label} gap-labeled until route-level enforcement proof exists.`,
        evidenceRequired: 'Route-level enforcement plus negative overage test before claiming usage enforcement readiness.',
      });
    }
  }
  return actions;
}
