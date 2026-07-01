export type ProcurementAnswerStatus =
  | 'READY'
  | 'HOSTED_PROOF_PENDING'
  | 'HUMAN_ATTESTATION_REQUIRED'
  | 'ROADMAP'
  | 'NOT_APPLICABLE'
  | 'MISSING_EVIDENCE';

export type ProcurementQuestionId =
  | 'tenant_isolation'
  | 'secrets_encryption'
  | 'payment_processing'
  | 'whatsapp_auto_send'
  | 'dpa'
  | 'subprocessors'
  | 'restore_drill'
  | 'monitoring'
  | 'data_residency'
  | 'sso'
  | 'soc2';

export type ProcurementQuestion = {
  id: ProcurementQuestionId;
  question: string;
  answer: string;
  status: ProcurementAnswerStatus;
  evidence: string[];
  buyerSafe: boolean;
};

export type ProcurementReadinessReview = {
  decision: 'BUYER_SAFE_PACKET_READY' | 'BUYER_SAFE_WITH_GAPS' | 'DO_NOT_SEND_PACKET';
  buyerSafeAnswers: ProcurementQuestionId[];
  gapAnswers: ProcurementQuestionId[];
  unsafeAnswers: ProcurementQuestionId[];
  actions: Array<{
    owner: 'Engineering' | 'Founder/legal' | 'Sales' | 'Operator';
    action: string;
    evidenceRequired: string;
  }>;
};

export type ProcurementPacketRequirementId =
  | 'trust_center'
  | 'evidence_index'
  | 'customer_agreement'
  | 'commercial_packaging'
  | 'pricing_limits'
  | 'security_proof'
  | 'data_lifecycle'
  | 'backup_restore'
  | 'observability'
  | 'legal_tracker'
  | 'subprocessors'
  | 'data_residency'
  | 'sso_roadmap'
  | 'soc2_roadmap'
  | 'support_workflow'
  | 'hosted_gap_language'
  | 'human_attestation_language'
  | 'buyer_safe_commitments';

export type ProcurementChecklistReview = {
  decision: 'PROCUREMENT_CHECKLIST_READY' | 'PROCUREMENT_CHECKLIST_HAS_GAPS' | 'DO_NOT_SEND_PROCUREMENT_CHECKLIST';
  present: ProcurementPacketRequirementId[];
  missing: ProcurementPacketRequirementId[];
  unsafeClaims: string[];
  actions: Array<{
    owner: 'Engineering' | 'Founder/legal' | 'Sales' | 'Support';
    action: string;
    evidenceRequired: string;
  }>;
};

export const PROCUREMENT_BASELINE: ProcurementQuestion[] = [
  q('tenant_isolation', 'Is tenant data isolated?', 'DB-per-tenant architecture; hosted proof pending.', 'HOSTED_PROOF_PENDING', [
    'docs/TECHNICAL_ARCHITECTURE.md',
    'gateforge-audit/run-2026-06-23-1035/47_ga_unblock_status.md',
  ], true),
  q('secrets_encryption', 'Are secrets encrypted?', 'Production fails closed without required encryption keys.', 'READY', [
    'tests/production-safety.test.ts',
  ], true),
  q('payment_processing', 'Does fnnlr process payments?', 'No. GA v1 records payment state only and does not move money.', 'NOT_APPLICABLE', [
    'docs/COMMERCIAL_PACKAGING.md',
    'tests/payment.test.ts',
  ], true),
  q('whatsapp_auto_send', 'Does fnnlr auto-send WhatsApp?', 'No. Human approval/send remains required.', 'READY', [
    'tests/automation.test.ts',
    'tests/whatsapp.test.ts',
  ], true),
  q('dpa', 'Is there a DPA?', 'Human/legal approval is required before enterprise claim.', 'HUMAN_ATTESTATION_REQUIRED', [
    'docs/LEGAL_APPROVAL_TRACKER.md',
  ], true),
  q('subprocessors', 'Is there a subprocessor list?', 'Required before GA.', 'HUMAN_ATTESTATION_REQUIRED', [
    'docs/SUBPROCESSORS.md',
  ], true),
  q('restore_drill', 'Is there a restore drill?', 'Runbook exists; hosted proof pending.', 'HOSTED_PROOF_PENDING', [
    'docs/BACKUP_RESTORE_RUNBOOK.md',
  ], true),
  q('monitoring', 'Is there monitoring?', 'Runbook exists; provider proof pending.', 'HOSTED_PROOF_PENDING', [
    'docs/OBSERVABILITY_GA_RUNBOOK.md',
  ], true),
  q('data_residency', 'Can fnnlr guarantee regional data residency?', 'No unconditional GA v1 guarantee; enterprise commitments require provider-region evidence.', 'HUMAN_ATTESTATION_REQUIRED', [
    'docs/DATA_RESIDENCY_POSITION.md',
  ], true),
  q('sso', 'Is there SSO?', 'Roadmap; do not sell as ready.', 'ROADMAP', [
    'docs/SSO_OIDC_READINESS.md',
    'modules/enterprise/src/identity-readiness.ts',
  ], true),
  q('soc2', 'Is there SOC2?', 'Roadmap only; this is not a SOC2 claim.', 'ROADMAP', [
    'docs/SOC2_READINESS_OUTLINE.md',
  ], true),
];

