import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContentAnalyzer, ContentAnalyzerPlugin } from '../content-analyzer';
import type { SecurityDB } from '../security-db';
import type { DevToolsManager } from '../../devtools/manager';
import type { SecurityEvent } from '../types';

/**
 * Build a mock DevToolsManager whose `sendCommand('Runtime.evaluate', ...)`
 * returns scripted responses based on the expression substring.
 *
 * The analyzer issues a series of Runtime.evaluate calls (forms, scripts,
 * iframes, mixed content, pixels, outerHTML). We match on a keyword in the
 * expression and return the next scripted value for that bucket.
 */
function makeDevTools(url: string, responses: Partial<Record<
  'forms' | 'scripts' | 'iframes' | 'mixed' | 'pixels' | 'outerHTML',
  unknown
>> = {}) {
  const webContents = { getURL: () => url } as unknown;
  const sendCommand = vi.fn(async (_method: string, params: { expression: string }) => {
    const expr = params.expression;
    if (expr.includes('document.forms')) return { result: { value: JSON.stringify(responses.forms ?? []) } };
    if (expr.includes("querySelectorAll('script[src]')")) return { result: { value: JSON.stringify(responses.scripts ?? []) } };
    if (expr.includes("querySelectorAll('iframe')")) return { result: { value: responses.iframes ?? 0 } };
    if (expr.includes('img[src^="http:"]')) return { result: { value: responses.mixed ?? false } };
    if (expr.includes('img[width="1"]')) return { result: { value: JSON.stringify(responses.pixels ?? []) } };
    if (expr.includes('document.documentElement.outerHTML')) return { result: { value: responses.outerHTML ?? '' } };
    return { result: { value: null } };
  });
  return {
    getAttachedWebContents: () => webContents,
    sendCommand,
  } as unknown as DevToolsManager;
}

/** Minimal SecurityDB mock — tracks logged events and fingerprint lookups */
function makeDB(opts: { knownScripts?: Set<string> } = {}): SecurityDB & { events: SecurityEvent[] } {
  const events: SecurityEvent[] = [];
  const known = opts.knownScripts ?? new Set<string>();
  const db = {
    events,
    logEvent: vi.fn((event: SecurityEvent) => {
      events.push(event);
      return events.length;
    }),
    getScriptFingerprint: vi.fn((_domain: string, url: string) =>
      known.has(url) ? { id: 1, domain: _domain, scriptUrl: url, scriptHash: null, firstSeen: 0, lastSeen: 0, trusted: true } : null
    ),
  } as unknown as SecurityDB & { events: SecurityEvent[] };
  return db;
}

