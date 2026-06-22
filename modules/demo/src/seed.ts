import { signup } from '../../auth/src/service.js';
import { withTenant, getControlPool } from '../../../packages/db/src/router.js';
import { createFunnelFromOnboarding } from '../../funnel/src/service.js';
import { generatePage, publishPage } from '../../pages/src/service.js';
import { createTrackedLink } from '../../capture/src/service.js';
import { generatePaymentFlow } from '../../payments/src/service.js';
import { generateWhatsAppFlow } from '../../whatsapp/src/service.js';
import { runDiagnosis } from '../../leaks/src/service.js';
import { refreshActions } from '../../actions/src/service.js';
import { generateReport } from '../../reports/src/service.js';
import { mockLLM } from '../../../packages/ai-core/src/llm.js';
import type { OnboardingInput } from '../../../packages/ai-core/src/contracts.js';

/**
 * Demo seed — builds a complete, realistic Egyptian funnel workspace by driving
 * the REAL services (not raw inserts where a service exists), so the demo
 * exercises the same code paths a pilot user would. Uses the mock LLM so it
 * works with no API key. Scenario: a paid training program for small-business
 * owners in Egypt, selling Meta Ads → landing page → WhatsApp → InstaPay/Vodafone Cash.
 */

export const DEMO_EMAIL = 'demo@fnnlr.app';
export const DEMO_PASSWORD = 'demo1234';

const llm = mockLLM(({ system, user }) => {
  const prompt = system + ' ' + user;
  // The mock returns reasonable JSON per brain by sniffing the prompt; brains
  // fall back to their own templates if parsing fails, so this stays robust.
  if (prompt.includes('FunnelArchitect') || prompt.includes('funnel stages')) {
    return JSON.stringify({
      funnelType: 'تدريب مدفوع عبر واتساب',
      stages: [
        { name: 'إعلان Meta', purpose: 'جذب', channel: 'meta', conversionEvent: 'click', assetsNeeded: ['كرييتف'], expectedLeak: 'ضعف الاستهداف', trackingRequirement: 'UTM' },
        { name: 'صفحة هبوط', purpose: 'إقناع', channel: 'page', conversionEvent: 'whatsapp_click', assetsNeeded: ['صفحة'], expectedLeak: 'CTA ضعيف', trackingRequirement: 'page events' },
        { name: 'واتساب', purpose: 'إغلاق', channel: 'whatsapp', conversionEvent: 'contacted', assetsNeeded: ['flow'], expectedLeak: 'بطء الرد', trackingRequirement: 'tracked link' },
        { name: 'دفع محلي', purpose: 'تحصيل', channel: 'payment', conversionEvent: 'paid', assetsNeeded: ['طرق دفع'], expectedLeak: 'انتظار طويل', trackingRequirement: 'payment states' },
      ],
      narrative: 'قمع تدريب يبيع من Meta لواتساب لدفع محلي.',
    });
  }
  return '{}'; // other brains fall back to their built-in Arabic templates
});

export interface SeedResult {
  token: string;
  tenantId: string;
  journeyId: string;
  pageSlug: string | null;
  linkCode: string;
}

