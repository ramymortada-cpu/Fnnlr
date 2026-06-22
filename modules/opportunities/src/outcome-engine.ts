/**
 * Opportunity outcome engine — PURE. Decides whether a detected opportunity was
 * captured, missed, expired, or is still awaiting evidence — from observed
 * signals only. No fabricated capture: every captured verdict needs real
 * evidence (payment confirmed, access delivered, stage progressed, task done,
 * repair/application applied) or an explicit user confirmation upstream.
 */

export type OutcomeStatus = 'awaiting_evidence' | 'captured' | 'missed' | 'expired' | 'inconclusive';
export type Confidence = 'low' | 'medium' | 'high';

/** Observed signals gathered for one opportunity after detection. */
export interface OutcomeSignals {
  opportunityType: string;
  detectedHoursAgo: number;
  acted: boolean;                 // a task was created / user marked in progress
  // lead/payment signals
  leadStage?: string | null;
  leadLost?: boolean;
  paymentConfirmed?: boolean;
  accessDelivered?: boolean;
  paymentFailed?: boolean;
  proofReviewed?: boolean;
  // whatsapp / followup progression
  contactedProgressed?: boolean;  // moved from whatsapp_clicked → contacted+
  inboundAfterAction?: boolean;
  taskCompleted?: boolean;
  stageProgressed?: boolean;
  serviceWindowClosed?: boolean;
  // leak / playbook
  repairApplied?: boolean;
  repairImproved?: boolean;       // early_signal/improved
  applicationApplied?: boolean;
  applicationImproved?: boolean;
  // value
  amount?: number | null;
  currency?: string | null;
}

export interface OutcomeResult {
  status: OutcomeStatus;
  capturedValue: number | null;
  valueCurrency: string | null;
  evidence: Record<string, unknown>;
  confidence: Confidence;
  interpretation: string;
}

/** Per-type age threshold (hours) after which an un-acted opportunity expires. */
const EXPIRE_HOURS: Record<string, number> = {
  whatsapp_first_reply: 48, waiting_payment_recovery: 120, proof_review: 96, access_delivery: 72,
  followup_reactivation: 168, leak_repair: 240, playbook_application: 240,
};

function captured(value: number | null, currency: string | null, evidence: Record<string, unknown>, interpretation: string): OutcomeResult {
  return { status: 'captured', capturedValue: value ?? null, valueCurrency: value != null ? (currency ?? 'EGP') : null, evidence, confidence: 'high', interpretation };
}
function awaiting(interpretation: string): OutcomeResult {
  return { status: 'awaiting_evidence', capturedValue: null, valueCurrency: null, evidence: {}, confidence: 'low', interpretation };
}

