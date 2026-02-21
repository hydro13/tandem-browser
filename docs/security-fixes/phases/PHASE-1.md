# Phase 1: Real Redirect Blocking + WebSocket False Positive Fix

## Goal

Two targeted security fixes. No new files needed — all changes are in existing files.

**Fix 1:** `ws://127.0.0.1:18789/` (Tandem's own WebSocket) triggers a false positive `unknown-ws-endpoint` warning. Add a localhost exclusion in `analyzeWebSocket()`.

**Fix 2:** HTTP redirects to malicious destinations bypass all security layers because `onBeforeRedirect` fires after Electron already follows the redirect. Switch to `onHeadersReceived` which fires before and supports `cancel: true`.

## Prerequisites

- Read `STATUS.md` — must show Phase 1 as PENDING
- Read `src/network/dispatcher.ts` fully — understand `HeadersReceivedConsumer` interface and `reattach()`
- Read `src/security/guardian.ts` — understand `setup()`, `checkRedirect()`, `computeRiskScore()`, `extractDomain()`
- Read `src/security/outbound-guard.ts` — understand `analyzeWebSocket()`

## Deliverables

### 1. `src/security/outbound-guard.ts` — Fix WebSocket false positive

In `analyzeWebSocket()`, after `const wsDomain = this.extractDomain(url)`, add a localhost check:

```typescript
// Skip internal/Tandem WebSocket endpoints (e.g. ws://127.0.0.1:18789/)
try {
  const wsUrl = new URL(url);
  if (wsUrl.hostname === 'localhost' || wsUrl.hostname === '127.0.0.1' || wsUrl.hostname === '::1') {
    this.stats.allowed++;
    return { action: 'allow', reason: 'internal-ws', severity: 'info' };
  }
} catch {
  // invalid url — fall through to normal checks
}
```

### 2. `src/network/dispatcher.ts` — Add cancel support to HeadersReceivedConsumer

**Change 1:** Update the `HeadersReceivedConsumer` interface to support optional cancel:

```typescript
export interface HeadersReceivedConsumer {
  name: string;
  priority: number;
  handler: (
    details: OnHeadersReceivedListenerDetails,
    responseHeaders: Record<string, string[]>
  ) => { cancel?: boolean; responseHeaders: Record<string, string[]> } | Record<string, string[]>;
}
```

**Change 2:** Update the `onHeadersReceived` block inside `reattach()`. Replace the existing block:

```typescript
// REPLACE THIS:
this.session.webRequest.onHeadersReceived((details, callback) => {
  let responseHeaders = { ...(details.responseHeaders || {}) };

  for (const consumer of this.headersReceivedConsumers) {
    try {
      responseHeaders = consumer.handler(details, responseHeaders);
    } catch (err) {
      console.error(`[Dispatcher] Error in ${consumer.name}.onHeadersReceived:`, err);
    }
  }

  callback({ responseHeaders });
});

// WITH THIS:
this.session.webRequest.onHeadersReceived((details, callback) => {
  let responseHeaders = { ...(details.responseHeaders || {}) };

  for (const consumer of this.headersReceivedConsumers) {
    try {
      const result = consumer.handler(details, responseHeaders);
      // Support cancel (for redirect blocking)
      if (result && typeof result === 'object' && 'cancel' in result && result.cancel) {
        callback({ cancel: true });
        return;
      }
      // Support both return shapes: { responseHeaders } or raw headers object
      if (result && typeof result === 'object' && 'responseHeaders' in result && !Array.isArray((result as any).responseHeaders)) {
        responseHeaders = (result as { responseHeaders: Record<string, string[]> }).responseHeaders;
      } else {
        responseHeaders = result as Record<string, string[]>;
      }
    } catch (err) {
      console.error(`[Dispatcher] Error in ${consumer.name}.onHeadersReceived:`, err);
    }
  }

  callback({ responseHeaders });
});
```

### 3. `src/security/guardian.ts` — Three changes

**Change 1:** Update existing `registerHeadersReceived` handler in `setup()` to return `{ responseHeaders }` (required by updated interface):

```typescript
// Find this block and change return value:
dispatcher.registerHeadersReceived({
  name: 'Guardian',
  priority: 20,
  handler: (details, responseHeaders) => {
    this.analyzeResponseHeaders(details, responseHeaders);
    return { responseHeaders };  // was: return responseHeaders
  }
});
```

**Change 2:** Add new `Guardian:RedirectBlock` consumer in `setup()`, BEFORE the existing `Guardian` consumer (priority 5 runs before priority 20):

```typescript
// Add this BEFORE the existing 'Guardian' registerHeadersReceived block:
dispatcher.registerHeadersReceived({
  name: 'Guardian:RedirectBlock',
  priority: 5,
  handler: (details, responseHeaders) => {
    return this.checkRedirectHeaders(details, responseHeaders);
  }
});
```

**Change 3:** Add the `checkRedirectHeaders()` private method to the `Guardian` class. Place it near the existing `checkRedirect()` method:

```typescript
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
      });
    }
  }

  return { responseHeaders };
}
```

## Verificatie Checklist

Run after `npm start`:

```bash
TOKEN=$(cat ~/.tandem/api-token)
H="Authorization: Bearer $TOKEN"

# TypeScript check FIRST
npx tsc --noEmit
# → 0 errors

# Test 1: WS false positive gone
# Restart Tandem, wait 10 sec, then:
sqlite3 ~/.tandem/security/shield.db \
  "SELECT event_type, domain, severity FROM events WHERE domain='127.0.0.1' AND event_type='warned' ORDER BY timestamp DESC LIMIT 5;"
# → Should show 0 new rows (the ws://127.0.0.1:18789/ is no longer flagged)

# Test 2: HTTP→HTTPS redirect on same domain still works (no false positive)
curl -s -X POST http://127.0.0.1:8765/tabs/open \
  -H "Content-Type: application/json" -H "$H" \
  -d '{"url":"http://example.com"}'
# → Tab should navigate to https://example.com without being blocked

# Test 3: Redirect to blocklisted domain is blocked
# Use httpbin.org to simulate a redirect to a known bad URL from URLhaus
# Check: pick any IP from ~/.tandem/security/blocklists/urlhaus.txt and test:
BAD_IP=$(grep -oP '^\d+\.\d+\.\d+\.\d+' ~/.tandem/security/blocklists/urlhaus.txt | head -1)
echo "Testing redirect to: $BAD_IP"

# Open a tab and navigate to httpbin redirect pointing to bad IP
curl -s -X POST http://127.0.0.1:8765/tabs/open \
  -H "Content-Type: application/json" -H "$H" \
  -d "{\"url\":\"https://httpbin.org/redirect-to?url=http://${BAD_IP}/\"}"

sleep 3

# Check DB for redirect-blocked event
sqlite3 ~/.tandem/security/shield.db \
  "SELECT event_type, domain, action_taken, datetime(timestamp/1000,'unixepoch') as ts FROM events WHERE event_type='redirect-blocked' ORDER BY timestamp DESC LIMIT 5;"
# → Should show redirect-blocked with auto_block

# Test 4: Regression — security status endpoint still works
curl -s http://127.0.0.1:8765/security/status | python3 -m json.tool | head -10
# → Valid JSON response

# Test 5: Normal browsing still works
# Open a tab and navigate to https://github.com — should load normally
```

## Commit Message

```
fix(security): real redirect blocking via onHeadersReceived + WS false positive

- outbound-guard.ts: skip localhost/127.0.0.1/::1 in analyzeWebSocket()
  (Tandem's own ws://127.0.0.1:18789/ no longer logs unknown-ws-endpoint)
- dispatcher.ts: HeadersReceivedConsumer now supports cancel: true
  (onHeadersReceived can now cancel redirects before Electron follows them)
- guardian.ts: Guardian:RedirectBlock consumer at priority 5
  (fires before Guardian at 20, intercepts 3xx responses)
- guardian.ts: checkRedirectHeaders() — blocklist + risk score on Location header
  (redirect-blocked logged with auto_block when destination is suspicious)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

## Scope (1 Claude Code sessie)

- `src/security/outbound-guard.ts` — add localhost check in analyzeWebSocket()
- `src/network/dispatcher.ts` — update HeadersReceivedConsumer interface + onHeadersReceived loop
- `src/security/guardian.ts` — update existing handler return value + new consumer + new method
- TypeScript check + verificatie + STATUS.md update + commit + push
