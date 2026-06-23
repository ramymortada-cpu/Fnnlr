import { getControlPool, withTenant } from '../../../packages/db/src/router.js';
import { emailReadiness } from '../../email/src/service.js';
import { observabilityReadiness } from '../../observability/src/readiness.js';

/**
 * Health checks. Production-safe: no secrets, no tenant data leakage. Each check
 * reports ok | degraded | failed with a short reason. Used by /health endpoints.
 */

export interface HealthLine { name: string; status: 'ok' | 'degraded' | 'failed'; detail: string; }

export function basicHealth(): HealthLine {
  return { name: 'api', status: 'ok', detail: 'api process is up' };
}

export async function dbHealth(): Promise<HealthLine> {
  try {
    const r = await getControlPool().query(`SELECT 1 AS ok`);
    return { name: 'control_db', status: r.rows[0].ok === 1 ? 'ok' : 'degraded', detail: 'control-plane reachable' };
  } catch (e: any) {
    return { name: 'control_db', status: 'failed', detail: `unreachable: ${String(e?.message ?? e).slice(0, 80)}` };
  }
}

export async function jobsHealth(): Promise<HealthLine> {
  if (process.env.FNNLR_DISABLE_JOBS === 'true') return { name: 'jobs', status: 'degraded', detail: 'scheduled jobs disabled (kill-switch)' };
  if (!process.env.FNNLR_CRON_SECRET) return { name: 'jobs', status: 'degraded', detail: 'cron secret not set — cron endpoints will reject' };
  return { name: 'jobs', status: 'ok', detail: 'cron secret configured' };
}

export function integrationsHealth(): HealthLine {
  const hasKey = !!(process.env.INTEGRATION_ENCRYPTION_KEY || process.env.TENANT_CREDENTIAL_ENCRYPTION_KEY);
  if (!hasKey && process.env.NODE_ENV === 'production') return { name: 'integrations', status: 'failed', detail: 'no encryption key in production — credential storage will fail closed' };
  if (!hasKey) return { name: 'integrations', status: 'degraded', detail: 'no encryption key (dev fallback active)' };
  return { name: 'integrations', status: 'ok', detail: 'encryption key configured' };
}

export function llmHealth(): HealthLine {
  return process.env.ANTHROPIC_API_KEY
    ? { name: 'llm', status: 'ok', detail: 'LLM key configured' }
    : { name: 'llm', status: 'degraded', detail: 'no LLM key — AI features run in degraded fallback' };
}

export function aiBudgetHealth(): HealthLine {
  if (process.env.FNNLR_AI_KILL_SWITCH === 'true') return { name: 'ai_budget', status: 'degraded', detail: 'AI provider calls disabled by kill switch' };
  const hasCap = Number(process.env.FNNLR_AI_TENANT_DAILY_USD_CAP || '') > 0 || Number(process.env.FNNLR_AI_GLOBAL_DAILY_USD_CAP || '') > 0;
  if (process.env.NODE_ENV === 'production' && !hasCap) return { name: 'ai_budget', status: 'degraded', detail: 'production AI budget cap missing' };
  return { name: 'ai_budget', status: hasCap ? 'ok' : 'degraded', detail: hasCap ? 'AI budget cap configured' : 'AI budget cap not configured' };
}

export function emailHealth(): HealthLine {
  const r = emailReadiness();
  return r.ok
    ? { name: 'email', status: 'ok', detail: `transactional email configured (${r.provider})` }
    : { name: 'email', status: 'degraded', detail: `email missing: ${r.missing.join(', ')}` };
}

export function observabilityHealth(): HealthLine {
  const r = observabilityReadiness();
  return r.ok
    ? { name: 'observability', status: 'ok', detail: 'error, uptime, and alert recipient configured' }
    : { name: 'observability', status: 'degraded', detail: `observability missing: ${r.missing.join(', ')}` };
}

/** Admin-safe tenant health: counts only, never tenant content. */
export async function tenantHealth(tenantId: string): Promise<HealthLine> {
  try {
    const counts = await withTenant(tenantId, async (c) => ({
      businesses: (await c.query(`SELECT COUNT(*)::int AS n FROM businesses WHERE deleted_at IS NULL`)).rows[0].n,
      funnels: (await c.query(`SELECT COUNT(*)::int AS n FROM journeys WHERE deleted_at IS NULL`)).rows[0].n,
    }));
    return { name: 'tenant', status: 'ok', detail: `businesses=${counts.businesses} funnels=${counts.funnels}` };
  } catch (e: any) {
    return { name: 'tenant', status: 'failed', detail: `tenant DB error: ${String(e?.message ?? e).slice(0, 80)}` };
  }
}

export async function fullHealth(): Promise<{ status: 'ok' | 'degraded' | 'failed'; checks: HealthLine[] }> {
  const checks = [basicHealth(), await dbHealth(), await jobsHealth(), integrationsHealth(), llmHealth(), aiBudgetHealth(), emailHealth(), observabilityHealth()];
  const status = checks.some((c) => c.status === 'failed') ? 'failed' : checks.some((c) => c.status === 'degraded') ? 'degraded' : 'ok';
  return { status, checks };
}
