/**
 * Revenue attribution engine — PURE. Associates a capture with the nearest,
 * strongest action BY EVIDENCE. This is evidence-weighted association, NOT
 * causal proof — language stays honest ("happened after", "likely influenced
 * by", "no clear attribution"). No fabricated causality.
 */

export type ActionType =
  | 'task_completed' | 'whatsapp_reply_marked_sent' | 'payment_reminder_drafted' | 'proof_review_task'
  | 'access_delivery_task' | 'repair_plan_applied' | 'playbook_application_applied' | 'page_section_updated'
  | 'offer_updated' | 'command_applied' | 'scheduled_action' | 'unknown';

export type Strength = 'none' | 'weak' | 'medium' | 'strong';
export type Confidence = 'low' | 'medium' | 'high';

export interface CandidateAction {
  actionType: ActionType;
  objectId?: string | null;
  /** minutes BEFORE capture this action occurred (>=0). Negative = after capture (ignored). */
  minutesBeforeCapture: number;
  /** direct = action is tied to the same lead/object; indirect = same funnel/time only. */
  direct: boolean;
  /** the related outcome already improved (repair/playbook) — strengthens attribution. */
  outcomeImproved?: boolean;
}

export interface AttributionInput {
  opportunityType: string;
  capturedValue?: number | null;
  currency?: string | null;
  candidates: CandidateAction[];
}

export interface AttributionResult {
  attributedActionType: ActionType;
  attributedObjectId: string | null;
  strength: Strength;
  confidence: Confidence;
  timeDeltaMinutes: number | null;
  evidence: Record<string, unknown>;
  explanation: string;
}

/** Attribution window (minutes) per opportunity type — the action must fall inside it. */
const WINDOW_MIN: Record<string, number> = {
  whatsapp_first_reply: 72 * 60,
  waiting_payment_recovery: 96 * 60,
  proof_review: 48 * 60,
  access_delivery: 24 * 60,
  followup_reactivation: 96 * 60,
  page_cta_fix: 72 * 60,
  leak_repair: 14 * 24 * 60,
  playbook_application: 14 * 24 * 60,
};

/** The action type that is the "expected" driver for each opportunity type. */
const EXPECTED_ACTION: Record<string, ActionType[]> = {
  waiting_payment_recovery: ['payment_reminder_drafted', 'task_completed'],
  proof_review: ['proof_review_task', 'task_completed'],
  access_delivery: ['access_delivery_task', 'task_completed'],
  whatsapp_first_reply: ['whatsapp_reply_marked_sent', 'task_completed'],
  followup_reactivation: ['task_completed', 'whatsapp_reply_marked_sent'],
  leak_repair: ['repair_plan_applied'],
  playbook_application: ['playbook_application_applied'],
};

export function attributeCapture(inp: AttributionInput): AttributionResult {
  const window = WINDOW_MIN[inp.opportunityType] ?? 96 * 60;
  const expected = EXPECTED_ACTION[inp.opportunityType] ?? [];

  // only actions that happened BEFORE capture and within the window
  const inWindow = inp.candidates.filter((c) => c.minutesBeforeCapture >= 0 && c.minutesBeforeCapture <= window);
  if (inWindow.length === 0) {
    return { attributedActionType: 'unknown', attributedObjectId: null, strength: 'none', confidence: 'low', timeDeltaMinutes: null,
      evidence: { candidates: inp.candidates.length, inWindow: 0 }, explanation: 'مفيش إجراء واضح قبل التحصيل. Attribution: unknown.' };
  }

  // rank: expected+direct+improved first, then proximity (closer = stronger)
  const scored = inWindow.map((c) => {
    let s = 0;
    if (expected.includes(c.actionType)) s += 40;
    if (c.direct) s += 25;
    if (c.outcomeImproved) s += 20;
    // proximity bonus: closer to capture scores higher (max 25)
    s += Math.max(0, 25 - Math.floor(c.minutesBeforeCapture / Math.max(1, window / 25)));
    return { c, s };
  }).sort((a, b) => b.s - a.s);

  const winner = scored[0].c;
  const second = scored[1]?.c;
  const isExpected = expected.includes(winner.actionType);
  const uniquelyDominant = !second || (scored[0].s - scored[1].s) >= 20;

  // strength: expected + direct + (improved or unique) → strong; expected/direct → medium; else weak
  let strength: Strength;
  let confidence: Confidence;
  if (isExpected && winner.direct && (winner.outcomeImproved || uniquelyDominant)) { strength = 'strong'; confidence = 'high'; }
  else if (isExpected && winner.direct) { strength = 'medium'; confidence = 'medium'; }   // expected+direct but near-tie → medium
  else if ((isExpected || winner.direct) && uniquelyDominant) { strength = 'medium'; confidence = 'medium'; }
  else if (winner.actionType === 'scheduled_action' || !winner.direct) { strength = 'weak'; confidence = 'low'; }
  else { strength = 'weak'; confidence = 'low'; }

  const delta = winner.minutesBeforeCapture;
  const explanation = buildExplanation(strength, winner.actionType, delta, inWindow.length);

  return {
    attributedActionType: winner.actionType, attributedObjectId: winner.objectId ?? null,
    strength, confidence, timeDeltaMinutes: Math.round(delta),
    evidence: { candidatesInWindow: inWindow.length, uniquelyDominant, expected: isExpected, direct: winner.direct, outcomeImproved: !!winner.outcomeImproved },
    explanation,
  };
}

