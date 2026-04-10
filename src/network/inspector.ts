import path from 'path';
import fs from 'fs';
import { STATUS_CODES } from 'http';
import type { RequestDispatcher } from './dispatcher';
import { tandemDir } from '../utils/paths';
import { createLogger } from '../utils/logger';

const log = createLogger('NetworkInspector');

export interface NetworkRequest {
  id: number;
  url: string;
  method: string;
  status: number;
  contentType: string;
  size: number;
  timestamp: number;
  initiator: string;
  domain: string;
  durationMs: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string[]>;
}

interface DomainData {
  domain: string;
  requests: number;
  apis: string[];
  lastSeen: number;
}

interface HarHeader {
  name: string;
  value: string;
}

interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    cookies: unknown[];
    headers: HarHeader[];
    queryString: Array<{ name: string; value: string }>;
    headersSize: number;
    bodySize: number;
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    cookies: unknown[];
    headers: HarHeader[];
    content: {
      size: number;
      mimeType: string;
    };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: Record<string, never>;
  timings: {
    blocked: number;
    dns: number;
    connect: number;
    send: number;
    wait: number;
    receive: number;
    ssl: number;
  };
}

export interface HarExport {
  log: {
    version: '1.2';
    creator: {
      name: 'Tandem Browser';
      version: string;
    };
    pages: Array<{
      startedDateTime: string;
      id: string;
      title: string;
      pageTimings: {
        onContentLoad: number;
        onLoad: number;
      };
    }>;
    entries: HarEntry[];
  };
}

/**
 * NetworkInspector — Logs and analyzes network traffic via RequestDispatcher.
 *
 * Runs in the main process (NOT in webview) — safe for anti-detection.
 * Stores last 1000 requests in memory, flushes per-domain data to ~/.tandem/network/.
 */
export class NetworkInspector {
  private requests: NetworkRequest[] = [];
  private pendingRequests: Map<string, Partial<NetworkRequest>> = new Map();
  private counter = 0;
  private maxRequests = 1000;
  private networkDir: string;
  private domainStats: Map<string, DomainData> = new Map();

  constructor() {
    this.networkDir = tandemDir('network');
    if (!fs.existsSync(this.networkDir)) {
      fs.mkdirSync(this.networkDir, { recursive: true });
    }
  }

  /** Register as a dispatcher consumer (late registration supported) */
  registerWith(dispatcher: RequestDispatcher): void {
    dispatcher.registerBeforeRequest({
      name: 'NetworkInspector',
      priority: 100,
      handler: (details) => {
        const domain = this.extractDomain(details.url);
        if (domain && !details.url.startsWith('file://') && !details.url.startsWith('devtools://')) {
          const id = ++this.counter;
          this.pendingRequests.set(String(details.id ?? id), {
            id,
            url: details.url,
            method: details.method || 'GET',
            timestamp: Date.now(),
            domain,
            initiator: details.referrer || '',
            status: 0,
            contentType: '',
            size: 0,
            durationMs: 0,
            requestHeaders: {},
            responseHeaders: {},
          });
        }
        return null;
      }
    });

    dispatcher.registerBeforeSendHeaders({
      name: 'NetworkInspector',
      priority: 100,
      handler: (details, headers) => {
        const pending = this.pendingRequests.get(String(details.id ?? ''));
        if (pending) {
          pending.requestHeaders = { ...headers };
        }
        return headers;
      }
    });

    dispatcher.registerHeadersReceived({
      name: 'NetworkInspector',
      priority: 100,
      handler: (details, responseHeaders) => {
        const pending = this.pendingRequests.get(String(details.id ?? ''));
        if (pending) {
          pending.responseHeaders = { ...responseHeaders };
        }
        return responseHeaders;
      }
    });

    dispatcher.registerCompleted({
      name: 'NetworkInspector',
      handler: (details) => {
        const key = String(details.id ?? '');
        const pending = this.pendingRequests.get(key);
        if (pending) {
          const contentType = details.responseHeaders?.['content-type']?.[0]
            || details.responseHeaders?.['Content-Type']?.[0]
            || '';

          const req: NetworkRequest = {
            id: pending.id!,
            url: pending.url!,
            method: pending.method!,
            status: details.statusCode,
            contentType,
            size: details.responseHeaders?.['content-length']
              ? parseInt(details.responseHeaders['content-length'][0], 10) || 0
              : 0,
            timestamp: pending.timestamp!,
            initiator: pending.initiator!,
            domain: pending.domain!,
            durationMs: Math.max(0, Date.now() - pending.timestamp!),
            requestHeaders: pending.requestHeaders || {},
            responseHeaders: pending.responseHeaders || details.responseHeaders || {},
          };

          this.addRequest(req);
          this.pendingRequests.delete(key);
        }
      }
    });

    dispatcher.registerError({
      name: 'NetworkInspector',
      handler: (details) => {
        this.pendingRequests.delete(String(details.id ?? ''));
      }
    });
  }

  /** Add a completed request to the log */
  private addRequest(req: NetworkRequest): void {
    this.requests.push(req);
    if (this.requests.length > this.maxRequests) {
      this.requests = this.requests.slice(-this.maxRequests);
    }

    // Update domain stats
    let domainData = this.domainStats.get(req.domain);
    if (!domainData) {
      domainData = { domain: req.domain, requests: 0, apis: [], lastSeen: 0 };
      this.domainStats.set(req.domain, domainData);
    }
    domainData.requests++;
    domainData.lastSeen = req.timestamp;

    // Auto-discover API endpoints
    if (this.isApiEndpoint(req)) {
      const apiPath = this.extractApiPath(req.url);
      if (apiPath && !domainData.apis.includes(apiPath)) {
        domainData.apis.push(apiPath);
      }
    }
  }

