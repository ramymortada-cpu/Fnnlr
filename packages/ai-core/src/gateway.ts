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

export interface BrainContext {
  tenantId: string;
  /** persists a versioned AIOutput row; returns its id */
  logOutput?: (row: { brain: string; promptVersion: string; content: unknown; costUsd?: number }) => Promise<string>;
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
    try {
      const res = await this.llm.complete({ system, user, maxTokens: 2000 });
      costUsd = res.costUsd;
      output = brain.parse(res.text);
    } catch {
      output = brain.fallback(input);
      degraded = true;
    }
    if (ctx.logOutput) {
      await ctx.logOutput({ brain: brain.name, promptVersion: brain.promptVersion, content: output, costUsd });
    }
    return { output, degraded };
  }
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
