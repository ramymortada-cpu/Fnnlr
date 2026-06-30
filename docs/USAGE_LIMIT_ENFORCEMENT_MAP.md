# Usage Limit Enforcement Map

Purpose: connect commercial packaging to code enforcement.

| Limit | Plan source | Enforcement point | Status |
| --- | --- | --- | --- |
| Seats | `PRICING_AND_LIMITS_MATRIX.md` | workspace member invite/create flow | `NEXT` |
| Active workflows | `PRICING_AND_LIMITS_MATRIX.md` | workflow create/publish flow | `NEXT` |
| Contacts | `PRICING_AND_LIMITS_MATRIX.md` | lead/contact import and create flow | `NEXT` |
| Integrations | `PRICING_AND_LIMITS_MATRIX.md` | connection create flow | `NEXT` |
| AI tenant cap | `PRICING_AND_LIMITS_MATRIX.md` | AI gateway budget guard | `PARTIAL_CODE_READY` |
| AI global cap | operator config | AI gateway budget guard | `PARTIAL_CODE_READY` |
| Support tier | commercial plan | support workflow/SLA handling | `DOC_READY` |

## Required Tests

- Reject workflow creation above plan limit.
- Reject contact import above plan limit.
- Reject integration creation above plan limit.
- AI provider call is blocked over cap.
- Limit errors are user-safe and do not expose internal config.
