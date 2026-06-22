import type { ConditionNode, Leaf, RunContext } from './types.js';

/**
 * Safe condition evaluator. Evaluates a JSON rule tree against the run context.
 * No eval, no arbitrary code — only declarative comparisons. This is what makes
 * tenant-authored automations safe to run on the server.
 */

function getPath(ctx: RunContext, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, ctx as unknown);
}

function evalLeaf(leaf: Leaf, ctx: RunContext): boolean {
  const actual = getPath(ctx, leaf.field);
  const expected = leaf.value;
  switch (leaf.op) {
    case 'exists': return actual !== undefined && actual !== null;
    case 'eq': return actual === expected;
    case 'neq': return actual !== expected;
    case 'gt': return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte': return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt': return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte': return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'in': return Array.isArray(expected) && expected.includes(actual);
    case 'contains':
      if (typeof actual === 'string' && typeof expected === 'string') return actual.includes(expected);
      if (Array.isArray(actual)) return actual.includes(expected);
      return false;
    default: return false;
  }
}

export function evaluate(node: ConditionNode, ctx: RunContext): boolean {
  if ('all' in node) return node.all.every((n) => evaluate(n, ctx));
  if ('any' in node) return node.any.some((n) => evaluate(n, ctx));
  if ('not' in node) return !evaluate(node.not, ctx);
  return evalLeaf(node as Leaf, ctx);
}

/** Evaluate a list of top-level conditions as an implicit AND. */
export function evaluateAll(nodes: ConditionNode[], ctx: RunContext): boolean {
  return nodes.every((n) => evaluate(n, ctx));
}
