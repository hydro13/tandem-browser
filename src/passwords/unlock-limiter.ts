/**
 * Brute-force limiter for master-password unlock attempts.
 *
 * The vault is a single local secret, so the limiter is global rather than
 * per-caller: keying on remote address would let an attacker rotate source
 * addresses (the API can listen beyond loopback for Tailscale setups).
 *
 * Policy: up to `maxAttempts` consecutive failures pass through. From the
 * `maxAttempts`-th failure on, unlocking is locked out with exponential
 * backoff — the lockout doubles for every additional failure, capped at
 * `maxLockoutMs`. A successful unlock resets the counter.
 */

export interface UnlockAttemptLimiterOptions {
  /** Consecutive failures before the lockout starts. Default 5. */
  maxAttempts?: number;
  /** First lockout duration in ms. Default 30s. */
  baseLockoutMs?: number;
  /** Upper bound for the exponential lockout. Default 1h. */
  maxLockoutMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export interface UnlockGateResult {
  allowed: boolean;
  retryAfterMs: number;
  failedAttempts: number;
}

export class UnlockAttemptLimiter {
  private readonly maxAttempts: number;
  private readonly baseLockoutMs: number;
  private readonly maxLockoutMs: number;
  private readonly now: () => number;
  private failures = 0;
  private lockedUntil = 0;

  constructor(options: UnlockAttemptLimiterOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 5;
    this.baseLockoutMs = options.baseLockoutMs ?? 30_000;
    this.maxLockoutMs = options.maxLockoutMs ?? 60 * 60 * 1_000;
    this.now = options.now ?? (() => Date.now());
  }

  /** Whether an unlock attempt may proceed right now. */
  check(): UnlockGateResult {
    const remaining = this.lockedUntil - this.now();
    if (remaining > 0) {
      return { allowed: false, retryAfterMs: remaining, failedAttempts: this.failures };
    }
    return { allowed: true, retryAfterMs: 0, failedAttempts: this.failures };
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.maxAttempts) {
      const exponent = this.failures - this.maxAttempts;
      const lockoutMs = Math.min(this.baseLockoutMs * 2 ** exponent, this.maxLockoutMs);
      this.lockedUntil = this.now() + lockoutMs;
    }
  }

  recordSuccess(): void {
    this.failures = 0;
    this.lockedUntil = 0;
  }
}