export function interpretOpportunityOutcome(s: OutcomeSignals): OutcomeResult {
  const t = s.opportunityType;
  const expireH = EXPIRE_HOURS[t] ?? 168;

  // ---- captured rules (evidence-based) by type ----
  if (t === 'waiting_payment_recovery' || t === 'proof_review') {
    if (s.paymentConfirmed || s.accessDelivered || s.leadStage === 'paid' || s.leadStage === 'access_delivered') {
      return captured(s.amount ?? null, s.currency ?? null, { paymentConfirmed: !!s.paymentConfirmed, accessDelivered: !!s.accessDelivered, stage: s.leadStage }, 'الدفع اتأكّد/اتسلّم — الفرصة اتحصّلت.');
    }
    if (t === 'proof_review' && s.proofReviewed) return captured(s.amount ?? null, s.currency ?? null, { proofReviewed: true }, 'الإثبات اتراجع — الفرصة اتقدّمت.');
  }
  if (t === 'access_delivery') {
    if (s.accessDelivered || s.leadStage === 'access_delivered') return captured(s.amount ?? null, s.currency ?? null, { accessDelivered: true }, 'الوصول اتسلّم — الفرصة اتحصّلت.');
  }
  if (t === 'whatsapp_first_reply') {
    if (s.contactedProgressed || s.inboundAfterAction || (s.leadStage && !['whatsapp_clicked', 'new', 'lost'].includes(s.leadStage))) {
      return { status: 'captured', capturedValue: null, valueCurrency: null, evidence: { contactedProgressed: !!s.contactedProgressed, inboundAfterAction: !!s.inboundAfterAction, stage: s.leadStage }, confidence: 'high', interpretation: 'العميل اتنقل للتواصل بعد أول ردّ — تقدّم اتحصّل (مش بالضرورة إيراد).' };
    }
  }
  if (t === 'followup_reactivation') {
    if (s.stageProgressed || s.taskCompleted || s.inboundAfterAction) {
      return { status: 'captured', capturedValue: null, valueCurrency: null, evidence: { stageProgressed: !!s.stageProgressed, taskCompleted: !!s.taskCompleted }, confidence: 'high', interpretation: 'العميل اتحرّك للأمام بعد المتابعة — تنشيط اتحصّل.' };
    }
  }
  if (t === 'leak_repair') {
    if (s.repairImproved) return { status: 'captured', capturedValue: null, valueCurrency: null, evidence: { repairImproved: true }, confidence: 'high', interpretation: 'الإصلاح اتطبّق وظهر تحسّن — الفرصة اتحصّلت.' };
    if (s.repairApplied) return { status: 'inconclusive', capturedValue: null, valueCurrency: null, evidence: { repairApplied: true }, confidence: 'low', interpretation: 'الإصلاح اتطبّق — مستنيين قياس الأثر.' };
  }
  if (t === 'playbook_application') {
    if (s.applicationImproved) return { status: 'captured', capturedValue: null, valueCurrency: null, evidence: { applicationImproved: true }, confidence: 'high', interpretation: 'التطبيق اتعمل وظهر تحسّن — الفرصة اتحصّلت.' };
    if (s.applicationApplied) return { status: 'inconclusive', capturedValue: null, valueCurrency: null, evidence: { applicationApplied: true }, confidence: 'low', interpretation: 'التطبيق اتعمل — مستنيين قياس الأثر.' };
  }

  // ---- missed: action taken but the lead/payment went the wrong way ----
  if (s.acted && (s.leadLost || s.paymentFailed)) {
    return { status: 'missed', capturedValue: null, valueCurrency: null, evidence: { leadLost: !!s.leadLost, paymentFailed: !!s.paymentFailed }, confidence: 'medium', interpretation: 'اتعمل إجراء بس العميل اتفقد/الدفع فشل — الفرصة ضاعت.' };
  }

  // ---- expired: no action past threshold, or window closed / lead lost / payment failed ----
  if (!s.acted && (s.detectedHoursAgo >= expireH || s.leadLost || s.paymentFailed || (t === 'whatsapp_first_reply' && s.serviceWindowClosed))) {
    const reason = s.leadLost ? 'العميل اتفقد' : s.paymentFailed ? 'الدفع فشل' : s.serviceWindowClosed ? 'نافذة الخدمة قفلت' : 'فات الوقت من غير إجراء';
    return { status: 'expired', capturedValue: null, valueCurrency: null, evidence: { reason, detectedHoursAgo: Math.round(s.detectedHoursAgo) }, confidence: 'medium', interpretation: `الفرصة انتهت: ${reason}.` };
  }

  return awaiting(s.acted ? 'اتعمل إجراء — مستنيين دليل التحويل.' : 'لسه مفيش دليل تحويل — الفرصة مفتوحة.');
}

// ============================================================================
// Learning aggregation
// ============================================================================

export interface LearningRecord { opportunityType: string; status: string; capturedValue?: number | null; timeToCaptureMinutes?: number | null; sourceId?: string | null; }

