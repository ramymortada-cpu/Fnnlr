# fnnlr Pricing and Limits Matrix

This is a commercial packaging matrix with a code-level enforcement contract. The source-of-truth profile lives in `modules/commercial/src/limits.ts`, and acceptance coverage lives in `tests/commercial-limits.test.ts`. API route enforcement is still rolled out per resource path before self-serve GA.

Usage-enforcement claim gate lives in `modules/commercial/src/enforcement-readiness.ts` and `tests/commercial-enforcement-readiness.test.ts`. This keeps pricing claims honest: plan limits are contract-ready, while full route-level enforcement remains gap-labeled until every guarded route has negative overage proof.

| Plan | Target customer | Seats | Active workflows | Contacts | Integrations | AI budget posture | Support |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| Starter | One business proving first revenue workflow | 2 | 3 | 2,000 | 1 | Low capped tenant budget: `$25/mo` | Email/async launch support |
| Growth | Business running multiple campaigns | 5 | 15 | 20,000 | 3 | Medium capped tenant budget: `$150/mo` | Priority support and monthly review |
| Scale | Larger operator or agency pod | 15 | 50 | 100,000 | 8 | Higher capped tenant budget with review: `$750/mo` | Priority support and operating review |
| Enterprise | Regulated, multi-team, or procurement-led account | Custom | Custom | Custom | Custom | Contracted cap and governance | SLA, security review, procurement packet |

## Enforcement Backlog

| Limit | Required enforcement point | Status |
| --- | --- | --- |
| Seats | Workspace membership creation and invitation flow | `CONTRACT_READY` |
| Workflows | Workflow creation/publish path | `CONTRACT_READY` |
| Contacts | Lead/contact import and creation path | `CONTRACT_READY` |
| Integrations | Connection creation path | `CONTRACT_READY` |
| AI budget | AI gateway and tenant/global caps | `PARTIAL_CODE_READY` |
| Support tier | Customer success operating workflow | `DOC_READY` |

## Acceptance Evidence

- `modules/commercial/src/limits.ts` defines the Starter, Growth, Scale, and Enterprise resource limits.
- `tests/commercial-limits.test.ts` blocks drift between the public packaging matrix and the code source of truth.
- `modules/commercial/src/enforcement-readiness.ts` blocks full enforcement claims while route-level proof is partial.
- `tests/commercial-enforcement-readiness.test.ts` covers the enforcement readiness decision.
- Over-limit decisions return `PLAN_LIMIT_EXCEEDED` with the next upgrade path.
- Enterprise remains `custom` and requires human review before contract signature.

## Commercial Guardrails

- No guaranteed revenue claim.
- No auto-send claim.
- No payment-processing claim.
- Paid onboarding is a repeatable service package, not proof of product-market fit.
- Enterprise plan requires legal/security human review before signature.
