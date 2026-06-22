/**
 * Funnel CRM pipeline — stage definitions and pure filter logic.
 * Kept separate from DB calls so the pipeline rules are unit-testable.
 * This is funnel-specific (not a generic CRM): every stage maps to a step in
 * the revenue journey Ad → WhatsApp → Price → Payment → Delivery.
 */

export const PIPELINE_STAGES = [
  'new', 'whatsapp_clicked', 'contacted', 'qualified', 'price_sent',
  'payment_details_sent', 'waiting_payment', 'proof_uploaded', 'paid',
  'access_delivered', 'lost', 'needs_followup',
] as const;
export type PipelineStage = typeof PIPELINE_STAGES[number];

export const STAGE_LABEL_AR: Record<PipelineStage, string> = {
  new: 'جديد',
  whatsapp_clicked: 'ضغط واتساب',
  contacted: 'تم التواصل',
  qualified: 'مؤهَّل',
  price_sent: 'اتبعت السعر',
  payment_details_sent: 'اتبعت تفاصيل الدفع',
  waiting_payment: 'بانتظار الدفع',
  proof_uploaded: 'رفع إثبات',
  paid: 'دفع',
  access_delivered: 'تم التسليم',
  lost: 'خسران',
  needs_followup: 'محتاج متابعة',
};

export const PAYMENT_STATES = [
  'not_started', 'payment_details_sent', 'waiting_payment', 'proof_uploaded',
  'needs_review', 'confirmed', 'access_delivered', 'stuck', 'failed', 'cancelled',
] as const;
export type PaymentState = typeof PAYMENT_STATES[number];

export type LeadFilter =
  | 'all' | 'needs_followup' | 'waiting_payment' | 'clicked_not_contacted'
  | 'high_intent' | 'payment_stuck' | 'paid' | 'lost';

export interface LeadRow {
  stage?: string;
  payment_status?: string | null;
  risk_score?: number | null;
  followup_due_at?: string | null;
  intent?: string | null;
}

/** Does a lead match a pipeline filter? Pure — used by tests and (optionally) the service. */
export function leadMatchesFilter(lead: LeadRow, filter: LeadFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'needs_followup': return lead.stage === 'needs_followup' || !!lead.followup_due_at;
    case 'waiting_payment': return lead.stage === 'waiting_payment' || lead.payment_status === 'waiting_payment';
    case 'clicked_not_contacted': return lead.stage === 'whatsapp_clicked';
    case 'high_intent': return (lead.risk_score ?? 0) >= 0.7 || lead.intent === 'high';
    case 'payment_stuck': return lead.payment_status === 'stuck';
    case 'paid': return lead.stage === 'paid' || lead.stage === 'access_delivered';
    case 'lost': return lead.stage === 'lost';
    default: return true;
  }
}

/** Map a SQL WHERE fragment for a filter (server-side filtering). */
export function filterWhereClause(filter: LeadFilter): { sql: string; params: unknown[] } {
  switch (filter) {
    case 'needs_followup': return { sql: `AND (stage='needs_followup' OR followup_due_at IS NOT NULL)`, params: [] };
    case 'waiting_payment': return { sql: `AND (stage='waiting_payment' OR payment_status='waiting_payment')`, params: [] };
    case 'clicked_not_contacted': return { sql: `AND stage='whatsapp_clicked'`, params: [] };
    case 'high_intent': return { sql: `AND (risk_score >= 0.7 OR intent='high')`, params: [] };
    case 'payment_stuck': return { sql: `AND payment_status='stuck'`, params: [] };
    case 'paid': return { sql: `AND stage IN ('paid','access_delivered')`, params: [] };
    case 'lost': return { sql: `AND stage='lost'`, params: [] };
    case 'all':
    default: return { sql: '', params: [] };
  }
}
