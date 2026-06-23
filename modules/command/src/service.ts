import { withTenant } from '../../../packages/db/src/router.js';
import { AIGateway, type LLMClient } from '../../../packages/ai-core/src/gateway.js';
import { logAiUsageEvent } from '../../ai-ops/src/usage.js';
import { CommandBrain, type CommandContext } from '../../../packages/ai-core/src/brains/command.js';
import { type Intent } from './intents.js';
import { planAction, applyPlanned, type ActionKind } from './executor.js';
import { auditWith } from '../../security/src/audit.js';

/**
 * Command service — the revenue Execution Copilot. Builds MINIMAL context,
 * classifies the command, then PLANS a typed action (preview + before-snapshot).
 * Nothing destructive happens in runCommand; the real mutation only runs in
 * applyCommand after the user confirms, with a full before/after audit.
 */

/** Build a small, structured context — never dump the whole DB. */
async function buildContext(tenantId: string, journeyId: string | undefined, tab: string | undefined): Promise<CommandContext> {
  if (!journeyId) return { tab };
  return withTenant(tenantId, async (c) => {
    const j = await c.query(`SELECT name FROM journeys WHERE id=$1`, [journeyId]);
    const off = await c.query(`SELECT 1 FROM offers WHERE journey_id=$1 LIMIT 1`, [journeyId]);
    const pg = await c.query(`SELECT 1 FROM pages WHERE journey_id=$1 LIMIT 1`, [journeyId]);
    const leak = await c.query(`SELECT title FROM leak_findings WHERE journey_id=$1 AND status IN ('open','fixing')
      ORDER BY CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC LIMIT 1`, [journeyId]);
    const waiting = await c.query(`SELECT COUNT(*)::int AS n FROM leads WHERE funnel_id=$1 AND stage='waiting_payment'`, [journeyId]);
    const need = await c.query(`SELECT COUNT(*)::int AS n FROM leads WHERE funnel_id=$1 AND deleted_at IS NULL
      AND (stage='needs_followup' OR next_action IS NOT NULL) AND stage NOT IN ('paid','access_delivered','lost')`, [journeyId]);
    return {
      tab, funnelName: j.rows[0]?.name,
      hasOffer: (off.rowCount ?? 0) > 0, hasPage: (pg.rowCount ?? 0) > 0,
      biggestLeakTitle: leak.rows[0]?.title ?? null,
      waitingPaymentCount: waiting.rows[0].n, leadsNeedingAction: need.rows[0].n,
    };
  });
}

export interface CommandResult {
  commandId: string;
  intent: Intent;
  confidence: string;
  resultType: ActionKind;
  actionKind: ActionKind;
  explanation: string;
  safetyNotes: string;
  degraded: boolean;
  requiresConfirmation: boolean;
  summary: string;
  preview?: string;
  diff?: { field: string; before: string; after: string }[];
  evidence?: Record<string, unknown>;
  affectedCount?: number;
  sample?: { id: string; label: string }[];
  navigate?: { tab?: string; leadFilter?: string };
  repairPlanId?: string;
  leakId?: string;
  applicationPlanId?: string;
}

/** Run a command: classify + produce a proposed result; persist to history. */
export async function runCommand(
  tenantId: string,
  input: { text: string; funnelId?: string; tab?: string; leadId?: string; leakId?: string },
  llm: LLMClient,
): Promise<CommandResult> {
  const context = await buildContext(tenantId, input.funnelId, input.tab);
  const gateway = new AIGateway(llm);
  const { output: cls, degraded } = await gateway.run(CommandBrain, { text: input.text, context }, { tenantId, logUsage: logAiUsageEvent });
  const intent = cls.intent;

  // Plan a typed, auditable action (read-only — no object writes here).
  const plan = await planAction(tenantId, intent, input, llm);

  const result: CommandResult = {
    commandId: '', intent, confidence: cls.confidence, resultType: plan.actionKind as any,
    explanation: cls.explanation, safetyNotes: cls.safetyNotes, degraded,
    actionKind: plan.actionKind,
    requiresConfirmation: plan.requiresConfirmation,
    summary: plan.summary,
    preview: plan.preview,
    diff: plan.diff,
    evidence: plan.evidence,
    affectedCount: plan.affectedCount,
    sample: plan.sample,
    navigate: plan.navigate,
    repairPlanId: (plan.payload as any)?.repairPlanId,
    leakId: (plan.payload as any)?.leakId,
    applicationPlanId: (plan.payload as any)?.applicationPlanId,
  };

  // persist history with before-snapshot + the payload apply() will consume
  const commandId = await withTenant(tenantId, async (c) => {
    const r = await c.query(
      `INSERT INTO commands (journey_id, lead_id, leak_id, command_text, intent, confidence, result_type,
          action_kind, action_payload, before_snapshot, affected_count, proposed, status, degraded)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'proposed',$13) RETURNING id`,
      [input.funnelId ?? null, input.leadId ?? null, input.leakId ?? null, input.text, intent, cls.confidence,
       plan.actionKind, plan.actionKind, JSON.stringify(plan.payload ?? {}),
       plan.beforeSnapshot != null ? JSON.stringify(plan.beforeSnapshot) : null,
       plan.affectedCount ?? 0,
       JSON.stringify({ navigate: plan.navigate, preview: plan.preview, diff: plan.diff }), degraded]);
    return r.rows[0].id as string;
  });

  result.commandId = commandId;
  return result;
}

