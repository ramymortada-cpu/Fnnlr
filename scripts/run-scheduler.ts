import { AutomationScheduler } from '../modules/automation/src/scheduler.js';
import type { ChannelSenders } from '../modules/automation/src/ports.js';
import { closeAll } from '../packages/db/src/router.js';

/**
 * Runnable scheduler. In production, replace `senders` with the real WhatsApp
 * (BSP) and email adapters. Here they log, so the loop is safe to run anywhere.
 */
const senders: ChannelSenders = {
  async whatsapp({ template, paid, leadId }) {
    console.log(`[whatsapp] template=${template} lead=${leadId} paid=${paid}`);
  },
  async email({ template, leadId }) {
    console.log(`[email] template=${template} lead=${leadId}`);
  },
};

const scheduler = new AutomationScheduler({
  senders,
  batchSize: 100,
  onError: (err, ctx) => console.error('[scheduler]', ctx, (err as Error).message),
});

const interval = Number(process.env.SCHEDULER_INTERVAL_MS || 30_000);

process.on('SIGINT', async () => {
  console.log('Stopping scheduler...');
  scheduler.stop();
  await closeAll();
  process.exit(0);
});

console.log(`Automation scheduler starting (tick every ${interval}ms)...`);
scheduler.start(interval).catch(async (e) => {
  console.error(e);
  await closeAll();
  process.exit(1);
});
