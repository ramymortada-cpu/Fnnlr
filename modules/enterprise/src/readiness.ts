export type EnterpriseCapabilityId =
  | 'rbac_expansion'
  | 'workspace_policies'
  | 'audit_export'
  | 'sso_oidc'
  | 'saml'
  | 'data_residency'
  | 'procurement_packet'
  | 'soc2_readiness';

export type EnterpriseCapabilityStatus =
  | 'READY'
  | 'CONTRACT_READY'
  | 'ROADMAP'
  | 'HUMAN_ATTESTATION_REQUIRED'
  | 'MISSING_EVIDENCE';

export type EnterpriseCapability = {
  id: EnterpriseCapabilityId;
  label: string;
  priority: 'P2' | 'P3';
  status: EnterpriseCapabilityStatus;
  owner: 'Engineering' | 'Product' | 'Sales' | 'Founder/legal';
  evidence: string[];
  customerClaimAllowed: boolean;
};

export type EnterpriseReadinessReview = {
  salesPosture: 'ENTERPRISE_READY' | 'LIMITED_ENTERPRISE_ROADMAP' | 'DO_NOT_SELL_ENTERPRISE';
  readyCapabilities: EnterpriseCapabilityId[];
  roadmapCapabilities: EnterpriseCapabilityId[];
  blockedCapabilities: EnterpriseCapabilityId[];
  unsupportedClaims: EnterpriseCapabilityId[];
  actions: Array<{
    owner: EnterpriseCapability['owner'];
    action: string;
    evidenceRequired: string;
  }>;
};

export function reviewEnterpriseReadiness(capabilities: EnterpriseCapability[]): EnterpriseReadinessReview {
  const readyCapabilities = capabilities.filter(isReady).map((capability) => capability.id);
  const roadmapCapabilities = capabilities
    .filter((capability) => capability.status === 'ROADMAP' || capability.status === 'HUMAN_ATTESTATION_REQUIRED')
    .map((capability) => capability.id);
  const blockedCapabilities = capabilities.filter(isBlocked).map((capability) => capability.id);
  const unsupportedClaims = capabilities
    .filter((capability) => capability.customerClaimAllowed && !isReady(capability))
    .map((capability) => capability.id);

  return {
    salesPosture: salesPosture(capabilities, blockedCapabilities, unsupportedClaims),
    readyCapabilities,
    roadmapCapabilities,
    blockedCapabilities,
    unsupportedClaims,
    actions: enterpriseActions(capabilities, blockedCapabilities, unsupportedClaims),
  };
}

export const ENTERPRISE_READINESS_BASELINE: EnterpriseCapability[] = [
  capability(
    'rbac_expansion',
    'Granular permissions beyond owner/admin/member',
    'P2',
    'ROADMAP',
    'Engineering',
    ['docs/ENTERPRISE_READINESS_BACKLOG.md'],
    false,
  ),
  capability(
    'workspace_policies',
    'Admin-controlled team and workflow policies',
    'P2',
    'ROADMAP',
    'Engineering',
    ['docs/ENTERPRISE_READINESS_BACKLOG.md'],
    false,
  ),
  capability(
    'audit_export',
    'Exportable audit logs for security review',
    'P2',
    'ROADMAP',
    'Engineering',
    ['docs/ENTERPRISE_READINESS_BACKLOG.md', 'modules/security/src/audit.ts'],
    false,
  ),
  capability(
    'sso_oidc',
    'Enterprise identity via OIDC',
    'P2',
    'ROADMAP',
    'Engineering',
    ['docs/SSO_OIDC_READINESS.md'],
    false,
  ),
  capability(
    'saml',
    'Traditional enterprise identity via SAML',
    'P3',
    'ROADMAP',
    'Engineering',
    ['docs/SSO_OIDC_READINESS.md'],
    false,
  ),
  capability(
    'data_residency',
    'Clear MENA/global hosting position',
    'P2',
    'CONTRACT_READY',
    'Product',
    ['docs/DATA_RESIDENCY_POSITION.md'],
    true,
  ),
  capability(
    'procurement_packet',
    'Security and legal buyer checklist',
    'P2',
    'CONTRACT_READY',
    'Sales',
    ['docs/PROCUREMENT_CHECKLIST.md'],
    true,
  ),
  capability(
    'soc2_readiness',
    'SOC2 control readiness roadmap',
    'P3',
    'ROADMAP',
    'Engineering',
    ['docs/SOC2_READINESS_OUTLINE.md'],
    false,
  ),
];

function capability(
  id: EnterpriseCapabilityId,
  label: string,
  priority: EnterpriseCapability['priority'],
  status: EnterpriseCapabilityStatus,
  owner: EnterpriseCapability['owner'],
  evidence: string[],
  customerClaimAllowed: boolean,
): EnterpriseCapability {
  return { id, label, priority, status, owner, evidence, customerClaimAllowed };
}

function isReady(capability: EnterpriseCapability) {
  return ['READY', 'CONTRACT_READY'].includes(capability.status) && capability.evidence.length > 0;
}

function isBlocked(capability: EnterpriseCapability) {
  return capability.status === 'MISSING_EVIDENCE' || capability.evidence.length === 0;
}

function salesPosture(
  capabilities: EnterpriseCapability[],
  blockedCapabilities: EnterpriseCapabilityId[],
  unsupportedClaims: EnterpriseCapabilityId[],
): EnterpriseReadinessReview['salesPosture'] {
  if (blockedCapabilities.length > 0 || unsupportedClaims.length > 0) return 'DO_NOT_SELL_ENTERPRISE';
  const p2 = capabilities.filter((capability) => capability.priority === 'P2');
  const p2Ready = p2.filter(isReady);
  return p2Ready.length === p2.length ? 'ENTERPRISE_READY' : 'LIMITED_ENTERPRISE_ROADMAP';
}

function enterpriseActions(
  capabilities: EnterpriseCapability[],
  blockedCapabilities: EnterpriseCapabilityId[],
  unsupportedClaims: EnterpriseCapabilityId[],
): EnterpriseReadinessReview['actions'] {
  const actions = new Map<string, EnterpriseReadinessReview['actions'][number]>();
  const add = (action: EnterpriseReadinessReview['actions'][number]) =>
    actions.set(`${action.owner}:${action.action}`, action);

  for (const capability of capabilities) {
    if (blockedCapabilities.includes(capability.id)) {
      add({
        owner: capability.owner,
        action: `Attach evidence for ${capability.label}.`,
        evidenceRequired: 'File, test, runbook, or human attestation proving the capability status.',
      });
    }
    if (unsupportedClaims.includes(capability.id)) {
      add({
        owner: capability.owner,
        action: `Remove customer-facing enterprise-ready claim for ${capability.label}.`,
        evidenceRequired: 'Sales collateral updated to roadmap or human-attestation-required language.',
      });
    }
    if (capability.status === 'ROADMAP') {
      add({
        owner: capability.owner,
        action: `Keep ${capability.label} represented as roadmap until implementation evidence exists.`,
        evidenceRequired: 'Roadmap row with owner, priority, and acceptance criteria.',
      });
    }
  }

  return [...actions.values()];
}
