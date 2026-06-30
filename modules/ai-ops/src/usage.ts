import { withTenant } from '../../../packages/db/src/router.js';
import type { AIUsageEvent } from '../../../packages/ai-core/src/gateway.js';

export type AiOutputLogRow = {
  brain: string;
  promptVersion: string;
  content: unknown;
  costUsd?: number;
  status?: AIUsageEvent['status'];
  degradationReason?: string;
};

export async function logAiOutputWithUsage(tenantId: string, row: AiOutputLogRow): Promise<string> {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(
      `INSERT INTO ai_outputs (brain, prompt_version, content, cost_usd) VALUES ($1,$2,$3,$4) RETURNING id`,
      [row.brain, row.promptVersion, JSON.stringify(row.content), row.costUsd ?? null],
    );
    await c.query(
      `INSERT INTO ai_usage_events
        (tenant_id_label, brain, actual_cost_usd, status, degradation_reason)
       VALUES ($1,$2,$3,$4,$5)`,
      [tenantId, row.brain, row.costUsd ?? null, row.status ?? 'allowed', row.degradationReason ?? null],
    ).catch(() => {});
    return r.rows[0].id as string;
  });
}

export async function logAiUsageEvent(row: AIUsageEvent): Promise<void> {
  await withTenant(row.tenantId, async (c) => {
    await c.query(
      `INSERT INTO ai_usage_events
        (tenant_id_label, brain, workflow_id, outcome_id, outcome_status, provider, model, estimated_tokens, estimated_cost_usd, actual_cost_usd, status, degradation_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [row.tenantId, row.brain, row.workflowId ?? null, row.outcomeId ?? null, row.outcomeStatus ?? null,
       row.provider ?? null, row.model ?? null, row.estimatedTokens ?? null, row.estimatedCostUsd ?? null,
       row.actualCostUsd ?? null, row.status, row.degradationReason ?? null],
    );
  }).catch(() => {});
}
