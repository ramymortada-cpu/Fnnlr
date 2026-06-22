import type { AutomationDef } from '../types.js';

/**
 * Safety guard — protects the customer relationship (fnnlr's core asset).
 * Existing engines happily blast; this one enforces no-zann limits.
 */

export interface RunHistory {
  runsForEntity: number;          // how many times this automation ran for this entity
  lastRunAt: Date | null;         // last time it ran for this entity
}

export interface GuardResult { allowed: boolean; reason: string; }

export function checkSafety(
  def: AutomationDef,
  history: RunHistory,
  now: Date,
): GuardResult {
  // Max-runs-per-entity: never nag the same person beyond the cap.
  if (def.maxRunsPerEntity != null && history.runsForEntity >= def.maxRunsPerEntity) {
    return { allowed: false, reason: `max runs per entity reached (${def.maxRunsPerEntity})` };
  }

  // Cooldown: enforce a quiet period between runs for the same entity.
  if (def.cooldownSeconds != null && history.lastRunAt) {
    const elapsed = (now.getTime() - history.lastRunAt.getTime()) / 1000;
    if (elapsed < def.cooldownSeconds) {
      return { allowed: false, reason: `cooldown active (${Math.round(def.cooldownSeconds - elapsed)}s left)` };
    }
  }

  return { allowed: true, reason: 'ok' };
}

/** Does this automation need a human to approve before any action fires? */
export function needsApproval(def: AutomationDef): boolean {
  if (def.requiresApproval) return true;
  // Auto-require approval for paid WhatsApp sends — protects spend + trust.
  return def.actions.some(
    (a) => a.type === 'send_whatsapp' && (a as { paidFallback?: string }).paidFallback === 'allow',
  );
}
