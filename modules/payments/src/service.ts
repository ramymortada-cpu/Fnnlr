import { withTenant } from '../../../packages/db/src/router.js';
import { AIGateway, type LLMClient } from '../../../packages/ai-core/src/gateway.js';
import { logAiOutputWithUsage, logAiUsageEvent, type AiOutputLogRow } from '../../ai-ops/src/usage.js';
import { PaymentFlowBrain, suggestedMethods, type PaymentFlowInput } from '../../../packages/ai-core/src/brains/payment-flow.js';
import { canTransition, eventForState, type PaymentState } from './state-machine.js';
import type { Offer, Market, PaymentMethod, Tone } from '../../../packages/ai-core/src/contracts.js';

/**
 * Payments service. Manages the funnel's payment methods (config + copy) and
 * the per-lead payment journey (state machine + proof + timeline). Every
 * transition records history and emits an event so the Leak Board sees stalls.
 */

async function logAi(tenantId: string) {
  return async (row: AiOutputLogRow) => logAiOutputWithUsage(tenantId, row);
}

export async function getPaymentFlow(tenantId: string, journeyId: string) {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT * FROM payment_methods WHERE journey_id=$1 ORDER BY position, created_at`, [journeyId]);
    return r.rows;
  });
}

export async function addPaymentMethod(tenantId: string, journeyId: string, input: { method: string; market?: string; accountDetails?: string }) {
  return withTenant(tenantId, async (c) => {
    const pos = await c.query(`SELECT COALESCE(max(position),-1)+1 AS p FROM payment_methods WHERE journey_id=$1`, [journeyId]);
    const r = await c.query(
      `INSERT INTO payment_methods (journey_id, method, market, account_details, position)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [journeyId, input.method, input.market ?? null, input.accountDetails ?? null, pos.rows[0].p]);
    return r.rows[0].id as string;
  });
}

export async function updatePaymentMethod(tenantId: string, methodId: string, patch: Record<string, unknown>) {
  await withTenant(tenantId, async (c) => {
    const allowed = ['account_details', 'customer_instructions', 'whatsapp_message', 'proof_required',
      'review_required', 'confirmation_message', 'reminder_message', 'stuck_followup_message',
      'delivery_message', 'reassurance_note', 'active', 'position', 'market'];
    const entries = Object.entries(patch).filter(([k]) => allowed.includes(k));
    if (!entries.length) return;
    const cols = entries.map(([k], i) => `${k}=$${i + 2}`).join(', ');
    await c.query(`UPDATE payment_methods SET ${cols}, updated_at=now() WHERE id=$1`, [methodId, ...entries.map(([, v]) => v)]);
  });
}

export async function deletePaymentMethod(tenantId: string, methodId: string) {
  await withTenant(tenantId, async (c) => { await c.query(`DELETE FROM payment_methods WHERE id=$1`, [methodId]); });
}

/** Generate copy for every method on the funnel (or seed suggested methods first). */
export async function generatePaymentFlow(tenantId: string, journeyId: string, llm: LLMClient): Promise<{ degraded: boolean; methods: number } | null> {
  const ctx = await withTenant(tenantId, async (c) => {
    const j = await c.query(`SELECT * FROM journeys WHERE id=$1`, [journeyId]);
    if (!j.rowCount) return null;
    const off = await c.query(`SELECT content FROM offers WHERE journey_id=$1 ORDER BY version DESC LIMIT 1`, [journeyId]);
    const biz = await c.query(`SELECT market FROM businesses WHERE id=$1`, [j.rows[0].business_id]);
    let methods = await c.query(`SELECT * FROM payment_methods WHERE journey_id=$1`, [journeyId]);
    if (!methods.rowCount) {
      // seed suggested methods for the market
      const market = (biz.rows[0]?.market as Market) ?? 'eg';
      const sugg = suggestedMethods(market);
      for (let i = 0; i < sugg.length; i++) {
        await c.query(`INSERT INTO payment_methods (journey_id, method, market, position) VALUES ($1,$2,$3,$4)`,
          [journeyId, sugg[i], market, i]);
      }
      methods = await c.query(`SELECT * FROM payment_methods WHERE journey_id=$1`, [journeyId]);
    }
    return { journey: j.rows[0], offer: (off.rows[0]?.content ?? null) as Offer | null, market: (biz.rows[0]?.market as Market) ?? 'eg', methods: methods.rows };
  });
  if (!ctx || !ctx.offer) return null;

  const gateway = new AIGateway(llm);
  const logger = await logAi(tenantId);
  let degraded = false;
  let payCtx: string | null = null;
  try { const { getPlaybookContext } = await import('../../playbooks/src/service.js'); payCtx = (await getPlaybookContext(tenantId, 'payment')).context; } catch {}

  for (const m of ctx.methods) {
    const input: PaymentFlowInput = {
      offer: ctx.offer, price: ctx.offer.pricing || '', market: ctx.market,
      method: m.method as PaymentMethod, tone: 'egyptian_friendly' as Tone, accountDetails: m.account_details ?? undefined,
      playbookContext: payCtx,
    };
    const { output, degraded: d } = await gateway.run(PaymentFlowBrain, input, { tenantId, logOutput: logger, logUsage: logAiUsageEvent });
    if (d) degraded = true;
    await withTenant(tenantId, async (c) => {
      await c.query(
        `UPDATE payment_methods SET customer_instructions=$2, whatsapp_message=$3, confirmation_message=$4,
            reminder_message=$5, stuck_followup_message=$6, delivery_message=$7, reassurance_note=$8, updated_at=now()
          WHERE id=$1`,
        [m.id, output.customerInstructions, output.whatsappMessage, output.confirmationMessage,
         output.reminderMessage, output.stuckFollowupMessage, output.deliveryMessage, output.reassuranceNote]);
    });
  }
  return { degraded, methods: ctx.methods.length };
}

