import { withTenant } from '../../../packages/db/src/router.js';
import { encryptSecret, maskCredentials, encryptCredentials, decryptSecret, signPayload, verifySignature } from './secrets.js';
import { providerMeta, paymentAdapter, PROVIDERS, webhookTimestampFresh } from './providers.js';
import { auditWith } from '../../security/src/audit.js';
import { registerIntegrationRoute, unregisterIntegrationRoute } from './resolver.js';

/**
 * Integrations service. Connections store ENCRYPTED credentials; only masked
 * values ever leave the server. Webhook handlers store raw payloads and map
 * basic events. No auto-send, no payment processing — just connect + observe.
 */

async function emit(c: any, type: string, payload: unknown) {
  await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'integration',$2)`, [type, JSON.stringify(payload ?? {})]);
}

/** Connection row, safe for the frontend (secrets masked, never raw). */
function toSafe(row: any) {
  return {
    id: row.id, provider: row.provider, status: row.status,
    settings: row.settings ?? {},
    credentials_masked: maskCredentials(row.credentials_encrypted ?? {}),
    hasWebhookSecret: !!row.webhook_secret_enc,
    last_health_check_at: row.last_health_check_at, last_health_status: row.last_health_status,
    last_sync_at: row.last_sync_at, last_error: row.last_error,
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

export function listProviders() {
  return PROVIDERS.map((p) => ({ id: p.id, category: p.category, label: p.label, unlocks: p.unlocks, secretFields: p.secretFields, settingFields: p.settingFields }));
}

export async function listConnections(tenantId: string, journeyId?: string) {
  return withTenant(tenantId, async (c) => {
    const r = journeyId
      ? await c.query(`SELECT * FROM integration_connections WHERE journey_id=$1 OR journey_id IS NULL ORDER BY created_at DESC`, [journeyId])
      : await c.query(`SELECT * FROM integration_connections ORDER BY created_at DESC`);
    return r.rows.map(toSafe);
  });
}

export async function getConnection(tenantId: string, id: string) {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT * FROM integration_connections WHERE id=$1`, [id]);
    return r.rowCount ? toSafe(r.rows[0]) : null;
  });
}

export async function createConnection(tenantId: string, input: { provider: string; journeyId?: string; credentials?: Record<string, string>; settings?: Record<string, unknown>; webhookSecret?: string }) {
  const meta = providerMeta(input.provider);
  if (!meta) return null;
  const creds = encryptCredentials(input.credentials ?? {});
  const webhookSecretEnc = input.webhookSecret ? encryptSecret(input.webhookSecret) : null;
  const connected = Object.keys(creds).length > 0;
  const id = await withTenant(tenantId, async (c) => {
    const r = await c.query(
      `INSERT INTO integration_connections (journey_id, provider, status, credentials_encrypted, settings, webhook_secret_enc)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [input.journeyId ?? null, input.provider, connected ? 'connected' : 'not_connected',
       JSON.stringify(creds), JSON.stringify(input.settings ?? {}), webhookSecretEnc]);
    await emit(c, connected ? 'integration_connected' : 'integration_created', { provider: input.provider });
    return r.rows[0].id as string;
  });
  // register the connection→tenant route so webhooks resolve without a header
  await registerIntegrationRoute(id, input.provider, tenantId);
  return getConnection(tenantId, id);
}

export async function updateConnection(tenantId: string, id: string, patch: { credentials?: Record<string, string>; settings?: Record<string, unknown>; status?: string; webhookSecret?: string }) {
  await withTenant(tenantId, async (c) => {
    const cur = await c.query(`SELECT credentials_encrypted FROM integration_connections WHERE id=$1`, [id]);
    if (!cur.rowCount) return;
    const sets: string[] = []; const params: unknown[] = [id]; let i = 2;
    if (patch.credentials) {
      // merge: only overwrite provided fields, keep others
      const merged = { ...(cur.rows[0].credentials_encrypted ?? {}), ...encryptCredentials(patch.credentials) };
      sets.push(`credentials_encrypted=$${i++}`); params.push(JSON.stringify(merged));
      sets.push(`status='connected'`);
    }
    if (patch.settings) { sets.push(`settings=$${i++}`); params.push(JSON.stringify(patch.settings)); }
    if (patch.status) { sets.push(`status=$${i++}`); params.push(patch.status); }
    if (patch.webhookSecret) { sets.push(`webhook_secret_enc=$${i++}`); params.push(encryptSecret(patch.webhookSecret)); }
    if (!sets.length) return;
    await c.query(`UPDATE integration_connections SET ${sets.join(', ')}, updated_at=now() WHERE id=$1`, params);
  });
  return getConnection(tenantId, id);
}

export async function deleteConnection(tenantId: string, id: string) {
  await withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT provider FROM integration_connections WHERE id=$1`, [id]);
    await c.query(`DELETE FROM integration_connections WHERE id=$1`, [id]);
    if (r.rowCount) await emit(c, 'integration_disconnected', { provider: r.rows[0].provider });
    await auditWith(c, 'user', 'integration_disconnected', id, { provider: r.rowCount ? r.rows[0].provider : null });
  });
  await unregisterIntegrationRoute(id);
  return { ok: true };
}

