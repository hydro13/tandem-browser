import { WebContents, webContents } from 'electron';
import { TabManager } from '../tabs/manager';
import { ConsoleCapture } from './console-capture';
import { CopilotStream } from '../activity/copilot-stream';
import { ActivityTracker } from '../activity/tracker';
import { ConsoleEntry, CDPNetworkEntry, CDPNetworkRequest, CDPNetworkResponse, DOMNodeInfo, StorageData, PerformanceMetrics } from './types';

const MAX_NETWORK_ENTRIES = 300;
const MAX_RESPONSE_BODY_SIZE = 1_000_000; // 1MB

/** CDP event subscriber — used by security modules to receive CDP events */
export interface CDPSubscriber {
  name: string;
  events: string[];  // CDP event names to subscribe to, or ['*'] for all
  handler: (method: string, params: any) => void;
}

/**
 * DevToolsManager — Provides CDP (Chrome DevTools Protocol) access to webview tabs.
 *
 * Manages the debugger lifecycle (attach/detach), routes CDP events to
 * sub-captures (console, network), and provides high-level query methods
 * for DOM, storage, and performance.
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
  private consoleCapture: ConsoleCapture;
  private copilotStream?: CopilotStream;
  private activityTracker?: ActivityTracker;

  // CDP state
  private attachedWcId: number | null = null;
  private attached = false;

  // CDP subscriber system (Phase 3: security modules subscribe to events)
  private subscribers: CDPSubscriber[] = [];

  // Network capture (inline — simpler than separate class for MVP)
  private networkEntries: Map<string, CDPNetworkEntry> = new Map();
  private networkOrder: string[] = []; // insertion order for ring buffer

  constructor(tabManager: TabManager) {
    this.tabManager = tabManager;
    this.consoleCapture = new ConsoleCapture();
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
    console.log(`[CDP] Subscriber registered: ${subscriber.name} for ${subscriber.events.join(', ')}`);
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
      console.log('[CDP] Security domains enabled (Debugger, Performance)');
    } catch (e: any) {
      console.warn('[CDP] Security domain enable failed:', e.message);
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
    } catch (e: any) {
      // Already attached (DevTools open) or other error
      if (e.message?.includes('Already attached')) {
        // DevTools is open — we can still try to use it
        console.warn('⚠️ DevTools debugger already attached (DevTools open?) — sharing session');
      } else {
        console.warn('❌ CDP attach failed:', e.message);
        return null;
      }
    }

    this.attached = true;
    this.attachedWcId = wc.id;

    // Listen for CDP events
    wc.debugger.on('message', (_event: Electron.Event, method: string, params: any) => {
      this.handleCDPEvent(method, params);
    });

    // Auto-detach on destruction
    wc.debugger.on('detach', (_event: Electron.Event, reason: string) => {
      console.log(`🔌 CDP detached: ${reason}`);
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
    } catch (e: any) {
      console.warn('⚠️ CDP domain enable partially failed:', e.message);
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
    } catch (e: any) {
      console.warn('⚠️ Copilot Vision bindings failed:', e.message);
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
    } catch (e: any) {
      console.warn('CDP detach error (harmless):', e.message);
    }
    this.attached = false;
    this.attachedWcId = null;
    this.consoleCapture.reset();
  }

  /** Route CDP events to sub-captures and subscribers */
  private handleCDPEvent(method: string, params: any): void {
    const tabId = this.attachedWcId ? this.findTabIdByWcId(this.attachedWcId) : undefined;

    // Copilot Vision: binding callbacks (check before subscribers for __tandem* bindings)
    if (method === 'Runtime.bindingCalled') {
      // Copilot bindings — handle internally
      const copilotBindings = ['__tandemScroll', '__tandemSelection', '__tandemFormFocus'];
      if (copilotBindings.includes(params.name)) {
        this.onCopilotBinding(params, tabId);
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
    if (method === 'Network.requestWillBeSent') {
      this.onNetworkRequest(params, tabId);
    } else if (method === 'Network.responseReceived') {
      this.onNetworkResponse(params);
    } else if (method === 'Network.loadingFinished') {
      this.onNetworkLoadingFinished(params);
    } else if (method === 'Network.loadingFailed') {
      this.onNetworkFailed(params);
    }

    // Dispatch to subscribers (always — security modules need to see all events)
    for (const sub of this.subscribers) {
      if (sub.events.includes(method) || sub.events.includes('*')) {
        try {
          sub.handler(method, params);
        } catch (err) {
          console.error(`[CDP] Subscriber ${sub.name} error:`, err);
        }
      }
    }
  }

  // ═══ Console ═══

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

  // ═══ Network (CDP-level, with response bodies) ═══

  private onNetworkRequest(params: any, tabId?: string): void {
    const req: CDPNetworkRequest = {
      id: params.requestId,
      url: params.request.url,
      method: params.request.method,
      headers: params.request.headers || {},
      postData: params.request.postData,
      resourceType: params.type || 'Other',
      timestamp: Date.now(),
      tabId,
    };

    this.networkEntries.set(params.requestId, { request: req });
    this.networkOrder.push(params.requestId);

    // Ring buffer
    while (this.networkOrder.length > MAX_NETWORK_ENTRIES) {
      const oldId = this.networkOrder.shift()!;
      this.networkEntries.delete(oldId);
    }
  }

  private onNetworkResponse(params: any): void {
    const entry = this.networkEntries.get(params.requestId);
    if (!entry) return;

    entry.response = {
      requestId: params.requestId,
      url: params.response.url,
      status: params.response.status,
      statusText: params.response.statusText || '',
      headers: params.response.headers || {},
      mimeType: params.response.mimeType || '',
      size: params.response.encodedDataLength || 0,
      timestamp: Date.now(),
    };

    if (entry.request) {
      entry.duration = entry.response.timestamp - entry.request.timestamp;
    }
  }

  private onNetworkLoadingFinished(params: any): void {
    const entry = this.networkEntries.get(params.requestId);
    if (entry?.response) {
      entry.response.size = params.encodedDataLength || entry.response.size;
    }
  }

  private onNetworkFailed(params: any): void {
    const entry = this.networkEntries.get(params.requestId);
    if (entry) {
      entry.failed = true;
      entry.errorText = params.errorText || 'Unknown error';
    }
  }

  /** Get network entries, optionally filtered */
  getNetworkEntries(opts?: {
    limit?: number;
    domain?: string;
    type?: string;
    statusMin?: number;
    statusMax?: number;
    failed?: boolean;
    search?: string;
  }): CDPNetworkEntry[] {
    let entries = Array.from(this.networkEntries.values());

    if (opts?.domain) {
      const d = opts.domain.toLowerCase();
      entries = entries.filter(e => {
        try { return new URL(e.request.url).hostname.includes(d); } catch { return false; }
      });
    }
    if (opts?.type) {
      const t = opts.type.toLowerCase();
      entries = entries.filter(e => e.request.resourceType.toLowerCase() === t);
    }
    if (opts?.statusMin) {
      entries = entries.filter(e => e.response && e.response.status >= opts.statusMin!);
    }
    if (opts?.statusMax) {
      entries = entries.filter(e => e.response && e.response.status <= opts.statusMax!);
    }
    if (opts?.failed !== undefined) {
      entries = entries.filter(e => !!e.failed === opts.failed);
    }
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      entries = entries.filter(e => e.request.url.toLowerCase().includes(q));
    }

    const limit = opts?.limit ?? 100;
    return entries.slice(-limit);
  }

  /** Get response body for a specific request (fetches from CDP on demand) */
  async getResponseBody(requestId: string): Promise<{ body: string; base64Encoded: boolean } | null> {
    const wc = await this.ensureAttached();
    if (!wc) return null;

    try {
      const result = await wc.debugger.sendCommand('Network.getResponseBody', { requestId });
      // Truncate large bodies
      if (result.body && result.body.length > MAX_RESPONSE_BODY_SIZE) {
        return {
          body: result.body.substring(0, MAX_RESPONSE_BODY_SIZE),
          base64Encoded: result.base64Encoded,
        };
      }
      return result;
    } catch (e: any) {
      // Body may not be available (streamed, evicted from buffer)
      return null;
    }
  }

  clearNetwork(): void {
    this.networkEntries.clear();
    this.networkOrder = [];
  }

  // ═══ DOM ═══

  /** Query DOM by CSS selector, return matching nodes */
  async queryDOM(selector: string, maxResults = 10): Promise<DOMNodeInfo[]> {
    const wc = await this.ensureAttached();
    if (!wc) return [];

    try {
      const doc = await wc.debugger.sendCommand('DOM.getDocument', { depth: 0 });
      const result = await wc.debugger.sendCommand('DOM.querySelectorAll', {
        nodeId: doc.root.nodeId,
        selector,
      });

      const nodes: DOMNodeInfo[] = [];
      for (const nodeId of (result.nodeIds || []).slice(0, maxResults)) {
        const info = await this.getNodeInfo(wc, nodeId);
        if (info) nodes.push(info);
      }
      return nodes;
    } catch (e: any) {
      console.warn('DOM query failed:', e.message);
      return [];
    }
  }

  /** Query DOM by XPath */
  async queryXPath(expression: string, maxResults = 10): Promise<DOMNodeInfo[]> {
    const wc = await this.ensureAttached();
    if (!wc) return [];

    try {
      // Use Runtime.evaluate with document.evaluate
      const result = await wc.debugger.sendCommand('Runtime.evaluate', {
        expression: `
          (() => {
            const result = document.evaluate(${JSON.stringify(expression)}, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            const nodeIds = [];
            for (let i = 0; i < Math.min(result.snapshotLength, ${maxResults}); i++) {
              const node = result.snapshotItem(i);
              // Return outerHTML snippets since we can't get nodeIds from JS
              nodeIds.push({
                nodeName: node.nodeName,
                text: node.textContent?.substring(0, 200) || '',
                html: node.outerHTML?.substring(0, 500) || '',
                attrs: node.attributes ? Array.from(node.attributes).reduce((o, a) => ({...o, [a.name]: a.value}), {}) : {},
              });
            }
            return nodeIds;
          })()
        `,
        returnByValue: true,
      });

      if (result.result?.value) {
        return result.result.value.map((n: any, i: number) => ({
          nodeId: -1,
          backendNodeId: -1,
          nodeType: 1,
          nodeName: n.nodeName,
          localName: n.nodeName.toLowerCase(),
          attributes: n.attrs || {},
          childCount: 0,
          innerText: n.text,
          outerHTML: n.html,
        }));
      }
      return [];
    } catch (e: any) {
      console.warn('XPath query failed:', e.message);
      return [];
    }
  }

  private async getNodeInfo(wc: WebContents, nodeId: number): Promise<DOMNodeInfo | null> {
    try {
      const desc = await wc.debugger.sendCommand('DOM.describeNode', {
        nodeId,
        depth: 0,
      });
      const node = desc.node;

      // Get outer HTML (truncated)
      let outerHTML = '';
      try {
        const htmlResult = await wc.debugger.sendCommand('DOM.getOuterHTML', { nodeId });
        outerHTML = htmlResult.outerHTML?.substring(0, 2000) || '';
      } catch {}

      // Get bounding box via CSS
      let boundingBox: DOMNodeInfo['boundingBox'];
      try {
        const box = await wc.debugger.sendCommand('DOM.getBoxModel', { nodeId });
        if (box.model?.content) {
          const c = box.model.content;
          boundingBox = { x: c[0], y: c[1], width: c[2] - c[0], height: c[5] - c[1] };
        }
      } catch {}

      // Get inner text via Runtime
      let innerText = '';
      try {
        const resolved = await wc.debugger.sendCommand('DOM.resolveNode', { nodeId });
        if (resolved.object?.objectId) {
          const textResult = await wc.debugger.sendCommand('Runtime.callFunctionOn', {
            objectId: resolved.object.objectId,
            functionDeclaration: 'function() { return this.innerText?.substring(0, 500) || ""; }',
            returnByValue: true,
          });
          innerText = textResult.result?.value || '';
        }
      } catch {}

      // Parse attributes into map
      const attrs: Record<string, string> = {};
      if (node.attributes) {
        for (let i = 0; i < node.attributes.length; i += 2) {
          attrs[node.attributes[i]] = node.attributes[i + 1];
        }
      }

      return {
        nodeId,
        backendNodeId: node.backendNodeId,
        nodeType: node.nodeType,
        nodeName: node.nodeName,
        localName: node.localName || node.nodeName.toLowerCase(),
        attributes: attrs,
        childCount: node.childNodeCount ?? 0,
        innerText,
        outerHTML,
        boundingBox,
      };
    } catch (e: any) {
      console.warn('getNodeInfo failed for nodeId', nodeId, ':', e.message);
      return null;
    }
  }

  // ═══ Storage ═══

  /** Get cookies, localStorage, sessionStorage for current page */
  async getStorage(): Promise<StorageData> {
    const wc = await this.ensureAttached();
    const empty: StorageData = { cookies: [], localStorage: {}, sessionStorage: {} };
    if (!wc) return empty;

    try {
      // Cookies via CDP
      const cookieResult = await wc.debugger.sendCommand('Network.getCookies');
      const cookies = (cookieResult.cookies || []).map((c: any) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite || 'None',
        expires: c.expires,
      }));

      // localStorage + sessionStorage via Runtime
      const storageResult = await wc.debugger.sendCommand('Runtime.evaluate', {
        expression: `
          (() => {
            const ls = {};
            const ss = {};
            try {
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                ls[key] = localStorage.getItem(key)?.substring(0, 1000) || '';
              }
            } catch(e) {}
            try {
              for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                ss[key] = sessionStorage.getItem(key)?.substring(0, 1000) || '';
              }
            } catch(e) {}
            return { localStorage: ls, sessionStorage: ss };
          })()
        `,
        returnByValue: true,
      });

      return {
        cookies,
        localStorage: storageResult.result?.value?.localStorage || {},
        sessionStorage: storageResult.result?.value?.sessionStorage || {},
      };
    } catch (e: any) {
      console.warn('Storage fetch failed:', e.message);
      return empty;
    }
  }

  // ═══ Performance ═══

  async getPerformanceMetrics(): Promise<PerformanceMetrics | null> {
    const wc = await this.ensureAttached();
    if (!wc) return null;

    try {
      await wc.debugger.sendCommand('Performance.enable');
      const result = await wc.debugger.sendCommand('Performance.getMetrics');
      const metrics: Record<string, number> = {};
      for (const m of result.metrics || []) {
        metrics[m.name] = m.value;
      }
      return { timestamp: Date.now(), metrics };
    } catch (e: any) {
      console.warn('Performance metrics failed:', e.message);
      return null;
    }
  }

  // ═══ Element Screenshot ═══

  async screenshotElement(selector: string): Promise<Buffer | null> {
    const wc = await this.ensureAttached();
    if (!wc) return null;

    try {
      const doc = await wc.debugger.sendCommand('DOM.getDocument', { depth: 0 });
      const result = await wc.debugger.sendCommand('DOM.querySelector', {
        nodeId: doc.root.nodeId,
        selector,
      });
      if (!result.nodeId) return null;

      const box = await wc.debugger.sendCommand('DOM.getBoxModel', { nodeId: result.nodeId });
      if (!box.model?.content) return null;

      const c = box.model.content;
      const clip = {
        x: c[0],
        y: c[1],
        width: c[2] - c[0],
        height: c[5] - c[1],
        scale: 1,
      };

      const screenshot = await wc.debugger.sendCommand('Page.captureScreenshot', {
        format: 'png',
        clip,
      });

      return Buffer.from(screenshot.data, 'base64');
    } catch (e: any) {
      console.warn('Element screenshot failed:', e.message);
      return null;
    }
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
        entries: this.networkEntries.size,
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
      case '__tandemScroll':
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
    this.networkEntries.clear();
    this.networkOrder = [];
  }
}
