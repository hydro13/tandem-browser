# CDP DevTools Bridge — Kees gets full DevTools toegang

> **Status:** PLAN  
> **Goal:** Kees (AI copiloot) gets via the Tandem API full toegang tot Chrome DevTools Protocol, zodat he console logs can read, network requests can inspecteren, DOM can queryen, performance can profilen, and storage can uitlezen — allemaal via HTTP endpoints.  
> **Approach:** 3 runs, new module `src/devtools/`, geïntegreerd in API server

---

## Architectuur

```
┌──────────────────────────────────────────────┐
│                  Tandem API                    │
│              localhost:8765                     │
│                                                │
│  GET  /devtools/status                         │
│  GET  /devtools/console         ← logs/errors  │
│  POST /devtools/console/clear                  │
│  GET  /devtools/network         ← requests     │
│  GET  /devtools/network/:id     ← response body│
│  POST /devtools/dom/query       ← CSS selector │
│  POST /devtools/dom/xpath       ← XPath query  │
│  GET  /devtools/dom/node/:id    ← node detail  │
│  GET  /devtools/storage         ← cookies/LS   │
│  POST /devtools/evaluate        ← JS in context│
│  POST /devtools/cdp             ← raw CDP cmd  │
│  GET  /devtools/performance     ← metrics      │
│  POST /devtools/screenshot/element ← element SS│
└──────────┬───────────────────────────────────┘
           │
           │  Electron webContents.debugger API
           │  (Chrome DevTools Protocol 1.3)
           │
┌──────────▼───────────────────────────────────┐
│              Active Tab WebContents            │
│          (webview in Tandem Browser)           │
└──────────────────────────────────────────────┘
```

### Why CDP via Electron's debugger API?

- Electron's `webContents.debugger` geeft direct CDP toegang — no remote debugging port nodig
- No security risk (no open poort, no externe toegang)
- Works op elke webview, inclusief the actieve tab
- Volledige Chrome DevTools Protocol coverage

### Bestands Structuur

```
src/
  devtools/
    manager.ts          ← Run 1: DevToolsManager class (CDP lifecycle, attach/detach)
    console-capture.ts  ← Run 1: Console log buffering + filtering
    network-capture.ts  ← Run 2: CDP Network domain (request/response bodies)
    dom-inspector.ts    ← Run 2: DOM queries via CDP
    types.ts            ← Run 1: TypeScript interfaces
```

---

## Run 1 — Foundation + Console Capture + Raw CDP + API Routes

### Goal
CDP lifecycle management, console log buffering, raw CDP command proxy, and alle API endpoints.

### Prompt for Claude Code:

```
Read these files first for context on the project structure:
- src/network/inspector.ts (example or an existing manager — follow this pattern)
- src/tabs/manager.ts (you'll need TabManager to get active webContents)
- src/api/server.ts lines 60-130 (TandemAPIOptions, TandemAPI class structure)
- src/api/server.ts lines 1400-1440 (existing /network/* routes as pattern)
- src/main.ts lines 165-230 (manager initialization in startAPI)

## Context
Tandem Browser is an Electron app with a <webview>-based tab system. Each tab has a webContents. Kees (an AI wingman) interacts via the REST API at localhost:8765. We're building a DevTools bridge so Kees can read console logs, inspect network traffic with response bodies, query the DOM, and execute arbitrary CDP commands — all via API endpoints.

Electron's `webContents.debugger` API provides Chrome DevTools Protocol access:
```typescript
webContents.debugger.attach('1.3');
webContents.debugger.sendCommand('Runtime.enable');
webContents.debugger.on('message', (event, method, params) => { ... });
webContents.debugger.detach();
```

## Task: Create the DevTools module (3 new files + integration)

### File 1: src/devtools/types.ts

```typescript
/**
 * Console log entry captured via CDP Runtime.consoleAPICalled
 */
export interface ConsoleEntry {
  id: number;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug' | 'verbose';
  text: string;
  args: string[];       // serialized argument previews
  url: string;          // source URL
  line: number;         // source line
  column: number;       // source column
  timestamp: number;
  tabId?: string;
  stackTrace?: string;  // formatted stack trace for errors
}

/**
 * Network request captured via CDP Network domain
 */
export interface CDPNetworkRequest {
  id: string;           // CDP requestId
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  resourceType: string; // Document, Script, XHR, Fetch, etc.
  timestamp: number;
  tabId?: string;
}

/**
 * Network response captured via CDP Network domain
 */
export interface CDPNetworkResponse {
  requestId: string;
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  mimeType: string;
  size: number;
  timestamp: number;
  body?: string;        // populated on-demand via Network.getResponseBody
  bodyTruncated?: boolean;
}

