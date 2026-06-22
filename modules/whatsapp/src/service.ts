import { withTenant } from '../../../packages/db/src/router.js';
import { AIGateway, type LLMClient } from '../../../packages/ai-core/src/gateway.js';
import { WhatsAppSalesBrain, type WhatsAppSalesInput } from '../../../packages/ai-core/src/brains/whatsapp-sales.js';
import { selectStepType, stageAfterReply, type DraftContext } from './copilot.js';
import type { Offer, Market, Tone } from '../../../packages/ai-core/src/contracts.js';

/**
 * WhatsApp sales-flow service. Generates and stores the flow + templates,
 * supports editing/reordering, and powers the Lead Detail copilot: it drafts a
 * reply by selecting the right template — but only the user marks it sent
 * (no auto-send, no inbound API, no bot).
 */

async function logAi(tenantId: string) {
  return async (row: { brain: string; promptVersion: string; content: unknown; costUsd?: number }) =>
    withTenant(tenantId, async (c) => {
      const r = await c.query(`INSERT INTO ai_outputs (brain, prompt_version, content, cost_usd) VALUES ($1,$2,$3,$4) RETURNING id`,
        [row.brain, row.promptVersion, JSON.stringify(row.content), row.costUsd ?? null]);
      return r.rows[0].id as string;
    });
}
async function emit(c: any, type: string, payload: unknown) {
  await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'whatsapp',$2)`, [type, JSON.stringify(payload ?? {})]);
}

export async function generateWhatsAppFlow(tenantId: string, journeyId: string, llm: LLMClient): Promise<{ degraded: boolean; templates: number } | null> {
  const ctx = await withTenant(tenantId, async (c) => {
    const j = await c.query(`SELECT * FROM journeys WHERE id=$1`, [journeyId]);
    if (!j.rowCount) return null;
    const off = await c.query(`SELECT content FROM offers WHERE journey_id=$1 ORDER BY version DESC LIMIT 1`, [journeyId]);
    const biz = await c.query(`SELECT market FROM businesses WHERE id=$1`, [j.rows[0].business_id]);
    return { journey: j.rows[0], offer: (off.rows[0]?.content ?? null) as Offer | null, market: (biz.rows[0]?.market as Market) ?? 'eg' };
  });
  if (!ctx || !ctx.offer) return null;

  const input: WhatsAppSalesInput = {
    funnelName: ctx.journey.name, offer: ctx.offer, market: ctx.market,
    tone: 'egyptian_friendly' as Tone, price: ctx.offer.pricing || '', salesChannel: ctx.journey.channel ?? 'whatsapp',
  };
  const gateway = new AIGateway(llm);
  try { const { getPlaybookContext } = await import('../../playbooks/src/service.js'); (input as any).playbookContext = (await getPlaybookContext(tenantId, 'whatsapp')).context; } catch {}
  const { output, degraded } = await gateway.run(WhatsAppSalesBrain, input, { tenantId, logOutput: await logAi(tenantId) });

  const count = await withTenant(tenantId, async (c) => {
    // one flow per funnel (replace)
    await c.query(`DELETE FROM whatsapp_flows WHERE journey_id=$1`, [journeyId]);
    const fl = await c.query(`INSERT INTO whatsapp_flows (journey_id, tone, strategy, handoff_notes) VALUES ($1,$2,$3,$4) RETURNING id`,
      [journeyId, input.tone, output.strategy, output.handoffNotes]);
    const flowId = fl.rows[0].id as string;
    for (let i = 0; i < output.templates.length; i++) {
      const t = output.templates[i];
      await c.query(
        `INSERT INTO whatsapp_message_templates
          (flow_id, step, step_type, title, body, trigger_stage, trigger_payment_state, objection_key, tone,
           delay_suggestion, requires_approval, paid_template_required, no_zann_cooldown_hours, when_to_use, followup_suggestion, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [flowId, t.stepType, t.stepType, t.title, t.body, t.triggerStage ?? null, t.triggerPaymentState ?? null,
         t.objectionKey ?? null, t.tone ?? input.tone, t.delaySuggestion ?? null, t.requiresApproval,
         t.paidTemplateRequired, t.noZannCooldownHours, t.whenToUse ?? null, t.followupSuggestion ?? null, i]);
    }
    await emit(c, 'whatsapp_flow_generated', { journeyId, flowId, templates: output.templates.length });
    return output.templates.length;
  });
  return { degraded, templates: count };
}

