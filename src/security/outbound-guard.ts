import { OnBeforeRequestListenerDetails } from 'electron';
import { SecurityDB } from './security-db';
import { OutboundDecision, BodyAnalysis, OutboundStats, GuardianMode } from './types';

// Known analytics/tracker domains (outbound POST targets)
const KNOWN_TRACKERS = new Set([
  // Google Analytics / Tag Manager
  'www.google-analytics.com', 'google-analytics.com',
  'analytics.google.com', 'www.googletagmanager.com',
  'googletagmanager.com', 'stats.g.doubleclick.net',
  'pagead2.googlesyndication.com',
  // Facebook/Meta
  'www.facebook.com', 'connect.facebook.net',
  'pixel.facebook.com', 'graph.facebook.com',
  // Microsoft/LinkedIn
  'bat.bing.com', 'px.ads.linkedin.com',
  'snap.licdn.com',
  // Other trackers
  'mc.yandex.ru', 'cdn.mxpnl.com', 'api.mixpanel.com',
  'api.segment.io', 'cdn.segment.com',
  'api.amplitude.com', 'cdn.amplitude.com',
  'rum-http-intake.logs.datadoghq.com',
  'sentry.io', 'o0.ingest.sentry.io',
  'plausible.io', 'stats.wp.com',
  'api.hubspot.com', 'track.hubspot.com',
  'ct.pinterest.com', 'analytics.tiktok.com',
  'sc-static.net', 'tr.snapchat.com',
]);

// Known WebSocket service providers (not suspicious)
const KNOWN_WS_SERVICES = new Set([
  // Pusher
  'ws.pusherapp.com', 'sockjs.pusher.com',
  // Socket.IO CDN / common endpoints
  'socket.io', 'cdn.socket.io',
  // Firebase
  's-usc1c-nss-2.firebaseio.com', 'firebaseio.com',
  // Ably
  'realtime.ably.io',
  // Supabase
  'realtime.supabase.co',
  // Common chat/collab
  'wss.slack.com', 'gateway.discord.gg',
  // Intercom
  'nexus-websocket-a.intercom.io',
]);

