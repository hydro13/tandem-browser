import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  getErrorMessage,
  hostnameMatches,
  isHttpUrl,
  isPrivateIPv4,
  isPrivateIPv6,
  isSafeNavigationUrl,
  tryParseUrl,
} from '../security';

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

describe('isSafeNavigationUrl()', () => {
  it('accepts https with a public hostname', () => {
    expect(isSafeNavigationUrl('https://example.com')).toBe(true);
    expect(isSafeNavigationUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('accepts http with a public hostname', () => {
    expect(isSafeNavigationUrl('http://example.com')).toBe(true);
  });

  it('accepts a public IPv4 literal', () => {
    expect(isSafeNavigationUrl('https://8.8.8.8')).toBe(true);
    expect(isSafeNavigationUrl('https://1.1.1.1/path')).toBe(true);
  });

  it('rejects file:// scheme', () => {
    expect(isSafeNavigationUrl('file:///etc/shadow')).toBe(false);
    expect(isSafeNavigationUrl('file:///C:/Windows/System32/config/SAM')).toBe(false);
  });

  it('rejects javascript: scheme', () => {
    expect(isSafeNavigationUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: scheme', () => {
    expect(isSafeNavigationUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects chrome:// and devtools:// schemes', () => {
    expect(isSafeNavigationUrl('chrome://settings')).toBe(false);
    expect(isSafeNavigationUrl('devtools://devtools/bundled/inspector.html')).toBe(false);
  });

  it('rejects vbscript:, view-source:, blob:, about:, ws: schemes', () => {
    expect(isSafeNavigationUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeNavigationUrl('view-source:https://example.com')).toBe(false);
    expect(isSafeNavigationUrl('blob:https://example.com/uuid')).toBe(false);
    expect(isSafeNavigationUrl('about:blank')).toBe(false);
    expect(isSafeNavigationUrl('ws://example.com')).toBe(false);
  });

  it('rejects IPv4 loopback (127/8)', () => {
    expect(isSafeNavigationUrl('http://127.0.0.1')).toBe(false);
    expect(isSafeNavigationUrl('http://127.0.0.1:8765')).toBe(false);
    expect(isSafeNavigationUrl('https://127.1.2.3')).toBe(false);
  });

  it('rejects IPv4 RFC1918 private ranges', () => {
    expect(isSafeNavigationUrl('http://10.0.0.1')).toBe(false);
    expect(isSafeNavigationUrl('http://10.255.255.255')).toBe(false);
    expect(isSafeNavigationUrl('http://172.16.0.1')).toBe(false);
    expect(isSafeNavigationUrl('http://172.31.255.255')).toBe(false);
    expect(isSafeNavigationUrl('http://192.168.1.1')).toBe(false);
  });

  it('accepts IPv4 just outside RFC1918 (edge cases)', () => {
    expect(isSafeNavigationUrl('http://11.0.0.1')).toBe(true);
    expect(isSafeNavigationUrl('http://172.15.0.1')).toBe(true);
    expect(isSafeNavigationUrl('http://172.32.0.1')).toBe(true);
    expect(isSafeNavigationUrl('http://192.167.1.1')).toBe(true);
    expect(isSafeNavigationUrl('http://192.169.1.1')).toBe(true);
  });

  it('rejects IPv4 link-local / cloud metadata (169.254/16)', () => {
    expect(isSafeNavigationUrl('http://169.254.169.254')).toBe(false);
    expect(isSafeNavigationUrl('http://169.254.0.1')).toBe(false);
  });

  it('rejects 0.0.0.0', () => {
    expect(isSafeNavigationUrl('http://0.0.0.0')).toBe(false);
  });

  it('rejects IPv6 loopback and link-local', () => {
    expect(isSafeNavigationUrl('http://[::1]')).toBe(false);
    expect(isSafeNavigationUrl('http://[fe80::1]')).toBe(false);
    expect(isSafeNavigationUrl('http://[fc00::1]')).toBe(false);
    expect(isSafeNavigationUrl('http://[fd12:3456:789a::1]')).toBe(false);
  });

  it('rejects IPv4-mapped IPv6 that maps to a private range', () => {
    expect(isSafeNavigationUrl('http://[::ffff:127.0.0.1]')).toBe(false);
    expect(isSafeNavigationUrl('http://[::ffff:10.0.0.1]')).toBe(false);
    expect(isSafeNavigationUrl('http://[::ffff:169.254.169.254]')).toBe(false);
  });

  it('rejects localhost hostname', () => {
    expect(isSafeNavigationUrl('http://localhost')).toBe(false);
    expect(isSafeNavigationUrl('http://localhost:8765')).toBe(false);
    expect(isSafeNavigationUrl('http://LOCALHOST')).toBe(false);
  });

  it('rejects empty and malformed input', () => {
    expect(isSafeNavigationUrl('')).toBe(false);
    expect(isSafeNavigationUrl('   ')).toBe(false);
    expect(isSafeNavigationUrl('not a url')).toBe(false);
    expect(isSafeNavigationUrl('://broken')).toBe(false);
  });

  it('rejects URLs with no hostname', () => {
    expect(isSafeNavigationUrl('http://')).toBe(false);
  });

  it('accepts a public IPv6 literal', () => {
    // Cloudflare public DNS — no match on ::/::1/mapped/fe8x/fc/fd patterns.
    expect(isSafeNavigationUrl('http://[2606:4700:4700::1111]')).toBe(true);
  });

  it('rejects non-string and nullish inputs defensively', () => {
    expect(isSafeNavigationUrl(null as unknown as string)).toBe(false);
    expect(isSafeNavigationUrl(undefined as unknown as string)).toBe(false);
    expect(isSafeNavigationUrl(123 as unknown as string)).toBe(false);
  });
});

describe('isPrivateIPv4() — direct', () => {
  it('treats malformed IPv4 (wrong segment count) as unsafe', () => {
    expect(isPrivateIPv4('10.0.0')).toBe(true);
    expect(isPrivateIPv4('10.0.0.0.0')).toBe(true);
    expect(isPrivateIPv4('not.an.ip.addr')).toBe(true);
  });

  it('treats out-of-range octets as unsafe', () => {
    expect(isPrivateIPv4('999.0.0.1')).toBe(true);
    expect(isPrivateIPv4('-1.0.0.1')).toBe(true);
  });

  it('accepts a public IPv4 (returns false)', () => {
    expect(isPrivateIPv4('8.8.8.8')).toBe(false);
    expect(isPrivateIPv4('1.1.1.1')).toBe(false);
  });
});

describe('isPrivateIPv6() — direct', () => {
  it('detects IPv4-mapped IPv6 in dotted form', () => {
    // Node's URL parser normalizes to hex, but a caller may pass the dotted
    // form directly. The helper handles both forms defensively.
    expect(isPrivateIPv6('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateIPv6('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIPv6('::ffff:8.8.8.8')).toBe(false);
  });

  it('returns false for public IPv6', () => {
    expect(isPrivateIPv6('2606:4700:4700::1111')).toBe(false);
    expect(isPrivateIPv6('2001:db8::1')).toBe(false);
  });
});
