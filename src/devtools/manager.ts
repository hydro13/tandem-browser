import type { WebContents } from 'electron';
import { webContents } from 'electron';
import type { TabManager } from '../tabs/manager';
import { ConsoleCapture } from './console-capture';
import { NetworkCapture } from './network-capture';
import { PageInspector } from './page-inspector';
import type { WingmanStream } from '../activity/wingman-stream';
import type { ActivityTracker } from '../activity/tracker';
import type {
  ConsoleEntry, CDPNetworkEntry, DOMNodeInfo, StorageData, PerformanceMetrics,
  CDPSubscriber, CDPBindingCalledParams} from './types';
import { createLogger } from '../utils/logger';

const log = createLogger('CDP');

export type { CDPSubscriber };

/**
 * Name of the CDP isolated world that hosts Wingman Vision bindings and the
 * listener script. Page JS in the main world cannot see globals declared in
 * this world, which closes the `window.__tandem*` fingerprint leak that
 * existed before this change. The name is CDP-internal — pages never see it.
 */
const WINGMAN_WORLD = 'TandemVision';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AttachedSession {
  messageHandler: (_event: Electron.Event, method: string, params: Record<string, unknown>) => void;
  detachHandler: (_event: Electron.Event, reason: string) => void;
}

// ─── Manager ─────────────────────────────────────────────────────────────────

/**
 * DevToolsManager — Provides CDP (Chrome DevTools Protocol) access to webview tabs.
 *
 * Manages the debugger lifecycle (attach/detach), routes CDP events to
 * sub-captures (console, network), and provides high-level query methods
 * for DOM, storage, and performance via PageInspector.
 *
 * LIFECYCLE:
 * - Attaches to the active tab's webContents on first use (lazy)
 * - Detaches and re-attaches when the active tab changes
 * - Auto-detaches if webContents is destroyed
 *
 * IMPORTANT:
 * - Only ONE debugger can be attached to a webContents at a time
 * - If DevTools is open (user pressed F12), the debugger is already attached
 *   and our attach() will fail — we handle this gracefully
 */
export class DevToolsManager {

  // === 1. Private state ===

  private tabManager: TabManager;
  private wingmanStream?: WingmanStream;
  private activityTracker?: ActivityTracker;

  // Sub-modules (composition)
  private consoleCapture: ConsoleCapture;
  private networkCapture: NetworkCapture;
  private pageInspector: PageInspector;

  // CDP state
  private primaryWcId: number | null = null;
  private attachedSessions: Map<number, AttachedSession> = new Map();
  private dispatchWcId: number | null = null;

  // CDP subscriber system (Phase 3: security modules subscribe to events)
  private subscribers: CDPSubscriber[] = [];

  // Wingman Vision idempotency: replaces the page-visible
  // `window.__tandemVisionActive` guard that was fingerprintable from page JS.
  // The bindings + listener script live in an isolated world ('TandemVision');
  // this Set prevents double-installation on the main-process side.
  private wingmanBindingsInstalled: Set<number> = new Set();

  // === 2. Constructor ===

  constructor(tabManager: TabManager) {
    this.tabManager = tabManager;
    this.consoleCapture = new ConsoleCapture();
    this.networkCapture = new NetworkCapture(
      () => this.ensureAttached(),
      (wcId) => this.attachToTab(wcId, { makePrimary: false }),
    );
    this.pageInspector = new PageInspector(
      () => this.ensureAttached(),
      (wcId) => this.attachToTab(wcId, { makePrimary: false }),
    );
  }

  // === 3. Dependency setters ===

  setWingmanStream(stream: WingmanStream): void {
    this.wingmanStream = stream;
  }

  setActivityTracker(tracker: ActivityTracker): void {
    this.activityTracker = tracker;
  }

  // === 4. Public methods ===

  // ── CDP Subscriber System (Phase 3) ──

  /** Register a subscriber to receive specific CDP events */
  subscribe(subscriber: CDPSubscriber): void {
    // Remove existing subscriber with same name to avoid duplicates
    this.subscribers = this.subscribers.filter(s => s.name !== subscriber.name);
    this.subscribers.push(subscriber);
    log.info(`Subscriber registered: ${subscriber.name} for ${subscriber.events.join(', ')}`);
  }