export const PROCUREMENT_PACKET_REQUIREMENTS: Array<{
  id: ProcurementPacketRequirementId;
  requiredNeedles: string[];
  owner: ProcurementChecklistReview['actions'][number]['owner'];
}> = [
  packetReq('trust_center', ['TRUST_CENTER_INDEX.md'], 'Sales'),
  packetReq('evidence_index', ['EVIDENCE_INDEX.md'], 'Engineering'),
  packetReq('customer_agreement', ['CUSTOMER_AGREEMENT_DRAFT.md'], 'Founder/legal'),
  packetReq('commercial_packaging', ['COMMERCIAL_PACKAGING.md'], 'Sales'),
  packetReq('pricing_limits', ['PRICING_AND_LIMITS_MATRIX.md'], 'Sales'),
  packetReq('security_proof', ['SECURITY_TRUST_PROOF.md'], 'Engineering'),
  packetReq('data_lifecycle', ['DATA_LIFECYCLE.md'], 'Engineering'),
  packetReq('backup_restore', ['BACKUP_RESTORE_RUNBOOK.md'], 'Engineering'),
  packetReq('observability', ['OBSERVABILITY_GA_RUNBOOK.md'], 'Engineering'),
  packetReq('legal_tracker', ['LEGAL_APPROVAL_TRACKER.md'], 'Founder/legal'),
  packetReq('subprocessors', ['SUBPROCESSORS.md'], 'Founder/legal'),
  packetReq('data_residency', ['DATA_RESIDENCY_POSITION.md'], 'Founder/legal'),
  packetReq('sso_roadmap', ['SSO_OIDC_READINESS.md'], 'Engineering'),
  packetReq('soc2_roadmap', ['SOC2_READINESS_OUTLINE.md'], 'Engineering'),
  packetReq('support_workflow', ['SUPPORT_WORKFLOW.md'], 'Support'),
  packetReq('hosted_gap_language', ['HOSTED_PROOF_PENDING'], 'Engineering'),
  packetReq('human_attestation_language', ['HUMAN_ATTESTATION_REQUIRED'], 'Founder/legal'),
  packetReq('buyer_safe_commitments', [
    'does not process payments',
    'does not auto-send WhatsApp',
    'does not guarantee revenue',
  ], 'Sales'),
];

const UNSAFE_PROCUREMENT_CLAIMS: Array<{ id: string; re: RegExp }> = [
  { id: 'soc2_certified', re: /SOC\s*2\s+(certified|compliant|ready)/i },
  { id: 'unconditional_residency', re: /(guarantee|guaranteed)\s+(regional\s+)?data\s+residency/i },
  { id: 'enterprise_ready', re: /enterprise[-\s]?ready(?!.*(roadmap|gap|not|limited|pending|attestation))/i },
  { id: 'payment_processing_ready', re: /payment\s+processing\s+(is\s+)?ready/i },
  { id: 'auto_send_ready', re: /auto[-\s]?send\s+WhatsApp\s+(is\s+)?ready/i },
  { id: 'guaranteed_revenue', re: /guaranteed\s+revenue/i },
];

export function reviewProcurementReadiness(questions: ProcurementQuestion[] = PROCUREMENT_BASELINE): ProcurementReadinessReview {
  const unsafeAnswers = questions.filter((question) => !question.buyerSafe || question.status === 'MISSING_EVIDENCE' || question.evidence.length === 0).map((question) => question.id);
  const gapAnswers = questions.filter((question) =>
    ['HOSTED_PROOF_PENDING', 'HUMAN_ATTESTATION_REQUIRED', 'ROADMAP'].includes(question.status),
  ).map((question) => question.id);
  const buyerSafeAnswers = questions.filter((question) => !unsafeAnswers.includes(question.id)).map((question) => question.id);

  return {
    decision: procurementDecision(unsafeAnswers, gapAnswers),
    buyerSafeAnswers,
    gapAnswers,
    unsafeAnswers,
    actions: procurementActions(questions, unsafeAnswers, gapAnswers),
  };
}