/** Apply a previously-proposed command (the confirm step). Executes the real mutation + audit. */
export async function applyCommand(tenantId: string, commandId: string, opts?: { confirmBulk?: boolean }) {
  // load the stored plan
  const row = await withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT journey_id, leak_id, action_payload, status FROM commands WHERE id=$1`, [commandId]);
    return r.rows[0] ?? null;
  });
  if (!row) return { ok: false, error: 'command not found' };
  if (row.status === 'applied') return { ok: true, alreadyApplied: true };
  if (row.status === 'discarded') return { ok: false, error: 'command was discarded' }; // cannot apply after discard

  const payload = (typeof row.action_payload === 'string' ? JSON.parse(row.action_payload) : row.action_payload) ?? {};
  // Bulk safety: a large blast radius requires an explicit confirm phrase.
  const BULK_THRESHOLD = 25;
  const declaredCount = Number(payload.affectedCount ?? payload.estimatedCount ?? 0);
  if (declaredCount > BULK_THRESHOLD && !opts?.confirmBulk) {
    return { ok: false, error: 'bulk_confirmation_required', affectedCount: declaredCount, needConfirmPhrase: 'أكّد التنفيذ الجماعي' };
  }
  let res;
  try {
    res = await applyPlanned(tenantId, payload, { funnelId: row.journey_id, leakId: row.leak_id });
  } catch (e: any) {
    await withTenant(tenantId, async (c) => {
      await c.query(`UPDATE commands SET error=$2 WHERE id=$1`, [commandId, String(e?.message ?? e)]);
    });
    return { ok: false, error: 'apply failed' };
  }

  await withTenant(tenantId, async (c) => {
    await c.query(
      `UPDATE commands SET status='applied', resolved_at=now(), after_snapshot=$2, result_summary=$3, affected_count=COALESCE($4, affected_count) WHERE id=$1`,
      [commandId, res.after != null ? JSON.stringify(res.after) : null, res.summary, res.affectedCount ?? null]);
    await c.query(`INSERT INTO events (type, source, payload) VALUES ('command_applied','command',$1)`, [JSON.stringify({ commandId })]);
    for (const ev of res.events) {
      await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'command',$2)`, [ev, JSON.stringify({ commandId })]);
    }
    await auditWith(c, 'user', 'command_apply', commandId, { affectedCount: res.affectedCount ?? null });
  });
  return { ok: res.ok, summary: res.summary, affectedCount: res.affectedCount };
}

export async function discardCommand(tenantId: string, commandId: string) {
  return withTenant(tenantId, async (c) => {
    await c.query(`UPDATE commands SET status='discarded', resolved_at=now() WHERE id=$1`, [commandId]);
    await auditWith(c, 'user', 'command_discard', commandId, {});
    return { ok: true };
  });
}

export async function commandHistory(tenantId: string, journeyId?: string, limit = 20) {
  return withTenant(tenantId, async (c) => {
    const r = journeyId
      ? await c.query(`SELECT id, command_text, intent, confidence, result_type, status, created_at FROM commands WHERE journey_id=$1 ORDER BY created_at DESC LIMIT $2`, [journeyId, limit])
      : await c.query(`SELECT id, command_text, intent, confidence, result_type, status, created_at FROM commands ORDER BY created_at DESC LIMIT $1`, [limit]);
    return r.rows;
  });
}
