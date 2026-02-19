# Phase 0: Unified Request Dispatcher

## Goal

Build the architectural foundation that makes ALL subsequent phases possible. Electron's `session.webRequest` allows only **one listener per event type** — the last registered listener silently replaces all previous ones. This phase creates a central dispatcher that multiplexes all consumers onto a single listener per hook.

Without this, Phase 1's Guardian would break NetworkInspector, and StealthManager's header modifications would conflict with Guardian's header stripping.

## Why This Phase Exists

**Electron limitation (confirmed):** [GitHub Issue #18301](https://github.com/electron/electron/issues/18301) — open since 2019, never resolved.

The current codebase already has a **latent bug**:

- `src/stealth/manager.ts` registers `onBeforeSendHeaders` (no URL filter)
- `src/main.ts:179` registers `onBeforeSendHeaders` (with WebSocket URL filter)

These coexist by accident (different filter configs), not by design. Adding a third handler for Guardian would break one of the existing two.

## Prerequisites

- Read `src/network/inspector.ts` — understand current webRequest hooks
- Read `src/stealth/manager.ts` — understand header modification, **especially the Google auth bypass (lines 39-47)** that deletes User-Agent for Google domains — this logic MUST be preserved 1:1
- Read `src/main.ts` — understand all session.webRequest registrations (lines ~77-185)
- Run the app with `npm start` and verify normal browsing works (baseline)

## Before You Start

**Create a rollback point:**
```bash
git tag pre-security-shield
```
If Phase 0 breaks the app, `git checkout pre-security-shield` restores a working state.

## Deliverables

### 1. `src/network/dispatcher.ts` — Unified Request Dispatcher

```typescript
import { Session, OnBeforeRequestListenerDetails, OnBeforeSendHeadersListenerDetails, OnHeadersReceivedListenerDetails } from 'electron';

interface BeforeRequestConsumer {
  name: string;
  priority: number; // lower = runs first
  handler: (details: OnBeforeRequestListenerDetails) => { cancel: boolean } | null;
  // Return { cancel: true } to block, null to pass through
}

interface BeforeSendHeadersConsumer {
  name: string;
  priority: number;
  handler: (details: OnBeforeSendHeadersListenerDetails, headers: Record<string, string>) => Record<string, string>;
  // Receives headers, returns modified headers. Mutations chain through consumers.
}

interface HeadersReceivedConsumer {
  name: string;
  priority: number;
  handler: (details: OnHeadersReceivedListenerDetails, responseHeaders: Record<string, string[]>) => Record<string, string[]>;
  // Receives response headers, returns modified headers. Mutations chain through consumers.
  // Same pattern as BeforeSendHeadersConsumer but for response headers.
}

interface CompletedConsumer {
  name: string;
  handler: (details: Electron.OnCompletedListenerDetails) => void;
}

interface ErrorConsumer {
  name: string;
  handler: (details: Electron.OnErrorOccurredListenerDetails) => void;
}

class RequestDispatcher {
  private session: Session;
  private beforeRequestConsumers: BeforeRequestConsumer[] = [];
  private beforeSendHeadersConsumers: BeforeSendHeadersConsumer[] = [];
  private headersReceivedConsumers: HeadersReceivedConsumer[] = [];
  private completedConsumers: CompletedConsumer[] = [];
  private errorConsumers: ErrorConsumer[] = [];

  constructor(session: Session) {
    this.session = session;
  }

  // Register consumers BEFORE calling attach()
  registerBeforeRequest(consumer: BeforeRequestConsumer): void { ... }
  registerBeforeSendHeaders(consumer: BeforeSendHeadersConsumer): void { ... }
  registerHeadersReceived(consumer: HeadersReceivedConsumer): void { ... }
  registerCompleted(consumer: CompletedConsumer): void { ... }
  registerError(consumer: ErrorConsumer): void { ... }

  // Attach all hooks to session — call ONCE after all consumers registered
  attach(): void {
    // Sort consumers by priority (lower first)
    this.beforeRequestConsumers.sort((a, b) => a.priority - b.priority);
    this.beforeSendHeadersConsumers.sort((a, b) => a.priority - b.priority);
    this.headersReceivedConsumers.sort((a, b) => a.priority - b.priority);

    // ONE handler per hook type
    this.session.webRequest.onBeforeRequest((details, callback) => {
      // Performance tracking
      const start = performance.now();

      for (const consumer of this.beforeRequestConsumers) {
        try {
          const result = consumer.handler(details);
          if (result?.cancel) {
            // Still notify remaining consumers (for logging)
            // but mark as cancelled so they know
            callback({ cancel: true });
            const elapsed = performance.now() - start;
            if (elapsed > 5) {
              console.warn(`[Dispatcher] Slow onBeforeRequest: ${elapsed.toFixed(1)}ms (blocked by ${consumer.name})`);
            }
            return;
          }
        } catch (err) {
          console.error(`[Dispatcher] Error in ${consumer.name}.onBeforeRequest:`, err);
        }
      }

      callback({ cancel: false });
      const elapsed = performance.now() - start;
      if (elapsed > 5) {
        console.warn(`[Dispatcher] Slow onBeforeRequest: ${elapsed.toFixed(1)}ms for ${details.url.substring(0, 80)}`);
      }
    });

    this.session.webRequest.onBeforeSendHeaders((details, callback) => {
      let headers = { ...details.requestHeaders };

      for (const consumer of this.beforeSendHeadersConsumers) {
        try {
          headers = consumer.handler(details, headers);
        } catch (err) {
          console.error(`[Dispatcher] Error in ${consumer.name}.onBeforeSendHeaders:`, err);
        }
      }

      callback({ requestHeaders: headers });
    });

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

    this.session.webRequest.onCompleted((details) => {
      for (const consumer of this.completedConsumers) {
        try {
          consumer.handler(details);
        } catch (err) {
          console.error(`[Dispatcher] Error in ${consumer.name}.onCompleted:`, err);
        }
      }
    });

    this.session.webRequest.onErrorOccurred((details) => {
      for (const consumer of this.errorConsumers) {
        try {
          consumer.handler(details);
        } catch (err) {
          console.error(`[Dispatcher] Error in ${consumer.name}.onErrorOccurred:`, err);
        }
      }
    });

    console.log(`[Dispatcher] Attached with ${this.beforeRequestConsumers.length} onBeforeRequest, ${this.beforeSendHeadersConsumers.length} onBeforeSendHeaders, ${this.headersReceivedConsumers.length} onHeadersReceived consumers`);
  }

  // For debugging / status API
  getStatus(): object {
    return {
      consumers: {
        onBeforeRequest: this.beforeRequestConsumers.map(c => c.name),
        onBeforeSendHeaders: this.beforeSendHeadersConsumers.map(c => c.name),
        onHeadersReceived: this.headersReceivedConsumers.map(c => c.name),
        onCompleted: this.completedConsumers.map(c => c.name),
        onError: this.errorConsumers.map(c => c.name),
      }
    };
  }
}
```

**Design rules:**
- `onBeforeRequest`: First consumer that returns `{ cancel: true }` wins. Others still get notified via `onCompleted`/`onError`.
- `onBeforeSendHeaders`: Request headers chain through all consumers. Each receives previous consumer's output.
- `onHeadersReceived`: Response headers chain through all consumers (same pattern as `onBeforeSendHeaders`). **Required for cookie fix** which modifies Set-Cookie headers (`main.ts:82-101`).
- `onCompleted` / `onErrorOccurred`: All consumers notified (logging).
- ALL handlers must be synchronous. No async, no await, no setTimeout inside handlers.

### 2. Refactor `src/network/inspector.ts`

Convert NetworkInspector from self-hooking to dispatcher consumer:

**Before (current):**
```typescript
class NetworkInspector {
  constructor() {
    const ses = session.fromPartition('persist:tandem');
    ses.webRequest.onBeforeRequest((details, callback) => { ... });
    ses.webRequest.onCompleted((details) => { ... });
    ses.webRequest.onErrorOccurred((details) => { ... });
  }
}
```

**After (refactored):**
```typescript
class NetworkInspector {
  constructor() {
    // No longer hooks session directly
    // Stores pending requests, same as before
  }

  // Called by dispatcher or during initialization
  registerWith(dispatcher: RequestDispatcher): void {
    dispatcher.registerBeforeRequest({
      name: 'NetworkInspector',
      priority: 100, // High number = runs after security checks
      handler: (details) => {
        // Log to pendingRequests — same logic as before
        // NEVER cancels — always returns null
        this.logRequest(details);
        return null;
      }
    });

    dispatcher.registerCompleted({
      name: 'NetworkInspector',
      handler: (details) => {
        // Merge response data — same logic as before
        this.completeRequest(details);
      }
    });

    dispatcher.registerError({
      name: 'NetworkInspector',
      handler: (details) => {
        // Cleanup — same logic as before
        this.handleError(details);
      }
    });
  }
}
```

### 3. Refactor `src/stealth/manager.ts`

Convert StealthManager's header modification to dispatcher consumer:

**Before (current):**
```typescript
async apply(): Promise<void> {
  this.session.setUserAgent(this.USER_AGENT);
  this.session.webRequest.onBeforeSendHeaders((details, callback) => {
    // Modify headers, remove Electron fingerprints
    callback({ requestHeaders: headers });
  });
}
```

**After (refactored):**
```typescript
async apply(): Promise<void> {
  this.session.setUserAgent(this.USER_AGENT);
  // Header modification now happens via dispatcher — no self-hooking
}

registerWith(dispatcher: RequestDispatcher): void {
  dispatcher.registerBeforeSendHeaders({
    name: 'StealthManager',
    priority: 10, // Runs early — stealth headers must be set before anything else
    handler: (details, headers) => {
      // ⚠️ CRITICAL: Preserve Google auth bypass exactly as-is!
      // Google blocks fake Chrome UA — we must delete our UA for Google domains
      // so Electron's real UA comes through (this is how Google login works)
      const url = details.url || '';
      if (url.includes('accounts.google.com') || url.includes('google.com/signin') ||
          url.includes('googleapis.com') || url.includes('gstatic.com') ||
          url.includes('consent.google.com')) {
        delete headers['User-Agent'];
        return headers;  // Skip all other stealth modifications for Google
      }

      // Strip Electron fingerprints, add Sec-CH-UA, etc.
      // ... same logic as current handler ...
      return headers;
    }
  });
}
```

### 4. Refactor `src/main.ts` — WebSocket origin fix + cookie fix

Move the inline webRequest handlers from main.ts to dispatcher consumers:

**WebSocket origin fix (main.ts ~line 179):**
```typescript
// Before: ses.webRequest.onBeforeSendHeaders(filter, handler)
// After: register as dispatcher consumer

dispatcher.registerBeforeSendHeaders({
  name: 'WebSocketOriginFix',
  priority: 50,
  handler: (details, headers) => {
    if (details.url.startsWith('ws://127.0.0.1') || details.url.startsWith('ws://localhost')) {
      headers['Origin'] = 'http://127.0.0.1:8765';
    }
    return headers;
  }
});
```

**Cookie fix (main.ts ~line 82):**

The cookie fix **MODIFIES response headers** (adds `; Secure` to SameSite=None cookies). This is why `HeadersReceivedConsumer` uses the same chaining pattern as `BeforeSendHeadersConsumer`.

```typescript
// Before: ses.webRequest.onHeadersReceived(handler) with callback({ responseHeaders: headers })
// After: register as dispatcher consumer that returns modified response headers

dispatcher.registerHeadersReceived({
  name: 'CookieFix',
  priority: 10,
  handler: (details, responseHeaders) => {
    // Fix Set-Cookie headers: ensure SameSite=None cookies have Secure flag
    const cookieHeaders = responseHeaders['set-cookie'] || responseHeaders['Set-Cookie'];
    if (cookieHeaders) {
      const fixedCookies = cookieHeaders.map((cookie: string) => {
        if (/SameSite=None/i.test(cookie) && !/;\s*Secure/i.test(cookie)) {
          return cookie + '; Secure';
        }
        return cookie;
      });
      delete responseHeaders['Set-Cookie'];
      responseHeaders['set-cookie'] = fixedCookies;
    }
    return responseHeaders;
  }
});
```

### 5. Update `src/main.ts` — Initialization order

**Problem:** The dispatcher is created in `createWindow()` but `NetworkInspector` is created later in `startAPI()` (line 216). The dispatcher must support **late registration** — consumers added after `attach()` must work.

**Solution:** Make `attach()` re-registrable. When a consumer registers after `attach()` has been called, the dispatcher re-attaches all hooks (re-sorts and re-registers the single handler). This is safe because Electron's `session.webRequest.onX()` replaces the previous handler anyway.

```typescript
class RequestDispatcher {
  private attached = false;

  registerBeforeRequest(consumer: BeforeRequestConsumer): void {
    this.beforeRequestConsumers.push(consumer);
    if (this.attached) this.reattach(); // Re-register hooks with new consumer included
  }
  // Same for all other register methods...

  attach(): void {
    this.attached = true;
    this.reattach();
  }

  private reattach(): void {
    // Sort and register all hooks (same logic as current attach)
    // Safe to call multiple times — Electron replaces previous handler
  }
}
```

**Initialization flow:**

```typescript
// In createWindow():
const ses = session.fromPartition('persist:tandem');

// 1. Create dispatcher FIRST — export as module-level variable
dispatcher = new RequestDispatcher(ses);

// 2. Register consumers available at this stage
stealth.registerWith(dispatcher);          // priority 10 (headers)
// Register CookieFix inline                  // priority 10 (response headers)
// Register WebSocketOriginFix inline          // priority 50 (headers)

// 3. Attach — activates hooks with current consumers
dispatcher.attach();

// ... later, in startAPI():

// 4. NetworkInspector registers AFTER attach — dispatcher re-attaches automatically
networkInspector = new NetworkInspector();  // No longer hooks session in constructor
networkInspector.registerWith(dispatcher);  // Late registration triggers reattach

// 5. SecurityManager registers too (Phase 1+)
// securityManager.registerWith(dispatcher); // Also triggers reattach
```

> **Note:** `dispatcher` must be a module-level variable (like `tabManager`, `networkInspector`, etc.) so both `createWindow()` and `startAPI()` can access it.

### 6. Add `@electron/rebuild` to package.json

```json
{
  "scripts": {
    "postinstall": "electron-rebuild -f -w better-sqlite3",
    "rebuild": "electron-rebuild -f -w better-sqlite3"
  },
  "devDependencies": {
    "@electron/rebuild": "^3.7.0"
  }
}
```

## Verification Checklist

After Phase 0 is complete, verify:

- [ ] `npm start` — app launches without errors
- [ ] Normal browsing works (navigate to google.com, github.com, any site)
- [ ] **Google login works** — navigate to accounts.google.com, verify login flow completes (tests Google auth bypass)
- [ ] Stealth headers still applied (check with `GET /devtools/network` — no Electron fingerprints in headers)
- [ ] NetworkInspector still logs requests (`GET /network/log` returns entries)
- [ ] WebSocket connections to localhost still work (chat panel functions)
- [ ] Cookie persistence works (login sessions survive restart, Set-Cookie Secure flag fix active)
- [ ] No console errors related to webRequest hooks
- [ ] `dispatcher.getStatus()` shows all consumers registered (including late-registered ones)
- [ ] Performance: page loads feel identical to before (no perceived slowdown)
- [ ] Run `npm start` twice — no EADDRINUSE or other port conflicts

## What NOT to Change

- Do NOT modify the stealth JavaScript injection (canvas, WebGL, etc.) — only the `onBeforeSendHeaders` hook
- Do NOT modify DevToolsManager — that's Phase 3
- Do NOT create any `src/security/` files yet — that's Phase 1
- Do NOT add new npm dependencies beyond `@electron/rebuild`

## Commit Convention

```
git add src/network/dispatcher.ts src/network/inspector.ts src/stealth/manager.ts src/main.ts package.json
git commit -m "refactor(network): unified webRequest dispatcher

- Create RequestDispatcher for multiplexing webRequest consumers
- Refactor NetworkInspector to dispatcher consumer (priority 100)
- Refactor StealthManager header hooks to dispatcher consumer (priority 10)
- Move inline webRequest handlers from main.ts to dispatcher consumers
- Add @electron/rebuild for better-sqlite3 native module support
- Fix latent onBeforeSendHeaders override bug between Stealth and main.ts

This is the foundation for the Security Shield (Phase 1+).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push origin main
```

## Scope (1 Claude Code session)

- RequestDispatcher class
- NetworkInspector refactor to dispatcher consumer
- StealthManager refactor to dispatcher consumer
- main.ts refactor + wiring (cookie fix, WS origin fix)
- Verification checklist

## Status Update Template

After completing this phase, update `docs/security-shield/STATUS.md`:

```markdown
## Phase 0: Unified Request Dispatcher
- **Status:** COMPLETED
- **Date:** YYYY-MM-DD
- **Commit:** <hash>
- **Verification:**
  - [x] App launches
  - [x] Browsing works
  - [x] Stealth headers applied
  - [x] Network logging works
  - [x] WebSocket connections work
  - [x] Cookies persist
  - [x] No console errors
  - [x] Performance OK
- **Issues encountered:** (none / describe)
- **Notes for next phase:** (anything Phase 1 session needs to know)
```
