import { withTenant } from '../../../packages/db/src/router.js';
import type { LLMClient } from '../../../packages/ai-core/src/gateway.js';
import { planRepair, alternativeFor, type LeakForPlan, type PlannedStep } from './planner.js';
import { getLearning } from './learning.js';
import { getBiggestLeak, updateLeakStatus } from '../../leaks/src/service.js';
import { runSectionAction, updateSection } from '../../pages/src/service.js';
import { draftReply } from '../../whatsapp/src/service.js';
import { createTrackedLink } from '../../capture/src/service.js';
import { refreshActions } from '../../actions/src/service.js';
import { captureBaselineMetrics } from './outcomes.js';

/**
 * Repairs service — turns a leak into an approved, auditable repair plan and
 * executes the SAFE steps after approval. Evidence → plan → approval →
 * execution → result tracking. No auto-send, no deletes, no auto mark-fixed.
 */

async function emit(c: any, type: string, payload: unknown) {
  await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'repairs',$2)`, [type, JSON.stringify(payload ?? {})]);
}

const LEAD_WHERE: Record<string, string> = {
  waiting_payment: `stage='waiting_payment'`,
  clicked_not_contacted: `stage='whatsapp_clicked'`,
  needs_followup: `stage='needs_followup'`,
  lost_no_reason: `stage='lost' AND lost_reason IS NULL`,
  proof_to_review: `EXISTS (SELECT 1 FROM payment_states p WHERE p.lead_id=leads.id AND p.proof_received=TRUE AND p.reviewed_at IS NULL)`,
  confirmed_not_delivered: `EXISTS (SELECT 1 FROM payment_states p WHERE p.lead_id=leads.id AND p.state='confirmed' AND p.access_delivered=FALSE)`,
};

async function countAffected(c: any, journeyId: string, filter?: string): Promise<number> {
  if (!filter || !LEAD_WHERE[filter]) return 0;
  const r = await c.query(`SELECT COUNT(*)::int AS n FROM leads WHERE funnel_id=$1 AND deleted_at IS NULL AND ${LEAD_WHERE[filter]}`, [journeyId]);
  return r.rows[0].n;
}

/** Build (and persist) a repair plan from a specific leak. */
export async function buildRepairFromLeak(tenantId: string, journeyId: string, leakId: string) {
  return withTenant(tenantId, async (c) => {
    const lk = await c.query(`SELECT id, code, lane, title, explanation, evidence, recommended_action FROM leak_findings WHERE id=$1 AND journey_id=$2`, [leakId, journeyId]);
    if (!lk.rowCount) return null;
    const leak: LeakForPlan = {
      code: lk.rows[0].code, lane: lk.rows[0].lane, title: lk.rows[0].title,
      explanation: lk.rows[0].explanation, evidence: lk.rows[0].evidence ?? {}, recommendedAction: lk.rows[0].recommended_action,
    };
    const draft = planRepair(leak);
    if (!draft) return { noEvidence: true };

    // ---- evidence-weighted: consult learning memory (honest, never fabricated) ----
    const market = (await c.query(`SELECT market FROM businesses ORDER BY created_at LIMIT 1`).catch(() => ({ rows: [{}] }))).rows[0]?.market ?? null;
    const learning = await getLearning(tenantId, draft.type, market);
    const alternative = alternativeFor(draft.type);
    // If history shows the primary mostly fails to move the metric, lead with low confidence
    // and reorder so the (safe, navigation) review steps surface first — but never delete steps.
    const historicallyWeak = learning.decidedCount >= 3 && (learning.successRate ?? 1) < 0.34;
    const strategySource = learning.limited ? 'heuristic' : 'learned';
    const learningNotes = {
      note: learning.limited ? `${learning.note} — هنستخدم الاستراتيجية الافتراضية.` : learning.note,
      sampleSize: learning.sampleSize, decidedCount: learning.decidedCount,
      improvedCount: learning.improvedCount, successRate: learning.successRate,
      market: learning.market, historicallyWeak,
      fallbackReason: learning.limited ? 'بيانات التعلّم محدودة' : null,
    };

    const affectedCount = await countAffected(c, journeyId, draft.affectedFilter);
    const plan = await c.query(
      `INSERT INTO repair_plans (journey_id, leak_id, type, status, title, explanation, evidence, affected_objects, risk_level, requires_confirmation,
          learning_confidence, learning_notes, alternative_strategy, selected_strategy, strategy_source)
       VALUES ($1,$2,$3,'proposed',$4,$5,$6,$7,$8,TRUE,$9,$10,$11,'primary',$12) RETURNING id`,
      [journeyId, leakId, draft.type, draft.title,
       historicallyWeak ? `${draft.explanation} (التاريخ بيقول إن النوع ده ضعيف — فكّر في البديل.)` : draft.explanation,
       JSON.stringify(leak.evidence),
       JSON.stringify({ filter: draft.affectedFilter, affectedCount }), draft.riskLevel,
       learning.confidence, JSON.stringify(learningNotes), JSON.stringify(alternative ?? {}), strategySource]);
    const planId = plan.rows[0].id;
    let order = 0;
    for (const s of draft.steps) {
      await c.query(
        `INSERT INTO repair_steps (repair_plan_id, step_type, title, description, payload, status, step_order, affected_count, learning_score, step_reason)
         VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9)`,
        [planId, s.stepType, s.title, s.description, JSON.stringify({ ...s.payload, requiresConfirmation: s.requiresConfirmation }), order++, affectedCount,
         learning.successRate ?? 0, learning.limited ? 'استراتيجية افتراضية' : 'مرتّبة حسب نتائج سابقة']);
    }
    await emit(c, 'repair_plan_created', { planId, type: draft.type, leakId, strategySource });
    return { planId, learning: learningNotes, confidence: learning.confidence };
  });
}

export async function buildRepairForBiggest(tenantId: string, journeyId: string) {
  const biggest = await getBiggestLeak(tenantId, journeyId);
  if (!biggest) return { noLeak: true };
  return buildRepairFromLeak(tenantId, journeyId, biggest.id);
}

export async function getRepair(tenantId: string, planId: string) {
  return withTenant(tenantId, async (c) => {
    const p = await c.query(`SELECT * FROM repair_plans WHERE id=$1`, [planId]);
    if (!p.rowCount) return null;
    const steps = await c.query(`SELECT * FROM repair_steps WHERE repair_plan_id=$1 ORDER BY step_order`, [planId]);
    return { plan: p.rows[0], steps: steps.rows };
  });
}

export async function listRepairs(tenantId: string, journeyId: string) {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT * FROM repair_plans WHERE journey_id=$1 ORDER BY created_at DESC`, [journeyId]);
    return r.rows;
  });
}