export async function seedDemo(): Promise<SeedResult> {
  // Clean any prior demo so the seed is idempotent.
  await destroyDemo().catch(() => {});

  // 1) user + tenant + workspace via the real signup path.
  const { token, ctx } = await signup({
    email: DEMO_EMAIL, password: DEMO_PASSWORD, businessName: 'أكاديمية نمو', type: 'individual',
  });
  const tenantId = ctx.tenantId;
  const businessId = await withTenant(tenantId, async (c) =>
    (await c.query(`SELECT id FROM businesses ORDER BY created_at LIMIT 1`)).rows[0].id as string);

  // 2) funnel from onboarding (real brains, mock LLM → falls back to templates).
  const onboarding: OnboardingInput = {
    businessName: 'أكاديمية نمو', market: 'eg',
    sells: 'برنامج تدريبي مدفوع لأصحاب المشاريع الصغيرة', productType: 'course',
    priceRange: '4000 ج.م', targetCustomer: 'أصحاب مشاريع صغيرة في مصر',
    trafficSource: 'Meta Ads', salesChannel: 'whatsapp',
    paymentMethods: ['instapay', 'vodafone_cash', 'bank_transfer'],
    tone: 'egyptian_friendly', salesTeamSize: 2, hasPage: false, hasWhatsApp: true,
    goal: 'أبيع ٢٠ مقعد في الشهر',
  };
  const funnel = await createFunnelFromOnboarding(tenantId, businessId, onboarding, llm);
  const journeyId = funnel.journeyId;

  // 3) landing page → publish.
  await generatePage(tenantId, journeyId, llm);
  const pub = await publishPage(tenantId, journeyId, 'https://wa.me/201000000000');
  // register page slug in control-plane (publish does this via API; do it here too)
  if (pub) {
    const { registerPublicCode } = await import('../../capture/src/resolver.js');
    await registerPublicCode(pub.slug, 'page', tenantId);
  }

  // 4) tracked WhatsApp link.
  const link = await createTrackedLink(tenantId, {
    journeyId, destinationPhone: '201000000000', messageTemplate: 'عايز أعرف تفاصيل برنامج نمو',
    source: 'meta', medium: 'paid', campaign: 'launch-june', ctaLabel: 'كلمنا على واتساب',
  });

  // 5) payment methods + copy, and whatsapp flow.
  await generatePaymentFlow(tenantId, journeyId, llm);
  await generateWhatsAppFlow(tenantId, journeyId, llm);

  // 6) realistic leads across stages + page events + payment + drafts.
  await seedLeadsAndEvents(tenantId, journeyId, link.code, pub?.slug ?? null);

  // 7) run diagnosis, actions, report — so the board/center/report are populated.
  await runDiagnosis(tenantId, journeyId);
  await refreshActions(tenantId, journeyId);
  await generateReport(tenantId, journeyId, llm);

  // 8) a couple of command-history examples.
  await withTenant(tenantId, async (c) => {
    for (const [text, intent, rt] of [
      ['هات العملاء المنتظرين الدفع', 'find_waiting_payment_leads', 'navigation'],
      ['اشرح أكبر تسريب', 'explain_biggest_leak', 'informational'],
    ] as const) {
      await c.query(`INSERT INTO commands (journey_id, command_text, intent, confidence, result_type, status) VALUES ($1,$2,$3,'high',$4,'proposed')`,
        [journeyId, text, intent, rt]);
    }
  });

  // mark the workspace as demo in the control plane.
  await getControlPool().query(
    `UPDATE workspaces SET name = name WHERE tenant_id=$1`, [tenantId]); // no-op placeholder; demo flagged by email

  return { token, tenantId, journeyId, pageSlug: pub?.slug ?? null, linkCode: link.code };
}

