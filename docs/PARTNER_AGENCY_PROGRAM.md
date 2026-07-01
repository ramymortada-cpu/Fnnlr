# Partner Agency Program

## Partner Fit

- Serves SMBs in Arabic-first or WhatsApp-heavy markets.
- Can provide onboarding and response operations.
- Accepts no guaranteed revenue language.
- Can follow security and data handling rules.
- Can name one owner for customer discovery, one owner for launch support, and one owner for support escalation.

## Partner Offer

- Repeatable industry templates.
- Assisted onboarding.
- Revenue Desk proof pack.
- Support triage process.
- Customer-safe case study template after real evidence exists.

## Partner Responsibilities

- Customer discovery.
- Content and offer inputs.
- Human message sending.
- Payment confirmation process.
- First-week operating review.

## Qualification Criteria

A partner is qualified only when they accept these boundaries:

- No guaranteed revenue, no fabricated ROI, and no claim that fnnlr processes payments.
- No automatic WhatsApp sending promise; humans approve and send customer messages.
- Customer data is handled under the agreed security, retention, and subprocessor posture.
- Any public customer proof requires customer approval or anonymization.
- P0/P1 issues have a named owner, next action, due date, and support escalation path.

## Readiness Gate

Partner distribution is `CONTRACT_READY_WITH_HOSTED_GAPS` until a real partner pilot has customer-safe hosted evidence. The code evidence is:

- `modules/proof/src/gtm-readiness.ts`
- `tests/gtm-proof-readiness.test.ts`

The public claim is allowed only when `hosted_partner_pilot_evidence` is `READY` and every required partner capability has evidence.
