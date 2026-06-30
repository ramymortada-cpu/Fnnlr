# Customer Health Score Spec

Purpose: detect retention risk before churn.

Status: `CONTRACT_READY`

Code evidence:

- `modules/operating-room/src/health-score.ts` computes health from activation, usage, signal, recommendation, support, and AI degradation evidence.
- `tests/customer-health-score.test.ts` proves healthy, watch, at-risk, and blocked behavior.
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

## Scoring Contract

- `healthy`: score >= 75 with no P0/P1 blocker.
- `watch`: score >= 55 with owner and next action.
- `at_risk`: score < 55 without a hard blocker.
- `blocked`: unresolved critical issue or overdue P0/P1 support issue, regardless of numeric score.