/** Keep one record per sourceId (last occurrence wins); records without a sourceId pass through. */
export function dedupeBySource<T extends { sourceId?: string | null }>(records: T[]): T[] {
  const bySource = new Map<string, T>(); const passthrough: T[] = [];
  for (const r of records) { if (r.sourceId) bySource.set(r.sourceId, r); else passthrough.push(r); }
  return [...passthrough, ...bySource.values()];
}
export interface TypeLearning {
  opportunityType: string;
  detected: number; captured: number; missed: number; expired: number; awaiting: number; inconclusive: number;
  decided: number;                 // captured + missed + expired (settled, non-awaiting)
  captureRate: number | null;      // captured / decided, null when no decided
  medianTimeToCaptureMinutes: number | null;
  knownValueCaptured: number | null;
  confidence: Confidence;
  note: string;
  limited: boolean;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Aggregate learning per opportunity type. Confidence honest about sample size.
 *  Defense-in-depth: if records carry a sourceId, dedupe to one (latest) per source
 *  so sample_size is a unique-source count even if fed duplicated raw rows. */
export function aggregateLearning(records: LearningRecord[]): TypeLearning[] {
  records = dedupeBySource(records);
  const byType = new Map<string, LearningRecord[]>();
  for (const r of records) { const k = r.opportunityType; if (!byType.has(k)) byType.set(k, []); byType.get(k)!.push(r); }

  const out: TypeLearning[] = [];
  for (const [type, recs] of byType) {
    const captured = recs.filter((r) => r.status === 'captured').length;
    const missed = recs.filter((r) => r.status === 'missed').length;
    const expired = recs.filter((r) => r.status === 'expired').length;
    const awaiting = recs.filter((r) => r.status === 'awaiting_evidence').length;
    const inconclusive = recs.filter((r) => r.status === 'inconclusive').length;
    const decided = captured + missed + expired;
    const captureRate = decided > 0 ? captured / decided : null;
    const times = recs.filter((r) => r.status === 'captured' && r.timeToCaptureMinutes != null).map((r) => r.timeToCaptureMinutes as number);
    const values = recs.filter((r) => r.status === 'captured' && r.capturedValue != null).map((r) => r.capturedValue as number);

    // confidence on the DECIDED sample, never inflated by awaiting/inconclusive
    let confidence: Confidence = decided < 5 ? 'low' : decided <= 20 ? 'medium' : 'high';
    const mostlyUndecided = (awaiting + inconclusive) > decided;
    if (confidence === 'high' && mostlyUndecided) confidence = 'medium';
    const limited = decided < 5;

    const note = limited
      ? 'بيانات تعلّم الفرص لسه محدودة.'
      : `فرص مشابهة اتحصّلت في ${captured} من ${decided} حالة مقيسة.`;

    out.push({
      opportunityType: type, detected: recs.length, captured, missed, expired, awaiting, inconclusive, decided,
      captureRate, medianTimeToCaptureMinutes: median(times),
      knownValueCaptured: values.length ? values.reduce((a, b) => a + b, 0) : null,
      confidence, note, limited,
    });
  }
  return out;
}

/**
 * Scoring feedback: adjust a base priority score using learning, WITHOUT
 * overriding obvious urgency. Returns the adjusted score + a note. Bounded ±12.
 */
export function applyLearningToScore(baseScore: number, urgency: string, learning: TypeLearning | undefined): { score: number; note: string | null } {
  if (!learning || learning.limited || learning.captureRate == null) {
    return { score: baseScore, note: learning?.limited ? 'بيانات تعلّم الفرص محدودة.' : null };
  }
  // never let learning pull down a critical/high-urgency opportunity
  const protectedUrgency = urgency === 'critical' || urgency === 'high';
  let delta = 0;
  if (learning.captureRate >= 0.6) delta = +Math.min(12, Math.round(learning.captureRate * 12));
  else if (learning.captureRate <= 0.3 && !protectedUrgency) delta = -Math.min(12, Math.round((0.5 - learning.captureRate) * 20));
  const score = Math.max(0, Math.min(100, baseScore + delta));
  return { score, note: learning.note };
}
