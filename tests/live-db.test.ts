import { test } from 'node:test';
import assert from 'node:assert/strict';
import { provisionTenant, deleteTenant } from '../modules/provisioning/src/provision.js';
import { withTenant, withTenantTx, closeAll } from '../packages/db/src/router.js';

/**
 * LIVE DATABASE SUITE (Sprint 32)
 * --------------------------------
 * Proves on a REAL Postgres what the unit suite can only assert: tenant
 * isolation, the Sprint-31 learning unique constraints, transaction rollback,
 * and scheduled-run idempotency. Runs only when a database is configured
 * (CONTROL_PLANE_DATABASE_URL + TENANT_DB_ADMIN_URL); otherwise the whole file
 * skips with an explicit reason. Run it with: npm run test:pg
 */

const HAS_DB = !!process.env.CONTROL_PLANE_DATABASE_URL && !!process.env.TENANT_DB_ADMIN_URL;
const maybe = (name: string, fn: any) => test(name, async (t) => {
  if (!HAS_DB) { t.skip('No database configured — run `npm run test:pg`.'); return; }
  await fn(t);
});

test.after(async () => { if (HAS_DB) await closeAll(); });

// ---------------------------------------------------------------------------
maybe('migrations apply cleanly and a tenant becomes queryable', async () => {
  const a = await provisionTenant({ type: 'individual', displayName: 'Live A' });
  try {
    const r = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT 1 AS ok`)).rows[0]);
    assert.equal(r.ok, 1);
    // key indexes exist
    const idx = await withTenant(a.tenantId, async (c) =>
      (await c.query(`SELECT indexname FROM pg_indexes WHERE indexname LIKE 'uq_%learning%'`)).rows.map((x: any) => x.indexname));
    assert.ok(idx.includes('uq_opp_learning_outcome'), 'opp learning unique index present');
    assert.ok(idx.includes('uq_rec_learning_outcome'), 'rec learning unique index present');
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('UNIQUE CONSTRAINT: duplicate learning row for the same source is rejected by the DB', async () => {
  const a = await provisionTenant({ type: 'individual', displayName: 'Live Constraint' });
  try {
    await withTenant(a.tenantId, async (c) => {
      // seed an opportunity + outcome to satisfy FKs
      const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('B','EG') RETURNING id`)).rows[0].id;
      const fun = (await c.query(`INSERT INTO journeys (business_id, name) VALUES ($1,'F') RETURNING id`, [biz])).rows[0].id;
      const opp = (await c.query(
        `INSERT INTO revenue_opportunities (funnel_id, business_id, opportunity_type, dedupe_key, title, source, priority_score, urgency, status, affected_objects)
         VALUES ($1,$2,'waiting_payment_recovery','k1','t','test',50,'high','open','[]') RETURNING id`, [fun, biz])).rows[0].id;
      const out = (await c.query(
        `INSERT INTO opportunity_outcomes (opportunity_id, funnel_id, business_id, opportunity_type, detected_at, outcome_status, confidence, interpretation)
         VALUES ($1,$2,$3,'waiting_payment_recovery', now(),'captured','high','x') RETURNING id`, [opp, fun, biz])).rows[0].id;
      // first learning row: fine
      await c.query(
        `INSERT INTO opportunity_learning_records (opportunity_outcome_id, opportunity_id, opportunity_type, status, confidence)
         VALUES ($1,$2,'waiting_payment_recovery','captured','high')`, [out, opp]);
      // second row for the SAME outcome: must be rejected by uq_opp_learning_outcome
      let rejected = false;
      try {
        await c.query(
          `INSERT INTO opportunity_learning_records (opportunity_outcome_id, opportunity_id, opportunity_type, status, confidence)
           VALUES ($1,$2,'waiting_payment_recovery','captured','high')`, [out, opp]);
      } catch (e: any) { rejected = e.code === '23505'; } // unique_violation
      assert.equal(rejected, true, 'DB must reject a duplicate learning row for the same source outcome');
    });
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('TRANSACTION: an error mid-write rolls back — no partial outcome/learning state', async () => {
  const a = await provisionTenant({ type: 'individual', displayName: 'Live Tx' });
  try {
    const before = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM opportunity_outcomes`)).rows[0].n);
    let threw = false;
    try {
      await withTenantTx(a.tenantId, async (c) => {
        const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('B','EG') RETURNING id`)).rows[0].id;
        const fun = (await c.query(`INSERT INTO journeys (business_id, name) VALUES ($1,'F') RETURNING id`, [biz])).rows[0].id;
        const opp = (await c.query(
          `INSERT INTO revenue_opportunities (funnel_id, business_id, opportunity_type, dedupe_key, title, source, priority_score, urgency, status, affected_objects)
           VALUES ($1,$2,'x','k2','t','test',50,'high','open','[]') RETURNING id`, [fun, biz])).rows[0].id;
        await c.query(
          `INSERT INTO opportunity_outcomes (opportunity_id, funnel_id, business_id, opportunity_type, detected_at, outcome_status, confidence, interpretation)
           VALUES ($1,$2,$3,'x', now(),'captured','high','x')`, [opp, fun, biz]);
        // force an error AFTER the outcome insert
        throw new Error('boom mid-write');
      });
    } catch { threw = true; }
    assert.equal(threw, true);
    const after = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM opportunity_outcomes`)).rows[0].n);
    assert.equal(after, before, 'rolled back — outcome row must not persist');
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('SCHEDULER IDEMPOTENCY: same idempotency key cannot create two scheduled_runs', async () => {
  const a = await provisionTenant({ type: 'individual', displayName: 'Live Cron' });
  try {
    await withTenant(a.tenantId, async (c) => {
      const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('B','EG') RETURNING id`)).rows[0].id;
      const key = 'daily:2026-06-21';
      await c.query(`INSERT INTO scheduled_runs (job_type, target_type, target_id, idempotency_key, status) VALUES ('daily_business_refresh','business',$1,$2,'running')`, [biz, key]);
      let rejected = false;
      try {
        await c.query(`INSERT INTO scheduled_runs (job_type, target_type, target_id, idempotency_key, status) VALUES ('daily_business_refresh','business',$1,$2,'running')`, [biz, key]);
      } catch (e: any) { rejected = e.code === '23505'; }
      assert.equal(rejected, true, 'duplicate idempotency key must be rejected');
    });
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('ISOLATION: tenant A and tenant B cannot see each other\'s rows', async () => {
  const a = await provisionTenant({ type: 'individual', displayName: 'Iso A' });
  const b = await provisionTenant({ type: 'individual', displayName: 'Iso B' });
  try {
    await withTenant(a.tenantId, async (c) => { await c.query(`INSERT INTO businesses (name, market) VALUES ('SECRET-A','EG')`); });
    const seenInB = await withTenant(b.tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM businesses WHERE name='SECRET-A'`)).rows[0].n);
    assert.equal(seenInB, 0, 'tenant B must not see tenant A data');
  } finally { await deleteTenant(a.tenantId); await deleteTenant(b.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('LIVE WEBHOOK: WhatsApp inbound stores an event, opens conversation, leaves tenant B untouched', async () => {
  const { handleWhatsAppWebhook } = await import('../modules/integrations/src/service.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'WA A' });
  const b = await provisionTenant({ type: 'individual', displayName: 'WA B' });
  try {
    // a connection in tenant A
    const connId = await withTenant(a.tenantId, async (c) => {
      const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('WA','EG') RETURNING id`)).rows[0].id;
      const fun = (await c.query(`INSERT INTO journeys (business_id, name) VALUES ($1,'F') RETURNING id`, [biz])).rows[0].id;
      return (await c.query(`INSERT INTO integration_connections (journey_id, business_id, provider, status) VALUES ($1,$2,'whatsapp_cloud_api','connected') RETURNING id`, [fun, biz])).rows[0].id;
    });
    const payload = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '201000000000', text: { body: 'عايز أعرف السعر' } }] } }] }] });
    const r = await handleWhatsAppWebhook(a.tenantId, connId, payload, {});
    assert.equal(r.ok, true);
    assert.equal(r.mapped, 'message_received');
    // event stored in A
    const evCount = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM integration_events WHERE connection_id=$1`, [connId])).rows[0].n);
    assert.ok(evCount >= 1, 'inbound event stored in tenant A');
    // conversation/lead created in A
    const leadCount = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM leads`)).rows[0].n);
    assert.ok(leadCount >= 1, 'lead created/updated in tenant A');
    // tenant B has zero of all this
    const bEvents = await withTenant(b.tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM integration_events`)).rows[0].n);
    assert.equal(bEvents, 0, 'tenant B untouched');
  } finally { await deleteTenant(a.tenantId); await deleteTenant(b.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('LIVE WEBHOOK: unmatched payment payload is stored safely, not dropped', async () => {
  const { handlePaymentWebhook } = await import('../modules/integrations/src/service.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'Pay A' });
  try {
    const connId = await withTenant(a.tenantId, async (c) => {
      const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('P','EG') RETURNING id`)).rows[0].id;
      const fun = (await c.query(`INSERT INTO journeys (business_id, name) VALUES ($1,'F') RETURNING id`, [biz])).rows[0].id;
      return (await c.query(`INSERT INTO integration_connections (journey_id, business_id, provider, status) VALUES ($1,$2,'paymob','connected') RETURNING id`, [fun, biz])).rows[0].id;
    });
    const r = await handlePaymentWebhook(a.tenantId, 'paymob', connId, JSON.stringify({ obj: { success: true, amount_cents: 50000, order: { id: 'no-such-ref' } } }), {});
    assert.ok(r.ok === true || r.ok === false);   // handled either way
    const ev = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM integration_events WHERE connection_id=$1`, [connId])).rows[0].n);
    assert.ok(ev >= 1, 'payment event stored even when unmatched');
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('SECURITY: a discarded command cannot be applied, and apply is idempotent', async () => {
  const { runCommand, applyCommand, discardCommand } = await import('../modules/command/src/service.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'Cmd Sec' });
  try {
    const funnelId = await withTenant(a.tenantId, async (c) => {
      const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('C','EG') RETURNING id`)).rows[0].id;
      return (await c.query(`INSERT INTO journeys (business_id, name, status) VALUES ($1,'F','active') RETURNING id`, [biz])).rows[0].id;
    });
    // create a simple proposed command directly
    const cmdId = await withTenant(a.tenantId, async (c) =>
      (await c.query(`INSERT INTO commands (journey_id, command_text, intent, result_type, action_kind, status, action_payload) VALUES ($1,'حدّث','update','update','section_update','proposed','{}') RETURNING id`, [funnelId])).rows[0].id);
    // discard it, then attempt apply → must be refused
    await discardCommand(a.tenantId, cmdId);
    const afterDiscard = await applyCommand(a.tenantId, cmdId);
    assert.equal(afterDiscard.ok, false);
    assert.match(String(afterDiscard.error), /discarded/);

    // a fresh proposed command: apply once, then apply again → second is a no-op, not a re-execution
    const cmd2 = await withTenant(a.tenantId, async (c) =>
      (await c.query(`INSERT INTO commands (journey_id, command_text, intent, result_type, action_kind, status, action_payload) VALUES ($1,'حدّث','update','update','section_update','proposed','{}') RETURNING id`, [funnelId])).rows[0].id);
    await applyCommand(a.tenantId, cmd2);
    const twice = await applyCommand(a.tenantId, cmd2);
    assert.equal(twice.alreadyApplied, true, 'second apply is idempotent');
    // audit row written
    const audits = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM audit_events WHERE action IN ('command_apply','command_discard')`)).rows[0].n);
    assert.ok(audits >= 2, 'apply + discard were audited');
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('SECURITY: an object id from tenant B cannot be mutated inside tenant A', async () => {
  const { applyCommand } = await import('../modules/command/src/service.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'Ten A' });
  const b = await provisionTenant({ type: 'individual', displayName: 'Ten B' });
  try {
    // a command exists in tenant B
    const bCmd = await withTenant(b.tenantId, async (c) => {
      const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('B','EG') RETURNING id`)).rows[0].id;
      const fun = (await c.query(`INSERT INTO journeys (business_id, name) VALUES ($1,'F') RETURNING id`, [biz])).rows[0].id;
      return (await c.query(`INSERT INTO commands (journey_id, command_text, intent, result_type, action_kind, status, action_payload) VALUES ($1,'x','update','update','section_update','proposed','{}') RETURNING id`, [fun])).rows[0].id;
    });
    // try to apply B's command id while scoped to tenant A → not found (separate DB)
    const cross = await applyCommand(a.tenantId, bCmd);
    assert.equal(cross.ok, false);
    assert.match(String(cross.error), /not found/);
    // B's command is still untouched/proposed
    const stillProposed = await withTenant(b.tenantId, async (c) => (await c.query(`SELECT status FROM commands WHERE id=$1`, [bCmd])).rows[0].status);
    assert.equal(stillProposed, 'proposed');
  } finally { await deleteTenant(a.tenantId); await deleteTenant(b.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('SECURITY: integration reads never return raw secrets; disconnect removes credentials', async () => {
  const { createConnection, getConnection, deleteConnection } = await import('../modules/integrations/src/service.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'Int Sec' });
  try {
    const funnelId = await withTenant(a.tenantId, async (c) => {
      const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('I','EG') RETURNING id`)).rows[0].id;
      return (await c.query(`INSERT INTO journeys (business_id, name) VALUES ($1,'F') RETURNING id`, [biz])).rows[0].id;
    });
    const conn = await createConnection(a.tenantId, { provider: 'paymob', journeyId: funnelId, credentials: { hmac_secret: 'SUPER_SECRET_VALUE_123' }, webhookSecret: 'WHSEC_999' }) as any;
    assert.ok(conn?.id);
    // the create response must not contain the raw secret anywhere
    assert.ok(!JSON.stringify(conn).includes('SUPER_SECRET_VALUE_123'), 'create response hides the secret');
    const got = await getConnection(a.tenantId, conn.id) as any;
    assert.ok(!JSON.stringify(got).includes('SUPER_SECRET_VALUE_123'), 'get response hides the secret');
    assert.ok(!JSON.stringify(got).includes('WHSEC_999'), 'webhook secret never exposed');
    assert.equal(got.hasWebhookSecret, true, 'only a boolean flag is exposed');
    // raw secret must NOT sit in the DB as plaintext
    const stored = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT credentials_encrypted::text AS t, webhook_secret_enc FROM integration_connections WHERE id=$1`, [conn.id])).rows[0]);
    assert.ok(!stored.t.includes('SUPER_SECRET_VALUE_123'), 'credentials stored encrypted, not plaintext');
    // disconnect removes the row + credentials entirely
    await deleteConnection(a.tenantId, conn.id);
    const after = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM integration_connections WHERE id=$1`, [conn.id])).rows[0].n);
    assert.equal(after, 0, 'disconnect removed the connection + its credentials');
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('SECURITY: webhook with a configured secret rejects a missing/wrong signature (fail-closed)', async () => {
  const { handleWhatsAppWebhook } = await import('../modules/integrations/src/service.js');
  const { encryptSecret } = await import('../modules/integrations/src/secrets.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'WH Sig' });
  try {
    const connId = await withTenant(a.tenantId, async (c) => {
      const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('W','EG') RETURNING id`)).rows[0].id;
      const fun = (await c.query(`INSERT INTO journeys (business_id, name) VALUES ($1,'F') RETURNING id`, [biz])).rows[0].id;
      const sec = encryptSecret('the-webhook-secret');
      return (await c.query(`INSERT INTO integration_connections (journey_id, business_id, provider, status, webhook_secret_enc) VALUES ($1,$2,'whatsapp_cloud_api','connected',$3) RETURNING id`, [fun, biz, sec])).rows[0].id;
    });
    const payload = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '201', text: { body: 'hi' } }] } }] }] });
    // no signature header → rejected
    const missing = await handleWhatsAppWebhook(a.tenantId, connId, payload, {});
    assert.equal(missing.ok, false, 'missing signature rejected when a secret is configured');
    // wrong signature → rejected
    const wrong = await handleWhatsAppWebhook(a.tenantId, connId, payload, { 'x-hub-signature-256': 'sha256=deadbeef' });
    assert.equal(wrong.ok, false, 'wrong signature rejected');
    // both rejections were audited
    const rej = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM audit_events WHERE action='webhook_rejected'`)).rows[0].n);
    assert.ok(rej >= 2, 'rejections audited');
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('REPEATABILITY: two customers via the same path → distinct tenants, idempotent, B smoke does not touch A', async () => {
  const { repeatabilityCheck, repeatabilityReport } = await import('../modules/repeatability/src/runner.js');
  const uniq = Date.now().toString(36);
  const cfgA: any = {
    workspaceName: `Repeat A ${uniq}`, ownerEmail: `a-${uniq}@repeat.example`,
    business: { name: `Repeat A Biz ${uniq}`, market: 'eg' }, whatsappNumber: '+201000000001',
    offer: { promise: 'x', price: '1', package: 'p' },
    payment: { method: 'instapay', accountDetails: 'a@instapay', instructions: 'حوّل' },
    publicAppUrl: 'https://a.fnnlr.app', supportOwner: 'a@fnnlr.app', createFunnel: true,
  };
  const cfgB: any = {
    workspaceName: `Repeat B ${uniq}`, ownerEmail: `b-${uniq}@repeat.example`,
    business: { name: `Repeat B Biz ${uniq}`, market: 'ae' }, whatsappNumber: '+971500000002',
    offer: { promise: 'y', price: '2', package: 'q' },
    payment: { method: 'bank_transfer', accountDetails: 'b-bank', instructions: 'حوّل' },
    publicAppUrl: 'https://b.fnnlr.app', supportOwner: 'b@fnnlr.app', createFunnel: true,
  };

  const r = await repeatabilityCheck(
    { label: 'customerA', config: cfgA, ownerPassword: 'PassA!234567' },
    { label: 'customerB', config: cfgB, ownerPassword: 'PassB!234567' },
  );
  try {
    // distinct tenants/businesses/funnels
    assert.ok(r.separation.every((c) => c.ok), `separation failed: ${JSON.stringify(r.separation)}`);
    // idempotent rerun (same ids)
    assert.ok(r.idempotency.every((c) => c.ok), `idempotency failed: ${JSON.stringify(r.idempotency)}`);
    // B's smoke did not change A's counts/desk, and B got its own signal
    assert.ok(r.signalIsolation.every((c) => c.ok), `signal isolation failed: ${JSON.stringify(r.signalIsolation)}`);
    assert.equal(r.status, 'PASS');

    const report = repeatabilityReport(r);
    assert.equal(report.decision, 'REPEATABLE');
    assert.equal(report.customersTested, 2);
    assert.ok(!/password|secret|token/i.test(JSON.stringify(report)), 'report leaks no secrets');
  } finally {
    // clean up both tenants
    for (const cust of r.customers) if (cust.tenantId) await deleteTenant(cust.tenantId).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
maybe('FRICTION: support pack is safe (no secrets), includes issues + daily check; launch-check fail names a route', async () => {
  const { supportPack } = await import('../modules/execution/src/support-pack.js');
  const { launchCheck } = await import('../modules/execution/src/service.js');
  const { logIssue } = await import('../modules/execution/src/issues.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'Friction Customer' });
  try {
    const funnelId = await withTenant(a.tenantId, async (c) => {
      const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('Fr Biz','EG') RETURNING id`)).rows[0].id;
      return (await c.query(`INSERT INTO journeys (business_id, name, status) VALUES ($1,'F','active') RETURNING id`, [biz])).rows[0].id;
    });

    // launch-check before setup: a failing item must name a route/next action
    const lc = await launchCheck(a.tenantId, funnelId);
    const failing = Object.values(lc.sections).flat().filter((c: any) => c.level === 'fail');
    assert.ok(failing.length > 0, 'something fails before setup');
    assert.ok(failing.every((c: any) => /→|run |publish|create|set |add /i.test(c.message)), 'every failing item names what to do');

    // log a P1 issue (owner + next action enforced)
    await logIssue(a.tenantId, 'test', { severity: 'P1', source: 'go-live', evidence: 'no published page', owner: 'platform', nextAction: 'publish the page' });

    // support pack is safe and complete
    const pack = await supportPack(a.tenantId, funnelId);
    const packStr = JSON.stringify(pack);
    assert.ok(!/password|secret|token|credentials_encrypted/i.test(packStr), 'support pack leaks no secrets');
    assert.ok(pack.dailyCheck, 'support pack includes the daily check');
    assert.ok(Array.isArray(pack.issues) && pack.issues.length >= 1, 'support pack includes issues');
    assert.equal(pack.issues[0].owner, 'platform', 'issue owner present');
    assert.ok(pack.activation, 'support pack includes activation');
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('GO-LIVE: refuses BLOCKED (records launch_blocked + issue) → LAUNCHED after setup → 72h monitor invents no revenue → update safe', async () => {
  const { goLive, monitor72h, update72h, eventLedger } = await import('../modules/execution/src/live.js');
  const { listIssues } = await import('../modules/execution/src/issues.js');
  const { readExecutionLog } = await import('../modules/execution/src/log.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'GoLive Customer' });
  try {
    const manifest: any = {
      customerName: 'GoLive CZ', workspaceName: 'GoLive', ownerEmail: 'gl@example.com',
      business: { name: 'GoLive Biz', market: 'eg' }, whatsappNumber: '+201000000000',
      whatsappProviderStatus: 'manual_link_only',
      payment: { method: 'instapay', instructions: 'حوّل وابعت سكرين' },
      publicAppUrl: 'https://gl.app', launchWindow: '2026-06-25 18:00', supportOwner: 'support@fnnlr.app',
    };
    const { businessId, funnelId } = await withTenant(a.tenantId, async (c) => {
      const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('GoLive Biz','EG') RETURNING id`)).rows[0].id;
      const fun = (await c.query(`INSERT INTO journeys (business_id, name, status) VALUES ($1,'F','active') RETURNING id`, [biz])).rows[0].id;
      return { businessId: biz, funnelId: fun };
    });

    // go-live BEFORE setup → must REFUSE (execution lock BLOCKED), record launch_blocked + an issue
    const blocked = await goLive(a.tenantId, funnelId, manifest, { production: false });
    assert.equal(blocked.status, 'BLOCKED', 'go-live refuses a BLOCKED execution lock');
    assert.ok(blocked.blockers.length > 0, 'blockers surfaced');
    const log1 = await readExecutionLog(a.tenantId);
    assert.ok(log1.some((l: any) => l.action === 'launch_blocked'), 'launch_blocked recorded');
    const issues1 = await listIssues(a.tenantId);
    assert.ok(issues1.some((i) => i.source === 'go-live' && i.status === 'open'), 'a blocker issue is logged with an owner');
    assert.ok(issues1[0].owner);

    // configure: publish page + link + payment
    await withTenant(a.tenantId, async (c) => {
      await c.query(`INSERT INTO offers (journey_id, content) VALUES ($1,'{"promise":"x"}')`, [funnelId]);
      await c.query(`INSERT INTO funnel_stages (journey_id, position, name) VALUES ($1,0,'وعي')`, [funnelId]);
      const p = (await c.query(`INSERT INTO pages (journey_id, content, published, published_at) VALUES ($1,'{"h":"x"}',TRUE, now()) RETURNING id`, [funnelId])).rows[0].id;
      await c.query(`INSERT INTO tracked_links (code, journey_id, page_id, destination) VALUES ($1,$2,$3,'https://wa.me/201')`, ['gl-' + funnelId.slice(0, 8), funnelId, p]);
      await c.query(`INSERT INTO payment_methods (journey_id, method, account_details, customer_instructions) VALUES ($1,'instapay','acct','حوّل')`, [funnelId]);
    });

    // go-live now → LAUNCHED, first signal marked test, launch_completed recorded
    const live = await goLive(a.tenantId, funnelId, manifest, { production: false });
    assert.equal(live.status, 'LAUNCHED', `expected LAUNCHED, got ${live.status}: ${live.blockers.join('; ')}`);
    assert.equal(live.firstSignal?.marked, true, 'script first-signal is marked test');
    const markedRows = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM page_events WHERE visitor LIKE 'smoke:%'`)).rows[0].n);
    assert.ok(markedRows > 0, 'marked test event is identifiable');
    const log2 = await readExecutionLog(a.tenantId);
    assert.ok(log2.some((l: any) => l.action === 'launch_completed'), 'launch_completed recorded');
    assert.ok(log2.some((l: any) => l.action === 'first_signal_received'), 'first_signal_received recorded');

    // 72h monitor invents no revenue (no real amount)
    const mon = await monitor72h(a.tenantId, funnelId);
    assert.equal(mon.knownRevenue, null, 'no fabricated revenue without a real amount');
    assert.equal(mon.launchStatus, 'launched');
    assert.ok(mon.firstSignalAt, 'first signal timestamp present');

    // ledger from existing evidence
    const led = await eventLedger(a.tenantId, funnelId);
    assert.ok(led.counts.pageEvents > 0, 'ledger sees real page events');
    assert.ok(led.conversionPathSeen.includes('page_view'));

    // 72h update is safe: no secrets, no fabricated revenue claim
    const upd = await update72h(a.tenantId, funnelId, manifest);
    const updStr = JSON.stringify(upd);
    assert.ok(!/password|secret|token|stack|Error:/i.test(updStr), '72h update leaks nothing');
    assert.ok(!/\$\d|إيراد محقّق/i.test(updStr), '72h update claims no revenue');
    assert.equal(upd.supportContact, 'support@fnnlr.app');
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('EXECUTION LOCK: BLOCKED before publish → READY/WARN after → first signal → decision → safe summary → idempotent', async () => {
  const { validateExecutionManifest } = await import('../modules/execution/src/manifest.js');
  const { executionLock, firstSignal, launchSummary } = await import('../modules/execution/src/service.js');
  const { dailyCheck } = await import('../modules/operating-room/src/service.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'Exec Customer' });
  try {
    const manifest: any = {
      customerName: 'Exec CZ', workspaceName: 'Exec', ownerEmail: 'exec@example.com',
      business: { name: 'Exec Biz', market: 'eg' }, whatsappNumber: '+201000000000',
      whatsappProviderStatus: 'manual_link_only',
      payment: { method: 'instapay', instructions: 'حوّل وابعت سكرين' },
      publicAppUrl: 'https://exec.app', launchWindow: '2026-06-25 18:00', supportOwner: 'support@fnnlr.app',
    };
    // 1-2) validate manifest
    assert.equal(validateExecutionManifest(manifest, { production: false }).ok, true);

    // 3) setup (business + funnel)
    const { businessId, funnelId } = await withTenant(a.tenantId, async (c) => {
      const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('Exec Biz','EG') RETURNING id`)).rows[0].id;
      const fun = (await c.query(`INSERT INTO journeys (business_id, name, status) VALUES ($1,'F','active') RETURNING id`, [biz])).rows[0].id;
      return { businessId: biz, funnelId: fun };
    });

    // 4) execution lock BEFORE publish → BLOCKED with the exact missing steps
    const lock1 = await executionLock(a.tenantId, funnelId, manifest, { production: false });
    assert.equal(lock1.status, 'BLOCKED', `expected BLOCKED, got ${lock1.status}`);
    assert.ok(lock1.blocking.some((b) => /page|publish|link|payment|activation/i.test(b)), 'blocking names the missing setup');

    // 5-7) publish page + tracked link + payment
    const pid = await withTenant(a.tenantId, async (c) => {
      await c.query(`INSERT INTO offers (journey_id, content) VALUES ($1,'{"promise":"x"}')`, [funnelId]);
      await c.query(`INSERT INTO funnel_stages (journey_id, position, name) VALUES ($1,0,'وعي')`, [funnelId]);
      const p = (await c.query(`INSERT INTO pages (journey_id, content, published, published_at) VALUES ($1,'{"h":"x"}',TRUE, now()) RETURNING id`, [funnelId])).rows[0].id;
      await c.query(`INSERT INTO tracked_links (code, journey_id, page_id, destination) VALUES ($1,$2,$3,'https://wa.me/201')`, ['ex-' + funnelId.slice(0, 8), funnelId, p]);
      await c.query(`INSERT INTO payment_methods (journey_id, method, account_details, customer_instructions) VALUES ($1,'instapay','acct','حوّل')`, [funnelId]);
      return p;
    });

    // 8) execution lock after → READY or WARN (no fail)
    const lock2 = await executionLock(a.tenantId, funnelId, manifest, { production: false });
    assert.ok(lock2.status === 'READY' || lock2.status === 'WARN', `expected READY/WARN, got ${lock2.status}: ${lock2.blocking.join('; ')}`);
    assert.equal(lock2.blocking.length, 0, 'no blocking checks after setup');

    // 17) rerun execution lock idempotently — same status, no state change in between
    const lock2b = await executionLock(a.tenantId, funnelId, manifest, { production: false });
    assert.equal(lock2b.status, lock2.status, 'execution lock is idempotent');

    // 9-10) first-signal protocol (script-generated → marked test) → seen in page_events
    const sig = await firstSignal(a.tenantId, funnelId, { scriptGenerated: true });
    assert.equal(sig.marked, true, 'script-generated signal is marked test');
    assert.ok(sig.seenIn.includes('page_events'), 'signal appears in page_events');
    assert.ok(sig.seenIn.includes('activation'), 'signal advanced activation');
    const markedRows = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM page_events WHERE visitor LIKE 'smoke:%'`)).rows[0].n);
    assert.ok(markedRows > 0, 'smoke signal is identifiable');

    // 11-12) a real lead advances activation
    await withTenant(a.tenantId, async (c) => { await c.query(`INSERT INTO leads (business_id, source, stage) VALUES ($1,'whatsapp','new')`, [businessId]); });

    // 14) daily check decision
    const dc = await dailyCheck(a.tenantId, funnelId);
    assert.ok(['CONTINUE', 'HOLD', 'NEEDS_CONFIGURATION'].includes(dc.decision.decision), `decision: ${dc.decision.decision}`);
    assert.notEqual(dc.decision.decision, 'ROLLBACK_OR_DISABLE');

    // 15) launch summary leaks no secrets, 16) no fabricated revenue/payment
    const summary = await launchSummary(a.tenantId, funnelId, manifest);
    const sumStr = JSON.stringify(summary);
    assert.ok(!/password|secret|token|stack|Error:/i.test(sumStr), 'launch summary is safe');
    assert.ok(!/revenue|إيراد محقّق|\$\d/i.test(sumStr), 'launch summary claims no revenue');
    assert.equal(summary.supportContact, 'support@fnnlr.app');
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('OPERATING ROOM: daily check is WARN/BLOCKED before setup, status leaks no secrets, week1 invents no revenue', async () => {
  const { dailyCheck, customerStatus, week1Review } = await import('../modules/operating-room/src/service.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'OR Customer' });
  try {
    const { businessId, funnelId } = await withTenant(a.tenantId, async (c) => {
      const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('OR Biz','EG') RETURNING id`)).rows[0].id;
      const fun = (await c.query(`INSERT INTO journeys (business_id, name, status) VALUES ($1,'F','active') RETURNING id`, [biz])).rows[0].id;
      return { businessId: biz, funnelId: fun };
    });

    // before any setup: activation not launch-ready → daily check is not PASS, gate needs config
    const d1 = await dailyCheck(a.tenantId, funnelId);
    assert.ok(d1.status === 'WARN' || d1.status === 'BLOCKED', `expected WARN/BLOCKED, got ${d1.status}`);
    assert.ok(['NEEDS_CONFIGURATION', 'HOLD', 'ROLLBACK_OR_DISABLE'].includes(d1.decision.decision), `gate: ${d1.decision.decision}`);

    // customer status leaks no secrets / stack traces
    const status = await customerStatus(a.tenantId, funnelId);
    const statusStr = JSON.stringify(status);
    assert.ok(!/password|secret|token|stack|Error:/i.test(statusStr), 'customer status is safe');
    assert.ok(Array.isArray(status.needsCustomerInput));

    // configure + publish so the funnel becomes launch-ready, add a real signal
    const pid = await withTenant(a.tenantId, async (c) => {
      await c.query(`INSERT INTO offers (journey_id, content) VALUES ($1,'{"promise":"x"}')`, [funnelId]);
      await c.query(`INSERT INTO funnel_stages (journey_id, position, name) VALUES ($1,0,'وعي')`, [funnelId]);
      const p = (await c.query(`INSERT INTO pages (journey_id, content, published, published_at) VALUES ($1,'{"h":"x"}',TRUE, now()) RETURNING id`, [funnelId])).rows[0].id;
      await c.query(`INSERT INTO tracked_links (code, journey_id, page_id, destination) VALUES ($1,$2,$3,'https://wa.me/201')`, ['or-' + funnelId.slice(0, 8), funnelId, p]);
      await c.query(`INSERT INTO payment_methods (journey_id, method, account_details) VALUES ($1,'instapay','acct')`, [funnelId]);
      await c.query(`INSERT INTO page_events (page_id, type, visitor) VALUES ($1,'view','v1')`, [p]);
      return p;
    });

    const d2 = await dailyCheck(a.tenantId, funnelId);
    // launch-ready + a real signal, no P0/P1 fabricated → CONTINUE
    assert.equal(d2.decision.decision, 'CONTINUE', `expected CONTINUE, got ${d2.decision.decision}`);

    // week1 review must NOT invent revenue (no payment amount recorded → null)
    const w = await week1Review(a.tenantId, funnelId);
    assert.equal(w.knownPaymentAmount, null, 'no fabricated revenue without a real amount');
    assert.equal(typeof w.totals.pageViews, 'number');
    assert.ok(w.firstSignalAt, 'first signal timestamp recorded from the real event');
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('CUSTOMER ZERO: config → setup → rerun (idempotent) → publish → smoke → lead → desk → safe snapshot', async () => {
  const { validateCustomerConfig } = await import('../modules/customer-zero/src/config.js');
  const { setupCustomerFromConfig } = await import('../modules/customer-zero/src/setup.js');
  const { smokeCustomer } = await import('../modules/customer-zero/src/smoke.js');
  const { customerSnapshot } = await import('../modules/customer-zero/src/support.js');

  const uniq = Date.now();
  const cfg: any = {
    workspaceName: `CZ WS ${uniq}`,
    ownerEmail: `cz${uniq}@example.com`,
    business: { name: `CZ Biz ${uniq}`, market: 'eg', language: 'masry' },
    whatsappNumber: '+201000000000',
    offer: { promise: 'وعد', price: '499', package: 'باقة' },
    payment: { method: 'instapay', accountDetails: 'cz@instapay', instructions: 'حوّل وابعت سكرين' },
    publicAppUrl: 'https://cz.app',
    createFunnel: true,
  };

  // 1) validate
  assert.equal(validateCustomerConfig(cfg, { production: false }).ok, true);

  // 2) setup, then 3) rerun — must be idempotent
  const first = await setupCustomerFromConfig(cfg, 'pw-cz-123456', { production: false });
  assert.equal(first.ok, true, JSON.stringify(first.blocking));
  assert.ok(first.tenantId && first.businessId && first.funnelId);
  const second = await setupCustomerFromConfig(cfg, 'pw-cz-123456', { production: false });
  assert.equal(second.tenantId, first.tenantId, 'same tenant reused');
  assert.equal(second.businessId, first.businessId, 'same business reused');
  assert.equal(second.funnelId, first.funnelId, 'same funnel reused');
  assert.equal(second.created.business, false, 'no duplicate business on rerun');
  assert.equal(second.created.funnel, false, 'no duplicate funnel on rerun');
  assert.equal(second.created.workspace, false, 'no duplicate workspace on rerun');

  const tenantId = first.tenantId!, funnelId = first.funnelId!;
  try {
    // no duplicate records from the rerun
    const counts = await withTenant(tenantId, async (c) => ({
      businesses: (await c.query(`SELECT COUNT(*)::int AS n FROM businesses WHERE name=$1`, [cfg.business.name])).rows[0].n,
      funnels: (await c.query(`SELECT COUNT(*)::int AS n FROM journeys WHERE business_id=$1`, [first.businessId])).rows[0].n,
      payments: (await c.query(`SELECT COUNT(*)::int AS n FROM payment_methods WHERE journey_id=$1`, [funnelId])).rows[0].n,
    }));
    assert.equal(counts.businesses, 1, 'exactly one business');
    assert.equal(counts.funnels, 1, 'exactly one funnel');
    assert.equal(counts.payments, 1, 'exactly one payment method (no duplicate from rerun)');

    // 5) publish a page (real record)
    const pageId = await withTenant(tenantId, async (c) => (await c.query(`INSERT INTO pages (journey_id, content, published, published_at) VALUES ($1,'{"h":"x"}',TRUE, now()) RETURNING id`, [funnelId])).rows[0].id);
    await withTenant(tenantId, async (c) => { await c.query(`INSERT INTO tracked_links (code, journey_id, page_id, destination) VALUES ($1,$2,$3,'https://wa.me/201')`, [`cz-${uniq}`, funnelId, pageId]); });

    // 6) smoke — creates a test-MARKED page view, never fake revenue
    const smoke = await smokeCustomer(tenantId, funnelId);
    assert.equal(smoke.ok, true, JSON.stringify(smoke.steps));
    const smokeView = await withTenant(tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM page_events WHERE visitor=$1`, ['smoke:customer-zero'])).rows[0].n);
    assert.ok(smokeView > 0, 'smoke event is present and identifiable by its marker');

    // 8) a real lead → 10) activation progresses
    await withTenant(tenantId, async (c) => { await c.query(`INSERT INTO leads (business_id, source, stage) VALUES ($1,'whatsapp','new')`, [first.businessId]); });
    const { getActivationStatus } = await import('../modules/activation/src/service.js');
    const act = await getActivationStatus(tenantId, funnelId);
    assert.ok(['traffic_ready', 'lead_ready'].includes(act.stage), `activation progressed: ${act.stage}`);

    // 12) support snapshot returns a safe summary, 13) no secrets
    const snap = await customerSnapshot(tenantId, funnelId);
    assert.ok(snap.activation && typeof snap.liveSignals.pageViews === 'number');
    const snapStr = JSON.stringify(snap);
    assert.ok(!/instapay@|password|secret|token/i.test(snapStr), 'snapshot leaks no secrets/credentials');
    // no fabricated revenue: snapshot reports counts, not money
    assert.ok(!('revenue' in snap), 'snapshot makes no revenue claim');
  } finally { await deleteTenant(tenantId); }
});

// ---------------------------------------------------------------------------
maybe('RELEASE SMOKE: empty DB → customer → funnel → published page → real signal → live desk', async () => {
  const { getActivationStatus } = await import('../modules/activation/src/service.js');
  const { getRevenueDesk } = await import('../modules/revenue-desk/src/service.js');
  const { ingestPageEvent } = await import('../modules/capture/src/service.js');
  const { runReleaseChecker } = await import('../modules/release/src/checker.js');
  const { tenantDiagnostics } = await import('../modules/release/src/admin.js');

  // release checker is reachable and produces a checklist on a live DB
  const rc = await runReleaseChecker({ probeProvisioning: false });
  assert.ok(Array.isArray(rc.checklist) && rc.checklist.length > 0, 'release checker produces a checklist');
  assert.ok(rc.checklist.some((l: any) => l.id === 'db:control'), 'release checker probes the control DB');

  const a = await provisionTenant({ type: 'individual', displayName: 'RC Customer' });
  try {
    // a real business + funnel (real empty records; the customer fills them in)
    const { businessId, funnelId } = await withTenant(a.tenantId, async (c) => {
      const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('RC Biz','EG') RETURNING id`)).rows[0].id;
      const fun = (await c.query(`INSERT INTO journeys (business_id, name, status) VALUES ($1,'F','active') RETURNING id`, [biz])).rows[0].id;
      return { businessId: biz, funnelId: fun };
    });
    assert.ok(funnelId, 'funnel created');

    // setup stage, desk in activation mode (no fake opportunities)
    let act = await getActivationStatus(a.tenantId, funnelId);
    assert.ok(['setup', 'publish_ready'].includes(act.stage));
    let desk = await getRevenueDesk(a.tenantId, funnelId) as any;
    assert.ok(desk.activationMode === true || desk.items.length === 0, 'no fabricated opportunities before observed data');

    // configure + publish + tracked link + payment (real records)
    const pid = await withTenant(a.tenantId, async (c) => {
      await c.query(`INSERT INTO offers (journey_id, content) VALUES ($1,'{"promise":"x"}')`, [funnelId]).catch(() => {});
      await c.query(`INSERT INTO funnel_stages (journey_id, position, name) VALUES ($1,0,'وعي')`, [funnelId]).catch(() => {});
      const p = (await c.query(`INSERT INTO pages (journey_id, content, published, published_at) VALUES ($1,'{"h":"x"}',TRUE, now()) RETURNING id`, [funnelId])).rows[0].id;
      await c.query(`INSERT INTO tracked_links (code, journey_id, page_id, destination) VALUES ($1,$2,$3,'https://wa.me/2010')`, ['rc-' + funnelId.slice(0, 8), funnelId, p]);
      await c.query(`INSERT INTO payment_methods (journey_id, method, account_details) VALUES ($1,'instapay','acct')`, [funnelId]);
      return p;
    });
    act = await getActivationStatus(a.tenantId, funnelId);
    assert.equal(act.launchReady, true, 'launch-ready after publish + link + payment');

    // first real signal → live mode
    await ingestPageEvent(a.tenantId, { pageId: pid, type: 'view', visitor: 'rc1' });
    act = await getActivationStatus(a.tenantId, funnelId);
    assert.equal(act.steps.find((s: any) => s.id === 'first_page_view_seen')!.status, 'done');

    // support diagnostics work (no secrets, counts only)
    const diag = await tenantDiagnostics(a.tenantId);
    assert.equal(typeof diag.businesses, 'number');
    assert.ok(Array.isArray(diag.latestRuns));
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('ACTIVATION: a real funnel goes from setup mode to live mode on observed signals', async () => {
  const { getActivationStatus } = await import('../modules/activation/src/service.js');
  const { getRevenueDesk } = await import('../modules/revenue-desk/src/service.js');
  const { ingestPageEvent } = await import('../modules/capture/src/service.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'Activate A' });
  try {
    // 1) brand-new business + funnel → setup stage, desk in activation mode
    const { businessId, funnelId, pageId } = await withTenant(a.tenantId, async (c) => {
      const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('Live Biz','EG') RETURNING id`)).rows[0].id;
      const fun = (await c.query(`INSERT INTO journeys (business_id, name, status) VALUES ($1,'F','active') RETURNING id`, [biz])).rows[0].id;
      return { businessId: biz, funnelId: fun, pageId: null as string | null };
    });
    let act = await getActivationStatus(a.tenantId, funnelId);
    assert.equal(act.stage, 'setup', 'new funnel is in setup');
    assert.equal(act.launchReady, false);

    let desk = await getRevenueDesk(a.tenantId, funnelId) as any;
    assert.equal(desk.activationMode, true, 'desk is in activation mode with no real signals');
    assert.ok(desk.items.every((i: any) => i.sourceType === 'activation'), 'desk shows activation steps, not fake opportunities');

    // 2) configure offer, blueprint, page (published), tracked link, payment
    const pid = await withTenant(a.tenantId, async (c) => {
      await c.query(`INSERT INTO offers (journey_id, content) VALUES ($1,'{"promise":"x"}')`, [funnelId]);
      await c.query(`INSERT INTO funnel_stages (journey_id, position, name) VALUES ($1,0,'الوعي')`, [funnelId]);
      const p = (await c.query(`INSERT INTO pages (journey_id, content, published, published_at) VALUES ($1,'{"headline":"x"}',TRUE, now()) RETURNING id`, [funnelId])).rows[0].id;
      await c.query(`INSERT INTO tracked_links (code, journey_id, page_id, destination) VALUES ($1,$2,$3,'https://wa.me/2010')`, ['code-' + funnelId.slice(0, 8), funnelId, p]);
      await c.query(`INSERT INTO payment_methods (journey_id, method, account_details) VALUES ($1,'instapay','acct')`, [funnelId]);
      return p;
    });
    act = await getActivationStatus(a.tenantId, funnelId);
    assert.equal(act.launchReady, true, 'after publish + link + payment, the funnel can receive a signal');
    assert.equal(act.stage, 'publish_ready');

    // 3) first real page view → live mode + traffic_ready
    await ingestPageEvent(a.tenantId, { pageId: pid, type: 'view', visitor: 'v1' });
    act = await getActivationStatus(a.tenantId, funnelId);
    assert.equal(act.steps.find((s: any) => s.id === 'first_page_view_seen')!.status, 'done', 'first page view is observed');
    assert.equal(act.stage, 'traffic_ready');

    // 4) a real lead → lead_ready
    await withTenant(a.tenantId, async (c) => { await c.query(`INSERT INTO leads (business_id, source, stage) VALUES ($1,'whatsapp','new')`, [businessId]); });
    act = await getActivationStatus(a.tenantId, funnelId);
    assert.equal(act.stage, 'lead_ready');
    assert.ok(act.readinessScore > 50, 'readiness climbs with real evidence');
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('SCALE: two concurrent lease acquisitions for the same job produce ONE run', async () => {
  const { acquireLease } = await import('../modules/scheduler/src/lease.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'Lease A' });
  try {
    await withTenant(a.tenantId, async (c) => { await c.query('SELECT 1'); }); // warm the pool first
    const [r1, r2] = await Promise.all([
      acquireLease(a.tenantId, 'daily_business_refresh', 'lease-key-1'),
      acquireLease(a.tenantId, 'daily_business_refresh', 'lease-key-1'),
    ]);
    const acquired = [r1, r2].filter((r) => r.acquired).length;
    assert.equal(acquired, 1, 'exactly one caller acquires the lease');
    const runs = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM scheduled_runs WHERE job_type='daily_business_refresh' AND idempotency_key='lease-key-1'`)).rows[0].n);
    assert.equal(runs, 1, 'only one scheduled_run row exists');
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('SCALE: a stuck run (expired lease) can be reclaimed and retried', async () => {
  const { acquireLease } = await import('../modules/scheduler/src/lease.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'Stuck A' });
  try {
    const first = await acquireLease(a.tenantId, 'daily_business_refresh', 'stuck-1', { leaseMs: 1 });
    assert.equal(first.acquired, true);
    // force the lease to be expired
    await withTenant(a.tenantId, async (c) => { await c.query(`UPDATE scheduled_runs SET lease_expires_at=now() - INTERVAL '1 minute' WHERE id=$1`, [first.runId]); });
    const retry = await acquireLease(a.tenantId, 'daily_business_refresh', 'stuck-1');
    assert.equal(retry.acquired, true, 'stuck run reclaimed after lease expiry');
    assert.equal(retry.runId, first.runId, 'same run row reused');
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('SCALE: fan-out continues after one business fails (failure isolation)', async () => {
  const { fanOutBusinesses } = await import('../modules/scheduler/src/fanout.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'Fan A' });
  try {
    const ids = await withTenant(a.tenantId, async (c) => {
      const out: string[] = [];
      for (const n of ['B1', 'B2', 'B3']) out.push((await c.query(`INSERT INTO businesses (name, market) VALUES ($1,'EG') RETURNING id`, [n])).rows[0].id);
      return out;
    });
    const failOn = ids[1];
    const result = await fanOutBusinesses(a.tenantId, 'daily_business_refresh', 'fan-key-1', async (_t, bizId) => {
      if (bizId === failOn) throw new Error('boom');
      return { ok: true };
    });
    assert.ok(result.total >= 3, 'all businesses targeted');
    assert.equal(result.failed, 1, 'one failed');
    assert.equal(result.succeeded, result.total - 1, 'every other business still ran');
    const batch = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT status, failed FROM scheduled_run_batches WHERE idempotency_key='fan-key-1'`)).rows[0]);
    assert.equal(batch.status, 'completed_with_errors');
    assert.equal(batch.failed, 1);
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('SCALE: a duplicate payment webhook (same external_id) is not processed twice', async () => {
  const { handlePaymentWebhook } = await import('../modules/integrations/src/service.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'Dup Pay' });
  try {
    const connId = await withTenant(a.tenantId, async (c) => {
      const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('D','EG') RETURNING id`)).rows[0].id;
      const fun = (await c.query(`INSERT INTO journeys (business_id, name) VALUES ($1,'F') RETURNING id`, [biz])).rows[0].id;
      return (await c.query(`INSERT INTO integration_connections (journey_id, business_id, provider, status) VALUES ($1,$2,'paymob','connected') RETURNING id`, [fun, biz])).rows[0].id;
    });
    const payload = JSON.stringify({ id: 'evt_777', obj: { success: true, amount_cents: 10000, order: { id: 'ref1' } } });
    await handlePaymentWebhook(a.tenantId, 'paymob', connId, payload, {});
    const dup = await handlePaymentWebhook(a.tenantId, 'paymob', connId, payload, {});
    assert.equal(dup.duplicate, true, 'second delivery flagged duplicate');
    const count = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM integration_events WHERE connection_id=$1 AND external_id='evt_777'`, [connId])).rows[0].n);
    assert.equal(count, 1, 'event stored exactly once');
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('SCALE: outbound retry schedules backoff then abandons after max attempts', async () => {
  const { processOutboundRetries } = await import('../modules/realtime/src/outbound.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'Retry A' });
  try {
    const connId = await withTenant(a.tenantId, async (c) => {
      const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('R','EG') RETURNING id`)).rows[0].id;
      const fun = (await c.query(`INSERT INTO journeys (business_id, name) VALUES ($1,'F') RETURNING id`, [biz])).rows[0].id;
      const conn = (await c.query(`INSERT INTO integration_connections (journey_id, business_id, provider, status, settings) VALUES ($1,$2,'outbound_webhook','connected',$3) RETURNING id`, [fun, biz, JSON.stringify({ url: 'http://127.0.0.1:9/none' })])).rows[0].id;
      // a delivery already at attempts = max-1, due now → next failure abandons it
      await c.query(`INSERT INTO webhook_deliveries (connection_id, event_type, url, status, attempts, max_attempts, next_retry_at) VALUES ($1,'lead_created','http://127.0.0.1:9/none','retrying',5,6, now() - INTERVAL '1 second')`, [conn]);
      return conn;
    });
    const out = await processOutboundRetries(a.tenantId, 10);
    assert.equal(out.attempted, 1);
    assert.equal(out.abandoned, 1, 'reaching max attempts abandons the delivery');
    const status = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT status FROM webhook_deliveries WHERE connection_id=$1`, [connId])).rows[0].status);
    assert.equal(status, 'abandoned');
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('SCALE: ops status + retries return structured counts', async () => {
  const { opsStatus, opsRetries, opsIngestion } = await import('../modules/scheduler/src/ops.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'Ops A' });
  try {
    const s = await opsStatus(a.tenantId);
    assert.ok(Array.isArray(s.runs24h));
    assert.equal(typeof s.stuckRuns, 'number');
    const r = await opsRetries(a.tenantId);
    assert.ok(Array.isArray(r.deliveriesByStatus));
    const i = await opsIngestion(a.tenantId);
    assert.equal(typeof i.integrationEvents1h, 'number');
  } finally { await deleteTenant(a.tenantId); }
});

// ---------------------------------------------------------------------------
maybe('SCHEDULER: running daily refresh twice does not inflate learning sample', async () => {
  const { dailyBusinessRefresh } = await import('../modules/scheduler/src/service.js');
  const a = await provisionTenant({ type: 'individual', displayName: 'Sched A' });
  try {
    // minimal business + funnel so the refresh has something to scan
    await withTenant(a.tenantId, async (c) => {
      const biz = (await c.query(`INSERT INTO businesses (name, market) VALUES ('S','EG') RETURNING id`)).rows[0].id;
      await c.query(`INSERT INTO journeys (business_id, name, status) VALUES ($1,'F','active')`, [biz]);
    });
    await dailyBusinessRefresh(a.tenantId).catch(() => null);
    const after1 = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM opportunity_learning_records`)).rows[0].n);
    await dailyBusinessRefresh(a.tenantId).catch(() => null);
    const after2 = await withTenant(a.tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM opportunity_learning_records`)).rows[0].n);
    assert.equal(after2, after1, 'second daily refresh must not add learning records');
  } finally { await deleteTenant(a.tenantId); }
});
