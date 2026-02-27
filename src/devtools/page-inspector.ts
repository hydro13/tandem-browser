import type { WebContents } from 'electron';
import type { DOMNodeInfo, StorageData, PerformanceMetrics, CDPCookie } from './types';
import { createLogger } from '../utils/logger';

const log = createLogger('CDP:Inspector');

/**
 * PageInspector — Stateless CDP queries for DOM, storage, performance, and screenshots.
 *
 * All methods are on-demand queries that use CDP commands to inspect the current page.
 * No internal state is maintained between calls.
 *
 * IMPORTANT: This class does NOT own the debugger attachment.
 * DevToolsManager handles attach/detach lifecycle.
 * PageInspector receives an `ensureAttached` callback to get the active WebContents.
 */
export class PageInspector {
  private ensureAttached: () => Promise<WebContents | null>;

  constructor(ensureAttached: () => Promise<WebContents | null>) {
    this.ensureAttached = ensureAttached;
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
    } catch (e) {
      log.warn('DOM query failed:', e instanceof Error ? e.message : e);
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
        return result.result.value.map((n: { nodeName: string; attrs: Record<string, string>; text: string; html: string }) => ({
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
    } catch (e) {
      log.warn('XPath query failed:', e instanceof Error ? e.message : e);
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
      } catch { /* node may have been removed from DOM */ }

      // Get bounding box via CSS
      let boundingBox: DOMNodeInfo['boundingBox'];
      try {
        const box = await wc.debugger.sendCommand('DOM.getBoxModel', { nodeId });
        if (box.model?.content) {
          const c = box.model.content;
          boundingBox = { x: c[0], y: c[1], width: c[2] - c[0], height: c[5] - c[1] };
        }
      } catch { /* box model unavailable for hidden/detached nodes */ }

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
      } catch { /* node may not be resolvable */ }

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
    } catch (e) {
      log.warn('getNodeInfo failed for nodeId', nodeId, ':', e instanceof Error ? e.message : e);
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
      const cookies = (cookieResult.cookies || []).map((c: CDPCookie) => ({
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
    } catch (e) {
      log.warn('Storage fetch failed:', e instanceof Error ? e.message : e);
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
    } catch (e) {
      log.warn('Performance metrics failed:', e instanceof Error ? e.message : e);
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
    } catch (e) {
      log.warn('Element screenshot failed:', e instanceof Error ? e.message : e);
      return null;
    }
  }
}
