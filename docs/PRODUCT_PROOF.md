# fnnlr — Product Proof

What fnnlr is, what it does, and the evidence behind each claim. Every claim maps
to a module/test in `EVIDENCE_INDEX.md`. No exaggerated claims.

## 1. What fnnlr is
An Arabic-native, WhatsApp-first revenue operating system for Egypt and the Gulf,
built around manual/local payment and an evidence-based Revenue Desk.

## 2. Core loop
Build → Launch → Track → Diagnose → Improve. fnnlr instruments before it advises:
it records real signals first, then surfaces evidence-based next steps.

## 3. Evidence-based funnel building
Hosted offer page, funnel stages, and tracked WhatsApp links (`modules/funnel`,
`modules/pages`). Funnels are real records, not throwaway generations.

## 4. WhatsApp-first capture
Tracked links and inbound signal feed leads and conversations
(`modules/capture`, `modules/whatsapp`, `modules/realtime`). fnnlr does **not**
auto-send — it drafts; a human sends.

## 5. Manual-payment-aware operations
Payment methods + recorded payment **state** (`modules/payments`). fnnlr does
**not** process payments and does not move money.

## 6. Revenue Desk
An evidence-based desk of opportunities; before any real signal it shows an
activation mode (explicitly "normal, not a failure"), never a fabricated
opportunity (`modules/revenue-desk`, `modules/opportunities`).

## 7. Opportunities / attribution / recommendations
Learning engines rate over decided outcomes only, gate confidence by sample size,
and never report high confidence on thin data (`modules/attribution`,
`modules/recommendations`). Every mutating recommendation requires approval.

## 8. Activation / go-live / operating room
Activation checklist + readiness, an execution lock that only says READY when all
gates agree, a go-live runner that refuses a BLOCKED lock, and a first-72h
operating room (`modules/activation`, `modules/execution`,
`modules/operating-room`). Proven on real Postgres.

## 9. Customer repeatability
A second customer runs through the same path with distinct tenants, idempotent
setup, and signal isolation (`modules/repeatability`). Proven on real Postgres.

## 10. What fnnlr explicitly does not do
No auto-send WhatsApp. No payment processing (manual payment state only). No
guaranteed revenue. No fully autonomous sales. No unconditional enterprise
readiness yet. Recommendations and repairs require human approval.

## 11. Proof table
See `EVIDENCE_INDEX.md` — each claim mapped to modules, tests, live DB proof, and
its limitation.

## 12. Known limits
- Revenue is known only when `payment_states.amount` exists; otherwise unknown,
  never estimated.
- Production deployment guards are proven; a managed-Postgres backup/restore drill
  must be run in the target environment before go-live.
- Learning/incident thresholds are sensible defaults pending real telemetry.
- No real customer traction is claimed; none is fabricated.
