import { verifySignature } from './secrets.js';

/**
 * Integration providers registry + payment adapter pattern. Pure & testable.
 * Adapters are intentionally minimal/mockable in Sprint 15 — they normalize
 * a provider payload into fnnlr's vocabulary without doing any real processing.
 */

export type ProviderId =
  | 'whatsapp_cloud_api' | 'whatsapp_bsp_generic'
  | 'paymob' | 'fawry' | 'tap' | 'hyperpay' | 'moyasar'
  | 'meta_pixel' | 'ga4' | 'outbound_webhook' | 'zapier_make_webhook';

export type Category = 'whatsapp' | 'payment' | 'tracking' | 'webhook';

export interface ProviderMeta {
  id: ProviderId;
  category: Category;
  label: string;
  unlocks: string;                 // the value, in Arabic
  secretFields: string[];          // which credential fields are secret (encrypted)
  settingFields: string[];         // non-secret config
}

export const PROVIDERS: ProviderMeta[] = [
  { id: 'whatsapp_cloud_api', category: 'whatsapp', label: 'WhatsApp Cloud API',
    unlocks: 'اربط واتساب لاستقبال الرسائل وتحديث المحادثات تلقائيًا (بدون إرسال تلقائي).',
    secretFields: ['access_token'], settingFields: ['phone_number_id', 'business_account_id', 'verify_token', 'default_phone'] },
  { id: 'whatsapp_bsp_generic', category: 'whatsapp', label: 'WhatsApp BSP',
    unlocks: 'اربط مزوّد BSP لاستقبال أحداث المحادثات.',
    secretFields: ['api_key'], settingFields: ['endpoint', 'default_phone'] },
  { id: 'paymob', category: 'payment', label: 'Paymob',
    unlocks: 'اربط Paymob لتحديث حالات الدفع تلقائيًا.', secretFields: ['hmac_secret', 'api_key'], settingFields: ['integration_id'] },
  { id: 'fawry', category: 'payment', label: 'فوري', unlocks: 'اربط فوري لتحديث حالات الدفع.', secretFields: ['secure_key'], settingFields: ['merchant_code'] },
  { id: 'tap', category: 'payment', label: 'Tap', unlocks: 'اربط Tap لتحديث حالات الدفع.', secretFields: ['secret_key'], settingFields: [] },
  { id: 'hyperpay', category: 'payment', label: 'HyperPay', unlocks: 'اربط HyperPay لتحديث حالات الدفع.', secretFields: ['access_token'], settingFields: ['entity_id'] },
  { id: 'moyasar', category: 'payment', label: 'Moyasar', unlocks: 'اربط Moyasar لتحديث حالات الدفع.', secretFields: ['secret_key'], settingFields: [] },
  { id: 'meta_pixel', category: 'tracking', label: 'Meta Pixel', unlocks: 'اربط Meta لتحسين الإسناد وتشخيص التسريبات.', secretFields: ['capi_token'], settingFields: ['pixel_id'] },
  { id: 'ga4', category: 'tracking', label: 'Google Analytics 4', unlocks: 'اربط GA4 لقياس رحلة العميل.', secretFields: ['api_secret'], settingFields: ['measurement_id'] },
  { id: 'outbound_webhook', category: 'webhook', label: 'Outbound Webhook', unlocks: 'أرسل الأحداث لأدوات خارجية.', secretFields: ['signing_secret'], settingFields: ['url', 'events'] },
  { id: 'zapier_make_webhook', category: 'webhook', label: 'Zapier / Make', unlocks: 'اربط Make/Zapier/n8n عبر webhook.', secretFields: ['signing_secret'], settingFields: ['url', 'events'] },
];

export function providerMeta(id: string): ProviderMeta | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

// ---- Payment adapter pattern ----

export type NormalizedPaymentStatus = 'payment_started' | 'payment_failed' | 'payment_confirmed' | 'payment_refunded' | 'unknown';

export interface NormalizedPayment {
  status: NormalizedPaymentStatus;
  reference: string | null;   // a lead/payment reference if present in the payload
  amount: number | null;
  externalId: string | null;
}

export interface PaymentProviderAdapter {
  provider: ProviderId;
  verify(rawBody: string, headers: Record<string, string>, secret: string): boolean;
  normalize(payload: any): NormalizedPayment;
}

