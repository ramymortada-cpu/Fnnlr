import { deleteTenant } from '../modules/provisioning/src/provision.js';
import { closeTenantPool, closeAll } from '../packages/db/src/router.js';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}

async function main() {
  const tenantId = arg('id');
  if (!tenantId) throw new Error('--id=<tenantId> is required');
  console.log(`Deleting tenant ${tenantId} — dropping its dedicated database entirely...`);
  await closeTenantPool(tenantId);
  await deleteTenant(tenantId);
  console.log('✓ Tenant database dropped. Data is gone — true right-to-be-forgotten.');
  await closeAll();
}

main().catch((e) => { console.error(e); process.exit(1); });
