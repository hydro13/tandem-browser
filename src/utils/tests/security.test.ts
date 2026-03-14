import { describe, expect, it } from 'vitest';
import { escapeHtml, getErrorMessage, hostnameMatches, isHttpUrl, tryParseUrl } from '../security';

describe('escapeHtml()', () => {
  it('escapes HTML metacharacters', () => {
    expect(escapeHtml(`<img src="x" onerror='boom'>`)).toBe('&lt;img src=&quot;x&quot; onerror=&#39;boom&#39;&gt;');
  });
});

describe('getErrorMessage()', () => {
  it('prefers Error.message', () => {
    expect(getErrorMessage(new Error('failed'))).toBe('failed');
  });

  it('falls back for opaque objects', () => {
    expect(getErrorMessage({ nope: true }, 'fallback')).toBe('fallback');
  });
});

describe('tryParseUrl()', () => {
  it('parses valid URLs', () => {
    expect(tryParseUrl('https://example.com/path')?.hostname).toBe('example.com');
  });

  it('returns null for invalid URLs', () => {
    expect(tryParseUrl('://bad url')).toBeNull();
  });
});

describe('isHttpUrl()', () => {
  it('accepts http and https', () => {
    expect(isHttpUrl('https://example.com')).toBe(true);
    expect(isHttpUrl('http://example.com')).toBe(true);
  });

  it('rejects non-http schemes', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('file:///tmp/test.html')).toBe(false);
  });
});

describe('hostnameMatches()', () => {
  it('matches exact hosts and subdomains only', () => {
    const url = new URL('https://sub.accounts.google.com/path');
    expect(hostnameMatches(url, 'accounts.google.com')).toBe(true);
    expect(hostnameMatches(url, 'google.com')).toBe(true);
    expect(hostnameMatches(url, 'evilgoogle.com')).toBe(false);
  });
});
