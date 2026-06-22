#!/usr/bin/env tsx
import { signup } from '../modules/auth/src/service.js';
import { createFunnelFromOnboarding } from '../modules/funnel/src/service.js';
import { getActivationStatus } from '../modules/activation/src/service.js';
import { mockLLM } from '../packages/ai-core/src/llm.js';
import { closeAll } from '../packages/db/src/router.js';

/**
 * create:customer — stand up a REAL first customer from an empty control plane:
 * user → dedicated tenant DB → workspace → membership → business → first funnel.
 * No demo data; these are real empty records the customer then fills in.
 *
 * Usage: tsx scripts/create-customer.ts <email> <password> "<business name>"
 */

const [email, password, businessName] = process.argv.slice(2);
if (!email || !password || !businessName) {
  console.error('Usage: tsx scripts/create-customer.ts <email> <password> "<business name>"');
  process.exit(2);
}

try {
  const { ctx } = await signup({ email, password, businessName, type: 'individual' });
  console.log(`✓ user + tenant + workspace + business created`);
  console.log(`  tenantId=${ctx.tenantId}`);
  console.log(`  businessId=${ctx.businessId}`);

  if (!ctx.businessId) { console.error('No business id — aborting.'); process.exit(1); }

  // a real first funnel (uses degraded LLM fallback; works without an API key)
  const funnel = await createFunnelFromOnboarding(ctx.tenantId, ctx.businessId, {
    businessName, sector: 'general', market: 'eg', goal: 'sales', offer: businessName,
  } as any, mockLLM(() => '{}'));
  const funnelId = (funnel as any).funnelId ?? (funnel as any).journeyId ?? (funnel as any).id;
  console.log(`✓ first funnel created: ${funnelId}`);

  const act = await getActivationStatus(ctx.tenantId, funnelId);
  console.log(`✓ activation ready: stage=${act.stage} score=${act.readinessScore}% nextStep=${act.nextAction?.label ?? '(none)'}`);
  console.log('\nCustomer is ready for activation. Open Go Live to continue.');
  await closeAll();
  process.exit(0);
} catch (e: any) {
  console.error('Setup failed:', e?.message ?? e);
  await closeAll().catch(() => {});
  process.exit(1);
}
