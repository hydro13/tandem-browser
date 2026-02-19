import { OnBeforeRequestListenerDetails, OnBeforeSendHeadersListenerDetails, OnHeadersReceivedListenerDetails } from 'electron';
import { RequestDispatcher } from '../network/dispatcher';
import { SecurityDB } from './security-db';
import { NetworkShield } from './network-shield';
import { GuardianMode, GuardianStatus, BANKING_PATTERNS } from './types';

const DANGEROUS_EXTENSIONS = new Set(['.exe', '.scr', '.bat', '.cmd', '.ps1', '.vbs', '.msi', '.dll']);

export class Guardian {
  private db: SecurityDB;
  private shield: NetworkShield;
  private defaultMode: GuardianMode = 'balanced';
  private stats = { total: 0, blocked: 0, allowed: 0, totalMs: 0 };

  constructor(db: SecurityDB, shield: NetworkShield) {
    this.db = db;
    this.shield = shield;
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

  private getModeForDomain(domain: string): GuardianMode {
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
