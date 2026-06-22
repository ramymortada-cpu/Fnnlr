import { test } from 'node:test';
import assert from 'node:assert/strict';
import { provisionTenant, deleteTenant } from '../modules/provisioning/src/provision.js';
import { TenantRepo } from '../modules/tenancy/src/repo.js';
import { withTenant, closeTenantPool, closeAll } from '../packages/db/src/router.js';

/**
 * ISOLATION PROOF
 * ---------------
 * These tests demonstrate that data created in Tenant A's dedicated database
 * is physically invisible from Tenant B's dedicated database. Because each
 * tenant is a separate PostgreSQL database with its own role and password,
 * there is no query path — buggy or malicious — that can cross the boundary.
 *
 * Requires a reachable Postgres with CREATE DATABASE privileges
 * (CONTROL_PLANE_DATABASE_URL, TENANT_DB_ADMIN_URL). Skipped automatically
 * if the environment is not configured, so CI can run it where a DB exists.
 */

const HAS_DB = !!process.env.CONTROL_PLANE_DATABASE_URL && !!process.env.TENANT_DB_ADMIN_URL;

test('two tenants get physically separate databases and cannot see each other\'s data', async (t) => {
  if (!HAS_DB) {
    t.skip('No database configured (set CONTROL_PLANE_DATABASE_URL + TENANT_DB_ADMIN_URL).');
    return;
  }

  // Provision two independent tenants — each gets its OWN database.
  const a = await provisionTenant({ type: 'individual', displayName: 'Seller A' });
  const b = await provisionTenant({ type: 'individual', displayName: 'Seller B' });

  try {
    assert.notEqual(a.dbName, b.dbName, 'tenants must have different physical databases');

    // Each individual tenant was seeded with exactly one business.
    const aBiz = await TenantRepo.listBusinesses(a.tenantId);
    const bBiz = await TenantRepo.listBusinesses(b.tenantId);
    assert.equal(aBiz.length, 1);
    assert.equal(bBiz.length, 1);

    // Create a lead in A only.
    await TenantRepo.createLead(a.tenantId, aBiz[0].id, 'whatsapp');

    // A sees its lead; B sees ZERO leads. The data does not exist in B's database.
    assert.equal(await TenantRepo.countLeads(a.tenantId), 1, 'Tenant A should see its own lead');
    assert.equal(await TenantRepo.countLeads(b.tenantId), 0, 'Tenant B must NOT see Tenant A\'s lead');

    // Prove B's business id literally does not exist as a row in A's database,
    // and that querying A for B's id returns nothing (no cross-DB reachability).
    const crossLook = await withTenant(a.tenantId, async (c) => {
      const r = await c.query(`SELECT id FROM businesses WHERE id = $1`, [bBiz[0].id]);
      return r.rowCount;
    });
    assert.equal(crossLook, 0, 'Tenant B\'s row must be invisible inside Tenant A\'s database');
  } finally {
    await closeTenantPool(a.tenantId);
    await closeTenantPool(b.tenantId);
    await deleteTenant(a.tenantId);
    await deleteTenant(b.tenantId);
    await closeAll();
  }
});

test('deleting a tenant drops its database entirely (true erasure)', async (t) => {
  if (!HAS_DB) { t.skip('No database configured.'); return; }

  const c = await provisionTenant({ type: 'individual', displayName: 'Temp Seller' });
  await closeTenantPool(c.tenantId);
  await deleteTenant(c.tenantId);

  // After deletion, attempting to use the tenant must fail — the DB is gone.
  await assert.rejects(
    () => TenantRepo.countLeads(c.tenantId),
    'using a deleted tenant must throw — its database no longer exists',
  );
  await closeAll();
});
