import { describe, expect, it } from 'vitest';
import { UnlockAttemptLimiter } from '../unlock-limiter';

function createLimiter(nowRef: { value: number }) {
  return new UnlockAttemptLimiter({
    maxAttempts: 5,
    baseLockoutMs: 30_000,
    maxLockoutMs: 120_000,
    now: () => nowRef.value,
  });
}

describe('UnlockAttemptLimiter', () => {
  it('allows the first attempts without locking', () => {
    const nowRef = { value: 0 };
    const limiter = createLimiter(nowRef);

    for (let i = 0; i < 4; i++) {
      expect(limiter.check().allowed).toBe(true);
      limiter.recordFailure();
    }

    expect(limiter.check().allowed).toBe(true);
  });

  it('locks after the fifth consecutive failure', () => {
    const nowRef = { value: 0 };
    const limiter = createLimiter(nowRef);

    for (let i = 0; i < 5; i++) limiter.recordFailure();

    const gate = limiter.check();
    expect(gate.allowed).toBe(false);
    expect(gate.retryAfterMs).toBe(30_000);
    expect(gate.failedAttempts).toBe(5);
  });

  it('doubles the lockout per additional failure up to the cap', () => {
    const nowRef = { value: 0 };
    const limiter = createLimiter(nowRef);

    for (let i = 0; i < 5; i++) limiter.recordFailure();
    expect(limiter.check().retryAfterMs).toBe(30_000);

    nowRef.value = 30_000;
    limiter.recordFailure(); // 6th → 60s
    expect(limiter.check().retryAfterMs).toBe(60_000);

    nowRef.value = 90_000;
    limiter.recordFailure(); // 7th → 120s
    expect(limiter.check().retryAfterMs).toBe(120_000);

    nowRef.value = 210_000;
    limiter.recordFailure(); // 8th → capped at 120s
    expect(limiter.check().retryAfterMs).toBe(120_000);
  });

  it('unlocks again after the lockout expires', () => {
    const nowRef = { value: 0 };
    const limiter = createLimiter(nowRef);

    for (let i = 0; i < 5; i++) limiter.recordFailure();
    expect(limiter.check().allowed).toBe(false);

    nowRef.value = 30_001;
    expect(limiter.check().allowed).toBe(true);
  });

  it('resets completely on success', () => {
    const nowRef = { value: 0 };
    const limiter = createLimiter(nowRef);

    for (let i = 0; i < 5; i++) limiter.recordFailure();
    nowRef.value = 30_001;
    limiter.recordSuccess();

    const gate = limiter.check();
    expect(gate.allowed).toBe(true);
    expect(gate.failedAttempts).toBe(0);

    // After a reset the free-attempt budget applies again.
    for (let i = 0; i < 4; i++) limiter.recordFailure();
    expect(limiter.check().allowed).toBe(true);
  });
});