export async function approveRepair(tenantId: string, planId: string) {
  return withTenant(tenantId, async (c) => {
    await c.query(`UPDATE repair_plans SET status='approved', approved_at=now() WHERE id=$1 AND status='proposed'`, [planId]);
    await emit(c, 'repair_plan_approved', { planId });
    return { ok: true };
  });
}

export async function rejectRepair(tenantId: string, planId: string) {
  return withTenant(tenantId, async (c) => {
    await c.query(`UPDATE repair_plans SET status='rejected', rejected_at=now() WHERE id=$1`, [planId]);
    await emit(c, 'repair_plan_rejected', { planId });
    return { ok: true };
  });
}

/** (baseline capture lives in outcomes.ts: captureBaselineMetrics) */

/**
 * Apply the SAFE steps of an approved plan, one by one. Per-step before/after
 * snapshots; a single step failure → plan partially_applied (not full failure).
 * Never sends WhatsApp; drafts only. Bulk steps respect the affected count.
 */
export async function applyRepair(tenantId: string, planId: string, llm: LLMClient) {
  const meta = await withTenant(tenantId, async (c) => {
    const p = await c.query(`SELECT * FROM repair_plans WHERE id=$1`, [planId]);
    if (!p.rowCount) return null;
    if (!['approved', 'in_progress', 'partially_applied'].includes(p.rows[0].status)) return { notApproved: true, plan: p.rows[0] };
    return { plan: p.rows[0] };
  });
  if (!meta) return { error: 'not found' };
  if ((meta as any).notApproved) return { error: 'plan must be approved before apply' };
  const plan = (meta as any).plan;

  // baseline once (rich per-type metrics for outcome measurement)
  await withTenant(tenantId, async (c) => {
    if (!plan.baseline) {
      const baseline = await captureBaselineMetrics(c, plan);
      await c.query(`UPDATE repair_plans SET baseline=$2, status='in_progress', applied_at=COALESCE(applied_at, now()) WHERE id=$1`, [planId, JSON.stringify(baseline)]);
    } else {
      await c.query(`UPDATE repair_plans SET status='in_progress' WHERE id=$1`, [planId]);
    }
  });

  const steps = await withTenant(tenantId, async (c) =>
    (await c.query(`SELECT * FROM repair_steps WHERE repair_plan_id=$1 AND status='pending' ORDER BY step_order`, [planId])).rows);

  let applied = 0, failed = 0, skipped = 0;
  for (const step of steps) {
    try {
      const result = await applyStep(tenantId, plan, step, llm);
      await withTenant(tenantId, async (c) => {
        await c.query(`UPDATE repair_steps SET status=$2, after_snapshot=$3, result_summary=$4, affected_count=COALESCE($5, affected_count) WHERE id=$1`,
          [step.id, result.status, result.after != null ? JSON.stringify(result.after) : null, result.summary ?? null, result.affectedCount ?? null]);
        await emit(c, result.status === 'applied' ? 'repair_step_applied' : result.status === 'skipped' ? 'repair_step_skipped' : 'repair_step_failed', { planId, stepId: step.id, stepType: step.step_type });
      });
      if (result.status === 'applied') applied++;
      else if (result.status === 'skipped') skipped++;
      else failed++;
    } catch (e: any) {
      failed++;
      await withTenant(tenantId, async (c) => {
        await c.query(`UPDATE repair_steps SET status='failed', error=$2 WHERE id=$1`, [step.id, String(e?.message ?? e).slice(0, 300)]);
        await emit(c, 'repair_step_failed', { planId, stepId: step.id });
      });
    }
  }

  // finalize plan status
  const finalStatus = failed > 0 && applied > 0 ? 'partially_applied'
    : failed > 0 && applied === 0 ? 'failed'
    : 'applied';
  await withTenant(tenantId, async (c) => {
    await c.query(`UPDATE repair_plans SET status=$2 WHERE id=$1`, [planId, finalStatus]);
    await emit(c, finalStatus === 'partially_applied' ? 'repair_plan_partially_applied' : finalStatus === 'failed' ? 'repair_plan_failed' : 'repair_plan_applied', { planId, applied, failed, skipped });
    if (plan.leak_id) await emit(c, 'leak_repair_started', { leakId: plan.leak_id, planId });
  });
  if (plan.journey_id) await refreshActions(tenantId, plan.journey_id).catch(() => {});
  return { status: finalStatus, applied, failed, skipped };
}

