/**
 * Revenue opportunity engine — PURE. Turns gathered records into prioritized,
 * evidence-backed opportunity candidates. No fabricated revenue: estimatedValue
 * is set ONLY when an observed amount exists. Scoring is rule-based and fully
 * explained ("why this is prioritized") — no black box.
 */

export type OpportunityType =
  | 'waiting_payment_recovery' | 'proof_review' | 'access_delivery' | 'whatsapp_first_reply'
  | 'followup_reactivation' | 'leak_repair' | 'playbook_application' | 'payment_method_fix'
  | 'page_cta_fix' | 'high_intent_lead';

export type Urgency = 'low' | 'medium' | 'high' | 'critical';
export type Confidence = 'low' | 'medium' | 'high';

export interface OpportunityCandidate {
  opportunityType: OpportunityType;
  dedupeKey: string;
  title: string;
  explanation: string;          // includes the "why prioritized" reasoning
  evidence: Record<string, unknown>;
  affectedObjects: { type: string; id: string }[];
  estimatedValue: number | null;
  valueCurrency: string | null;
  confidence: Confidence;
  priorityScore: number;
  urgency: Urgency;
  recommendedAction: string;
  source: string;
}

// ---- inputs gathered from real records ----
export interface OppLead { id: string; name?: string | null; stage: string; nextAction?: string | null; stageAgeHours: number; serviceWindow?: 'open' | 'expiring_soon' | 'closed' | 'unknown'; hasFollowupTask: boolean; }
export interface OppPaymentState { leadId: string; state: string; amount: number | null; currency: string | null; proofReceived: boolean; accessDelivered: boolean; proofAgeHours: number | null; hasReviewTask: boolean; hasDeliveryTask: boolean; }
export interface OppLeak { id: string; severity: 'low' | 'medium' | 'high' | 'critical'; lane: string; hasRepairPlan: boolean; enoughData: boolean; }
export interface OppTransfer { sourceFunnel: string; targetFunnel: string; playbookType: string; confidence: Confidence; }

export interface OpportunityInputs {
  leads: OppLead[];
  payments: OppPaymentState[];
  leaks: OppLeak[];
  transfers: OppTransfer[];
}

// ---- scoring: transparent, bounded, additive ----
const URGENCY_SCORE: Record<Urgency, number> = { low: 10, medium: 25, high: 45, critical: 70 };

function scoreParts(parts: { label: string; points: number }[]): { score: number; reasons: string[] } {
  const score = Math.max(0, Math.min(100, parts.reduce((s, p) => s + p.points, 0)));
  return { score, reasons: parts.filter((p) => p.points !== 0).map((p) => `${p.label} (+${p.points})`) };
}