// Credential field patterns in POST bodies
const CREDENTIAL_PATTERN = /(?:^|&|"|,\s*")(?:password|passwd|pw|pass|secret|token|api[_-]?key|access[_-]?token|credit[_-]?card|card[_-]?number|cvv|cvc|ssn|social[_-]?security)(?:"|]?\s*[:=])/i;

// Max body size to scan for credentials (100KB)
const MAX_SCAN_SIZE = 100_000;

// Large body threshold (1MB)
const LARGE_BODY_THRESHOLD = 1_000_000;

// Trust level threshold — domains at or above this are considered trusted
const TRUSTED_THRESHOLD = 50;

export class OutboundGuard {
  private db: SecurityDB;
  private stats: OutboundStats = { totalChecked: 0, allowed: 0, blocked: 0, flagged: 0 };

  constructor(db: SecurityDB) {
    this.db = db;
    console.log('[OutboundGuard] Initialized');
  }

  /**
   * Analyze an outbound POST/PUT/PATCH request.
   * Called by Guardian's checkRequest() for mutating HTTP methods.
   */
  analyzeOutbound(details: OnBeforeRequestListenerDetails, mode: GuardianMode): OutboundDecision {
    this.stats.totalChecked++;

    const destDomain = this.extractDomain(details.url);
    if (!destDomain) {
      this.stats.allowed++;
      return { action: 'allow', reason: 'invalid-url', severity: 'info' };
    }

    const originDomain = details.referrer ? this.extractDomain(details.referrer) : null;

    // 1. Same-origin POST = always allow (normal form submissions, login flows)
    if (originDomain && destDomain === originDomain) {
      this.stats.allowed++;
      return { action: 'allow', reason: 'same-origin', severity: 'info' };
    }

    // 2. Check whitelisted domain pair
    if (originDomain && this.db.isWhitelistedPair(originDomain, destDomain)) {
      this.stats.allowed++;
      return { action: 'allow', reason: 'whitelisted-pair', severity: 'info' };
    }

    // 3. Known analytics/tracker destination
    if (this.isKnownTracker(destDomain)) {
      if (mode === 'strict') {
        this.stats.blocked++;
        return { action: 'block', reason: 'tracker-blocked-strict', severity: 'low' };
      }
      // balanced/permissive: flag but allow
      this.stats.flagged++;
      return { action: 'flag', reason: 'tracker-detected', severity: 'info' };
    }

    // 4. Check POST body for credential-like data
    if (details.uploadData?.length) {
      const bodyAnalysis = this.analyzeBody(details.uploadData);

      // Cross-origin credential submission = ALWAYS BLOCK
      if (bodyAnalysis.hasCredentials && originDomain !== destDomain) {
        this.stats.blocked++;
        return { action: 'block', reason: 'cross-origin-credentials', severity: 'critical' };
      }

      // File upload logging (always log, never block)
      if (bodyAnalysis.hasFileUpload) {
        this.stats.flagged++;
        return { action: 'flag', reason: 'file-upload-detected', severity: 'info' };
      }

      // Abnormally large POST to unknown domain = FLAG
      if (bodyAnalysis.sizeBytes > LARGE_BODY_THRESHOLD && !this.isTrustedDomain(destDomain)) {
        this.stats.flagged++;
        return { action: 'flag', reason: 'large-body-unknown-domain', severity: 'high' };
      }
    }

    // 5. Cross-origin POST from trusted to untrusted
    if (originDomain && this.isTrustedDomain(originDomain) && !this.isTrustedDomain(destDomain)) {
      this.stats.flagged++;
      return { action: 'flag', reason: 'cross-origin-trusted-to-untrusted', severity: 'medium' };
    }

    this.stats.allowed++;
    return { action: 'allow', reason: 'no-threat-detected', severity: 'info' };
  }

  /**
   * Analyze a WebSocket upgrade request (connection-level only — frame inspection requires CDP).
   */
  analyzeWebSocket(url: string, referrer: string | undefined): OutboundDecision {
    this.stats.totalChecked++;

    const wsDomain = this.extractDomain(url);
    if (!wsDomain) {
      this.stats.allowed++;
      return { action: 'allow', reason: 'invalid-ws-url', severity: 'info' };
    }

    const originDomain = referrer ? this.extractDomain(referrer) : null;

    // Same domain = normal
    if (originDomain && wsDomain === originDomain) {
      this.stats.allowed++;
      return { action: 'allow', reason: 'same-origin-ws', severity: 'info' };
    }

    // Whitelisted pair
    if (originDomain && this.db.isWhitelistedPair(originDomain, wsDomain)) {
      this.stats.allowed++;
      return { action: 'allow', reason: 'whitelisted-ws-pair', severity: 'info' };
    }

    // Known WebSocket service providers
    if (this.isKnownWSService(wsDomain)) {
      this.stats.allowed++;
      return { action: 'allow', reason: 'known-ws-service', severity: 'info' };
    }

    // Unknown WS endpoint = FLAG
    this.stats.flagged++;
    return { action: 'flag', reason: 'unknown-ws-endpoint', severity: 'medium' };
  }

  /**
   * Analyze POST body content for credential patterns and size.
   */
  private analyzeBody(uploadData: Electron.UploadData[]): BodyAnalysis {
    let totalSize = 0;
    let hasCredentials = false;
    let hasFileUpload = false;

    for (const part of uploadData) {
      // Detect file uploads via file path
      if (part.file) {
        hasFileUpload = true;
      }

      if (part.bytes) {
        totalSize += part.bytes.length;

        // Only scan text-like bodies under MAX_SCAN_SIZE
        if (totalSize <= MAX_SCAN_SIZE) {
          const text = part.bytes.toString('utf-8');
          if (CREDENTIAL_PATTERN.test(text)) {
            hasCredentials = true;
          }
        }
      }
    }

    return { sizeBytes: totalSize, hasCredentials, hasFileUpload };
  }

  getStats(): OutboundStats {
    return { ...this.stats };
  }

  // === Helpers ===

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  private isKnownTracker(domain: string): boolean {
    if (KNOWN_TRACKERS.has(domain)) return true;
    // Check parent domains (e.g., sub.tracker.com)
    const parts = domain.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      if (KNOWN_TRACKERS.has(parts.slice(i).join('.'))) return true;
    }
    return false;
  }

  private isKnownWSService(domain: string): boolean {
    if (KNOWN_WS_SERVICES.has(domain)) return true;
    // Check parent domain match (e.g., s-usc1c-nss-2.firebaseio.com → firebaseio.com)
    const parts = domain.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      if (KNOWN_WS_SERVICES.has(parts.slice(i).join('.'))) return true;
    }
    return false;
  }

  private isTrustedDomain(domain: string): boolean {
    const info = this.db.getDomainInfo(domain);
    return info !== null && info.trustLevel >= TRUSTED_THRESHOLD;
  }
}
