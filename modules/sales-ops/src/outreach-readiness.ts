export type OutreachCapabilityId =
  | 'icp_definition'
  | 'problem_opener'
  | 'proof_boundary'
  | 'demo_invite'
  | 'pilot_offer'
  | 'trust_follow_up'
  | 'opt_out_language'
  | 'source_tracking'
  | 'response_owner'
  | 'hosted_outreach_evidence';

export type OutreachCapabilityStatus =
  | 'READY'
  | 'CONTRACT_READY'
  | 'HOSTED_PROOF_PENDING'
  | 'COMPLIANCE_REVIEW_REQUIRED'
  | 'MISSING_EVIDENCE';

export type OutreachCapability = {
  id: OutreachCapabilityId;
  label: string;
  owner: 'Marketing' | 'Sales' | 'Support' | 'Legal';
  status: OutreachCapabilityStatus;
  evidence: string[];
  requiredForRepeatableOutreach: boolean;
};

export type OutreachMessage = {
  step: string;
  copy: string;
};

export type OutreachReadinessReview = {
  decision:
    | 'REPEATABLE_OUTREACH_READY'
    | 'CONTRACT_READY_WITH_GAPS'
    | 'COMPLIANCE_REVIEW_REQUIRED'
    | 'DO_NOT_SEND_OUTREACH';
  repeatableOutreachAllowed: boolean;
  readyCapabilities: OutreachCapabilityId[];
  gapCapabilities: OutreachCapabilityId[];
  complianceCapabilities: OutreachCapabilityId[];
  blockedCapabilities: OutreachCapabilityId[];
  unsafeClaims: Array<{ step: string; claim: string; copy: string }>;
  actions: Array<{
    owner: OutreachCapability['owner'];
    action: string;
    evidenceRequired: string;
  }>;
};

export const OUTREACH_READINESS_BASELINE: OutreachCapability[] = [
  outreachCap('icp_definition', 'First ICP is Arabic-first businesses where revenue workflows happen through WhatsApp and manual follow-up', 'Marketing', 'CONTRACT_READY', [
    'docs/ICP_OUTREACH_SEQUENCE.md',
    'modules/sales-ops/src/fit.ts',
  ], true),
  outreachCap('problem_opener', 'Problem opener names missed WhatsApp follow-up and invisible drop-offs without promising revenue', 'Marketing', 'CONTRACT_READY', [
    'docs/ICP_OUTREACH_SEQUENCE.md',
  ], true),
  outreachCap('proof_boundary', 'Proof opener resets no auto-send, no payment processing, and no guaranteed revenue', 'Sales', 'CONTRACT_READY', [
    'docs/ICP_OUTREACH_SEQUENCE.md',
    'docs/CUSTOMER_PROOF_PACK.md',
  ], true),
  outreachCap('demo_invite', 'Demo invite is scoped to workflow visibility, not guaranteed outcomes', 'Sales', 'CONTRACT_READY', [
    'docs/ICP_OUTREACH_SEQUENCE.md',
    'docs/FOUNDER_LED_DEMO_SCRIPT.md',
  ], true),
  outreachCap('pilot_offer', 'Pilot offer is scoped to assisted setup and first workflow launch', 'Sales', 'CONTRACT_READY', [
    'docs/ICP_OUTREACH_SEQUENCE.md',
  ], true),
  outreachCap('trust_follow_up', 'Follow-up links trust center and customer proof pack instead of unsupported claims', 'Sales', 'CONTRACT_READY', [
    'docs/ICP_OUTREACH_SEQUENCE.md',
    'docs/TRUST_CENTER_INDEX.md',
    'docs/CUSTOMER_PROOF_PACK.md',
  ], true),
  outreachCap('opt_out_language', 'Outreach includes unsubscribe/stop-contact language appropriate to the channel', 'Legal', 'COMPLIANCE_REVIEW_REQUIRED', [
    'docs/ICP_OUTREACH_SEQUENCE.md',
  ], true),
  outreachCap('source_tracking', 'Each sequence step has source/campaign tracking for learning and attribution', 'Marketing', 'HOSTED_PROOF_PENDING', [
    'docs/ICP_OUTREACH_SEQUENCE.md',
  ], true),
  outreachCap('response_owner', 'A named owner responds to replies and keeps no-auto-send boundaries intact', 'Support', 'CONTRACT_READY', [
    'docs/ICP_OUTREACH_SEQUENCE.md',
    'docs/SUPPORT_TRIAGE_TAXONOMY.md',
  ], true),
  outreachCap('hosted_outreach_evidence', 'Hosted outreach evidence proves real sends/replies without exposing personal data', 'Marketing', 'HOSTED_PROOF_PENDING', [
    'docs/ICP_OUTREACH_SEQUENCE.md',
  ], true),
];

const UNSAFE_OUTREACH_CLAIMS: Array<{ id: string; re: RegExp }> = [
  { id: 'guaranteed_revenue', re: /guarante(e|ed|es)\s+(revenue|sales|results?)|مضمون|ضمان\s+(مبيعات|ايراد|إيراد)/i },
  { id: 'auto_send', re: /auto[-\s]?send|send(s|ing)?\s+automatically|يبعت\s+تلقائ/i },
  { id: 'payment_processing', re: /process(es|ing)?\s+payments?|move(s|ing)?\s+money|يعالج\s+الدفع|بنقبض/i },
  { id: 'ga_approved_without_evidence', re: /GA\s+approved|production\s+approved|GateForge\s+approved/i },
];

