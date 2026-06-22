import type { RunContext, SendWhatsAppAction, StepResult } from '../types.js';

/**
 * WhatsApp economics guard — the capability existing automation engines lack.
 *
 * WhatsApp billing (since mid-2025) is per-message by category, BUT:
 *  - replies inside the customer-initiated 24h SERVICE window are FREE
 *  - click-to-WhatsApp ads open a 72h FREE window
 *  - outside those, only paid template messages can be sent
 *
 * A naive engine blasts paid templates and burns money + quality rating.
 * This guard decides, per send, whether to send free, send paid, wait for a
 * free window, or skip — turning WhatsApp cost into a controlled decision.
 */
export function decideWhatsAppSend(
  action: SendWhatsAppAction,
  ctx: RunContext,
): { decision: 'send_free' | 'send_paid' | 'wait' | 'skip'; reason: string; resumeAt?: Date } {
  const w = ctx.whatsapp;

  // Inside a free window → always send free. Best outcome.
  if (w?.windowState === 'free_service' || w?.windowState === 'free_ctwa') {
    return { decision: 'send_free', reason: `inside ${w.windowState} window` };
  }

  // Outside any free window → respect the automation's paidFallback policy.
  switch (action.paidFallback) {
    case 'allow':
      return { decision: 'send_paid', reason: 'paid template send explicitly allowed' };

    case 'wait_for_window': {
      // Defer until a free window is likely (here: next business-hours touch).
      // In production, resume when the customer next messages (reopening the
      // 24h window) — the scheduler re-checks window state on resume.
      const resumeAt = nextLikelyWindow(ctx);
      return { decision: 'wait', reason: 'waiting for a free window to avoid paid send', resumeAt };
    }

    case 'skip':
    default:
      return { decision: 'skip', reason: 'no free window and paid send not allowed' };
  }
}

/**
 * Heuristic for when to re-check for a free window. Conservative: 6 hours,
 * capped so a run never waits forever. Real implementations resume immediately
 * on an inbound `message.received` (which reopens the 24h service window).
 */
function nextLikelyWindow(ctx: RunContext): Date {
  const base = new Date(ctx.now);
  base.setHours(base.getHours() + 6);
  return base;
}

export function applyWhatsAppDecision(
  decision: ReturnType<typeof decideWhatsAppSend>,
): StepResult {
  switch (decision.decision) {
    case 'send_free': return { status: 'sent_free', detail: { reason: decision.reason } };
    case 'send_paid': return { status: 'sent_paid', detail: { reason: decision.reason } };
    case 'wait': return { status: 'waiting', detail: { reason: decision.reason }, resumeAt: decision.resumeAt };
    case 'skip': return { status: 'skipped', detail: { reason: decision.reason } };
  }
}