describe('ContentAnalyzer', () => {
  describe('checkTyposquatting', () => {
    let analyzer: ContentAnalyzer;
    beforeEach(() => {
      analyzer = new ContentAnalyzer(makeDB(), makeDevTools('https://example.com'));
    });

    it('returns null for exact matches to known targets', () => {
      expect(analyzer.checkTyposquatting('paypal.com')).toBeNull();
      expect(analyzer.checkTyposquatting('google.com')).toBeNull();
      expect(analyzer.checkTyposquatting('github.com')).toBeNull();
    });

    it('strips www. prefix before comparing', () => {
      expect(analyzer.checkTyposquatting('www.paypal.com')).toBeNull();
    });

    it('returns null for completely unrelated domains', () => {
      expect(analyzer.checkTyposquatting('totallysafe.example')).toBeNull();
      expect(analyzer.checkTyposquatting('news.nytimes.com')).toBeNull();
    });

    it('detects 1-character typo (Levenshtein distance 1)', () => {
      const result = analyzer.checkTyposquatting('paypa1.com');
      expect(result).not.toBeNull();
      expect(result?.suspectedTarget).toBe('paypal.com');
    });

    it('detects 2-character typo (Levenshtein distance 2)', () => {
      const result = analyzer.checkTyposquatting('payypa1.com');
      expect(result).not.toBeNull();
      expect(result?.suspectedTarget).toBe('paypal.com');
      expect(result?.distance).toBeLessThanOrEqual(2);
    });

    it('does not flag domains with distance > 2 from any target', () => {
      // "xyzdomain.com" is > 2 edits away from every target
      expect(analyzer.checkTyposquatting('xyzdomain.com')).toBeNull();
    });

    it('flags l→1 substitution as substitution attack', () => {
      const result = analyzer.checkTyposquatting('paypa1.com');
      expect(result?.suspectedTarget).toBe('paypal.com');
    });

    it('flags o→0 substitution', () => {
      const result = analyzer.checkTyposquatting('g00gle.com');
      expect(result).not.toBeNull();
      expect(result?.suspectedTarget).toBe('google.com');
    });

    it('flags rn→m visual-confusion typosquats against microsoft.com', () => {
      // "rnicrosoft.com" is caught via Levenshtein (distance 2); either the
      // Levenshtein or substitution path is valid — we just assert the target.
      const result = analyzer.checkTyposquatting('rnicrosoft.com');
      expect(result).not.toBeNull();
      expect(result?.suspectedTarget).toBe('microsoft.com');
    });

    it('flags vv→w substitution attack (distance > 2, caught by substitution check)', () => {
      // "googlevv.com" → Levenshtein distance 3 from google.com (too far for Lev path).
      // But vv→w would make "googlew.com" — not google.com either.
      // Use a case where substitution produces the exact target:
      // "wellsfargo.com" via vv prefix: "vvellsfargo.com" — vv→w yields "wellsfargo.com" ✓
      const result = analyzer.checkTyposquatting('vvellsfargo.com');
      expect(result).not.toBeNull();
      expect(result?.suspectedTarget).toBe('wellsfargo.com');
    });

    it('returns domain and distance in result', () => {
      const result = analyzer.checkTyposquatting('githib.com');
      expect(result?.domain).toBe('githib.com');
      expect(result?.distance).toBeGreaterThan(0);
    });
  });

  describe('getLastAnalysis', () => {
    it('returns null before analyzePage is called', () => {
      const analyzer = new ContentAnalyzer(makeDB(), makeDevTools('https://example.com'));
      expect(analyzer.getLastAnalysis()).toBeNull();
    });

    it('returns the last analysis after analyzePage completes', async () => {
      const analyzer = new ContentAnalyzer(makeDB(), makeDevTools('https://example.com'));
      const result = await analyzer.analyzePage();
      expect(analyzer.getLastAnalysis()).toBe(result);
    });
  });

  describe('analyzePage — basic structure', () => {
    it('returns analysis with url, domain, timestamp, riskScore', async () => {
      const analyzer = new ContentAnalyzer(makeDB(), makeDevTools('https://example.com/page'));
      const result = await analyzer.analyzePage();
      expect(result.url).toBe('https://example.com/page');
      expect(result.domain).toBe('example.com');
      expect(result.timestamp).toBeGreaterThan(0);
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });

    it('detects HTTPS correctly', async () => {
      const secure = new ContentAnalyzer(makeDB(), makeDevTools('https://example.com'));
      const insecure = new ContentAnalyzer(makeDB(), makeDevTools('http://example.com'));
      expect((await secure.analyzePage()).security.isHttps).toBe(true);
      expect((await insecure.analyzePage()).security.isHttps).toBe(false);
    });

    it('handles empty URL (no attached webContents) gracefully', async () => {
      const analyzer = new ContentAnalyzer(makeDB(), makeDevTools(''));
      const result = await analyzer.analyzePage();
      expect(result.domain).toBeNull();
      expect(result.security.isHttps).toBe(false);
    });
  });

  describe('analyzePage — forms', () => {
    it('marks external form actions correctly', async () => {
      const db = makeDB();
      const devTools = makeDevTools('https://good.example', {
        forms: [
          { action: 'https://good.example/login', method: 'POST', id: 'f1', hasPassword: true, hasEmail: false, hasCreditCard: false },
          { action: 'https://evil.example/steal', method: 'POST', id: 'f2', hasPassword: true, hasEmail: false, hasCreditCard: false },
        ],
      });
      const analyzer = new ContentAnalyzer(db, devTools);
      const result = await analyzer.analyzePage();
      expect(result.forms).toHaveLength(2);
      expect(result.forms[0].isExternalAction).toBe(false);
      expect(result.forms[1].isExternalAction).toBe(true);
    });

    it('flags password on HTTP as a high-severity event', async () => {
      const db = makeDB();
      const devTools = makeDevTools('http://login.example', {
        forms: [{ action: 'http://login.example/submit', method: 'POST', id: 'f', hasPassword: true, hasEmail: false, hasCreditCard: false }],
      });
      const analyzer = new ContentAnalyzer(db, devTools);
      const result = await analyzer.analyzePage();
      expect(result.security.hasPasswordOnHttp).toBe(true);
      const event = db.events.find(e => e.category === 'form');
      expect(event).toBeDefined();
      expect(event?.severity).toBe('high');
    });

    it('does not flag password on HTTPS', async () => {
      const db = makeDB();
      const devTools = makeDevTools('https://login.example', {
        forms: [{ action: 'https://login.example/submit', method: 'POST', id: 'f', hasPassword: true, hasEmail: false, hasCreditCard: false }],
      });
      const analyzer = new ContentAnalyzer(db, devTools);
      const result = await analyzer.analyzePage();
      expect(result.security.hasPasswordOnHttp).toBe(false);
    });
  });

  describe('analyzePage — scripts', () => {
    it('marks external scripts correctly', async () => {
      const db = makeDB();
      const devTools = makeDevTools('https://good.example', {
        scripts: [
          { url: 'https://good.example/app.js', size: 0 },
          { url: 'https://cdn.other.example/lib.js', size: 0 },
        ],
      });
      const analyzer = new ContentAnalyzer(db, devTools);
      const result = await analyzer.analyzePage();
      expect(result.scripts).toHaveLength(2);
      expect(result.scripts[0].isExternal).toBe(false);
      expect(result.scripts[1].isExternal).toBe(true);
    });

    it('marks known scripts via fingerprint lookup', async () => {
      const known = new Set(['https://cdn.other.example/known.js']);
      const db = makeDB({ knownScripts: known });
      const devTools = makeDevTools('https://good.example', {
        scripts: [
          { url: 'https://cdn.other.example/known.js', size: 0 },
          { url: 'https://cdn.other.example/unknown.js', size: 0 },
        ],
      });
      const analyzer = new ContentAnalyzer(db, devTools);
      const result = await analyzer.analyzePage();
      expect(result.scripts[0].isKnown).toBe(true);
      expect(result.scripts[1].isKnown).toBe(false);
    });
  });

  describe('analyzePage — hidden iframes', () => {
    it('reports hidden iframe count and logs an event when > 0', async () => {
      const db = makeDB();
      const devTools = makeDevTools('https://example.com', { iframes: 3 });
      const analyzer = new ContentAnalyzer(db, devTools);
      const result = await analyzer.analyzePage();
      expect(result.security.hiddenIframesWithForms).toBe(3);
      const event = db.events.find(e => e.eventType === 'hidden-iframe');
      expect(event).toBeDefined();
      expect(event?.severity).toBe('medium');
    });

    it('does not log hidden-iframe event when count is 0', async () => {
      const db = makeDB();
      const devTools = makeDevTools('https://example.com', { iframes: 0 });
      const analyzer = new ContentAnalyzer(db, devTools);
      await analyzer.analyzePage();
      expect(db.events.find(e => e.eventType === 'hidden-iframe')).toBeUndefined();
    });
  });

  describe('analyzePage — mixed content', () => {
    it('detects mixed content on HTTPS and logs an event', async () => {
      const db = makeDB();
      const devTools = makeDevTools('https://example.com', { mixed: true });
      const analyzer = new ContentAnalyzer(db, devTools);
      const result = await analyzer.analyzePage();
      expect(result.security.mixedContent).toBe(true);
      const event = db.events.find(e => e.eventType === 'mixed-content');
      expect(event).toBeDefined();
    });

    it('does not check mixed content on HTTP pages', async () => {
      const db = makeDB();
      const devTools = makeDevTools('http://example.com', { mixed: true });
      const analyzer = new ContentAnalyzer(db, devTools);
      const result = await analyzer.analyzePage();
      // mixed is not evaluated on HTTP since the property is HTTPS-specific
      expect(result.security.mixedContent).toBe(false);
    });
  });

  describe('analyzePage — trackers', () => {
    it('identifies known tracker script domains', async () => {
      const db = makeDB();
      // google-analytics.com is in KNOWN_TRACKERS
      const devTools = makeDevTools('https://example.com', {
        scripts: [{ url: 'https://www.google-analytics.com/ga.js', size: 0 }],
      });
      const analyzer = new ContentAnalyzer(db, devTools);
      const result = await analyzer.analyzePage();
      expect(result.trackers.length).toBeGreaterThan(0);
      expect(result.trackers[0].type).toBe('script');
    });

    it('collects tracking pixels as trackers', async () => {
      const db = makeDB();
      const devTools = makeDevTools('https://example.com', {
        pixels: ['https://pixel.tracker.example/beacon.gif'],
      });
      const analyzer = new ContentAnalyzer(db, devTools);
      const result = await analyzer.analyzePage();
      const pixel = result.trackers.find(t => t.type === 'pixel');
      expect(pixel).toBeDefined();
      expect(pixel?.domain).toBe('pixel.tracker.example');
    });

    it('logs a trackers-detected event when any trackers are present', async () => {
      const db = makeDB();
      const devTools = makeDevTools('https://example.com', {
        scripts: [{ url: 'https://www.google-analytics.com/ga.js', size: 0 }],
      });
      const analyzer = new ContentAnalyzer(db, devTools);
      await analyzer.analyzePage();
      const event = db.events.find(e => e.eventType === 'trackers-detected');
      expect(event).toBeDefined();
      expect(event?.severity).toBe('low');
    });
  });

  describe('analyzePage — typosquatting', () => {
    it('flags a typosquat domain and logs a high-severity event', async () => {
      const db = makeDB();
      const devTools = makeDevTools('https://paypa1.com');
      const analyzer = new ContentAnalyzer(db, devTools);
      const result = await analyzer.analyzePage();
      expect(result.security.typosquat).not.toBeNull();
      expect(result.security.typosquat?.suspectedTarget).toBe('paypal.com');
      const event = db.events.find(e => e.eventType === 'warned' && e.category === 'content');
      expect(event).toBeDefined();
      expect(event?.severity).toBe('high');
    });
  });

  describe('analyzePage — deep scan (page source)', () => {
    it('flags octal IP evasion in page source', async () => {
      const db = makeDB();
      // IPV4_OCTAL_REGEX requires each octet to start with 0 + [0-3]
      // (e.g. 0177, 00, 01) — so use fully octal-padded octets.
      const html = `<html><body>evil beacon at 0177.00.00.01 here</body></html>`;
      const devTools = makeDevTools('https://example.com', { outerHTML: html });
      const analyzer = new ContentAnalyzer(db, devTools);
      await analyzer.analyzePage();
      const event = db.events.find(e => e.eventType === 'octal-ip-evasion');
      expect(event).toBeDefined();
      expect(event?.severity).toBe('medium');
    });

    it('flags blocked domains found in raw page source', async () => {
      const db = makeDB();
      const html = `<html><body><img src="https://evil.example/pixel"></body></html>`;
      const devTools = makeDevTools('https://good.example', { outerHTML: html });
      const analyzer = new ContentAnalyzer(db, devTools);
      analyzer.isDomainBlocked = (d) => d === 'evil.example';
      await analyzer.analyzePage();
      const event = db.events.find(e => e.eventType === 'hidden-blocked-url');
      expect(event).toBeDefined();
      expect(event?.severity).toBe('high');
    });

    it('skips self-domain references in deep scan', async () => {
      const db = makeDB();
      const html = `<html><body><a href="https://self.example/path">home</a></body></html>`;
      const devTools = makeDevTools('https://self.example', { outerHTML: html });
      const analyzer = new ContentAnalyzer(db, devTools);
      analyzer.isDomainBlocked = (d) => d === 'self.example'; // even if misconfigured
      await analyzer.analyzePage();
      expect(db.events.find(e => e.eventType === 'hidden-blocked-url')).toBeUndefined();
    });

    it('skips private/localhost IP ranges (not suspicious)', async () => {
      const db = makeDB();
      const html = `<html><body><a href="http://127.0.0.1/">local</a> <a href="http://192.168.1.1/">lan</a></body></html>`;
      const devTools = makeDevTools('https://example.com', { outerHTML: html });
      const analyzer = new ContentAnalyzer(db, devTools);
      analyzer.isDomainBlocked = () => true;
      await analyzer.analyzePage();
      expect(db.events.find(e => e.eventType === 'hidden-blocked-ip')).toBeUndefined();
    });
  });

  describe('analyzePage — risk scoring', () => {
    it('returns 0 risk for a clean HTTPS page', async () => {
      const analyzer = new ContentAnalyzer(makeDB(), makeDevTools('https://example.com'));
      const result = await analyzer.analyzePage();
      expect(result.riskScore).toBe(0);
    });

    it('adds risk for HTTP (non-HTTPS) pages', async () => {
      const analyzer = new ContentAnalyzer(makeDB(), makeDevTools('http://example.com'));
      const result = await analyzer.analyzePage();
      expect(result.riskScore).toBeGreaterThanOrEqual(15);
    });

    it('adds significant risk for password on HTTP', async () => {
      const devTools = makeDevTools('http://example.com', {
        forms: [{ action: 'http://example.com/submit', method: 'POST', id: 'f', hasPassword: true, hasEmail: false, hasCreditCard: false }],
      });
      const analyzer = new ContentAnalyzer(makeDB(), devTools);
      const result = await analyzer.analyzePage();
      // 15 (http) + 30 (pw-on-http) = 45
      expect(result.riskScore).toBeGreaterThanOrEqual(45);
    });

    it('adds risk for typosquat domain', async () => {
      const analyzer = new ContentAnalyzer(makeDB(), makeDevTools('https://paypa1.com'));
      const result = await analyzer.analyzePage();
      expect(result.riskScore).toBeGreaterThanOrEqual(35);
    });

    it('caps total risk score at 100', async () => {
      const devTools = makeDevTools('http://paypa1.com', {
        forms: Array.from({ length: 5 }, (_, i) => ({
          action: 'http://evil.example/steal',
          method: 'POST', id: `f${i}`, hasPassword: true, hasEmail: false, hasCreditCard: true,
        })),
        iframes: 5,
      });
      const analyzer = new ContentAnalyzer(makeDB(), devTools);
      const result = await analyzer.analyzePage();
      expect(result.riskScore).toBe(100);
    });

    it('adds risk for external form actions with credentials', async () => {
      const devTools = makeDevTools('https://good.example', {
        forms: [{
          action: 'https://evil.example/steal', method: 'POST', id: 'f',
          hasPassword: true, hasEmail: false, hasCreditCard: false,
        }],
      });
      const analyzer = new ContentAnalyzer(makeDB(), devTools);
      const result = await analyzer.analyzePage();
      // external form with password → +25
      expect(result.riskScore).toBeGreaterThanOrEqual(25);
    });
  });
});

