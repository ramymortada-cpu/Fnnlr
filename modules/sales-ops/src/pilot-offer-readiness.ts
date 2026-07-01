export type PilotOfferCapabilityId =
  | 'target_icp'
  | 'fit_disqualification'
  | 'package_scope'
  | 'customer_responsibilities'
  | 'success_criteria'
  | 'no_guarantee_boundary'
  | 'handoff_owner_model'
  | 'pricing_and_limits_boundary'
  | 'hosted_pilot_evidence';

export type PilotOfferCapabilityStatus =
  | 'READY'
  | 'CONTRACT_READY'
  | 'HOSTED_PROOF_PENDING'
  | 'HUMAN_ATTESTATION_REQUIRED'
  | 'MISSING_EVIDENCE';

export type PilotOfferCapability = {
  id: PilotOfferCapabilityId;
  label: string;
  owner: 'Sales' | 'Product' | 'Support' | 'Legal';
  status: PilotOfferCapabilityStatus;
  evidence: string[];
  requiredForRepeatablePilot: boolean;
};

export type PilotOfferCopy = {
  section: string;
  copy: string;
};

export type PilotOfferReadinessReview = {
  decision:
    | 'REPEATABLE_PILOT_READY'
    | 'CONTRACT_READY_WITH_HOSTED_GAPS'
    | 'HUMAN_ATTESTATION_REQUIRED'
    | 'DO_NOT_OFFER_PILOT';
  repeatablePilotAllowed: boolean;
  readyCapabilities: PilotOfferCapabilityId[];
  gapCapabilities: PilotOfferCapabilityId[];
  attestationCapabilities: PilotOfferCapabilityId[];
  blockedCapabilities: PilotOfferCapabilityId[];
  unsafeClaims: Array<{ section: string; claim: string; copy: string }>;
  actions: Array<{
    owner: PilotOfferCapability['owner'];
    action: string;
    evidenceRequired: string;
  }>;
};

export const PILOT_OFFER_BASELINE: PilotOfferCapability[] = [
  pilotCap('target_icp', 'Pilot is offered only to Arabic-first WhatsApp/manual-payment businesses with a response owner', 'Sales', 'CONTRACT_READY', [
    'docs/PILOT_OFFER_BRIEF.md',
    'modules/sales-ops/src/fit.ts',
    'tests/sales-ops.test.ts',
  ], true),
  pilotCap('fit_disqualification', 'Auto-send, payment-processing, guaranteed-revenue, no-traffic, and no-responder expectations are disqualified or reset', 'Sales', 'CONTRACT_READY', [
    'modules/sales-ops/src/fit.ts',
    'modules/sales-ops/src/proposal.ts',
    'tests/sales-ops.test.ts',
  ], true),
  pilotCap('package_scope', 'Pilot scope is assisted setup, first workflow launch, first-week review, and evidence packet', 'Product', 'CONTRACT_READY', [
    'docs/PILOT_OFFER_BRIEF.md',
    'docs/COMMERCIAL_PACKAGING.md',
    'docs/PROPOSAL_TEMPLATE.md',
  ], true),
  pilotCap('customer_responsibilities', 'Customer must provide WhatsApp, offer, payment instructions, traffic source, response owner, and payment confirmation owner', 'Support', 'CONTRACT_READY', [
    'docs/PILOT_OFFER_BRIEF.md',
    'docs/PROPOSAL_TEMPLATE.md',
    'modules/sales-ops/src/proposal.ts',
  ], true),
  pilotCap('success_criteria', 'Pilot success is activation and operating evidence, not guaranteed revenue', 'Product', 'CONTRACT_READY', [
    'docs/PILOT_OFFER_BRIEF.md',
    'docs/PROPOSAL_TEMPLATE.md',
    'docs/CUSTOMER_PROOF_PACK.md',
  ], true),
  pilotCap('no_guarantee_boundary', 'Pilot copy states no auto-send, no payment processing, no guaranteed revenue, and no fake ROI', 'Legal', 'CONTRACT_READY', [
    'docs/PILOT_OFFER_BRIEF.md',
    'docs/COMMERCIAL_PACKAGING.md',
    'docs/PROPOSAL_TEMPLATE.md',
  ], true),
  pilotCap('handoff_owner_model', 'Pilot cannot start until setup, support, response, payment, and rollback owners are named', 'Support', 'CONTRACT_READY', [
    'modules/sales-ops/src/proposal.ts',
    'tests/sales-ops.test.ts',
    'docs/PILOT_OFFER_BRIEF.md',
  ], true),
  pilotCap('pricing_and_limits_boundary', 'Pilot offer references package limits and does not imply billing automation', 'Sales', 'CONTRACT_READY', [
    'docs/PILOT_OFFER_BRIEF.md',
    'docs/PRICING_AND_LIMITS_MATRIX.md',
    'docs/COMMERCIAL_PACKAGING.md',
  ], true),
  pilotCap('hosted_pilot_evidence', 'At least one hosted pilot has customer-safe activation, operating, and proof evidence attached', 'Sales', 'HOSTED_PROOF_PENDING', [
    'docs/PILOT_OFFER_BRIEF.md',
    'docs/CUSTOMER_PROOF_PACK.md',
  ], true),
];

