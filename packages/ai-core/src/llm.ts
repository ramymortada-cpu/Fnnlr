import type { LLMClient } from './gateway.js';

/**
 * Mock LLM client for deterministic tests — returns whatever JSON you give it,
 * so brain contracts can be tested with no network and no credentials.
 */
export function mockLLM(responder: (input: { system: string; user: string }) => string): LLMClient {
  return {
    async complete(input) { return { text: responder(input), costUsd: 0 }; },
  };
}

/** An LLM client that always throws — proves the brains' fallbacks work. */
export const failingLLM: LLMClient = {
  async complete() { throw new Error('LLM unavailable'); },
};

/**
 * Real Anthropic adapter (used in production). Reads ANTHROPIC_API_KEY from env.
 * Kept dependency-free (uses fetch) so the repo needs no SDK to compile.
 */
export function anthropicLLM(opts?: { model?: string; apiKey?: string }): LLMClient {
  const model = opts?.model ?? 'claude-sonnet-4-6';
  return {
    async complete({ system, user, maxTokens }) {
      const apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens ?? 2000,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
      const data = await res.json() as { content?: { text?: string }[] };
      const text = (data.content ?? []).map((b) => b.text ?? '').join('');
      return { text };
    },
  };
}
