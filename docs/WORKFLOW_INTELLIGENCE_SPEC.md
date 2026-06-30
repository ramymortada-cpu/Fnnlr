# Workflow Intelligence Spec

Purpose: convert fnnlr AI usage and workflow outcomes into a compounding moat.

## Metrics

| Metric | Formula | Moat value |
| --- | --- | --- |
| `cost_per_workflow` | AI cost / workflows touched by AI | Keeps AI margin visible |
| `cost_per_successful_action` | AI cost / human-approved actions with positive outcome | Optimizes spend by outcome |
| `degraded_fallback_rate` | fallback responses / total AI requests | Measures provider resilience |
| `recommendation_capture_rate` | captured recommendations / decided recommendations | Learns what works |
| `template_success_rate` | activated templates / selected templates | Improves industry templates |

## Next Best Action v1 Rules

1. Never recommend a mutating action without evidence and human approval.
2. Rank P0 operational issues before growth suggestions.
3. Prefer actions with direct lead/workflow evidence.
4. Downgrade confidence when sample size is low.
5. Keep Arabic/local-market copy separate from global generic copy.

## Rubrics

### Follow-Up Quality Score

- Clear next step.
- Local Arabic tone.
- No false urgency.
- Payment/support boundary is honest.
- CTA is measurable.

### Lead Qualification Confidence

- Explicit need.
- Budget/payment readiness.
- Time urgency.
- Authority/decision-maker signal.
- Fit with supported industry template.

## Engineering Backlog

- Link `ai_usage_events` to workflow id where available.
- Link AI usage to recommendation/outcome id where available.
- Add dashboard for AI spend by tenant and workflow.
- Add tenant AI cap UI on top of existing budget guard.
