# Phase 2: Outbound Data Guard

## Goal

Prevent data exfiltration. Monitor and control all outgoing data (POST, PUT, form submits, fetch). This is the last line or defense — a script can load, but if it can't SEND your data anywhere, it's harmless.

## Prerequisites

- **Phase 0 + 1 MUST be completed and verified** — check `docs/security-shield/STATUS.md`
- Read `src/security/guardian.ts` — you'll extend this
- Read `src/network/dispatcher.ts` — understand the consumer model

## Technical Context

**POST body access:** Electron's `onBeforeRequest` provides `details.uploadData` — an array or `UploadData` objects:

```typescript
interface UploadData {
  bytes: Buffer;      // Raw POST body bytes
  file?: string;      // File path (for file uploads)
  blobUUID?: string;  // Blob UUID (use ses.getBlobData() to retrieve)
}
```

**Limitations to know:**
- Form data parsing is NOT automatic — you must manually parse `application/x-www-form-urlencoded` and `multipart/form-data`
- Response bodies are NOT available via webRequest — only via CDP `Network.getResponseBody` (Phase 3+)
- WebSocket frame-level monitoring (data exfiltration via WS messages) is NOT possible via webRequest — requires CDP `Network.webSocketFrameSent` (Phase 3+)

## Deliverables

### 1. `src/security/outbound-guard.ts`

```typescript
import { SecurityDB } from './security-db';
import { Guardian } from './guardian';

interface OutboundDecision {
  action: 'allow' | 'block' | 'flag';
  reason: string;
  severity: EventSeverity;
}

class OutboundGuard {
  private db: SecurityDB;

  constructor(db: SecurityDB) {
    this.db = db;
  }

  // Called by Guardian's onBeforeRequest for POST/PUT/PATCH requests
  analyzeOutbound(details: Electron.OnBeforeRequestListenerDetails): OutboundDecision {
    const destDomain = this.extractDomain(details.url);
    const originDomain = details.referrer ? this.extractDomain(details.referrer) : null;

    // 1. Same-origin POST = always allow (normal form submissions)
    if (originDomain && destDomain === originDomain) {
      return { action: 'allow', reason: 'same-origin', severity: 'info' };
    }

    // 2. Known analytics/tracker destination
    if (this.isKnownTracker(destDomain)) {
      const mode = this.getMode(originDomain);
      if (mode === 'strict') return { action: 'block', reason: 'tracker-blocked-strict', severity: 'low' };
      return { action: 'flag', reason: 'tracker-detected', severity: 'info' };
    }

    // 3. Check POST body for credential-like data
    if (details.uploadData?.length) {
      const bodyAnalysis = this.analyzeBody(details.uploadData, details.url);

      // Cross-origin credential submission = ALWAYS BLOCK
      if (bodyAnalysis.hasCredentials && originDomain !== destDomain) {
        return { action: 'block', reason: 'cross-origin-credentials', severity: 'critical' };
      }

      // Abnormally large POST to unknown domain = HOLD/FLAG
      if (bodyAnalysis.sizeBytes > 1_000_000 && !this.isTrustedDomain(destDomain)) {
        return { action: 'flag', reason: 'large-body-unknown-domain', severity: 'high' };
      }
    }

    // 4. Cross-origin POST from trusted to untrusted
    if (originDomain && this.isTrustedDomain(originDomain) && !this.isTrustedDomain(destDomain)) {
      return { action: 'flag', reason: 'cross-origin-trusted-to-untrusted', severity: 'medium' };
    }

    return { action: 'allow', reason: 'no-threat-detected', severity: 'info' };
  }

  // Analyze POST body content
  private analyzeBody(uploadData: Electron.UploadData[], url: string): BodyAnalysis {
    let totalSize = 0;
    let hasCredentials = false;

    for (const part or uploadData) {
      if (part.bytes) {
        totalSize += part.bytes.length;

        // Only scan text-like content, not binary uploads
        if (totalSize < 100_000) { // Don't parse huge bodies
          const text = part.bytes.toString('utf-8');

          // Check for credential patterns
          // Combine with Content-Type check for accuracy
          if (/password|passwd|pw=|secret|token|credit.?card|cvv|ssn/i.test(text)) {
            hasCredentials = true;
          }
        }
      }
    }

    return { sizeBytes: totalSize, hasCredentials };
  }

  // Monitor WebSocket upgrade requests (not frames — that needs CDP)
  analyzeWebSocket(url: string, referrer: string | undefined): OutboundDecision {
    const wsDomain = this.extractDomain(url);
    const originDomain = referrer ? this.extractDomain(referrer) : null;

    // Same domain = normal
    if (originDomain && wsDomain === originDomain) {
      return { action: 'allow', reason: 'same-origin-ws', severity: 'info' };
    }

    // Known service endpoints (socket.io, pusher, etc.)
    if (this.isKnownWSService(wsDomain)) {
      return { action: 'allow', reason: 'known-ws-service', severity: 'info' };
    }

    // Unknown WS endpoint from trusted page = FLAG
    return { action: 'flag', reason: 'unknown-ws-endpoint', severity: 'medium' };
  }
}
```