export async function getWhatsAppFlow(tenantId: string, journeyId: string) {
  return withTenant(tenantId, async (c) => {
    const fl = await c.query(`SELECT * FROM whatsapp_flows WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [journeyId]);
    if (!fl.rowCount) return null;
    const steps = await c.query(`SELECT * FROM whatsapp_message_templates WHERE flow_id=$1 ORDER BY position`, [fl.rows[0].id]);
    return { flow: fl.rows[0], steps: steps.rows };
  });
}

export async function updateStep(tenantId: string, stepId: string, patch: Record<string, unknown>) {
  await withTenant(tenantId, async (c) => {
    const allowed = ['title', 'body', 'trigger_stage', 'trigger_payment_state', 'tone', 'delay_suggestion',
      'requires_approval', 'no_zann_cooldown_hours', 'active', 'when_to_use', 'followup_suggestion', 'position'];
    const entries = Object.entries(patch).filter(([k]) => allowed.includes(k));
    if (!entries.length) return;
    const cols = entries.map(([k], i) => `${k}=$${i + 2}`).join(', ');
    await c.query(`UPDATE whatsapp_message_templates SET ${cols} WHERE id=$1`, [stepId, ...entries.map(([, v]) => v)]);
    await emit(c, 'whatsapp_template_updated', { stepId });
  });
}

export async function addStep(tenantId: string, journeyId: string, stepType: string) {
  return withTenant(tenantId, async (c) => {
    const fl = await c.query(`SELECT id FROM whatsapp_flows WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [journeyId]);
    if (!fl.rowCount) return null;
    const pos = await c.query(`SELECT COALESCE(max(position),-1)+1 AS p FROM whatsapp_message_templates WHERE flow_id=$1`, [fl.rows[0].id]);
    const r = await c.query(`INSERT INTO whatsapp_message_templates (flow_id, step, step_type, title, body, position) VALUES ($1,$2,$2,$3,'',$4) RETURNING id`,
      [fl.rows[0].id, stepType, 'قالب جديد', pos.rows[0].p]);
    return r.rows[0].id as string;
  });
}

export async function deleteStep(tenantId: string, stepId: string) {
  await withTenant(tenantId, async (c) => { await c.query(`DELETE FROM whatsapp_message_templates WHERE id=$1`, [stepId]); });
}

export async function reorderSteps(tenantId: string, flowId: string, orderedIds: string[]) {
  await withTenant(tenantId, async (c) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await c.query(`UPDATE whatsapp_message_templates SET position=$2 WHERE id=$1 AND flow_id=$3`, [orderedIds[i], i, flowId]);
    }
  });
}

