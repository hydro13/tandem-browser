import { OnBeforeRequestListenerDetails } from 'electron';
import { SecurityDB } from './security-db';
import { OutboundDecision, BodyAnalysis, OutboundStats, GuardianMode, KNOWN_TRACKERS, KNOWN_WS_SERVICES } from './types';
import { createLogger } from '../utils/logger';

const log = createLogger('OutboundGuard');

// Credential field patterns in POST bodies
const CREDENTIAL_PATTERN = /(?:^|&|"|,\s*")(?:password|passwd|pw|pass|secret|token|api[_-]?key|access[_-]?token|credit[_-]?card|card[_-]?number|cvv|cvc|ssn|social[_-]?security)(?:"|]?\s*[:=])/i;

// Trusted media/binary Content-Types — skip body credential scanning for these
const TRUSTED_OUTBOUND_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'image/bmp', 'image/tiff', 'image/x-icon', 'image/avif',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'font/woff', 'font/woff2', 'font/ttf', 'font/otf',
  'application/octet-stream', 'application/zip', 'application/gzip',
]);

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
    log.info('Initialized');
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

    // 4. Content-Type whitelist — skip body scan for known-safe media types.
    // NOTE: Electron's onBeforeRequest does not expose request headers, so we extract
    // Content-Type from multipart form-data body bytes. This means non-multipart binary
    // POSTs (e.g., raw image PUT) will not match and their body will still be scanned.
    // This is a known limitation of the Electron webRequest API.
    if (details.uploadData?.length) {
      const contentType = this.extractUploadContentType(details.uploadData);
      if (contentType && TRUSTED_OUTBOUND_CONTENT_TYPES.has(contentType)) {
        this.stats.allowed++;
        return { action: 'allow', reason: 'trusted-content-type', severity: 'info' };
      }
    }

    // 5. Check POST body for credential-like data
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

    // 6. Cross-origin POST from trusted to untrusted
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

    // Skip internal/Tandem WebSocket endpoints (e.g. ws://127.0.0.1:WEBHOOK_PORT/)
    try {
      const wsUrl = new URL(url);
      if (wsUrl.hostname === 'localhost' || wsUrl.hostname === '127.0.0.1' || wsUrl.hostname === '::1') {
        this.stats.allowed++;
        return { action: 'allow', reason: 'internal-ws', severity: 'info' };
      }
    } catch {
      // invalid url — fall through to normal checks
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

  /**
   * Extract Content-Type from upload data.
   * Checks multipart form-data headers embedded in the bytes (e.g. "Content-Type: image/jpeg").
   * Returns null if Content-Type cannot be determined.
   */
  private extractUploadContentType(uploadData: Electron.UploadData[]): string | null {
    for (const part of uploadData) {
      if (part.bytes && part.bytes.length > 0) {
        // Look for Content-Type header in multipart form data (first 2KB)
        const header = part.bytes.subarray(0, 2048).toString('utf-8');

        // Safety: if multipart form has multiple fields, don't skip scanning
        // (mixed forms may have text fields with credentials alongside file uploads)
        const dispositions = header.match(/Content-Disposition:/gi);
        if (dispositions && dispositions.length > 1) return null;

        const match = header.match(/Content-Type:\s*([^\r\n;]+)/i);
        if (match) {
          return match[1].trim().toLowerCase();
        }
      }
    }
    return null;
  }

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