  /** Remove a subscriber by name */
  unsubscribe(name: string): void {
    this.subscribers = this.subscribers.filter(s => s.name !== name);
  }

  /**
   * Enable CDP domains needed by security modules.
   * Debugger.enable is NOT enabled by default — only Network, DOM, Page are.
   * Without Debugger.enable, ScriptGuard will NOT receive Debugger.scriptParsed events.
   */
  async enableSecurityDomains(wcId?: number): Promise<void> {
    const wc = wcId
      ? await this.attachToTab(wcId, { makePrimary: false })
      : this.getAttachedWebContents();
    if (!wc || wc.isDestroyed()) return;
    try {
      await wc.debugger.sendCommand('Debugger.enable');
      await wc.debugger.sendCommand('Performance.enable');
      log.info('Security domains enabled (Debugger, Performance)');
    } catch (e) {
      log.warn('Security domain enable failed:', e instanceof Error ? e.message : e);
    }
  }

  /** Get the currently attached WebContents (for security modules that need it) */
  getAttachedWebContents(wcId?: number): WebContents | null {
    const targetWcId = wcId ?? this.dispatchWcId ?? this.primaryWcId;
    if (!targetWcId || !this.attachedSessions.has(targetWcId)) return null;
    const wc = webContents.fromId(targetWcId);
    return (wc && !wc.isDestroyed()) ? wc : null;
  }

  /** Get the webContents currently dispatching a CDP event to subscribers. */
  getDispatchWebContents(): WebContents | null {
    if (!this.dispatchWcId) return null;
    return this.getAttachedWebContents(this.dispatchWcId);
  }

  // ── Lifecycle ──

  /**
   * Ensure the debugger is attached to the active tab.
   * Call this before any CDP operation. It's idempotent.
   * Returns the attached WebContents or null if attachment failed.
   */
  async ensureAttached(): Promise<WebContents | null> {
    const wc = await this.tabManager.getActiveWebContents();
    if (!wc || wc.isDestroyed()) return null;

    return this.attach(wc, { makePrimary: true });
  }

  /**
   * Attach CDP to a specific tab by webContentsId.
   * Use this instead of ensureAttached() when you already know which tab to target
   * (e.g. on tab-focus) to avoid race conditions with TabManager's active tab state.
   */
  async attachToTab(wcId: number, opts?: { makePrimary?: boolean }): Promise<WebContents | null> {
    const wc = webContents.fromId(wcId);
    if (!wc || wc.isDestroyed()) return null;

    return this.attach(wc, { makePrimary: opts?.makePrimary ?? true });
  }

  detachFromTab(wcId: number, opts?: { skipDebuggerDetach?: boolean }): void {
    const session = this.attachedSessions.get(wcId);
    if (!session) return;
    try {
      const wc = webContents.fromId(wcId);
      if (wc && !wc.isDestroyed()) {
        wc.debugger.removeListener('message', session.messageHandler);
        wc.debugger.removeListener('detach', session.detachHandler);
      }
      if (!opts?.skipDebuggerDetach && wc && !wc.isDestroyed() && wc.debugger.isAttached()) {
        wc.debugger.detach();
      }
    } catch (e) {
      log.warn('CDP detach error (harmless):', e instanceof Error ? e.message : e);
    }
    this.attachedSessions.delete(wcId);
    if (this.primaryWcId === wcId) {
      this.primaryWcId = null;
    }
  }

  // ── Delegated: Console (→ ConsoleCapture) ──

  getConsoleEntries(opts?: { level?: string; sinceId?: number; limit?: number; search?: string; tabId?: string }): ConsoleEntry[] {
    return this.consoleCapture.getEntries(opts);
  }

  getConsoleErrors(limit?: number, tabId?: string): ConsoleEntry[] {
    return this.consoleCapture.getErrors(limit, tabId);
  }

