/**
 * Security — rate limiting + abuse control. PURE, in-memory, dependency-free.
 * A sliding-window counter per key with an optional lockout once a threshold is
 * crossed. Good enough to blunt credential-stuffing, public-route brute force,
 * and command spam on a single node; a distributed deployment would back this
 * with Redis, but the interface stays identical.
 *
 * No user enumeration: callers use the SAME generic failure regardless of
 * whether a key exists, and the limiter never reveals which dimension tripped.
 */

export interface RateRule {
  windowMs: number;   // size of the sliding window
  max: number;        // max events allowed within the window
  lockoutMs?: number; // once max is exceeded, block for this long (defaults to windowMs)
}

interface Bucket { hits: number[]; lockedUntil: number; }

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }

  /** Returns { allowed, retryAfterMs }. Records the hit when allowed. */
  check(key: string, rule: RateRule): { allowed: boolean; retryAfterMs: number } {
    const t = this.now();
    let b = this.buckets.get(key);
    if (!b) { b = { hits: [], lockedUntil: 0 }; this.buckets.set(key, b); }

    if (b.lockedUntil > t) return { allowed: false, retryAfterMs: b.lockedUntil - t };

    // drop hits outside the window
    const cutoff = t - rule.windowMs;
    b.hits = b.hits.filter((h) => h > cutoff);

    if (b.hits.length >= rule.max) {
      b.lockedUntil = t + (rule.lockoutMs ?? rule.windowMs);
      return { allowed: false, retryAfterMs: b.lockedUntil - t };
    }
    b.hits.push(t);
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Clear a key (e.g. on a successful login, reset the failure counter). */
  reset(key: string): void { this.buckets.delete(key); }

  /** Housekeeping so the map cannot grow without bound. */
  sweep(maxIdleMs = 3_600_000): void {
    const t = this.now();
    for (const [k, b] of this.buckets) {
      const lastHit = b.hits.length ? b.hits[b.hits.length - 1] : 0;
      if (b.lockedUntil < t && lastHit < t - maxIdleMs) this.buckets.delete(k);
    }
  }
}

// Shared limiters for the API process.
export const authLimiter = new RateLimiter();
export const publicLimiter = new RateLimiter();
export const commandLimiter = new RateLimiter();

// Tuned rules (conservative; real values can move to env later).
export const RULES = {
  login:   { windowMs: 15 * 60_000, max: 8,  lockoutMs: 15 * 60_000 } as RateRule, // 8 per 15m per ip+email
  signup:  { windowMs: 60 * 60_000, max: 5,  lockoutMs: 60 * 60_000 } as RateRule, // 5 per hour per ip
  publicHit: { windowMs: 60_000,    max: 60 } as RateRule,                          // 60/min per ip+route
  trackEvent: { windowMs: 60_000,   max: 120 } as RateRule,                         // 120/min per ip
  webhook: { windowMs: 60_000,      max: 600 } as RateRule,                          // generous; providers burst
  command: { windowMs: 60_000,      max: 30 } as RateRule,                           // 30 commands/min per user
};

/** Max accepted body sizes (bytes) per route family. */
export const MAX_BODY = {
  auth: 4_096,
  track: 8_192,
  webhook: 256 * 1024,
  command: 16_384,
  default: 64 * 1024,
};
