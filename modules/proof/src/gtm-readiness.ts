export type GTMProofCapabilityStatus =
  | 'READY'
  | 'CONTRACT_READY'
  | 'HOSTED_PROOF_PENDING'
  | 'HUMAN_ATTESTATION_REQUIRED'
  | 'MISSING_EVIDENCE';

export type PartnerProgramCapabilityId =
  | 'partner_icp'
  | 'qualification_criteria'
  | 'no_revenue_guarantee_boundary'
  | 'implementation_owner_model'
  | 'customer_data_boundary'
  | 'support_escalation_path'
  | 'hosted_partner_pilot_evidence';

export type CaseStudyCapabilityId =
  | 'before_state'
  | 'after_state'
  | 'metric_evidence'
  | 'customer_quote_or_attestation'
  | 'no_revenue_guarantee_boundary'
  | 'privacy_approval'
  | 'case_study_template'
  | 'hosted_customer_proof_evidence';

export type GTMProofCapability<Id extends string> = {
  id: Id;
  label: string;
  owner: 'Sales' | 'Marketing' | 'Support' | 'Legal' | 'Product';
  status: GTMProofCapabilityStatus;
  evidence: string[];
  requiredForPublicClaim: boolean;
};

export type GTMProofReadinessReview<Id extends string> = {
  decision:
    | 'PUBLIC_CLAIM_READY'
    | 'CONTRACT_READY_WITH_HOSTED_GAPS'
    | 'HUMAN_ATTESTATION_REQUIRED'
    | 'DO_NOT_CLAIM_READY';
  publicClaimAllowed: boolean;
  readyCapabilities: Id[];
  gapCapabilities: Id[];
  attestationCapabilities: Id[];
  blockedCapabilities: Id[];
  actions: Array<{
    owner: GTMProofCapability<Id>['owner'];
    action: string;
    evidenceRequired: string;
  }>;
};

export const PARTNER_PROGRAM_BASELINE: GTMProofCapability<PartnerProgramCapabilityId>[] = [
  partnerCap('partner_icp', 'Agency ICP is Arabic-first, SMB, WhatsApp-heavy, and operations-capable', 'Sales', 'CONTRACT_READY', [
    'docs/PARTNER_AGENCY_PROGRAM.md',
  ], true),
  partnerCap('qualification_criteria', 'Partner qualification criteria reject unsafe revenue, auto-send, and payment-processing expectations', 'Sales', 'CONTRACT_READY', [
    'docs/PARTNER_AGENCY_PROGRAM.md',
    'docs/OBJECTION_HANDLING_LIBRARY.md',
  ], true),
  partnerCap('no_revenue_guarantee_boundary', 'Partner offer keeps no guaranteed revenue language explicit', 'Legal', 'CONTRACT_READY', [
    'docs/PARTNER_AGENCY_PROGRAM.md',
    'docs/CUSTOMER_PROOF_PACK.md',
  ], true),
  partnerCap('implementation_owner_model', 'Partner responsibilities and fnnlr owner boundaries are named', 'Support', 'CONTRACT_READY', [
    'docs/PARTNER_AGENCY_PROGRAM.md',
    'docs/SUPPORT_WORKFLOW.md',
  ], true),
  partnerCap('customer_data_boundary', 'Partner data handling and customer-data boundary are explicit', 'Legal', 'CONTRACT_READY', [
    'docs/PARTNER_AGENCY_PROGRAM.md',
    'docs/TRUST_CENTER_INDEX.md',
  ], true),
  partnerCap('support_escalation_path', 'Partner support escalation path maps issues to fnnlr owners', 'Support', 'CONTRACT_READY', [
    'docs/PARTNER_AGENCY_PROGRAM.md',
    'docs/SUPPORT_TRIAGE_TAXONOMY.md',
  ], true),
  partnerCap('hosted_partner_pilot_evidence', 'At least one partner pilot is proven with real customer-safe evidence', 'Sales', 'HOSTED_PROOF_PENDING', [
    'docs/PARTNER_AGENCY_PROGRAM.md',
  ], true),
];

export const CASE_STUDY_PROOF_BASELINE: GTMProofCapability<CaseStudyCapabilityId>[] = [
  caseCap('before_state', 'Case study captures the starting problem, baseline signals, and constraints', 'Marketing', 'CONTRACT_READY', [
    'docs/CASE_STUDY_TEMPLATE.md',
  ], true),
  caseCap('after_state', 'Case study captures improved, unchanged, inconclusive, and next-action outcomes', 'Marketing', 'CONTRACT_READY', [
    'docs/CASE_STUDY_TEMPLATE.md',
  ], true),
  caseCap('metric_evidence', 'Metrics are backed by observed product events, not estimates or invented ROI', 'Product', 'CONTRACT_READY', [
    'docs/CASE_STUDY_TEMPLATE.md',
    'docs/CUSTOMER_PROOF_PACK.md',
    'docs/ACTIVATION_METRICS_SPEC.md',
  ], true),
  caseCap('customer_quote_or_attestation', 'Customer quote or approval is required before publishing the case study', 'Marketing', 'HUMAN_ATTESTATION_REQUIRED', [
    'docs/CASE_STUDY_TEMPLATE.md',
  ], true),
  caseCap('no_revenue_guarantee_boundary', 'Case study copy keeps no guaranteed revenue and no fake ROI boundaries explicit', 'Legal', 'CONTRACT_READY', [
    'docs/CUSTOMER_PROOF_PACK.md',
    'docs/CASE_STUDY_TEMPLATE.md',
  ], true),
  caseCap('privacy_approval', 'Customer identity, logo, and data disclosure require approval or anonymization', 'Legal', 'HUMAN_ATTESTATION_REQUIRED', [
    'docs/CASE_STUDY_TEMPLATE.md',
    'docs/LEGAL_APPROVAL_TRACKER.md',
  ], true),
  caseCap('case_study_template', 'Reusable case study structure exists for first and later proof assets', 'Marketing', 'CONTRACT_READY', [
    'docs/CASE_STUDY_TEMPLATE.md',
  ], true),
  caseCap('hosted_customer_proof_evidence', 'Hosted proof packet links the case study to real customer-safe event evidence', 'Product', 'HOSTED_PROOF_PENDING', [
    'docs/CUSTOMER_PROOF_PACK.md',
  ], true),
];

