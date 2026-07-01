export type GovernanceCapabilityId =
  | 'role_inventory'
  | 'permission_catalog'
  | 'route_policy_mapping'
  | 'negative_permission_tests'
  | 'workspace_policy_catalog'
  | 'policy_enforcement_hooks'
  | 'admin_policy_ui'
  | 'audit_policy_changes';

export type GovernanceCapabilityStatus =
  | 'READY'
  | 'CONTRACT_READY'
  | 'ROADMAP'
  | 'HOSTED_PROOF_PENDING'
  | 'MISSING_EVIDENCE';

export type GovernanceCapability = {
  id: GovernanceCapabilityId;
  label: string;
  area: 'rbac' | 'workspace_policy' | 'shared';
  status: GovernanceCapabilityStatus;
  owner: 'Engineering' | 'Product' | 'Support';
  evidence: string[];
  requiredForEnterpriseClaim: boolean;
};

export type GovernanceReadinessReview = {
  decision:
    | 'GOVERNANCE_READY'
    | 'CONTRACT_READY_WITH_ENTERPRISE_GAPS'
    | 'DO_NOT_CLAIM_GOVERNANCE_READY';
  enterpriseClaimAllowed: boolean;
  readyCapabilities: GovernanceCapabilityId[];
  gapCapabilities: GovernanceCapabilityId[];
  blockedCapabilities: GovernanceCapabilityId[];
  actions: Array<{
    owner: GovernanceCapability['owner'];
    action: string;
    evidenceRequired: string;
  }>;
};

export const GOVERNANCE_READINESS_BASELINE: GovernanceCapability[] = [
  cap('role_inventory', 'Owner/admin/member baseline role inventory', 'rbac', 'CONTRACT_READY', 'Engineering', [
    'packages/db/control-plane/migrations/0002_auth_workspace.sql',
    'docs/ENTERPRISE_READINESS_BACKLOG.md',
  ], true),
  cap('permission_catalog', 'Granular permission catalog beyond simple roles', 'rbac', 'ROADMAP', 'Product', [
    'docs/ENTERPRISE_READINESS_BACKLOG.md',
  ], true),
  cap('route_policy_mapping', 'Route-to-permission policy mapping', 'rbac', 'ROADMAP', 'Engineering', [
    'docs/reports/full_project_due_diligence/inventories/PERMISSIONS_MATRIX.csv',
    'tests/route-matrix.test.ts',
  ], true),
  cap('negative_permission_tests', 'Negative permission tests for non-admin and cross-role access', 'rbac', 'ROADMAP', 'Engineering', [
    'tests/route-matrix.test.ts',
    'tests/admin-mfa.test.ts',
  ], true),
  cap('workspace_policy_catalog', 'Workspace governance policy catalog', 'workspace_policy', 'ROADMAP', 'Product', [
    'docs/ENTERPRISE_READINESS_BACKLOG.md',
  ], true),
  cap('policy_enforcement_hooks', 'Policy enforcement hooks in admin/workflow actions', 'workspace_policy', 'ROADMAP', 'Engineering', [
    'docs/ENTERPRISE_READINESS_BACKLOG.md',
  ], true),
  cap('admin_policy_ui', 'Admin UI for workspace policy management', 'workspace_policy', 'ROADMAP', 'Engineering', [
    'docs/ENTERPRISE_READINESS_BACKLOG.md',
  ], true),
  cap('audit_policy_changes', 'Audit log coverage for role and policy changes', 'shared', 'CONTRACT_READY', 'Engineering', [
    'modules/security/src/audit.ts',
    'docs/AUDIT_LOG_VIEWER_BACKLOG.md',
  ], true),
];

export function reviewGovernanceReadiness(
  capabilities: GovernanceCapability[] = GOVERNANCE_READINESS_BASELINE,
): GovernanceReadinessReview {
  const readyCapabilities = capabilities.filter(isReady).map((capability) => capability.id);
  const gapCapabilities = capabilities.filter(isGap).map((capability) => capability.id);
  const blockedCapabilities = capabilities.filter(isBlocked).map((capability) => capability.id);
  const enterpriseClaimAllowed = capabilities
    .filter((capability) => capability.requiredForEnterpriseClaim)
    .every(isReady);

  return {
    decision: governanceDecision(blockedCapabilities, enterpriseClaimAllowed),
    enterpriseClaimAllowed,
    readyCapabilities,
    gapCapabilities,
    blockedCapabilities,
    actions: governanceActions(capabilities, blockedCapabilities, gapCapabilities),
  };
}

function cap(
  id: GovernanceCapabilityId,
  label: string,
  area: GovernanceCapability['area'],
  status: GovernanceCapabilityStatus,
  owner: GovernanceCapability['owner'],
  evidence: string[],
  requiredForEnterpriseClaim: boolean,
): GovernanceCapability {
  return { id, label, area, status, owner, evidence, requiredForEnterpriseClaim };
}

function isReady(capability: GovernanceCapability) {
  return ['READY', 'CONTRACT_READY'].includes(capability.status) && capability.evidence.length > 0;
}

function isGap(capability: GovernanceCapability) {
  return ['ROADMAP', 'HOSTED_PROOF_PENDING'].includes(capability.status);
}

function isBlocked(capability: GovernanceCapability) {
  return capability.status === 'MISSING_EVIDENCE' || capability.evidence.length === 0;
}

function governanceDecision(
  blockedCapabilities: GovernanceCapabilityId[],
  enterpriseClaimAllowed: boolean,
): GovernanceReadinessReview['decision'] {
  if (blockedCapabilities.length > 0) return 'DO_NOT_CLAIM_GOVERNANCE_READY';
  return enterpriseClaimAllowed ? 'GOVERNANCE_READY' : 'CONTRACT_READY_WITH_ENTERPRISE_GAPS';
}

function governanceActions(
  capabilities: GovernanceCapability[],
  blockedCapabilities: GovernanceCapabilityId[],
  gapCapabilities: GovernanceCapabilityId[],
): GovernanceReadinessReview['actions'] {
  const actions: GovernanceReadinessReview['actions'] = [];
  for (const capability of capabilities) {
    if (blockedCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Attach governance evidence for ${capability.label}.`,
        evidenceRequired: 'Permission matrix, route policy map, negative auth test, admin UI proof, audit event, or hosted enterprise demo evidence.',
      });
      continue;
    }
    if (gapCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Keep ${capability.label} roadmap-labeled until enterprise governance proof exists.`,
        evidenceRequired: 'Code/test/UI evidence before claiming RBAC or workspace policy readiness.',
      });
    }
  }
  return actions;
}
