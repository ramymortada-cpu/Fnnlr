# Customer Health Score Spec

Purpose: detect retention risk before churn.

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
