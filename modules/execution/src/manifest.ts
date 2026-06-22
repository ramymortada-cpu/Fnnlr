import { validateCustomerConfig, type CustomerConfig, type ConfigIssue } from '../../customer-zero/src/config.js';

/**
 * Execution manifest — the real launch description for Customer Zero. It extends
 * the customer config with launch-day fields (WhatsApp provider status, traffic
 * source, launch window, rollback owner). Contains NO secrets. The validator is
 * stricter than the base config: it additionally requires support owner, launch
 * window, and payment instructions, so a launch never proceeds on a half-filled
 * manifest.
 */

export type WhatsAppProviderStatus = 'manual_link_only' | 'webhook_connected' | 'pending_bsp';
export type PaymentKind = 'bank_transfer' | 'wallet' | 'cash_on_delivery' | 'manual_proof';

export interface ExecutionManifest extends CustomerConfig {
  customerName: string;
  whatsappProviderStatus: WhatsAppProviderStatus;
  paymentKind?: PaymentKind;
  firstFunnelName?: string;
  pageSlug?: string;
  trafficSource?: string;
  launchWindow?: string;   // e.g. "2026-06-22 18:00 EET" — free text, must be present
  rollbackOwner?: string;
}

export interface ManifestValidation { ok: boolean; issues: ConfigIssue[]; }

export function validateExecutionManifest(m: Partial<ExecutionManifest>, opts: { production?: boolean } = {}): ManifestValidation {
  // start from the base customer-config validation (covers business name, public
  // URL in prod, WhatsApp format, payment method, secret-looking fields)
  const base = validateCustomerConfig(m as Partial<CustomerConfig>, opts);
  const issues: ConfigIssue[] = [...base.issues];
  const fail = (field: string, message: string) => issues.push({ field, level: 'fail', message });

  if (!m.customerName?.trim()) fail('customerName', 'customer name is required');
  if (!m.supportOwner?.trim()) fail('supportOwner', 'support owner is required (who owns this launch)');
  if (!m.launchWindow?.trim()) fail('launchWindow', 'launch window is required');
  if (!m.payment?.instructions?.trim()) fail('payment.instructions', 'payment instructions are required (activation is blocked without them)');

  const validProviders: WhatsAppProviderStatus[] = ['manual_link_only', 'webhook_connected', 'pending_bsp'];
  if (m.whatsappProviderStatus && !validProviders.includes(m.whatsappProviderStatus)) {
    fail('whatsappProviderStatus', `whatsappProviderStatus must be one of: ${validProviders.join(', ')}`);
  } else if (!m.whatsappProviderStatus) {
    fail('whatsappProviderStatus', 'whatsappProviderStatus is required');
  }

  return { ok: issues.every((i) => i.level !== 'fail'), issues };
}

/** Safe echo for logs/summaries — masks the WhatsApp number, drops anything sensitive. */
export function safeManifestEcho(m: Partial<ExecutionManifest>): Record<string, unknown> {
  return {
    customerName: m.customerName,
    workspaceName: m.workspaceName,
    business: m.business,
    whatsappNumber: m.whatsappNumber ? `…${String(m.whatsappNumber).slice(-4)}` : null,
    whatsappProviderStatus: m.whatsappProviderStatus ?? null,
    paymentKind: m.paymentKind ?? null,
    hasPaymentInstructions: !!m.payment?.instructions,
    publicAppUrl: m.publicAppUrl ?? null,
    trafficSource: m.trafficSource ?? null,
    launchWindow: m.launchWindow ?? null,
    supportOwner: m.supportOwner ?? null,
    rollbackOwner: m.rollbackOwner ?? null,
  };
}
