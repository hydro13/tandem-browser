import type { IncomingMessage } from 'http';
import { describe, expect, it } from 'vitest';
import { extractWebSocketHeaderToken, timingSafeEqualStrings, WsAuthRateLimiter } from '../ws-auth';

function buildRequest(headers: Record<string, string | string[]>, url = '/watch/live'): IncomingMessage {
  return { url, headers } as unknown as IncomingMessage;
}

describe('timingSafeEqualStrings', () => {
  it('returns true for equal tokens', () => {
    expect(timingSafeEqualStrings('a'.repeat(64), 'a'.repeat(64))).toBe(true);
  });

  it('returns false for same-length mismatches', () => {
    expect(timingSafeEqualStrings('a'.repeat(64), 'a'.repeat(63) + 'b')).toBe(false);
  });

  it('returns false on length mismatch without throwing', () => {
    expect(timingSafeEqualStrings('short', 'a'.repeat(64))).toBe(false);
    expect(timingSafeEqualStrings('', 'a'.repeat(64))).toBe(false);
  });
});

describe('extractWebSocketHeaderToken', () => {
  it('reads Authorization: Bearer tokens', () => {
    const req = buildRequest({ authorization: 'Bearer secret-token' });
    expect(extractWebSocketHeaderToken(req)).toBe('secret-token');
  });

  it('reads X-Tandem-Token headers', () => {
    const req = buildRequest({ 'x-tandem-token': 'header-token' });
    expect(extractWebSocketHeaderToken(req)).toBe('header-token');
  });

  it('never reads tokens from the query string', () => {
    const req = buildRequest({}, '/watch/live?token=leaked-token');
    expect(extractWebSocketHeaderToken(req)).toBeNull();
  });

  it('ignores non-Bearer Authorization schemes', () => {
    const req = buildRequest({ authorization: 'Basic dXNlcjpwYXNz' });
    expect(extractWebSocketHeaderToken(req)).toBeNull();
  });
});

describe('WsAuthRateLimiter', () => {
  it('allows the first failures without locking', () => {
    let nowMs = 0;
    const limiter = new WsAuthRateLimiter({ maxFreeFailures: 5, baseLockoutMs: 1000, now: () => nowMs });

    for (let i = 0; i < 4; i++) {
      limiter.recordFailure('1.2.3.4');
      expect(limiter.isBlocked('1.2.3.4')).toBe(false);
    }

    limiter.recordFailure('1.2.3.4'); // 5th failure starts the lockout
    expect(limiter.isBlocked('1.2.3.4')).toBe(true);
    expect(limiter.blockedForMs('1.2.3.4')).toBe(1000);

    nowMs = 1001;
    expect(limiter.isBlocked('1.2.3.4')).toBe(false);
  });

  it('doubles the lockout per additional failure up to the cap', () => {
    let nowMs = 0;
    const limiter = new WsAuthRateLimiter({
      maxFreeFailures: 5,
      baseLockoutMs: 1000,
      maxLockoutMs: 3000,
      now: () => nowMs,
    });

    for (let i = 0; i < 5; i++) limiter.recordFailure('k');
    expect(limiter.blockedForMs('k')).toBe(1000);

    nowMs = 2000;
    limiter.recordFailure('k'); // 6th failure → 2000ms
    expect(limiter.blockedForMs('k')).toBe(2000);

    nowMs = 5000;
    limiter.recordFailure('k'); // 7th failure → capped at 3000ms
    expect(limiter.blockedForMs('k')).toBe(3000);
  });

  it('resets the counter on success', () => {
    let nowMs = 0;
    const limiter = new WsAuthRateLimiter({ maxFreeFailures: 5, baseLockoutMs: 1000, now: () => nowMs });

    for (let i = 0; i < 5; i++) limiter.recordFailure('k');
    expect(limiter.isBlocked('k')).toBe(true);

    nowMs = 1001;
    limiter.recordSuccess('k');
    limiter.recordFailure('k');
    expect(limiter.isBlocked('k')).toBe(false);
  });

  it('tracks callers independently', () => {
    const limiter = new WsAuthRateLimiter({ maxFreeFailures: 5, baseLockoutMs: 1000, now: () => 0 });
    for (let i = 0; i < 5; i++) limiter.recordFailure('attacker');
    expect(limiter.isBlocked('attacker')).toBe(true);
    expect(limiter.isBlocked('legit')).toBe(false);
  });
});
