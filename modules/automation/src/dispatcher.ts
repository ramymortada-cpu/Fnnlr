import crypto from 'node:crypto';
import type {
  Action, RunContext, StepResult, SendWhatsAppAction, WaitAction, SendEmailAction,
  CreateTaskAction, UpdateLeadAction, NotifyOwnerAction, EmitEventAction,
} from './types.js';
import { decideWhatsAppSend, applyWhatsAppDecision } from './guards/whatsapp.js';

/**
 * Action dispatcher. Side-effecting actions (sends) go through injected ports
 * so the engine stays testable and the same logic works in prod and tests.
 */
export interface ActionPorts {
  sendWhatsApp(template: string, ctx: RunContext, paid: boolean, idemKey: string): Promise<void>;
  sendEmail(template: string, ctx: RunContext, idemKey: string): Promise<void>;
  createTask(title: string, ctx: RunContext, assignTo?: string): Promise<void>;
  updateLead(set: Record<string, unknown>, ctx: RunContext): Promise<void>;
  notifyOwner(message: string, ctx: RunContext): Promise<void>;
  emitEvent(event: string, payload: unknown, ctx: RunContext): Promise<void>;
}

export function idempotencyKey(runId: string, stepIndex: number, actionType: string): string {
  return crypto.createHash('sha256').update(`${runId}:${stepIndex}:${actionType}`).digest('hex');
}

export async function dispatch(
  action: Action,
  stepIndex: number,
  runId: string,
  ctx: RunContext,
  ports: ActionPorts,
): Promise<StepResult> {
  const idemKey = idempotencyKey(runId, stepIndex, action.type);

  switch (action.type) {
    case 'wait': {
      const seconds = (action as WaitAction).seconds;
      const resumeAt = new Date(new Date(ctx.now).getTime() + seconds * 1000);
      return { status: 'waiting', detail: { seconds }, resumeAt };
    }

    case 'wait_until_business_hours': {
      const resumeAt = nextBusinessHour(new Date(ctx.now));
      return { status: 'waiting', detail: { until: resumeAt.toISOString() }, resumeAt };
    }

    case 'send_whatsapp': {
      const wa = action as SendWhatsAppAction;
      const decision = decideWhatsAppSend(wa, ctx);
      const result = applyWhatsAppDecision(decision);
      if (result.status === 'sent_free' || result.status === 'sent_paid') {
        await ports.sendWhatsApp(wa.template, ctx, result.status === 'sent_paid', idemKey);
      }
      return result;
    }

    case 'send_email': {
      const a = action as SendEmailAction;
      await ports.sendEmail(a.template, ctx, idemKey);
      return { status: 'ok', detail: { channel: 'email' } };
    }

    case 'create_task': {
      const a = action as CreateTaskAction;
      await ports.createTask(a.title, ctx, a.assignTo);
      return { status: 'ok', detail: { kind: 'task' } };
    }

    case 'update_lead': {
      const a = action as UpdateLeadAction;
      await ports.updateLead(a.set, ctx);
      return { status: 'ok' };
    }

    case 'notify_owner': {
      const a = action as NotifyOwnerAction;
      await ports.notifyOwner(a.message, ctx);
      return { status: 'ok' };
    }

    case 'emit_event': {
      const a = action as EmitEventAction;
      await ports.emitEvent(a.event, a.payload, ctx);
      return { status: 'ok' };
    }

    case 'request_approval':
      return { status: 'awaiting_approval' };

    case 'stop':
      return { status: 'ok', detail: { stopped: true } };

    default:
      return { status: 'skipped', detail: { reason: `unknown action ${String((action as { type?: string }).type)}` } };
  }
}

function nextBusinessHour(from: Date): Date {
  const d = new Date(from);
  // Simplistic: if before 9:00, set to 9:00; if after 20:00, next day 9:00.
  const h = d.getHours();
  if (h < 9) d.setHours(9, 0, 0, 0);
  else if (h >= 20) { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
  return d;
}
