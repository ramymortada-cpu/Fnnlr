import { getControlPool } from '../../../packages/db/src/router.js';

/**
 * Connection → tenant resolution for webhook routes. Webhooks are public and
 * must NOT trust a caller-supplied tenant; the tenant is resolved from the
 * connection id alone via the control-plane map. Fails safe to null.
 */

export async function registerIntegrationRoute(connectionId: string, provider: string, tenantId: string): Promise<void> {
  const control = getControlPool();
  await control.query(
    `INSERT INTO integration_routes (connection_id, provider, tenant_id) VALUES ($1,$2,$3)
     ON CONFLICT (connection_id) DO UPDATE SET provider=EXCLUDED.provider, tenant_id=EXCLUDED.tenant_id`,
    [connectionId, provider, tenantId],
  );
}

export async function unregisterIntegrationRoute(connectionId: string): Promise<void> {
  await getControlPool().query(`DELETE FROM integration_routes WHERE connection_id=$1`, [connectionId]);
}

export async function resolveTenantByConnection(connectionId: string): Promise<{ tenantId: string; provider: string } | null> {
  try {
    const r = await getControlPool().query(`SELECT tenant_id, provider FROM integration_routes WHERE connection_id=$1`, [connectionId]);
    return r.rowCount ? { tenantId: r.rows[0].tenant_id, provider: r.rows[0].provider } : null;
  } catch {
    return null;
  }
}
