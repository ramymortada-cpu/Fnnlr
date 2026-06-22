/**
 * Recommendation outcome engine — PURE. Decides whether an applied
 * recommendation actually produced a result, from observed signals only. No
 * fabricated success: `worked` needs real evidence (task done + movement, draft
 * sent + reply, opportunity captured, attribution pointing at the object the
 * recommendation created). Thin evidence → awaiting_evidence, never an overclaim.
 */

export type OutcomeStatus = 'awaiting_evidence' | 'early_signal' | 'worked' | 'no_result' | 'failed' | 'dismissed' | 'inconclusive';
export type Confidence = 'low' | 'medium' | 'high';

export interface RecSignals {
  recommendationType: string;
  appliedHoursAgo: number | null;          // null = not applied yet
  dismissed?: boolean;
  // linked object state
  taskCompleted?: boolean;
  taskOverdue?: boolean;
  draftMarkedSent?: boolean;
  inboundAfterApply?: boolean;
  // opportunity / lead movement
  opportunityCaptured?: boolean;
  leadProgressed?: boolean;
  leadLost?: boolean;
  paymentConfirmed?: boolean;
  accessDelivered?: boolean;
  proofReviewed?: boolean;
  // repair / playbook
  repairImproved?: boolean;
  applicationImproved?: boolean;
  // attribution linkage
  attributionPointsHere?: boolean;
  attributionStrength?: 'none' | 'weak' | 'medium' | 'strong';
  // value
  capturedValue?: number | null;
  currency?: string | null;
}

export interface RecOutcomeResult {
  status: OutcomeStatus;
  attributedToRecommendation: boolean;
  capturedValue: number | null;
  currency: string | null;
  confidence: Confidence;
  evidence: Record<string, unknown>;
  interpretation: string;
  recommendedNextAction: string | null;
}

/** Minimum hours before we judge a recommendation that's shown no signal yet. */
const MIN_HOURS: Record<string, number> = {
  draft_whatsapp_reply: 24, draft_payment_reminder: 24, create_task: 24, review_proof: 24,
  deliver_access: 12, build_repair_plan: 24, apply_playbook: 48, update_page_cta: 48,
  improve_payment_instructions: 48, mark_needs_followup: 48,
};

function worked(value: number | null, currency: string | null, attributed: boolean, strength: string | undefined, evidence: Record<string, unknown>, interpretation: string): RecOutcomeResult {
  const confidence: Confidence = attributed && strength === 'strong' ? 'high' : attributed ? 'medium' : 'medium';
  return { status: 'worked', attributedToRecommendation: attributed, capturedValue: value ?? null, currency: value != null ? (currency ?? 'EGP') : null, confidence, evidence, interpretation, recommendedNextAction: 'كرّر نفس نوع الإجراء للفرص المشابهة.' };
}

