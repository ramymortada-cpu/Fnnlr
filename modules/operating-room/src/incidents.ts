/**
 * Incident classifier — PURE, rule-based. Maps observed evidence to a severity
 * (P0..P3) with reason, evidence, suggested fix, owner, and a safe disable/
 * rollback option. It invents nothing: every incident points at a real signal
 * already gathered elsewhere (health, activation, ops, support snapshot).
 */

export type Severity = 'P0' | 'P1' | 'P2' | 'P3';

export interface Incident {
  severity: Severity;
  code: string;
  reason: string;
  evidence: string;
  suggestedFix: string;
  owner: 'platform' | 'support' | 'customer';
  safeRollback: string | null;
}

/** The evidence the classifier reads — all sourced from existing surfaces. */
export interface OperatingEvidence {
  health: { control_db: 'ok' | 'degraded' | 'failed'; integrations: 'ok' | 'degraded' | 'failed'; llm: 'ok' | 'degraded' | 'failed'; jobs: 'ok' | 'degraded' | 'failed' };
  releaseChecker: { pass: boolean; blocking: string[] };
  isProd: boolean;
  devTrustInProd: boolean;
  encryptionFailClosed: boolean;
  activation: { stage: string; launchReady: boolean; blockingReason: string | null } | null;
  signals: { pageViews: number; whatsappClicks: number; leads: number; paymentStates: number };
  desk: { activationMode: boolean; itemCount: number } | null;
  ops: { jobFailures24h: number; webhookFailures24h: number; retriesPending: number; abandoned24h: number };
  recommendations: { count: number; outcomesMeasured: number };
}

export function classifyIncidents(e: OperatingEvidence): Incident[] {
  const out: Incident[] = [];

  // ---- P0: critical — security / availability / corruption risk ----
  if (e.health.control_db === 'failed') {
    out.push({ severity: 'P0', code: 'control_db_unreachable', reason: 'Control-plane database is unreachable.', evidence: 'health.control_db=failed', suggestedFix: 'Check DB connectivity and CONTROL_PLANE_DATABASE_URL.', owner: 'platform', safeRollback: 'Take the app offline until the DB is restored.' });
  }
  if (e.isProd && e.devTrustInProd) {
    out.push({ severity: 'P0', code: 'dev_tenant_trust_in_prod', reason: 'FNNLR_DEV_MODE is enabled in production — the API would trust a client tenant header.', evidence: 'isProd && devTrustInProd', suggestedFix: 'Unset FNNLR_DEV_MODE and restart.', owner: 'platform', safeRollback: 'Disable the deployment until the flag is removed.' });
  }
  if (e.isProd && !e.encryptionFailClosed) {
    out.push({ severity: 'P0', code: 'encryption_not_fail_closed', reason: 'Encryption does not fail closed in production — credentials could be stored in plaintext.', evidence: 'isProd && !encryptionFailClosed', suggestedFix: 'Set the encryption keys; verify encryptSecret throws without them.', owner: 'platform', safeRollback: 'Disable integrations until verified.' });
  }
  if (e.isProd && !e.releaseChecker.pass) {
    out.push({ severity: 'P0', code: 'release_checker_failed', reason: 'Release checker reports blocking issues in production.', evidence: e.releaseChecker.blocking.slice(0, 3).join('; ') || 'release checker fail', suggestedFix: 'Resolve blocking issues, then re-run deploy:check.', owner: 'platform', safeRollback: 'Hold the deployment.' });
  }

  // ---- P1: customer blocked — real signal exists but flow is broken ----
  // Revenue Desk empty after a real signal (not activation mode) → broken aggregation
  if (e.desk && !e.desk.activationMode && e.desk.itemCount === 0 && (e.signals.leads > 0 || e.signals.paymentStates > 0)) {
    out.push({ severity: 'P1', code: 'revenue_desk_empty_after_signal', reason: 'Revenue Desk is empty despite real leads/payment activity.', evidence: `leads=${e.signals.leads} paymentStates=${e.signals.paymentStates} deskItems=0`, suggestedFix: 'Check opportunity/recommendation generation for this funnel.', owner: 'platform', safeRollback: null });
  }
  // WhatsApp clicks but no leads → click→lead path broken
  if (e.signals.whatsappClicks > 0 && e.signals.leads === 0) {
    out.push({ severity: 'P1', code: 'clicks_without_leads', reason: 'WhatsApp clicks are recorded but no lead was created.', evidence: `whatsappClicks=${e.signals.whatsappClicks} leads=0`, suggestedFix: 'Check inbound WhatsApp processing / connection mapping.', owner: 'support', safeRollback: null });
  }
  // jobs failing repeatedly
  if (e.ops.jobFailures24h >= 3) {
    out.push({ severity: 'P1', code: 'jobs_failing', reason: 'Scheduled jobs are failing repeatedly.', evidence: `jobFailures24h=${e.ops.jobFailures24h}`, suggestedFix: 'Inspect /ops/status and recent scheduled_runs errors.', owner: 'platform', safeRollback: 'Set FNNLR_DISABLE_JOBS=true to pause jobs while investigating.' });
  }

  // ---- P2: degraded — works, but reduced ----
  if (e.health.llm === 'degraded') {
    out.push({ severity: 'P2', code: 'llm_degraded', reason: 'No LLM key — AI features run in degraded fallback.', evidence: 'health.llm=degraded', suggestedFix: 'Set ANTHROPIC_API_KEY for full generation.', owner: 'platform', safeRollback: null });
  }
  if (e.ops.retriesPending >= 10) {
    out.push({ severity: 'P2', code: 'retries_accumulating', reason: 'Outbound webhook retries are accumulating.', evidence: `retriesPending=${e.ops.retriesPending}`, suggestedFix: 'Check the destination endpoint; run outbound-retries.', owner: 'platform', safeRollback: 'Pause the connection (webhook_deliveries.paused) if the endpoint is down.' });
  }
  if (e.ops.webhookFailures24h > 0) {
    out.push({ severity: 'P2', code: 'webhook_failures', reason: 'Some webhook deliveries failed in the last 24h.', evidence: `webhookFailures24h=${e.ops.webhookFailures24h}`, suggestedFix: 'Review failed deliveries; verify signature/connection.', owner: 'support', safeRollback: null });
  }

  // ---- P3: informational — not yet, but not wrong ----
  if (e.signals.pageViews === 0 && e.signals.whatsappClicks === 0) {
    out.push({ severity: 'P3', code: 'no_traffic_yet', reason: 'No traffic has arrived yet.', evidence: 'pageViews=0 whatsappClicks=0', suggestedFix: 'Share the tracked link / drive first traffic.', owner: 'customer', safeRollback: null });
  }
  if (e.signals.paymentStates === 0) {
    out.push({ severity: 'P3', code: 'no_payment_states_yet', reason: 'No payment states recorded yet.', evidence: 'paymentStates=0', suggestedFix: 'Expected until a customer pays; nothing to do.', owner: 'customer', safeRollback: null });
  }
  if (e.recommendations.count === 0) {
    out.push({ severity: 'P3', code: 'insufficient_evidence_for_recommendations', reason: 'Not enough observed data for recommendations yet.', evidence: 'recommendations=0', suggestedFix: 'Recommendations appear once there is enough real activity.', owner: 'support', safeRollback: null });
  }

  return out;
}

export function highestSeverity(incidents: Incident[]): Severity | null {
  const order: Severity[] = ['P0', 'P1', 'P2', 'P3'];
  for (const s of order) if (incidents.some((i) => i.severity === s)) return s;
  return null;
}
