# fnnlr — Pilot Demo Guide

A practical, 10-minute walkthrough to show fnnlr to a pilot client in Egypt or the Gulf. Not a spec — just what to run and what to click.

## Run locally
```bash
cd code/fnnlr
npm install
# needs a PostgreSQL the app can CREATE DATABASE on (database-per-tenant):
export FNNLR_CONTROL_DB_URL="postgres://USER:PASS@localhost:5432/fnnlr_control"
export FNNLR_DB_ADMIN_URL="postgres://USER:PASS@localhost:5432/postgres"
# optional — real AI copy (everything also works without it via fallbacks):
export ANTHROPIC_API_KEY="sk-ant-..."
npm start            # serves the API + web app
```
Open the app, then click **🎬 جرّب مساحة ديمو جاهزة** on the login screen. (No DB? The product still runs; only the seeded demo and real persistence need Postgres.)

## Seed / login
- The demo button calls `POST /demo/seed` and logs you in automatically.
- Manual login: **demo@fnnlr.app** / **demo1234**.
- Reset anytime from the **إعادة ضبط الديمو** button on the dashboard banner (or `POST /demo/reset`).

## The demo scenario
A paid training program for Egyptian small-business owners — **أكاديمية نمو** — selling **Meta Ads → landing page → WhatsApp → InstaPay/Vodafone Cash**. The seed builds the whole funnel through the real services, so every tab has genuine data.

## 10-minute walkthrough — what to click
1. **Dashboard** — four revenue cards (biggest leak + fastest fix are live), and the **Action Center** ("اعمل إيه النهاردة؟") with real tasks: review a payment proof, chase waiting-payment leads, contact WhatsApp clickers. Filter by الدفع / واتساب / تسريبات.
2. **Open the funnel** → **Overview** shows the **Pilot Readiness checklist** at ~100%.
3. **العرض / خريطة القمع** — the AI-built offer and funnel stages, all editable.
4. **الصفحة** — a generated Arabic RTL landing page; open the **public page** (published) and show the sticky WhatsApp CTA on mobile.
5. **التتبّع** — the tracked WhatsApp link (42 clicks) with UTM + recent clicks timeline.
6. **العملاء** — leads across every stage; open one to see attribution, conversation, payment state, timeline, and the **Sales Copilot** suggested reply (copy / mark-sent — never auto-sent).
7. **الدفع** — local payment methods with generated instructions + the payment state machine.
8. **واتساب** — the full sales flow: 15+ templates incl. the objection library, with anti-spam (no-zann) metadata.
9. **التسريبات** — run diagnosis: biggest leak on top, 6 lanes, evidence on every finding, fastest fix + action links. (Seeded data shows waiting-payment, proof-not-reviewed, page-CTA, follow-up, and WhatsApp leaks.)
10. **التقرير** — generate the weekly diagnosis report; **انسخ النص** to share with the team.
11. **Command Bar** (bottom, ⌘) — try:
    - «هات العملاء المنتظرين الدفع» → filters leads
    - «اشرح أكبر تسريب» → explanation with evidence
    - «اكتب متابعة ناعمة للعملاء اللي سكتوا» → WhatsApp draft (no send)
    - «حسّن CTA صفحة الهبوط» → preview + apply/discard
    - «اعمل تقرير للفريق» → weekly report

## What value to show the client
- It doesn't just **build** the funnel — it **sees where revenue leaks**, from observed data, with evidence, and proposes the fastest fix.
- WhatsApp + local manual payment are treated as the spine of the sale, not an afterthought.
- One Arabic command bar operates the whole system, human-in-the-loop.

## Reset
**إعادة ضبط الديمو** on the banner, or `POST /demo/reset`. This rebuilds the demo workspace from scratch.

## Known limitations / credentials
- **No real WhatsApp sending** — fnnlr drafts and you send manually (no inbound API, no auto-send). A WhatsApp BSP token is needed later for sending.
- **No real payment gateway** — the payment *journey* is modeled (details → proof → review → confirm → deliver); no money moves.
- **AI**: with no `ANTHROPIC_API_KEY`, all brains fall back to practical Arabic templates (shown as "بدون AI"); the product is fully usable.
- **Postgres** with CREATE DATABASE rights is required for the seed and real persistence (database-per-tenant isolation).