export function interpretRecommendationOutcome(s: RecSignals): RecOutcomeResult {
  if (s.dismissed) return { status: 'dismissed', attributedToRecommendation: false, capturedValue: null, currency: null, confidence: 'low', evidence: {}, interpretation: 'التوصية اتجاهلت.', recommendedNextAction: null };
  if (s.appliedHoursAgo == null) return { status: 'awaiting_evidence', attributedToRecommendation: false, capturedValue: null, currency: null, confidence: 'low', evidence: {}, interpretation: 'التوصية لسه ماتطبّقتش.', recommendedNextAction: null };

  const t = s.recommendationType;
  const minH = MIN_HOURS[t] ?? 24;
  const windowPassed = s.appliedHoursAgo >= minH;
  const attributed = !!s.attributionPointsHere;

  // ---- failed: action taken but lead lost ----
  if (s.leadLost) return { status: 'failed', attributedToRecommendation: false, capturedValue: null, currency: null, confidence: 'medium', evidence: { leadLost: true }, interpretation: 'اتعمل الإجراء بس العميل اتفقد.', recommendedNextAction: 'جرّب مقاربة مختلفة للفرص المشابهة.' };

  // ---- worked rules by type (evidence-based) ----
  if (t === 'create_task' || t === 'mark_needs_followup') {
    if (s.opportunityCaptured || (s.taskCompleted && s.leadProgressed) || (attributed && s.taskCompleted)) {
      return worked(s.capturedValue ?? null, s.currency ?? null, attributed, s.attributionStrength, { taskCompleted: !!s.taskCompleted, leadProgressed: !!s.leadProgressed, opportunityCaptured: !!s.opportunityCaptured }, 'المهمة اتعملت والعميل اتحرّك للأمام.');
    }
    if (s.taskCompleted && !s.leadProgressed && windowPassed) return noResult('المهمة اتعملت بس مفيش حركة بعد الوقت الكافي.');
  }
  if (t === 'draft_whatsapp_reply' || t === 'draft_payment_reminder') {
    if (!s.draftMarkedSent) return awaiting('المسودّة لسه ماتبعتتش (مفيش إرسال تلقائي).');
    if (s.opportunityCaptured || s.paymentConfirmed || s.leadProgressed || s.inboundAfterApply || attributed) {
      return worked(s.capturedValue ?? null, s.currency ?? null, attributed, s.attributionStrength, { draftMarkedSent: true, inboundAfterApply: !!s.inboundAfterApply, leadProgressed: !!s.leadProgressed }, 'الرسالة اتبعتت وفيه تقدّم بعدها.');
    }
    if (windowPassed) return noResult('الرسالة اتبعتت بس مفيش تفاعل بعد الوقت الكافي.');
  }
  if (t === 'review_proof') {
    if (s.proofReviewed || s.paymentConfirmed || s.accessDelivered || attributed) return worked(s.capturedValue ?? null, s.currency ?? null, attributed, s.attributionStrength, { proofReviewed: !!s.proofReviewed }, 'الإثبات اتراجع والدفع اتأكّد.');
  }
  if (t === 'deliver_access') {
    if (s.accessDelivered || attributed) return worked(s.capturedValue ?? null, s.currency ?? null, attributed, s.attributionStrength, { accessDelivered: true }, 'الوصول اتسلّم.');
  }
  if (t === 'build_repair_plan') {
    if (s.repairImproved || attributed) return worked(null, null, attributed, s.attributionStrength, { repairImproved: !!s.repairImproved }, 'الإصلاح اتطبّق وظهر تحسّن.');
  }
  if (t === 'apply_playbook') {
    if (s.applicationImproved || attributed) return worked(null, null, attributed, s.attributionStrength, { applicationImproved: !!s.applicationImproved }, 'التطبيق اتعمل وظهر تحسّن.');
  }
  if (t === 'update_page_cta' || t === 'improve_payment_instructions') {
    if (s.leadProgressed || s.opportunityCaptured || attributed) return worked(s.capturedValue ?? null, s.currency ?? null, attributed, s.attributionStrength, { leadProgressed: !!s.leadProgressed }, 'فيه تحسّن بعد التعديل.');
  }

  // ---- early signal: some movement but not yet a clear result, within window ----
  if (!windowPassed && (s.taskCompleted || s.draftMarkedSent || s.inboundAfterApply || s.leadProgressed)) {
    return { status: 'early_signal', attributedToRecommendation: attributed, capturedValue: null, currency: null, confidence: 'low', evidence: { earlyMovement: true }, interpretation: 'فيه حركة مبكرة — مستنيين نتيجة أوضح.', recommendedNextAction: 'استنّى نهاية النافذة قبل الحكم.' };
  }

  // ---- no result: window passed, nothing moved ----
  if (windowPassed) return noResult('فات الوقت الكافي من غير نتيجة واضحة.');

  return awaiting('لسه بدري على الحكم — مفيش دليل كفاية.');
}

function awaiting(interpretation: string): RecOutcomeResult {
  return { status: 'awaiting_evidence', attributedToRecommendation: false, capturedValue: null, currency: null, confidence: 'low', evidence: {}, interpretation, recommendedNextAction: null };
}
function noResult(interpretation: string): RecOutcomeResult {
  return { status: 'no_result', attributedToRecommendation: false, capturedValue: null, currency: null, confidence: 'medium', evidence: {}, interpretation, recommendedNextAction: 'جرّب نوع إجراء مختلف للفرص المشابهة.' };
}

