# Workflow Intelligence Spec

Purpose: convert fnnlr AI usage and workflow outcomes into a compounding moat.

Status: `CONTRACT_READY`

Code evidence:

- `packages/db/tenant/migrations/0031_ai_workflow_intelligence.sql` adds optional `workflow_id`, `outcome_id`, and `outcome_status` linkage to `ai_usage_events`.
- `packages/ai-core/src/gateway.ts` exposes optional workflow/outcome fields on `AIUsageEvent`.
- `modules/ai-ops/src/workflow-intelligence.ts` computes workflow intelligence metrics from AI usage events.
- `modules/ai-ops/src/workflow-intelligence.ts` ranks next-best-action candidates and scores follow-up quality.
- `tests/workflow-intelligence.test.ts` proves the metrics stay honest when linkage evidence is missing, P0 operational issues rank before growth suggestions, mutating recommendations require human approval, and Arabic follow-up quality is measurable.

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

Implementation status: `CONTRACT_READY` via `rankNextBestActions`.

## Rubrics

### Follow-Up Quality Score

- Clear next step.
- Local Arabic tone.
- No false urgency.
- Payment/support boundary is honest.
- CTA is measurable.

Implementation status: `CONTRACT_READY` via `scoreFollowUpQuality`.

### Lead Qualification Confidence

- Explicit need.
- Budget/payment readiness.
- Time urgency.
- Authority/decision-maker signal.
- Fit with supported industry template.

## Engineering Backlog

- Wire workflow ids from workflow/funnel routes into `AIUsageEvent.workflowId`.
- Wire recommendation/outcome ids into `AIUsageEvent.outcomeId` and `AIUsageEvent.outcomeStatus`.
- Add dashboard for AI spend by tenant and workflow using `computeWorkflowIntelligenceMetrics`.
- Add tenant AI cap UI on top of existing budget guard.