async function seedLeadsAndEvents(tenantId: string, journeyId: string, linkCode: string, slug: string | null) {
  await withTenant(tenantId, async (c) => {
    const biz = (await c.query(`SELECT id FROM businesses ORDER BY created_at LIMIT 1`)).rows[0].id;
    const page = (await c.query(`SELECT id FROM pages WHERE journey_id=$1 LIMIT 1`, [journeyId])).rows[0]?.id;

    // page events: 120 views, decreasing funnel
    if (page) {
      const ev = (t: string, n: number) => Array.from({ length: n }).map(() =>
        c.query(`INSERT INTO page_events (page_id, type, visitor) VALUES ($1,$2,$3)`, [page, t, 'v' + Math.random()]));
      await Promise.all([...ev('page_view', 120), ...ev('scroll_depth', 70), ...ev('price_reached', 35), ...ev('cta_clicked', 9), ...ev('whatsapp_clicked', 14)]);
    }

    // tracked link clicks count
    await c.query(`UPDATE tracked_links SET clicks=42 WHERE code=$1`, [linkCode]);

    const names = ['أحمد محمود', 'سارة علي', 'محمد حسن', 'منى خالد', 'كريم سمير', 'ياسمين فؤاد', 'عمرو زكي', 'هبة ناصر', 'طارق فهمي', 'دينا رؤوف', 'وليد عبده', 'نهى جمال'];
    // stage distribution showing real leaks
    const plan: { stage: string; payment?: string; proof?: boolean; reviewed?: boolean; lost?: string; ageH?: number; contacted?: boolean }[] = [
      { stage: 'whatsapp_clicked', ageH: 30 }, { stage: 'whatsapp_clicked', ageH: 48 }, { stage: 'whatsapp_clicked', ageH: 72 },
      { stage: 'contacted' }, { stage: 'qualified' },
      { stage: 'price_sent' },
      { stage: 'waiting_payment', payment: 'waiting_payment', ageH: 50 }, { stage: 'waiting_payment', payment: 'waiting_payment', ageH: 26 },
      { stage: 'proof_uploaded', payment: 'proof_uploaded', proof: true, reviewed: false },
      { stage: 'paid', payment: 'confirmed' },
      { stage: 'access_delivered', payment: 'access_delivered' },
      { stage: 'lost', lost: 'السعر عالي' },
    ];

    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      const changedAt = `now() - interval '${p.ageH ?? 2} hours'`;
      const lead = await c.query(
        `INSERT INTO leads (business_id, funnel_id, name, source, medium, campaign, attribution, stage,
            link_code, payment_status, lost_reason, first_touch_at, last_touch_at, stage_changed_at, next_action)
         VALUES ($1,$2,$3,'meta','paid','launch-june',$4,$5,$6,$7,$8, now()-interval '3 days', now(), ${changedAt}, $9) RETURNING id`,
        [biz, journeyId, names[i], JSON.stringify({ source: 'meta', campaign: 'launch-june', code: linkCode }),
         p.stage, linkCode, p.payment ?? null, p.lost ?? null,
         p.stage === 'whatsapp_clicked' ? null : 'متابعة'],
      );
      const leadId = lead.rows[0].id;
      await c.query(`INSERT INTO conversations (business_id, lead_id, funnel_id, channel, source_link_code, status, first_event_at, last_event_at)
        VALUES ($1,$2,$3,'whatsapp',$4,'opened', now()-interval '3 days', now())`, [biz, leadId, journeyId, linkCode]);
      if (p.payment) {
        await c.query(`INSERT INTO payment_states (lead_id, method, state, amount, proof_received, reviewed_at, access_delivered, state_changed_at)
          VALUES ($1,'instapay',$2,4000,$3,$4,$5, ${changedAt})`,
          [leadId, p.payment, p.proof ?? false, p.reviewed ? 'now()' : null, p.payment === 'access_delivered']);
        await c.query(`INSERT INTO payment_state_history (lead_id, from_state, to_state) VALUES ($1,'waiting_payment',$2)`, [leadId, p.payment]);
      }
      // a follow-up task, some overdue
      if (p.stage === 'waiting_payment' || p.stage === 'needs_followup') {
        await c.query(`INSERT INTO tasks (lead_id, funnel_id, kind, title, due_at) VALUES ($1,$2,'whatsapp_followup','تابع الدفع', now()-interval '1 day')`, [leadId, journeyId]);
      }
    }
  });
}

/** Remove the demo workspace + tenant entirely (for reset). */
export async function destroyDemo(): Promise<void> {
  const control = getControlPool();
  const u = await control.query(`SELECT id FROM users WHERE email=$1`, [DEMO_EMAIL]);
  if (!u.rowCount) return;
  const userId = u.rows[0].id;
  const ws = await control.query(
    `SELECT w.id, w.tenant_id FROM workspaces w
       JOIN workspace_members m ON m.workspace_id=w.id
      WHERE m.user_id=$1`, [userId]);
  for (const row of ws.rows) {
    // Best-effort: drop the tenant's physical database, then its control rows.
    try {
      const control2 = getControlPool();
      const t = await control2.query(`SELECT db_name FROM tenants WHERE id=$1`, [row.tenant_id]);
      const dbName = t.rows[0]?.db_name as string | undefined;
      if (dbName) await control2.query(`DROP DATABASE IF EXISTS "${dbName}"`).catch(() => {});
    } catch { /* best effort */ }
    await control.query(`DELETE FROM public_codes WHERE tenant_id=$1`, [row.tenant_id]).catch(() => {});
    await control.query(`DELETE FROM workspaces WHERE id=$1`, [row.id]).catch(() => {});
    await control.query(`DELETE FROM tenants WHERE id=$1`, [row.tenant_id]).catch(() => {});
  }
  await control.query(`DELETE FROM sessions WHERE user_id=$1`, [userId]).catch(() => {});
  await control.query(`DELETE FROM users WHERE id=$1`, [userId]).catch(() => {});
}
