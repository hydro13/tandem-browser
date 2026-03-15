import type { OnBeforeRequestListenerDetails, OnBeforeSendHeadersListenerDetails, OnHeadersReceivedListenerDetails } from 'electron';
import crypto from 'crypto';
import type { RequestDispatcher } from '../network/dispatcher';
import type { SecurityDB } from './security-db';
import type { NetworkShield } from './network-shield';
import type { OutboundGuard } from './outbound-guard';
import type {
  DomainInfo,
  EventSeverity,
  GatekeeperDecision,
  GatekeeperDecisionClass,
  GuardianMode,
  GuardianStatus,
  OutboundDecision,
  PendingDecision,
} from './types';
import { BANKING_PATTERNS, AnalysisConfidence } from './types';
import type { GatekeeperWebSocket } from './gatekeeper-ws';
import { createLogger } from '../utils/logger';

const log = createLogger('Guardian');

const DANGEROUS_EXTENSIONS = new Set(['.exe', '.scr', '.bat', '.cmd', '.ps1', '.vbs', '.msi', '.dll']);
const OUTBOUND_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

// Trusted first-party CDN domains — scripts from these are never blocked by the gatekeeper,
// even when the domain has a low trust score (e.g. first visit).
const TRUSTED_SCRIPT_DOMAINS = new Set([
  'static.licdn.com',
  'static-exp1.licdn.com',
  'static-exp2.licdn.com',
  'platform.linkedin.com',
  'snap.licdn.com',
  'media.licdn.com',
  // GitHub CDN — required for dashboard/feed to load
  'github.githubassets.com',
]);
const GATEKEEPER_PENDING_LIMIT = 100;
const GATEKEEPER_HOLD_TIMEOUT_MS = 4_000;
const GATEKEEPER_DENY_TIMEOUT_MS = 6_000;

interface GatekeeperRequestPolicy {
  decisionClass: GatekeeperDecisionClass;
  reason: string;
  severity: EventSeverity;
  context: Record<string, unknown>;
}

interface QuarantinedWebContents {
  incidentId: string;
  domain: string | null;
  reason: string;
  reviewMessage: string;
  createdAt: number;
  blockedRequests: number;
}

function getResourceType(details: { resourceType?: unknown }): string | undefined {
  return typeof details.resourceType === 'string' ? details.resourceType : undefined;
}

export class Guardian {
  private db: SecurityDB;
  private shield: NetworkShield;
  private outboundGuard: OutboundGuard;
  private defaultMode: GuardianMode = 'balanced';
  private stats = { total: 0, blocked: 0, allowed: 0, totalMs: 0 };

  // Phase 0-B: Accumulated Set-Cookie counts per domain (all resource types)
  private cookieCounts: Map<string, number> = new Map();

  // Phase 4: Gatekeeper agent integration
  private gatekeeperWs: GatekeeperWebSocket | null = null;
  private decisionCallbacks: Map<string, (decision: GatekeeperDecision) => void> = new Map();
  private quarantinedWebContents: Map<number, QuarantinedWebContents> = new Map();

  constructor(db: SecurityDB, shield: NetworkShield, outboundGuard: OutboundGuard) {
    this.db = db;
    this.shield = shield;
    this.outboundGuard = outboundGuard;
  }

  // Phase 4: Set the gatekeeper reference
  setGatekeeper(ws: GatekeeperWebSocket): void {
    this.gatekeeperWs = ws;
    log.info('Gatekeeper agent bridge connected');
  }

  // Phase 4: Handle decisions from the agent
  submitDecision(id: string, decision: GatekeeperDecision): void {
    const callback = this.decisionCallbacks.get(id);
    if (callback) {
      this.invokeDecisionCallback(callback, decision);
      this.decisionCallbacks.delete(id);
    }
  }

