/**
 * Customer Zero config — the declarative description of a first customer.
 * Contains NO secrets (keys/tokens live only in env). The validator turns a
 * config into pass/fail with explicit blocking issues, so a deployment never
 * relies on a developer remembering required fields.
 */

export interface CustomerConfig {
  workspaceName: string;
  ownerEmail: string;
  business: {
    name: string;
    market?: string;       // eg | sa | ae | gulf | general
    language?: string;     // masry | khaleeji | msa
  };
  whatsappNumber?: string; // E.164-ish, digits with optional +
  offer?: { promise?: string; price?: string; package?: string };
  payment?: { method: string; accountDetails?: string; instructions?: string };
  publicAppUrl?: string;
  apiUrl?: string;
  supportOwner?: string;
  allowedIntegrations?: string[];
  createFunnel?: boolean;  // default true; if a funnel already exists, reuse
}

export interface ConfigIssue { field: string; level: 'fail' | 'warn'; message: string; }

const WA_RE = /^\+?\d{8,15}$/;

/**
 * Validate a config for a given mode. In production, public URLs and a payment
 * method are required (activation is blocked without payment instructions, and
 * the hosted page needs a public URL).
 */
export function validateCustomerConfig(cfg: Partial<CustomerConfig>, opts: { production?: boolean } = {}): { ok: boolean; issues: ConfigIssue[] } {
  const issues: ConfigIssue[] = [];
  const fail = (field: string, message: string) => issues.push({ field, level: 'fail', message });
  const warn = (field: string, message: string) => issues.push({ field, level: 'warn', message });

  if (!cfg.workspaceName?.trim()) fail('workspaceName', 'workspace name is required');
  if (!cfg.ownerEmail?.trim()) fail('ownerEmail', 'owner email is required');
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cfg.ownerEmail)) fail('ownerEmail', 'owner email is not a valid email');
  if (!cfg.business?.name?.trim()) fail('business.name', 'business name is required');

  if (cfg.whatsappNumber && !WA_RE.test(cfg.whatsappNumber.replace(/[\s-]/g, ''))) {
    fail('whatsappNumber', 'WhatsApp number must be 8–15 digits (optionally +)');
  } else if (!cfg.whatsappNumber) {
    warn('whatsappNumber', 'no WhatsApp number — tracked WhatsApp link will need one before going live');
  }

  if (!cfg.payment?.method) {
    // activation is blocked without payment instructions; in prod that's a hard fail
    (opts.production ? fail : warn)('payment', 'no payment method — activation will be blocked until configured');
  }

  if (opts.production) {
    if (!cfg.publicAppUrl?.trim()) fail('publicAppUrl', 'public app URL is required in production');
    if (!cfg.apiUrl?.trim()) warn('apiUrl', 'api URL not set');
  }

  // never accept secret-looking fields in the config
  for (const k of Object.keys(cfg)) {
    if (/secret|token|api[_-]?key|password/i.test(k)) fail(k, 'secrets must not appear in the customer config (use env)');
  }

  return { ok: issues.every((i) => i.level !== 'fail'), issues };
}

/** A redacted, safe echo of the config for logs/snapshots — no secret-ish values. */
export function safeConfigEcho(cfg: Partial<CustomerConfig>): Record<string, unknown> {
  return {
    workspaceName: cfg.workspaceName,
    ownerEmail: cfg.ownerEmail,
    business: cfg.business,
    whatsappNumber: cfg.whatsappNumber ? `…${String(cfg.whatsappNumber).slice(-4)}` : null,
    hasOffer: !!cfg.offer,
    hasPayment: !!cfg.payment?.method,
    publicAppUrl: cfg.publicAppUrl ?? null,
    supportOwner: cfg.supportOwner ?? null,
  };
}