  getConsoleCounts(tabId?: string): Record<string, number> {
    return this.consoleCapture.getCounts(tabId);
  }

  clearConsole(tabId?: string): void {
    this.consoleCapture.clear(tabId);
  }

  // ── Delegated: Network (→ NetworkCapture) ──

  getNetworkEntries(opts?: {
    limit?: number;
    domain?: string;
    type?: string;
    statusMin?: number;
    statusMax?: number;
    failed?: boolean;
    search?: string;
    tabId?: string;
    wcId?: number;
  }): CDPNetworkEntry[] {
    return this.networkCapture.getEntries(opts);
  }

  async getResponseBody(
    requestId: string,
    opts?: { tabId?: string; wcId?: number },
  ): Promise<{ body: string; base64Encoded: boolean } | null> {
    return this.networkCapture.getResponseBody(requestId, opts);
  }

  clearNetwork(tabId?: string): void {
    this.networkCapture.clear(tabId);
  }

  // ── Delegated: Page Inspection (→ PageInspector) ──

  async queryDOM(selector: string, maxResults = 10, wcId?: number): Promise<DOMNodeInfo[]> {
    return this.pageInspector.queryDOM(selector, maxResults, wcId);
  }

  async queryXPath(expression: string, maxResults = 10, wcId?: number): Promise<DOMNodeInfo[]> {
    return this.pageInspector.queryXPath(expression, maxResults, wcId);
  }

  async getStorage(wcId?: number): Promise<StorageData> {
    return this.pageInspector.getStorage(wcId);
  }

  async getPerformanceMetrics(wcId?: number): Promise<PerformanceMetrics | null> {
    return this.pageInspector.getPerformanceMetrics(wcId);
  }

  async screenshotElement(selector: string, wcId?: number): Promise<Buffer | null> {
    return this.pageInspector.screenshotElement(selector, wcId);
  }

  // ── Raw CDP ──

