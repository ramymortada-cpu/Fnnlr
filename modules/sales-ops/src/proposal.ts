import { scoreFit, type SalesLeadIntake, type FitResult } from './fit.js';

/**
 * Sales-ops — proposal readiness, handoff pack, and ownership map. PURE. Builds
 * on the fit score and the customer-zero execution manifest shape. Generates
 * drafts with EXPLICIT placeholders for missing inputs — never fabricated
 * values, never fake readiness.
 */

export interface ProposalInputs {
  offerTypeKnown: boolean;
  funnelCountKnown: boolean;
  supportLevelKnown: boolean;
  launchTimelineKnown: boolean;
  responsibilitiesAccepted: boolean;
  limitationsAcknowledged: boolean;
  successCriteriaAccepted: boolean;
}

export type ProposalStatus = 'READY_TO_PROPOSE' | 'NEEDS_DISCOVERY' | 'DISQUALIFY' | 'BLOCKED_BY_EXPECTATIONS';

export interface ProposalReadiness {
  status: ProposalStatus;
  fit: FitResult;
  missing: string[];
  blockers: string[];
  nextAction: string;
}

export function proposalReadiness(lead: SalesLeadIntake, inputs: Partial<ProposalInputs>): ProposalReadiness {
  const fit = scoreFit(lead);

  // expectation block first
  if (fit.expectationResets.length > 0 && fit.fitCategory === 'bad_fit' && (lead.expectedAutomationLevel === 'expects_auto_send' || lead.expectedPaymentProcessing || lead.expectsGuaranteedSales)) {
    return { status: 'BLOCKED_BY_EXPECTATIONS', fit, missing: [], blockers: fit.risks, nextAction: 'reset expectations (no auto-send, no payment processing, no guarantee), then re-check' };
  }
  if (fit.fitCategory === 'bad_fit') {
    return { status: 'DISQUALIFY', fit, missing: [], blockers: fit.risks, nextAction: 'disqualify or revisit when the basics exist' };
  }

  const missing: string[] = [];
  const need = (cond: boolean | undefined, label: string) => { if (!cond) missing.push(label); };
  need(inputs.offerTypeKnown, 'offer type');
  need(inputs.funnelCountKnown, 'number of funnels');
  need(inputs.supportLevelKnown, 'support level / package');
  need(inputs.launchTimelineKnown, 'launch timeline');
  need(inputs.responsibilitiesAccepted, 'customer responsibilities accepted');
  need(inputs.limitationsAcknowledged, 'product limitations acknowledged');
  need(inputs.successCriteriaAccepted, 'first-week success criteria accepted');

  if (missing.length) {
    return { status: 'NEEDS_DISCOVERY', fit, missing, blockers: [], nextAction: `collect/confirm: ${missing.join(', ')}` };
  }
  return { status: 'READY_TO_PROPOSE', fit, missing: [], blockers: [], nextAction: 'send the proposal (sales:proposal-draft), then collect config for handoff' };
}

// ---------------------------------------------------------------------------
// Ownership map — every launch must name the owner of each critical step.

export type OwnerRole = 'salesOwner' | 'setupOwner' | 'supportOwner' | 'customerResponseOwner' | 'paymentConfirmationOwner' | 'rollbackOwner';

export interface OwnershipMap {
  salesOwner?: string;
  setupOwner?: string;
  supportOwner?: string;
  customerResponseOwner?: string;
  paymentConfirmationOwner?: string;
  rollbackOwner?: string;
}

const CRITICAL_OWNERS: OwnerRole[] = ['setupOwner', 'supportOwner', 'customerResponseOwner', 'paymentConfirmationOwner', 'rollbackOwner'];

