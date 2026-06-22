/**
 * Outcome-due detection — PURE. Given applied repairs / playbook applications
 * with their last outcome status and hours elapsed since apply, decide which are
 * "due" for (re-)measurement. Never marks something due before its minimum
 * window — the same honesty gate the measurement engines enforce.
 */

export interface DueCandidate {
  id: string;
  appliedHoursAgo: number;
  lastOutcome: string | null;   // null = never measured
  minHours: number;             // minimum window for this item's type/scope
}

export interface DueResult {
  id: string;
  reason: 'never_measured' | 'awaiting_window_passed' | 'early_signal_recheck';
}

/**
 * An item is due when:
 *  - it was never measured AND its minimum window has passed, OR
 *  - its last outcome was awaiting_data AND the window has now passed, OR
 *  - its last outcome was early_signal AND the window has passed (re-check).
 * Decided outcomes (improved / no_change / worsened / inconclusive) are NOT due.
 */
export function detectDue(candidates: DueCandidate[]): DueResult[] {
  const out: DueResult[] = [];
  for (const c of candidates) {
    const windowPassed = c.appliedHoursAgo >= c.minHours;
    if (!windowPassed) continue;                       // never due before the minimum window
    if (c.lastOutcome === null) { out.push({ id: c.id, reason: 'never_measured' }); continue; }
    if (c.lastOutcome === 'awaiting_data') { out.push({ id: c.id, reason: 'awaiting_window_passed' }); continue; }
    if (c.lastOutcome === 'early_signal') { out.push({ id: c.id, reason: 'early_signal_recheck' }); continue; }
    // improved / no_change / worsened / inconclusive → settled, not due
  }
  return out;
}

/** Is an intelligence artifact stale? (older than its refresh interval.) */
export function isStale(lastRefreshedHoursAgo: number | null, intervalHours: number): boolean {
  if (lastRefreshedHoursAgo === null) return true;   // never refreshed → stale
  return lastRefreshedHoursAgo >= intervalHours;
}
