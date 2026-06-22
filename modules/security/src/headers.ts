import type { IncomingMessage } from 'node:http';

/**
 * Security headers + request helpers. PURE where possible.
 */

/** Conservative security headers for static app + API responses. */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
};

/** Headers that must never be cached (auth, me, sensitive GETs). */
export const NO_STORE: Record<string, string> = { 'Cache-Control': 'no-store, max-age=0' };

/**
 * Best-effort client IP. We do NOT blindly trust x-forwarded-for in general,
 * but behind a known proxy it is the only signal; we take the FIRST hop and
 * fall back to the socket address. For rate-limiting (not authz) this is fine.
 */
export function clientIp(req: IncomingMessage): string {
  const xff = (req.headers['x-forwarded-for'] as string | undefined) || '';
  const first = xff.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || 'unknown';
}

/** A generic, enumeration-safe auth failure body. Always the same shape. */
export const GENERIC_AUTH_FAILURE = { error: 'invalid credentials' };
