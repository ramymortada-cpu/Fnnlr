/**
 * Typed contracts for the funnel-builder product layer.
 * These are the structured records the AI brains produce and the UI edits —
 * the funnel blueprint is a system of record, not a PDF.
 */

export type Market = 'eg' | 'sa' | 'ae' | 'gulf' | 'general';
export type ProductType =
  | 'course' | 'coaching' | 'consultation' | 'service'
  | 'digital_product' | 'training' | 'booking' | 'high_ticket';
export type SalesChannel = 'whatsapp' | 'checkout' | 'call' | 'form' | 'manual_transfer';
export type Tone =
  | 'egyptian_friendly' | 'egyptian_premium' | 'gulf_professional'
  | 'saudi_formal' | 'msa' | 'premium' | 'friendly' | 'direct_response';
export type PaymentMethod =
  | 'paymob' | 'fawry' | 'instapay' | 'vodafone_cash' | 'bank_transfer'
  | 'tap' | 'hyperpay' | 'moyasar' | 'stripe' | 'manual_proof' | 'payment_link';

export type FunnelType =
  | 'click_to_whatsapp' | 'lead_magnet' | 'vsl' | 'course_sales'
  | 'high_ticket_consult' | 'coaching_program' | 'digital_product'
  | 'paid_booking' | 'manual_transfer' | 'hybrid';

// ---- Onboarding input ------------------------------------------------------
export interface OnboardingInput {
  businessName: string;
  market: Market;
  sells: string;
  productType: ProductType;
  priceRange: string;
  targetCustomer: string;
  trafficSource: string;
  salesChannel: SalesChannel;
  paymentMethods: PaymentMethod[];
  tone: Tone;
  salesTeamSize?: number;
  hasPage?: boolean;
  hasWhatsApp?: boolean;
  goal: string;
  /** Optional learning-derived playbook context (Sprint 20); honest, may be absent. */
  playbookContext?: string | null;
}

// ---- Funnel Architect output ----------------------------------------------
export interface FunnelStageSpec {
  name: string;
  purpose: string;
  channel: string;
  conversionEvent: string;
  assetsNeeded: string[];
  expectedLeak: string;
  trackingRequirement: string;
}

export interface FunnelBlueprint {
  funnelType: FunnelType;
  objective: string;
  icpSummary: string;
  awarenessLevel: string;
  mainPromise: string;
  stages: FunnelStageSpec[];
  whatsappRole: string;
  paymentRole: string;
  followupLogic: string;
  trackingRequirements: string[];
  expectedLeaks: string[];
  launchChecklist: string[];
  /** Sprint 20: short Arabic note on how learning shaped this funnel (optional). */
  playbookNotes?: string;
}

// ---- Offer output ----------------------------------------------------------
export interface Offer {
  name: string;
  promise: string;
  idealCustomer: string;
  mainPain: string;
  desiredResult: string;
  transformation: string;
  deliverables: string[];
  bonuses: string[];
  guarantee: string;
  pricing: string;
  paymentPlan: string;
  urgency: string;
  objections: { objection: string; reply: string }[];
  cta: string;
  toneNotes: string;
}
