/**
 * Stealth-globals regression guard.
 *
 * Background (2026-04-18 dogfooding):
 *   During a live MCP session, `Object.keys(window).filter(k => /^__tandem/.test(k))`
 *   in a real page context returned:
 *     __tandemScroll, __tandemSelection, __tandemFormFocus,
 *     __tandemVisionActive, __tandemSecurityAlert, __tandemSecurityMonitorsActive
 *   That's a shared-signal fingerprint — any page could detect "this is
 *   Tandem" with one property check.
 *
 * The fix moves every Tandem-branded global OUT of the page's main-world
 * `window` object, by injecting scripts into CDP isolated worlds and
 * scoping Runtime.addBinding calls via `executionContextName`. Security
 * monitors that *must* run in the main world use a non-branded
 * `CustomEvent` → isolated-world bridge → binding pathway.
 *
 * This file is the guardian. If a future PR reintroduces a `__tandem*`
 * reference in a main-world injection script, these tests fail loud.
 */

import { describe, it, expect, vi } from 'vitest';
import { ScriptGuard } from '../script-guard';
import type { DevToolsManager } from '../../devtools/manager';
import type { SecurityDB } from '../security-db';
import type { Guardian } from '../guardian';

interface CapturedCommand {
  method: string;
  params: Record<string, unknown>;
}

function makeCaptureMock(): {
  commands: CapturedCommand[];
  dt: {
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
    sendCommandToTab: ReturnType<typeof vi.fn>;
    getAttachedWebContents: ReturnType<typeof vi.fn>;
    getDispatchWebContents: ReturnType<typeof vi.fn>;
  };
} {
  const commands: CapturedCommand[] = [];
  const fakeWC = { id: 42, getURL: () => 'https://page.example' };
  return {
    commands,
    dt: {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      sendCommandToTab: vi.fn(async (_wcId: number, method: string, params: Record<string, unknown>) => {
        commands.push({ method, params });
        return {};
      }),
      getAttachedWebContents: vi.fn(() => fakeWC),
      getDispatchWebContents: vi.fn(() => fakeWC),
    },
  };
}

function makeDB(): SecurityDB {
  return {
    logEvent: vi.fn(),
    getScriptFingerprint: vi.fn(() => null),
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
  } as unknown as SecurityDB;
}

describe('Stealth globals regression guard', () => {
  describe('ScriptGuard injects no __tandem* names into the main-world script', () => {
    it('never writes window.__tandem* in the main-world monitor source', async () => {
      const { commands, dt } = makeCaptureMock();
      const guard = new ScriptGuard(makeDB(), {} as Guardian, dt as unknown as DevToolsManager);
      await guard.injectMonitors(42);

      const pageScripts = commands.filter(c => c.method === 'Page.addScriptToEvaluateOnNewDocument');
      // One main-world + one isolated-world
      expect(pageScripts.length).toBeGreaterThanOrEqual(2);
      const mainWorldScript = pageScripts.find(c => (c.params as { worldName: string }).worldName === '');
      expect(mainWorldScript).toBeDefined();
      const src = (mainWorldScript!.params as { source: string }).source;

      // The core stealth claim: no Tandem-branded name leaks into main world
      expect(src).not.toMatch(/__tandem\w*/);
      expect(src).not.toMatch(/window\.__tandem/);
    });

    it('never calls Runtime.addBinding for __tandem* without isolated-world scoping', async () => {
      const { commands, dt } = makeCaptureMock();
      const guard = new ScriptGuard(makeDB(), {} as Guardian, dt as unknown as DevToolsManager);
      await guard.injectMonitors(42);

      const bindingCalls = commands.filter(c => c.method === 'Runtime.addBinding');
      for (const call of bindingCalls) {
        const params = call.params as { name: string; executionContextName?: string };
        if (/__tandem/.test(params.name)) {
          // Any __tandem-named binding MUST be scoped to a Tandem isolated world,
          // never the default main world (which would expose it as window.X)
          expect(params.executionContextName).toBeDefined();
          expect(params.executionContextName).toMatch(/^Tandem/);
        }
      }
    });

    it('runs an isolated-world bridge that carries the __tandem* binding', async () => {
      const { commands, dt } = makeCaptureMock();
      const guard = new ScriptGuard(makeDB(), {} as Guardian, dt as unknown as DevToolsManager);
      await guard.injectMonitors(42);

      const pageScripts = commands.filter(c => c.method === 'Page.addScriptToEvaluateOnNewDocument');
      const bridgeScript = pageScripts.find(c => (c.params as { worldName: string }).worldName === 'TandemSecurity');
      expect(bridgeScript).toBeDefined();
      const src = (bridgeScript!.params as { source: string }).source;

      // Bridge DOES reference the binding (that's fine — it lives in isolated world)
      expect(src).toContain('__tandemSecurityAlert');
      // Bridge listens on the non-branded CustomEvent name
      expect(src).toContain('__tdm_sec_alert');
    });

    it('alerting path in main-world uses CustomEvent, not direct binding call', async () => {
      const { commands, dt } = makeCaptureMock();
      const guard = new ScriptGuard(makeDB(), {} as Guardian, dt as unknown as DevToolsManager);
      await guard.injectMonitors(42);

      const mainWorldScript = commands
        .filter(c => c.method === 'Page.addScriptToEvaluateOnNewDocument')
        .find(c => (c.params as { worldName: string }).worldName === '');
      const src = (mainWorldScript!.params as { source: string }).source;

      // No direct binding invocation in main world
      expect(src).not.toMatch(/__tandemSecurityAlert\(/);
      // CustomEvent dispatch pathway
      expect(src).toContain('dispatchEvent');
      expect(src).toContain('CustomEvent');
    });
  });
});
