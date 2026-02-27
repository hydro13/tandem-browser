import path from 'path';
import fs from 'fs';
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
}

interface DomainData {
  domain: string;
  requests: number;
  apis: string[];
  lastSeen: number;
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
          });
        }
        return null;
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
}
