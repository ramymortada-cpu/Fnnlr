/**
 * Action recommendation engine — PURE. Turns a live opportunity + attribution /
 * outcome learning into the best next action, with an explained, rule-based
 * score and HONEST confidence. No recommendation without context: when learning
 * is thin, it falls back to a stage/urgency heuristic and SAYS so. No black box.
 */

export type RecommendationType =
  | 'create_task' | 'draft_whatsapp_reply' | 'draft_payment_reminder' | 'review_proof' | 'deliver_access'
  | 'build_repair_plan' | 'apply_playbook' | 'update_page_cta' | 'improve_payment_instructions'
  | 'mark_needs_followup' | 'open_filtered_view';

export type Confidence = 'low' | 'medium' | 'high';
export type Urgency = 'low' | 'medium' | 'high' | 'critical';
export type LearningSource = 'attribution' | 'opportunity_outcomes' | 'repair_outcomes' | 'playbook_outcomes' | 'heuristic' | 'mixed';

/** Attribution learning for an action type (subset of Sprint 27 ActionLearning). */
export interface ActionLearningLite { attributedActionType: string; captureRate: number; capturedCount: number; attempts: number; limited: boolean; }

export interface OppForRec {
  opportunityId: string;
  opportunityType: string;
  leadId: string | null;
  funnelId: string | null;
  priorityScore: number;
  urgency: Urgency;
  estimatedValue: number | null;
  valueCurrency: string | null;
  serviceWindow?: 'open' | 'expiring_soon' | 'closed' | 'unknown';
  hasOpenTask?: boolean;             // a relevant task already exists (dedup signal)
  hasRepairPlan?: boolean;
}

export interface RecommendationCandidate {
  recommendationType: RecommendationType;
  dedupeKey: string;
  opportunityId: string;
  leadId: string | null;
  funnelId: string | null;
  title: string;
  explanation: string;               // includes "ranked high because: ..."
  evidence: Record<string, unknown>;
  confidence: Confidence;
  learningSource: LearningSource;
  priorityScore: number;
  urgency: Urgency;
  expectedEffect: string | null;
  requiresApproval: boolean;         // false only for non-mutating opens
  proposedAction: Record<string, unknown>;
}

// the expected attribution action type → recommendation type mapping
const ATTR_TO_REC: Record<string, RecommendationType> = {
  payment_reminder_drafted: 'draft_payment_reminder',
  whatsapp_reply_marked_sent: 'draft_whatsapp_reply',
  proof_review_task: 'review_proof',
  access_delivery_task: 'deliver_access',
  task_completed: 'create_task',
  repair_plan_applied: 'build_repair_plan',
  playbook_application_applied: 'apply_playbook',
};

/** The default (fallback) recommendation per opportunity type when learning is thin. */
const DEFAULT_REC: Record<string, { type: RecommendationType; title: string; effect: string }> = {
  waiting_payment_recovery: { type: 'draft_payment_reminder', title: 'اكتب تذكير دفع لطيف', effect: 'تقريب العميل من إكمال الدفع' },
  proof_review: { type: 'review_proof', title: 'اعمل مهمة مراجعة إثبات', effect: 'تأكيد الدفع وتحريك العميل' },
  access_delivery: { type: 'deliver_access', title: 'اعمل مهمة تسليم', effect: 'تسليم اللي العميل دفع عشانه' },
  whatsapp_first_reply: { type: 'draft_whatsapp_reply', title: 'اكتب أول ردّ', effect: 'حجز الاهتمام قبل ما يبرد' },
  followup_reactivation: { type: 'create_task', title: 'اعمل مهمة متابعة', effect: 'إعادة تنشيط العميل' },
  leak_repair: { type: 'build_repair_plan', title: 'ابنِ خطة إصلاح', effect: 'إصلاح التسريب المؤثّر على الإيراد' },
  playbook_application: { type: 'apply_playbook', title: 'ابنِ خطة تطبيق playbook', effect: 'نقل ما نجح لقمع محتاجه' },
};

const URG_RANK: Record<Urgency, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/** Build the best recommendation for a single opportunity. */
export function recommendForOpportunity(opp: OppForRec, learningByAction: Record<string, ActionLearningLite>): RecommendationCandidate | null {
  const def = DEFAULT_REC[opp.opportunityType];
  if (!def) return null;

  // find attribution learning that maps to this opportunity's expected action
  let recType = def.type;
  let learning: ActionLearningLite | undefined;
  for (const [attrAction, rt] of Object.entries(ATTR_TO_REC)) {
    if (rt === def.type) { learning = learningByAction[attrAction]; break; }
  }

  // ---- confidence: honest about learning ----
  let confidence: Confidence = 'low';
  let learningSource: LearningSource = 'heuristic';
  const reasons: string[] = [`فرصة ${opp.opportunityType}`];
  if (opp.estimatedValue != null) reasons.push('قيمة معروفة');

  if (learning && !learning.limited) {
    learningSource = 'attribution';
    if (learning.captureRate >= 0.5) { confidence = 'high'; reasons.push(`إجراءات مشابهة حصّلت ${learning.capturedCount}/${learning.attempts}`); }
    else if (learning.captureRate >= 0.3) { confidence = 'medium'; reasons.push(`ارتباط متوسط ${learning.capturedCount}/${learning.attempts}`); }
    else { confidence = 'low'; reasons.push(`ارتباط ضعيف تاريخيًا ${learning.capturedCount}/${learning.attempts}`); }
  } else {
    reasons.push('بيانات التعلّم محدودة — توصية افتراضية مبنية على المرحلة والإلحاح');
  }

  // access_delivery is high urgency even without learning
  const urgency = opp.urgency;
  if (opp.serviceWindow === 'expiring_soon') reasons.push('نافذة الخدمة بتقفل قريّب');
  else if (opp.serviceWindow === 'open') reasons.push('نافذة الخدمة مفتوحة');

  // ---- score: transparent, additive ----
  let score = opp.priorityScore;                                   // start from the opportunity's priority
  if (learning && !learning.limited && learning.captureRate >= 0.5) score += 8;
  if (opp.estimatedValue != null) score += 4;
  if (opp.serviceWindow === 'expiring_soon') score += 6;
  score = Math.max(0, Math.min(100, score));

  const requiresApproval = recType !== 'open_filtered_view';       // every mutating rec is approval-gated
  const explanation = `أفضل إجراء: ${def.title}. الترتيب عالي علشان: ${reasons.join('، ')}.`;

  return {
    recommendationType: recType,
    dedupeKey: `${recType}:${opp.opportunityId}`,
    opportunityId: opp.opportunityId, leadId: opp.leadId, funnelId: opp.funnelId,
    title: def.title, explanation,
    evidence: { reasons, captureRate: learning && !learning.limited ? learning.captureRate : null, opportunityPriority: opp.priorityScore },
    confidence, learningSource, priorityScore: score, urgency,
    expectedEffect: def.effect,
    requiresApproval,
    proposedAction: { type: recType, leadId: opp.leadId, opportunityId: opp.opportunityId },
  };
}

/** Rank recommendations across opportunities. */
export function rankRecommendations(opps: OppForRec[], learningByAction: Record<string, ActionLearningLite>): RecommendationCandidate[] {
  const out: RecommendationCandidate[] = [];
  for (const o of opps) {
    const rec = recommendForOpportunity(o, learningByAction);
    if (rec) out.push(rec);
  }
  return out.sort((a, b) => (URG_RANK[b.urgency] - URG_RANK[a.urgency]) || (b.priorityScore - a.priorityScore));
}