/** Execute a single step. Returns its outcome (applied/skipped/failed) + audit. */
async function applyStep(tenantId: string, plan: any, step: any, llm: LLMClient): Promise<{ status: string; after?: unknown; summary?: string; affectedCount?: number }> {
  const payload = typeof step.payload === 'string' ? JSON.parse(step.payload) : (step.payload ?? {});
  switch (step.step_type) {
    case 'open_filtered_view':
      return { status: 'applied', summary: 'navigation', after: { filter: payload.filter, tab: payload.tab } };

    case 'mark_leak_fixing': {
      if (plan.leak_id) await updateLeakStatus(tenantId, plan.leak_id, 'fixing');
      return { status: 'applied', summary: 'leak marked fixing' };
    }

    case 'draft_whatsapp': {
      // draft only — never sends. If we have affected leads, draft for the first as a sample.
      const sample = await withTenant(tenantId, async (c) => {
        if (!payload.filter || !LEAD_WHERE[payload.filter]) return null;
        const r = await c.query(`SELECT id FROM leads WHERE funnel_id=$1 AND deleted_at IS NULL AND ${LEAD_WHERE[payload.filter]} LIMIT 1`, [plan.journey_id]);
        return r.rows[0]?.id ?? null;
      });
      if (!sample) return { status: 'applied', summary: 'مفيش عملاء للمسودة — اتجاهلت', after: null };
      const d = await draftReply(tenantId, sample, { stepType: payload.stepType, objectionKey: payload.objectionKey }).catch(() => null) as any;
      return { status: 'applied', summary: 'اتجهّزت مسودة (مش متبعتة)', after: { leadId: sample, body: d?.template?.body ?? null } };
    }

    case 'create_task': {
      const n = await createBulkTasks(tenantId, plan.journey_id, payload.filter, payload.title, payload.kind, payload.single ? 1 : 200);
      return { status: 'applied', summary: `اتعمل ${n} مهمة`, affectedCount: n, after: { created: n } };
    }

    case 'update_page_section': {
      const section = await withTenant(tenantId, async (c) => {
        const p = await c.query(`SELECT id FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [plan.journey_id]);
        if (!p.rowCount) return null;
        const s = await c.query(`SELECT id, content FROM page_sections WHERE page_id=$1 AND type=$2 ORDER BY position LIMIT 1`, [p.rows[0].id, payload.sectionType]);
        return s.rows[0] ?? null;
      });
      if (!section) return { status: 'skipped', summary: 'مفيش القسم المطلوب' };
      const r = await runSectionAction(tenantId, section.id, payload.action, llm).catch(() => null);
      if (!r) return { status: 'failed', summary: 'تعذّر توليد التحسين' };
      await updateSection(tenantId, section.id, { content: r.preview });
      return { status: 'applied', summary: 'اتحدّث قسم الصفحة', after: r.preview };
    }

    case 'create_tracked_link': {
      // only if a destination phone exists on the funnel/business
      const phone = await withTenant(tenantId, async (c) => {
        const r = await c.query(`SELECT destination_phone FROM tracked_links WHERE journey_id=$1 AND destination_phone IS NOT NULL LIMIT 1`, [plan.journey_id]);
        return r.rows[0]?.destination_phone ?? null;
      });
      if (!phone) return { status: 'skipped', summary: 'مفيش رقم وجهة — محتاج إدخال يدوي' };
      const link = await createTrackedLink(tenantId, { journeyId: plan.journey_id, destinationPhone: phone, source: 'repair', ctaLabel: 'كلمنا على واتساب' });
      return { status: 'applied', summary: 'اتعمل رابط متتبَّع', after: { code: link.code } };
    }

    case 'update_offer':
    case 'update_payment_instruction':
    case 'generate_report_note':
      // these require an interactive preview elsewhere; from a plan we skip safely
      return { status: 'skipped', summary: 'محتاج مراجعة تفاعلية من التبويب المخصّص' };

    default:
      return { status: 'skipped', summary: 'نوع خطوة غير مدعوم' };
  }
}

async function createBulkTasks(tenantId: string, journeyId: string, filter: string, title: string, kind: string, cap: number): Promise<number> {
  return withTenant(tenantId, async (c) => {
    if (filter === 'none') {
      const ex = await c.query(`SELECT 1 FROM tasks WHERE funnel_id=$1 AND title=$2 AND done=FALSE LIMIT 1`, [journeyId, title]);
      if (ex.rowCount) return 0;
      await c.query(`INSERT INTO tasks (funnel_id, kind, title) VALUES ($1,$2,$3)`, [journeyId, kind, title]);
      return 1;
    }
    if (!LEAD_WHERE[filter]) return 0;
    const leads = await c.query(`SELECT id FROM leads WHERE funnel_id=$1 AND deleted_at IS NULL AND ${LEAD_WHERE[filter]} LIMIT $2`, [journeyId, cap]);
    let n = 0;
    for (const l of leads.rows) {
      const ex = await c.query(`SELECT 1 FROM tasks WHERE lead_id=$1 AND title=$2 AND done=FALSE LIMIT 1`, [l.id, title]);
      if (ex.rowCount) continue;
      await c.query(`INSERT INTO tasks (lead_id, funnel_id, kind, title) VALUES ($1,$2,$3,$4)`, [l.id, journeyId, kind, title]);
      await c.query(`UPDATE leads SET next_action=$2, updated_at=now() WHERE id=$1`, [l.id, title]);
      n++;
    }
    return n;
  });
}

/** Switch a proposed plan to its alternative strategy (replaces pending steps). */
export async function switchToAlternative(tenantId: string, planId: string) {
  return withTenant(tenantId, async (c) => {
    const p = await c.query(`SELECT type, status, alternative_strategy FROM repair_plans WHERE id=$1`, [planId]);
    if (!p.rowCount) return { error: 'not found' };
    if (p.rows[0].status !== 'proposed') return { error: 'يمكن التبديل قبل الموافقة فقط' };
    const alt = typeof p.rows[0].alternative_strategy === 'string' ? JSON.parse(p.rows[0].alternative_strategy) : p.rows[0].alternative_strategy;
    if (!alt || !alt.steps || !alt.steps.length) return { error: 'مفيش استراتيجية بديلة' };
    // replace pending steps with the alternative's steps (still all confirm-gated mutations)
    await c.query(`DELETE FROM repair_steps WHERE repair_plan_id=$1 AND status='pending'`, [planId]);
    let order = 0;
    for (const s of alt.steps as { stepType: string; title: string }[]) {
      const requiresConfirmation = s.stepType !== 'open_filtered_view';
      await c.query(
        `INSERT INTO repair_steps (repair_plan_id, step_type, title, description, payload, status, step_order, step_reason)
         VALUES ($1,$2,$3,$4,$5,'pending',$6,'استراتيجية بديلة')`,
        [planId, s.stepType, s.title, alt.whenToUse ?? '', JSON.stringify({ requiresConfirmation }), order++]);
    }
    await c.query(`UPDATE repair_plans SET selected_strategy='alternative', strategy_source='mixed' WHERE id=$1`, [planId]);
    await emit(c, 'repair_plan_strategy_switched', { planId });
    return { ok: true };
  });
}

/** Update a single repair step (approve/skip). */
export async function patchRepairStep(tenantId: string, stepId: string, patch: { status?: string }) {
  return withTenant(tenantId, async (c) => {
    if (patch.status) await c.query(`UPDATE repair_steps SET status=$2 WHERE id=$1`, [stepId, patch.status]);
    return { ok: true };
  });
}

/** Result tracking: report whether the repair has early signal yet (no fake impact). */
export async function repairStatus(tenantId: string, planId: string) {
  return withTenant(tenantId, async (c) => {
    const p = await c.query(`SELECT * FROM repair_plans WHERE id=$1`, [planId]);
    if (!p.rowCount) return null;
    const plan = p.rows[0];
    if (!plan.applied_at || !plan.baseline) return { state: 'not_applied' };
    const baseline = typeof plan.baseline === 'string' ? JSON.parse(plan.baseline) : plan.baseline;
    // honest: we only report "awaiting more data" unless the leak has been re-diagnosed away.
    const leakOpen = plan.leak_id ? (await c.query(`SELECT status FROM leak_findings WHERE id=$1`, [plan.leak_id])).rows[0]?.status : null;
    if (leakOpen === 'resolved') return { state: 'early_improvement', note: 'التسريب اتقفل بعد الإصلاح ✓', baseline };
    return { state: 'awaiting_data', note: 'الإصلاح اتطبّق — مستنيين بيانات كفاية لقياس الأثر.', baseline };
  });
}
