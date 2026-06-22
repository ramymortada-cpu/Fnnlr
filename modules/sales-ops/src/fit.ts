/**
 * Sales-ops — fit scoring. PURE, rule-based. Maps a sales lead intake to a fit
 * category, with reasons, risks, and the expectation resets a rep must perform.
 * It encodes the product's real limits (no auto-send, no payment processing, no
 * guaranteed revenue) as disqualifiers — so a lead that wants what fnnlr does not
 * do is never scored as a good fit.
 */

export type YesNoUnknown = 'yes' | 'no' | 'unknown';
export type Clarity = 'low' | 'medium' | 'high';

export interface SalesLeadIntake {
  leadName: string;
  businessName: string;
  market?: string;
  country?: string;
  whatsappSelling: YesNoUnknown;
  trafficSource: YesNoUnknown;       // exists or planned
  manualPayment: YesNoUnknown;
  offerClarity: Clarity;
  responseOwnerExists: boolean;
  expectedAutomationLevel?: 'manual_send' | 'expects_auto_send' | 'unknown';
  expectedPaymentProcessing?: boolean;   // true = expects fnnlr to process payments
  expectsGuaranteedSales?: boolean;
  urgency?: 'low' | 'medium' | 'high';
  fitNotes?: string;
}

export type FitCategory = 'strong_fit' | 'workable_fit' | 'needs_configuration' | 'bad_fit';

export interface FitResult {
  fitScore: number;            // 0–100, advisory only
  fitCategory: FitCategory;
  reasons: string[];
  risks: string[];
  expectationResets: string[];
  nextAction: string;
}

export function scoreFit(lead: SalesLeadIntake): FitResult {
  const reasons: string[] = [];
  const risks: string[] = [];
  const expectationResets: string[] = [];

  // ---- hard disqualifiers: the lead wants what fnnlr does NOT do ----
  const wantsAutoSend = lead.expectedAutomationLevel === 'expects_auto_send';
  const wantsPaymentProcessing = lead.expectedPaymentProcessing === true;
  const wantsGuarantee = lead.expectsGuaranteedSales === true;
  const noTrafficAndNoResponder = lead.trafficSource === 'no' && !lead.responseOwnerExists;

  if (wantsAutoSend) { risks.push('expects automatic WhatsApp sending — fnnlr does not auto-send'); expectationResets.push('fnnlr drafts messages; a human sends them'); }
  if (wantsPaymentProcessing) { risks.push('expects payment processing — fnnlr records manual payment state only'); expectationResets.push('fnnlr does not move money; you collect and confirm payment'); }
  if (wantsGuarantee) { risks.push('expects guaranteed sales/revenue — there are no guarantees'); expectationResets.push('fnnlr shows evidence-based next steps; it does not guarantee outcomes'); }
  if (lead.trafficSource === 'no' && !lead.responseOwnerExists) risks.push('no traffic source and no one to respond to leads');

  // a lead that wants forbidden behavior is bad_fit UNTIL expectations are reset.
  const expectationBlock = wantsAutoSend || wantsPaymentProcessing || wantsGuarantee;
  if (expectationBlock || noTrafficAndNoResponder) {
    return {
      fitScore: 10,
      fitCategory: 'bad_fit',
      reasons: ['lead expects behavior fnnlr does not provide, or lacks the basics to be measurable'],
      risks,
      expectationResets,
      nextAction: expectationBlock ? 'reset expectations before proceeding; re-score after the reset' : 'no traffic + no responder — not a fit until both exist',
    };
  }

  // ---- positive signals ----
  let score = 0;
  const add = (cond: boolean, pts: number, why: string, missWhy?: string) => {
    if (cond) { score += pts; reasons.push(why); } else if (missWhy) { risks.push(missWhy); }
  };
  add(lead.whatsappSelling === 'yes', 25, 'sells over WhatsApp', lead.whatsappSelling === 'unknown' ? 'WhatsApp sales motion unconfirmed' : 'no WhatsApp sales motion');
  add(lead.trafficSource === 'yes', 20, 'has a traffic source', 'traffic source not confirmed');
  add(lead.manualPayment === 'yes', 15, 'uses manual/local payment', lead.manualPayment === 'no' ? 'payment is not manual/local' : 'payment method unconfirmed');
  add(lead.offerClarity === 'high', 20, 'clear offer', lead.offerClarity === 'low' ? 'offer is unclear' : undefined);
  if (lead.offerClarity === 'medium') { score += 10; reasons.push('offer is moderately clear'); }
  add(lead.responseOwnerExists, 20, 'has someone to respond to leads', 'no response owner');

  // ---- categorize ----
  const strong =
    lead.whatsappSelling === 'yes' &&
    (lead.trafficSource === 'yes' || lead.trafficSource === 'unknown') &&
    lead.offerClarity !== 'low' &&
    lead.manualPayment === 'yes' &&
    lead.responseOwnerExists &&
    !expectationBlock;

  let fitCategory: FitCategory;
  let nextAction: string;
  if (strong && score >= 80) {
    fitCategory = 'strong_fit';
    nextAction = 'proceed to proposal readiness (sales:proposal-check)';
  } else if (score >= 55) {
    fitCategory = 'workable_fit';
    nextAction = 'workable — confirm the open items, then proposal readiness';
  } else if (score >= 30) {
    fitCategory = 'needs_configuration';
    nextAction = 'needs discovery/setup on the missing basics before a proposal';
  } else {
    fitCategory = 'bad_fit';
    nextAction = 'not enough fit signals — disqualify or revisit later';
  }

  return { fitScore: Math.min(100, score), fitCategory, reasons, risks, expectationResets, nextAction };
}
