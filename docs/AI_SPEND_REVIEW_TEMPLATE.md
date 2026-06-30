# AI Spend Review Template

Status: `CONTRACT_READY`

Code evidence:

- `modules/ai-ops/src/workflow-intelligence.ts` computes total AI cost, cost per workflow, cost per successful action, and degraded fallback rate.
- `modules/ai-ops/src/spend-review.ts` converts spend metrics into `IN_BUDGET`, `WATCH`, or `COST_RESCUE`.
- `tests/workflow-intelligence.test.ts` verifies controlled spend, budget overrun rescue, kill-switch degradation, and missing successful-action evidence.

Default thresholds:

| Threshold | Value |
| --- | ---: |
| Monthly AI budget | `$500` |
| Maximum cost per successful action | `$0.35` |
| Maximum degraded fallback rate | `10%` |
| Maximum kill-switch activations | `0` |

## Period

- Start:
- End:

## Summary

| Metric | Value |
| --- | --- |
| Total AI cost |  |
| Cost per tenant |  |
| Cost per workflow |  |
| Cost per successful action |  |
| Degraded fallback rate |  |
| Kill-switch activations |  |

## Decisions

- Cap changes:
- Model/provider changes:
- Prompt/workflow optimization:
- Customer communication needed:

## Rescue Rules

The review is `COST_RESCUE` when:

- monthly budget is exceeded
- successful-action cost evidence is missing
- three or more spend blockers are open

The review is `WATCH` when:

- budget utilization reaches `85%`
- cost per successful action exceeds the threshold
- degraded fallback rate exceeds the threshold
- any kill-switch activation is detected

Every action must include owner, action, and evidence required for the next monthly review.