  /** Send an arbitrary CDP command (for advanced use) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CDP command payloads are heterogeneous and caller-defined
  async sendCommand(method: string, params?: Record<string, any>): Promise<any> {
    const wc = await this.ensureAttached();
    if (!wc) throw new Error('No active tab or CDP attach failed');

    return wc.debugger.sendCommand(method, params || {});
  }

  /** Send a CDP command to a specific attached tab without switching the primary target. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CDP command payloads are heterogeneous and caller-defined
  async sendCommandToTab(wcId: number, method: string, params?: Record<string, any>): Promise<any> {
    const wc = await this.attachToTab(wcId, { makePrimary: false });
    if (!wc) throw new Error(`No tab for webContents ${wcId} or CDP attach failed`);

    return wc.debugger.sendCommand(method, params || {});
  }

  // ── Evaluate ──

  /** Evaluate JavaScript in the page context via CDP (more powerful than wc.executeJavaScript) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Runtime.evaluate returns arbitrary page values
  async evaluate(expression: string, opts?: { returnByValue?: boolean; awaitPromise?: boolean }): Promise<any> {
    const wc = await this.ensureAttached();
    if (!wc) throw new Error('No active tab or CDP attach failed');

    const result = await wc.debugger.sendCommand('Runtime.evaluate', {
      expression,
      returnByValue: opts?.returnByValue ?? true,
      awaitPromise: opts?.awaitPromise ?? true,
      generatePreview: true,
    });

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Evaluation failed');
    }

    return result.result?.value ?? result.result;
  }

  /** Evaluate JavaScript in a specific tab without switching the primary target. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Runtime.evaluate returns arbitrary page values
  async evaluateInTab(wcId: number, expression: string, opts?: { returnByValue?: boolean; awaitPromise?: boolean }): Promise<any> {
    const wc = await this.attachToTab(wcId, { makePrimary: false });
    if (!wc) throw new Error(`No tab for webContents ${wcId} or CDP attach failed`);

    const result = await wc.debugger.sendCommand('Runtime.evaluate', {
      expression,
      returnByValue: opts?.returnByValue ?? true,
      awaitPromise: opts?.awaitPromise ?? true,
      generatePreview: true,
    });

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Evaluation failed');
    }

    return result.result?.value ?? result.result;
  }

  // ── Status ──

  getStatus(target?: {
    tabId?: string;
    wcId?: number;
  }): {
    attached: boolean;
    tabId: string | null;
    wcId: number | null;
    console: { entries: number; errors: number; lastId: number };
    network: { entries: number };
  } {
    const scopedWcId = target?.wcId ?? (target?.tabId ? this.findWcIdByTabId(target.tabId) ?? null : null);
    const wcId = target ? scopedWcId : this.primaryWcId;
    const tabId = target?.tabId ?? (wcId ? this.findTabIdByWcId(wcId) || null : null);
    return {
      attached: wcId !== null && this.attachedSessions.has(wcId),
      tabId,
      wcId,
      console: {
        entries: this.consoleCapture.getEntryCount(tabId ?? undefined),
        errors: this.consoleCapture.getErrors(Number.MAX_SAFE_INTEGER, tabId ?? undefined).length,
        lastId: this.consoleCapture.getLastEntryId(tabId ?? undefined),
      },
      network: {
        entries: this.networkCapture.getEntryCount({ tabId: tabId ?? undefined, wcId: wcId ?? undefined }),
      },
    };
  }

  // === 6. Cleanup ===

  destroy(): void {
    for (const wcId of Array.from(this.attachedSessions.keys())) {
      this.detachFromTab(wcId);
    }
    this.consoleCapture.clear();
    this.networkCapture.clear();
  }

  // === 7. Private helpers ===

  private async attach(wc: WebContents, opts?: { makePrimary?: boolean }): Promise<WebContents | null> {
    if (this.attachedSessions.has(wc.id)) {
      if (opts?.makePrimary ?? true) {
        this.primaryWcId = wc.id;
      }
      return wc;
    }

    try {
      wc.debugger.attach('1.3');
    } catch (e) {
      // Already attached (DevTools open, or stealth pre-attach) or other error.
      // Note: Electron 40 returns "Debugger is already attached to the target"
      // (lowercase 'already'), not "Already attached" — use case-insensitive check.
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('already attached')) {
        // DevTools is open or another component attached first — share the session.
        log.info('⚠️ CDP debugger already attached — sharing session');
      } else {
        log.warn('❌ CDP attach failed:', msg);
        return null;
      }
    }

    if (opts?.makePrimary ?? true) {
      this.primaryWcId = wc.id;
    }

    // Listen for CDP events
    const messageHandler = (_event: Electron.Event, method: string, params: Record<string, unknown>) => {
      this.handleCDPEvent(wc.id, method, params);
    };
    wc.debugger.on('message', messageHandler);

    // Auto-detach on destruction
    const detachHandler = (_event: Electron.Event, reason: string) => {
      log.info(`🔌 CDP detached: ${reason}`);
      this.detachFromTab(wc.id, { skipDebuggerDetach: true });
    };
    wc.debugger.on('detach', detachHandler);
    this.attachedSessions.set(wc.id, { messageHandler, detachHandler });

    // Enable domains
    const tabId = this.findTabId(wc);
    try {
      await this.consoleCapture.enable(wc, tabId);
      await wc.debugger.sendCommand('Network.enable', {
        maxPostDataSize: 65536,         // capture POST bodies up to 64KB
        maxResourceBufferSize: 10000000, // 10MB buffer
        maxTotalBufferSize: 50000000,    // 50MB total
      });
      await wc.debugger.sendCommand('DOM.enable');
      await wc.debugger.sendCommand('Page.enable');
      // Enable Debugger + Performance early so ScriptGuard sees scriptParsed events
      // from the very first moments of page load (reduces monitor injection race window)
      await wc.debugger.sendCommand('Debugger.enable');
      await wc.debugger.sendCommand('Performance.enable');
    } catch (e) {
      log.warn('⚠️ CDP domain enable partially failed:', e instanceof Error ? e.message : e);
      // Continue — some domains may have succeeded
    }

    // Wingman Vision: install stealth bindings for scroll/selection/form tracking
    await this.installWingmanBindings(wc);

    return wc;
  }

  private async installWingmanBindings(wc: WebContents): Promise<void> {
    if (!this.wingmanStream) return;
    // Main-process idempotency guard: replaces the former main-world
    // `window.__tandemVisionActive` flag that was fingerprintable from page JS.
    if (this.wingmanBindingsInstalled.has(wc.id)) return;

    try {
      // Stealth posture: the Wingman Vision bindings and the listener script
      // both live in an ISOLATED world named 'TandemVision'. Page JS in the
      // main world cannot see `__tandemScroll`, `__tandemSelection`, or
      // `__tandemFormFocus` on its `window`, and cannot enumerate any
      // Tandem-branded global. The binding surface is invisible to the page
      // while still fully callable from inside the isolated world.
      await wc.debugger.sendCommand('Runtime.addBinding', {
        name: '__tandemScroll',
        executionContextName: WINGMAN_WORLD,
      });
      await wc.debugger.sendCommand('Runtime.addBinding', {
        name: '__tandemSelection',
        executionContextName: WINGMAN_WORLD,
      });
      await wc.debugger.sendCommand('Runtime.addBinding', {
        name: '__tandemFormFocus',
        executionContextName: WINGMAN_WORLD,
      });

      // Inject listeners into the isolated world
      await this.injectWingmanListeners(wc);
      this.wingmanBindingsInstalled.add(wc.id);
    } catch (e) {
      log.warn('⚠️ Wingman Vision bindings failed:', e instanceof Error ? e.message : e);
    }
  }

  private async injectWingmanListeners(wc: WebContents): Promise<void> {
    // Script runs inside the 'TandemVision' isolated world. No need for a
    // `window.__tandemVisionActive` guard — the main-process side already
    // guarantees installWingmanBindings only runs once per webContents
    // (wingmanBindingsInstalled Set).
    const script = `(function(){
      // --- Scroll ---
      var _sT=null, _lastPct=-1;
      window.addEventListener('scroll', function(){
        if(_sT) clearTimeout(_sT);
        _sT = setTimeout(function(){
          var h = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
          var pct = Math.round((window.scrollY / h) * 100);
          if(pct !== _lastPct){ _lastPct = pct; __tandemScroll(String(pct)); }
        }, 2000);
      }, {passive:true});

      // --- Text Selection ---
      var _selT=null;
      document.addEventListener('selectionchange', function(){
        if(_selT) clearTimeout(_selT);
        _selT = setTimeout(function(){
          var s = (window.getSelection()||'').toString().trim();
          if(s.length > 10) __tandemSelection(s.substring(0, 500));
        }, 800);
      });

      // --- Form Focus ---
      var _lastField='';
      document.addEventListener('focusin', function(e){
        var t = e.target;
        if(!t || !t.tagName) return;
        var tag = t.tagName.toLowerCase();
        if(tag==='input'||tag==='textarea'||tag==='select'||t.isContentEditable){
          var name = t.name || t.id || t.placeholder || t.getAttribute('aria-label') || '';
          var type = t.type || tag;
          var key = type+':'+name;
          if(key !== _lastField){ _lastField = key; __tandemFormFocus(JSON.stringify({type:type,name:name})); }
        }
      }, true);
    })()`;

    try {
      // Future navigations: script auto-runs in the named isolated world
      await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: script,
        worldName: WINGMAN_WORLD,
      });

      // Current document: create the isolated world explicitly for this frame,
      // then evaluate inside it.
      try {
        const frame = await wc.debugger.sendCommand('Page.getFrameTree') as { frameTree?: { frame?: { id?: string } } };
        const frameId = frame?.frameTree?.frame?.id;
        if (frameId) {
          const isolated = await wc.debugger.sendCommand('Page.createIsolatedWorld', {
            frameId,
            worldName: WINGMAN_WORLD,
            grantUniveralAccess: true,
          }) as { executionContextId?: number };
          if (typeof isolated?.executionContextId === 'number') {
            await wc.debugger.sendCommand('Runtime.evaluate', {
              expression: script,
              silent: true,
              returnByValue: true,
              contextId: isolated.executionContextId,
            });
          }
        }
      } catch {
        // current-page inject is best-effort; addScriptToEvaluateOnNewDocument
        // will still fire on the next navigation.
      }
    } catch {
      // Page may not be ready
    }
  }

  /** Route CDP events to sub-captures and subscribers */
  private handleCDPEvent(wcId: number, method: string, params: Record<string, unknown>): void {
    const previousDispatchWcId = this.dispatchWcId;
    this.dispatchWcId = wcId;
    const tabId = this.findTabIdByWcId(wcId);

    try {
      // Wingman Vision: binding callbacks (check before subscribers for __tandem* bindings)
      if (method === 'Runtime.bindingCalled') {
        // Wingman bindings — handle internally
        const wingmanBindings = ['__tandemScroll', '__tandemSelection', '__tandemFormFocus'];
        if (wingmanBindings.includes(params.name as string)) {
          this.onWingmanBinding(params as unknown as CDPBindingCalledParams, tabId, wcId);
        }
        // Fall through to subscribers (security bindings like __tandemSecurityAlert)
      }

      // Console events
      if (method !== 'Runtime.bindingCalled') {
        if (this.consoleCapture.handleEvent(method, params, tabId)) {
          // Still dispatch to subscribers even if console handled it
        }
      }

      // Network events
      this.networkCapture.handleEvent(method, params, tabId, wcId);

      // Dispatch to subscribers (always — security modules need to see all events)
      for (const sub of this.subscribers) {
        if (sub.events.includes(method) || sub.events.includes('*')) {
          try {
            sub.handler(method, params);
          } catch (err) {
            log.error(`Subscriber ${sub.name} error:`, err);
          }
        }
      }
    } finally {
      this.dispatchWcId = previousDispatchWcId;
    }
  }

