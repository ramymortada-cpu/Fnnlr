import { withTenant } from '../../../packages/db/src/router.js';
import { filterWhereClause, type LeadFilter, type PipelineStage } from './pipeline.js';

/**
 * Funnel CRM service. Operates on leads/conversations/payment_states that the
 * capture layer creates from tracked WhatsApp clicks. Every mutation emits an
 * event and (for stages) records history, so the Leak Board can later see where
 * revenue leaks. Funnel-scoped — not a generic CRM.
 */

async function emit(c: any, type: string, payload: unknown) {
  await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'pipeline',$2)`, [type, JSON.stringify(payload ?? {})]);
}

/** List leads in a funnel, optionally filtered, with optional source/campaign match. */
export async function listLeads(
  tenantId: string,
  journeyId: string,
  opts: { filter?: LeadFilter; source?: string; campaign?: string } = {},
) {
  return withTenant(tenantId, async (c) => {
    const where = filterWhereClause(opts.filter ?? 'all');
    const params: unknown[] = [journeyId];
    let extra = '';
    if (opts.source) { params.push(opts.source); extra += ` AND source=$${params.length}`; }
    if (opts.campaign) { params.push(opts.campaign); extra += ` AND campaign=$${params.length}`; }
    const r = await c.query(
      `SELECT id, name, source, medium, campaign, stage, payment_status, risk_score,
              next_action, followup_due_at, link_code, last_touch_at, created_at
         FROM leads
        WHERE funnel_id=$1 AND deleted_at IS NULL ${where.sql} ${extra}
        ORDER BY last_touch_at DESC NULLS LAST, created_at DESC`,
      params,
    );
    return r.rows;
  });
}

/** Full lead detail: lead + attribution + conversation + payment + timeline + notes + tasks. */
export async function getLeadDetail(tenantId: string, leadId: string) {
  return withTenant(tenantId, async (c) => {
    const l = await c.query(`SELECT * FROM leads WHERE id=$1`, [leadId]);
    if (!l.rowCount) return null;
    const conv = await c.query(`SELECT * FROM conversations WHERE lead_id=$1 ORDER BY created_at LIMIT 1`, [leadId]);
    const pay = await c.query(`SELECT * FROM payment_states WHERE lead_id=$1 ORDER BY updated_at DESC LIMIT 1`, [leadId]);
    const notes = await c.query(`SELECT * FROM lead_notes WHERE lead_id=$1 ORDER BY created_at DESC`, [leadId]);
    const tasks = await c.query(`SELECT * FROM tasks WHERE lead_id=$1 ORDER BY done, due_at NULLS LAST, created_at`, [leadId]);
    const history = await c.query(`SELECT from_stage, to_stage, changed_at FROM lead_stage_history WHERE lead_id=$1 ORDER BY changed_at`, [leadId]);
    return {
      lead: l.rows[0],
      conversation: conv.rows[0] ?? null,
      payment: pay.rows[0] ?? null,
      notes: notes.rows,
      tasks: tasks.rows,
      stageHistory: history.rows,
    };
  });
}

/** Patch simple lead fields (name, next_action, followup_due_at, lost_reason, risk_score). */
export async function patchLead(tenantId: string, leadId: string, patch: Record<string, unknown>) {
  await withTenant(tenantId, async (c) => {
    const allowed = ['name', 'next_action', 'followup_due_at', 'lost_reason', 'risk_score', 'status', 'phone'];
    const entries = Object.entries(patch).filter(([k]) => allowed.includes(k));
    if (!entries.length) return;
    const cols = entries.map(([k], i) => `${k}=$${i + 2}`).join(', ');
    await c.query(`UPDATE leads SET ${cols}, updated_at=now() WHERE id=$1`, [leadId, ...entries.map(([, v]) => v)]);
  });
}

/** Change a lead's pipeline stage: records history + emits stage_changed (with timing). */
export async function changeStage(tenantId: string, leadId: string, toStage: PipelineStage, lostReason?: string) {
  await withTenant(tenantId, async (c) => {
    const cur = await c.query(`SELECT stage FROM leads WHERE id=$1`, [leadId]);
    if (!cur.rowCount) return;
    const fromStage = cur.rows[0].stage as string;
    await c.query(
      `UPDATE leads SET stage=$2, stage_changed_at=now(), last_touch_at=now(),
              lost_reason=COALESCE($3,lost_reason), updated_at=now() WHERE id=$1`,
      [leadId, toStage, lostReason ?? null],
    );
    await c.query(`INSERT INTO lead_stage_history (lead_id, from_stage, to_stage) VALUES ($1,$2,$3)`, [leadId, fromStage, toStage]);
    await emit(c, 'stage_changed', { leadId, fromStage, toStage });
    if (toStage === 'paid') await emit(c, 'deal_won', { leadId });
    if (toStage === 'lost') await emit(c, 'deal_lost', { leadId, lostReason });
  });
}

export async function addNote(tenantId: string, leadId: string, body: string) {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(`INSERT INTO lead_notes (lead_id, body) VALUES ($1,$2) RETURNING id`, [leadId, body]);
    await c.query(`UPDATE leads SET last_touch_at=now() WHERE id=$1`, [leadId]);
    await emit(c, 'note_added', { leadId });
    return r.rows[0].id as string;
  });
}

export async function createTask(tenantId: string, leadId: string, input: { title: string; kind?: string; dueAt?: string }) {
  return withTenant(tenantId, async (c) => {
    const fk = await c.query(`SELECT funnel_id FROM leads WHERE id=$1`, [leadId]);
    const r = await c.query(
      `INSERT INTO tasks (lead_id, funnel_id, kind, title, due_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [leadId, fk.rows[0]?.funnel_id ?? null, input.kind ?? null, input.title, input.dueAt ?? null],
    );
    // a task is the lead's next action
    await c.query(`UPDATE leads SET next_action=$2, updated_at=now() WHERE id=$1`, [leadId, input.title]);
    await emit(c, 'task_created', { leadId, title: input.title });
    return r.rows[0].id as string;
  });
}

