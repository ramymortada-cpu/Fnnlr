import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutomationEngine, type RunStore } from '../modules/automation/src/engine.js';
import type { ActionPorts } from '../modules/automation/src/dispatcher.js';
import type { AutomationDef, RunContext, Action } from '../modules/automation/src/types.js';
import { decideWhatsAppSend } from '../modules/automation/src/guards/whatsapp.js';
import { checkSafety } from '../modules/automation/src/guards/safety.js';

/**
 * Engine proof — runs fully in-memory (no DB), validating the engine logic that
 * will run inside each tenant's isolated database in production.
 */

// ---- In-memory store + ports ----------------------------------------------
function makeStore(automations: AutomationDef[]) {
  const runs = new Map<string, any>();
  const stepLogs: any[] = [];
  const approvals: any[] = [];
  const sends: { type: string; paid?: boolean }[] = [];
  const dedupe = new Set<string>();
  const historyByEntity = new Map<string, { runsForEntity: number; lastRunAt: Date | null }>();
  let runSeq = 0;

  const store: RunStore = {
    async getEnabledAutomationsFor(triggerEvent) {
      return automations.filter((a) => a.enabled && a.triggerEvent === triggerEvent);
    },
    async getRunHistory(automationId, entityType, entityId) {
      return historyByEntity.get(`${automationId}:${entityId}`) ?? { runsForEntity: 0, lastRunAt: null };
    },
    async createRun({ automationId, entityType, entityId, dedupeKey, context }) {
      if (dedupe.has(dedupeKey)) return null;
      dedupe.add(dedupeKey);
      const id = `run-${++runSeq}`;
      runs.set(id, { id, automationId, currentStep: 0, status: 'active', context });
      const k = `${automationId}:${entityId}`;
      const h = historyByEntity.get(k) ?? { runsForEntity: 0, lastRunAt: null };
      historyByEntity.set(k, { runsForEntity: h.runsForEntity + 1, lastRunAt: new Date(context.now) });
      return { id };
    },
    async loadRun(runId) { return runs.get(runId) ?? null; },
    async saveRunProgress(runId, update) { Object.assign(runs.get(runId), update); },
    async logStep(input) { stepLogs.push(input); },
    async createApproval(runId, stepIndex, action) { approvals.push({ runId, stepIndex, action }); },
    async getAutomation(automationId) { return automations.find((a) => a.id === automationId) ?? null; },
  };

  const ports: ActionPorts = {
    async sendWhatsApp(_t, _ctx, paid) { sends.push({ type: 'whatsapp', paid }); },
    async sendEmail() { sends.push({ type: 'email' }); },
    async createTask() { sends.push({ type: 'task' }); },
    async updateLead() { sends.push({ type: 'update' }); },
    async notifyOwner() { sends.push({ type: 'notify' }); },
    async emitEvent() { sends.push({ type: 'emit' }); },
  };

  return { store, ports, runs, stepLogs, approvals, sends };
}

function ctx(overrides: Partial<RunContext> = {}): RunContext {
  return {
    event: { type: 'lead.price_sent', payload: {}, occurredAt: '2026-01-01T10:00:00Z' },
    entity: { type: 'lead', id: 'lead-1' },
    lead: { id: 'lead-1', stage: 'price_sent', trust_level: 'high', risk_score: 0.7 },
    business: { id: 'biz-1' },
    whatsapp: { windowState: 'free_service' },
    now: '2026-01-01T10:00:00Z',
    ...overrides,
  };
}

const baseAutomation = (over: Partial<AutomationDef> = {}): AutomationDef => ({
  id: 'auto-1', businessId: null, name: 'test', enabled: true,
  triggerEvent: 'lead.price_sent', conditions: [], actions: [], requiresApproval: false,
  maxRunsPerEntity: null, cooldownSeconds: null, ...over,
});

// ---- Tests -----------------------------------------------------------------

test('matching event starts a run and executes actions', async () => {
  const def = baseAutomation({
    conditions: [{ field: 'lead.stage', op: 'eq', value: 'price_sent' }],
    actions: [{ type: 'create_task', title: 'Follow up' } as Action],
  });
  const { store, ports, sends } = makeStore([def]);
  const engine = new AutomationEngine({ store, ports });
  const res = await engine.onEvent(ctx());
  assert.equal(res.started.length, 1);
  assert.equal(sends.filter((s) => s.type === 'task').length, 1);
});

test('conditions that fail prevent the run', async () => {
  const def = baseAutomation({
    conditions: [{ field: 'lead.stage', op: 'eq', value: 'paid' }],  // won't match
    actions: [{ type: 'create_task', title: 'x' } as Action],
  });
  const { store, ports, sends } = makeStore([def]);
  const engine = new AutomationEngine({ store, ports });
  const res = await engine.onEvent(ctx());
  assert.equal(res.started.length, 0);
  assert.equal(sends.length, 0);
});

test('wait pauses the run durably (does not run later steps yet)', async () => {
  const def = baseAutomation({
    actions: [
      { type: 'wait', seconds: 3600 } as Action,
      { type: 'create_task', title: 'after wait' } as Action,
    ],
  });
  const { store, ports, runs, sends } = makeStore([def]);
  const engine = new AutomationEngine({ store, ports });
  const { started } = await engine.onEvent(ctx());
  const run = runs.get(started[0]);
  assert.equal(run.status, 'waiting', 'run should be parked waiting');
  assert.equal(sends.length, 0, 'post-wait action must NOT have fired yet');
  // Resume → the task fires.
  await engine.advanceRun(started[0]);
  assert.equal(sends.filter((s) => s.type === 'task').length, 1);
});

