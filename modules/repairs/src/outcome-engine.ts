/**
 * Repair outcome interpreter — PURE. Given a repair type, baseline vs current
 * metrics, and how much time/data has accrued, decide an honest outcome:
 * awaiting_data / early_signal / improved / no_change / worsened / inconclusive.
 *
 * Core rule: never declare success without enough data. If the minimum window
 * or signal for a repair type isn't met → awaiting_data + low confidence.
 */

export type OutcomeStatus = 'awaiting_data' | 'early_signal' | 'improved' | 'no_change' | 'worsened' | 'inconclusive';
export type Confidence = 'low' | 'medium' | 'high';
export type RepairType =
  | 'payment_recovery' | 'whatsapp_first_reply' | 'whatsapp_followup' | 'page_cta_fix'
  | 'page_hero_fix' | 'tracking_fix' | 'followup_fix' | 'access_delivery_fix' | 'attribution_fix';

export interface MetricBag { [k: string]: number }

export interface OutcomeInput {
  type: RepairType;
  baseline: MetricBag;
  current: MetricBag;
  hoursElapsed: number;
}

export interface OutcomeResult {
  status: OutcomeStatus;
  confidence: Confidence;
  delta: MetricBag;
  interpretation: string;
  recommendedNextAction: string;
}

/** Minimum data before we'll judge, per repair type. */
const MIN_RULES: Record<RepairType, { minHours: number; signalKeys?: string[]; minSignal?: number; minViews?: number }> = {
  payment_recovery:    { minHours: 24 },
  access_delivery_fix: { minHours: 12 },
  whatsapp_first_reply:{ minHours: 12, signalKeys: ['repliesMarkedSent', 'inboundReplies', 'movedToContacted'], minSignal: 1 },
  whatsapp_followup:   { minHours: 12, signalKeys: ['repliesMarkedSent', 'tasksDone'], minSignal: 1 },
  page_cta_fix:        { minHours: 48, minViews: 30 },
  page_hero_fix:       { minHours: 48, minViews: 30 },
  tracking_fix:        { minHours: 1,  signalKeys: ['trackedLinks', 'eventsReceived', 'attributedLeads'], minSignal: 1 },
  followup_fix:        { minHours: 24 },
  attribution_fix:     { minHours: 24, signalKeys: ['attributedLeads'], minSignal: 1 },
};

function diff(baseline: MetricBag, current: MetricBag): MetricBag {
  const out: MetricBag = {};
  const keys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  for (const k of keys) out[k] = (current[k] ?? 0) - (baseline[k] ?? 0);
  return out;
}

/** The "primary" metric whose drop (or rise) indicates the repair worked. */
const PRIMARY: Partial<Record<RepairType, { key: string; direction: 'down' | 'up' }>> = {
  payment_recovery: { key: 'waitingPayment', direction: 'down' },
  access_delivery_fix: { key: 'confirmedNotDelivered', direction: 'down' },
  whatsapp_first_reply: { key: 'clickedNotContacted', direction: 'down' },
  whatsapp_followup: { key: 'needsFollowup', direction: 'down' },
  page_cta_fix: { key: 'ctaRate', direction: 'up' },
  page_hero_fix: { key: 'ctaRate', direction: 'up' },
  followup_fix: { key: 'overdueTasks', direction: 'down' },
  tracking_fix: { key: 'attributedLeads', direction: 'up' },
  attribution_fix: { key: 'attributedLeads', direction: 'up' },
};