// ============================================================================
// Learning aggregation by recommendation type
// ============================================================================

export interface RecLearningRecord { recommendationType: string; status: string; capturedValue?: number | null; timeToResultMinutes?: number | null; sourceId?: string | null; }
export interface RecTypeLearning {
  recommendationType: string;
  recommended: number; applied: number; worked: number; noResult: number; dismissed: number; awaiting: number;
  decided: number;                 // worked + no_result + failed
  workRate: number | null;
  knownValueCaptured: number | null;
  avgTimeToResultMinutes: number | null;
  confidence: Confidence;
  note: string;
  limited: boolean;
}

export function aggregateRecLearning(records: RecLearningRecord[]): RecTypeLearning[] {
  // defense-in-depth: one record per source (latest wins)
  const bySource = new Map<string, RecLearningRecord>(); const pass: RecLearningRecord[] = [];
  for (const r of records) { if (r.sourceId) bySource.set(r.sourceId, r); else pass.push(r); }
  records = [...pass, ...bySource.values()];
  const byType = new Map<string, RecLearningRecord[]>();
  for (const r of records) { const k = r.recommendationType; if (!byType.has(k)) byType.set(k, []); byType.get(k)!.push(r); }
  const out: RecTypeLearning[] = [];
  for (const [type, recs] of byType) {
    const worked = recs.filter((r) => r.status === 'worked').length;
    const noResult = recs.filter((r) => r.status === 'no_result' || r.status === 'failed').length;
    const dismissed = recs.filter((r) => r.status === 'dismissed').length;
    const awaiting = recs.filter((r) => r.status === 'awaiting_evidence' || r.status === 'early_signal' || r.status === 'inconclusive').length;
    const decided = worked + noResult;
    const workRate = decided > 0 ? worked / decided : null;
    const times = recs.filter((r) => r.status === 'worked' && r.timeToResultMinutes != null).map((r) => r.timeToResultMinutes as number);
    const values = recs.filter((r) => r.status === 'worked' && r.capturedValue != null).map((r) => r.capturedValue as number);
    let confidence: Confidence = decided < 5 ? 'low' : decided <= 20 ? 'medium' : 'high';
    if (confidence === 'high' && awaiting > decided) confidence = 'medium';
    const limited = decided < 5;
    const note = limited ? 'بيانات نتائج التوصيات لسه محدودة.' : `توصيات مشابهة اشتغلت في ${worked} من ${decided} حالة مقيسة.`;
    out.push({
      recommendationType: type, recommended: recs.length, applied: recs.length - awaiting, worked, noResult, dismissed, awaiting, decided,
      workRate, knownValueCaptured: values.length ? values.reduce((a, b) => a + b, 0) : null,
      avgTimeToResultMinutes: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
      confidence, note, limited,
    });
  }
  return out.sort((a, b) => (b.workRate ?? 0) - (a.workRate ?? 0));
}

/** Scoring feedback: adjust a recommendation's score by its learned work-rate, bounded ±12, never lowers critical/high. */
export function applyRecLearningToScore(baseScore: number, urgency: string, learning: RecTypeLearning | undefined): { score: number; note: string | null } {
  if (!learning || learning.limited || learning.workRate == null) return { score: baseScore, note: learning?.limited ? 'بيانات نتائج التوصيات محدودة.' : null };
  const protectedUrgency = urgency === 'critical' || urgency === 'high';
  let delta = 0;
  if (learning.workRate >= 0.6) delta = +Math.min(12, Math.round(learning.workRate * 12));
  else if (learning.workRate <= 0.3 && !protectedUrgency) delta = -Math.min(12, Math.round((0.5 - learning.workRate) * 20));
  return { score: Math.max(0, Math.min(100, baseScore + delta)), note: learning.note };
}
