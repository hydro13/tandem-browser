import { WebContents, webContents } from 'electron';
import { TabManager } from '../tabs/manager';
import { ConsoleCapture } from './console-capture';
import { ConsoleEntry, CDPNetworkEntry, CDPNetworkRequest, CDPNetworkResponse, DOMNodeInfo, StorageData, PerformanceMetrics } from './types';

const MAX_NETWORK_ENTRIES = 300;
const MAX_RESPONSE_BODY_SIZE = 1_000_000; // 1MB

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

  // CDP state
  private attachedWcId: number | null = null;
  private attached = false;

  // Network capture (inline — simpler than separate class for MVP)
  private networkEntries: Map<string, CDPNetworkEntry> = new Map();
  private networkOrder: string[] = []; // insertion order for ring buffer

  constructor(tabManager: TabManager) {
    this.tabManager = tabManager;
    this.consoleCapture = new ConsoleCapture();
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

    return wc;
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

  /** Route CDP events to sub-captures */
  private handleCDPEvent(method: string, params: any): void {
    const tabId = this.attachedWcId ? this.findTabIdByWcId(this.attachedWcId) : undefined;

    // Console events
    if (this.consoleCapture.handleEvent(method, params, tabId)) return;

    // Network events
    if (method === 'Network.requestWillBeSent') {
      this.onNetworkRequest(params, tabId);
      return;
    }
    if (method === 'Network.responseReceived') {
      this.onNetworkResponse(params);
      return;
    }
    if (method === 'Network.loadingFinished') {
      this.onNetworkLoadingFinished(params);
      return;
    }
    if (method === 'Network.loadingFailed') {
      this.onNetworkFailed(params);
      return;
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