export function interpretOutcome(inp: OutcomeInput): OutcomeResult {
  const delta = diff(inp.baseline, inp.current);
  const rule = MIN_RULES[inp.type];
  const primary = PRIMARY[inp.type];

  // --- minimum-data gate ---
  const timeMet = inp.hoursElapsed >= rule.minHours;
  let signalMet = true;
  if (rule.signalKeys && rule.minSignal != null) {
    const sig = rule.signalKeys.reduce((s, k) => s + Math.max(0, delta[k] ?? 0), 0);
    signalMet = sig >= rule.minSignal;
  }
  let viewsMet = true;
  if (rule.minViews != null) {
    const views = (inp.current['pageViews'] ?? 0) - (inp.baseline['pageViews'] ?? 0);
    viewsMet = views >= rule.minViews;
  }

  // For time-gated repairs, both time AND (signal/views if defined) gate judgment.
  const enough = timeMet && signalMet && viewsMet;
  if (!enough) {
    // For view-gated page repairs, a rate change on too-few views is noise — wait.
    const viewGated = rule.minViews != null;
    // an early signal can still show (for count-movement repairs) before the full window
    const earlySig = !viewGated && primary ? movement(delta, primary) : 0;
    if (earlySig > 0) {
      return {
        status: 'early_signal', confidence: 'low', delta,
        interpretation: earlyText(inp.type, delta, primary),
        recommendedNextAction: 'collect_more_data',
      };
    }
    return {
      status: 'awaiting_data', confidence: 'low', delta,
      interpretation: 'الإصلاح اتطبّق — لسه مستنيين بيانات/وقت كفاية للحكم.',
      recommendedNextAction: 'collect_more_data',
    };
  }

  // --- enough data: judge by the primary metric ---
  if (!primary) {
    return { status: 'inconclusive', confidence: 'low', delta, interpretation: 'مفيش مقياس أساسي واضح للنوع ده.', recommendedNextAction: 'review_no_change_repair' };
  }
  const move = movement(delta, primary);
  if (move > 0) {
    const strong = Math.abs(delta[primary.key] ?? 0) >= 3 || (primary.key === 'ctaRate' && Math.abs(delta.ctaRate ?? 0) >= 0.03);
    return {
      status: 'improved', confidence: strong ? 'high' : 'medium', delta,
      interpretation: improvedText(inp.type, delta, primary),
      recommendedNextAction: 'confirm_repair_success',
    };
  }
  if (move < 0) {
    return {
      status: 'worsened', confidence: 'medium', delta,
      interpretation: 'الأرقام اتحركت في الاتجاه الغلط بعد الإصلاح — محتاج إصلاح مختلف.',
      recommendedNextAction: 'apply_next_repair',
    };
  }
  return {
    status: 'no_change', confidence: 'medium', delta,
    interpretation: 'مفيش تغيّر واضح بعد الإصلاح — جرّب إصلاح تاني أو إجراء مختلف.',
    recommendedNextAction: 'apply_next_repair',
  };
}

/** Positive number = movement in the intended direction. */
function movement(delta: MetricBag, primary: { key: string; direction: 'down' | 'up' }): number {
  const d = delta[primary.key] ?? 0;
  return primary.direction === 'down' ? -d : d;
}

function fmt(n: number): string { return (Math.round(n * 100) / 100).toString(); }

function earlyText(type: RepairType, delta: MetricBag, primary?: { key: string; direction: 'down' | 'up' }): string {
  if (type === 'payment_recovery') return `إشارة مبكرة: ${Math.abs(delta.waitingPayment ?? 0)} عميل اتحرّك من «بانتظار الدفع»، بس محتاجين بيانات أكتر.`;
  if (type === 'whatsapp_first_reply') return `إشارة مبكرة: ${Math.abs(delta.clickedNotContacted ?? 0)} عميل اتكلّم معاه، نكمّل قياس.`;
  return 'إشارة مبكرة — في حركة بس لسه بدري على الحكم.';
}

function improvedText(type: RepairType, delta: MetricBag, primary: { key: string; direction: 'down' | 'up' }): string {
  if (type === 'payment_recovery') return `تحسّن: العملاء في «بانتظار الدفع» قلّوا بمقدار ${Math.abs(delta.waitingPayment ?? 0)}.`;
  if (type === 'whatsapp_first_reply') return `تحسّن: ${Math.abs(delta.clickedNotContacted ?? 0)} عميل اتنقل من «ضغط واتساب» للتواصل.`;
  if (type === 'followup_fix') return `تحسّن: المهام المتأخرة قلّت بمقدار ${Math.abs(delta.overdueTasks ?? 0)}.`;
  if (type === 'page_cta_fix' || type === 'page_hero_fix') return `تحسّن: معدل ضغط الـ CTA زاد بمقدار ${fmt((delta.ctaRate ?? 0) * 100)}%.`;
  if (type === 'tracking_fix' || type === 'attribution_fix') return `تحسّن: العملاء بإسناد زادوا بمقدار ${Math.abs(delta.attributedLeads ?? 0)}.`;
  return `تحسّن واضح في ${primary.key}.`;
}