const UNSAFE_PILOT_CLAIMS: Array<{ id: string; re: RegExp }> = [
  { id: 'guaranteed_revenue', re: /guarante(e|ed|es)\s+(revenue|sales|results?|roi)|مضمون|ضمان\s+(مبيعات|ايراد|إيراد)/i },
  { id: 'auto_send', re: /auto[-\s]?send|send(s|ing)?\s+automatically|يبعت\s+تلقائ/i },
  { id: 'payment_processing', re: /process(es|ing)?\s+payments?|move(s|ing)?\s+money|يعالج\s+الدفع|بنقبض/i },
  { id: 'self_serve_billing', re: /automatic\s+billing|self[-\s]?serve\s+billing|charge(s|d)?\s+automatically/i },
  { id: 'ga_approval', re: /GA\s+approved|production\s+approved|GateForge\s+approved/i },
];

export function reviewPilotOfferReadiness(
  capabilities: PilotOfferCapability[] = PILOT_OFFER_BASELINE,
  copy: PilotOfferCopy[] = [],
): PilotOfferReadinessReview {
  const unsafeClaims = findUnsafePilotClaims(copy);
  const readyCapabilities = capabilities.filter(isPilotReady).map((capability) => capability.id);
  const gapCapabilities = capabilities.filter(isPilotGap).map((capability) => capability.id);
  const attestationCapabilities = capabilities.filter(isPilotAttestation).map((capability) => capability.id);
  const blockedCapabilities = capabilities.filter(isPilotBlocked).map((capability) => capability.id);
  const repeatablePilotAllowed =
    unsafeClaims.length === 0 &&
    capabilities
      .filter((capability) => capability.requiredForRepeatablePilot)
      .every((capability) => capability.status === 'READY' && capability.evidence.length > 0);

  return {
    decision: pilotDecision(unsafeClaims, blockedCapabilities, attestationCapabilities, repeatablePilotAllowed),
    repeatablePilotAllowed,
    readyCapabilities,
    gapCapabilities,
    attestationCapabilities,
    blockedCapabilities,
    unsafeClaims,
    actions: pilotActions(capabilities, blockedCapabilities, gapCapabilities, attestationCapabilities, unsafeClaims),
  };
}

export function findUnsafePilotClaims(copy: PilotOfferCopy[]) {
  const findings: PilotOfferReadinessReview['unsafeClaims'] = [];
  for (const item of copy) {
    const negated = /\b(no|not|never|does\s+not|do\s+not|without|cannot|isn'?t|won'?t)\b/i.test(item.copy) || /\bلا\b|مش|بدون|ليس|مفيش/.test(item.copy);
    if (negated) continue;
    for (const claim of UNSAFE_PILOT_CLAIMS) {
      if (claim.re.test(item.copy)) findings.push({ section: item.section, claim: claim.id, copy: item.copy.slice(0, 160) });
    }
  }
  return findings;
}

function pilotCap(
  id: PilotOfferCapabilityId,
  label: string,
  owner: PilotOfferCapability['owner'],
  status: PilotOfferCapabilityStatus,
  evidence: string[],
  requiredForRepeatablePilot: boolean,
): PilotOfferCapability {
  return { id, label, owner, status, evidence, requiredForRepeatablePilot };
}

function isPilotReady(capability: PilotOfferCapability) {
  return ['READY', 'CONTRACT_READY'].includes(capability.status) && capability.evidence.length > 0;
}

function isPilotGap(capability: PilotOfferCapability) {
  return capability.status === 'HOSTED_PROOF_PENDING';
}

function isPilotAttestation(capability: PilotOfferCapability) {
  return capability.status === 'HUMAN_ATTESTATION_REQUIRED';
}

function isPilotBlocked(capability: PilotOfferCapability) {
  return capability.status === 'MISSING_EVIDENCE' || capability.evidence.length === 0;
}

function pilotDecision(
  unsafeClaims: PilotOfferReadinessReview['unsafeClaims'],
  blockedCapabilities: PilotOfferCapabilityId[],
  attestationCapabilities: PilotOfferCapabilityId[],
  repeatablePilotAllowed: boolean,
): PilotOfferReadinessReview['decision'] {
  if (unsafeClaims.length > 0 || blockedCapabilities.length > 0) return 'DO_NOT_OFFER_PILOT';
  if (attestationCapabilities.length > 0) return 'HUMAN_ATTESTATION_REQUIRED';
  return repeatablePilotAllowed ? 'REPEATABLE_PILOT_READY' : 'CONTRACT_READY_WITH_HOSTED_GAPS';
}

function pilotActions(
  capabilities: PilotOfferCapability[],
  blockedCapabilities: PilotOfferCapabilityId[],
  gapCapabilities: PilotOfferCapabilityId[],
  attestationCapabilities: PilotOfferCapabilityId[],
  unsafeClaims: PilotOfferReadinessReview['unsafeClaims'],
): PilotOfferReadinessReview['actions'] {
  const actions: PilotOfferReadinessReview['actions'] = unsafeClaims.map((claim) => ({
    owner: 'Legal',
    action: `Remove unsafe pilot offer claim "${claim.claim}" from ${claim.section}.`,
    evidenceRequired: 'Updated pilot copy with no guaranteed revenue, auto-send, payment-processing, automatic billing, or unsupported GA approval claim.',
  }));

  for (const capability of capabilities) {
    if (blockedCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Attach pilot offer evidence for ${capability.label}.`,
        evidenceRequired: 'Pilot brief, sales/proposal copy, owner map, product proof, or hosted evidence link.',
      });
      continue;
    }
    if (attestationCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Collect human approval before claiming ${capability.label}.`,
        evidenceRequired: 'Named approver, date, scope, and customer-safe approval evidence.',
      });
      continue;
    }
    if (gapCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Keep ${capability.label} gap-labeled until hosted pilot evidence exists.`,
        evidenceRequired: 'Customer-safe hosted pilot packet with activation, operating-room, support, and first-week proof.',
      });
    }
  }
  return actions;
}
