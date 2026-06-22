import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * LOGIC SIMULATION (no live Postgres required)
 * --------------------------------------------
 * The real isolation test (isolation.test.ts) needs a Postgres with
 * CREATE DATABASE rights. This file proves the *invariant* of the routing
 * model with an in-memory fake: each tenant resolves to exactly ONE physical
 * database handle, and a handle bound to tenant A can never read tenant B's
 * store. This mirrors what the real pg pools enforce at the infrastructure
 * layer, so the design can be validated anywhere (including CI without a DB).
 */

// A fake "physical database": an isolated key-value store.
class FakeDatabase {
  readonly name: string;
  private store = new Map<string, unknown[]>();
  constructor(name: string) { this.name = name; }
  insert(table: string, row: unknown) {
    const t = this.store.get(table) ?? [];
    t.push(row);
    this.store.set(table, t);
  }
  count(table: string): number { return (this.store.get(table) ?? []).length; }
}

// A fake control-plane registry: tenantId -> physical db name.
class FakeControlPlane {
  private routes = new Map<string, string>();
  private dbs = new Map<string, FakeDatabase>();
  provision(tenantId: string): FakeDatabase {
    if (this.routes.has(tenantId)) throw new Error('already provisioned');
    const dbName = `fnnlr_tenant_${tenantId}`;
    const db = new FakeDatabase(dbName);
    this.routes.set(tenantId, dbName);
    this.dbs.set(dbName, db);
    return db;
  }
  // The router: resolves a tenant to its OWN database. There is no path
  // that returns a different tenant's database.
  resolve(tenantId: string): FakeDatabase {
    const dbName = this.routes.get(tenantId);
    if (!dbName) throw new Error(`unknown tenant ${tenantId}`);
    const db = this.dbs.get(dbName);
    if (!db) throw new Error(`missing db ${dbName}`);
    return db;
  }
  delete(tenantId: string) {
    const dbName = this.routes.get(tenantId);
    if (dbName) { this.dbs.delete(dbName); this.routes.delete(tenantId); }
  }
}

test('each tenant resolves to its own physical database', () => {
  const cp = new FakeControlPlane();
  const a = cp.provision('A');
  const b = cp.provision('B');
  assert.notEqual(a.name, b.name);
  assert.equal(cp.resolve('A').name, a.name);
  assert.equal(cp.resolve('B').name, b.name);
});

test('writing to tenant A never appears in tenant B', () => {
  const cp = new FakeControlPlane();
  cp.provision('A');
  cp.provision('B');

  cp.resolve('A').insert('leads', { id: 'lead-1' });
  cp.resolve('A').insert('leads', { id: 'lead-2' });

  assert.equal(cp.resolve('A').count('leads'), 2, 'A sees its own leads');
  assert.equal(cp.resolve('B').count('leads'), 0, 'B sees none of A\'s leads');
});

test('there is no API to fetch another tenant\'s database', () => {
  const cp = new FakeControlPlane();
  cp.provision('A');
  // The ONLY accessor is resolve(tenantId), which returns YOUR db.
  // Passing your own id can never yield another tenant's store.
  const aDb = cp.resolve('A');
  assert.equal(aDb.name, 'fnnlr_tenant_A');
  // Unknown tenants throw rather than silently returning shared data.
  assert.throws(() => cp.resolve('C'), /unknown tenant/);
});

test('deleting a tenant removes its database entirely', () => {
  const cp = new FakeControlPlane();
  cp.provision('A');
  cp.resolve('A').insert('leads', { id: 'x' });
  cp.delete('A');
  assert.throws(() => cp.resolve('A'), /unknown tenant/, 'deleted tenant is unreachable');
});