export function webhookTimestampFresh(headers: Record<string, string>, nowMs = Date.now(), maxAgeSeconds = 300): { ok: boolean; reason?: string } {
  const raw = headers['x-fnnlr-timestamp'] || headers['x-webhook-timestamp'] || headers['x-timestamp'] || headers['webhook-timestamp'] || '';
  if (!raw) return { ok: true };
  const numeric = Number(raw);
  const tsMs = Number.isFinite(numeric) ? (numeric > 10_000_000_000 ? numeric : numeric * 1000) : Date.parse(raw);
  if (!Number.isFinite(tsMs)) return { ok: false, reason: 'invalid webhook timestamp' };
  const ageSeconds = Math.abs(nowMs - tsMs) / 1000;
  return ageSeconds <= maxAgeSeconds ? { ok: true } : { ok: false, reason: 'stale webhook timestamp' };
}

/** Map common provider status strings to fnnlr's normalized status. */
function mapStatusWord(s: string | undefined): NormalizedPaymentStatus {
  const v = (s || '').toLowerCase();
  if (['success', 'paid', 'captured', 'confirmed', 'completed', 'authorized'].some((w) => v.includes(w))) return 'payment_confirmed';
  if (['fail', 'declined', 'error', 'void'].some((w) => v.includes(w))) return 'payment_failed';
  if (['refund', 'reversed', 'chargeback'].some((w) => v.includes(w))) return 'payment_refunded';
  if (['pending', 'initiated', 'started', 'created'].some((w) => v.includes(w))) return 'payment_started';
  return 'unknown';
}

/** A generic adapter that works for most providers' JSON shapes; specific
 *  providers can override extraction. Signature verification is best-effort:
 *  if a secret is configured we check an HMAC header; otherwise we accept in dev. */
function genericAdapter(provider: ProviderId, opts: { statusKeys?: string[]; refKeys?: string[]; amountKeys?: string[]; idKeys?: string[] } = {}): PaymentProviderAdapter {
  const statusKeys = opts.statusKeys ?? ['status', 'payment_status', 'state', 'txn_response_code'];
  const refKeys = opts.refKeys ?? ['merchant_order_id', 'order_id', 'reference', 'metadata.lead_id', 'client_reference', 'merchant_reference'];
  const amountKeys = opts.amountKeys ?? ['amount', 'amount_cents', 'value'];
  const idKeys = opts.idKeys ?? ['id', 'transaction_id', 'txn_id', 'payment_id'];

  const dig = (obj: any, path: string): any => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const first = (obj: any, keys: string[]): any => { for (const k of keys) { const v = dig(obj, k); if (v != null && v !== '') return v; } return undefined; };

  return {
    provider,
    verify(rawBody, headers, secret) {
      if (!secret) return true; // dev: no secret configured → accept (event still stored)
      const fresh = webhookTimestampFresh(headers);
      if (!fresh.ok) return false;
      const sig = headers['x-signature'] || headers['x-fnnlr-signature'] || headers['hmac'] || '';
      return verifySignature(rawBody, secret, sig);
    },
    normalize(payload) {
      const amountRaw = first(payload, amountKeys);
      let amount = amountRaw != null ? Number(amountRaw) : null;
      if (amount != null && amountKeys.includes('amount_cents')) amount = amount / 100;
      // boolean success (e.g. Paymob) → confirmed/failed
      let status: NormalizedPaymentStatus;
      const successVal = dig(payload, 'success') ?? dig(payload, 'obj.success');
      if (typeof successVal === 'boolean') status = successVal ? 'payment_confirmed' : 'payment_failed';
      else status = mapStatusWord(String(first(payload, statusKeys)));
      return {
        status,
        reference: (first(payload, refKeys) as string) ?? null,
        amount: Number.isFinite(amount as number) ? amount : null,
        externalId: (first(payload, idKeys) as string)?.toString() ?? null,
      };
    },
  };
}

const ADAPTERS: Record<string, PaymentProviderAdapter> = {
  paymob: genericAdapter('paymob', { amountKeys: ['amount_cents'], statusKeys: ['success', 'txn_response_code', 'status'] }),
  fawry: genericAdapter('fawry', { statusKeys: ['orderStatus', 'status'], refKeys: ['merchantRefNumber', 'reference'] }),
  tap: genericAdapter('tap', { refKeys: ['reference.order', 'metadata.lead_id', 'reference'] }),
  hyperpay: genericAdapter('hyperpay', { statusKeys: ['result.code', 'status'] }),
  moyasar: genericAdapter('moyasar', { refKeys: ['metadata.lead_id', 'description', 'id'] }),
};

export function paymentAdapter(provider: string): PaymentProviderAdapter {
  return ADAPTERS[provider] ?? genericAdapter(provider as ProviderId);
}