/** Detect all opportunity candidates from the inputs. */
export function detectOpportunities(inp: OpportunityInputs): OpportunityCandidate[] {
  const out: OpportunityCandidate[] = [];
  const paymentByLead = new Map(inp.payments.map((p) => [p.leadId, p]));

  // ---- Access delivery (confirmed payment, not delivered) — closest to revenue already earned
  for (const p of inp.payments) {
    if (p.state === 'confirmed' && !p.accessDelivered) {
      const urgency: Urgency = 'critical';
      const parts = [
        { label: 'دفعة مؤكَّدة بدون تسليم', points: URGENCY_SCORE[urgency] },
        { label: 'في مهمة تسليم', points: p.hasDeliveryTask ? -15 : 10 },
        { label: 'قيمة معروفة', points: p.amount ? 10 : 0 },
      ];
      const { score, reasons } = scoreParts(parts);
      out.push(mk('access_delivery', `delivery:${p.leadId}`, 'عميل دفع ولسه ماستلمش', 'العميل دفع وتم التأكيد بس الوصول لسه ماتسلّمش — ده أقرب إيراد فعلي.', reasons,
        { state: p.state, accessDelivered: false }, [{ type: 'lead', id: p.leadId }], p.amount, p.currency, p.amount ? 'high' : 'medium', score, urgency, 'اعمل مهمة تسليم وافتح العميل', 'payment_state'));
    }
  }

  // ---- Proof review (proof uploaded, needs review)
  for (const p of inp.payments) {
    if (p.proofReceived && p.state !== 'confirmed' && !p.accessDelivered) {
      const aged = (p.proofAgeHours ?? 0) >= 24;
      const urgency: Urgency = aged ? 'high' : 'medium';
      const parts = [
        { label: 'إثبات مرفوع محتاج مراجعة', points: URGENCY_SCORE[urgency] },
        { label: 'الإثبات قديم (>24س)', points: aged ? 10 : 0 },
        { label: 'في مهمة مراجعة', points: p.hasReviewTask ? -15 : 8 },
        { label: 'قيمة معروفة', points: p.amount ? 8 : 0 },
      ];
      const { score, reasons } = scoreParts(parts);
      out.push(mk('proof_review', `proof:${p.leadId}`, 'إثبات دفع محتاج مراجعة', 'العميل رفع إثبات تحويل ولسه ماتراجعش — مراجعته بتقرّب الإيراد.', reasons,
        { proofReceived: true, proofAgeHours: p.proofAgeHours }, [{ type: 'lead', id: p.leadId }], p.amount, p.currency, p.amount ? 'high' : 'medium', score, urgency, 'اعمل مهمة مراجعة إثبات وافتح العميل', 'payment_state'));
    }
  }

  // ---- Waiting payment recovery
  for (const l of inp.leads) {
    if (l.stage === 'waiting_payment') {
      const pay = paymentByLead.get(l.id);
      const overdue = l.stageAgeHours >= 24;
      const urgency: Urgency = overdue ? 'high' : 'medium';
      const parts = [
        { label: 'بانتظار الدفع', points: URGENCY_SCORE[urgency] },
        { label: 'واقف >24 ساعة', points: overdue ? 10 : 0 },
        { label: 'مفيش مهمة متابعة', points: l.hasFollowupTask ? -15 : 10 },
        { label: 'قيمة معروفة', points: pay?.amount ? 10 : 0 },
      ];
      const { score, reasons } = scoreParts(parts);
      out.push(mk('waiting_payment_recovery', `waiting:${l.id}`, `«${l.name ?? 'عميل'}» بانتظار الدفع`, 'العميل وصل لمرحلة الدفع وماكملّش — متابعة لطيفة بتسترجع الإيراد.', reasons,
        { stage: l.stage, stageAgeHours: l.stageAgeHours }, [{ type: 'lead', id: l.id }], pay?.amount ?? null, pay?.currency ?? null, pay?.amount ? 'high' : 'medium', score, urgency, 'اعمل مهمة متابعة واكتب تذكير دفع', 'lead'));
    }
  }

  // ---- WhatsApp first reply (clicked, not contacted) — service window urgency
  for (const l of inp.leads) {
    if (l.stage === 'whatsapp_clicked') {
      const sw = l.serviceWindow ?? 'unknown';
      const urgency: Urgency = sw === 'expiring_soon' ? 'critical' : sw === 'open' ? 'high' : 'medium';
      const parts = [
        { label: 'ضغط واتساب بدون تواصل', points: URGENCY_SCORE[urgency] },
        { label: 'نافذة الخدمة بتقفل قريّب', points: sw === 'expiring_soon' ? 12 : 0 },
        { label: 'النافذة مفتوحة', points: sw === 'open' ? 6 : 0 },
      ];
      const { score, reasons } = scoreParts(parts);
      out.push(mk('whatsapp_first_reply', `wa_first:${l.id}`, `«${l.name ?? 'عميل'}» ضغط واتساب ولسه ماتكلّمش`, 'العميل أبدى اهتمام عبر واتساب — أول ردّ سريع بيحجز الفرصة قبل ما تبرد.', reasons,
        { stage: l.stage, serviceWindow: sw }, [{ type: 'lead', id: l.id }], null, null, 'medium', score, urgency, 'اكتب أول ردّ واعمل مهمة عاجلة', 'lead'));
    }
  }

  // ---- Follow-up reactivation (stuck too long, no next action, not lost)
  for (const l of inp.leads) {
    const active = !['paid', 'access_delivered', 'lost', 'waiting_payment', 'whatsapp_clicked'].includes(l.stage);
    if (active && !l.nextAction && l.stageAgeHours >= 72) {
      const urgency: Urgency = 'medium';
      const parts = [
        { label: 'واقف من غير خطوة تالية', points: URGENCY_SCORE[urgency] },
        { label: `واقف ${Math.round(l.stageAgeHours / 24)} يوم`, points: Math.min(15, Math.floor(l.stageAgeHours / 72) * 5) },
      ];
      const { score, reasons } = scoreParts(parts);
      out.push(mk('followup_reactivation', `reactivate:${l.id}`, `«${l.name ?? 'عميل'}» محتاج إعادة تنشيط`, 'العميل واقف من غير حركة ولا خطوة تالية — متابعة هادية ممكن ترجّعه.', reasons,
        { stage: l.stage, stageAgeHours: l.stageAgeHours }, [{ type: 'lead', id: l.id }], null, null, 'low', score, urgency, 'اعمل مهمة متابعة واكتب رسالة هادية', 'lead'));
    }
  }

  // ---- Leak repair opportunity (high/critical leak with enough data)
  for (const lk of inp.leaks) {
    if ((lk.severity === 'high' || lk.severity === 'critical') && lk.enoughData) {
      const urgency: Urgency = lk.severity === 'critical' ? 'high' : 'medium';
      const parts = [
        { label: `تسريب ${lk.severity}`, points: URGENCY_SCORE[urgency] },
        { label: 'خطة إصلاح جاهزة', points: lk.hasRepairPlan ? 8 : 0 },
      ];
      const { score, reasons } = scoreParts(parts);
      out.push(mk('leak_repair', `leak:${lk.id}`, `تسريب ${lk.lane} قابل للإصلاح`, 'في تسريب واضح بأثر على الإيراد وعليه بيانات كفاية — إصلاحه فرصة مباشرة.', reasons,
        { severity: lk.severity, lane: lk.lane, hasRepairPlan: lk.hasRepairPlan }, [{ type: 'leak', id: lk.id }], null, null, lk.enoughData ? 'medium' : 'low', score, urgency, lk.hasRepairPlan ? 'راجِع خطة الإصلاح ووافِق' : 'ابنِ خطة إصلاح من لوحة التسريبات', 'leak'));
    }
  }

  // ---- Playbook application opportunity (transferable to a weak funnel)
  for (const t of inp.transfers) {
    const parts = [
      { label: 'playbook ناجح قابل للنقل', points: 35 },
      { label: 'ثقة عالية', points: t.confidence === 'high' ? 10 : t.confidence === 'medium' ? 5 : 0 },
    ];
    const { score, reasons } = scoreParts(parts);
    out.push(mk('playbook_application', `transfer:${t.targetFunnel}:${t.playbookType}`, `انقل playbook ${t.playbookType} لقمع محتاجه`, 'في playbook اشتغل في قمع وممكن ينقل لقمع تاني في نفس السوق — فرصة تحسين مباشرة.', reasons,
      { sourceFunnel: t.sourceFunnel, targetFunnel: t.targetFunnel, playbookType: t.playbookType }, [{ type: 'funnel', id: t.targetFunnel }], null, null, t.confidence, score, 'medium', 'اعمل خطة نقل playbook', 'portfolio'));
  }

  return out.sort((a, b) => b.priorityScore - a.priorityScore);
}