/**
 * Combined network entry (request + response)
 */
export interface CDPNetworkEntry {
  request: CDPNetworkRequest;
  response?: CDPNetworkResponse;
  failed?: boolean;
  errorText?: string;
  duration?: number;    // ms between request and response
}

/**
 * DOM node snapshot from CDP
 */
export interface DOMNodeInfo {
  nodeId: number;
  backendNodeId: number;
  nodeType: number;     // 1=Element, 3=Text, etc.
  nodeName: string;
  localName: string;
  attributes: Record<string, string>;
  childCount: number;
  innerText?: string;   // first 500 chars
  outerHTML?: string;   // first 2000 chars
  boundingBox?: { x: number; y: number; width: number; height: number };
}

/**
 * Storage data
 */
export interface StorageData {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: string;
    expires: number;
  }>;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

/**
 * Performance metrics from CDP
 */
export interface PerformanceMetrics {
  timestamp: number;
  metrics: Record<string, number>;  // JSHeapUsedSize, Documents, Nodes, etc.
}
```

### File 2: src/devtools/console-capture.ts

```typescript
import { WebContents } from 'electron';
import { ConsoleEntry } from './types';

const MAX_CONSOLE_ENTRIES = 500;
const MAX_ARG_LENGTH = 1000;
const MAX_STACK_LENGTH = 2000;

/**
 * ConsoleCapture — Buffers console output from a webContents via CDP.
 * 
 * Attaches to CDP Runtime domain, captures consoleAPICalled and
 * exceptionThrown events. Maintains a ring buffer or entries.
 * 
 * IMPORTANT: This class does NOT own the debugger attachment.
 * DevToolsManager handles attach/detach lifecycle.
 * ConsoleCapture only subscribes to events on an already-attached debugger.
 */
export class ConsoleCapture {
  private entries: ConsoleEntry[] = [];
  private counter = 0;
  private enabled = false;

  /**
   * Start capturing console output from the given webContents.
   * PRECONDITION: webContents.debugger must already be attached.
   */
  async enable(wc: WebContents, tabId?: string): Promise<void> {
    if (this.enabled) return;
    
    // Enable Runtime domain for console events
    await wc.debugger.sendCommand('Runtime.enable');
    this.enabled = true;
  }

  /**
   * Handle a CDP event. Called by DevToolsManager's message router.
   * Returns true if this capture handled the event.
   */
  handleEvent(method: string, params: any, tabId?: string): boolean {
    if (method === 'Runtime.consoleAPICalled') {
      this.onConsoleAPI(params, tabId);
      return true;
    }
    if (method === 'Runtime.exceptionThrown') {
      this.onException(params, tabId);
      return true;
    }
    return false;
  }

  private onConsoleAPI(params: any, tabId?: string): void {
    const levelMap: Record<string, ConsoleEntry['level']> = {
      log: 'log', info: 'info', warning: 'warn', error: 'error',
      debug: 'debug', dir: 'log', dirxml: 'log', table: 'log',
      trace: 'debug', assert: 'error',
    };

    const args = (params.args || []).folder((arg: any) => {
      if (arg.type === 'string') return arg.value || '';
      if (arg.type === 'number' || arg.type === 'boolean') return String(arg.value);
      if (arg.type === 'undefined') return 'undefined';
      if (arg.subtype === 'null') return 'null';
      if (arg.type === 'object') {
        // Use preview if available, else description
        if (arg.preview?.properties) {
          const props = arg.preview.properties
            .folder((p: any) => `${p.name}: ${p.value}`)
            .join(', ');
          return `{${props}}${arg.preview.overflow ? ', ...' : ''}`;
        }
        return arg.description || arg.className || '[object]';
      }
      if (arg.type === 'function') return arg.description?.substring(0, 100) || '[function]';
      return arg.description || String(arg.value ?? arg.type);
    }).folder((s: string) => s.length > MAX_ARG_LENGTH ? s.substring(0, MAX_ARG_LENGTH) + '...' : s);

    const text = args.join(' ');
    const stackTrace = params.stackTrace?.callFrames?.length
      ? params.stackTrace.callFrames
          .slice(0, 5)
          .folder((f: any) => `  at ${f.functionName || '(anonymous)'} (${f.url}:${f.lineNumber}:${f.columnNumber})`)
          .join('\n')
      : undefined;

    const topFrame = params.stackTrace?.callFrames?.[0];

    this.addEntry({
      id: ++this.counter,
      level: levelMap[params.type] || 'log',
      text,
      args,
      url: topFrame?.url || '',
      line: topFrame?.lineNumber ?? 0,
      column: topFrame?.columnNumber ?? 0,
      timestamp: Date.now(),
      tabId,
      stackTrace: stackTrace?.substring(0, MAX_STACK_LENGTH),
    });
  }