test('idempotency: the same trigger event does not start duplicate runs', async () => {
  const def = baseAutomation({ actions: [{ type: 'create_task', title: 'x' } as Action] });
  const { store, ports } = makeStore([def]);
  const engine = new AutomationEngine({ store, ports });
  const r1 = await engine.onEvent(ctx());
  const r2 = await engine.onEvent(ctx());   // identical event
  assert.equal(r1.started.length, 1);
  assert.equal(r2.started.length, 0, 'duplicate trigger must be deduped');
});

test('WhatsApp send is FREE inside the service window', async () => {
  const def = baseAutomation({
    actions: [{ type: 'send_whatsapp', template: 't', paidFallback: 'skip' } as Action],
  });
  const { store, ports, sends } = makeStore([def]);
  const engine = new AutomationEngine({ store, ports });
  await engine.onEvent(ctx({ whatsapp: { windowState: 'free_service' } }));
  assert.equal(sends.filter((s) => s.type === 'whatsapp' && s.paid === false).length, 1);
});

test('WhatsApp send WAITS for a free window instead of paying, when configured', async () => {
  const def = baseAutomation({
    actions: [{ type: 'send_whatsapp', template: 't', paidFallback: 'wait_for_window' } as Action],
  });
  const { store, ports, runs, sends } = makeStore([def]);
  const engine = new AutomationEngine({ store, ports });
  const { started } = await engine.onEvent(ctx({ whatsapp: { windowState: 'paid_only' } }));
  assert.equal(sends.length, 0, 'must not send a paid message');
  assert.equal(runs.get(started[0]).status, 'waiting', 'must wait for a free window');
});

test('paid WhatsApp send auto-requires approval (safety)', async () => {
  const def = baseAutomation({
    actions: [{ type: 'send_whatsapp', template: 't', paidFallback: 'allow' } as Action],
  });
  const { store, ports, approvals, sends } = makeStore([def]);
  const engine = new AutomationEngine({ store, ports });
  await engine.onEvent(ctx({ whatsapp: { windowState: 'paid_only' } }));
  assert.equal(approvals.length, 1, 'paid send must be parked for approval');
  assert.equal(sends.length, 0, 'nothing sent before approval');
});

test('anti-spam: maxRunsPerEntity blocks a second run for the same entity', async () => {
  const def = baseAutomation({
    maxRunsPerEntity: 1,
    actions: [{ type: 'create_task', title: 'x' } as Action],
  });
  const { store, ports } = makeStore([def]);
  const engine = new AutomationEngine({ store, ports });
  // First run on a fresh event.
  await engine.onEvent(ctx({ event: { type: 'lead.price_sent', payload: {}, occurredAt: 't1' } }));
  // Second, different event, same entity → blocked by safety guard.
  const r2 = await engine.onEvent(ctx({ event: { type: 'lead.price_sent', payload: {}, occurredAt: 't2' } }));
  assert.equal(r2.started.length, 0, 'second run for same entity must be blocked');
});

test('cooldown guard math is correct', () => {
  const def = baseAutomation({ cooldownSeconds: 3600 });
  const now = new Date('2026-01-01T11:00:00Z');
  const recent = checkSafety(def, { runsForEntity: 1, lastRunAt: new Date('2026-01-01T10:30:00Z') }, now);
  assert.equal(recent.allowed, false, '30 min < 60 min cooldown → blocked');
  const old = checkSafety(def, { runsForEntity: 1, lastRunAt: new Date('2026-01-01T09:00:00Z') }, now);
  assert.equal(old.allowed, true, '2h > 60 min cooldown → allowed');
});

test('whatsapp decision matrix', () => {
  const send = { type: 'send_whatsapp', template: 't' } as any;
  assert.equal(decideWhatsAppSend({ ...send, paidFallback: 'skip' }, ctx({ whatsapp: { windowState: 'free_service' } })).decision, 'send_free');
  assert.equal(decideWhatsAppSend({ ...send, paidFallback: 'allow' }, ctx({ whatsapp: { windowState: 'paid_only' } })).decision, 'send_paid');
  assert.equal(decideWhatsAppSend({ ...send, paidFallback: 'skip' }, ctx({ whatsapp: { windowState: 'paid_only' } })).decision, 'skip');
  assert.equal(decideWhatsAppSend({ ...send, paidFallback: 'wait_for_window' }, ctx({ whatsapp: { windowState: 'paid_only' } })).decision, 'wait');
});

test('approval flow resumes the run after human approves', async () => {
  const def = baseAutomation({
    requiresApproval: true,
    actions: [{ type: 'create_task', title: 'gated' } as Action],
  });
  const { store, ports, runs, sends, approvals } = makeStore([def]);
  const engine = new AutomationEngine({ store, ports });
  const { started } = await engine.onEvent(ctx());
  assert.equal(approvals.length, 1);
  assert.equal(runs.get(started[0]).status, 'awaiting_approval');
  assert.equal(sends.length, 0);
  await engine.onApproved(started[0]);
  assert.equal(sends.filter((s) => s.type === 'task').length, 1, 'action fires after approval');
});
