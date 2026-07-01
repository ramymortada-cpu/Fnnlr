# fnnlr — Pilot Offer Brief

## Target ICP

Arabic-first businesses where the revenue workflow already depends on WhatsApp,
manual/local payment, and a named human response owner.

## Fit Gate

Do not offer the pilot until the lead passes fit and expectation checks:

- WhatsApp selling motion exists or is clearly planned.
- Traffic source exists or is customer-owned and scheduled.
- Manual/local payment state is accepted.
- Customer has a response owner and payment confirmation owner.
- Customer accepts no auto-send, no payment processing, no guaranteed revenue,
  and no fake ROI.

## Pilot Scope

- Assisted setup.
- First hosted offer/workflow launch.
- Tracked WhatsApp link and first signal check.
- Revenue Desk evidence review.
- First-week operating review.
- Customer-safe proof pack if real evidence exists.

## Customer Responsibilities

- WhatsApp number.
- Offer details.
- Payment instructions.
- Traffic source.
- Response owner.
- Payment confirmation owner.
- Launch-window availability.

## Success Criteria

Pilot success means the product produced activation and operating evidence:

- Page/workflow live.
- Tracked link live.
- First observed event or explicit `MISSING_EVIDENCE`.
- First lead action or explicit blocker.
- Revenue Desk item with owner and next action.
- Week-1 review completed with honest outcome.

Revenue is reported only when real payment-state evidence exists. The pilot never
guarantees revenue, ROI, or sales.

## Boundaries

- fnnlr does not auto-send WhatsApp messages.
- fnnlr does not process payments or move money.
- fnnlr does not run destructive recommendations without approval.
- fnnlr does not claim GA approval until GateForge hosted evidence closes.
- fnnlr does not claim repeatable pilot readiness until hosted pilot evidence is
  attached.

## Owner Model

Before launch, name owners for:

- Sales owner.
- Setup owner.
- Support owner.
- Customer response owner.
- Payment confirmation owner.
- Rollback owner.

## Readiness Gate

Pilot offer readiness is `CONTRACT_READY_WITH_HOSTED_GAPS` until at least one
hosted pilot has customer-safe activation, operating-room, support, and
first-week proof attached.

Code evidence:

- `modules/sales-ops/src/pilot-offer-readiness.ts`
- `tests/pilot-offer-readiness.test.ts`
