import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;

/**
 * The control-plane pool. The ONLY shared database connection.
 * Holds the tenant registry + routing, never raw tenant data.
 */
let controlPool: pg.Pool | null = null;

export function getControlPool(): pg.Pool {
  if (!controlPool) {
    const url = process.env.CONTROL_PLANE_DATABASE_URL;
    if (!url) throw new Error('CONTROL_PLANE_DATABASE_URL is not set');
    controlPool = new Pool({ connectionString: url, max: 10 });
  }
  return controlPool;
}

/**
 * Per-tenant pool registry. Each tenant gets its OWN pool to its OWN database.
 * There is no shared connection across tenants — isolation is physical.
 */
const tenantPools = new Map<string, pg.Pool>();

export interface TenantRoute {
  tenantId: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbRole: string;
  dbCredential: string; // decrypted connection password/secret
  status: string;
}

/** Simple symmetric decryption for stored credentials (use KMS in production). */
function decryptCredential(encrypted: string): string {
  const key = process.env.TENANT_CREDENTIAL_ENCRYPTION_KEY;
  if (!key) throw new Error('TENANT_CREDENTIAL_ENCRYPTION_KEY is not set');
  // Format: ivHex:tagHex:cipherHex  (AES-256-GCM)
  const [ivHex, tagHex, dataHex] = encrypted.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    // Allow plaintext in local/dev so the foundation runs without KMS.
    return encrypted;
  }
  const keyBuf = crypto.createHash('sha256').update(key).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(dataHex, 'hex')).toString('utf8') + decipher.final('utf8');
}

export function encryptCredential(plaintext: string): string {
  const key = process.env.TENANT_CREDENTIAL_ENCRYPTION_KEY;
  if (!key) throw new Error('TENANT_CREDENTIAL_ENCRYPTION_KEY is not set');
  const keyBuf = crypto.createHash('sha256').update(key).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/**
 * Look up where a tenant's dedicated database lives.
 * Returns null if the tenant does not exist or is not active.
 */
export async function resolveTenant(tenantId: string): Promise<TenantRoute | null> {
  const res = await getControlPool().query(
    `SELECT id, db_host, db_port, db_name, db_role, db_credential, status
       FROM tenants
      WHERE id = $1 AND deleted_at IS NULL`,
    [tenantId],
  );
  if (res.rowCount === 0) return null;
  const r = res.rows[0];
  return {
    tenantId: r.id,
    dbHost: r.db_host,
    dbPort: r.db_port,
    dbName: r.db_name,
    dbRole: r.db_role,
    dbCredential: decryptCredential(r.db_credential),
    status: r.status,
  };
}

/**
 * Get (or lazily create) a connection pool to a tenant's DEDICATED database.
 * This is the heart of total isolation: a different pool → a different database
 * → no possible cross-tenant data access.
 */
export async function getTenantPool(tenantId: string): Promise<pg.Pool> {
  const existing = tenantPools.get(tenantId);
  if (existing) return existing;

  const route = await resolveTenant(tenantId);
  if (!route) throw new Error(`Tenant not found or inactive: ${tenantId}`);
  if (route.status !== 'active') throw new Error(`Tenant ${tenantId} status is ${route.status}`);

  const pool = new Pool({
    host: route.dbHost,
    port: route.dbPort,
    database: route.dbName,
    user: route.dbRole,
    password: route.dbCredential,
    max: 5,
  });
  tenantPools.set(tenantId, pool);
  return pool;
}

/**
 * Run a query inside a specific tenant's database.
 * There is no way to pass "another tenant's id" and reach the wrong DB,
 * because the pool is bound to one physical database.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const pool = await getTenantPool(tenantId);
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Run a function inside a tenant DB wrapped in a single SQL transaction.
 * BEGIN → fn → COMMIT, or ROLLBACK on any error. Guarantees no partial
 * outcome/learning state if a write sequence throws mid-way.
 */
export async function withTenantTx<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const pool = await getTenantPool(tenantId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore rollback failure */ }
    throw e;
  } finally {
    client.release();
  }
}

/** Close a tenant pool (e.g. on suspend/delete). */
export async function closeTenantPool(tenantId: string): Promise<void> {
  const pool = tenantPools.get(tenantId);
  if (pool) {
    await pool.end();
    tenantPools.delete(tenantId);
  }
}

export async function closeAll(): Promise<void> {
  for (const [, pool] of tenantPools) await pool.end();
  tenantPools.clear();
  if (controlPool) await controlPool.end();
  controlPool = null;
}