  private onWingmanBinding(params: { name: string; payload: string }, tabId?: string, wcId?: number): void {
    if (!this.wingmanStream) return;
    const timestamp = Date.now();
    const tab = tabId || 'unknown';

    // Get current URL for context
    const wc = wcId ? webContents.fromId(wcId) : null;
    const url = wc && !wc.isDestroyed() ? wc.getURL() : '';

    switch (params.name) {
      case '__tandemScroll': {
        const scrollPct = parseInt(params.payload, 10);
        this.wingmanStream.emitDebounced(`scroll-${tab}`, {
          type: 'scroll-position',
          tabId: tab,
          timestamp,
          data: { scrollPercent: scrollPct, url },
        }, 3000);
        this.activityTracker?.onWebviewEvent({
          type: 'scroll-position', tabId: tab, scrollPercent: scrollPct, url,
        });
        break;
      }

      case '__tandemSelection':
        this.wingmanStream.emitDebounced(`select-${tab}`, {
          type: 'text-selected',
          tabId: tab,
          timestamp,
          data: { text: params.payload, url },
        }, 1000);
        this.activityTracker?.onWebviewEvent({
          type: 'text-selected', tabId: tab, text: params.payload, url,
        });
        break;

      case '__tandemFormFocus':
        try {
          const field = JSON.parse(params.payload);
          this.wingmanStream.emitDebounced(`form-${tab}`, {
            type: 'form-interaction',
            tabId: tab,
            timestamp,
            data: { fieldType: field.type, fieldName: field.name, url },
          }, 2000);
          this.activityTracker?.onWebviewEvent({
            type: 'form-interaction', tabId: tab, fieldType: field.type, fieldName: field.name, url,
          });
        } catch { /* invalid JSON, skip */ }
        break;
    }
  }

  private findTabId(wc: WebContents): string | undefined {
    return this.findTabIdByWcId(wc.id);
  }

  private findTabIdByWcId(wcId: number): string | undefined {
    const tabs = this.tabManager.listTabs();
    return tabs.find(t => t.webContentsId === wcId)?.id;
  }

  private findWcIdByTabId(tabId: string): number | undefined {
    return this.tabManager.getTab(tabId)?.webContentsId;
  }
}
