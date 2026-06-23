# AI Red Team Plan

Status: Recommendation based on repository evidence.

Evidence: AI code exists under `packages/ai-core/src/brains`; optional provider integration is in `packages/ai-core/src/llm.ts`; tests cover fallbacks and parsing, but no dedicated red-team suite was found.

Test categories: prompt injection, data exfiltration, unsafe output, hallucination, tool misuse, privacy leakage.

Metrics: refusal/containment rate, JSON validity, hallucination rate, unsafe claim rate, latency, cost per run.

Mitigations: prompt versioning, eval fixtures, output schema validation, proof/commercial checker integration, red-team CI job before enterprise launch.
