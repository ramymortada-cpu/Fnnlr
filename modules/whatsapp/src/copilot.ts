import type { StepType } from '../../../packages/ai-core/src/brains/whatsapp-sales.js';

/**
 * Copilot draft selection — pure. Given the lead's situation, pick which
 * WhatsApp template step best fits. Human-in-the-loop: this only *suggests*.
 */

export interface DraftContext {
  stage?: string;
  paymentState?: string;
  objectionKey?: string | null;
}

/** Choose the best step type for the current lead context. */
export function selectStepType(ctx: DraftContext): StepType {
  if (ctx.objectionKey) return 'objection';
  // payment state takes priority when present and meaningful
  switch (ctx.paymentState) {
    case 'payment_details_sent': return 'payment_details';
    case 'waiting_payment': return 'payment_reminder';
    case 'proof_uploaded': return 'proof_reminder';
    case 'confirmed': return 'confirmation';
    case 'access_delivered': return 'delivery';
  }
  switch (ctx.stage) {
    case 'whatsapp_clicked': return 'first_reply';
    case 'contacted': return 'qualification';
    case 'qualified': return 'price_reveal';
    case 'price_sent': return 'payment_details';
    case 'payment_details_sent': return 'payment_details';
    case 'waiting_payment': return 'payment_reminder';
    case 'proof_uploaded': return 'proof_reminder';
    case 'paid': return 'delivery';
    case 'access_delivered': return 'upsell';
    case 'lost': return 'recovery';
    case 'needs_followup': return 'no_response';
    default: return 'first_reply';
  }
}

/** If a lead in whatsapp_clicked gets a reply marked sent, it should advance to contacted. */
export function stageAfterReply(currentStage: string | undefined, stepType: StepType): string | null {
  if (currentStage === 'whatsapp_clicked' && (stepType === 'first_reply' || stepType === 'qualification')) {
    return 'contacted';
  }
  return null;
}