  // Phase 4: Queue an uncertain case for the AI agent
  private queueForGatekeeper(
    domain: string,
    url: string,
    policy: GatekeeperRequestPolicy,
    context: Record<string, unknown>
  ): { id: string; decision: Promise<GatekeeperDecision> } | null {
    if (!this.gatekeeperWs) return null;

    const status = this.gatekeeperWs.getStatus();
    if (!status.connected || status.pendingDecisions >= GATEKEEPER_PENDING_LIMIT) return null;

    const trust = this.db.getDomainInfo(domain)?.trustLevel ?? 30;
    const mode = this.getModeForDomain(domain);

    const item: PendingDecision = {
      id: crypto.randomUUID(),
      category: 'request',
      domain,
      decisionClass: policy.decisionClass,
      context: {
        url: url.substring(0, 500),
        trust,
        mode,
        policyReason: policy.reason,
        ...context,
      },
      defaultAction: policy.decisionClass === 'deny_on_timeout' ? 'block' : 'allow',
      timeout: policy.decisionClass === 'deny_on_timeout' ? GATEKEEPER_DENY_TIMEOUT_MS : GATEKEEPER_HOLD_TIMEOUT_MS,
      createdAt: Date.now(),
    };

    this.logGatekeeperRouting('held', domain, item, {
      url: url.substring(0, 200),
      ...policy.context,
      ...context,
    });

    const decisionPromise = new Promise<GatekeeperDecision>((resolve) => {
      this.decisionCallbacks.set(item.id, resolve);
    });
    this.gatekeeperWs.sendDecisionRequest(item);
    return { id: item.id, decision: decisionPromise };
  }

