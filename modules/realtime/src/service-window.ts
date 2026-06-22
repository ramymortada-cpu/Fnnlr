/**
 * WhatsApp 24h service-window logic. PURE. A free-form reply is allowed within
 * 24h of the customer's last inbound message; after that a (paid) template is
 * required. fnnlr never sends — this only informs the copilot and actions.
 */

export type WindowStatus = 'open' | 'expiring_soon' | 'closed' | 'unknown';

export const SERVICE_WINDOW_HOURS = 24;
const EXPIRING_SOON_HOURS = 3;

/** Given the last inbound time, compute the window status + expiry. */
export function computeServiceWindow(lastInboundAt: Date | null, now: Date = new Date()): {
  status: WindowStatus;
  opensAt: Date | null;
  expiresAt: Date | null;
  hoursLeft: number | null;
} {
  if (!lastInboundAt) return { status: 'unknown', opensAt: null, expiresAt: null, hoursLeft: null };
  const expiresAt = new Date(lastInboundAt.getTime() + SERVICE_WINDOW_HOURS * 3600_000);
  const msLeft = expiresAt.getTime() - now.getTime();
  const hoursLeft = msLeft / 3600_000;
  let status: WindowStatus;
  if (msLeft <= 0) status = 'closed';
  else if (hoursLeft <= EXPIRING_SOON_HOURS) status = 'expiring_soon';
  else status = 'open';
  return { status, opensAt: lastInboundAt, expiresAt, hoursLeft: Math.max(0, hoursLeft) };
}

/** A short Arabic hint for the copilot / action center. */
export function windowHint(status: WindowStatus, hoursLeft: number | null): string {
  switch (status) {
    case 'open': return 'الرد دلوقتي مجاني داخل نافذة واتساب.';
    case 'expiring_soon': return `نافذة الرد المجانية هتقفل خلال ${Math.ceil(hoursLeft ?? 0)} ساعة — رُدّ دلوقتي.`;
    case 'closed': return 'النافذة المجانية أغلقت — هيحتاج template مدفوع لاحقًا.';
    default: return 'حالة النافذة غير معروفة بعد.';
  }
}