### 2. Extend Guardian

Add outbound checking to Guardian's `checkRequest` method:

```typescript
// In guardian.ts, inside checkRequest():

// After blocklist check, before allow:
if (['POST', 'PUT', 'PATCH'].includes(details.method || '')) {
  const outboundResult = this.outboundGuard.analyzeOutbound(details);
  if (outboundResult.action === 'block') {
    this.stats.blocked++;
    this.db.logEvent({
      timestamp: Date.now(),
      domain: this.extractDomain(details.url),
      tabId: null,
      eventType: 'exfiltration_attempt',
      severity: outboundResult.severity,
      category: 'outbound',
      details: JSON.stringify({
        url: details.url,
        method: details.method,
        reason: outboundResult.reason,
        referrer: details.referrer,
      }),
      actionTaken: 'auto_block',
    });
    return { cancel: true };
  }
  if (outboundResult.action === 'flag') {
    this.db.logEvent({ /* severity: medium, actionTaken: 'flagged' */ });
    // Allow but log for AI agent review (Phase 4)
  }
}

// WebSocket upgrade detection
if (details.url.startsWith('ws://') || details.url.startsWith('wss://')) {
  const wsResult = this.outboundGuard.analyzeWebSocket(details.url, details.referrer);
  // Same block/flag/allow logic
}
```

### 3. New API Endpoints

Add to SecurityManager's `registerRoutes()`:

```typescript
// GET /security/outbound/stats — Outbound requests blocked/allowed/flagged
app.get('/security/outbound/stats', (req, res) => {
  res.json(this.outboundGuard.getStats());
});

// GET /security/outbound/recent — Recent outbound events
app.get('/security/outbound/recent', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const events = this.db.getRecentEvents(limit, undefined, 'outbound');
  res.json({ events });
});

// POST /security/outbound/whitelist — Whitelist a domain pair
app.post('/security/outbound/whitelist', (req, res) => {
  const { origin, destination } = req.body;
  // Store in DB as trusted pair
  res.json({ ok: true });
});
```

## Key Rules

1. **Same-origin POST = always allow** (normal form submissions)
2. **Known analytics destinations = strip or block based on guardian mode**
3. **Cross-origin credential submissions = ALWAYS BLOCK + ALERT**
4. **New outbound destination on known site = FLAG for review**
5. **WebSocket upgrade to unknown endpoint = FLAG**
6. **Abnormally large POST body (>1MB to unknown domain) = FLAG**
7. **File upload detection via `uploadData.file` = LOG always**

## Verification Checklist

- [ ] Normal form submissions work (Google search, GitHub login, any login flow)
- [ ] Cross-origin POST with password-like data → blocked + event logged
- [ ] Same-origin POST with password → allowed (normal login)
- [ ] Analytics/tracker POST requests → blocked in strict mode, allowed in permissive
- [ ] `GET /security/outbound/stats` shows accurate counts
- [ ] No false positives on common sites (Google, GitHub, LinkedIn login flows)
- [ ] WebSocket upgrade to known service (socket.io CDN) → allowed
- [ ] WebSocket upgrade to unknown domain → flagged
- [ ] `GET /security/events?category=outbound` shows outbound events
- [ ] Large POST body (>1MB) to unknown domain → flagged
- [ ] Whitelisted domain pair bypasses outbound checks
- [ ] NetworkInspector + Stealth still work (Phase 0 regression check)

## What NOT to Change

- Do NOT modify `src/network/dispatcher.ts`
- Do NOT add CDP-based monitoring — that's Phase 3
- Do NOT add WebSocket frame inspection — that's Phase 3 (needs CDP)

## Commit Convention

```bash
git add src/security/outbound-guard.ts src/security/guardian.ts src/security/security-manager.ts src/security/types.ts
git commit -m "feat(security): Phase 2 — Outbound Data Guard

- Add OutboundGuard for POST/PUT/PATCH body analysis
- Detect cross-origin credential exfiltration (auto-block)
- Detect large POST bodies to unknown domains (flag)
- Monitor WebSocket upgrade requests
- Add /security/outbound/* API endpoints
- Add domain pair whitelisting

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push origin main
```

## Scope (1 Claude Code session)

- OutboundGuard class (POST body analysis, credential detection)
- Guardian extension (outbound checking, WebSocket monitoring)
- 3 API endpoints + whitelist table + verification

## Status Update Template

After completing this phase, update `docs/security-shield/STATUS.md`:

```markdown
## Phase 2: Outbound Data Guard
- **Status:** COMPLETED
- **Date:** YYYY-MM-DD
- **Commit:** <hash>
- **Verification:**
  - [x] Normal forms work
  - [x] Cross-origin credentials blocked
  - [x] Same-origin credentials allowed
  - [x] Tracker blocking per mode
  - [x] Stats API accurate
  - [x] No false positives
  - [x] WebSocket monitoring works
  - [x] Phase 0+1 regression OK
- **Issues encountered:** (none / describe)
- **Notes for next phase:** (anything Phase 3 session needs to know)
```