  private invokeDecisionCallback(
    callback: ((decision: GatekeeperDecision) => void) | unknown,
    decision: GatekeeperDecision,
  ): void {
    if (typeof callback === 'function') {
      callback(decision);
    }
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
      name: 'Guardian:RedirectBlock',
      priority: 5,
      handler: (details, responseHeaders) => {
        return this.checkRedirectHeaders(details, responseHeaders);
      }
    });

    dispatcher.registerHeadersReceived({
      name: 'Guardian',
      priority: 20,
      handler: (details, responseHeaders) => {
        this.analyzeResponseHeaders(details, responseHeaders);
        return { responseHeaders };
      }
    });

    dispatcher.registerBeforeRedirect({
      name: 'Guardian:Redirect',
      handler: (details) => {
        this.checkRedirect(details);
      }
    });

    log.info('Registered with dispatcher (priority 1/20/20 + redirect)');
  }

  // === Request checking ===

  private async checkRequest(details: OnBeforeRequestListenerDetails): Promise<{ cancel: boolean } | null> {
    this.stats.total++;
    const start = performance.now();

    try {
      const url = details.url;
      const resourceType = getResourceType(details);

      // Skip internal URLs
      if (url.startsWith('devtools://') || url.startsWith('chrome://') || url.startsWith('file://')) {
        return null;
      }

      const quarantined = typeof details.webContentsId === 'number'
        ? this.quarantinedWebContents.get(details.webContentsId)
        : null;
      if (quarantined) {
        quarantined.blockedRequests += 1;
        this.stats.blocked++;
        this.db.logEvent({
          timestamp: Date.now(),
          domain: quarantined.domain,
          tabId: null,
          eventType: 'containment_request_blocked',
          severity: 'high',
          category: 'network',
          details: JSON.stringify({
            incidentId: quarantined.incidentId,
            url: url.substring(0, 200),
            method: details.method,
            resourceType,
            reason: quarantined.reason,
            reviewMessage: quarantined.reviewMessage,
            blockedRequests: quarantined.blockedRequests,
          }),
          actionTaken: 'auto_block',
          confidence: AnalysisConfidence.BEHAVIORAL,
        });
        return { cancel: true };
      }

      const domain = this.extractDomain(url);
      let domainInfo: DomainInfo | null = domain ? this.db.getDomainInfo(domain) : null;
      let riskScore = 0;
      let riskReasons: string[] = [];
      let dangerousDownloadExt: string | null = null;
      let wsResult: OutboundDecision | null = null;
      let outboundResult: OutboundDecision | null = null;

      // 1. Blocklist check (instant — Set lookup)
      const blockResult = this.shield.checkUrl(url);
      if (blockResult.blocked) {
        this.stats.blocked++;
        this.db.logEvent({
          timestamp: Date.now(),
          domain,
          tabId: null,
          eventType: 'blocked',
          severity: 'high',
          category: 'network',
          details: JSON.stringify({ url: url.substring(0, 200), reason: blockResult.reason, source: blockResult.source }),
          actionTaken: 'auto_block',
          confidence: AnalysisConfidence.BLOCKLIST,
        });
        return { cancel: true };
      }

      // 1b. Risk score check (raw IPs, non-standard ports) — skip internal addresses
      const riskHost = this.extractDomain(url);
      if (riskHost && !LOOPBACK_HOSTS.has(riskHost)) {
        const riskResult = this.computeRiskScore(url);
        riskScore = riskResult.score;
        riskReasons = riskResult.reasons;

        if (riskResult.score >= 30) {
          const riskDomain = domain ?? url.substring(0, 100);
          this.db.logEvent({
            timestamp: Date.now(),
            domain: riskDomain,
            tabId: null,
            eventType: 'warned',
            severity: riskResult.score >= 50 ? 'high' : 'medium',
            category: 'network',
            details: JSON.stringify({ url: url.substring(0, 200), riskScore: riskResult.score, reasons: riskResult.reasons }),
            actionTaken: riskResult.score >= 65 ? 'auto_block' : 'flagged',
            confidence: AnalysisConfidence.HEURISTIC,
          });
          if (riskResult.score >= 65) {
            this.stats.blocked++;
            return { cancel: true };
          }
        }
      }

      // 2. Domain trust + mode check
      if (domain) {
        // Auto-detect banking/login domains → strict mode
        if (!domainInfo && this.isBankingDomain(domain)) {
          this.db.upsertDomain(domain, { guardianMode: 'strict' });
          domainInfo = this.db.getDomainInfo(domain);
        }

        // Track domain visit
        this.db.upsertDomain(domain, { lastSeen: Date.now() });
        domainInfo = this.db.getDomainInfo(domain) ?? domainInfo;

        // 3. Download safety check
        if (resourceType === 'download') {
          const mode = this.getModeForDomain(domain);
          const ext = this.getFileExtension(url);
          if (ext && DANGEROUS_EXTENSIONS.has(ext)) {
            dangerousDownloadExt = ext;
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
                confidence: AnalysisConfidence.HEURISTIC,
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
                confidence: AnalysisConfidence.HEURISTIC,
              });
            }
          }
        }
      }

      // 4. WebSocket upgrade detection
      if (url.startsWith('ws://') || url.startsWith('wss://')) {
        const mode = domain ? this.getModeForDomain(domain) : this.defaultMode;
        wsResult = this.outboundGuard.analyzeWebSocket(url, details.referrer, mode);
        if (wsResult.action === 'block') {
          this.stats.blocked++;
          this.db.logEvent({
            timestamp: Date.now(),
            domain,
            tabId: null,
            eventType: 'exfiltration_attempt',
            severity: wsResult.severity,
            category: 'outbound',
            details: JSON.stringify({
              url: url.substring(0, 200),
              reason: wsResult.reason,
              explanation: wsResult.explanation,
              referrer: details.referrer,
              ...wsResult.context,
            }),
            actionTaken: 'auto_block',
            confidence: AnalysisConfidence.BEHAVIORAL,
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
            details: JSON.stringify({
              url: url.substring(0, 200),
              reason: wsResult.reason,
              explanation: wsResult.explanation,
              referrer: details.referrer,
              gatekeeperDecisionClass: wsResult.gatekeeperDecisionClass,
              ...wsResult.context,
            }),
            actionTaken: 'flagged',
            confidence: AnalysisConfidence.HEURISTIC,
          });
        }
      }

      // 5. Outbound data check for POST/PUT/PATCH
      if (details.method && OUTBOUND_METHODS.has(details.method)) {
        const mode = domain ? this.getModeForDomain(domain) : this.defaultMode;
        outboundResult = this.outboundGuard.analyzeOutbound(details, mode);
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
              explanation: outboundResult.explanation,
              referrer: details.referrer,
              ...outboundResult.context,
            }),
            actionTaken: 'auto_block',
            confidence: AnalysisConfidence.CREDENTIAL_EXFIL,
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
              explanation: outboundResult.explanation,
              referrer: details.referrer,
              gatekeeperDecisionClass: outboundResult.gatekeeperDecisionClass,
              ...outboundResult.context,
            }),
            actionTaken: 'flagged',
            confidence: AnalysisConfidence.HEURISTIC,
          });
        }
      }

      const mode = domain ? this.getModeForDomain(domain) : this.defaultMode;
      const gatekeeperPolicy = domain ? this.classifyGatekeeperPolicy({
        details,
        domain,
        info: domainInfo,
        mode,
        resourceType,
        riskScore,
        riskReasons,
        dangerousDownloadExt,
        wsResult,
        outboundResult,
      }) : null;

      if (domain && gatekeeperPolicy) {
        const gatekeeperOutcome = await this.applyGatekeeperPolicy(
          domain,
          url,
          gatekeeperPolicy,
          details
        );
        if (gatekeeperOutcome) {
          return gatekeeperOutcome;
        }
      }

      this.stats.allowed++;
      return null;

    } finally {
      this.stats.totalMs += performance.now() - start;
    }
  }

  private classifyGatekeeperPolicy(input: {
    details: OnBeforeRequestListenerDetails;
    domain: string;
    info: DomainInfo | null;
    mode: GuardianMode;
    resourceType?: string;
    riskScore: number;
    riskReasons: string[];
    dangerousDownloadExt: string | null;
    wsResult: OutboundDecision | null;
    outboundResult: OutboundDecision | null;
  }): GatekeeperRequestPolicy | null {
    if (LOOPBACK_HOSTS.has(input.domain)) return null;

    const trust = input.info?.trustLevel ?? 30;
    const visitCount = input.info?.visitCount ?? 0;
    const isFirstVisit = !input.info || visitCount <= 1;

    if (input.resourceType === 'script' && input.mode === 'strict' && trust < 50) {
      // Skip blocking for known trusted first-party CDN domains
      if (!TRUSTED_SCRIPT_DOMAINS.has(input.domain)) {
        return {
          decisionClass: 'deny_on_timeout',
          reason: 'strict_low_trust_script',
          severity: trust < 20 ? 'high' : 'medium',
          context: {
            trust,
            resourceType: input.resourceType,
          },
        };
      }
    }

    if (input.resourceType === 'download' && input.dangerousDownloadExt && input.mode !== 'permissive') {
      return {
        decisionClass: 'deny_on_timeout',
        reason: 'suspicious_download',
        severity: 'high',
        context: {
          extension: input.dangerousDownloadExt,
          trust,
          riskScore: input.riskScore,
        },
      };
    }

    if (input.wsResult?.action === 'flag' && input.wsResult.gatekeeperDecisionClass) {
      return {
        decisionClass: input.wsResult.gatekeeperDecisionClass,
        reason: input.wsResult.reason,
        severity: input.wsResult.severity,
        context: {
          explanation: input.wsResult.explanation,
          ...input.wsResult.context,
          trust,
          referrer: input.details.referrer,
        },
      };
    }

    if (input.outboundResult?.action === 'flag' && input.outboundResult.gatekeeperDecisionClass) {
      return {
        decisionClass: input.outboundResult.gatekeeperDecisionClass,
        reason: input.outboundResult.reason,
        severity: input.outboundResult.severity,
        context: {
          explanation: input.outboundResult.explanation,
          ...input.outboundResult.context,
          trust,
          method: input.details.method,
          referrer: input.details.referrer,
        },
      };
    }

    if (input.resourceType === 'mainFrame' && isFirstVisit) {
      if (input.mode === 'strict') {
        return {
          decisionClass: 'hold_for_decision',
          reason: 'first_visit_navigation_strict',
          severity: 'medium',
          context: {
            trust,
            visitCount,
          },
        };
      }

      if (input.riskScore >= 10) {
        return {
          decisionClass: 'hold_for_decision',
          reason: 'first_visit_navigation_risky',
          severity: input.riskScore >= 40 ? 'high' : 'medium',
          context: {
            trust,
            visitCount,
            riskScore: input.riskScore,
            riskReasons: input.riskReasons,
          },
        };
      }
    }

    return null;
  }

  private async applyGatekeeperPolicy(
    domain: string,
    url: string,
    policy: GatekeeperRequestPolicy,
    details: OnBeforeRequestListenerDetails
  ): Promise<{ cancel: boolean } | null> {
    const availability = this.getGatekeeperAvailability();
    const context = {
      url: url.substring(0, 200),
      resourceType: getResourceType(details),
      method: details.method,
      referrer: details.referrer,
      ...policy.context,
    };

    if (availability !== 'connected') {
      if (policy.decisionClass === 'deny_on_timeout') {
        this.stats.blocked++;
        this.logGatekeeperRouting('blocked', domain, {
          id: 'inline',
          decisionClass: policy.decisionClass,
          defaultAction: 'block',
        }, {
          ...context,
          reason: policy.reason,
          fallback: availability,
        });
        return { cancel: true };
      }

      this.logGatekeeperRouting('allowed', domain, {
        id: 'inline',
        decisionClass: policy.decisionClass,
        defaultAction: 'allow',
      }, {
        ...context,
        reason: policy.reason,
        fallback: availability,
      });
      return null;
    }

    const pendingDecision = this.queueForGatekeeper(domain, url, policy, context);
    if (!pendingDecision) {
      if (policy.decisionClass === 'deny_on_timeout') {
        this.stats.blocked++;
        this.logGatekeeperRouting('blocked', domain, {
          id: 'inline',
          decisionClass: policy.decisionClass,
          defaultAction: 'block',
        }, {
          ...context,
          reason: policy.reason,
          fallback: 'queue_unavailable',
        });
        return { cancel: true };
      }

      this.logGatekeeperRouting('allowed', domain, {
        id: 'inline',
        decisionClass: policy.decisionClass,
        defaultAction: 'allow',
      }, {
        ...context,
        reason: policy.reason,
        fallback: 'queue_unavailable',
      });
      return null;
    }

    const decision = await pendingDecision.decision;
    const decisionSource = decision.reason.includes('agent did not respond within')
      ? 'timed_out'
      : decision.action === 'block'
        ? 'blocked'
        : 'allowed';

    this.logGatekeeperRouting(decisionSource, domain, {
      id: pendingDecision.id,
      decisionClass: policy.decisionClass,
      defaultAction: policy.decisionClass === 'deny_on_timeout' ? 'block' : 'allow',
    }, {
      ...context,
      reason: policy.reason,
      decision: decision.action,
      decisionReason: decision.reason,
      confidence: decision.confidence,
    });

    if (decision.action === 'block') {
      this.stats.blocked++;
      return { cancel: true };
    }

    this.stats.allowed++;
    return null;
  }

  private getGatekeeperAvailability(): 'connected' | 'disconnected' | 'saturated' {
    if (!this.gatekeeperWs) return 'disconnected';

    const status = this.gatekeeperWs.getStatus();
    if (!status.connected) return 'disconnected';
    if (status.pendingDecisions >= GATEKEEPER_PENDING_LIMIT) return 'saturated';
    return 'connected';
  }

  private logGatekeeperRouting(
    outcome: 'held' | 'allowed' | 'blocked' | 'timed_out',
    domain: string,
    item: Pick<PendingDecision, 'id' | 'decisionClass' | 'defaultAction'>,
    details: Record<string, unknown>
  ): void {
    const severity: EventSeverity =
      outcome === 'blocked' || (outcome === 'timed_out' && details.decision === 'block')
        ? 'high'
        : outcome === 'held'
          ? 'medium'
          : 'info';

    const actionTaken =
      outcome === 'blocked' || (outcome === 'timed_out' && details.decision === 'block')
        ? 'auto_block'
        : 'logged';

    const payload = {
      decisionId: item.id,
      decisionClass: item.decisionClass,
      defaultAction: item.defaultAction,
      outcome,
      ...details,
    };

    this.db.logEvent({
      timestamp: Date.now(),
      domain,
      tabId: null,
      eventType: `gatekeeper_${outcome}`,
      severity,
      category: 'behavior',
      details: JSON.stringify(payload),
      actionTaken,
      confidence: AnalysisConfidence.BEHAVIORAL,
    });

    log.info(`Gatekeeper ${outcome} for ${domain}: ${JSON.stringify(payload)}`);
  }

  /**
   * Intercepts HTTP 3xx redirect responses and blocks if destination is suspicious.
   * Fires via onHeadersReceived — BEFORE Electron follows the redirect (supports cancel).
   * The existing checkRedirect() via onBeforeRedirect stays as observational fallback.
   */
  private checkRedirectHeaders(
    details: Electron.OnHeadersReceivedListenerDetails,
    responseHeaders: Record<string, string[]>
  ): { cancel?: boolean; responseHeaders: Record<string, string[]> } {
    const { statusCode, url } = details;

    // Only handle redirects
    if (statusCode < 300 || statusCode >= 400) {
      return { responseHeaders };
    }

    // Extract Location header (case-insensitive)
    const locationKey = Object.keys(responseHeaders).find(k => k.toLowerCase() === 'location');
    if (!locationKey) return { responseHeaders };

    const locationValues = responseHeaders[locationKey];
    if (!locationValues || locationValues.length === 0) return { responseHeaders };

    const redirectDest = locationValues[0];
    if (!redirectDest) return { responseHeaders };

    // Skip internal destinations and same-domain redirects (e.g. HTTP → HTTPS)
    try {
      const destUrl = new URL(redirectDest);
      const h = destUrl.hostname;
      if (h === 'localhost' || h === '127.0.0.1' || h === '::1') {
        return { responseHeaders };
      }
      const sourceDomain = this.extractDomain(url);
      if (sourceDomain && h === sourceDomain) {
        return { responseHeaders };
      }
    } catch {
      return { responseHeaders };
    }

    // 1. Blocklist check
    const blockResult = this.shield.checkUrl(redirectDest);
    if (blockResult.blocked) {
      this.stats.blocked++;
      const domain = this.extractDomain(redirectDest);
      this.db.logEvent({
        timestamp: Date.now(),
        domain,
        tabId: null,
        eventType: 'redirect-blocked',
        severity: 'high',
        category: 'network',
        details: JSON.stringify({
          from: url.substring(0, 200),
          to: redirectDest.substring(0, 200),
          reason: blockResult.reason,
          source: blockResult.source,
        }),
        actionTaken: 'auto_block',
        confidence: AnalysisConfidence.BLOCKLIST,
      });
      return { cancel: true, responseHeaders };
    }

    // 2. Risk score check
    const riskHost = this.extractDomain(redirectDest);
    if (riskHost && riskHost !== 'localhost' && riskHost !== '127.0.0.1' && riskHost !== '::1') {
      const riskResult = this.computeRiskScore(redirectDest);
      if (riskResult.score >= 65) {
        this.stats.blocked++;
        this.db.logEvent({
          timestamp: Date.now(),
          domain: riskHost,
          tabId: null,
          eventType: 'redirect-blocked',
          severity: 'high',
          category: 'network',
          details: JSON.stringify({
            from: url.substring(0, 200),
            to: redirectDest.substring(0, 200),
            score: riskResult.score,
            reasons: riskResult.reasons,
          }),
          actionTaken: 'auto_block',
          confidence: AnalysisConfidence.HEURISTIC,
        });
        return { cancel: true, responseHeaders };
      } else if (riskResult.score >= 30) {
        this.db.logEvent({
          timestamp: Date.now(),
          domain: riskHost,
          tabId: null,
          eventType: 'redirect-risk',
          severity: 'medium',
          category: 'network',
          details: JSON.stringify({
            from: url.substring(0, 200),
            to: redirectDest.substring(0, 200),
            score: riskResult.score,
            reasons: riskResult.reasons,
          }),
          actionTaken: 'flagged',
          confidence: AnalysisConfidence.HEURISTIC,
        });
      }
    }

    return { responseHeaders };
  }

  // === Redirect analysis (observational — cannot cancel, log + flag) ===

  private checkRedirect(details: Electron.OnBeforeRedirectListenerDetails): void {
    const redirectUrl = details.redirectURL;
    if (!redirectUrl) return;

    // Skip internal redirects
    if (redirectUrl.startsWith('devtools://') || redirectUrl.startsWith('chrome://') || redirectUrl.startsWith('file://')) return;

    const originDomain = this.extractDomain(details.url);
    const redirectDomain = this.extractDomain(redirectUrl);

    // Skip same-domain redirects
    if (originDomain && redirectDomain && originDomain === redirectDomain) return;

    // 1. Blocklist check on redirect destination
    const blockResult = this.shield.checkUrl(redirectUrl);
    if (blockResult.blocked) {
      this.db.logEvent({
        timestamp: Date.now(),
        domain: redirectDomain,
        tabId: null,
        eventType: 'warned',
        severity: 'high',
        category: 'network',
        details: JSON.stringify({
          url: redirectUrl.substring(0, 200),
          originUrl: details.url.substring(0, 200),
          reason: 'redirect-blocked',
          blockReason: blockResult.reason,
          source: blockResult.source,
        }),
        actionTaken: 'flagged',
        confidence: AnalysisConfidence.BLOCKLIST,
      });
    }

    // 2. Risk score on redirect destination
    const riskHost = this.extractDomain(redirectUrl);
    if (riskHost !== 'localhost' && riskHost !== '127.0.0.1' && riskHost !== '::1') {
      const riskResult = this.computeRiskScore(redirectUrl);
      if (riskResult.score >= 30) {
        this.db.logEvent({
          timestamp: Date.now(),
          domain: redirectDomain,
          tabId: null,
          eventType: 'warned',
          severity: riskResult.score >= 50 ? 'high' : 'medium',
          category: 'network',
          details: JSON.stringify({
            url: redirectUrl.substring(0, 200),
            originUrl: details.url.substring(0, 200),
            reason: 'redirect-risk',
            riskScore: riskResult.score,
            riskReasons: riskResult.reasons,
          }),
          actionTaken: 'flagged',
          confidence: AnalysisConfidence.HEURISTIC,
        });
      }
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

    // Count Set-Cookie headers for ALL resource types (not just mainFrame)
    const cookies = responseHeaders['set-cookie'] || responseHeaders['Set-Cookie'];
    if (cookies && cookies.length > 0) {
      this.cookieCounts.set(domain, (this.cookieCounts.get(domain) || 0) + cookies.length);

      // Evict oldest entries when map exceeds 1000 domains
      if (this.cookieCounts.size > 1000) {
        const firstKey = this.cookieCounts.keys().next().value;
        if (firstKey) this.cookieCounts.delete(firstKey);
      }
    }

    // Only analyze main frame navigations to reduce noise
    if (getResourceType(details) !== 'mainFrame') return;

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
        confidence: AnalysisConfidence.SPECULATIVE,
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
        confidence: AnalysisConfidence.HEURISTIC,
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
          confidence: AnalysisConfidence.SPECULATIVE,
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

  quarantineWebContents(
    wcId: number,
    input: {
      incidentId: string;
      domain: string | null;
      reason: string;
      reviewMessage: string;
    }
  ): void {
    this.quarantinedWebContents.set(wcId, {
      ...input,
      createdAt: Date.now(),
      blockedRequests: 0,
    });
  }

  releaseWebContentsQuarantine(wcId: number): void {
    this.quarantinedWebContents.delete(wcId);
  }

  isWebContentsQuarantined(wcId: number): boolean {
    return this.quarantinedWebContents.has(wcId);
  }

  setDefaultMode(mode: GuardianMode): void {
    this.defaultMode = mode;
  }

  // Phase 0-B: Cookie count accumulator for EvolutionEngine
  getCookieCount(domain: string): number {
    return this.cookieCounts.get(domain) || 0;
  }

  resetCookieCount(domain: string): void {
    this.cookieCounts.delete(domain);
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