export function reviewProcurementChecklist(markdown: string): ProcurementChecklistReview {
  const present: ProcurementPacketRequirementId[] = [];
  const missing: ProcurementPacketRequirementId[] = [];
  const unsafeClaims = findUnsafeProcurementClaims(markdown);

  for (const requirement of PROCUREMENT_PACKET_REQUIREMENTS) {
    const ok = requirement.requiredNeedles.every((needle) => markdown.includes(needle));
    if (ok) present.push(requirement.id);
    else missing.push(requirement.id);
  }

  return {
    decision: procurementChecklistDecision(missing, unsafeClaims),
    present,
    missing,
    unsafeClaims,
    actions: procurementChecklistActions(missing, unsafeClaims),
  };
}

export function findUnsafeProcurementClaims(markdown: string) {
  const findings: string[] = [];
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('| Question |') || line.startsWith('| ---')) continue;
    const negated = /\b(no|not|never|does\s+not|do\s+not|without|cannot|pending|gap|roadmap|limited|until|requires|human\/legal)\b/i.test(line);
    if (negated) continue;
    for (const claim of UNSAFE_PROCUREMENT_CLAIMS) {
      if (claim.re.test(line)) findings.push(claim.id);
    }
  }
  return [...new Set(findings)];
}

function q(
  id: ProcurementQuestionId,
  question: string,
  answer: string,
  status: ProcurementAnswerStatus,
  evidence: string[],
  buyerSafe: boolean,
): ProcurementQuestion {
  return { id, question, answer, status, evidence, buyerSafe };
}

function packetReq(
  id: ProcurementPacketRequirementId,
  requiredNeedles: string[],
  owner: ProcurementChecklistReview['actions'][number]['owner'],
) {
  return { id, requiredNeedles, owner };
}

function procurementDecision(
  unsafeAnswers: ProcurementQuestionId[],
  gapAnswers: ProcurementQuestionId[],
): ProcurementReadinessReview['decision'] {
  if (unsafeAnswers.length > 0) return 'DO_NOT_SEND_PACKET';
  if (gapAnswers.length > 0) return 'BUYER_SAFE_WITH_GAPS';
  return 'BUYER_SAFE_PACKET_READY';
}

function procurementActions(
  questions: ProcurementQuestion[],
  unsafeAnswers: ProcurementQuestionId[],
  gapAnswers: ProcurementQuestionId[],
): ProcurementReadinessReview['actions'] {
  const actions: ProcurementReadinessReview['actions'] = [];
  for (const question of questions) {
    if (unsafeAnswers.includes(question.id)) {
      actions.push({
        owner: ownerFor(question.id),
        action: `Fix unsafe procurement answer: ${question.question}`,
        evidenceRequired: 'Buyer-safe wording and evidence file/test before the packet is sent.',
      });
      continue;
    }
    if (gapAnswers.includes(question.id)) {
      actions.push({
        owner: ownerFor(question.id),
        action: `Keep procurement answer gap-labeled: ${question.question}`,
        evidenceRequired: 'Explicit hosted proof, roadmap label, or human attestation reference.',
      });
    }
  }
  return actions;
}

function ownerFor(id: ProcurementQuestionId): ProcurementReadinessReview['actions'][number]['owner'] {
  if (['dpa', 'subprocessors', 'data_residency'].includes(id)) return 'Founder/legal';
  if (['tenant_isolation', 'restore_drill', 'monitoring', 'secrets_encryption'].includes(id)) return 'Engineering';
  if (['sso', 'soc2'].includes(id)) return 'Engineering';
  if (id === 'payment_processing' || id === 'whatsapp_auto_send') return 'Sales';
  return 'Operator';
}

function procurementChecklistDecision(
  missing: ProcurementPacketRequirementId[],
  unsafeClaims: string[],
): ProcurementChecklistReview['decision'] {
  if (unsafeClaims.length > 0) return 'DO_NOT_SEND_PROCUREMENT_CHECKLIST';
  return missing.length > 0 ? 'PROCUREMENT_CHECKLIST_HAS_GAPS' : 'PROCUREMENT_CHECKLIST_READY';
}

function procurementChecklistActions(
  missing: ProcurementPacketRequirementId[],
  unsafeClaims: string[],
): ProcurementChecklistReview['actions'] {
  const actions: ProcurementChecklistReview['actions'] = unsafeClaims.map((claim) => ({
    owner: 'Sales',
    action: `Remove unsafe procurement checklist claim "${claim}".`,
    evidenceRequired: 'Replace with hosted-gap, roadmap, human-attestation, or evidence-backed wording.',
  }));

  for (const missingId of missing) {
    const requirement = PROCUREMENT_PACKET_REQUIREMENTS.find((candidate) => candidate.id === missingId);
    actions.push({
      owner: requirement?.owner ?? 'Sales',
      action: `Add missing procurement packet coverage for ${missingId}.`,
      evidenceRequired: requirement?.requiredNeedles.join(', ') ?? 'Required procurement evidence link.',
    });
  }
  return actions;
}
