import type { WebContents } from 'electron';
import { webContents } from 'electron';
import type { TabManager } from '../tabs/manager';
import { ConsoleCapture } from './console-capture';
import { NetworkCapture } from './network-capture';
import { PageInspector } from './page-inspector';
import type { CopilotStream } from '../activity/copilot-stream';
import type { ActivityTracker } from '../activity/tracker';
import type {
  ConsoleEntry, CDPNetworkEntry, DOMNodeInfo, StorageData, PerformanceMetrics,
  CDPSubscriber, CDPBindingCalledParams} from './types';
import { createLogger } from '../utils/logger';

const log = createLogger('CDP');

export type { CDPSubscriber };

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
  private tabManager: TabManager;
  private copilotStream?: CopilotStream;
  private activityTracker?: ActivityTracker;

  // Sub-modules (composition)
  private consoleCapture: ConsoleCapture;
  private networkCapture: NetworkCapture;
  private pageInspector: PageInspector;

  // CDP state
  private attachedWcId: number | null = null;
  private attached = false;

  // CDP subscriber system (Phase 3: security modules subscribe to events)
  private subscribers: CDPSubscriber[] = [];

  constructor(tabManager: TabManager) {
    this.tabManager = tabManager;
    this.consoleCapture = new ConsoleCapture();
    this.networkCapture = new NetworkCapture(() => this.ensureAttached());
    this.pageInspector = new PageInspector(() => this.ensureAttached());
  }

  setCopilotStream(stream: CopilotStream): void {
    this.copilotStream = stream;
  }

  setActivityTracker(tracker: ActivityTracker): void {
    this.activityTracker = tracker;
  }

  // ═══ CDP Subscriber System (Phase 3) ═══

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
  async enableSecurityDomains(): Promise<void> {
    if (!this.attached || !this.attachedWcId) return;
    const wc = webContents.fromId(this.attachedWcId);
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
  getAttachedWebContents(): WebContents | null {
    if (!this.attached || !this.attachedWcId) return null;
    const wc = webContents.fromId(this.attachedWcId);
    return (wc && !wc.isDestroyed()) ? wc : null;
  }

  // ═══ Lifecycle ═══

  /**
   * Ensure the debugger is attached to the active tab.
   * Call this before any CDP operation. It's idempotent.
   * Returns the attached WebContents or null if attachment failed.
   */
  async ensureAttached(): Promise<WebContents | null> {
    const wc = await this.tabManager.getActiveWebContents();
    if (!wc || wc.isDestroyed()) return null;

    // Already attached to this webContents
    if (this.attached && this.attachedWcId === wc.id) return wc;

    // Different tab — detach from old, attach to new
    if (this.attached && this.attachedWcId !== wc.id) {
      this.detach();
    }

    return this.attach(wc);
  }

  /**
   * Attach CDP to a specific tab by webContentsId.
   * Use this instead of ensureAttached() when you already know which tab to target
   * (e.g. on tab-focus) to avoid race conditions with TabManager's active tab state.
   */
  async attachToTab(wcId: number): Promise<WebContents | null> {
    const wc = webContents.fromId(wcId);
    if (!wc || wc.isDestroyed()) return null;

    // Already attached to this one
    if (this.attached && this.attachedWcId === wcId) return wc;

    // Detach from old
    if (this.attached) this.detach();

    return this.attach(wc);
  }

  private async attach(wc: WebContents): Promise<WebContents | null> {
    try {
      wc.debugger.attach('1.3');
    } catch (e) {
      // Already attached (DevTools open) or other error
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Already attached')) {
        // DevTools is open — we can still try to use it
        log.warn('⚠️ DevTools debugger already attached (DevTools open?) — sharing session');
      } else {
        log.warn('❌ CDP attach failed:', msg);
        return null;
      }
    }

    this.attached = true;
    this.attachedWcId = wc.id;

    // Listen for CDP events
    wc.debugger.on('message', (_event: Electron.Event, method: string, params: Record<string, unknown>) => {
      this.handleCDPEvent(method, params);
    });

    // Auto-detach on destruction
    wc.debugger.on('detach', (_event: Electron.Event, reason: string) => {
      log.info(`🔌 CDP detached: ${reason}`);
      this.attached = false;
      this.attachedWcId = null;
      this.consoleCapture.reset();
    });

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

    // Copilot Vision: install stealth bindings for scroll/selection/form tracking
    await this.installCopilotBindings(wc);

    return wc;
  }

  private async installCopilotBindings(wc: WebContents): Promise<void> {
    if (!this.copilotStream) return;

    try {
      // Create hidden bindings
      await wc.debugger.sendCommand('Runtime.addBinding', { name: '__tandemScroll' });
      await wc.debugger.sendCommand('Runtime.addBinding', { name: '__tandemSelection' });
      await wc.debugger.sendCommand('Runtime.addBinding', { name: '__tandemFormFocus' });

      // Inject listeners (runs in page context but communicates via invisible bindings)
      await this.injectCopilotListeners(wc);
    } catch (e) {
      log.warn('⚠️ Copilot Vision bindings failed:', e instanceof Error ? e.message : e);
    }
  }

  private async injectCopilotListeners(wc: WebContents): Promise<void> {
    const script = `(function(){
      if(window.__tandemVisionActive) return;
      window.__tandemVisionActive = true;

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
      // Use addScriptToEvaluateOnNewDocument — runs in main world, survives navigations,
      // and has reliable access to Runtime.addBinding bindings
      await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: script,
        worldName: '', // empty string = main world
      });

      // Also run it immediately on the current page (addScriptToEvaluateOnNewDocument
      // only runs on FUTURE navigations)
      await wc.debugger.sendCommand('Runtime.evaluate', {
        expression: script,
        silent: true,
        returnByValue: true,
      });
    } catch {
      // Page may not be ready
    }
  }

  private detach(): void {
    if (!this.attachedWcId) return;
    try {
      const wc = webContents.fromId(this.attachedWcId);
      if (wc && !wc.isDestroyed() && wc.debugger.isAttached()) {
        wc.debugger.detach();
      }
    } catch (e) {
      log.warn('CDP detach error (harmless):', e instanceof Error ? e.message : e);
    }
    this.attached = false;
    this.attachedWcId = null;
    this.consoleCapture.reset();
  }

  /** Route CDP events to sub-captures and subscribers */
  private handleCDPEvent(method: string, params: Record<string, unknown>): void {
    const tabId = this.attachedWcId ? this.findTabIdByWcId(this.attachedWcId) : undefined;

    // Copilot Vision: binding callbacks (check before subscribers for __tandem* bindings)
    if (method === 'Runtime.bindingCalled') {
      // Copilot bindings — handle internally
      const copilotBindings = ['__tandemScroll', '__tandemSelection', '__tandemFormFocus'];
      if (copilotBindings.includes(params.name as string)) {
        this.onCopilotBinding(params as unknown as CDPBindingCalledParams, tabId);
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
    this.networkCapture.handleEvent(method, params, tabId);

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
  }

  // === Delegated: Console (→ ConsoleCapture) ===

  getConsoleEntries(opts?: { level?: string; sinceId?: number; limit?: number; search?: string }): ConsoleEntry[] {
    return this.consoleCapture.getEntries(opts);
  }

  getConsoleErrors(limit?: number): ConsoleEntry[] {
    return this.consoleCapture.getErrors(limit);
  }

  getConsoleCounts(): Record<string, number> {
    return this.consoleCapture.getCounts();
  }

  clearConsole(): void {
    this.consoleCapture.clear();
  }

  // === Delegated: Network (→ NetworkCapture) ===

  getNetworkEntries(opts?: {
    limit?: number;
    domain?: string;
    type?: string;
    statusMin?: number;
    statusMax?: number;
    failed?: boolean;
    search?: string;
  }): CDPNetworkEntry[] {
    return this.networkCapture.getEntries(opts);
  }

  async getResponseBody(requestId: string): Promise<{ body: string; base64Encoded: boolean } | null> {
    return this.networkCapture.getResponseBody(requestId);
  }

  clearNetwork(): void {
    this.networkCapture.clear();
  }

  // === Delegated: Page Inspection (→ PageInspector) ===

  async queryDOM(selector: string, maxResults = 10): Promise<DOMNodeInfo[]> {
    return this.pageInspector.queryDOM(selector, maxResults);
  }

  async queryXPath(expression: string, maxResults = 10): Promise<DOMNodeInfo[]> {
    return this.pageInspector.queryXPath(expression, maxResults);
  }

  async getStorage(): Promise<StorageData> {
    return this.pageInspector.getStorage();
  }

  async getPerformanceMetrics(): Promise<PerformanceMetrics | null> {
    return this.pageInspector.getPerformanceMetrics();
  }

  async screenshotElement(selector: string): Promise<Buffer | null> {
    return this.pageInspector.screenshotElement(selector);
  }

  // ═══ Raw CDP ═══

  /** Send an arbitrary CDP command (for advanced use) */
  async sendCommand(method: string, params?: Record<string, any>): Promise<any> {
    const wc = await this.ensureAttached();
    if (!wc) throw new Error('No active tab or CDP attach failed');

    return wc.debugger.sendCommand(method, params || {});
  }

  // ═══ Evaluate ═══

  /** Evaluate JavaScript in the page context via CDP (more powerful than executeJS) */
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

  // ═══ Status ═══

  getStatus(): {
    attached: boolean;
    tabId: string | null;
    wcId: number | null;
    console: { entries: number; errors: number; lastId: number };
    network: { entries: number };
  } {
    const tabId = this.attachedWcId ? this.findTabIdByWcId(this.attachedWcId) || null : null;
    return {
      attached: this.attached,
      tabId,
      wcId: this.attachedWcId,
      console: {
        entries: this.consoleCapture.entryCount,
        errors: this.consoleCapture.getErrors().length,
        lastId: this.consoleCapture.lastEntryId,
      },
      network: {
        entries: this.networkCapture.entryCount,
      },
    };
  }

  // ═══ Copilot Vision ═══

  private onCopilotBinding(params: { name: string; payload: string }, tabId?: string): void {
    if (!this.copilotStream) return;
    const timestamp = Date.now();
    const tab = tabId || 'unknown';

    // Get current URL for context
    const wc = this.attachedWcId ? webContents.fromId(this.attachedWcId) : null;
    const url = wc && !wc.isDestroyed() ? wc.getURL() : '';

    switch (params.name) {
      case '__tandemScroll': {
        const scrollPct = parseInt(params.payload, 10);
        this.copilotStream.emitDebounced(`scroll-${tab}`, {
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
        this.copilotStream.emitDebounced(`select-${tab}`, {
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
          this.copilotStream.emitDebounced(`form-${tab}`, {
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

  // ═══ Helpers ═══

  private findTabId(wc: WebContents): string | undefined {
    return this.findTabIdByWcId(wc.id);
  }

  private findTabIdByWcId(wcId: number): string | undefined {
    const tabs = this.tabManager.listTabs();
    return tabs.find(t => t.webContentsId === wcId)?.id;
  }

  // ═══ Cleanup ═══

  destroy(): void {
    this.detach();
    this.consoleCapture.clear();
    this.networkCapture.clear();
  }
}