describe('ContentAnalyzerPlugin', () => {
  const makePlugin = () => new ContentAnalyzerPlugin(
    new ContentAnalyzer(makeDB(), makeDevTools('https://example.com'))
  );

  it('exposes expected metadata', () => {
    const p = makePlugin();
    expect(p.name).toBe('content-analyzer');
    expect(p.version).toBe('1.0.0');
    expect(p.eventTypes).toEqual(['page-loaded']);
    expect(p.priority).toBe(400);
    expect(typeof p.description).toBe('string');
  });

  it('canAnalyze accepts page-loaded events with a domain', () => {
    const p = makePlugin();
    expect(p.canAnalyze({ eventType: 'page-loaded', domain: 'example.com' } as SecurityEvent)).toBe(true);
  });

  it('canAnalyze rejects page-loaded events without a domain', () => {
    const p = makePlugin();
    expect(p.canAnalyze({ eventType: 'page-loaded', domain: null } as unknown as SecurityEvent)).toBe(false);
  });

  it('canAnalyze rejects other event types', () => {
    const p = makePlugin();
    expect(p.canAnalyze({ eventType: 'navigation', domain: 'example.com' } as unknown as SecurityEvent)).toBe(false);
  });

  it('analyze() returns an empty array (analyzer logs its own events)', async () => {
    const p = makePlugin();
    const out = await p.analyze({ eventType: 'page-loaded', domain: 'example.com' } as SecurityEvent);
    expect(out).toEqual([]);
  });

  it('analyze() is a no-op for non-matching events', async () => {
    const analyzer = new ContentAnalyzer(makeDB(), makeDevTools('https://example.com'));
    const spy = vi.spyOn(analyzer, 'analyzePage');
    const plugin = new ContentAnalyzerPlugin(analyzer);
    await plugin.analyze({ eventType: 'other', domain: 'example.com' } as unknown as SecurityEvent);
    expect(spy).not.toHaveBeenCalled();
  });

  it('initialize() and destroy() complete without error', async () => {
    const p = makePlugin();
    await expect(p.initialize({} as never)).resolves.toBeUndefined();
    await expect(p.destroy()).resolves.toBeUndefined();
  });
});
