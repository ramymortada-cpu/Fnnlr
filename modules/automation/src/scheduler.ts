import { getControlPool } from '../../../packages/db/src/router.js';
import { AutomationEngine } from './engine.js';
import { makeTenantRunStore, dueRuns } from './store.js';
import { makeTenantActionPorts, type ChannelSenders } from './ports.js';

/**
 * The Automation Scheduler.
 *
 * Durable waits ("wait 1 hour", "wait until business hours") are only real if
 * something resumes them. The scheduler does that: on each tick it asks the
 * control-plane for active tenants, then for each tenant finds runs whose
 * next_run_at has elapsed and advances them — inside that tenant's own DB.
 *
 * Because each tenant is processed against its isolated database, one tenant's
 * automations can never touch another's. Ticks are safe to run concurrently
 * across tenants; within a tenant, DB-level locks + idempotency prevent
 * double-execution.
 */

export interface SchedulerDeps {
  senders: ChannelSenders;
  /** how many due runs to pull per tenant per tick */
  batchSize?: number;
  /** called on errors so the host can log/alert without crashing the loop */
  onError?: (err: unknown, ctx: { tenantId?: string; runId?: string }) => void;
}

export class AutomationScheduler {
  private running = false;
  constructor(private deps: SchedulerDeps) {}

  /** List active tenant ids from the control-plane. */
  private async activeTenants(): Promise<string[]> {
    const res = await getControlPool().query(
      `SELECT id FROM tenants WHERE status='active' AND deleted_at IS NULL`,
    );
    return res.rows.map((r) => r.id as string);
  }

  /** Process all due runs for a single tenant. */
  async tickTenant(tenantId: string): Promise<{ advanced: number }> {
    const store = makeTenantRunStore(tenantId);
    const ports = makeTenantActionPorts(tenantId, this.deps.senders);
    const engine = new AutomationEngine({ store, ports });

    let advanced = 0;
    try {
      const ids = await dueRuns(tenantId, this.deps.batchSize ?? 100);
      for (const runId of ids) {
        try {
          await engine.advanceRun(runId);
          advanced++;
        } catch (err) {
          this.deps.onError?.(err, { tenantId, runId });
        }
      }
    } catch (err) {
      this.deps.onError?.(err, { tenantId });
    }
    return { advanced };
  }

  /** One full tick across all active tenants. */
  async tick(): Promise<{ tenants: number; advanced: number }> {
    const tenants = await this.activeTenants();
    let advanced = 0;
    for (const tenantId of tenants) {
      const r = await this.tickTenant(tenantId);
      advanced += r.advanced;
    }
    return { tenants: tenants.length, advanced };
  }

  /** Run forever, ticking every `intervalMs`. Call stop() to end. */
  async start(intervalMs = 30_000): Promise<void> {
    this.running = true;
    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        this.deps.onError?.(err, {});
      }
      await new Promise((res) => setTimeout(res, intervalMs));
    }
  }

  stop(): void { this.running = false; }
}
