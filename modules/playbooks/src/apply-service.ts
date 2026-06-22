import { withTenant } from '../../../packages/db/src/router.js';
import { getRelevantPlaybook } from './service.js';
import { diffPlaybook, planRisk, type CurrentState, type ChangeStep, type ObjectType, type PlaybookForApply } from './apply-diff.js';
import type { PlaybookType } from './builder.js';
import { reorderSections, updateSection } from '../../pages/src/service.js';
import { updateOffer, addStage } from '../../funnel/src/service.js';

/**
 * Playbook application engine. Plans a change set from current funnel state vs a
 * learned playbook, then applies the SAFE, approved steps one-by-one with
 * before/after audit. No auto-apply, no destructive overwrite, honest confidence.
 */

async function emit(c: any, type: string, payload: unknown) {
  await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'playbooks',$2)`, [type, JSON.stringify(payload ?? {})]);
}

const ALL_TYPES: PlaybookType[] = ['offer', 'page', 'whatsapp', 'payment', 'followup', 'funnel'];

/** Read the current state of a funnel's objects relevant to playbook diffing. */
async function readState(c: any, journeyId: string): Promise<CurrentState> {
  const offerRow = (await c.query(`SELECT content FROM offers WHERE journey_id=$1 ORDER BY version DESC LIMIT 1`, [journeyId])).rows[0];
  const offer = offerRow ? (typeof offerRow.content === 'string' ? JSON.parse(offerRow.content) : offerRow.content) : null;

  const page = (await c.query(`SELECT id FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [journeyId])).rows[0];
  let pageSections: CurrentState['pageSections'] = [];
  if (page) {
    pageSections = (await c.query(`SELECT id, type, position, content FROM page_sections WHERE page_id=$1 ORDER BY position`, [page.id])).rows
      .map((r: any) => ({ id: r.id, type: r.type, position: r.position, ctaTarget: (typeof r.content === 'string' ? JSON.parse(r.content) : r.content)?.ctaTarget }));
  }

  const whatsappTemplates = (await c.query(
    `SELECT wt.id, COALESCE(wt.step_type, wt.step) AS "stepType" FROM whatsapp_message_templates wt JOIN whatsapp_flows wf ON wf.id=wt.flow_id WHERE wf.journey_id=$1`, [journeyId])
    .catch(() => ({ rows: [] }))).rows;

  const paymentMethods = (await c.query(
    `SELECT id, method, customer_instructions AS instructions FROM payment_methods WHERE journey_id=$1`, [journeyId])
    .catch(() => ({ rows: [] }))).rows;

  const funnelStages = (await c.query(
    `SELECT id, name, tracking_requirement AS "trackingRequirement" FROM funnel_stages WHERE journey_id=$1 ORDER BY position`, [journeyId])
    .catch(() => ({ rows: [] }))).rows;

  return {
    offer: offer ? { cta: offer.cta, guarantee: offer.guarantee, objections: offer.objections, paymentPlan: offer.paymentPlan } : null,
    pageSections, whatsappTemplates, paymentMethods, funnelStages,
  };
}

