import { withTenant } from '../../../packages/db/src/router.js';
import type { LLMClient } from '../../../packages/ai-core/src/gateway.js';
import type { Intent } from './intents.js';
import { getOffer, updateOffer, runOfferAction } from '../../funnel/src/service.js';
import { runSectionAction, updateSection } from '../../pages/src/service.js';
import { draftReply } from '../../whatsapp/src/service.js';
import { getBiggestLeak, updateLeakStatus } from '../../leaks/src/service.js';
import { generateReport } from '../../reports/src/service.js';
import { buildRepairFromLeak } from '../../repairs/src/service.js';

/**
 * Command executor — the Execution Layer. For each intent it can PLAN a typed,
 * auditable action (preview + before-snapshot + the payload needed to apply) and
 * APPLY it (the real mutation) only when the user confirms. Nothing destructive
 * happens at plan time. No deletes, no auto-send, no bulk messaging.
 */

export type ActionKind =
  | 'navigation' | 'informational' | 'draft_message' | 'offer_update' | 'section_update'
  | 'template_update' | 'task_creation' | 'bulk_action' | 'mark_status'
  | 'create_tracked_link' | 'payment_instruction_update' | 'report_generation' | 'leak_repair_plan' | 'scheduled_run';

export interface PlannedAction {
  actionKind: ActionKind;
  requiresConfirmation: boolean;
  summary: string;                 // what will happen, in Arabic
  preview?: string;                // text or message preview
  diff?: { field: string; before: string; after: string }[];
  evidence?: Record<string, unknown>;
  affectedCount?: number;
  sample?: { id: string; label: string }[];
  navigate?: { tab?: string; leadFilter?: string };
  beforeSnapshot?: unknown;
  payload?: Record<string, unknown>;   // consumed by apply()
}

const OFFER_ACTION_FOR: Partial<Record<Intent, string>> = {
  improve_offer: 'improve', make_offer_premium: 'premium', strengthen_objections: 'strengthen_objections',
  improve_cta: 'improve_cta', rewrite_offer_tone: 'egyptian',
};

const OFFER_FIELDS = ['name', 'promise', 'idealCustomer', 'mainPain', 'desiredResult', 'transformation', 'guarantee', 'pricing', 'cta'];

function shortDiff(before: any, after: any): { field: string; before: string; after: string }[] {
  const out: { field: string; before: string; after: string }[] = [];
  for (const f of OFFER_FIELDS) {
    const b = (before?.[f] ?? '').toString();
    const a = (after?.[f] ?? '').toString();
    if (b !== a) out.push({ field: f, before: b.slice(0, 160), after: a.slice(0, 160) });
  }
  return out;
}

/**
 * PLAN: produce a typed proposed action for an intent. Read-only — computes the
 * "after" value (e.g. via a preview brain) and the before-snapshot, but never
 * writes object data.
 */
