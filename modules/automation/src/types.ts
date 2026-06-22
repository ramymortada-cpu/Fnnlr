/**
 * fnnlr Automation Engine — core types.
 *
 * Model: WHEN <trigger> IF <conditions> THEN <actions> — with guardrails,
 * WhatsApp-window awareness, idempotency, and durable waits.
 */

// ---- Triggers --------------------------------------------------------------
// An automation starts when an event of `triggerEvent` is emitted on the spine.
export type TriggerEvent =
  | 'lead.captured'
  | 'lead.stage_changed'
  | 'lead.price_sent'
  | 'message.received'
  | 'message.no_reply'        // synthesized when a thread goes quiet
  | 'page.cta_click'
  | 'payment.state_changed'
  | 'payment.stalled'         // requested transfer, no proof after N
  | 'payment.recovered'
  | 'conversation.stalled';   // mid-sale thread went silent

// ---- Conditions (a small, safe rule tree — no arbitrary code) --------------
export type Comparator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'exists' | 'contains';

export interface Leaf {
  field: string;          // dot-path into the run context, e.g. 'lead.stage'
  op: Comparator;
  value?: unknown;
}
export interface AndNode { all: ConditionNode[]; }
export interface OrNode { any: ConditionNode[]; }
export interface NotNode { not: ConditionNode; }
export type ConditionNode = Leaf | AndNode | OrNode | NotNode;

// ---- Actions ---------------------------------------------------------------
export type ActionType =
  | 'send_whatsapp'      // window-aware; may require approval / paid template
  | 'send_email'
  | 'wait'               // durable delay (seconds) — survives restarts
  | 'wait_until_business_hours'
  | 'create_task'        // hand to a human seller
  | 'update_lead'        // set stage/intent/etc.
  | 'add_tag'
  | 'notify_owner'       // owner brief / digest entry
  | 'request_approval'   // explicit human gate
  | 'emit_event'         // chain into another automation
  | 'stop';              // end the run

export interface BaseAction { type: ActionType; }

export interface SendWhatsAppAction extends BaseAction {
  type: 'send_whatsapp';
  template: string;            // message template id/key (from prompts/templates)
  // If outside the free window, is a PAID template send allowed, or wait?
  paidFallback: 'allow' | 'wait_for_window' | 'skip';
  dialectAware?: boolean;
}
export interface WaitAction extends BaseAction { type: 'wait'; seconds: number; }
export interface SendEmailAction extends BaseAction { type: 'send_email'; template: string; }
export interface CreateTaskAction extends BaseAction { type: 'create_task'; title: string; assignTo?: string; }
export interface UpdateLeadAction extends BaseAction { type: 'update_lead'; set: Record<string, unknown>; }
export interface NotifyOwnerAction extends BaseAction { type: 'notify_owner'; message: string; }
export interface EmitEventAction extends BaseAction { type: 'emit_event'; event: string; payload?: unknown; }
export interface GenericAction extends BaseAction { [k: string]: unknown; }

export type Action =
  | SendWhatsAppAction | SendEmailAction | WaitAction | CreateTaskAction
  | UpdateLeadAction | NotifyOwnerAction | EmitEventAction | GenericAction;

// ---- Automation definition -------------------------------------------------
export interface AutomationDef {
  id: string;
  businessId: string | null;
  name: string;
  enabled: boolean;
  triggerEvent: TriggerEvent;
  conditions: ConditionNode[];
  actions: Action[];
  requiresApproval: boolean;
  maxRunsPerEntity: number | null;
  cooldownSeconds: number | null;
}

// ---- Runtime context -------------------------------------------------------
// Everything an automation can "see" — assembled per run from the tenant DB.
export interface RunContext {
  event: { type: string; payload: Record<string, unknown>; occurredAt: string };
  entity: { type: 'lead' | 'conversation' | 'payment'; id: string };
  lead?: Record<string, unknown>;
  conversation?: Record<string, unknown>;
  payment?: Record<string, unknown>;
  business?: Record<string, unknown>;
  // WhatsApp window state at evaluation time.
  whatsapp?: { windowState: 'free_service' | 'free_ctwa' | 'paid_only'; windowExpiresAt?: string };
  now: string;
}

export type StepStatus = 'ok' | 'skipped' | 'blocked' | 'failed' | 'sent_free' | 'sent_paid' | 'waiting' | 'awaiting_approval';

export interface StepResult {
  status: StepStatus;
  detail?: Record<string, unknown>;
  // For waits: when the run should resume.
  resumeAt?: Date;
}
