import crypto from 'crypto';
import type { IncomingMessage } from 'http';

/**
 * Constant-time string comparison for auth tokens.
 *
 * Returns false on length mismatch. crypto.timingSafeEqual requires equal
 * buffer lengths, so the length check short-circuits — that leaks only the
 * token length, which is not secret (all Tandem tokens have fixed length).
 * Mirrors isTokenValid() in src/api/server.ts.
 */
export function timingSafeEqualStrings(candidate: string, expected: string): boolean {
  try {
    const bufA = Buffer.from(candidate);
    const bufB = Buffer.from(expected);
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Extract an auth token from WebSocket upgrade request headers.
 *
 * Header-only by design: query-string tokens (`?token=...`) end up in process
 * lists, proxy logs, and Referer-adjacent surfaces, so they are deliberately
 * NOT read here. All known clients of the header-authenticated WebSocket
 * endpoints (/watch/live, /security/gatekeeper) are Node/MCP processes that
 * can set request headers; no browser-context client exists for them.
 */
export function extractWebSocketHeaderToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  const headerToken = req.headers['x-tandem-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }

  return null;
}

export interface WsAuthRateLimiterOptions {
  /** Consecutive failures allowed before lockouts begin. Default 5. */
  maxFreeFailures?: number;
  /** First lockout duration in ms; doubles per additional failure. Default 1s. */
  baseLockoutMs?: number;
  /** Upper bound for the exponential lockout. Default 5 minutes. */
  maxLockoutMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

interface WsAuthAttemptEntry {
  failures: number;
  lockedUntil: number;
  lastFailureAt: number;
}

const MAX_TRACKED_KEYS = 1000;
const STALE_ENTRY_MS = 60 * 60 * 1000;

/**
 * Per-caller failed-auth tracker with exponential backoff for WebSocket
 * upgrade requests. After `maxFreeFailures` consecutive failures the caller
 * is locked out; every further failure doubles the lockout up to
 * `maxLockoutMs`. A successful auth resets the caller's counter.
 */
export class WsAuthRateLimiter {
  private readonly maxFreeFailures: number;
  private readonly baseLockoutMs: number;
  private readonly maxLockoutMs: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, WsAuthAttemptEntry>();

  constructor(options: WsAuthRateLimiterOptions = {}) {
    this.maxFreeFailures = options.maxFreeFailures ?? 5;
    this.baseLockoutMs = options.baseLockoutMs ?? 1_000;
    this.maxLockoutMs = options.maxLockoutMs ?? 5 * 60 * 1_000;
    this.now = options.now ?? (() => Date.now());
  }

  /** Whether the caller is currently locked out. */
  isBlocked(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    return this.now() < entry.lockedUntil;
  }

  /** Remaining lockout in ms (0 when not locked). */
  blockedForMs(key: string): number {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    return Math.max(0, entry.lockedUntil - this.now());
  }

  recordFailure(key: string): void {
    this.prune();
    const timestamp = this.now();
    const entry = this.entries.get(key) ?? { failures: 0, lockedUntil: 0, lastFailureAt: timestamp };
    entry.failures += 1;
    entry.lastFailureAt = timestamp;
    if (entry.failures >= this.maxFreeFailures) {
      const exponent = entry.failures - this.maxFreeFailures;
      const lockoutMs = Math.min(this.baseLockoutMs * 2 ** exponent, this.maxLockoutMs);
      entry.lockedUntil = timestamp + lockoutMs;
    }
    this.entries.set(key, entry);
  }

  recordSuccess(key: string): void {
    this.entries.delete(key);
  }

  /** Drop stale entries so the map cannot grow without bound. */
  private prune(): void {
    if (this.entries.size < MAX_TRACKED_KEYS) return;
    const cutoff = this.now() - STALE_ENTRY_MS;
    for (const [key, entry] of this.entries) {
      if (entry.lastFailureAt < cutoff && entry.lockedUntil < this.now()) {
        this.entries.delete(key);
      }
    }
  }
}
