# AI Brain and Intelligent Engines Report

Claim: AI is optional and degrades to deterministic fallbacks
Evidence: packages/ai-core/src/llm.ts; packages/ai-core/src/brains; tests/brains.test.ts
Analysis: Brains parse LLM JSON where available and fall back when missing/failing.
Risk: No formal eval/red-team/cost telemetry found.
Recommendation: Add eval harness, prompt registry, token/cost logging, red-team suite.
Confidence: High

See AI_SYSTEM_INVENTORY and AI_PIPELINE diagram.
