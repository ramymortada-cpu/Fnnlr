import { provisionTenant, type TenantType } from '../modules/provisioning/src/provision.js';
import { closeAll } from '../packages/db/src/router.js';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}

async function main() {
  const type = (arg('type') || 'individual') as TenantType;
  const name = arg('name') || 'Untitled Tenant';
  const email = arg('email');
  const parent = arg('parent') || null;

  if (type !== 'individual' && type !== 'agency') {
    throw new Error("--type must be 'individual' or 'agency'");
  }

  console.log(`Provisioning ${type} tenant "${name}" (own dedicated database)...`);
  const result = await provisionTenant({
    type, displayName: name, ownerEmail: email, parentAgencyId: parent,
  });
  console.log('✓ Provisioned:');
  console.log(`  tenantId: ${result.tenantId}`);
  console.log(`  database: ${result.dbName} (physically isolated)`);
  console.log(`  role:     ${result.dbRole}`);
  await closeAll();
}

main().catch((e) => { console.error(e); process.exit(1); });