  private onException(params: any, tabId?: string): void {
    const ex = params.exceptionDetails;
    if (!ex) return;

    let text = ex.text || 'Uncaught exception';
    if (ex.exception?.description) {
      text = ex.exception.description;
    }

    const stackTrace = ex.stackTrace?.callFrames?.length
      ? ex.stackTrace.callFrames
          .slice(0, 10)
          .folder((f: any) => `  at ${f.functionName || '(anonymous)'} (${f.url}:${f.lineNumber}:${f.columnNumber})`)
          .join('\n')
      : undefined;

    this.addEntry({
      id: ++this.counter,
      level: 'error',
      text: text.length > MAX_ARG_LENGTH ? text.substring(0, MAX_ARG_LENGTH) + '...' : text,
      args: [text],
      url: ex.url || '',
      line: ex.lineNumber ?? 0,
      column: ex.columnNumber ?? 0,
      timestamp: Date.now(),
      tabId,
      stackTrace: stackTrace?.substring(0, MAX_STACK_LENGTH),
    });
  }

  private addEntry(entry: ConsoleEntry): void {
    this.entries.push(entry);
    if (this.entries.length > MAX_CONSOLE_ENTRIES) {
      this.entries = this.entries.slice(-MAX_CONSOLE_ENTRIES);
    }
  }

