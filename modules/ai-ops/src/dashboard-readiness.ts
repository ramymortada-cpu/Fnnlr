export type AIOperationsSurfaceId =
  | 'tenant_cost_summary'
  | 'workflow_cost_breakdown'
  | 'degraded_fallback_monitor'
  | 'tenant_cap_display'
  | 'tenant_cap_change_request'
  | 'kill_switch_status'
  | 'budget_forecast';

export type AIOperationsSurfaceStatus =
  | 'READY'
  | 'CONTRACT_READY'
  | 'ROADMAP'
  | 'HOSTED_PROOF_PENDING'
  | 'MISSING_EVIDENCE';

export type AIOperationsSurface = {
  id: AIOperationsSurfaceId;
  label: string;
  purpose: 'dashboard' | 'cap_control' | 'safety';
  status: AIOperationsSurfaceStatus;
  evidence: string[];
  owner: 'Engineering' | 'Finance/ops' | 'Product' | 'Support';
};

export type AIOperationsReadinessReview = {
  decision: 'OPERATOR_READY' | 'CONTRACT_READY_WITH_GAPS' | 'DO_NOT_CLAIM_READY';
  dashboardReady: boolean;
  tenantCapUiReady: boolean;
  readySurfaces: AIOperationsSurfaceId[];
  gapSurfaces: AIOperationsSurfaceId[];
  blockedSurfaces: AIOperationsSurfaceId[];
  actions: Array<{
    owner: AIOperationsSurface['owner'];
    action: string;
    evidenceRequired: string;
  }>;
};

export const AI_OPERATIONS_SURFACES: AIOperationsSurface[] = [
  s('tenant_cost_summary', 'Tenant AI cost summary', 'dashboard', 'CONTRACT_READY', 'Finance/ops', [
    'modules/ai-ops/src/spend-review.ts',
    'tests/workflow-intelligence.test.ts',
    'docs/AI_SPEND_REVIEW_TEMPLATE.md',
  ]),
  s('workflow_cost_breakdown', 'Workflow AI cost breakdown', 'dashboard', 'CONTRACT_READY', 'Product', [
    'modules/ai-ops/src/workflow-intelligence.ts',
    'tests/workflow-intelligence.test.ts',
  ]),
  s('degraded_fallback_monitor', 'Degraded fallback monitor', 'dashboard', 'CONTRACT_READY', 'Support', [
    'modules/ai-ops/src/spend-review.ts',
    'modules/sales-ops/src/support-workflow.ts',
    'tests/workflow-intelligence.test.ts',
  ]),
  s('tenant_cap_display', 'Tenant AI cap display', 'cap_control', 'ROADMAP', 'Engineering', [
    'docs/WORKFLOW_INTELLIGENCE_SPEC.md',
    'packages/ai-core/src/gateway.ts',
  ]),
  s('tenant_cap_change_request', 'Tenant AI cap change request workflow', 'cap_control', 'ROADMAP', 'Finance/ops', [
    'docs/WORKFLOW_INTELLIGENCE_SPEC.md',
  ]),
  s('kill_switch_status', 'AI kill switch status', 'safety', 'CONTRACT_READY', 'Engineering', [
    'packages/ai-core/src/gateway.ts',
    'tests/brains.test.ts',
  ]),
  s('budget_forecast', 'AI budget forecast before cap changes', 'dashboard', 'ROADMAP', 'Finance/ops', [
    'docs/AI_SPEND_REVIEW_TEMPLATE.md',
  ]),
];

export function reviewAIOperationsReadiness(
  surfaces: AIOperationsSurface[] = AI_OPERATIONS_SURFACES,
): AIOperationsReadinessReview {
  const blockedSurfaces = surfaces.filter(isBlocked).map((surface) => surface.id);
  const gapSurfaces = surfaces.filter(isGap).map((surface) => surface.id);
  const readySurfaces = surfaces.filter(isReady).map((surface) => surface.id);
  const dashboardReady = surfaces
    .filter((surface) => surface.purpose === 'dashboard')
    .every((surface) => isReady(surface));
  const tenantCapUiReady = surfaces
    .filter((surface) => surface.purpose === 'cap_control')
    .every((surface) => isReady(surface));

  return {
    decision: aiOperationsDecision(blockedSurfaces, gapSurfaces),
    dashboardReady,
    tenantCapUiReady,
    readySurfaces,
    gapSurfaces,
    blockedSurfaces,
    actions: aiOperationsActions(surfaces, blockedSurfaces, gapSurfaces),
  };
}

function s(
  id: AIOperationsSurfaceId,
  label: string,
  purpose: AIOperationsSurface['purpose'],
  status: AIOperationsSurfaceStatus,
  owner: AIOperationsSurface['owner'],
  evidence: string[],
): AIOperationsSurface {
  return { id, label, purpose, status, owner, evidence };
}

function isReady(surface: AIOperationsSurface) {
  return ['READY', 'CONTRACT_READY'].includes(surface.status) && surface.evidence.length > 0;
}

function isBlocked(surface: AIOperationsSurface) {
  return surface.status === 'MISSING_EVIDENCE' || surface.evidence.length === 0;
}

function isGap(surface: AIOperationsSurface) {
  return ['ROADMAP', 'HOSTED_PROOF_PENDING'].includes(surface.status);
}

function aiOperationsDecision(
  blockedSurfaces: AIOperationsSurfaceId[],
  gapSurfaces: AIOperationsSurfaceId[],
): AIOperationsReadinessReview['decision'] {
  if (blockedSurfaces.length > 0) return 'DO_NOT_CLAIM_READY';
  if (gapSurfaces.length > 0) return 'CONTRACT_READY_WITH_GAPS';
  return 'OPERATOR_READY';
}

function aiOperationsActions(
  surfaces: AIOperationsSurface[],
  blockedSurfaces: AIOperationsSurfaceId[],
  gapSurfaces: AIOperationsSurfaceId[],
): AIOperationsReadinessReview['actions'] {
  const actions: AIOperationsReadinessReview['actions'] = [];
  for (const surface of surfaces) {
    if (blockedSurfaces.includes(surface.id)) {
      actions.push({
        owner: surface.owner,
        action: `Attach AI operations evidence for ${surface.label}.`,
        evidenceRequired: 'Code, test, runbook, hosted proof, or dashboard screenshot proving the surface.',
      });
      continue;
    }
    if (gapSurfaces.includes(surface.id)) {
      actions.push({
        owner: surface.owner,
        action: `Keep ${surface.label} gap-labeled until implementation evidence exists.`,
        evidenceRequired: 'Acceptance criteria plus code/test or hosted proof before marking ready.',
      });
    }
  }
  return actions;
}