export async function planAction(
  tenantId: string,
  intent: Intent,
  ctx: { funnelId?: string; leadId?: string; leakId?: string; tab?: string },
  llm: LLMClient,
): Promise<PlannedAction> {
  // ---- OFFER updates ----
  if (OFFER_ACTION_FOR[intent] && ctx.funnelId) {
    const cur = await getOffer(tenantId, ctx.funnelId);
    if (!cur) return informational('محتاج عرض محفوظ الأول. افتح تبويب العرض.');
    const before = cur.offer;
    const r = await runOfferAction(tenantId, ctx.funnelId, OFFER_ACTION_FOR[intent] as any, llm).catch(() => null);
    if (!r) return informational('تعذّر توليد نسخة محسّنة من العرض.');
    return {
      actionKind: 'offer_update', requiresConfirmation: true,
      summary: 'في نسخة محسّنة من العرض جاهزة للمراجعة. التطبيق هيحدّث العرض (مش بيكتب فوق تعديلاتك من غير موافقة).',
      diff: shortDiff(before, r.preview),
      beforeSnapshot: before,
      payload: { kind: 'offer', after: r.preview },
      navigate: { tab: 'offer' },
    };
  }

  // ---- PAGE section updates ----
  if (['improve_page_cta', 'shorten_page', 'make_page_whatsapp_first', 'improve_proof', 'rewrite_page_section', 'fix_page_leak'].includes(intent) && ctx.funnelId) {
    const sectionActionMap: Record<string, { sectionType: string; action: string; label: string }> = {
      improve_page_cta: { sectionType: 'cta', action: 'cta_whatsapp_first', label: 'CTA' },
      shorten_page: { sectionType: 'hero', action: 'shorter', label: 'الصفحة' },
      make_page_whatsapp_first: { sectionType: 'cta', action: 'cta_whatsapp_first', label: 'CTA واتساب' },
      improve_proof: { sectionType: 'proof', action: 'strengthen_proof', label: 'الإثبات' },
      rewrite_page_section: { sectionType: 'hero', action: 'rewrite_hero', label: 'الهيرو' },
      fix_page_leak: { sectionType: 'cta', action: 'cta_whatsapp_first', label: 'CTA' },
    };
    const cfg = sectionActionMap[intent];
    const section = await withTenant(tenantId, async (c) => {
      const p = await c.query(`SELECT id FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [ctx.funnelId]);
      if (!p.rowCount) return null;
      const s = await c.query(`SELECT id, type, content FROM page_sections WHERE page_id=$1 AND type=$2 ORDER BY position LIMIT 1`, [p.rows[0].id, cfg.sectionType]);
      return s.rows[0] ?? null;
    });
    if (!section) return informational(`مفيش قسم «${cfg.label}» في الصفحة. ولّد الصفحة الأول أو افتح تبويب الصفحة.`);
    const r = await runSectionAction(tenantId, section.id, cfg.action as any, llm).catch(() => null);
    if (!r) return informational('تعذّر توليد تحسين للقسم.');
    const before = section.content;
    return {
      actionKind: 'section_update', requiresConfirmation: true,
      summary: `في تحسين مقترح لقسم «${cfg.label}». التطبيق هيحدّث القسم ده بس.`,
      diff: sectionDiff(before, r.preview),
      beforeSnapshot: before,
      payload: { kind: 'section', sectionId: section.id, after: r.preview },
      navigate: { tab: 'page' },
    };
  }

  // ---- WhatsApp draft (never sends) ----
  if (['draft_whatsapp_reply', 'create_followup_message', 'respond_to_objection', 'generate_payment_reminder', 'create_payment_followup'].includes(intent)) {
    if (!ctx.leadId) {
      return { actionKind: 'navigation', requiresConfirmation: false, summary: 'افتح عميل الأول عشان أكتبلك الرد المناسب.', navigate: { tab: 'leads' } };
    }
    const objMap: Record<string, string | undefined> = { respond_to_objection: 'price_high' };
    const d = await draftReply(tenantId, ctx.leadId, { objectionKey: objMap[intent] }).catch(() => null) as any;
    if (!d || d.needsFlow) return informational('محتاج تولّد WhatsApp flow الأول من تبويب واتساب.');
    return {
      actionKind: 'draft_message', requiresConfirmation: false,
      summary: 'دي مسودة رد جاهزة. انسخها وابعتها بنفسك على واتساب — مفيش إرسال تلقائي.',
      preview: d.template?.body ?? '',
      payload: { kind: 'draft', leadId: ctx.leadId, stepType: d.stepType, draftId: d.draftId },
    };
  }

  // ---- WhatsApp template strengthen (objections) ----
  if (intent === 'rewrite_whatsapp_template' && ctx.funnelId) {
    return {
      actionKind: 'template_update', requiresConfirmation: true,
      summary: 'هحسّن قوالب واتساب (مثلاً ردود الاعتراضات). راجِعها في تبويب واتساب قبل الحفظ.',
      navigate: { tab: 'whatsapp' },
      payload: { kind: 'noop_navigate', tab: 'whatsapp' },
    };
  }

  // ---- NAVIGATION / FILTER ----
  const NAV: Partial<Record<Intent, { tab: string; leadFilter?: string }>> = {
    open_offer: { tab: 'offer' }, open_page: { tab: 'page' }, open_leads: { tab: 'leads' },
    open_leaks: { tab: 'leaks' }, open_payment: { tab: 'payment' }, open_whatsapp: { tab: 'whatsapp' }, open_report: { tab: 'report' },
    find_waiting_payment_leads: { tab: 'leads', leadFilter: 'waiting_payment' },
    find_stuck_payments: { tab: 'leads', leadFilter: 'payment_stuck' },
    find_leads_needing_action: { tab: 'leads', leadFilter: 'needs_followup' },
    find_whatsapp_clicked_not_contacted: { tab: 'leads', leadFilter: 'clicked_not_contacted' },
    open_affected_leads: { tab: 'leads' },
  };
  if (NAV[intent]) {
    return { actionKind: 'navigation', requiresConfirmation: false, summary: 'بفتحلك المكان المطلوب.', navigate: NAV[intent] };
  }

  // ---- BULK task creation ----
  if (intent === 'create_tasks_for_leads' && ctx.funnelId) {
    const { count, sample } = await affectedLeads(tenantId, ctx.funnelId, 'waiting_payment');
    if (count === 0) return informational('مفيش عملاء منطبق عليهم الشرط دلوقتي.');
    return {
      actionKind: 'bulk_action', requiresConfirmation: true,
      summary: `هيتعمل ${count} مهمة متابعة لعملاء «بانتظار الدفع». تأكيد؟`,
      affectedCount: count, sample,
      payload: { kind: 'bulk_tasks', filter: 'waiting_payment', title: 'تابع الدفع', taskKind: 'whatsapp_followup' },
      navigate: { tab: 'leads', leadFilter: 'waiting_payment' },
    };
  }

  // ---- LEAK repair plan ----
  if (intent === 'explain_biggest_leak' || intent === 'suggest_fastest_fix' || intent === 'create_actions_from_leak' || intent === 'mark_leak_fixing') {
    if (!ctx.funnelId) return informational('افتح قمع الأول.');
    const leak = await getBiggestLeak(tenantId, ctx.funnelId);
    if (!leak) return informational('مفيش تسريب مفتوح حاليًا، أو لسه مفيش بيانات كفاية للتشخيص.');
    const ev = leak.evidence && typeof leak.evidence === 'object' ? leak.evidence : {};
    const evText = Object.entries(ev).map(([k, v]) => `${k}: ${v}`).join('، ');

    if (intent === 'suggest_fastest_fix' || intent === 'create_actions_from_leak') {
      const built = await buildRepairFromLeak(tenantId, ctx.funnelId, leak.id).catch(() => null);
      if (built && (built as any).planId) {
        const ln = (built as any).learning;
        const conf = (built as any).confidence;
        const learnLine = ln?.note ? '\n📚 ' + ln.note : '';
        return {
          actionKind: 'leak_repair_plan', requiresConfirmation: false,
          summary: `اتبنت خطة إصلاح لـ «${leak.title}»${conf ? ' (ثقة التعلّم: ' + conf + ')' : ''} — راجِعها ووافِق.`,
          preview: `${leak.explanation}${evText ? '\n(دليل: ' + evText + ')' : ''}\nأسرع إصلاح: ${leak.fastest_fix}${learnLine}`,
          evidence: ev, navigate: { tab: 'leaks' },
          payload: { kind: 'open_repair', repairPlanId: (built as any).planId, leakId: leak.id },
        };
      }
    }
    if (intent === 'explain_biggest_leak' || intent === 'suggest_fastest_fix') {
      return {
        actionKind: 'leak_repair_plan', requiresConfirmation: false,
        summary: 'دي خطة الإصلاح المقترحة بناءً على الأدلة المرصودة.',
        preview: `أكبر تسريب: ${leak.title}\n${leak.explanation}\nأسرع إصلاح: ${leak.fastest_fix}`,
        evidence: ev,
        navigate: leakRoute(leak.recommended_action),
        payload: { kind: 'leak_plan', leakId: leak.id, recommended: leak.recommended_action },
      };
    }
    // create_actions_from_leak or mark_leak_fixing → requires confirmation (status/task change)
    return {
      actionKind: intent === 'mark_leak_fixing' ? 'mark_status' : 'task_creation',
      requiresConfirmation: true,
      summary: intent === 'mark_leak_fixing'
        ? `هتعلّم التسريب «${leak.title}» قيد الإصلاح. تأكيد؟`
        : `هيتعمل إجراء/مهمة لإصلاح «${leak.title}». تأكيد؟`,
      preview: `${leak.explanation}${evText ? '\n(دليل: ' + evText + ')' : ''}\nأسرع إصلاح: ${leak.fastest_fix}`,
      evidence: ev,
      payload: { kind: intent === 'mark_leak_fixing' ? 'leak_status' : 'leak_task', leakId: leak.id, status: 'fixing', title: 'إصلاح: ' + leak.title },
      navigate: leakRoute(leak.recommended_action),
    };
  }

  // ---- REPORT generation ----
  if (['did_recommendation_work', 'measure_recommendation_outcomes', 'which_recommendations_worked', 'rank_recommendations_by_result', 'which_recommendations_fail', 'what_learned_recommendations'].includes(intent)) {
    if (!ctx.funnelId) return informational('افتح قمع الأول.');
    const rec = await import('../../recommendations/src/service.js');
    const ro = await import('../../recommendations/src/outcomes.js');
    const REC_TYPE_AR: Record<string, string> = { create_task: 'اعمل مهمة', draft_whatsapp_reply: 'ردّ واتساب', draft_payment_reminder: 'تذكير دفع', review_proof: 'مراجعة إثبات', deliver_access: 'تسليم', build_repair_plan: 'خطة إصلاح', apply_playbook: 'تطبيق playbook' };
    const CONF_AR: Record<string, string> = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };

    if (intent === 'what_learned_recommendations') {
      const learning = await ro.getRecLearning(tenantId).catch(() => []) as any[];
      const usable = learning.filter((l) => !l.limited);
      if (!usable.length) return informational('بيانات نتائج التوصيات لسه محدودة.');
      const lines = usable.slice(0, 5).map((l) => `• ${REC_TYPE_AR[l.recommendationType] ?? l.recommendationType}: ${l.note} (ثقة ${CONF_AR[l.confidence]})`).join('\n');
      return { actionKind: 'informational', requiresConfirmation: false, summary: 'اللي اتعلمناه من نتائج التوصيات:', preview: lines, navigate: { tab: 'recommendations' } };
    }
    if (intent === 'measure_recommendation_outcomes') {
      const applied = await rec.listRecommendations(tenantId, ctx.funnelId, 'all').catch(() => []) as any[];
      // also measure already-applied ones
      const ids = await (async () => { const all = await rec.recommendationsSummary(tenantId, ctx.funnelId).catch(() => null); return all; })();
      let n = 0;
      for (const r of applied) { if (r.status === 'applied' || r.applied_at) { await ro.checkRecommendationOutcome(tenantId, r.id).catch(() => null); n++; } }
      return { actionKind: 'task_creation', requiresConfirmation: false, summary: `اتقاست نتايج ${n} توصية متطبّقة.`, preview: 'القياس بالدليل بس — مفيش نجاح مفبرك.', navigate: { tab: 'recommendations' } };
    }
    if (intent === 'which_recommendations_worked' || intent === 'did_recommendation_work' || intent === 'rank_recommendations_by_result') {
      const sum = await ro.recOutcomesSummary(tenantId, ctx.funnelId).catch(() => null) as any;
      if (!sum) return informational('لسه مفيش نتايج توصيات مقيسة.');
      const s = sum.summary;
      const val = sum.knownValueCaptured != null ? `\nقيمة معروفة اتحصّلت: ${Math.round(sum.knownValueCaptured)}` : '';
      return { actionKind: 'informational', requiresConfirmation: false,
        summary: `اشتغلت: ${s.worked || 0} · مفيش نتيجة: ${s.no_result || 0} · إشارة مبكرة: ${s.early_signal || 0} · مستنية دليل: ${s.awaiting_evidence || 0}`,
        preview: `الأرقام من دليل مرصود بس — مفيش نجاح مفبرك.${val}`, navigate: { tab: 'recommendations' } };
    }
    // which_recommendations_fail
    const learning = await ro.getRecLearning(tenantId).catch(() => []) as any[];
    const weak = learning.filter((l) => !l.limited && l.workRate != null && l.workRate <= 0.3);
    if (!weak.length) return informational('مفيش نوع توصيات بنتيجة ضعيفة واضحة دلوقتي.');
    return { actionKind: 'informational', requiresConfirmation: false,
      summary: `${weak.length} نوع توصية نتيجتها ضعيفة تاريخيًا.`,
      preview: weak.slice(0, 4).map((l) => `• ${REC_TYPE_AR[l.recommendationType] ?? l.recommendationType}: ${l.worked}/${l.decided}`).join('\n') + '\nفكّر في مقاربة بديلة.', navigate: { tab: 'recommendations' } };
  }

  if (['continue_activation', 'whats_needed_to_publish', 'first_step_now', 'is_funnel_ready', 'where_first_signal', 'open_activation'].includes(intent)) {
    if (!ctx.funnelId) return informational('افتح قمع الأول.');
    const { getActivationStatus } = await import('../../activation/src/service.js');
    const act = await getActivationStatus(tenantId, ctx.funnelId).catch(() => null) as any;
    if (!act) return informational('تعذّر تحميل حالة التفعيل.');
    const fmtSteps = (steps: any[]) => steps.filter((s) => s.status !== 'done').slice(0, 6).map((s, i) => `${i + 1}. ${s.label} — ${s.nextAction}`).join('\n');
    const stageLabel: Record<string, string> = { setup: 'إعداد', publish_ready: 'جاهز للنشر', traffic_ready: 'جاهز للترافيك', lead_ready: 'وصلوا leads', revenue_ops_ready: 'تشغيل إيراد', learning_ready: 'بيتعلّم' };

    if (intent === 'open_activation' || intent === 'continue_activation') {
      return { actionKind: 'navigation', requiresConfirmation: false, summary: `التفعيل: ${stageLabel[act.stage] ?? act.stage} (${act.readinessScore}%)`, preview: act.nextAction ? `الخطوة الجاية: ${act.nextAction.label}\n${act.nextAction.nextAction}` : 'البيزنس مفعّل بالكامل ✓', navigate: { tab: 'activation' } };
    }
    if (intent === 'whats_needed_to_publish') {
      const pubSteps = (act.steps as any[]).filter((s) => (s.section === 'setup' || s.section === 'publish') && s.status !== 'done');
      return { actionKind: 'informational', requiresConfirmation: false, summary: act.launchReady ? 'جاهز للنشر ✓' : (act.blockingReason ?? 'فيه خطوات ناقصة:'), preview: pubSteps.length ? fmtSteps(pubSteps) : 'كل خطوات النشر تمّت.', navigate: { tab: 'activation' } };
    }
    if (intent === 'is_funnel_ready') {
      return { actionKind: 'informational', requiresConfirmation: false, summary: act.launchReady ? `الفانل جاهز يستقبل أول signal ✓ (${act.readinessScore}%)` : `لسه مش جاهز — ${act.blockingReason ?? ''}`, preview: act.nextAction ? `الخطوة الجاية: ${act.nextAction.nextAction}` : '', navigate: { tab: 'activation' } };
    }
    if (intent === 'where_first_signal') {
      const sig = (act.steps as any[]).filter((s) => s.section === 'first_signals');
      return { actionKind: 'informational', requiresConfirmation: false, summary: 'أول الإشارات الحيّة:', preview: sig.map((s) => `${s.status === 'done' ? '✓' : '•'} ${s.label} — ${s.evidence}`).join('\n'), navigate: { tab: 'activation' } };
    }
    // first_step_now
    return { actionKind: 'informational', requiresConfirmation: false, summary: act.nextAction ? `أول خطوة دلوقتي: ${act.nextAction.label}` : 'مفيش خطوات ناقصة ✓', preview: act.nextAction ? act.nextAction.nextAction : '', navigate: { tab: 'activation' } };
  }

  if (['open_revenue_desk', 'top_five_things', 'whats_waiting_approval', 'whats_needs_measurement', 'whats_blocked'].includes(intent)) {
    if (!ctx.funnelId) return informational('افتح قمع الأول.');
    const { getRevenueDesk } = await import('../../revenue-desk/src/service.js');
    const desk = await getRevenueDesk(tenantId, ctx.funnelId).catch(() => null) as any;
    if (!desk || !desk.items.length) return { actionKind: 'navigation', requiresConfirmation: false, summary: 'مكتب الإيراد فاضي دلوقتي — مفيش حاجة مستعجلة.', navigate: { tab: 'revenue-desk' } };

    if (intent === 'open_revenue_desk') {
      const t = desk.topItem;
      return { actionKind: 'navigation', requiresConfirmation: false, summary: t ? `${t.icon} أهم حاجة: ${t.title}` : 'مكتب الإيراد', preview: t ? `${t.whyRankedHere}\nالإجراء: ${t.primaryAction}` : '', navigate: { tab: 'revenue-desk' } };
    }
    const fmt = (its: any[]) => its.slice(0, 5).map((i, n) => `${n + 1}. ${i.icon} ${i.title} — ${i.label}`).join('\n');
    if (intent === 'top_five_things') {
      return { actionKind: 'informational', requiresConfirmation: false, summary: 'أهم ٥ حاجات دلوقتي:', preview: fmt(desk.items), navigate: { tab: 'revenue-desk' } };
    }
    if (intent === 'whats_waiting_approval') {
      const w = desk.items.filter((i: any) => i.section === 'waiting_approval');
      return { actionKind: 'informational', requiresConfirmation: false, summary: w.length ? `${w.length} حاجة تنتظر موافقتك:` : 'مفيش حاجة تنتظر موافقة.', preview: fmt(w), navigate: { tab: 'revenue-desk' } };
    }
    if (intent === 'whats_needs_measurement') {
      const m = desk.items.filter((i: any) => i.section === 'needs_measurement');
      return { actionKind: 'informational', requiresConfirmation: false, summary: m.length ? `${m.length} حاجة محتاجة قياس:` : 'مفيش حاجة محتاجة قياس.', preview: fmt(m), navigate: { tab: 'revenue-desk' } };
    }
    // whats_blocked → system attention + partially applied
    const blocked = desk.items.filter((i: any) => i.section === 'system_attention' || i.type === 'repair_plan_partially_applied');
    return { actionKind: 'informational', requiresConfirmation: false, summary: blocked.length ? `${blocked.length} حاجة واقفة محتاجة انتباه:` : 'مفيش حاجة واقفة.', preview: fmt(blocked), navigate: { tab: 'revenue-desk' } };
  }

  if (['what_to_do_now', 'best_action_for_opportunity', 'top_actions_today', 'rank_actions_by_conversion', 'write_suggested_message', 'task_for_best_opportunity'].includes(intent)) {
    if (!ctx.funnelId) return informational('افتح قمع الأول.');
    const rec = await import('../../recommendations/src/service.js');
    await rec.refreshRecommendations(tenantId, ctx.funnelId).catch(() => null);
    const CONF_AR: Record<string, string> = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };
    const SRC_AR: Record<string, string> = { attribution: 'تعلّم النَسب', heuristic: 'المرحلة والإلحاح', mixed: 'مختلط', opportunity_outcomes: 'نتائج الفرص', repair_outcomes: 'نتائج الإصلاح', playbook_outcomes: 'نتائج التطبيق' };
    const list = await rec.listRecommendations(tenantId, ctx.funnelId, 'all').catch(() => []) as any[];
    if (!list.length) return informational('مفيش توصيات دلوقتي — جدّد الفرص الأول.');

    if (intent === 'top_actions_today' || intent === 'rank_actions_by_conversion') {
      const lines = list.slice(0, 5).map((r, i) => `${i + 1}. ${r.title} — ثقة ${CONF_AR[r.confidence]} (${SRC_AR[r.learning_source] ?? r.learning_source})`).join('\n');
      return { actionKind: intent === 'rank_actions_by_conversion' ? 'task_creation' : 'informational', requiresConfirmation: false,
        summary: 'أفضل الإجراءات دلوقتي:', preview: lines, navigate: { tab: 'recommendations' } };
    }
    if (intent === 'task_for_best_opportunity') {
      const top = list.find((r) => ['create_task', 'review_proof', 'deliver_access', 'mark_needs_followup'].includes(r.recommendation_type)) ?? list[0];
      const r = await rec.applyRecommendation(tenantId, top.id, true).catch(() => null) as any;
      return { actionKind: 'task_creation', requiresConfirmation: false, summary: r?.ok ? `اتعملت مهمة لأفضل فرصة: ${top.title} ✓` : 'تعذّر تنفيذ التوصية.', preview: top.explanation, navigate: { tab: 'recommendations' } };
    }
    if (intent === 'write_suggested_message') {
      const draft = list.find((r) => ['draft_whatsapp_reply', 'draft_payment_reminder'].includes(r.recommendation_type));
      if (!draft) return informational('مفيش رسالة مقترحة دلوقتي.');
      return { actionKind: 'draft_message', requiresConfirmation: true,
        summary: `مقترح: ${draft.title}`, preview: `${draft.explanation}\n(مسودّة فقط — مفيش إرسال تلقائي.)`, navigate: { tab: 'recommendations' }, payload: { kind: 'recommendation', recommendationId: draft.id } };
    }
    // what_to_do_now / best_action_for_opportunity → top recommendation
    const top = list[0];
    const cr = (top.evidence && typeof top.evidence === 'object' && top.evidence.captureRate != null) ? ` · معدل تحويل مشابه: ${Math.round(top.evidence.captureRate * 100)}%` : '';
    return { actionKind: 'informational', requiresConfirmation: false,
      summary: `أفضل إجراء دلوقتي: ${top.title} (ثقة ${CONF_AR[top.confidence]}).`,
      preview: `${top.explanation}\nالمصدر: ${SRC_AR[top.learning_source] ?? top.learning_source}${cr}\nالأثر المتوقع: ${top.expected_effect ?? '—'}`,
      navigate: { tab: 'recommendations' }, payload: { kind: 'recommendation', recommendationId: top.id } };
  }

  if (['what_drove_capture', 'which_actions_convert', 'best_action_for_waiting_payment', 'do_whatsapp_replies_work', 'rank_by_working_actions', 'explain_attribution'].includes(intent)) {
    if (!ctx.funnelId) return informational('افتح قمع الأول.');
    const attr = await import('../../attribution/src/service.js');
    const ACTION_AR: Record<string, string> = { task_completed: 'إكمال مهمة', whatsapp_reply_marked_sent: 'إرسال ردّ واتساب', payment_reminder_drafted: 'تذكير دفع', proof_review_task: 'مراجعة إثبات', access_delivery_task: 'مهمة تسليم', repair_plan_applied: 'تطبيق إصلاح', playbook_application_applied: 'تطبيق playbook', command_applied: 'أمر Command Bar', scheduled_action: 'إجراء مجدوَل', page_section_updated: 'تعديل الصفحة', offer_updated: 'تعديل العرض', unknown: 'غير معروف' };
    const STR_AR: Record<string, string> = { strong: 'قوي', medium: 'متوسط', weak: 'ضعيف', none: 'مفيش' };
    const CONF_AR: Record<string, string> = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };

    if (intent === 'which_actions_convert' || intent === 'rank_by_working_actions' || intent === 'do_whatsapp_replies_work') {
      const learning = await attr.getAttributionLearning(tenantId).catch(() => []) as any[];
      const usable = learning.filter((l) => !l.limited);
      if (intent === 'do_whatsapp_replies_work') {
        const wa = learning.find((l) => l.attributedActionType === 'whatsapp_reply_marked_sent');
        if (!wa) return informational('لسه مفيش بيانات نَسب كفاية لردود واتساب.');
        return { actionKind: 'informational', requiresConfirmation: false,
          summary: wa.limited ? 'بيانات ردود واتساب لسه محدودة.' : `ردود واتساب ارتبطت بتحصيل في ${wa.capturedCount} من ${wa.attempts} حالة.`,
          preview: `معدل الارتباط: ${Math.round(wa.captureRate * 100)}% · ثقة: ${CONF_AR[wa.confidence]}\n(ده ارتباط بالدليل، مش إثبات سببية.)`, navigate: { tab: 'opportunities' } };
      }
      if (!usable.length) return informational('بيانات نَسب الإجراءات لسه محدودة — محتاجين تحصيلات مقيسة أكتر.');
      const lines = usable.slice(0, 5).map((l) => `• ${ACTION_AR[l.attributedActionType] ?? l.attributedActionType}: ${l.capturedCount}/${l.attempts} (${Math.round(l.captureRate * 100)}%) · ثقة ${CONF_AR[l.confidence]}`).join('\n');
      return { actionKind: intent === 'rank_by_working_actions' ? 'task_creation' : 'informational', requiresConfirmation: false,
        summary: 'الإجراءات الأكثر ارتباطًا بالتحصيل:', preview: `${lines}\n(ارتباط بالدليل، مش سببية مؤكدة.)`, navigate: { tab: 'opportunities' } };
    }

    if (intent === 'best_action_for_waiting_payment') {
      const rec = await attr.recommendedActionFor(tenantId, 'waiting_payment_recovery').catch(() => null) as any;
      if (!rec) return informational('لسه مفيش بيانات نَسب كفاية لـ waiting payment.');
      return { actionKind: 'informational', requiresConfirmation: false, summary: `الإجراء الأكثر تأثيرًا: ${ACTION_AR[rec.actionType] ?? rec.actionType}.`, preview: rec.note, navigate: { tab: 'opportunities' } };
    }

    // what_drove_capture / explain_attribution → newest attributed capture on this funnel
    const sum = await attr.attributionSummary(tenantId).catch(() => null) as any;
    if (!sum || !sum.top.length) return informational('لسه مفيش تحصيلات منسوبة لإجراءات. قيس نتايج الفرص الأول.');
    const lines = sum.top.map((t: any) => `• ${ACTION_AR[t.action] ?? t.action}: ${t.count} تحصيل (${t.strong} منهم نَسب قوي)${t.knownValue ? ` · قيمة معروفة: ${Math.round(t.knownValue)}` : ''}`).join('\n');
    return { actionKind: 'informational', requiresConfirmation: false,
      summary: 'أكثر الإجراءات ارتباطًا بالتحصيل:',
      preview: `${lines}${sum.unknownAttribution ? `\nبدون نَسب واضح: ${sum.unknownAttribution}` : ''}\n(ارتباط بالدليل، مش إثبات سببية.)`, navigate: { tab: 'opportunities' } };
  }

  if (['which_opportunities_captured', 'what_learned_opportunities', 'check_opportunity_outcome', 'rank_by_conversion', 'high_priority_not_converting'].includes(intent)) {
    if (!ctx.funnelId) return informational('افتح قمع الأول.');
    const opp = await import('../../opportunities/src/service.js');
    const oc = await import('../../opportunities/src/outcomes.js');
    if (intent === 'what_learned_opportunities') {
      const learning = await oc.getLearning(tenantId).catch(() => []) as any[];
      const decided = learning.filter((l) => !l.limited);
      if (!decided.length) return informational('بيانات تعلّم الفرص لسه محدودة — محتاجين نتايج مقيسة أكتر.');
      const lines = decided.slice(0, 5).map((l) => `• ${l.opportunityType}: ${l.note} (ثقة: ${l.confidence})`).join('\n');
      return { actionKind: 'informational', requiresConfirmation: false, summary: 'اللي اتعلمناه من فرص الإيراد:', preview: lines, navigate: { tab: 'opportunities' } };
    }
    if (intent === 'which_opportunities_captured' || intent === 'check_opportunity_outcome') {
      const sum = await oc.outcomesSummary(tenantId, ctx.funnelId).catch(() => null) as any;
      if (!sum) return informational('لسه مفيش نتايج فرص مقيسة.');
      const s = sum.summary;
      const valLine = sum.knownValueCaptured != null ? `\nقيمة معروفة اتحصّلت: ${Math.round(sum.knownValueCaptured)}` : '';
      return { actionKind: 'informational', requiresConfirmation: false,
        summary: `اتحصّل: ${s.captured || 0} · ضاع: ${s.missed || 0} · انتهى: ${s.expired || 0} · مستني دليل: ${s.awaiting_evidence || 0}`,
        preview: `الأرقام دي من دليل مرصود بس — مفيش capture مفبرك.${valLine}`, navigate: { tab: 'opportunities' } };
    }
    if (intent === 'rank_by_conversion') {
      await opp.refreshOpportunities(tenantId, ctx.funnelId).catch(() => null); // refresh applies learning to scores
      return { actionKind: 'task_creation', requiresConfirmation: false, summary: 'اترتّبت الفرص بناءً على اللي بيتحوّل فعلًا.', preview: 'الترتيب بياخد معدل التحويل المقيس في الاعتبار، من غير ما يدوس على الإلحاح الواضح.', navigate: { tab: 'opportunities' } };
    }
    // high_priority_not_converting
    const list = await opp.listOpportunities(tenantId, ctx.funnelId, 'urgent').catch(() => []) as any[];
    const learnMap: Record<string, any> = {};
    for (const l of (await oc.getLearning(tenantId).catch(() => []) as any[])) learnMap[l.opportunityType] = l;
    const weak = list.filter((o) => { const lm = learnMap[o.opportunity_type]; return lm && !lm.limited && lm.captureRate != null && lm.captureRate <= 0.3; });
    if (!weak.length) return informational('مفيش فرص عالية الأولوية بتاريخ تحويل ضعيف دلوقتي.');
    return { actionKind: 'informational', requiresConfirmation: false,
      summary: `${weak.length} فرصة عالية الأولوية بس تاريخ تحويلها ضعيف.`,
      preview: weak.slice(0, 4).map((o) => `• ${o.title}`).join('\n') + '\nراجِع الإجراء أو غيّر المقاربة.', navigate: { tab: 'opportunities' } };
  }

  if (['nearest_revenue', 'list_opportunities', 'fastest_opportunity', 'leads_closest_to_payment', 'open_payment_opportunities', 'tasks_for_top_opportunities', 'summarize_opportunities', 'known_value_opportunities'].includes(intent)) {
    if (!ctx.funnelId) return informational('افتح قمع الأول.');
    const opp = await import('../../opportunities/src/service.js');
    await opp.refreshOpportunities(tenantId, ctx.funnelId).catch(() => null);
    if (intent === 'list_opportunities' || intent === 'open_payment_opportunities') {
      return { actionKind: 'navigation', requiresConfirmation: false, summary: 'فتحت فرص الإيراد.', preview: '',
        navigate: { tab: 'opportunities' } };
    }
    if (intent === 'summarize_opportunities') {
      const sum = await opp.opportunitySummary(tenantId, ctx.funnelId).catch(() => null) as any;
      if (!sum || !sum.open) return informational('مفيش فرص إيراد مفتوحة دلوقتي.');
      const v = sum.value;
      const valLine = v.knownTotal != null ? `قيمة معروفة: ${Math.round(v.knownTotal)} ${v.currency} (من ${v.withValue} فرصة) · ${v.withoutValue} فرصة من غير قيمة معروفة` : `${sum.open} فرصة قابلة للتنفيذ (من غير قيمة صفقة معروفة)`;
      return { actionKind: 'informational', requiresConfirmation: false,
        summary: `${sum.open} فرصة مفتوحة · ${sum.capturedThisWeek} اتحصّلت الأسبوع ده.`,
        preview: `${valLine}\nالأعلى أولوية: ${sum.top?.title ?? '—'}`, navigate: { tab: 'opportunities' } };
    }
    const filter = intent === 'leads_closest_to_payment' ? 'payment' : intent === 'known_value_opportunities' ? 'high_value' : 'all';
    const list = await opp.listOpportunities(tenantId, ctx.funnelId, filter).catch(() => []) as any[];
    if (!list.length) return informational(intent === 'known_value_opportunities' ? 'مفيش فرص بقيمة صفقة معروفة دلوقتي.' : 'مفيش فرص إيراد مفتوحة دلوقتي.');
    if (intent === 'tasks_for_top_opportunities') {
      let made = 0;
      for (const o of list.slice(0, 3)) { const r = await opp.createTaskForOpportunity(tenantId, o.id).catch(() => null) as any; if (r?.ok) made++; }
      return { actionKind: 'task_creation', requiresConfirmation: false, summary: `اتعملت ${made} مهمة لأعلى الفرص.`, preview: 'المهام متسجّلة على العملاء — من غير إرسال تلقائي.', navigate: { tab: 'opportunities' } };
    }
    const top = list[0];
    const conf = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية' }[top.confidence as string] ?? top.confidence;
    const val = top.estimated_value != null ? `\nقيمة تقديرية: ${Math.round(Number(top.estimated_value))} ${top.value_currency} (estimated from observed deal value)` : '';
    return { actionKind: 'informational', requiresConfirmation: false,
      summary: `${top.title} — أولوية ${top.priority_score} (${top.urgency}).`,
      preview: `${top.explanation}\nالثقة: ${conf}${val}\nأول إجراء: ${top.recommended_action}`,
      navigate: { tab: 'opportunities' }, payload: { kind: 'opportunity', opportunityId: top.id } };
  }

  if (['refresh_business_intelligence', 'weekly_business_report', 'what_needs_measuring', 'what_is_overdue', 'refresh_portfolio_insights', 'measure_all_due'].includes(intent)) {
    const sched = await import('../../scheduler/src/service.js');
    if (intent === 'refresh_business_intelligence') {
      const r = await sched.dailyBusinessRefresh(tenantId).catch(() => null) as any;
      if (!r || r.error) return informational('تعذّر تشغيل التحديث.');
      const sm = r.summary ?? {};
      return { actionKind: 'scheduled_run', requiresConfirmation: false,
        summary: r.alreadyDone ? 'التحديث اليومي اتعمل قبل كده النهاردة (idempotent).' : 'اتعمل تحديث ذكاء البيزنس ✓',
        preview: `قمعات: ${sm.funnelsChecked ?? 0} · تسريبات جديدة: ${sm.newLeaks ?? 0} · إجراءات: ${sm.actionsCreated ?? 0} · محتاج قياس: ${(sm.repairsDue ?? 0) + (sm.applicationsDue ?? 0)} · اتجاهل لقلة بيانات: ${sm.skipped ?? 0}`,
        navigate: { tab: 'rhythm' }, payload: { kind: 'scheduled_run', runId: r.runId } };
    }
    if (intent === 'weekly_business_report') {
      const r = await sched.weeklyBusinessReport(tenantId).catch(() => null) as any;
      if (!r || r.error) return informational('تعذّر توليد التقرير الأسبوعي.');
      const sm = r.summary ?? {};
      const top = (sm.topFunnels ?? []).map((f: any) => `• ${f.name} (${f.health})`).join('\n');
      return { actionKind: 'informational', requiresConfirmation: false,
        summary: r.alreadyDone ? 'التقرير الأسبوعي للبيزنس اتعمل قبل كده الأسبوع ده.' : 'اتولّد تقرير أسبوعي للبيزنس ✓',
        preview: `قمعات: ${sm.funnels ?? 0}\nالأقوى:\n${top || '—'}${(sm.needingAttention ?? []).length ? `\nمحتاجة انتباه: ${sm.needingAttention.join('، ')}` : ''}`,
        navigate: { tab: 'rhythm' }, payload: { kind: 'weekly_report', runId: r.runId } };
    }
    if (intent === 'refresh_portfolio_insights') {
      const r = await sched.portfolioAnalysisRefresh(tenantId).catch(() => null) as any;
      return { actionKind: 'scheduled_run', requiresConfirmation: false,
        summary: 'اتحدّثت ملاحظات المحفظة ✓', preview: `ملاحظات: ${r?.insights ?? 0} · نقل ممكن: ${r?.transfers ?? 0}`,
        navigate: { tab: 'portfolio' }, payload: { kind: 'portfolio_refresh' } };
    }
    if (intent === 'what_needs_measuring' || intent === 'what_is_overdue') {
      const rd = await sched.repairOutcomeDueCheck(tenantId).catch(() => ({ due: 0 })) as any;
      const ad = await sched.applicationOutcomeDueCheck(tenantId).catch(() => ({ due: 0 })) as any;
      const total = (rd.due ?? 0) + (ad.due ?? 0);
      return { actionKind: 'informational', requiresConfirmation: false,
        summary: total ? `${total} حاجة محتاجة قياس دلوقتي.` : 'مفيش حاجة مستحقة القياس دلوقتي.',
        preview: `إصلاحات مستحقة: ${rd.due ?? 0} · تطبيقات playbook مستحقة: ${ad.due ?? 0}\n(بنقيس بس لما الوقت/البيانات تكفي.)`,
        navigate: { tab: 'rhythm' } };
    }
    if (intent === 'measure_all_due') {
      // surfaces what's due (measurement itself stays explicit per item / safe)
      const rd = await sched.repairOutcomeDueCheck(tenantId).catch(() => ({ due: 0 })) as any;
      const ad = await sched.applicationOutcomeDueCheck(tenantId).catch(() => ({ due: 0 })) as any;
      return { actionKind: 'scheduled_run', requiresConfirmation: false,
        summary: `اترصد ${(rd.due ?? 0) + (ad.due ?? 0)} عنصر مستحق القياس — راجِعهم من Action Center.`,
        preview: 'الـ fnnlr بيرصد المستحق بس؛ القياس بيفضل واضح لكل عنصر عشان مفيش نتائج مفبركة.',
        navigate: { tab: 'rhythm' } };
    }
  }

  if (['compare_funnels', 'strongest_funnel', 'weakest_funnel', 'funnels_needing_repair', 'best_offer_angle', 'transfer_playbook'].includes(intent)) {
    const { analyzePortfolio, listInsights } = await import('../../portfolio/src/service.js');
    await analyzePortfolio(tenantId).catch(() => null);
    const insights = await listInsights(tenantId, 'open').catch(() => []) as any[];
    if (!insights.length) return informational('لسه مفيش بيانات كفاية للمقارنة بين القمعات.');
    // pick the most relevant insight for the intent
    const pick = (types: string[]) => insights.find((i) => types.includes(i.insight_type));
    let ins: any;
    if (intent === 'strongest_funnel') ins = pick(['strongest_funnel']);
    else if (intent === 'weakest_funnel') ins = pick(['underperforming_page', 'payment_friction', 'weakest_funnel']);
    else if (intent === 'funnels_needing_repair') ins = pick(['underperforming_page', 'payment_friction', 'missing_tracking']);
    else if (intent === 'transfer_playbook') ins = pick(['transferable_playbook']);
    else if (intent === 'best_offer_angle') ins = pick(['offer_angle', 'strongest_funnel']);
    ins = ins ?? insights[0];
    const conf = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية' }[ins.confidence as string] ?? ins.confidence;
    const others = insights.filter((i) => i.id !== ins.id).slice(0, 3).map((i) => '• ' + i.title).join('\n');
    return {
      actionKind: 'informational', requiresConfirmation: false,
      summary: `${ins.title} (ثقة: ${conf}).`,
      preview: `${ins.explanation}${others ? '\n\nملاحظات أخرى:\n' + others : ''}`,
      navigate: { tab: 'portfolio' },
      payload: { kind: 'portfolio', insightType: ins.insight_type },
    };
  }

  if (['measure_application_outcome', 'did_application_work', 'what_learned_application'].includes(intent)) {
    if (!ctx.funnelId) return informational('افتح قمع الأول.');
    const { listApplicationPlans } = await import('../../playbooks/src/apply-service.js');
    const plans = await listApplicationPlans(tenantId, ctx.funnelId).catch(() => []) as any[];
    const applied = plans.find((p) => p.status === 'applied' || p.status === 'partially_applied');
    if (!applied) return informational('مفيش تطبيق playbook اتعمل لسه — اعمل Optimization Plan الأول.');
    const { measureApplicationOutcome } = await import('../../playbooks/src/app-outcomes.js');
    const o = await measureApplicationOutcome(tenantId, applied.id).catch(() => null) as any;
    if (!o || o.state === 'not_applied') return informational('التطبيق لسه ماتطبّقش بالكامل.');
    const conf = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية' }[o.confidence as string] ?? o.confidence;
    return {
      actionKind: 'informational', requiresConfirmation: false,
      summary: `نتيجة تطبيق الـ playbook: ${o.status} (ثقة: ${conf}).`,
      preview: `${o.interpretation}\nالخطوة المقترحة: ${o.recommendedNextAction}`,
      navigate: { tab: 'leaks' },
      payload: { kind: 'application_outcome', applicationPlanId: applied.id, status: o.status },
    };
  }

  if (['apply_best_playbook', 'optimize_funnel_from_learning', 'apply_page_playbook', 'apply_whatsapp_playbook', 'apply_payment_playbook'].includes(intent)) {
    if (!ctx.funnelId) return informational('افتح قمع الأول.');
    const scope = intent === 'apply_page_playbook' ? 'page' : intent === 'apply_whatsapp_playbook' ? 'whatsapp' : intent === 'apply_payment_playbook' ? 'payment' : 'all';
    const { planPlaybookApplication } = await import('../../playbooks/src/apply-service.js');
    const built = await planPlaybookApplication(tenantId, ctx.funnelId, scope as any).catch(() => null);
    if (!built || (built as any).noChanges) return informational('القمع متوافق مع الـ playbook الحالي — مفيش تغييرات مقترحة دلوقتي.');
    if (!(built as any).planId) return informational('تعذّر بناء خطة تطبيق.');
    const conf = (built as any).confidence;
    return {
      actionKind: 'leak_repair_plan', requiresConfirmation: false,
      summary: `اتبنت خطة تحسين للقمع (${(built as any).steps} تغيير، ثقة: ${conf}) — راجِعها ووافِق.`,
      preview: conf === 'low' ? 'بيانات التعلّم محدودة؛ دي تحسينات افتراضية محتاجة موافقتك.' : 'تحسينات مبنية على التعلّم — راجِع الـ diff قبل الموافقة.',
      navigate: { tab: 'leaks' },
      payload: { kind: 'open_application', applicationPlanId: (built as any).planId },
    };
  }

  if (intent === 'explain_playbook' || intent === 'explain_funnel_reasoning' || intent === 'what_learned_payment') {
    const ptype = intent === 'what_learned_payment' ? 'payment' : intent === 'explain_funnel_reasoning' ? 'funnel' : 'page';
    const { explainPlaybook } = await import('../../playbooks/src/service.js');
    const pb = await explainPlaybook(tenantId, ptype as any).catch(() => null);
    if (!pb) return informational('لسه مفيش بيانات تعلّم كفاية لبناء playbook.');
    const adj = pb.adjustments.slice(0, 3).map((a: string) => '• ' + a).join('\n');
    const head = pb.limited
      ? `بيانات التعلّم لسه محدودة (عينة: ${pb.sampleSize}، محسوم: ${pb.decidedCount}) — playbook افتراضي.`
      : `playbook متعلّم (ثقة: ${pb.confidence}، عينة: ${pb.sampleSize}، محسوم: ${pb.decidedCount}).`;
    return {
      actionKind: 'informational', requiresConfirmation: false,
      summary: `${head}`,
      preview: `${pb.note}\n\nالتوصيات:\n${adj}`,
      payload: { kind: 'playbook', playbookType: ptype, confidence: pb.confidence, sampleSize: pb.sampleSize },
    };
  }

  if (['summarize_week', 'create_team_report', 'explain_what_changed', 'generate_next_week_focus'].includes(intent)) {
    if (!ctx.funnelId) return informational('افتح قمع فيه بيانات الأول.');
    const rep = await generateReport(tenantId, ctx.funnelId, llm).catch(() => null);
    if (!rep) return informational('محتاج قمع فيه بيانات.');
    return {
      actionKind: 'report_generation', requiresConfirmation: false,
      summary: 'اتولّد تقرير الأسبوع — تقدر تنسخه وتبعته للفريق.',
      preview: rep.report.executiveSummary,
      navigate: { tab: 'report' },
      payload: { kind: 'report', reportId: rep.reportId },
    };
  }

  if (intent === 'explain_payment_steps' || intent === 'fix_waiting_payment_leak') {
    return informational('تابع العملاء «بانتظار الدفع» من تبويب العملاء، واستخدم تذكير الدفع من الـ copilot.');
  }

  return { actionKind: 'informational', requiresConfirmation: false, summary: '', preview: 'ممكن توضّح أكتر؟ مثلاً: «صلّح أكبر تسريب»، «هات العملاء المنتظرين الدفع»، «حسّن العرض».' };
}

function informational(text: string): PlannedAction {
  return { actionKind: 'informational', requiresConfirmation: false, summary: '', preview: text };
}
function leakRoute(rec?: string): { tab?: string; leadFilter?: string } {
  if (!rec) return { tab: 'leaks' };
  if (rec.startsWith('open_leads:')) return { tab: 'leads', leadFilter: rec.split(':')[1] };
  if (rec === 'open_page') return { tab: 'page' };
  if (rec === 'open_payment') return { tab: 'payment' };
  if (rec === 'open_whatsapp') return { tab: 'whatsapp' };
  if (rec === 'open_capture' || rec === 'create_tracked_link') return { tab: 'capture' };
  return { tab: 'leaks' };
}
function sectionDiff(before: any, after: any): { field: string; before: string; after: string }[] {
  const out: { field: string; before: string; after: string }[] = [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of keys) {
    const b = (before?.[k] ?? '').toString(); const a = (after?.[k] ?? '').toString();
    if (b !== a && (b || a)) out.push({ field: k, before: b.slice(0, 160), after: a.slice(0, 160) });
  }
  return out;
}
async function affectedLeads(tenantId: string, journeyId: string, filter: string): Promise<{ count: number; sample: { id: string; label: string }[] }> {
  return withTenant(tenantId, async (c) => {
    const where: Record<string, string> = {
      waiting_payment: `stage='waiting_payment'`,
      clicked_not_contacted: `stage='whatsapp_clicked'`,
      needs_followup: `stage='needs_followup'`,
      payment_stuck: `payment_status='stuck'`,
    };
    const cond = where[filter] ?? `TRUE`;
    const r = await c.query(`SELECT id, name FROM leads WHERE funnel_id=$1 AND deleted_at IS NULL AND ${cond} ORDER BY created_at DESC`, [journeyId]);
    return { count: r.rowCount ?? 0, sample: r.rows.slice(0, 3).map((x: any) => ({ id: x.id, label: x.name || 'عميل' })) };
  });
}

/**
 * APPLY: execute a previously-planned action. This is where real writes happen,
 * only after the user confirmed. Returns an after-snapshot + summary for audit.
 */
export async function applyPlanned(
  tenantId: string,
  payload: Record<string, unknown>,
  ctx: { funnelId?: string; leakId?: string },
): Promise<{ ok: boolean; after?: unknown; summary: string; affectedCount?: number; events: string[] }> {
  const kind = payload.kind as string;
  switch (kind) {
    case 'offer': {
      if (!ctx.funnelId) return { ok: false, summary: 'مفيش قمع', events: [] };
      await updateOffer(tenantId, ctx.funnelId, payload.after as any);
      return { ok: true, after: payload.after, summary: 'اتحدّث العرض ✓', events: ['offer_updated_from_command'] };
    }
    case 'section': {
      await updateSection(tenantId, payload.sectionId as string, { content: payload.after });
      return { ok: true, after: payload.after, summary: 'اتحدّث قسم الصفحة ✓', events: ['page_section_updated_from_command'] };
    }
    case 'bulk_tasks': {
      if (!ctx.funnelId) return { ok: false, summary: 'مفيش قمع', events: [] };
      const n = await createBulkTasks(tenantId, ctx.funnelId, payload.filter as string, payload.title as string, payload.taskKind as string);
      return { ok: true, summary: `اتعمل ${n} مهمة متابعة ✓`, affectedCount: n, events: ['bulk_action_confirmed', 'task_created_from_command'] };
    }
    case 'leak_status': {
      await updateLeakStatus(tenantId, payload.leakId as string, payload.status as string);
      return { ok: true, summary: 'اتعلّم التسريب قيد الإصلاح ✓', events: ['leak_repair_started'] };
    }
    case 'leak_task': {
      if (!ctx.funnelId) return { ok: false, summary: 'مفيش قمع', events: [] };
      await updateLeakStatus(tenantId, payload.leakId as string, 'fixing');
      const n = await createBulkTasks(tenantId, ctx.funnelId, 'all_open', payload.title as string, 'leak_repair', 1);
      return { ok: true, summary: 'اتعمل إجراء إصلاح واتعلّم التسريب قيد الإصلاح ✓', affectedCount: n, events: ['leak_repair_started', 'task_created_from_command'] };
    }
    case 'noop_navigate':
      return { ok: true, summary: 'اتفتح المكان ✓', events: [] };
    default:
      return { ok: true, summary: 'تم ✓', events: [] };
  }
}

async function createBulkTasks(tenantId: string, journeyId: string, filter: string, title: string, kind: string, cap = 200): Promise<number> {
  return withTenant(tenantId, async (c) => {
    const where: Record<string, string> = {
      waiting_payment: `stage='waiting_payment'`,
      clicked_not_contacted: `stage='whatsapp_clicked'`,
      needs_followup: `stage='needs_followup'`,
      all_open: `stage NOT IN ('paid','access_delivered','lost')`,
    };
    const cond = where[filter] ?? `TRUE`;
    const leads = await c.query(`SELECT id FROM leads WHERE funnel_id=$1 AND deleted_at IS NULL AND ${cond} LIMIT $2`, [journeyId, cap]);
    let n = 0;
    for (const l of leads.rows) {
      // don't duplicate an open task of the same title
      const ex = await c.query(`SELECT 1 FROM tasks WHERE lead_id=$1 AND title=$2 AND done=FALSE LIMIT 1`, [l.id, title]);
      if (ex.rowCount) continue;
      await c.query(`INSERT INTO tasks (lead_id, funnel_id, kind, title) VALUES ($1,$2,$3,$4)`, [l.id, journeyId, kind, title]);
      await c.query(`UPDATE leads SET next_action=$2, updated_at=now() WHERE id=$1`, [l.id, title]);
      n++;
    }
    return n;
  });
}