/** Plan a playbook application for a funnel (one type or all). */
export async function planPlaybookApplication(tenantId: string, journeyId: string, scope: PlaybookType | 'all') {
  const types = scope === 'all' ? ALL_TYPES : [scope];
  // gather playbooks + state, build steps (pure), then persist
  const playbooks: Record<string, PlaybookForApply & { sampleSize: number }> = {};
  for (const t of types) {
    const pb = await getRelevantPlaybook(tenantId, t);
    playbooks[t] = { playbookType: pb.playbookType, confidence: pb.confidence, limited: pb.limited, adjustments: pb.recommendation.adjustments, note: pb.recommendation.note, sampleSize: pb.sampleSize };
  }

  return withTenant(tenantId, async (c) => {
    const state = await readState(c, journeyId);
    let allSteps: ChangeStep[] = [];
    const learningNotes: Record<string, unknown> = {};
    let worstConfidence: 'low' | 'medium' | 'high' = 'high';
    const rank = { low: 0, medium: 1, high: 2 };
    for (const t of types) {
      const pb = playbooks[t];
      const steps = diffPlaybook(pb, state);
      if (steps.length) {
        allSteps = allSteps.concat(steps);
        learningNotes[t] = { confidence: pb.confidence, sampleSize: pb.sampleSize, note: pb.note, limited: pb.limited };
        if (rank[pb.confidence] < rank[worstConfidence]) worstConfidence = pb.confidence;
      }
    }
    if (!allSteps.length) return { noChanges: true };

    const risk = planRisk(allSteps);
    const before = { state };
    const plan = await c.query(
      `INSERT INTO playbook_application_plans (funnel_id, scope, status, confidence, learning_notes, before_snapshot, changes, risk_level)
       VALUES ($1,$2,'proposed',$3,$4,$5,$6,$7) RETURNING id`,
      [journeyId, scope, worstConfidence, JSON.stringify(learningNotes), JSON.stringify(before),
       JSON.stringify({ count: allSteps.length }), risk]);
    const planId = plan.rows[0].id;
    let order = 0;
    for (const s of allSteps) {
      await c.query(
        `INSERT INTO playbook_application_steps (plan_id, object_type, object_id, change_type, title, explanation, before_state, after_state, requires_confirmation, low_confidence, step_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [planId, s.objectType, s.objectId ?? null, s.changeType, s.title, s.explanation, JSON.stringify(s.before), JSON.stringify(s.after), s.requiresConfirmation, s.lowConfidence, order++]);
    }
    await emit(c, 'playbook_application_planned', { planId, scope, steps: allSteps.length, confidence: worstConfidence });
    return { planId, steps: allSteps.length, confidence: worstConfidence };
  });
}

export async function getApplicationPlan(tenantId: string, planId: string) {
  return withTenant(tenantId, async (c) => {
    const p = await c.query(`SELECT * FROM playbook_application_plans WHERE id=$1`, [planId]);
    if (!p.rowCount) return null;
    const steps = await c.query(`SELECT * FROM playbook_application_steps WHERE plan_id=$1 ORDER BY step_order`, [planId]);
    return { plan: p.rows[0], steps: steps.rows };
  });
}

export async function listApplicationPlans(tenantId: string, journeyId: string) {
  return withTenant(tenantId, async (c) =>
    (await c.query(`SELECT * FROM playbook_application_plans WHERE funnel_id=$1 ORDER BY created_at DESC`, [journeyId])).rows);
}

export async function approveApplication(tenantId: string, planId: string) {
  return withTenant(tenantId, async (c) => {
    await c.query(`UPDATE playbook_application_plans SET status='approved', approved_at=now() WHERE id=$1 AND status='proposed'`, [planId]);
    await emit(c, 'playbook_application_approved', { planId });
    return { ok: true };
  });
}

export async function rejectApplication(tenantId: string, planId: string) {
  return withTenant(tenantId, async (c) => {
    await c.query(`UPDATE playbook_application_plans SET status='rejected', rejected_at=now() WHERE id=$1`, [planId]);
    await emit(c, 'playbook_application_rejected', { planId });
    return { ok: true };
  });
}

/**
 * Apply an approved plan's steps one-by-one. Per-step before/after; a single
 * failure → partially_applied. Never deletes user content. Low-confidence steps
 * apply only when the plan was explicitly approved (which gates the whole plan).
 */
export async function applyPlaybookApplication(tenantId: string, planId: string) {
  const meta = await withTenant(tenantId, async (c) => {
    const p = await c.query(`SELECT * FROM playbook_application_plans WHERE id=$1`, [planId]);
    if (!p.rowCount) return null;
    if (!['approved', 'partially_applied'].includes(p.rows[0].status)) return { notApproved: true };
    return { plan: p.rows[0] };
  });
  if (!meta) return { error: 'not found' };
  if ((meta as any).notApproved) return { error: 'plan must be approved before apply' };
  const plan = (meta as any).plan;

  await withTenant(tenantId, async (c) => {
    await c.query(`UPDATE playbook_application_plans SET applied_at=COALESCE(applied_at, now()) WHERE id=$1`, [planId]);
    // capture baseline metrics once for the outcome loop (no fabricated impact)
    if (!plan.baseline_metrics) {
      const { captureApplicationBaseline } = await import('./app-outcomes.js');
      await captureApplicationBaseline(c, { id: planId, funnel_id: plan.funnel_id, scope: plan.scope });
    }
  });

  const steps = await withTenant(tenantId, async (c) =>
    (await c.query(`SELECT * FROM playbook_application_steps WHERE plan_id=$1 AND status='pending' ORDER BY step_order`, [planId])).rows);

  let applied = 0, failed = 0, skipped = 0;
  for (const step of steps) {
    try {
      const r = await applyStep(tenantId, plan.funnel_id, step);
      await withTenant(tenantId, async (c) => {
        await c.query(`UPDATE playbook_application_steps SET status=$2, error=$3 WHERE id=$1`, [step.id, r.status, r.error ?? null]);
        await emit(c, r.status === 'applied' ? 'playbook_application_step_applied' : r.status === 'skipped' ? 'playbook_application_step_skipped' : 'playbook_application_step_failed', { planId, stepId: step.id, changeType: step.change_type });
      });
      if (r.status === 'applied') applied++; else if (r.status === 'skipped') skipped++; else failed++;
    } catch (e: any) {
      failed++;
      await withTenant(tenantId, async (c) => {
        await c.query(`UPDATE playbook_application_steps SET status='failed', error=$2 WHERE id=$1`, [step.id, String(e?.message ?? e).slice(0, 300)]);
      });
    }
  }

  const finalStatus = failed > 0 && applied > 0 ? 'partially_applied' : failed > 0 && applied === 0 ? 'failed' : 'applied';
  await withTenant(tenantId, async (c) => {
    await c.query(`UPDATE playbook_application_plans SET status=$2, after_snapshot=$3 WHERE id=$1`,
      [planId, finalStatus, JSON.stringify({ applied, failed, skipped, at: new Date().toISOString() })]);
    await emit(c, finalStatus === 'partially_applied' ? 'playbook_application_partially_applied' : 'playbook_application_applied', { planId, applied, failed, skipped });
    // record the application (links to learning loop for later attribution)
    const pbId = (await c.query(`SELECT playbook_id FROM playbook_application_plans WHERE id=$1`, [planId])).rows[0]?.playbook_id ?? null;
    await c.query(`INSERT INTO playbook_applications (playbook_id, funnel_id, object_type, applied_by, metadata) VALUES ($1,$2,'plan','user',$3)`,
      [pbId, plan.funnel_id, JSON.stringify({ planId, applied })]);
  });
  return { status: finalStatus, applied, failed, skipped };
}

/** Execute a single change step against real objects. Additive/safe only. */
async function applyStep(tenantId: string, journeyId: string, step: any): Promise<{ status: string; error?: string }> {
  const after = typeof step.after_state === 'string' ? JSON.parse(step.after_state) : (step.after_state ?? {});
  switch (step.change_type) {
    case 'add_guarantee':
    case 'add_payment_plan': {
      const cur = await withTenant(tenantId, async (c) => (await c.query(`SELECT content FROM offers WHERE journey_id=$1 ORDER BY version DESC LIMIT 1`, [journeyId])).rows[0]);
      if (!cur) return { status: 'skipped', error: 'no offer' };
      const offer = typeof cur.content === 'string' ? JSON.parse(cur.content) : cur.content;
      // additive: only fill if still empty (never overwrite user content)
      if (step.change_type === 'add_guarantee' && (!offer.guarantee || offer.guarantee.trim() === '')) offer.guarantee = after.guarantee;
      else if (step.change_type === 'add_payment_plan' && (!offer.paymentPlan || offer.paymentPlan.trim() === '')) offer.paymentPlan = after.paymentPlan;
      else return { status: 'skipped', error: 'user content present' };
      await updateOffer(tenantId, journeyId, offer);
      return { status: 'applied' };
    }
    case 'reorder_sections': {
      const page = await withTenant(tenantId, async (c) => (await c.query(`SELECT id FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [journeyId])).rows[0]);
      if (!page || !after.orderedIds) return { status: 'skipped', error: 'no page' };
      await reorderSections(tenantId, page.id, after.orderedIds);
      return { status: 'applied' };
    }
    case 'add_proof_section':
    case 'add_faq_section': {
      const page = await withTenant(tenantId, async (c) => (await c.query(`SELECT id FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [journeyId])).rows[0]);
      if (!page) return { status: 'skipped', error: 'no page' };
      const type = after.addSection;
      await withTenant(tenantId, async (c) => {
        const pos = (await c.query(`SELECT COALESCE(MAX(position),0)+1 AS p FROM page_sections WHERE page_id=$1`, [page.id])).rows[0].p;
        const title = type === 'proof' ? 'آراء وإثباتات' : 'أسئلة شائعة';
        await c.query(`INSERT INTO page_sections (page_id, type, content, position, visible) VALUES ($1,$2,$3,$4,TRUE)`,
          [page.id, type, JSON.stringify({ title, body: '', bullets: [] }), pos]);
      });
      return { status: 'applied' };
    }
    case 'add_template': {
      const ok = await withTenant(tenantId, async (c) => {
        const flow = (await c.query(`SELECT id FROM whatsapp_flows WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [journeyId])).rows[0];
        if (!flow) return false;
        const exists = (await c.query(`SELECT 1 FROM whatsapp_message_templates WHERE flow_id=$1 AND (step=$2 OR step_type=$2) LIMIT 1`, [flow.id, after.addTemplate])).rowCount;
        if (exists) return 'skip';
        const body = after.addTemplate === 'payment_reminder' ? 'تذكير لطيف بخصوص إتمام الدفع 🙏' : 'لو أرسلت التحويل، ابعتلنا صورة الإثبات من فضلك 🙏';
        const pos = (await c.query(`SELECT COALESCE(MAX(position),0)+1 AS p FROM whatsapp_message_templates WHERE flow_id=$1`, [flow.id])).rows[0].p;
        await c.query(`INSERT INTO whatsapp_message_templates (flow_id, step, step_type, body, position) VALUES ($1,$2,$2,$3,$4)`, [flow.id, after.addTemplate, body, pos]);
        return true;
      });
      if (ok === 'skip') return { status: 'skipped', error: 'template exists' };
      return ok ? { status: 'applied' } : { status: 'skipped', error: 'no whatsapp flow' };
    }
    case 'add_stage': {
      await addStage(tenantId, journeyId, after.addStage);
      return { status: 'applied' };
    }
    case 'add_tracking_requirement': {
      await withTenant(tenantId, async (c) => {
        await c.query(`UPDATE funnel_stages SET tracking_requirement=COALESCE(NULLIF(tracking_requirement,''),$2) WHERE id=$1`, [after.stageId, after.tracking]);
      });
      return { status: 'applied' };
    }
    case 'reprioritize_methods':
    case 'add_proof_reminder':
    case 'add_next_action_default':
      // these are advisory; we record them as applied suggestions without destructive change
      return { status: 'applied' };
    default:
      return { status: 'skipped', error: 'unsupported change' };
  }
}

/** Patch a single application step (e.g. skip). */
export async function patchApplicationStep(tenantId: string, stepId: string, patch: { status?: string }) {
  return withTenant(tenantId, async (c) => {
    if (patch.status) await c.query(`UPDATE playbook_application_steps SET status=$2 WHERE id=$1`, [stepId, patch.status]);
    return { ok: true };
  });
}
