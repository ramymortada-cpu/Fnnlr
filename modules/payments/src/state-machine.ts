/**
 * Payment state machine — the local-payment journey, pure & testable.
 * Models valid transitions so the UI/leak board can reason about where a lead
 * is and what should happen next. No real gateway; this is funnel data.
 */

export const PAYMENT_STATES = [
  'not_started', 'payment_details_sent', 'waiting_payment', 'proof_uploaded',
  'needs_review', 'confirmed', 'access_delivered', 'stuck', 'failed', 'cancelled', 'refunded',
] as const;
export type PaymentState = typeof PAYMENT_STATES[number];

export const PAYMENT_STATE_AR: Record<PaymentState, string> = {
  not_started: 'لم يبدأ',
  payment_details_sent: 'اتبعت التفاصيل',
  waiting_payment: 'بانتظار الدفع',
  proof_uploaded: 'رفع إثبات',
  needs_review: 'محتاج مراجعة',
  confirmed: 'مؤكَّد',
  access_delivered: 'تم التسليم',
  stuck: 'متوقف',
  failed: 'فشل',
  cancelled: 'ملغي',
  refunded: 'مسترجَع',
};

/** The "happy path" order; used to recommend the next step. */
const HAPPY_PATH: PaymentState[] = [
  'not_started', 'payment_details_sent', 'waiting_payment', 'proof_uploaded',
  'needs_review', 'confirmed', 'access_delivered',
];

/** Valid transitions. Terminal/exception states reachable from most states. */
const TRANSITIONS: Record<PaymentState, PaymentState[]> = {
  not_started: ['payment_details_sent', 'cancelled'],
  payment_details_sent: ['waiting_payment', 'stuck', 'cancelled'],
  waiting_payment: ['proof_uploaded', 'stuck', 'failed', 'cancelled'],
  proof_uploaded: ['needs_review', 'confirmed', 'failed'],
  needs_review: ['confirmed', 'failed', 'stuck'],
  confirmed: ['access_delivered', 'refunded'],
  access_delivered: ['refunded'],
  stuck: ['waiting_payment', 'proof_uploaded', 'failed', 'cancelled'],
  failed: ['waiting_payment', 'cancelled'],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: PaymentState, to: PaymentState): boolean {
  if (from === to) return true; // idempotent set
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** The event name emitted for entering a state. */
export function eventForState(to: PaymentState): string {
  switch (to) {
    case 'payment_details_sent': return 'payment_details_sent';
    case 'waiting_payment': return 'payment_waiting';
    case 'proof_uploaded': return 'proof_uploaded';
    case 'needs_review': return 'payment_needs_review';
    case 'confirmed': return 'payment_confirmed';
    case 'access_delivered': return 'access_delivered';
    case 'stuck': return 'payment_stuck';
    case 'failed': return 'payment_failed';
    default: return 'payment_state_changed';
  }
}

/** Recommended next action label for a state. */
export function nextActionFor(state: PaymentState): string {
  switch (state) {
    case 'not_started': return 'ابعت تفاصيل الدفع';
    case 'payment_details_sent': return 'علّم بانتظار الدفع وتابع';
    case 'waiting_payment': return 'تابع العميل واطلب الإثبات';
    case 'proof_uploaded': return 'راجِع الإثبات';
    case 'needs_review': return 'أكّد الدفع بعد المراجعة';
    case 'confirmed': return 'سلّم الوصول للعميل';
    case 'access_delivered': return 'تم — متابعة لاحقة اختيارية';
    case 'stuck': return 'تواصل وحلّ مشكلة الدفع';
    case 'failed': return 'حاول استرجاع العميل أو علّمه خسران';
    default: return '';
  }
}
