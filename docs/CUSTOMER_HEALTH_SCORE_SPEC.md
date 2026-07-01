# Customer Health Score Spec

Purpose: detect retention risk before churn.

Status: `CONTRACT_READY`

Code evidence:

- `modules/operating-room/src/health-score.ts` computes health from activation, usage, signal, recommendation, support, and AI degradation evidence.
- `modules/operating-room/src/health-score.ts` also summarizes a customer portfolio into blocked, at-risk, watch, and expansion-ready groups.
- `modules/operating-room/src/readiness.ts` reviews customer health and support cadence readiness without overstating hosted operating proof.
- `tests/customer-health-score.test.ts` proves healthy, watch, at-risk, blocked, portfolio grouping, owner action, and expansion-readiness behavior.
- `tests/operating-cadence-readiness.test.ts` proves hosted issue-log evidence remains a gap before claiming the operating cadence is live-ready.
- Non-healthy scores always return an owner and a next action.

| Signal | Positive | Negative |
| --- | --- | --- |
| Activation | first workflow/page published | setup stuck |
| Usage | weekly workflow activity | no activity |
| Signals | leads/clicks/events received | no instrumentation |
| Recommendations | human-approved actions completed | recommendations ignored |
| Support | P0/P1 resolved on time | unresolved critical issue |
| AI spend | inside cap | cap exceeded or frequent degradation |

## Output

- `healthy`
- `watch`
- `at_risk`
- `blocked`

Every non-healthy score needs an owner and next action.

## Portfolio Review Contract

Weekly customer health review must produce:

- Total customer count.
- Status counts for `healthy`, `watch`, `at_risk`, and `blocked`.
- Blocked customer list with `P0` owner action.
- At-risk customer list with `P1` owner action.
- Watch customer list with `P2` owner action.
- Expansion-ready customer list only when the customer is healthy, active, instrumented, using recommendations, and not in AI degradation.
- Evidence requirement for every non-healthy action: customer health score, issue/support evidence, due date, and next review date.

Expansion is not allowed from a merely positive score. The customer must have weekly workflow activity, live signals, completed recommendations, no AI cap breach, and no degraded events.

## Scoring Contract

- `healthy`: score >= 75 with no P0/P1 blocker.
- `watch`: score >= 55 with owner and next action.
- `at_risk`: score < 55 without a hard blocker.
- `blocked`: unresolved critical issue or overdue P0/P1 support issue, regardless of numeric score.
