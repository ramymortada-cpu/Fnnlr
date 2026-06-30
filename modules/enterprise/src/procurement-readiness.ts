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
