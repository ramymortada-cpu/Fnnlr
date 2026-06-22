# fnnlr — Commercial Packaging

> Honest packaging. Every claim here matches the product state proven in Sprints
> 31–42. fnnlr does **not** auto-send WhatsApp, does **not** process payments, and
> does **not** guarantee revenue. Recommendations and repairs require manual
> approval and are evidence-based. This is packaging only — there is no billing
> system and no automated pricing.

## One-line positioning
fnnlr is an Arabic-native, WhatsApp-first revenue operating system that helps a
business build a funnel, launch it, and see — from observed data — where revenue
is leaking, with human-approved fixes.

## Short pitch
You sell over WhatsApp and take payment manually (InstaPay, Vodafone Cash, bank
transfer, Fawry, cash). fnnlr gives you a hosted offer page, tracked WhatsApp
links, and a Revenue Desk that shows what to do next based on what actually
happened — not guesses. It instruments before it advises, and you approve every
change.

## Long pitch
Most funnel tools assume card checkout and automated messaging. In Egypt and the
Gulf, the real sales motion is a WhatsApp conversation and a manual transfer.
fnnlr is built for that motion. It builds the page and the tracked links, records
real signals (page views, WhatsApp clicks, leads, manual payment states), and
turns them into a Revenue Desk of evidence-based opportunities and repairs. It
ships with an activation flow, a go-live runner, an operating room for the first
week, and a friction-tested support pack. It does not send messages for you and
it does not move money — it tells you, with evidence, what is worth doing, and
acts only after you approve.

## What it replaces
- Spreadsheets and ad-hoc notes for tracking which funnel/offer is working.
- Guesswork about where leads drop off before paying.
- A scattered set of link shorteners, form tools, and manual reporting.

## What it connects to
- WhatsApp (Business API / BSP) for inbound signal — **manual-link-first**; a BSP
  webhook is optional and connected server-side, never trusted from the client.
- Local manual payment methods (Paymob, Fawry, InstaPay, Vodafone Cash, bank
  transfer) as **payment-state**, recorded — not processed.
- Outbound webhooks to your own systems (signed, delivery-logged).

## What remains manual (by design)
- Sending the WhatsApp message — fnnlr drafts; a human sends.
- Taking and confirming payment — fnnlr records the state; a human confirms.
- Approving recommendations and repairs — nothing destructive runs without you.

---

## fnnlr is
- An Arabic-native AI funnel builder.
- A WhatsApp-first revenue operating system.
- An evidence-based Revenue Desk.
- Activation + go-live + operating room for a first customer.
- Manual-payment-aware funnel ops.
- Human-approved recommendations and repairs.

## fnnlr is not
- An automatic WhatsApp sender. (It does **not** auto-send. It drafts; you send.)
- A payment processor. (It records manual payment state; it does **not** process
  payments and does **not** move money.)
- An ad platform.
- A full CRM replacement for every use case.
- A guaranteed-revenue machine. (There are **no guaranteed results**.)
- A fully self-serve enterprise platform yet.

---

## Packaging tiers (artifacts + limits only — not a billing system)

### Starter Activation
For a small business starting one funnel.
**Includes:** 1 business · 1 active funnel · hosted offer page · tracked WhatsApp
links · manual payment flow (recorded state) · Revenue Desk · activation support ·
weekly review.
**Limits:** no custom integrations · no automated WhatsApp send · no payment
processing.

### Growth Ops
For a business running multiple funnels.
**Includes:** multiple funnels · portfolio intelligence · scheduled rhythm ·
playbooks · evidence-based recommendations · operating-room support.
**Limits:** recommendations appear only with enough observed data · no automated
WhatsApp send · no payment processing · manual approval still required for every
change.

### Managed Launch
For the first 30 days, with guided setup.
**Includes:** setup runner · go-live runner · 72h monitor · week-1 review ·
support pack · customer-facing updates.
**Limits:** outcomes depend on the customer's traffic and response motion · no
guaranteed revenue of any kind · all limits above still apply.

## Light SLA (honest)
- Support is operator-assisted during the launch window agreed in the manifest.
- Blockers are surfaced, never hidden; P0/P1 issues carry an owner and a next
  action.
- "Ready" is only stated when the release checker, activation, operating room,
  and support snapshot all agree — never otherwise.

## Practical use, security & privacy (summary)
- Strict per-tenant isolation; no cross-tenant data access.
- Credentials are encrypted and fail-closed in production; secrets are never
  shown in any customer-facing output.
- See `CUSTOMER_AGREEMENT_DRAFT.md` for responsibilities and boundaries.