export function checkOwnership(map: OwnershipMap): { ok: boolean; missing: OwnerRole[] } {
  const missing = CRITICAL_OWNERS.filter((r) => !map[r]?.toString().trim());
  return { ok: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Handoff pack — from a qualified lead + chosen tier to a setup checklist and
// DRAFT configs with explicit placeholders for whatever is still missing.

export type Tier = 'starter_activation' | 'growth_ops' | 'managed_launch';
const PLACEHOLDER = '<<MISSING — collect from customer>>';

export interface HandoffInput {
  lead: SalesLeadIntake;
  tier: Tier;
  ownership: OwnershipMap;
  collected?: {
    whatsappNumber?: string;
    paymentInstructions?: string;
    offerPromise?: string;
    offerPrice?: string;
    trafficSource?: string;
    publicAppUrl?: string;
    launchWindow?: string;
  };
}

export interface HandoffPack {
  status: 'READY_FOR_SETUP' | 'BLOCKED';
  setupChecklist: { item: string; status: 'have' | 'missing' }[];
  customerZeroConfigDraft: Record<string, unknown>;
  executionManifestDraft: Record<string, unknown>;
  missingCustomerInputs: string[];
  ownershipMissing: OwnerRole[];
  launchWindowSuggestion: string;
  nextAction: string;
}

export function buildHandoffPack(input: HandoffInput): HandoffPack {
  const c = input.collected ?? {};
  const own = checkOwnership(input.ownership);

  const fields: { key: string; value: string | undefined; label: string }[] = [
    { key: 'whatsappNumber', value: c.whatsappNumber, label: 'WhatsApp number' },
    { key: 'paymentInstructions', value: c.paymentInstructions, label: 'payment instructions' },
    { key: 'offerPromise', value: c.offerPromise, label: 'offer promise' },
    { key: 'trafficSource', value: c.trafficSource, label: 'traffic source' },
    { key: 'launchWindow', value: c.launchWindow, label: 'launch window' },
  ];
  const missingCustomerInputs = fields.filter((f) => !f.value?.toString().trim()).map((f) => f.label);

  const setupChecklist = fields.map((f) => ({ item: f.label, status: (f.value?.toString().trim() ? 'have' : 'missing') as 'have' | 'missing' }));
  setupChecklist.push({ item: 'support owner', status: input.ownership.supportOwner ? 'have' : 'missing' });

  // DRAFT configs — placeholders for anything not yet collected. Never fabricate.
  const customerZeroConfigDraft = {
    workspaceName: input.lead.businessName || PLACEHOLDER,
    ownerEmail: PLACEHOLDER,
    business: { name: input.lead.businessName || PLACEHOLDER, market: input.lead.market ?? 'eg' },
    whatsappNumber: c.whatsappNumber ?? PLACEHOLDER,
    payment: { method: PLACEHOLDER, instructions: c.paymentInstructions ?? PLACEHOLDER },
    offer: { promise: c.offerPromise ?? PLACEHOLDER, price: c.offerPrice ?? PLACEHOLDER },
    createFunnel: true,
    _tier: input.tier,
  };
  const executionManifestDraft = {
    customerName: input.lead.leadName || PLACEHOLDER,
    workspaceName: input.lead.businessName || PLACEHOLDER,
    business: { name: input.lead.businessName || PLACEHOLDER, market: input.lead.market ?? 'eg' },
    whatsappNumber: c.whatsappNumber ?? PLACEHOLDER,
    whatsappProviderStatus: 'manual_link_only',
    payment: { method: PLACEHOLDER, instructions: c.paymentInstructions ?? PLACEHOLDER },
    trafficSource: c.trafficSource ?? PLACEHOLDER,
    publicAppUrl: c.publicAppUrl ?? PLACEHOLDER,
    launchWindow: c.launchWindow ?? PLACEHOLDER,
    supportOwner: input.ownership.supportOwner ?? PLACEHOLDER,
    rollbackOwner: input.ownership.rollbackOwner ?? PLACEHOLDER,
  };

  // launch must have owners for the critical steps; otherwise BLOCKED.
  const status: HandoffPack['status'] = own.ok ? 'READY_FOR_SETUP' : 'BLOCKED';
  const nextAction = own.ok
    ? (missingCustomerInputs.length ? `collect: ${missingCustomerInputs.join(', ')}, then run customer:create` : 'all inputs present — run customer:create then customer:execution-lock')
    : `assign owners for: ${own.missing.join(', ')} (launch is blocked without them)`;

  return {
    status,
    setupChecklist,
    customerZeroConfigDraft,
    executionManifestDraft,
    missingCustomerInputs,
    ownershipMissing: own.missing,
    launchWindowSuggestion: c.launchWindow ?? 'propose a window within the next 7 days (customer-confirmed)',
    nextAction,
  };
}
