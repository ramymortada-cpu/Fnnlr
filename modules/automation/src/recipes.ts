import type { AutomationDef } from './types.js';

/**
 * Ready-made, fnnlr-native automations. These encode revenue-recovery plays
 * specific to Arab WhatsApp commerce — the opinionated "plays" that make the
 * engine useful out of the box (vs a blank canvas the user must figure out).
 */

export const RECIPES: Record<string, Omit<AutomationDef, 'id' | 'businessId'>> = {
  // 1) Price sent, no reply within an hour → respectful nudge inside free window.
  price_no_reply_nudge: {
    name: 'Price sent, no reply — gentle nudge',
    enabled: true,
    triggerEvent: 'lead.price_sent',
    conditions: [{ field: 'lead.stage', op: 'eq', value: 'price_sent' }],
    actions: [
      { type: 'wait', seconds: 3600 },
      {
        type: 'send_whatsapp', template: 'price_followup_soft',
        paidFallback: 'wait_for_window', dialectAware: true,
      } as AutomationDef['actions'][number],
    ],
    requiresApproval: false,
    maxRunsPerEntity: 1,     // never nudge the same lead twice for this
    cooldownSeconds: null,
  },

  // 2) Payment stalled (transfer requested, no proof) → recovery + human task.
  payment_recovery: {
    name: 'Payment stalled — recover',
    enabled: true,
    triggerEvent: 'payment.stalled',
    conditions: [{ field: 'payment.state', op: 'eq', value: 'transfer_requested' }],
    actions: [
      { type: 'wait', seconds: 7200 },
      {
        type: 'send_whatsapp', template: 'payment_proof_reminder',
        paidFallback: 'wait_for_window',
      } as AutomationDef['actions'][number],
      { type: 'create_task', title: 'Call lead — payment stuck >2h' } as AutomationDef['actions'][number],
    ],
    requiresApproval: false,
    maxRunsPerEntity: 2,
    cooldownSeconds: 86400,  // at most once/day
  },

  // 3) High-value lead went quiet mid-sale → notify owner, don't auto-message.
  high_value_stall_escalate: {
    name: 'High-value lead stalled — escalate to owner',
    enabled: true,
    triggerEvent: 'conversation.stalled',
    conditions: [
      { all: [
        { field: 'lead.trust_level', op: 'eq', value: 'high' },
        { field: 'lead.risk_score', op: 'gte', value: 0.5 },
      ] },
    ],
    actions: [
      { type: 'notify_owner', message: 'High-value lead went quiet — needs your personal touch' } as AutomationDef['actions'][number],
      { type: 'create_task', title: 'Owner: re-engage high-value lead' } as AutomationDef['actions'][number],
    ],
    requiresApproval: false,
    maxRunsPerEntity: 1,
    cooldownSeconds: null,
  },

  // 4) Abandoned thread recovery — paid send allowed but REQUIRES approval.
  abandoned_thread_recovery: {
    name: 'Abandoned thread — recover (approval required)',
    enabled: true,
    triggerEvent: 'conversation.stalled',
    conditions: [{ field: 'lead.stage', op: 'in', value: ['contacted', 'qualified'] }],
    actions: [
      {
        type: 'send_whatsapp', template: 'abandoned_recovery',
        paidFallback: 'allow',   // → auto-requires approval (safety guard)
      } as AutomationDef['actions'][number],
    ],
    requiresApproval: true,
    maxRunsPerEntity: 1,
    cooldownSeconds: null,
  },
};
