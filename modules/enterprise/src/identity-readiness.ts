export type EnterpriseIdentityMode = 'oidc' | 'saml';

export type EnterpriseIdentityRequirementId =
  | 'provider_configuration'
  | 'domain_verification'
  | 'jit_provisioning'
  | 'role_mapping'
  | 'break_glass_admin'
  | 'audit_events'
  | 'metadata_rotation';

export type EnterpriseIdentityRequirement = {
  id: EnterpriseIdentityRequirementId;
  label: string;
  requiredFor: EnterpriseIdentityMode[];
  status: 'READY' | 'ROADMAP' | 'MISSING_EVIDENCE';
  evidence: string[];
};

export type EnterpriseIdentityReadiness = {
  mode: EnterpriseIdentityMode;
  decision: 'READY' | 'PILOT_READY' | 'ROADMAP' | 'BLOCKED';
  readyRequirements: EnterpriseIdentityRequirementId[];
  missingRequirements: EnterpriseIdentityRequirementId[];
  roadmapRequirements: EnterpriseIdentityRequirementId[];
  customerClaimAllowed: boolean;
  actions: Array<{
    action: string;
    evidenceRequired: string;
  }>;
};

export const ENTERPRISE_IDENTITY_BASELINE: EnterpriseIdentityRequirement[] = [
  requirement('provider_configuration', 'Per-enterprise identity provider configuration', ['oidc', 'saml'], 'ROADMAP', [
    'docs/SSO_OIDC_READINESS.md',
  ]),
  requirement('domain_verification', 'Verified customer domain before binding identity provider', ['oidc', 'saml'], 'ROADMAP', [
    'docs/SSO_OIDC_READINESS.md',
  ]),
  requirement('jit_provisioning', 'Just-in-time user provisioning with explicit defaults', ['oidc'], 'ROADMAP', [
    'docs/SSO_OIDC_READINESS.md',
  ]),
  requirement('role_mapping', 'Identity-provider group to fnnlr role mapping', ['oidc', 'saml'], 'ROADMAP', [
    'docs/SSO_OIDC_READINESS.md',
  ]),
  requirement('break_glass_admin', 'Break-glass admin runbook for identity outages', ['oidc', 'saml'], 'ROADMAP', [
    'docs/SSO_OIDC_READINESS.md',
  ]),
  requirement('audit_events', 'Audit events for SSO login, mapping, and failure', ['oidc', 'saml'], 'ROADMAP', [
    'docs/SSO_OIDC_READINESS.md',
    'modules/security/src/audit.ts',
  ]),
  requirement('metadata_rotation', 'Metadata/certificate rotation procedure', ['saml'], 'ROADMAP', [
    'docs/SSO_OIDC_READINESS.md',
  ]),
];

export function reviewEnterpriseIdentityReadiness(
  mode: EnterpriseIdentityMode,
  requirements: EnterpriseIdentityRequirement[] = ENTERPRISE_IDENTITY_BASELINE,
): EnterpriseIdentityReadiness {
  const scoped = requirements.filter((requirement) => requirement.requiredFor.includes(mode));
  const readyRequirements = scoped.filter(isReady).map((requirement) => requirement.id);
  const missingRequirements = scoped.filter((requirement) => requirement.status === 'MISSING_EVIDENCE' || requirement.evidence.length === 0).map((requirement) => requirement.id);
  const roadmapRequirements = scoped.filter((requirement) => requirement.status === 'ROADMAP').map((requirement) => requirement.id);

  return {
    mode,
    decision: identityDecision(scoped, missingRequirements, roadmapRequirements),
    readyRequirements,
    missingRequirements,
    roadmapRequirements,
    customerClaimAllowed: missingRequirements.length === 0 && roadmapRequirements.length === 0,
    actions: identityActions(scoped, missingRequirements, roadmapRequirements),
  };
}

function requirement(
  id: EnterpriseIdentityRequirementId,
  label: string,
  requiredFor: EnterpriseIdentityMode[],
  status: EnterpriseIdentityRequirement['status'],
  evidence: string[],
): EnterpriseIdentityRequirement {
  return { id, label, requiredFor, status, evidence };
}

function isReady(requirement: EnterpriseIdentityRequirement) {
  return requirement.status === 'READY' && requirement.evidence.length > 0;
}

function identityDecision(
  requirements: EnterpriseIdentityRequirement[],
  missingRequirements: EnterpriseIdentityRequirementId[],
  roadmapRequirements: EnterpriseIdentityRequirementId[],
): EnterpriseIdentityReadiness['decision'] {
  if (missingRequirements.length > 0) return 'BLOCKED';
  if (roadmapRequirements.length === 0) return 'READY';
  const requiredCore = ['provider_configuration', 'domain_verification', 'break_glass_admin', 'audit_events'];
  const coreReady = requiredCore
    .filter((id) => requirements.some((requirement) => requirement.id === id))
    .every((id) => requirements.some((requirement) => requirement.id === id && isReady(requirement)));
  return coreReady ? 'PILOT_READY' : 'ROADMAP';
}

function identityActions(
  requirements: EnterpriseIdentityRequirement[],
  missingRequirements: EnterpriseIdentityRequirementId[],
  roadmapRequirements: EnterpriseIdentityRequirementId[],
): EnterpriseIdentityReadiness['actions'] {
  return requirements
    .filter((requirement) => missingRequirements.includes(requirement.id) || roadmapRequirements.includes(requirement.id))
    .map((requirement) => ({
      action: requirement.status === 'MISSING_EVIDENCE'
        ? `Attach implementation evidence for ${requirement.label}.`
        : `Keep ${requirement.label} represented as roadmap until implementation evidence exists.`,
      evidenceRequired: 'Code, test, runbook, hosted proof, or human attestation for this identity requirement.',
    }));
}