export function reviewPartnerProgramReadiness(
  capabilities: GTMProofCapability<PartnerProgramCapabilityId>[] = PARTNER_PROGRAM_BASELINE,
): GTMProofReadinessReview<PartnerProgramCapabilityId> {
  return reviewGTMProofReadiness(capabilities);
}

export function reviewCaseStudyProofReadiness(
  capabilities: GTMProofCapability<CaseStudyCapabilityId>[] = CASE_STUDY_PROOF_BASELINE,
): GTMProofReadinessReview<CaseStudyCapabilityId> {
  return reviewGTMProofReadiness(capabilities);
}

function reviewGTMProofReadiness<Id extends string>(
  capabilities: GTMProofCapability<Id>[],
): GTMProofReadinessReview<Id> {
  const readyCapabilities = capabilities.filter(isReady).map((capability) => capability.id);
  const gapCapabilities = capabilities.filter(isHostedGap).map((capability) => capability.id);
  const attestationCapabilities = capabilities.filter(isHumanAttestation).map((capability) => capability.id);
  const blockedCapabilities = capabilities.filter(isBlocked).map((capability) => capability.id);
  const publicClaimAllowed = capabilities
    .filter((capability) => capability.requiredForPublicClaim)
    .every((capability) => capability.status === 'READY' && capability.evidence.length > 0);

  return {
    decision: gtmDecision(blockedCapabilities, attestationCapabilities, publicClaimAllowed),
    publicClaimAllowed,
    readyCapabilities,
    gapCapabilities,
    attestationCapabilities,
    blockedCapabilities,
    actions: gtmActions(capabilities, blockedCapabilities, gapCapabilities, attestationCapabilities),
  };
}

function partnerCap(
  id: PartnerProgramCapabilityId,
  label: string,
  owner: GTMProofCapability<PartnerProgramCapabilityId>['owner'],
  status: GTMProofCapabilityStatus,
  evidence: string[],
  requiredForPublicClaim: boolean,
): GTMProofCapability<PartnerProgramCapabilityId> {
  return { id, label, owner, status, evidence, requiredForPublicClaim };
}

function caseCap(
  id: CaseStudyCapabilityId,
  label: string,
  owner: GTMProofCapability<CaseStudyCapabilityId>['owner'],
  status: GTMProofCapabilityStatus,
  evidence: string[],
  requiredForPublicClaim: boolean,
): GTMProofCapability<CaseStudyCapabilityId> {
  return { id, label, owner, status, evidence, requiredForPublicClaim };
}

function isReady<Id extends string>(capability: GTMProofCapability<Id>) {
  return ['READY', 'CONTRACT_READY'].includes(capability.status) && capability.evidence.length > 0;
}

function isHostedGap<Id extends string>(capability: GTMProofCapability<Id>) {
  return capability.status === 'HOSTED_PROOF_PENDING';
}

function isHumanAttestation<Id extends string>(capability: GTMProofCapability<Id>) {
  return capability.status === 'HUMAN_ATTESTATION_REQUIRED';
}

function isBlocked<Id extends string>(capability: GTMProofCapability<Id>) {
  return capability.status === 'MISSING_EVIDENCE' || capability.evidence.length === 0;
}

function gtmDecision<Id extends string>(
  blockedCapabilities: Id[],
  attestationCapabilities: Id[],
  publicClaimAllowed: boolean,
): GTMProofReadinessReview<Id>['decision'] {
  if (blockedCapabilities.length > 0) return 'DO_NOT_CLAIM_READY';
  if (attestationCapabilities.length > 0) return 'HUMAN_ATTESTATION_REQUIRED';
  return publicClaimAllowed ? 'PUBLIC_CLAIM_READY' : 'CONTRACT_READY_WITH_HOSTED_GAPS';
}

function gtmActions<Id extends string>(
  capabilities: GTMProofCapability<Id>[],
  blockedCapabilities: Id[],
  gapCapabilities: Id[],
  attestationCapabilities: Id[],
): GTMProofReadinessReview<Id>['actions'] {
  const actions: GTMProofReadinessReview<Id>['actions'] = [];
  for (const capability of capabilities) {
    if (blockedCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Attach missing GTM proof evidence for ${capability.label}.`,
        evidenceRequired: 'Document, test, hosted proof packet, approval record, or customer-safe evidence link.',
      });
      continue;
    }
    if (attestationCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Collect human approval before publishing ${capability.label}.`,
        evidenceRequired: 'Named approver, date, approval scope, and anonymization/public-use decision.',
      });
      continue;
    }
    if (gapCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Keep ${capability.label} gap-labeled until hosted evidence exists.`,
        evidenceRequired: 'Customer-safe hosted evidence packet, event references, and support/pilot owner notes.',
      });
    }
  }
  return actions;
}
