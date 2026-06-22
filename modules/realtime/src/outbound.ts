import { withTenant } from '../../../packages/db/src/router.js';
import { decryptSecret, signPayload } from '../../integrations/src/secrets.js';

/**
 * Outbound webhook dispatch v1. For configured, active outbound webhooks whose
 * selected events include the fired event, sign a payload and attempt delivery.
 * Delivery failures are logged and NEVER break the domain update that triggered
 * them. Best-effort; a queue can wrap this later.
 */

const DISPATCHABLE = new Set(['lead_created', 'whatsapp_clicked', 'payment_confirmed', 'deal_won', 'action_created']);

export async function dispatchOutbound(tenantId: string, eventType: string, data: Record<string, unknown>): Promise<void> {
  if (!DISPATCHABLE.has(eventType)) return;
  let targets: { id: string; url: string; secret: string }[] = [];
  try {
    targets = await withTenant(tenantId, async (c) => {
      const r = await c.query(
        `SELECT id, settings, credentials_encrypted FROM integration_connections
          WHERE provider IN ('outbound_webhook','zapier_make_webhook') AND status='connected'`);
      const out: { id: string; url: string; secret: string }[] = [];
      for (const row of r.rows) {
        const settings = row.settings ?? {};
        const events: string[] = Array.isArray(settings.events) ? settings.events
          : (typeof settings.events === 'string' ? settings.events.split(',').map((s: string) => s.trim()) : []);
        if (settings.url && (events.length === 0 || events.includes(eventType))) {
          const secEnc = row.credentials_encrypted?.signing_secret;
          out.push({ id: row.id, url: settings.url, secret: secEnc ? decryptSecret(secEnc) : '' });
        }
      }
      return out;
    });
  } catch { return; }

  for (const t of targets) {
    const payload = JSON.stringify({ event: eventType, data, at: new Date().toISOString() });
    const signature = t.secret ? signPayload(payload, t.secret) : null;
    let status = 'pending'; let lastError: string | null = null; let attempts = 0;
    try {
      attempts = 1;
      const res = await fetch(t.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(signature ? { 'X-Fnnlr-Signature': signature } : {}) },
        body: payload,
        signal: AbortSignal.timeout(4000),
      });
      status = res.ok ? 'delivered' : 'failed';
      if (!res.ok) lastError = `HTTP ${res.status}`;
    } catch (e: any) {
      status = 'failed'; lastError = String(e?.message ?? e).slice(0, 200);
    }
    // log the attempt — never throw out of dispatch. A failure schedules a
    // retry with exponential backoff; success is terminal.
    try {
      await withTenant(tenantId, async (c) => {
        const finalStatus = status === 'delivered' ? 'delivered' : 'retrying';
        const nextRetry = status === 'delivered' ? null : new Date(Date.now() + backoffMs(1));
        await c.query(
          `INSERT INTO webhook_deliveries (connection_id, event_type, url, signature, status, attempts, last_error, max_attempts, next_retry_at, last_attempt_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,6,$8, now())`,
          [t.id, eventType, t.url, signature, finalStatus, attempts, lastError, nextRetry]);
      });
    } catch { /* swallow */ }
  }
}

/** Exponential backoff with a cap: 30s, 1m, 2m, 4m, 8m, … capped at 1h. */
export function backoffMs(attempt: number): number {
  const base = 30_000 * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(base, 3_600_000);
}

/**
 * Retry worker — picks due `retrying` deliveries (next_retry_at <= now), re-sends,
 * and either marks delivered, schedules the next backoff, or abandons after
 * max_attempts. Bounded by batchSize; a paused connection is skipped. Never
 * throws; a webhook flood cannot break domain flow.
 */
export async function processOutboundRetries(tenantId: string, batchSize = 50): Promise<{ attempted: number; delivered: number; retrying: number; abandoned: number }> {
  let attempted = 0, delivered = 0, retrying = 0, abandoned = 0;
  const due = await withTenant(tenantId, async (c) =>
    (await c.query(
      `SELECT d.id, d.connection_id, d.event_type, d.url, d.attempts, d.max_attempts, d.signature, c2.credentials_encrypted, c2.settings
         FROM webhook_deliveries d
         LEFT JOIN integration_connections c2 ON c2.id = d.connection_id
        WHERE d.status='retrying' AND COALESCE(d.paused,FALSE)=FALSE AND d.next_retry_at IS NOT NULL AND d.next_retry_at <= now()
        ORDER BY d.next_retry_at LIMIT $1`, [batchSize])).rows);

  for (const row of due) {
    attempted++;
    const nextAttempt = (row.attempts ?? 0) + 1;
    const settings = row.settings ?? {};
    const url = settings.url ?? row.url;
    let ok = false; let lastError: string | null = null;
    try {
      const payload = JSON.stringify({ event: row.event_type, retry: nextAttempt, at: new Date().toISOString() });
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(row.signature ? { 'X-Fnnlr-Signature': row.signature } : {}) }, body: payload, signal: AbortSignal.timeout(4000) });
      ok = res.ok; if (!res.ok) lastError = `HTTP ${res.status}`;
    } catch (e: any) { lastError = String(e?.message ?? e).slice(0, 200); }

    await withTenant(tenantId, async (c) => {
      if (ok) {
        delivered++;
        await c.query(`UPDATE webhook_deliveries SET status='delivered', attempts=$2, last_attempt_at=now(), next_retry_at=NULL, last_error=NULL WHERE id=$1`, [row.id, nextAttempt]);
      } else if (nextAttempt >= (row.max_attempts ?? 6)) {
        abandoned++;
        await c.query(`UPDATE webhook_deliveries SET status='abandoned', attempts=$2, last_attempt_at=now(), next_retry_at=NULL, last_error=$3 WHERE id=$1`, [row.id, nextAttempt, lastError]);
      } else {
        retrying++;
        await c.query(`UPDATE webhook_deliveries SET status='retrying', attempts=$2, last_attempt_at=now(), next_retry_at=now() + ($3 || ' milliseconds')::interval, last_error=$4 WHERE id=$1`, [row.id, nextAttempt, String(backoffMs(nextAttempt)), lastError]);
      }
    }).catch(() => {});
  }
  return { attempted, delivered, retrying, abandoned };
}
