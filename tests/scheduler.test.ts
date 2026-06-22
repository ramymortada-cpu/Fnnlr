import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutomationEngine, type RunStore } from '../modules/automation/src/engine.js';
import type { ActionPorts } from '../modules/automation/src/dispatcher.js';
import type { AutomationDef, RunContext, Action } from '../modules/automation/src/types.js';

/**
 * Scheduler-behavior proof (in-memory): a run parked on a `wait` resumes and
 * completes its remaining steps when advanced after the wait elapses. This is
 * the logic the AutomationScheduler triggers via dueRuns() in production.
 */

function makeStore(def: AutomationDef) {
  const runs = new Map<string, any>();
  const sends: string[] = [];
  let seq = 0;
  const store: RunStore = {
    async getEnabledAutomationsFor(t) { return def.triggerEvent === t ? [def] : []; },
    async getAutomation() { return def; },
    async getRunHistory() { return { runsForEntity: 0, lastRunAt: null }; },
    async createRun({ context }) {
      const id = `run-${++seq}`;
      runs.set(id, { id, automationId: def.id, currentStep: 0, status: 'active', context, next_run_at: null });
      return { id };
    },
    async loadRun(id) { return runs.get(id) ?? null; },
    async saveRunProgress(id, u) { Object.assign(runs.get(id), u, { next_run_at: u.nextRunAt }); },
    async logStep() {},
    async createApproval() {},
  };
  const ports: ActionPorts = {
    async sendWhatsApp() { sends.push('wa'); },
    async sendEmail() { sends.push('email'); },
    async createTask() { sends.push('task'); },
    async updateLead() {}, async notifyOwner() {}, async emitEvent() {},
  };
  return { store, ports, runs, sends };
}

const ctx: RunContext = {
  event: { type: 'lead.price_sent', payload: {}, occurredAt: 't' },
  entity: { type: 'lead', id: 'lead-1' },
  lead: { id: 'lead-1', stage: 'price_sent' },
  whatsapp: { windowState: 'free_service' },
  now: '2026-01-01T10:00:00Z',
};

test('a run parked on wait resumes and finishes when advanced (scheduler behavior)', async () => {
  const def: AutomationDef = {
    id: 'a1', businessId: null, name: 'wait-then-send', enabled: true,
    triggerEvent: 'lead.price_sent', conditions: [],
    actions: [
      { type: 'wait', seconds: 3600 } as Action,
      { type: 'send_whatsapp', template: 'nudge', paidFallback: 'skip' } as Action,
    ],
    requiresApproval: false, maxRunsPerEntity: null, cooldownSeconds: null,
  };
  const { store, ports, runs, sends } = makeStore(def);
  const engine = new AutomationEngine({ store, ports });

  // Event arrives → run parks on the wait, sets next_run_at.
  const { started } = await engine.onEvent(ctx);
  const run = runs.get(started[0]);
  assert.equal(run.status, 'waiting');
  assert.ok(run.next_run_at instanceof Date, 'next_run_at should be set for the scheduler to find');
  assert.equal(sends.length, 0, 'send must not fire before the wait elapses');

  // Scheduler later finds this run "due" and advances it → the send fires.
  await engine.advanceRun(started[0]);
  assert.equal(sends.filter((s) => s === 'wa').length, 1, 'send fires after wait resumes');
  assert.equal(runs.get(started[0]).status, 'done');
});
