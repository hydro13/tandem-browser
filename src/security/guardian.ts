import { OnBeforeRequestListenerDetails, OnBeforeSendHeadersListenerDetails, OnHeadersReceivedListenerDetails } from 'electron';
import crypto from 'crypto';
import { RequestDispatcher } from '../network/dispatcher';
import { SecurityDB } from './security-db';
import { NetworkShield } from './network-shield';
import { OutboundGuard } from './outbound-guard';
import { GuardianMode, GuardianStatus, BANKING_PATTERNS, GatekeeperDecision, PendingDecision } from './types';
import type { GatekeeperWebSocket } from './gatekeeper-ws';

const DANGEROUS_EXTENSIONS = new Set(['.exe', '.scr', '.bat', '.cmd', '.ps1', '.vbs', '.msi', '.dll']);
const OUTBOUND_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export class Guardian {
  private db: SecurityDB;
  private shield: NetworkShield;
  private outboundGuard: OutboundGuard;
  private defaultMode: GuardianMode = 'balanced';
  private stats = { total: 0, blocked: 0, allowed: 0, totalMs: 0 };

  // Phase 4: Gatekeeper agent integration
  private gatekeeperWs: GatekeeperWebSocket | null = null;
  private decisionCallbacks: Map<string, (decision: GatekeeperDecision) => void> = new Map();

  constructor(db: SecurityDB, shield: NetworkShield, outboundGuard: OutboundGuard) {
    this.db = db;
    this.shield = shield;
    this.outboundGuard = outboundGuard;
  }

  // Phase 4: Set the gatekeeper reference
  setGatekeeper(ws: GatekeeperWebSocket): void {
    this.gatekeeperWs = ws;
    console.log('[Guardian] Gatekeeper agent bridge connected');
  }

  // Phase 4: Handle decisions from the agent
  submitDecision(id: string, decision: GatekeeperDecision): void {
    const callback = this.decisionCallbacks.get(id);
    if (callback) {
      callback(decision);
      this.decisionCallbacks.delete(id);
    }
  }

  // Phase 4: Queue an uncertain case for the AI agent
  private queueForGatekeeper(domain: string, url: string, context: Record<string, unknown>): void {
    if (!this.gatekeeperWs) return;

    const status = this.gatekeeperWs.getStatus();
    if (!status.connected && status.pendingDecisions >= 100) return;

    const trust = this.db.getDomainInfo(domain)?.trustLevel ?? 30;
    const mode = this.getModeForDomain(domain);

    const item: PendingDecision = {
      id: crypto.randomUUID(),
      category: 'request',
      domain,
      context: {
        url: url.substring(0, 500),
        trust,
        mode,
        ...context,
      },
      defaultAction: 'allow',
      timeout: 30_000,
      createdAt: Date.now(),
    };

    this.gatekeeperWs.sendDecisionRequest(item);
  }

  registerWith(dispatcher: RequestDispatcher): void {
    dispatcher.registerBeforeRequest({
      name: 'Guardian',
      priority: 1,
      handler: (details) => {
        return this.checkRequest(details);
      }
    });

    dispatcher.registerBeforeSendHeaders({
      name: 'Guardian',
      priority: 20,
      handler: (details, headers) => {
        return this.checkHeaders(details, headers);
      }
    });

    dispatcher.registerHeadersReceived({
      name: 'Guardian',
      priority: 20,
      handler: (details, responseHeaders) => {
        this.analyzeResponseHeaders(details, responseHeaders);
        return responseHeaders;
      }
    });

    console.log('[Guardian] Registered with dispatcher (priority 1/20/20)');
  }

  // === Request checking (synchronous, <5ms target) ===

  private checkRequest(details: OnBeforeRequestListenerDetails): { cancel: boolean } | null {
    this.stats.total++;
    const start = performance.now();

    try {
      const url = details.url;

      // Skip internal URLs
      if (url.startsWith('devtools://') || url.startsWith('chrome://') || url.startsWith('file://')) {
        return null;
      }

      // 1. Blocklist check (instant — Set lookup)
      const blockResult = this.shield.checkUrl(url);
      if (blockResult.blocked) {
        this.stats.blocked++;
        const domain = this.extractDomain(url);
        this.db.logEvent({
          timestamp: Date.now(),
          domain,
          tabId: null,
          eventType: 'blocked',
          severity: 'high',
          category: 'network',
          details: JSON.stringify({ url: url.substring(0, 200), reason: blockResult.reason, source: blockResult.source }),
          actionTaken: 'auto_block',
        });
        return { cancel: true };
      }

      // 1b. Risk score check (raw IPs, non-standard ports) — skip internal addresses
      const riskHost = this.extractDomain(url);
      if (riskHost !== 'localhost' && riskHost !== '127.0.0.1' && riskHost !== '::1') {
      const riskResult = this.computeRiskScore(url);
      if (riskResult.score >= 30) {
        const riskDomain = this.extractDomain(url) ?? url.substring(0, 100);
        this.db.logEvent({
          timestamp: Date.now(),
          domain: riskDomain,
          tabId: null,
          eventType: 'warned',
          severity: riskResult.score >= 50 ? 'high' : 'medium',
          category: 'network',
          details: JSON.stringify({ url: url.substring(0, 200), riskScore: riskResult.score, reasons: riskResult.reasons }),
          actionTaken: riskResult.score >= 65 ? 'auto_block' : 'flagged',
        });
        if (riskResult.score >= 65) {
          this.stats.blocked++;
          return { cancel: true };
        }
        if (this.gatekeeperWs && riskDomain !== 'localhost' && riskDomain !== '127.0.0.1') {
          this.queueForGatekeeper(riskDomain, url, {
            resourceType: (details as any).resourceType,
            method: details.method,
            referrer: details.referrer,
            riskScore: riskResult.score,
            riskReasons: riskResult.reasons,
          });
        }
      }
      }

      // 2. Domain trust + mode check
      const domain = this.extractDomain(url);
      if (domain) {
        const info = this.db.getDomainInfo(domain);

        // Auto-detect banking/login domains → strict mode
        if (!info && this.isBankingDomain(domain)) {
          this.db.upsertDomain(domain, { guardianMode: 'strict' });
        }

        // Track domain visit
        this.db.upsertDomain(domain, { lastSeen: Date.now() });

        // 3. Download safety check
        if ((details as any).resourceType === 'download') {
          const mode = info?.guardianMode || this.getModeForDomain(domain);
          const ext = this.getFileExtension(url);
          if (ext && DANGEROUS_EXTENSIONS.has(ext)) {
            if (mode === 'strict') {
              this.stats.blocked++;
              this.db.logEvent({
                timestamp: Date.now(),
                domain,
                tabId: null,
                eventType: 'blocked',
                severity: 'high',
                category: 'network',
                details: JSON.stringify({ url: url.substring(0, 200), reason: `Dangerous download (${ext}) blocked in strict mode` }),
                actionTaken: 'auto_block',
              });
              return { cancel: true };
            } else if (mode === 'balanced') {
              this.db.logEvent({
                timestamp: Date.now(),
                domain,
                tabId: null,
                eventType: 'warned',
                severity: 'medium',
                category: 'network',
                details: JSON.stringify({ url: url.substring(0, 200), reason: `Dangerous download (${ext}) in balanced mode` }),
                actionTaken: 'flagged',
              });
            }
          }
        }
      }

      // 4. WebSocket upgrade detection
      if (url.startsWith('ws://') || url.startsWith('wss://')) {
        const wsResult = this.outboundGuard.analyzeWebSocket(url, details.referrer);
        if (wsResult.action === 'block') {
          this.stats.blocked++;
          this.db.logEvent({
            timestamp: Date.now(),
            domain,
            tabId: null,
            eventType: 'exfiltration_attempt',
            severity: wsResult.severity,
            category: 'outbound',
            details: JSON.stringify({ url: url.substring(0, 200), reason: wsResult.reason, referrer: details.referrer }),
            actionTaken: 'auto_block',
          });
          return { cancel: true };
        }
        if (wsResult.action === 'flag') {
          this.db.logEvent({
            timestamp: Date.now(),
            domain,
            tabId: null,
            eventType: 'warned',
            severity: wsResult.severity,
            category: 'outbound',
            details: JSON.stringify({ url: url.substring(0, 200), reason: wsResult.reason, referrer: details.referrer }),
            actionTaken: 'flagged',
          });
        }
      }

      // 5. Outbound data check for POST/PUT/PATCH
      if (details.method && OUTBOUND_METHODS.has(details.method)) {
        const mode = domain ? this.getModeForDomain(domain) : this.defaultMode;
        const outboundResult = this.outboundGuard.analyzeOutbound(details, mode);
        if (outboundResult.action === 'block') {
          this.stats.blocked++;
          this.db.logEvent({
            timestamp: Date.now(),
            domain,
            tabId: null,
            eventType: 'exfiltration_attempt',
            severity: outboundResult.severity,
            category: 'outbound',
            details: JSON.stringify({
              url: url.substring(0, 200),
              method: details.method,
              reason: outboundResult.reason,
              referrer: details.referrer,
            }),
            actionTaken: 'auto_block',
          });
          return { cancel: true };
        }
        if (outboundResult.action === 'flag') {
          this.db.logEvent({
            timestamp: Date.now(),
            domain,
            tabId: null,
            eventType: 'warned',
            severity: outboundResult.severity,
            category: 'outbound',
            details: JSON.stringify({
              url: url.substring(0, 200),
              method: details.method,
              reason: outboundResult.reason,
              referrer: details.referrer,
            }),
            actionTaken: 'flagged',
          });
        }
      }

      // Phase 4: Queue uncertain cases for AI agent analysis
      // Allow immediately but let agent adjust trust/mode for FUTURE requests
      // Skip localhost — Tandem's own internal API requests
      if (domain && this.gatekeeperWs && domain !== 'localhost' && domain !== '127.0.0.1') {
        const info = this.db.getDomainInfo(domain);
        const trust = info?.trustLevel ?? 30;
        const mode = info?.guardianMode || this.getModeForDomain(domain);
        const resourceType = (details as any).resourceType as string | undefined;

        // Only flag genuinely uncertain cases (target: ~5% of requests)
        const isFirstVisit = !info || (info.visitCount ?? 0) <= 1;
        const isNavigationToUnknown = isFirstVisit && resourceType === 'mainFrame';

        const isUncertain =
          (trust < 20 && trust > 5) ||  // Actively suspicious (trust lowered by previous events)
          (mode === 'strict' && resourceType === 'script' && trust < 50) ||  // Script on strict-mode page with low trust
          isNavigationToUnknown;  // First visit to any domain → AI review

        if (isUncertain) {
          this.queueForGatekeeper(domain, url, {
            resourceType,
            method: details.method,
            referrer: details.referrer,
          });
        }
      }

      this.stats.allowed++;
      return null;

    } finally {
      this.stats.totalMs += performance.now() - start;
    }
  }

  // === Header analysis ===

  private checkHeaders(details: OnBeforeSendHeadersListenerDetails, headers: Record<string, string>): Record<string, string> {
    const domain = this.extractDomain(details.url);
    if (!domain) return headers;

    const mode = this.getModeForDomain(domain);

    if (mode === 'strict') {
      // Strip tracking headers
      delete headers['X-Requested-With'];

      // Strip referer to different domains (prevent referer leak)
      const referer = headers['Referer'] || headers['referer'];
      if (referer) {
        try {
          const refererDomain = new URL(referer).hostname;
          if (refererDomain !== domain) {
            delete headers['Referer'];
            delete headers['referer'];
          }
        } catch {
          // Invalid referer, strip it
          delete headers['Referer'];
          delete headers['referer'];
        }
      }
    }

    return headers;
  }

  private analyzeResponseHeaders(details: OnHeadersReceivedListenerDetails, responseHeaders: Record<string, string[]>): void {
    const domain = this.extractDomain(details.url);
    if (!domain) return;

    // Only analyze main frame navigations to reduce noise
    if ((details as any).resourceType !== 'mainFrame') return;

    const mode = this.getModeForDomain(domain);
    const missingHeaders: string[] = [];

    // Check for missing security headers
    const headerKeys = Object.keys(responseHeaders).map(k => k.toLowerCase());
    if (!headerKeys.includes('x-frame-options')) missingHeaders.push('X-Frame-Options');
    if (!headerKeys.includes('content-security-policy')) missingHeaders.push('Content-Security-Policy');
    if (!headerKeys.includes('strict-transport-security')) missingHeaders.push('Strict-Transport-Security');

    if (missingHeaders.length > 0) {
      this.db.logEvent({
        timestamp: Date.now(),
        domain,
        tabId: null,
        eventType: 'warned',
        severity: 'info',
        category: 'network',
        details: JSON.stringify({ url: details.url.substring(0, 200), missingHeaders }),
        actionTaken: 'logged',
      });
    }

    // Content-type mismatch detection (e.g. bin.sh served as application/zip)
    const contentTypeHeader = responseHeaders['content-type']?.[0] || responseHeaders['Content-Type']?.[0] || '';
    const contentType = contentTypeHeader.split(';')[0].trim().toLowerCase();
    const urlPath = (() => { try { return new URL(details.url).pathname; } catch { return ''; } })();
    const urlExt = urlPath.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();

    const SCRIPT_EXTENSIONS = new Set(['sh', 'py', 'rb', 'pl', 'ps1', 'bat', 'cmd', 'js', 'vbs']);
    const BINARY_CONTENT_TYPES = new Set(['application/zip', 'application/octet-stream', 'application/x-msdownload', 'application/x-executable']);

    if (urlExt && SCRIPT_EXTENSIONS.has(urlExt) && BINARY_CONTENT_TYPES.has(contentType)) {
      this.db.logEvent({
        timestamp: Date.now(),
        domain,
        tabId: null,
        eventType: 'warned',
        severity: 'high',
        category: 'network',
        details: JSON.stringify({ url: details.url.substring(0, 200), reason: 'content-type-mismatch', urlExtension: urlExt, contentType }),
        actionTaken: 'flagged',
      });
    }

    // Flag third-party Set-Cookie in strict mode
    if (mode === 'strict') {
      const cookies = responseHeaders['set-cookie'] || responseHeaders['Set-Cookie'];
      if (cookies && cookies.length > 0) {
        // Check if this is a third-party request
        // We don't have reliable page domain here, so log for analysis
        this.db.logEvent({
          timestamp: Date.now(),
          domain,
          tabId: null,
          eventType: 'warned',
          severity: 'low',
          category: 'network',
          details: JSON.stringify({ url: details.url.substring(0, 200), cookieCount: cookies.length, note: 'Cookies set in strict mode' }),
          actionTaken: 'logged',
        });
      }
    }
  }

  // === Public API ===

  getStatus(): GuardianStatus {
    const avgMs = this.stats.total > 0 ? this.stats.totalMs / this.stats.total : 0;
    return {
      active: true,
      defaultMode: this.defaultMode,
      stats: {
        totalRequests: this.stats.total,
        blockedRequests: this.stats.blocked,
        allowedRequests: this.stats.allowed,
        avgDecisionMs: Math.round(avgMs * 100) / 100,
      },
      consumers: ['Guardian'],
    };
  }

  setMode(domain: string, mode: GuardianMode): void {
    this.db.upsertDomain(domain, { guardianMode: mode });
  }

  setDefaultMode(mode: GuardianMode): void {
    this.defaultMode = mode;
  }

  // === Risk scoring ===

  private computeRiskScore(url: string): { score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;
      const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);

      const isRawIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) ||
        /^\[[\da-fA-F:]+\]$/.test(hostname);
      if (isRawIP) { score += 40; reasons.push(`raw-ip:${hostname}`); }

      const STANDARD_PORTS = new Set([80, 443, 8080, 8443]);
      if (parsed.port && !STANDARD_PORTS.has(port)) { score += 25; reasons.push(`non-standard-port:${port}`); }

      if (parsed.protocol === 'http:' && !isRawIP) { score += 10; reasons.push('no-tls'); }
    } catch {
      score += 20; reasons.push('unparseable-url');
    }
    return { score, reasons };
  }

  // === Helpers ===

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  private isBankingDomain(domain: string): boolean {
    return BANKING_PATTERNS.some(p => p.test(domain));
  }

  getModeForDomain(domain: string): GuardianMode {
    const info = this.db.getDomainInfo(domain);
    return info?.guardianMode || this.defaultMode;
  }

  private getFileExtension(url: string): string | null {
    try {
      const pathname = new URL(url).pathname;
      const lastDot = pathname.lastIndexOf('.');
      if (lastDot > 0) {
        return pathname.substring(lastDot).toLowerCase().split('?')[0];
      }
    } catch { /* ignore */ }
    return null;
  }
}
