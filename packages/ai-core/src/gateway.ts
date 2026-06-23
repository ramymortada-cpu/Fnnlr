/**
 * AI gateway + Brain base.
 *
 * Every AI capability in fnnlr is a typed Brain behind this gateway — never a
 * giant inline prompt. The LLM call goes through an injected `LLMClient`, so:
 *  - production passes a real Anthropic/OpenAI client,
 *  - tests pass a mock that returns fixed JSON (deterministic, no network, no creds).
 *
 * Every run is logged to the tenant's `ai_outputs` table (versioned), which the
 * Offer/Page builders read back and let the user edit.
 */

export interface LLMClient {
  /** Returns the model's raw text completion for a system+user prompt. */
  complete(input: { system: string; user: string; maxTokens?: number }): Promise<{ text: string; costUsd?: number }>;
}

export interface AIUsageEvent {
  tenantId: string;
  brain: string;
  provider?: string;
  model?: string;
  estimatedTokens?: number;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  status: 'allowed' | 'blocked' | 'degraded';
  degradationReason?: string;
}

export interface BrainContext {
  tenantId: string;
  /** persists a versioned AIOutput row; returns its id */
  logOutput?: (row: { brain: string; promptVersion: string; content: unknown; costUsd?: number; status?: AIUsageEvent['status']; degradationReason?: string }) => Promise<string>;
  /** records provider spend/safety events without storing prompts or outputs */
  logUsage?: (row: AIUsageEvent) => Promise<void>;
}

export interface Brain<I, O> {
  readonly name: string;
  readonly promptVersion: string;
  /** Build the prompt from typed input. */
  buildPrompt(input: I): { system: string; user: string };
  /** Parse + validate the raw LLM text into typed output. Throws on invalid. */
  parse(raw: string): O;
  /** A safe fallback if the LLM fails or returns garbage. */
  fallback(input: I): O;
}

export class AIGateway {
  constructor(private llm: LLMClient) {}

  async run<I, O>(brain: Brain<I, O>, input: I, ctx: BrainContext): Promise<{ output: O; degraded: boolean }> {
    const { system, user } = brain.buildPrompt(input);
    let output: O;
    let degraded = false;
    let costUsd: number | undefined;
    let degradationReason: string | undefined;
    const estimatedTokens = estimateTokens(system, user, 2000);
    const estimatedCostUsd = estimateCostUsd(estimatedTokens);
    try {
      const budget = evaluateBudget(ctx.tenantId, estimatedCostUsd);
      if (!budget.allowed) {
        degradationReason = budget.reason;
        throw new Error(budget.reason);
      }
      await ctx.logUsage?.({
        tenantId: ctx.tenantId, brain: brain.name, estimatedTokens, estimatedCostUsd,
        status: 'allowed',
      });
      const res = await this.llm.complete({ system, user, maxTokens: 2000 });
      costUsd = res.costUsd;
      output = brain.parse(res.text);
    } catch (e) {
      output = brain.fallback(input);
      degraded = true;
      degradationReason = degradationReason ?? ((e as Error).message || 'llm failed');
      await ctx.logUsage?.({
        tenantId: ctx.tenantId, brain: brain.name, estimatedTokens, estimatedCostUsd,
        actualCostUsd: costUsd, status: 'degraded', degradationReason,
      });
    }
    if (ctx.logOutput) {
      await ctx.logOutput({ brain: brain.name, promptVersion: brain.promptVersion, content: output, costUsd, status: degraded ? 'degraded' : 'allowed', degradationReason });
    }
    return { output, degraded };
  }
}

export function estimateTokens(system: string, user: string, maxTokens: number): number {
  return Math.ceil((system.length + user.length) / 4) + maxTokens;
}

export function estimateCostUsd(tokens: number): number {
  const perMillion = Number(process.env.FNNLR_AI_ESTIMATED_USD_PER_1M_TOKENS || '15');
  if (!Number.isFinite(perMillion) || perMillion < 0) return 0;
  return (tokens / 1_000_000) * perMillion;
}

export function evaluateBudget(tenantId: string, estimatedCostUsd: number): { allowed: boolean; reason?: string } {
  if (process.env.FNNLR_AI_KILL_SWITCH === 'true') return { allowed: false, reason: 'ai kill switch enabled' };
  const requireBudget = process.env.NODE_ENV === 'production' || process.env.FNNLR_AI_REQUIRE_BUDGET === 'true';
  const tenantCap = Number(process.env.FNNLR_AI_TENANT_DAILY_USD_CAP || '');
  const globalCap = Number(process.env.FNNLR_AI_GLOBAL_DAILY_USD_CAP || '');
  if (requireBudget && (!Number.isFinite(tenantCap) || tenantCap <= 0) && (!Number.isFinite(globalCap) || globalCap <= 0)) {
    return { allowed: false, reason: 'ai budget cap required' };
  }
  if (Number.isFinite(tenantCap) && tenantCap > 0 && estimatedCostUsd > tenantCap) {
    return { allowed: false, reason: `tenant ai cap would be exceeded for ${tenantId}` };
  }
  if (Number.isFinite(globalCap) && globalCap > 0 && estimatedCostUsd > globalCap) {
    return { allowed: false, reason: 'global ai cap would be exceeded' };
  }
  return { allowed: true };
}

/** Helper: extract a JSON object from an LLM response that may wrap it in prose/fences. */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object found');
  return JSON.parse(candidate.slice(start, end + 1));
}