export async function updateTask(tenantId: string, taskId: string, patch: { done?: boolean; title?: string; dueAt?: string }) {
  await withTenant(tenantId, async (c) => {
    const entries: [string, unknown][] = [];
    if (patch.done !== undefined) entries.push(['done', patch.done]);
    if (patch.title !== undefined) entries.push(['title', patch.title]);
    if (patch.dueAt !== undefined) entries.push(['due_at', patch.dueAt]);
    if (!entries.length) return;
    const cols = entries.map(([k], i) => `${k}=$${i + 2}`).join(', ');
    const doneAtClause = patch.done === true ? ', done_at=COALESCE(done_at, now())' : patch.done === false ? ', done_at=NULL' : '';
    await c.query(`UPDATE tasks SET ${cols}${doneAtClause} WHERE id=$1`, [taskId, ...entries.map(([, v]) => v)]);
  });
}

/** Set the payment state for a lead: upserts payment_states + emits payment_state_changed. */
export async function setPaymentState(tenantId: string, leadId: string, state: string, method?: string) {
  await withTenant(tenantId, async (c) => {
    const existing = await c.query(`SELECT id, state FROM payment_states WHERE lead_id=$1 ORDER BY updated_at DESC LIMIT 1`, [leadId]);
    const fromState = existing.rows[0]?.state ?? null;
    if (existing.rowCount) {
      await c.query(`UPDATE payment_states SET state=$2, method=COALESCE($3,method), updated_at=now() WHERE id=$1`, [existing.rows[0].id, state, method ?? null]);
    } else {
      await c.query(`INSERT INTO payment_states (lead_id, state, method) VALUES ($1,$2,$3)`, [leadId, state, method ?? null]);
    }
    await c.query(`UPDATE leads SET payment_status=$2, last_touch_at=now(), updated_at=now() WHERE id=$1`, [leadId, state]);
    await emit(c, 'payment_state_changed', { leadId, fromState, toState: state });
  });
}

export async function getLeadEvents(tenantId: string, leadId: string) {
  return withTenant(tenantId, async (c) => {
    // Timeline = capture/pipeline events that reference this lead + stage history.
    const ev = await c.query(
      `SELECT type, payload, created_at FROM events
        WHERE payload->>'leadId' = $1 ORDER BY created_at`,
      [leadId],
    );
    const hist = await c.query(
      `SELECT 'stage_changed' AS type, json_build_object('fromStage',from_stage,'toStage',to_stage) AS payload, changed_at AS created_at
         FROM lead_stage_history WHERE lead_id=$1 ORDER BY changed_at`,
      [leadId],
    );
    return [...ev.rows, ...hist.rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  });
}

/** Conversation manual update (stub — no inbound API). */
export async function updateConversation(tenantId: string, conversationId: string, patch: { last_message?: string; note?: string; status?: string }) {
  await withTenant(tenantId, async (c) => {
    const entries = Object.entries(patch).filter(([k]) => ['last_message', 'note', 'status'].includes(k));
    if (!entries.length) return;
    const cols = entries.map(([k], i) => `${k}=$${i + 2}`).join(', ');
    await c.query(`UPDATE conversations SET ${cols}, last_event_at=now() WHERE id=$1`, [conversationId, ...entries.map(([, v]) => v)]);
  });
}

/** Dashboard: count of leads needing action (open tasks, due follow-ups, or needs_followup stage). */
export async function leadsNeedingAction(tenantId: string, journeyId?: string) {
  return withTenant(tenantId, async (c) => {
    const scope = journeyId ? `AND funnel_id=$1` : '';
    const params = journeyId ? [journeyId] : [];
    const r = await c.query(
      `SELECT COUNT(*)::int AS n FROM leads
        WHERE deleted_at IS NULL ${scope}
          AND (stage='needs_followup' OR followup_due_at IS NOT NULL OR next_action IS NOT NULL)
          AND stage NOT IN ('paid','access_delivered','lost')`,
      params,
    );
    return r.rows[0].n as number;
  });
}