  /** Check if a request looks like an API call */
  private isApiEndpoint(req: NetworkRequest): boolean {
    const ct = req.contentType.toLowerCase();
    const url = req.url.toLowerCase();

    // JSON responses
    if (ct.includes('application/json')) return true;
    // Known API path patterns
    if (url.includes('/api/') || url.includes('/v1/') || url.includes('/v2/') || url.includes('/v3/')) return true;
    if (url.includes('/graphql')) return true;
    if (url.includes('/rest/')) return true;
    // XHR-like endpoints
    if (ct.includes('application/xml') && !url.endsWith('.xml')) return true;

    return false;
  }

  /** Extract a normalized API path from a URL */
  private extractApiPath(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove query params, normalize
      let p = parsed.pathname;
      // Replace UUIDs and numeric IDs with placeholders
      p = p.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/{uuid}');
      p = p.replace(/\/\d+/g, '/{id}');
      return p;
    } catch {
      return '';
    }
  }

  /** Extract domain from URL */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  /** Flush domain data to disk (call on navigation away) */
  flushDomain(domain: string): void {
    const data = this.domainStats.get(domain);
    if (!data) return;

    try {
      const filePath = path.join(this.networkDir, `${domain.replace(/[^a-zA-Z0-9.-]/g, '_')}.json`);
      let existing: DomainData = { domain, requests: 0, apis: [], lastSeen: 0 };

      if (fs.existsSync(filePath)) {
        try {
          existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) { log.warn('Network domain file parse failed, starting fresh:', e instanceof Error ? e.message : String(e)); }
      }

      // Merge
      existing.requests += data.requests;
      existing.lastSeen = data.lastSeen;
      for (const api of data.apis) {
        if (!existing.apis.includes(api)) {
          existing.apis.push(api);
        }
      }

      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
    } catch (e) {
      log.warn('Network domain flush failed for', domain + ':', e instanceof Error ? e.message : String(e));
    }
  }

  /** Get recent requests, optionally filtered */
  getLog(limit: number = 100, domain?: string): NetworkRequest[] {
    let filtered = this.requests;
    if (domain) {
      filtered = filtered.filter(r => r.domain === domain);
    }
    return filtered.slice(-limit);
  }

  /** Get discovered API endpoints grouped by domain */
  getApis(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [domain, data] of this.domainStats) {
      if (data.apis.length > 0) {
        result[domain] = data.apis;
      }
    }
    return result;
  }

  /** Get domain list with request counts */
  getDomains(): Array<{ domain: string; requests: number; lastSeen: number; apiCount: number }> {
    return Array.from(this.domainStats.values()).map(d => ({
      domain: d.domain,
      requests: d.requests,
      lastSeen: d.lastSeen,
      apiCount: d.apis.length,
    })).sort((a, b) => b.requests - a.requests);
  }

  /**
   * Export logged requests as a HAR 1.2 archive.
   * @param limit - max entries to include (default 100)
   * @param domain - optional domain filter
   */
  toHar(limit: number = 100, domain?: string): HarExport {
    const entries = this.getLog(limit, domain).map((request) => this.toHarEntry(request));
    const startedDateTime = entries[0]?.startedDateTime ?? new Date().toISOString();
    const title = domain ? `Network log for ${domain}` : 'Tandem network log';

    return {
      log: {
        version: '1.2',
        creator: {
          name: 'Tandem Browser',
          version: process.env.npm_package_version || '0.0.0',
        },
        pages: [{
          startedDateTime,
          id: 'page_1',
          title,
          pageTimings: {
            onContentLoad: -1,
            onLoad: -1,
          },
        }],
        entries,
      },
    };
  }

  /** Clear all logged data */
  clear(): void {
    this.requests = [];
    this.pendingRequests.clear();
    this.domainStats.clear();
  }

  /** Destroy — flush all domains */
  destroy(): void {
    for (const domain of this.domainStats.keys()) {
      this.flushDomain(domain);
    }
  }

  private toHarEntry(request: NetworkRequest): HarEntry {
    const parsedUrl = new URL(request.url);
    const queryString = Array.from(parsedUrl.searchParams.entries()).map(([name, value]) => ({ name, value }));

    return {
      startedDateTime: new Date(request.timestamp).toISOString(),
      time: request.durationMs,
      request: {
        method: request.method,
        url: request.url,
        httpVersion: 'HTTP/1.1',
        cookies: [],
        headers: this.flattenRequestHeaders(request.requestHeaders),
        queryString,
        headersSize: -1,
        bodySize: -1,
      },
      response: {
        status: request.status,
        statusText: STATUS_CODES[request.status] || '',
        httpVersion: 'HTTP/1.1',
        cookies: [],
        headers: this.flattenResponseHeaders(request.responseHeaders),
        content: {
          size: request.size,
          mimeType: request.contentType || 'application/octet-stream',
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: request.size || -1,
      },
      cache: {},
      timings: {
        blocked: 0,
        dns: -1,
        connect: -1,
        send: 0,
        wait: request.durationMs,
        receive: 0,
        ssl: -1,
      },
    };
  }

  private flattenRequestHeaders(headers: Record<string, string>): HarHeader[] {
    return Object.entries(headers).map(([name, value]) => ({ name, value }));
  }

  private flattenResponseHeaders(headers: Record<string, string[]>): HarHeader[] {
    return Object.entries(headers).flatMap(([name, values]) =>
      values.map((value) => ({ name, value }))
    );
  }
}