export async function rotateSecret(tenantId: string, id: string, field: string, value: string) {
  await withTenant(tenantId, async (c) => {
    const cur = await c.query(`SELECT credentials_encrypted FROM integration_connections WHERE id=$1`, [id]);
    if (!cur.rowCount) return;
    const merged = { ...(cur.rows[0].credentials_encrypted ?? {}), [field]: encryptSecret(value) };
    await c.query(`UPDATE integration_connections SET credentials_encrypted=$2, updated_at=now() WHERE id=$1`, [id, JSON.stringify(merged)]);
    await emit(c, 'integration_credentials_rotated', { field });
  });
  return getConnection(tenantId, id);
}

/** Health check — validates config SHAPE (not real network calls in V1). */
export async function healthCheck(tenantId: string, id: string) {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT * FROM integration_connections WHERE id=$1`, [id]);
    if (!r.rowCount) return null;
    const row = r.rows[0];
    const meta = providerMeta(row.provider);
    let status: 'healthy' | 'warning' | 'error' | 'not_configured' = 'not_configured';
    const creds = row.credentials_encrypted ?? {};
    const settings = row.settings ?? {};
    if (meta) {
      const hasSecrets = meta.secretFields.every((f) => creds[f]);
      const hasSettings = meta.settingFields.length === 0 || meta.settingFields.some((f) => settings[f]);
      if (hasSecrets && hasSettings) status = 'healthy';
      else if (hasSecrets || hasSettings) status = 'warning';
      else status = 'not_configured';
    }
    await c.query(`UPDATE integration_connections SET last_health_check_at=now(), last_health_status=$2 WHERE id=$1`, [id, status]);
    return { status };
  });
}

// ---- Webhook handlers (tenant already resolved server-side from connectionId) ----

/** WhatsApp inbound webhook: store raw + map message_received. NEVER replies. */
export async function handleWhatsAppWebhook(tenantId: string, connectionId: string, rawBody: string, headers: Record<string, string>) {
  return withTenant(tenantId, async (c) => {
    const conn = await c.query(`SELECT * FROM integration_connections WHERE id=$1`, [connectionId]);
    if (!conn.rowCount) return { ok: false, reason: 'connection not found' };
    let payload: any = {}; try { payload = JSON.parse(rawBody); } catch { /* keep raw */ }

    // signature check — FAIL-CLOSED: if a secret is configured, a valid
    // signature is REQUIRED (a missing signature is rejected, not skipped).
    const secretEnc = conn.rows[0].webhook_secret_enc;
    if (secretEnc) {
      const secret = decryptSecret(secretEnc);
      const fresh = webhookTimestampFresh(headers);
      if (!fresh.ok) {
        await c.query(`INSERT INTO integration_events (connection_id, provider, raw_payload, processed_status, error) VALUES ($1,'whatsapp_cloud_api',$2,'error',$3)`, [connectionId, JSON.stringify(payload), fresh.reason]);
        await auditWith(c, 'system', 'webhook_rejected', connectionId, { provider: 'whatsapp_cloud_api', reason: fresh.reason });
        return { ok: false, reason: fresh.reason };
      }
      const sig = headers['x-hub-signature-256']?.replace('sha256=', '') || headers['x-signature'] || '';
      if (!sig || !verifySignature(rawBody, secret, sig)) {
        await c.query(`INSERT INTO integration_events (connection_id, provider, raw_payload, processed_status, error) VALUES ($1,'whatsapp_cloud_api',$2,'error','invalid or missing signature')`, [connectionId, JSON.stringify(payload)]);
        await auditWith(c, 'system', 'webhook_rejected', connectionId, { provider: 'whatsapp_cloud_api', reason: sig ? 'invalid signature' : 'missing signature' });
        return { ok: false, reason: 'invalid signature' };
      }
    }

    // map a basic message_received (Cloud API shape)
    let mapped: string | null = null;
    let fromPhone: string | null = null; let text: string | null = null;
    try {
      const msg = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (msg) { mapped = 'message_received'; fromPhone = msg.from ?? null; text = msg.text?.body ?? null; }
    } catch { /* unknown shape */ }

    await c.query(
      `INSERT INTO integration_events (connection_id, provider, event_type, raw_payload, mapped_event_type, processed_status, processed_at)
       VALUES ($1,'whatsapp_cloud_api',$2,$3,$4,$5, now())`,
      [connectionId, mapped ?? 'webhook', JSON.stringify(payload), mapped, mapped ? 'mapped' : 'received']);
    await emit(c, 'whatsapp_webhook_received', { connectionId });
    await c.query(`UPDATE integration_connections SET last_sync_at=now() WHERE id=$1`, [connectionId]);
    return { ok: true, mapped, enrich: mapped === 'message_received' && fromPhone ? { fromPhone, text } : null };
  }).then(async (r: any) => {
    // real-time enrichment runs in its own tenant scope (find/create conv+lead,
    // open service window, generate actions). Never sends a reply.
    if (r.ok && r.enrich) {
      const { processWhatsAppInbound } = await import('../../realtime/src/processor.js');
      await processWhatsAppInbound(tenantId, { connectionId, fromPhone: r.enrich.fromPhone, text: r.enrich.text }).catch(() => {});
    }
    return r;
  });
}

/** Payment webhook: store raw, normalize via adapter, update payment_state if a lead reference matches. */
export async function handlePaymentWebhook(tenantId: string, provider: string, connectionId: string, rawBody: string, headers: Record<string, string>) {
  return withTenant(tenantId, async (c) => {
    const conn = await c.query(`SELECT * FROM integration_connections WHERE id=$1`, [connectionId]);
    if (!conn.rowCount) return { ok: false, reason: 'connection not found' };
    let payload: any = {}; try { payload = JSON.parse(rawBody); } catch { /* keep raw */ }

    const adapter = paymentAdapter(provider);
    const secretEnc = conn.rows[0].webhook_secret_enc;
    // FAIL-CLOSED: in production, providers that sign their webhooks must have a
    // secret configured, otherwise we cannot trust the payload — reject it.
    const SIGNATURE_REQUIRED = new Set(['paymob', 'fawry', 'tap', 'hyperpay', 'moyasar']);
    if (process.env.NODE_ENV === 'production' && SIGNATURE_REQUIRED.has(provider) && !secretEnc) {
      await c.query(`INSERT INTO integration_events (connection_id, provider, raw_payload, processed_status, error) VALUES ($1,$2,$3,'error','signature required but no secret configured')`, [connectionId, provider, JSON.stringify(payload)]);
      await auditWith(c, 'system', 'webhook_rejected', connectionId, { provider, reason: 'signature required' });
      return { ok: false, reason: 'signature required' };
    }
    if (secretEnc) {
      const secret = decryptSecret(secretEnc);
      if (!adapter.verify(rawBody, headers, secret)) {
        await c.query(`INSERT INTO integration_events (connection_id, provider, raw_payload, processed_status, error) VALUES ($1,$2,$3,'error','invalid signature')`, [connectionId, provider, JSON.stringify(payload)]);
        await auditWith(c, 'system', 'webhook_rejected', connectionId, { provider, reason: 'invalid signature' });
        return { ok: false, reason: 'invalid signature' };
      }
    }

    const norm = adapter.normalize(payload);
    const mapped = norm.status === 'unknown' ? null : norm.status;

    // store the raw event first (audit), then enrich via the processor.
    // Idempotent on (connection_id, external_id): a duplicate provider event is
    // stored once and not re-processed.
    const evRow = await c.query(
      `INSERT INTO integration_events (connection_id, provider, event_type, external_id, raw_payload, mapped_event_type, processed_status)
       VALUES ($1,$2,$3,$4,$5,$6,'received')
       ON CONFLICT (connection_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [connectionId, provider, norm.status, norm.externalId, JSON.stringify(payload), mapped]);
    if (norm.externalId && evRow.rowCount === 0) {
      // duplicate event — already processed once; acknowledge without re-applying.
      return { ok: true, status: norm.status, norm: null, duplicate: true };
    }
    await emit(c, 'payment_webhook_received', { provider, status: norm.status });
    await c.query(`UPDATE integration_connections SET last_sync_at=now() WHERE id=$1`, [connectionId]);
    return { ok: true, status: norm.status, norm, eventId: evRow.rows[0].id };
  }).then(async (r: any) => {
    if (!r.ok || !r.norm) return r;
    // enrich: match lead, update payment state, generate actions (or unmatched admin action)
    const { processPaymentEvent } = await import('../../realtime/src/processor.js');
    const out = await processPaymentEvent(tenantId, {
      connectionId, provider, status: r.norm.status, reference: r.norm.reference, amount: r.norm.amount, externalId: r.norm.externalId,
    }).catch(() => ({ matched: false } as any));
    // update the stored event with the matching outcome
    await withTenant(tenantId, async (c) => {
      await c.query(
        `UPDATE integration_events SET processed_status=$2, processed_at=now(), matched_lead_id=$3 WHERE id=$1`,
        [r.eventId, out.matched ? 'applied' : 'unmatched', out.leadId ?? null]);
    }).catch(() => {});
    return { ok: true, status: r.status, processed: out.matched ? 'applied' : 'unmatched', matchedLead: out.leadId ?? null, action: out.action };
  });
}

/** Outbound webhook test: sign a sample payload and report what would be sent. */
export async function testOutboundWebhook(tenantId: string, id: string) {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT * FROM integration_connections WHERE id=$1`, [id]);
    if (!r.rowCount) return null;
    const settings = r.rows[0].settings ?? {};
    const secret = r.rows[0].credentials_encrypted?.signing_secret ? decryptSecret(r.rows[0].credentials_encrypted.signing_secret) : '';
    const sample = JSON.stringify({ event: 'lead_created', test: true, at: new Date().toISOString() });
    const signature = secret ? signPayload(sample, secret) : null;
    await emit(c, 'integration_outbound_test', { url: settings.url });
    return { url: settings.url ?? null, signature, samplePayload: JSON.parse(sample), delivered: false, note: 'توقيع جاهز — الإرسال الفعلي بيتفعّل لاحقًا' };
  });
}
