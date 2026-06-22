import { withTenant } from '../../../packages/db/src/router.js';

/**
 * Tenant-scoped data access. Every method is bound to ONE tenant's dedicated
 * database via withTenant(tenantId). There is no parameter anywhere that could
 * redirect a query to another tenant's database — the physical DB boundary
 * guarantees isolation.
 *
 * The API layer should ONLY ever reach tenant data through helpers like these,
 * never by constructing connections directly.
 */
export const TenantRepo = {
  async listBusinesses(tenantId: string) {
    return withTenant(tenantId, async (c) => {
      const r = await c.query(`SELECT id, name, sector, market, currency FROM businesses WHERE deleted_at IS NULL ORDER BY created_at`);
      return r.rows;
    });
  },

  async createLead(tenantId: string, businessId: string, source: string) {
    return withTenant(tenantId, async (c) => {
      const r = await c.query(
        `INSERT INTO leads (business_id, source) VALUES ($1,$2) RETURNING id, stage`,
        [businessId, source],
      );
      return r.rows[0];
    });
  },

  async createConversation(tenantId: string, businessId: string, leadId: string | null) {
    return withTenant(tenantId, async (c) => {
      const r = await c.query(
        `INSERT INTO conversations (business_id, lead_id) VALUES ($1,$2) RETURNING id`,
        [businessId, leadId],
      );
      return r.rows[0];
    });
  },

  async emitEvent(tenantId: string, type: string, source: string, payload: unknown) {
    return withTenant(tenantId, async (c) => {
      await c.query(
        `INSERT INTO events (type, source, payload) VALUES ($1,$2,$3)`,
        [type, source, JSON.stringify(payload)],
      );
    });
  },

  async countLeads(tenantId: string): Promise<number> {
    return withTenant(tenantId, async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM leads`);
      return r.rows[0].n as number;
    });
  },
};
