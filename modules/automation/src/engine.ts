import crypto from 'node:crypto';
import type {
  AutomationDef, RunContext, Action, StepResult,
} from './types.js';
import { evaluateAll } from './conditions.js';
import { checkSafety, needsApproval, type RunHistory } from './guards/safety.js';
import { dispatch, type ActionPorts } from './dispatcher.js';

/**
 * The fnnlr Automation Engine.
 *
 * Two entry points:
 *   - onEvent():   an event arrives → find matching automations → start runs.
 *   - advanceRun(): the scheduler resumes a waiting/active run → next step.
 *
 * Durable: every run + step is persisted (via the injected Store), so waits
 * survive restarts and nothing fires twice (idempotency keys).
 */

// Persistence port — backed by the tenant's OWN database (DB-per-tenant).
export interface RunStore {
  getEnabledAutomationsFor(triggerEvent: string): Promise<AutomationDef[]>;
  getRunHistory(automationId: string, entityType: string, entityId: string): Promise<RunHistory>;
  createRun(input: {
    automationId: string; entityType: string; entityId: string;
    dedupeKey: string; context: RunContext;
  }): Promise<{ id: string } | null>;  // null if dedupe collision (already exists)
  loadRun(runId: string): Promise<{
    id: string; automationId: string; currentStep: number;
    status: string; context: RunContext;
  } | null>;
  saveRunProgress(runId: string, update: {
    currentStep: number; status: string; nextRunAt: Date | null;
  }): Promise<void>;
  logStep(input: {
    runId: string; stepIndex: number; actionType: string;
    status: string; detail?: unknown; idempotencyKey?: string;
  }): Promise<void>;
  createApproval(runId: string, stepIndex: number, action: Action): Promise<void>;
  getAutomation(automationId: string): Promise<AutomationDef | null>;
}

export interface EngineDeps { store: RunStore; ports: ActionPorts; now?: () => Date; }

function dedupeKey(automationId: string, entityId: string, event: RunContext['event']): string {
  return crypto.createHash('sha256')
    .update(`${automationId}:${entityId}:${event.type}:${event.occurredAt}`)
    .digest('hex');
}

export class AutomationEngine {
  constructor(private deps: EngineDeps) {}
  private now() { return this.deps.now ? this.deps.now() : new Date(); }

  /** An event arrived on the tenant's spine. Start any matching runs. */
  async onEvent(ctx: RunContext): Promise<{ started: string[]; skipped: number }> {
    const automations = await this.deps.store.getEnabledAutomationsFor(ctx.event.type);
    const started: string[] = [];
    let skipped = 0;

    for (const def of automations) {
      // Business scoping: if the automation is brand-specific, it must match.
      if (def.businessId && ctx.business && def.businessId !== ctx.business.id) { skipped++; continue; }

      // Conditions must pass.
      if (!evaluateAll(def.conditions, ctx)) { skipped++; continue; }

      // Safety: anti-spam, cooldown.
      const history = await this.deps.store.getRunHistory(def.id, ctx.entity.type, ctx.entity.id);
      const safety = checkSafety(def, history, this.now());
      if (!safety.allowed) { skipped++; continue; }

      // Create the run (idempotent on dedupeKey — same trigger won't double-fire).
      const key = dedupeKey(def.id, ctx.entity.id, ctx.event);
      const run = await this.deps.store.createRun({
        automationId: def.id, entityType: ctx.entity.type, entityId: ctx.entity.id,
        dedupeKey: key, context: ctx,
      });
      if (!run) { skipped++; continue; }  // dedupe collision

      // If the whole automation needs approval, park it before any action.
      if (needsApproval(def) && def.actions.length > 0) {
        await this.deps.store.createApproval(run.id, 0, def.actions[0]);
        await this.deps.store.saveRunProgress(run.id, { currentStep: 0, status: 'awaiting_approval', nextRunAt: null });
        started.push(run.id);
        continue;
      }

      await this.advanceRun(run.id);
      started.push(run.id);
    }
    return { started, skipped };
  }

  /** Resume a run and execute steps until it waits, needs approval, or finishes. */
  async advanceRun(runId: string): Promise<void> {
    const run = await this.deps.store.loadRun(runId);
    if (!run) return;
    if (run.status === 'done' || run.status === 'cancelled' || run.status === 'failed') return;

    const def = await this.deps.store.getAutomation(run.automationId);
    if (!def) return;

    let stepIndex = run.currentStep;
    const ctx = run.context;

    while (stepIndex < def.actions.length) {
      const action = def.actions[stepIndex];
      let result: StepResult;
      try {
        result = await dispatch(action, stepIndex, runId, ctx, this.deps.ports);
      } catch (err) {
        await this.deps.store.logStep({
          runId, stepIndex, actionType: action.type, status: 'failed',
          detail: { error: (err as Error).message },
        });
        await this.deps.store.saveRunProgress(runId, { currentStep: stepIndex, status: 'failed', nextRunAt: null });
        return;
      }

      await this.deps.store.logStep({
        runId, stepIndex, actionType: action.type, status: result.status, detail: result.detail,
      });

      // Pause conditions: wait (durable) or approval gate.
      if (result.status === 'waiting') {
        await this.deps.store.saveRunProgress(runId, {
          currentStep: stepIndex + 1, status: 'waiting', nextRunAt: result.resumeAt ?? null,
        });
        return;
      }
      if (result.status === 'awaiting_approval') {
        await this.deps.store.createApproval(runId, stepIndex, action);
        await this.deps.store.saveRunProgress(runId, { currentStep: stepIndex, status: 'awaiting_approval', nextRunAt: null });
        return;
      }
      if (action.type === 'stop') {
        await this.deps.store.saveRunProgress(runId, { currentStep: stepIndex + 1, status: 'done', nextRunAt: null });
        return;
      }

      stepIndex++;
    }

    await this.deps.store.saveRunProgress(runId, { currentStep: stepIndex, status: 'done', nextRunAt: null });
  }

  /** Called when a human approves a parked step. Resumes from the parked step. */
  async onApproved(runId: string): Promise<void> {
    const run = await this.deps.store.loadRun(runId);
    if (!run) return;
    // Resume AT the parked step. For a whole-automation pre-gate, currentStep is
    // the first un-run action. For a mid-run `request_approval` action, we move
    // one past the gate so we don't re-park on the same approval step.
    const def = await this.deps.store.getAutomation(run.automationId);
    const parkedAction = def?.actions[run.currentStep];
    const resumeAt = parkedAction?.type === 'request_approval' ? run.currentStep + 1 : run.currentStep;
    await this.deps.store.saveRunProgress(runId, {
      currentStep: resumeAt, status: 'active', nextRunAt: null,
    });
    await this.advanceRun(runId);
  }
}