const ACTION_AR: Record<string, string> = {
  task_completed: 'إكمال مهمة', whatsapp_reply_marked_sent: 'إرسال ردّ واتساب', payment_reminder_drafted: 'تذكير دفع',
  proof_review_task: 'مهمة مراجعة إثبات', access_delivery_task: 'مهمة تسليم', repair_plan_applied: 'تطبيق إصلاح',
  playbook_application_applied: 'تطبيق playbook', page_section_updated: 'تعديل الصفحة', offer_updated: 'تعديل العرض',
  command_applied: 'أمر من الـ Command Bar', scheduled_action: 'إجراء مجدوَل', unknown: 'غير معروف',
};

function fmtDelta(min: number): string {
  if (min < 60) return `${Math.round(min)} دقيقة`;
  if (min < 1440) return `${Math.round(min / 60)} ساعة`;
  return `${Math.round(min / 1440)} يوم`;
}

function buildExplanation(strength: Strength, action: ActionType, delta: number, count: number): string {
  const a = ACTION_AR[action] ?? action;
  if (strength === 'strong') return `التحصيل حصل بعد ${fmtDelta(delta)} من ${a}. Attribution: strong.`;
  if (strength === 'medium') return `حصل التحول بعد عدة إجراءات؛ أقرب إجراء مرتبط هو ${a} (بعد ${fmtDelta(delta)}). Attribution: medium.`;
  return `التحصيل حصل بعد ${a} لكن الدليل غير مباشر${count > 1 ? ' ووسط إجراءات متعددة' : ''}. Attribution: weak.`;
}

// ============================================================================
// Learning aggregation by action type (+ opportunity type)
// ============================================================================

export interface AttrLearningRecord { attributedActionType: string; opportunityType?: string | null; captured: boolean; capturedValue?: number | null; timeDeltaMinutes?: number | null; sourceId?: string | null; }
export interface ActionLearning {
  attributedActionType: string;
  attempts: number;
  capturedCount: number;
  captureRate: number;
  knownValueCaptured: number | null;
  medianTimeDeltaMinutes: number | null;
  confidence: Confidence;
  note: string;
  limited: boolean;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function aggregateAttribution(records: AttrLearningRecord[]): ActionLearning[] {
  // defense-in-depth: one record per source (latest wins) so duplicated raw rows can't inflate
  const bySource = new Map<string, AttrLearningRecord>(); const pass: AttrLearningRecord[] = [];
  for (const r of records) { if (r.sourceId) bySource.set(r.sourceId, r); else pass.push(r); }
  records = [...pass, ...bySource.values()];
  const byAction = new Map<string, AttrLearningRecord[]>();
  for (const r of records) { const k = r.attributedActionType; if (!byAction.has(k)) byAction.set(k, []); byAction.get(k)!.push(r); }
  const out: ActionLearning[] = [];
  for (const [action, recs] of byAction) {
    if (action === 'unknown') continue;                  // unknown is not an action recommendation
    const attempts = recs.length;
    const captured = recs.filter((r) => r.captured).length;
    const captureRate = attempts > 0 ? captured / attempts : 0;
    const times = recs.filter((r) => r.captured && r.timeDeltaMinutes != null).map((r) => r.timeDeltaMinutes as number);
    const values = recs.filter((r) => r.captured && r.capturedValue != null).map((r) => r.capturedValue as number);
    const confidence: Confidence = attempts < 5 ? 'low' : attempts <= 20 ? 'medium' : 'high';
    const limited = attempts < 5;
    const note = limited ? 'بيانات نَسب الإجراءات لسه محدودة.' : `الإجراء ده ارتبط بتحصيل في ${captured} من ${attempts} حالة.`;
    out.push({ attributedActionType: action, attempts, capturedCount: captured, captureRate, knownValueCaptured: values.length ? values.reduce((a, b) => a + b, 0) : null, medianTimeDeltaMinutes: median(times), confidence, note, limited });
  }
  return out.sort((a, b) => b.captureRate - a.captureRate);
}

/** Which action to recommend first for an opportunity type, from attribution learning. */
export function recommendedAction(opportunityType: string, learning: ActionLearning[]): { actionType: string; note: string } | null {
  const expected = EXPECTED_ACTION[opportunityType] ?? [];
  const candidates = learning.filter((l) => !l.limited && expected.includes(l.attributedActionType as ActionType) && l.captureRate >= 0.4);
  if (!candidates.length) return null;
  const best = candidates[0];
  return { actionType: best.attributedActionType, note: best.note };
}