function mk(
  opportunityType: OpportunityType, dedupeKey: string, title: string, baseExplanation: string, reasons: string[],
  evidence: Record<string, unknown>, affectedObjects: { type: string; id: string }[],
  amount: number | null, currency: string | null, confidence: Confidence, priorityScore: number, urgency: Urgency,
  recommendedAction: string, source: string,
): OpportunityCandidate {
  const why = reasons.length ? ` (الترتيب: ${reasons.join('، ')})` : '';
  return {
    opportunityType, dedupeKey, title,
    explanation: baseExplanation + why,
    evidence: { ...evidence, scoreReasons: reasons },
    affectedObjects,
    estimatedValue: amount ?? null,                 // ONLY a real observed amount
    valueCurrency: amount ? (currency ?? 'EGP') : null,
    confidence, priorityScore, urgency, recommendedAction, source,
  };
}

/** Honest value summary: sum only KNOWN amounts; everything else stays a count. */
export function valueSummary(cands: { estimatedValue: number | null; valueCurrency: string | null }[]): { knownTotal: number | null; currency: string | null; withValue: number; withoutValue: number } {
  const withVal = cands.filter((c) => c.estimatedValue != null);
  if (withVal.length === 0) return { knownTotal: null, currency: null, withValue: 0, withoutValue: cands.length };
  const currency = withVal[0].valueCurrency ?? 'EGP';
  const knownTotal = withVal.reduce((s, c) => s + (c.estimatedValue ?? 0), 0);
  return { knownTotal, currency, withValue: withVal.length, withoutValue: cands.length - withVal.length };
}