export function reviewOutreachReadiness(
  capabilities: OutreachCapability[] = OUTREACH_READINESS_BASELINE,
  messages: OutreachMessage[] = [],
): OutreachReadinessReview {
  const unsafeClaims = findUnsafeOutreachClaims(messages);
  const readyCapabilities = capabilities.filter(isOutreachReady).map((capability) => capability.id);
  const gapCapabilities = capabilities.filter(isOutreachGap).map((capability) => capability.id);
  const complianceCapabilities = capabilities.filter(isComplianceReview).map((capability) => capability.id);
  const blockedCapabilities = capabilities.filter(isOutreachBlocked).map((capability) => capability.id);
  const repeatableOutreachAllowed =
    unsafeClaims.length === 0 &&
    capabilities
      .filter((capability) => capability.requiredForRepeatableOutreach)
      .every((capability) => capability.status === 'READY' && capability.evidence.length > 0);

  return {
    decision: outreachDecision(unsafeClaims, blockedCapabilities, complianceCapabilities, repeatableOutreachAllowed),
    repeatableOutreachAllowed,
    readyCapabilities,
    gapCapabilities,
    complianceCapabilities,
    blockedCapabilities,
    unsafeClaims,
    actions: outreachActions(capabilities, blockedCapabilities, gapCapabilities, complianceCapabilities, unsafeClaims),
  };
}

export function findUnsafeOutreachClaims(messages: OutreachMessage[]) {
  const findings: OutreachReadinessReview['unsafeClaims'] = [];
  for (const message of messages) {
    const negated = /\b(no|not|never|does\s+not|do\s+not|without|cannot|isn'?t)\b/i.test(message.copy) || /\bلا\b|مش|بدون|ليس|مفيش/.test(message.copy);
    if (negated) continue;
    for (const claim of UNSAFE_OUTREACH_CLAIMS) {
      if (claim.re.test(message.copy)) {
        findings.push({ step: message.step, claim: claim.id, copy: message.copy.slice(0, 160) });
      }
    }
  }
  return findings;
}

function outreachCap(
  id: OutreachCapabilityId,
  label: string,
  owner: OutreachCapability['owner'],
  status: OutreachCapabilityStatus,
  evidence: string[],
  requiredForRepeatableOutreach: boolean,
): OutreachCapability {
  return { id, label, owner, status, evidence, requiredForRepeatableOutreach };
}

function isOutreachReady(capability: OutreachCapability) {
  return ['READY', 'CONTRACT_READY'].includes(capability.status) && capability.evidence.length > 0;
}

function isOutreachGap(capability: OutreachCapability) {
  return capability.status === 'HOSTED_PROOF_PENDING';
}

function isComplianceReview(capability: OutreachCapability) {
  return capability.status === 'COMPLIANCE_REVIEW_REQUIRED';
}

function isOutreachBlocked(capability: OutreachCapability) {
  return capability.status === 'MISSING_EVIDENCE' || capability.evidence.length === 0;
}

function outreachDecision(
  unsafeClaims: OutreachReadinessReview['unsafeClaims'],
  blockedCapabilities: OutreachCapabilityId[],
  complianceCapabilities: OutreachCapabilityId[],
  repeatableOutreachAllowed: boolean,
): OutreachReadinessReview['decision'] {
  if (unsafeClaims.length > 0 || blockedCapabilities.length > 0) return 'DO_NOT_SEND_OUTREACH';
  if (complianceCapabilities.length > 0) return 'COMPLIANCE_REVIEW_REQUIRED';
  return repeatableOutreachAllowed ? 'REPEATABLE_OUTREACH_READY' : 'CONTRACT_READY_WITH_GAPS';
}

function outreachActions(
  capabilities: OutreachCapability[],
  blockedCapabilities: OutreachCapabilityId[],
  gapCapabilities: OutreachCapabilityId[],
  complianceCapabilities: OutreachCapabilityId[],
  unsafeClaims: OutreachReadinessReview['unsafeClaims'],
): OutreachReadinessReview['actions'] {
  const actions: OutreachReadinessReview['actions'] = unsafeClaims.map((claim) => ({
    owner: 'Legal',
    action: `Remove unsafe outreach claim "${claim.claim}" from ${claim.step}.`,
    evidenceRequired: 'Updated copy review showing no revenue guarantee, auto-send, payment-processing, or unsupported GA approval claim.',
  }));

  for (const capability of capabilities) {
    if (blockedCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Attach outreach evidence for ${capability.label}.`,
        evidenceRequired: 'Document section, approved copy, tracking plan, owner record, or hosted evidence link.',
      });
      continue;
    }
    if (complianceCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Complete compliance review for ${capability.label}.`,
        evidenceRequired: 'Approved opt-out language, channel policy note, review owner, and approval date.',
      });
      continue;
    }
    if (gapCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Keep ${capability.label} gap-labeled until hosted evidence exists.`,
        evidenceRequired: 'Source/campaign tracking evidence, reply log summary, and customer-safe hosted proof.',
      });
    }
  }
  return actions;
}
