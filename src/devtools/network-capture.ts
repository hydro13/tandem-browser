import type { WebContents } from 'electron';
import type {
  CDPNetworkEntry, CDPNetworkRequest,
  CDPRequestWillBeSentParams, CDPResponseReceivedParams,
  CDPLoadingFinishedParams, CDPLoadingFailedParams,
} from './types';

const MAX_NETWORK_ENTRIES = 300;
const MAX_RESPONSE_BODY_SIZE = 1_000_000; // 1MB

/**
 * NetworkCapture — Buffers network requests/responses from CDP Network domain.
 *
 * Maintains a ring buffer of the last 300 entries with request/response
 * metadata, and supports on-demand response body fetching.
 *
 * IMPORTANT: This class does NOT own the debugger attachment.
 * DevToolsManager handles attach/detach lifecycle.
 * NetworkCapture only processes events routed to it by the manager.
 */
export class NetworkCapture {
  private networkEntries: Map<string, CDPNetworkEntry> = new Map();
  private networkOrder: string[] = []; // insertion order for ring buffer
  private ensureAttached: () => Promise<WebContents | null>;

  constructor(ensureAttached: () => Promise<WebContents | null>) {
    this.ensureAttached = ensureAttached;
  }

  /**
   * Handle a CDP network event. Called by DevToolsManager's message router.
   * Returns true if this capture handled the event.
   */
  handleEvent(method: string, params: Record<string, unknown>, tabId?: string): boolean {
    switch (method) {
      case 'Network.requestWillBeSent':
        this.onNetworkRequest(params as unknown as CDPRequestWillBeSentParams, tabId);
        return true;
      case 'Network.responseReceived':
        this.onNetworkResponse(params as unknown as CDPResponseReceivedParams);
        return true;
      case 'Network.loadingFinished':
        this.onNetworkLoadingFinished(params as unknown as CDPLoadingFinishedParams);
        return true;
      case 'Network.loadingFailed':
        this.onNetworkFailed(params as unknown as CDPLoadingFailedParams);
        return true;
      default:
        return false;
    }
  }

  private onNetworkRequest(params: CDPRequestWillBeSentParams, tabId?: string): void {
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

  private onNetworkResponse(params: CDPResponseReceivedParams): void {
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

  private onNetworkLoadingFinished(params: CDPLoadingFinishedParams): void {
    const entry = this.networkEntries.get(params.requestId);
    if (entry?.response) {
      entry.response.size = params.encodedDataLength || entry.response.size;
    }
  }

  private onNetworkFailed(params: CDPLoadingFailedParams): void {
    const entry = this.networkEntries.get(params.requestId);
    if (entry) {
      entry.failed = true;
      entry.errorText = params.errorText || 'Unknown error';
    }
  }

  /** Get network entries, optionally filtered */
  getEntries(opts?: {
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
    } catch {
      // Body may not be available (streamed, evicted from buffer)
      return null;
    }
  }

  clear(): void {
    this.networkEntries.clear();
    this.networkOrder = [];
  }

  get entryCount(): number {
    return this.networkEntries.size;
  }
}