/** Copilot: draft a reply for a lead by selecting the best template. Suggestion only. */
export async function draftReply(tenantId: string, leadId: string, override?: { stepType?: string; objectionKey?: string }) {
  return withTenant(tenantId, async (c) => {
    const lead = await c.query(`SELECT id, funnel_id, stage, payment_status FROM leads WHERE id=$1`, [leadId]);
    if (!lead.rowCount) return null;
    const l = lead.rows[0];
    const fl = await c.query(`SELECT id FROM whatsapp_flows WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [l.funnel_id]);
    if (!fl.rowCount) return { needsFlow: true as const };

    const ctx: DraftContext = { stage: l.stage, paymentState: l.payment_status, objectionKey: override?.objectionKey };
    const stepType = override?.stepType ?? selectStepType(ctx);

    // find the matching template (objection key if relevant)
    let tpl;
    if (stepType === 'objection' && override?.objectionKey) {
      tpl = await c.query(`SELECT * FROM whatsapp_message_templates WHERE flow_id=$1 AND step_type='objection' AND objection_key=$2 LIMIT 1`,
        [fl.rows[0].id, override.objectionKey]);
    }
    if (!tpl || !tpl.rowCount) {
      tpl = await c.query(`SELECT * FROM whatsapp_message_templates WHERE flow_id=$1 AND step_type=$2 ORDER BY position LIMIT 1`,
        [fl.rows[0].id, stepType]);
    }
    if (!tpl.rowCount) return { needsFlow: false as const, stepType, template: null };

    const t = tpl.rows[0];
    const draft = await c.query(
      `INSERT INTO whatsapp_draft_replies (lead_id, template_id, step_type, body) VALUES ($1,$2,$3,$4) RETURNING id`,
      [leadId, t.id, stepType, t.body]);
    await emit(c, 'whatsapp_reply_drafted', { leadId, stepType });
    return {
      needsFlow: false as const, stepType, draftId: draft.rows[0].id,
      template: { id: t.id, title: t.title, body: t.body, delaySuggestion: t.delay_suggestion,
        cooldownHours: t.no_zann_cooldown_hours, requiresApproval: t.requires_approval, whenToUse: t.when_to_use },
    };
  });
}

/** Manual "mark as sent" — the ONLY way a message is recorded as sent. No auto-send. */
export async function markSent(tenantId: string, leadId: string, input: { draftId?: string; body?: string; stepType?: string }) {
  return withTenant(tenantId, async (c) => {
    if (input.draftId) {
      await c.query(`UPDATE whatsapp_draft_replies SET marked_sent=TRUE, sent_at=now() WHERE id=$1`, [input.draftId]);
    } else {
      await c.query(`INSERT INTO whatsapp_draft_replies (lead_id, step_type, body, marked_sent, sent_at) VALUES ($1,$2,$3,TRUE,now())`,
        [leadId, input.stepType ?? null, input.body ?? '']);
    }
    // last contacted + maybe advance stage (with the user's action as consent)
    const lead = await c.query(`SELECT stage FROM leads WHERE id=$1`, [leadId]);
    const newStage = stageAfterReply(lead.rows[0]?.stage, (input.stepType as any) ?? 'first_reply');
    if (newStage) {
      await c.query(`UPDATE leads SET stage=$2, stage_changed_at=now(), last_contacted_at=now(), last_touch_at=now() WHERE id=$1`, [leadId, newStage]);
      await c.query(`INSERT INTO lead_stage_history (lead_id, from_stage, to_stage) VALUES ($1,$2,$3)`, [leadId, lead.rows[0]?.stage, newStage]);
      await emit(c, 'stage_changed', { leadId, toStage: newStage, via: 'whatsapp_reply' });
    } else {
      await c.query(`UPDATE leads SET last_contacted_at=now(), last_touch_at=now() WHERE id=$1`, [leadId]);
    }
    await emit(c, 'whatsapp_reply_marked_sent', { leadId, stepType: input.stepType });
    // record the outbound message in the conversation inbox + outbound timing
    const conv = await c.query(`SELECT id FROM conversations WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 1`, [leadId]);
    if (conv.rowCount) {
      const body = input.body ?? '';
      await c.query(`INSERT INTO conversation_messages (conversation_id, lead_id, direction, body) VALUES ($1,$2,'outbound',$3)`, [conv.rows[0].id, leadId, body]);
      await c.query(`UPDATE conversations SET last_outbound_at=now(), last_event_at=now() WHERE id=$1`, [conv.rows[0].id]);
    }
    return { ok: true, advancedTo: newStage };
  });
}