/** Transition a lead's payment state (validated) → history + event. */
export async function setPaymentState(
  tenantId: string, leadId: string, toState: PaymentState, opts: { method?: string; note?: string } = {},
): Promise<{ ok: boolean; reason?: string }> {
  return withTenant(tenantId, async (c) => {
    const cur = await c.query(`SELECT id, state FROM payment_states WHERE lead_id=$1 ORDER BY updated_at DESC LIMIT 1`, [leadId]);
    const fromState = (cur.rows[0]?.state ?? 'not_started') as PaymentState;
    if (!canTransition(fromState, toState)) {
      return { ok: false, reason: `transition ${fromState} → ${toState} not allowed` };
    }
    if (cur.rowCount) {
      await c.query(`UPDATE payment_states SET state=$2, method=COALESCE($3,method), note=COALESCE($4,note),
          access_delivered=(($2)='access_delivered') OR access_delivered, state_changed_at=now(), updated_at=now() WHERE id=$1`,
        [cur.rows[0].id, toState, opts.method ?? null, opts.note ?? null]);
    } else {
      await c.query(`INSERT INTO payment_states (lead_id, state, method, note, state_changed_at) VALUES ($1,$2,$3,$4,now())`,
        [leadId, toState, opts.method ?? null, opts.note ?? null]);
    }
    await c.query(`INSERT INTO payment_state_history (lead_id, from_state, to_state) VALUES ($1,$2,$3)`, [leadId, fromState, toState]);
    await c.query(`UPDATE leads SET payment_status=$2, last_touch_at=now(), updated_at=now() WHERE id=$1`, [leadId, toState]);
    await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'payment',$2)`,
      [eventForState(toState), JSON.stringify({ leadId, fromState, toState })]);
    return { ok: true };
  });
}

/** Save a proof placeholder (no real file upload yet). */
export async function savePaymentProof(tenantId: string, leadId: string, input: { proofReference?: string; proofNote?: string; reviewedBy?: string }) {
  await withTenant(tenantId, async (c) => {
    const cur = await c.query(`SELECT id FROM payment_states WHERE lead_id=$1 ORDER BY updated_at DESC LIMIT 1`, [leadId]);
    if (cur.rowCount) {
      await c.query(
        `UPDATE payment_states SET proof_received=TRUE, proof_reference=COALESCE($2,proof_reference),
            proof_note=COALESCE($3,proof_note), reviewed_by=COALESCE($4,reviewed_by),
            reviewed_at=CASE WHEN $4 IS NOT NULL THEN now() ELSE reviewed_at END, updated_at=now() WHERE id=$1`,
        [cur.rows[0].id, input.proofReference ?? null, input.proofNote ?? null, input.reviewedBy ?? null]);
    } else {
      await c.query(`INSERT INTO payment_states (lead_id, state, proof_received, proof_reference, proof_note) VALUES ($1,'proof_uploaded',TRUE,$2,$3)`,
        [leadId, input.proofReference ?? null, input.proofNote ?? null]);
    }
    await c.query(`INSERT INTO events (type, source, payload) VALUES ('proof_uploaded','payment',$1)`, [JSON.stringify({ leadId })]);
  });
}

export async function getPaymentTimeline(tenantId: string, leadId: string) {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT from_state, to_state, changed_at FROM payment_state_history WHERE lead_id=$1 ORDER BY changed_at`, [leadId]);
    const cur = await c.query(`SELECT * FROM payment_states WHERE lead_id=$1 ORDER BY updated_at DESC LIMIT 1`, [leadId]);
    return { history: r.rows, current: cur.rows[0] ?? null };
  });
}