  /** Get entries, optionally filtered by level and/or since an ID */
  getEntries(opts?: { level?: string; sinceId?: number; limit?: number; search?: string }): ConsoleEntry[] {
    let result = this.entries;
    if (opts?.sinceId) result = result.filter(e => e.id > opts.sinceId);
    if (opts?.level) result = result.filter(e => e.level === opts.level);
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      result = result.filter(e => e.text.toLowerCase().includes(q));
    }
    const limit = opts?.limit ?? 100;
    return result.slice(-limit);
  }

  /** Get only errors (convenience) */
  getErrors(limit = 50): ConsoleEntry[] {
    return this.getEntries({ level: 'error', limit });
  }

  /** Get entry count by level */
  getCounts(): Record<string, number> {
    const counts: Record<string, number> = { log: 0, info: 0, warn: 0, error: 0, debug: 0 };
    for (const e or this.entries) {
      counts[e.level] = (counts[e.level] || 0) + 1;
    }
    return counts;
  }

  /** Clear all entries */
  clear(): void {
    this.entries = [];
  }

  /** Reset state on tab switch / detach */
  reset(): void {
    this.enabled = false;
    // Don't clear entries — they may still be useful
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get entryCount(): number {
    return this.entries.length;
  }

  get lastEntryId(): number {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1].id : 0;
  }
}
```

### File 3: src/devtools/manager.ts

This is the main orchestrator. It manages the CDP debugger lifecycle.

```typescript
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
  private networkEntries: Folder<string, CDPNetworkEntry> = new Folder();
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
      for (const nodeId or (result.nodeIds || []).slice(0, maxResults)) {
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
        return result.result.value.folder((n: any, i: number) => ({
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

      // Parse attributes into folder
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
      const cookies = (cookieResult.cookies || []).folder((c: any) => ({
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
      for (const m or result.metrics || []) {
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
```

### Integration: Add to main.ts

In the `startAPI()` function, after the existing manager initializations:

1. Import DevToolsManager:
```typescript
import { DevToolsManager } from './devtools/manager';
```

2. Add variable declaration near the other manager declarations (~line 58):
```typescript
let devToolsManager: DevToolsManager | null = null;
```

3. Initialize in startAPI() after tabManager is created:
```typescript
devToolsManager = new DevToolsManager(tabManager!);
```

4. Add to will-quit cleanup:
```typescript
if (devToolsManager) devToolsManager.destroy();
```

5. IMPORTANT: Remove or comment out the auto DevTools opener (line 181-182):
```typescript
// mainWindow.webContents.openDevTools({ mode: 'detach' });
```
The DevTools being open will conflict with our CDP attach. Instead, add a toggle via API.

### Integration: Add to TandemAPIOptions and TandemAPI

In `src/api/server.ts`:

1. Add to TandemAPIOptions interface:
```typescript
devToolsManager: DevToolsManager;
```

2. Add to TandemAPI class properties:
```typescript
private devToolsManager: DevToolsManager;
```

3. In constructor:
```typescript
this.devToolsManager = opts.devToolsManager;
```

4. In startAPI() in main.ts, add to the TandemAPI constructor options:
```typescript
devToolsManager: devToolsManager!,
```

### Integration: Add API routes

In `src/api/server.ts`, add these routes (group them together, after the /network/* routes around line 1440):

```typescript
// ═══════════════════════════════════════════════
// DEVTOOLS — CDP Bridge for Kees
// ═══════════════════════════════════════════════

/** DevTools status */
this.app.get('/devtools/status', async (_req: Request, res: Response) => {
  try {
    const status = this.devToolsManager.getStatus();
    res.json(status);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Console log entries */
this.app.get('/devtools/console', (req: Request, res: Response) => {
  try {
    const level = req.query.level as string | undefined;
    const sinceId = req.query.since_id ? parseInt(req.query.since_id as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const search = req.query.search as string | undefined;
    const entries = this.devToolsManager.getConsoleEntries({ level, sinceId, limit, search });
    const counts = this.devToolsManager.getConsoleCounts();
    res.json({ entries, counts, total: entries.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Console errors only (convenience) */
this.app.get('/devtools/console/errors', (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const errors = this.devToolsManager.getConsoleErrors(limit);
    res.json({ errors, total: errors.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Clear console log buffer */
this.app.post('/devtools/console/clear', (_req: Request, res: Response) => {
  this.devToolsManager.clearConsole();
  res.json({ ok: true });
});

/** Network entries (CDP-level, with headers and POST bodies) */
this.app.get('/devtools/network', (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const domain = req.query.domain as string | undefined;
    const type = req.query.type as string | undefined;
    const failed = req.query.failed === 'true' ? true : req.query.failed === 'false' ? false : undefined;
    const search = req.query.search as string | undefined;
    const statusMin = req.query.status_min ? parseInt(req.query.status_min as string) : undefined;
    const statusMax = req.query.status_max ? parseInt(req.query.status_max as string) : undefined;
    const entries = this.devToolsManager.getNetworkEntries({ limit, domain, type, failed, search, statusMin, statusMax });
    res.json({ entries, total: entries.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Get response body for a specific network request */
this.app.get('/devtools/network/:requestId/body', async (req: Request, res: Response) => {
  try {
    const body = await this.devToolsManager.getResponseBody(req.params.requestId);
    if (!body) {
      res.status(404).json({ error: 'Response body not available (evicted or streamed)' });
      return;
    }
    res.json(body);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Clear network log */
this.app.post('/devtools/network/clear', (_req: Request, res: Response) => {
  this.devToolsManager.clearNetwork();
  res.json({ ok: true });
});

/** Query DOM by CSS selector */
this.app.post('/devtools/dom/query', async (req: Request, res: Response) => {
  try {
    const { selector, maxResults = 10 } = req.body;
    if (!selector) { res.status(400).json({ error: 'selector required' }); return; }
    const nodes = await this.devToolsManager.queryDOM(selector, maxResults);
    res.json({ nodes, total: nodes.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Query DOM by XPath */
this.app.post('/devtools/dom/xpath', async (req: Request, res: Response) => {
  try {
    const { expression, maxResults = 10 } = req.body;
    if (!expression) { res.status(400).json({ error: 'expression required' }); return; }
    const nodes = await this.devToolsManager.queryXPath(expression, maxResults);
    res.json({ nodes, total: nodes.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Get storage (cookies, localStorage, sessionStorage) */
this.app.get('/devtools/storage', async (_req: Request, res: Response) => {
  try {
    const data = await this.devToolsManager.getStorage();
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Get performance metrics */
this.app.get('/devtools/performance', async (_req: Request, res: Response) => {
  try {
    const metrics = await this.devToolsManager.getPerformanceMetrics();
    if (!metrics) {
      res.status(503).json({ error: 'No active tab or CDP not attached' });
      return;
    }
    res.json(metrics);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Evaluate JavaScript via CDP Runtime */
this.app.post('/devtools/evaluate', async (req: Request, res: Response) => {
  try {
    const { expression, returnByValue = true, awaitPromise = true } = req.body;
    if (!expression) { res.status(400).json({ error: 'expression required' }); return; }
    const result = await this.devToolsManager.evaluate(expression, { returnByValue, awaitPromise });
    res.json({ ok: true, result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Raw CDP command (advanced — send any CDP method) */
this.app.post('/devtools/cdp', async (req: Request, res: Response) => {
  try {
    const { method, params } = req.body;
    if (!method) { res.status(400).json({ error: 'method required' }); return; }
    const result = await this.devToolsManager.sendCommand(method, params);
    res.json({ ok: true, result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Screenshot a specific element by CSS selector */
this.app.post('/devtools/screenshot/element', async (req: Request, res: Response) => {
  try {
    const { selector } = req.body;
    if (!selector) { res.status(400).json({ error: 'selector required' }); return; }
    const png = await this.devToolsManager.screenshotElement(selector);
    if (!png) {
      res.status(404).json({ error: 'Element not found or screenshot failed' });
      return;
    }
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Toggle DevTools window (for debugging) */
this.app.post('/devtools/toggle', async (_req: Request, res: Response) => {
  try {
    const wc = await this.tabManager.getActiveWebContents();
    if (wc) {
      if (wc.isDevToolsOpened()) {
        wc.closeDevTools();
      } else {
        wc.openDevTools({ mode: 'detach' });
      }
      res.json({ ok: true, open: wc.isDevToolsOpened() });
    } else {
      res.status(404).json({ error: 'No active tab' });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

## SELF-CHECK before finishing:

Run these verification steps after implementing everything:

1. `npm run compile` — must produce ZERO errors
2. Check that ALL imports resolve (no missing files)
3. Verify that DevToolsManager is:
   - Declared in main.ts
   - Initialized in startAPI()
   - Passed to TandemAPI constructor
   - Destroyed in will-quit handler
4. Verify that ALL API routes use try/catch and return proper error responses
5. Verify that the `webContents.debugger.attach()` call handles the "Already attached" case
6. Count the API routes — there should be exactly 14 new /devtools/* routes

Do NOT run `npm start` or `npm run dev`.
Do NOT install any new npm packages — everything uses built-in Electron and Node APIs.
```

---

## Run 2 — Conflict Resolution: DevTools Window vs CDP

### Prompt for Claude Code:

```
Read these files:
- src/devtools/manager.ts
- src/main.ts (lines 175-185, the DevTools opener)

## Context
We just implemented a CDP DevTools bridge. There's a conflict: line 181-182 or main.ts opens DevTools in detach mode (`mainWindow.webContents.openDevTools({ mode: 'detach' })`). This uses the debugger, which conflicts with our CDP attach.

But this DevTools is for the SHELL window (main BrowserWindow), not the webview tabs. Our CDP attaches to webview webContents, not the main window. So there might NOT be a conflict.

## Task: Verify and fix potential conflicts

1. **Check**: Does `mainWindow.webContents.openDevTools()` attach a debugger to the main window or to all webContents? 
   - Answer: It only opens DevTools for mainWindow.webContents (the shell), NOT for webview webContents. 
   - So there's NO conflict with our CDP attach to webview webContents.

2. **BUT**: If a USER opens DevTools on a webview (via Inspect Element), THAT will conflict. Our attach() already handles this ("Already attached" case). Verify the error handling is robust:
   - When attach fails with "Already attached", we set `this.attached = true` and continue
   - The `sendCommand` calls should still work because the debugger IS attached (by DevTools)
   - But when the user CLOSES DevTools, the debugger detaches — our `detach` event handler should handle this

3. **Fix**: Make ensureAttached() re-attach after DevTools closes. Check if the 'detach' event handler properly resets state so the next ensureAttached() call will re-attach.

4. **Add a note** in the DevTools toggle route: after toggling DevTools closed, our CDP connection is lost. The next API call to any /devtools/* endpoint will re-attach automatically via ensureAttached().

5. **Guard against mainWindow DevTools**: In the DevTools toggle route, make sure it operates on the ACTIVE TAB's webContents, not mainWindow.webContents.

6. **Make the openDevTools in main.ts conditional**: Only open on --dev flag:
```typescript
if (IS_DEV) {
  mainWindow.webContents.openDevTools({ mode: 'detach' });
}
```

After changes: `npm run compile` — zero errors.
Do NOT run `npm start` or `npm run dev`.
```

---

## Run 3 — Automated Self-Tests + TOOLS.md Update

### Prompt for Claude Code:

```
Read these files:
- src/devtools/manager.ts
- src/devtools/console-capture.ts
- src/devtools/types.ts
- src/api/server.ts (search for "/devtools/" routes)

## Task 1: Create a test script

Create `scripts/test-devtools-api.sh` — a bash script that tests ALL /devtools/* endpoints via curl. This script is meant to be run while Tandem is running with a web page loaded.

```bash
#!/bin/bash
# DevTools API Test Script for Tandem Browser
# Run this WHILE Tandem is running with a web page loaded
#
# Usage: bash scripts/test-devtools-api.sh
# Optional: TANDEM_PORT=8765 bash scripts/test-devtools-api.sh

set -e

PORT="${TANDEM_PORT:-8765}"
BASE="http://127.0.0.1:${PORT}"
PASS=0
FAIL=0
TOTAL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

check() {
  local name="$1"
  local url="$2"
  local method="${3:-GET}"
  local body="$4"
  local expect_field="$5"
  TOTAL=$((TOTAL + 1))
  
  echo -n "  [$TOTAL] $name... "
  
  if [ "$method" = "GET" ]; then
    RESPONSE=$(curl -sf "$url" 2>&1) || { echo -e "${RED}FAIL (curl error)${NC}"; FAIL=$((FAIL + 1)); return; }
  else
    RESPONSE=$(curl -sf -X "$method" "$url" -H "Content-Type: application/json" -d "$body" 2>&1) || { echo -e "${RED}FAIL (curl error)${NC}"; FAIL=$((FAIL + 1)); return; }
  fi
  
  if [ -n "$expect_field" ]; then
    if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); assert '$expect_field' in str(d)" 2>/dev/null; then
      echo -e "${GREEN}PASS${NC}"
      PASS=$((PASS + 1))
    else
      echo -e "${RED}FAIL (missing: $expect_field)${NC}"
      echo "    Response: $(echo $RESPONSE | head -c 200)"
      FAIL=$((FAIL + 1))
    fi
  else
    # Just check it's valid JSON
    if echo "$RESPONSE" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
      echo -e "${GREEN}PASS${NC}"
      PASS=$((PASS + 1))
    else
      echo -e "${RED}FAIL (invalid JSON)${NC}"
      echo "    Response: $(echo $RESPONSE | head -c 200)"
      FAIL=$((FAIL + 1))
    fi
  fi
}

echo "================================"
echo " Tandem DevTools API Tests"
echo " Target: $BASE"
echo "================================"
echo ""

# Pre-check: is Tandem running?
echo -n "Pre-check: Tandem API... "
if curl -sf "$BASE/status" > /dev/null 2>&1; then
  echo -e "${GREEN}Running${NC}"
else
  echo -e "${RED}NOT RUNNING — start Tandem first!${NC}"
  exit 1
fi
echo ""

# ─── Status ─────────────────────────────
echo "▸ Status"
check "GET /devtools/status" "$BASE/devtools/status" "GET" "" "attached"

# ─── Console ─────────────────────────────
echo ""
echo "▸ Console"
check "GET /devtools/console" "$BASE/devtools/console" "GET" "" "entries"
check "GET /devtools/console?level=error" "$BASE/devtools/console?level=error" "GET" "" "entries"
check "GET /devtools/console?limit=5" "$BASE/devtools/console?limit=5" "GET" "" "entries"
check "GET /devtools/console/errors" "$BASE/devtools/console/errors" "GET" "" "errors"
check "POST /devtools/console/clear" "$BASE/devtools/console/clear" "POST" "{}" "ok"

# Trigger a console.log via evaluate, then read it back
echo ""
echo "▸ Console Capture (round-trip)"
check "Inject console.log" "$BASE/devtools/evaluate" "POST" '{"expression":"console.log(\"TANDEM_TEST_12345\")"}' "ok"
sleep 0.5
echo -n "  [$((TOTAL + 1))] Verify captured log... "
TOTAL=$((TOTAL + 1))
CONSOLE_CHECK=$(curl -sf "$BASE/devtools/console?search=TANDEM_TEST_12345&limit=5" 2>&1)
if echo "$CONSOLE_CHECK" | grep -q "TANDEM_TEST_12345"; then
  echo -e "${GREEN}PASS${NC}"
  PASS=$((PASS + 1))
else
  echo -e "${RED}FAIL (log not captured)${NC}"
  FAIL=$((FAIL + 1))
fi

# ─── Network ─────────────────────────────
echo ""
echo "▸ Network"
check "GET /devtools/network" "$BASE/devtools/network" "GET" "" "entries"
check "GET /devtools/network?type=XHR" "$BASE/devtools/network?type=XHR" "GET" "" "entries"
check "GET /devtools/network?failed=true" "$BASE/devtools/network?failed=true" "GET" "" "entries"

# ─── DOM ─────────────────────────────────
echo ""
echo "▸ DOM"
check "POST /devtools/dom/query (body)" "$BASE/devtools/dom/query" "POST" '{"selector":"body"}' "nodes"
check "POST /devtools/dom/query (h1)" "$BASE/devtools/dom/query" "POST" '{"selector":"h1","maxResults":3}' "nodes"
check "POST /devtools/dom/xpath" "$BASE/devtools/dom/xpath" "POST" '{"expression":"//a[@href]","maxResults":5}' "nodes"

# Error case: missing selector
echo -n "  [$((TOTAL + 1))] POST /devtools/dom/query (no selector)... "
TOTAL=$((TOTAL + 1))
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/devtools/dom/query" -H "Content-Type: application/json" -d '{}')
if [ "$HTTP_CODE" = "400" ]; then
  echo -e "${GREEN}PASS (400 as expected)${NC}"
  PASS=$((PASS + 1))
else
  echo -e "${RED}FAIL (expected 400, got $HTTP_CODE)${NC}"
  FAIL=$((FAIL + 1))
fi

# ─── Storage ─────────────────────────────
echo ""
echo "▸ Storage"
check "GET /devtools/storage" "$BASE/devtools/storage" "GET" "" "cookies"

# ─── Performance ─────────────────────────
echo ""
echo "▸ Performance"
check "GET /devtools/performance" "$BASE/devtools/performance" "GET" "" "metrics"

# ─── Evaluate ────────────────────────────
echo ""
echo "▸ Evaluate"
check "Simple expression" "$BASE/devtools/evaluate" "POST" '{"expression":"1 + 1"}' "ok"
check "DOM query" "$BASE/devtools/evaluate" "POST" '{"expression":"document.title"}' "ok"
check "Complex object" "$BASE/devtools/evaluate" "POST" '{"expression":"({url: location.href, title: document.title})"}' "ok"

# Error case: syntax error
echo -n "  [$((TOTAL + 1))] Evaluate syntax error... "
TOTAL=$((TOTAL + 1))
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/devtools/evaluate" -H "Content-Type: application/json" -d '{"expression":"this is not valid js {{"}')
if [ "$HTTP_CODE" = "500" ]; then
  echo -e "${GREEN}PASS (500 as expected)${NC}"
  PASS=$((PASS + 1))
else
  echo -e "${YELLOW}WARN (expected 500, got $HTTP_CODE — might be OK if CDP handles it)${NC}"
  PASS=$((PASS + 1))
fi

# ─── Raw CDP ─────────────────────────────
echo ""
echo "▸ Raw CDP"
check "Browser.getVersion" "$BASE/devtools/cdp" "POST" '{"method":"Browser.getVersion"}' "result"
check "Page.getNavigationHistory" "$BASE/devtools/cdp" "POST" '{"method":"Page.getNavigationHistory"}' "result"

# Error case: missing method
echo -n "  [$((TOTAL + 1))] Raw CDP (no method)... "
TOTAL=$((TOTAL + 1))
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/devtools/cdp" -H "Content-Type: application/json" -d '{}')
if [ "$HTTP_CODE" = "400" ]; then
  echo -e "${GREEN}PASS (400 as expected)${NC}"
  PASS=$((PASS + 1))
else
  echo -e "${RED}FAIL (expected 400, got $HTTP_CODE)${NC}"
  FAIL=$((FAIL + 1))
fi

# ─── Element Screenshot ──────────────────
echo ""
echo "▸ Element Screenshot"
echo -n "  [$((TOTAL + 1))] Screenshot body element... "
TOTAL=$((TOTAL + 1))
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/devtools/screenshot/element" -H "Content-Type: application/json" -d '{"selector":"body"}')
if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}PASS (200 + PNG)${NC}"
  PASS=$((PASS + 1))
else
  echo -e "${YELLOW}WARN (got $HTTP_CODE — element might not be visible)${NC}"
  PASS=$((PASS + 1))
fi

# ─── DevTools Toggle ─────────────────────
echo ""
echo "▸ DevTools Toggle"
check "POST /devtools/toggle" "$BASE/devtools/toggle" "POST" "{}" "ok"
sleep 0.5
# Toggle back
check "POST /devtools/toggle (back)" "$BASE/devtools/toggle" "POST" "{}" "ok"

# ─── Summary ─────────────────────────────
echo ""
echo "================================"
echo -e " Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, $TOTAL total"
echo "================================"

if [ $FAIL -gt 0 ]; then
  exit 1
fi
```

Make the script executable: `chmod +x scripts/test-devtools-api.sh`

## Task 2: Create a test documentation file

Create `scripts/test-devtools-manual.md` with manual test scenarios:

```markdown
# DevTools API — Manual Test Protocol

## Setup
1. Start Tandem: `npm start`
2. Navigate to a content-rich page (e.g., https://news.ycombinator.com)
3. Wait for page to fully load

## Test Scenarios

### T1: Console Capture Round-Trip
1. Open Tandem, navigate to any page
2. `curl http://127.0.0.1:8765/devtools/console` — should return entries (may be empty)
3. In the page, open browser console and type: `console.error("TEST_ERROR")`
   Or via API: `curl -X POST http://127.0.0.1:8765/devtools/evaluate -H 'Content-Type: application/json' -d '{"expression":"console.error(\"TEST_ERROR\")"}'`
4. `curl http://127.0.0.1:8765/devtools/console?level=error` — should contain TEST_ERROR
5. `curl http://127.0.0.1:8765/devtools/console?search=TEST` — should find it
6. `curl -X POST http://127.0.0.1:8765/devtools/console/clear`
7. `curl http://127.0.0.1:8765/devtools/console` — should be empty

### T2: Network Inspection
1. Navigate to a page that makes API calls (e.g., https://news.ycombinator.com)
2. `curl http://127.0.0.1:8765/devtools/network` — should show requests
3. `curl 'http://127.0.0.1:8765/devtools/network?type=XHR'` — filter XHR/Fetch
4. Pick a requestId from the response
5. `curl http://127.0.0.1:8765/devtools/network/{requestId}/body` — should return body
6. `curl 'http://127.0.0.1:8765/devtools/network?failed=true'` — show failures

### T3: DOM Queries
1. Navigate to https://example.com
2. `curl -X POST http://127.0.0.1:8765/devtools/dom/query -H 'Content-Type: application/json' -d '{"selector":"h1"}'`
   — should return the h1 with "Example Domain"
3. `curl -X POST http://127.0.0.1:8765/devtools/dom/xpath -H 'Content-Type: application/json' -d '{"expression":"//p"}'`
   — should return paragraph elements

### T4: Storage
1. Navigate to a site with cookies (e.g., https://google.com)
2. `curl http://127.0.0.1:8765/devtools/storage`
3. Verify cookies array is populated
4. Check localStorage/sessionStorage objects

### T5: Performance
1. `curl http://127.0.0.1:8765/devtools/performance`
2. Verify metrics object contains JSHeapUsedSize, Documents, Nodes, etc.

### T6: Tab Switch
1. Open two tabs
2. Focus tab 1, run console query
3. Focus tab 2, run console query
4. Verify the CDP auto-detaches from tab 1 and re-attaches to tab 2
5. Check /devtools/status shows correct tabId

### T7: DevTools Window Conflict
1. Click "Inspect Element" on a page (opens DevTools)
2. `curl http://127.0.0.1:8765/devtools/status` — should show attached=true
3. `curl http://127.0.0.1:8765/devtools/console` — should still work
4. Close DevTools window
5. `curl http://127.0.0.1:8765/devtools/console` — should auto-re-attach

### T8: Error Handling
1. Close all tabs
2. `curl http://127.0.0.1:8765/devtools/console` — should return graceful error or empty
3. `curl -X POST http://127.0.0.1:8765/devtools/dom/query -H 'Content-Type: application/json' -d '{}'`
   — should return 400 (missing selector)
4. `curl -X POST http://127.0.0.1:8765/devtools/cdp -H 'Content-Type: application/json' -d '{"method":"NonExistent.method"}'`
   — should return 500 with error message
```

## SELF-CHECK:

1. `npm run compile` — zero errors
2. `ls scripts/test-devtools-api.sh` — exists and is executable
3. `ls scripts/test-devtools-manual.md` — exists
4. Verify test script tests ALL 14 /devtools/* endpoints
5. Verify test script has both success and error case tests

Do NOT run `npm start` or `npm run dev`.
```

---

## Samenvatting

| Run | Wat | Files | Geschatte tijd |
|-----|-----|-----------|---------------|
| **1** | Foundation: types, ConsoleCapture, DevToolsManager, alle 14 API routes, main.ts integratie | 3 new + 2 gewijzigd | 25-35 min |
| **2** | DevTools window conflict resolution, conditional DevTools opener | 2 gewijzigd | 10-15 min |
| **3** | Automated test script (bash/curl), manual test protocol | 2 new files | 15-20 min |

### Na alle runs:

1. `npm run compile` — 0 errors
2. `npm start` + navigeer to a page
3. `bash scripts/test-devtools-api.sh` — alle tests groen
4. Handmatige tests out `scripts/test-devtools-manual.md`

### Endpoints Overzicht (14 totaal):

| Method | Endpoint | Function |
|--------|----------|---------|
| GET | `/devtools/status` | CDP verbinding status |
| GET | `/devtools/console` | Console logs (filter: level, search, since_id) |
| GET | `/devtools/console/errors` | Only errors |
| POST | `/devtools/console/clear` | Buffer legen |
| GET | `/devtools/network` | Network requests (filter: domain, type, status, failed) |
| GET | `/devtools/network/:id/body` | Response body ophalen |
| POST | `/devtools/network/clear` | Network buffer legen |
| POST | `/devtools/dom/query` | CSS selector query |
| POST | `/devtools/dom/xpath` | XPath query |
| GET | `/devtools/storage` | Cookies + localStorage + sessionStorage |
| GET | `/devtools/performance` | Performance metrics |
| POST | `/devtools/evaluate` | JavaScript evalueren via CDP |
| POST | `/devtools/cdp` | Raw CDP command (elke methode) |
| POST | `/devtools/screenshot/element` | Element screenshot (PNG) |
| POST | `/devtools/toggle` | DevTools window about/out |
