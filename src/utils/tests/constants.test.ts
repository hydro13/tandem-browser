import { describe, it, expect } from 'vitest';
import {
  API_PORT,
  WEBHOOK_PORT,
  DEFAULT_PARTITION,
  AUTH_POPUP_PATTERNS,
  COOKIE_FLUSH_INTERVAL_MS,
  CDP_ATTACH_DELAY_MS,
  DEFAULT_TIMEOUT_MS,
} from '../constants';

describe('API_PORT', () => {
  it('is 8765', () => {
    expect(API_PORT).toBe(8765);
  });

  it('is a number', () => {
    expect(typeof API_PORT).toBe('number');
  });
});

describe('WEBHOOK_PORT', () => {
  it('is 18789', () => {
    expect(WEBHOOK_PORT).toBe(18789);
  });

  it('is a number', () => {
    expect(typeof WEBHOOK_PORT).toBe('number');
  });
});

describe('DEFAULT_PARTITION', () => {
  it('is persist:tandem', () => {
    expect(DEFAULT_PARTITION).toBe('persist:tandem');
  });

  it('starts with persist: prefix', () => {
    expect(DEFAULT_PARTITION).toMatch(/^persist:/);
  });
});

describe('AUTH_POPUP_PATTERNS', () => {
  it('is an array', () => {
    expect(Array.isArray(AUTH_POPUP_PATTERNS)).toBe(true);
  });

  it('contains expected OAuth provider patterns', () => {
    expect(AUTH_POPUP_PATTERNS).toContain('accounts.google.com');
    expect(AUTH_POPUP_PATTERNS).toContain('appleid.apple.com');
    expect(AUTH_POPUP_PATTERNS).toContain('login.microsoftonline.com');
  });

  it('contains generic auth path patterns', () => {
    expect(AUTH_POPUP_PATTERNS).toContain('/oauth');
    expect(AUTH_POPUP_PATTERNS).toContain('/auth');
  });

  it('has all string entries', () => {
    for (const pattern of AUTH_POPUP_PATTERNS) {
      expect(typeof pattern).toBe('string');
      expect(pattern.length).toBeGreaterThan(0);
    }
  });
});

describe('Timeout constants', () => {
  it('COOKIE_FLUSH_INTERVAL_MS is a positive number', () => {
    expect(COOKIE_FLUSH_INTERVAL_MS).toBeGreaterThan(0);
    expect(typeof COOKIE_FLUSH_INTERVAL_MS).toBe('number');
  });

  it('CDP_ATTACH_DELAY_MS is a positive number', () => {
    expect(CDP_ATTACH_DELAY_MS).toBeGreaterThan(0);
    expect(typeof CDP_ATTACH_DELAY_MS).toBe('number');
  });

  it('DEFAULT_TIMEOUT_MS is a positive number', () => {
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(typeof DEFAULT_TIMEOUT_MS).toBe('number');
  });

  it('CDP_ATTACH_DELAY_MS is less than DEFAULT_TIMEOUT_MS', () => {
    expect(CDP_ATTACH_DELAY_MS).toBeLessThan(DEFAULT_TIMEOUT_MS);
  });
});
