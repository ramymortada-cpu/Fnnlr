# Usage Limit Enforcement Map

Purpose: connect commercial packaging to code enforcement.

Status: `CONTRACT_READY`

The commercial limit contract is implemented in `modules/commercial/src/limits.ts` and covered by `tests/commercial-limits.test.ts`. Route-level enforcement remains per-resource rollout work, but plan limits are no longer only a document.

Readiness evidence:

- `modules/commercial/src/enforcement-readiness.ts` defines the usage-limit enforcement readiness gate.
- `tests/commercial-enforcement-readiness.test.ts` proves fnnlr cannot claim full enforcement readiness while seat/workflow/contact/integration route-level proof remains partial.

| Limit | Plan source | Enforcement point | Status |
| --- | --- | --- | --- |
| Seats | `modules/commercial/src/limits.ts` | workspace member invite/create flow | `CONTRACT_READY` |
| Active workflows | `modules/commercial/src/limits.ts` | workflow create/publish flow | `CONTRACT_READY` |
| Contacts | `modules/commercial/src/limits.ts` | lead/contact import and create flow | `CONTRACT_READY` |
| Integrations | `modules/commercial/src/limits.ts` | connection create flow | `CONTRACT_READY` |
| AI tenant cap | `PRICING_AND_LIMITS_MATRIX.md` | AI gateway budget guard | `PARTIAL_CODE_READY` |
| AI global cap | operator config | AI gateway budget guard | `PARTIAL_CODE_READY` |
| Support tier | commercial plan | support workflow/SLA handling | `DOC_READY` |

## Required Tests

- Reject workflow creation above plan limit: `CONTRACT_TEST_READY`.
- Reject contact import above plan limit: `CONTRACT_TEST_READY`.
- Reject integration creation above plan limit: `CONTRACT_TEST_READY`.
- AI provider call is blocked over cap.
- Limit errors are user-safe and do not expose internal config.

## Contract Behavior

- Starter blocks above 2 seats, 3 active workflows, 2,000 contacts, 1 integration, and a 25 USD monthly AI budget posture.
- Growth blocks above 5 seats, 15 active workflows, 20,000 contacts, 3 integrations, and a 150 USD monthly AI budget posture.
- Scale blocks above 15 seats, 50 active workflows, 100,000 contacts, 8 integrations, and a 750 USD monthly AI budget posture.
- Enterprise returns `custom` limits and stays human-reviewed.
- Any blocked decision includes `PLAN_LIMIT_EXCEEDED` and an upgrade hint.

## Claim Gate

Do not claim "usage limits are fully enforced" until all required capabilities in `LIMIT_ENFORCEMENT_BASELINE` are `READY` or `CONTRACT_READY` with evidence attached. The plan-limit source and negative overage contract are ready; route-level enforcement for seats, workflows, contacts, and integrations remains partial until each guarded route has a negative acceptance test.
