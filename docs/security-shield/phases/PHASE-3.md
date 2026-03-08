# Phase 3: Script & Content Guard

## Goal

Analyze and control script execution. Detect malicious scripts (keyloggers, crypto miners, clipboard hijackers) BEFORE they can do damage. Analyze page content for phishing indicators.

## Prerequisites

- **Phase 0-2 MUST be completed and verified** — check `docs/security-shield/STATUS.md`
- Read `src/devtools/manager.ts` — you MUST work through DevToolsManager, NOT attach CDP directly
- Understand how CDP events flow through `handleCDPEvent()` in DevToolsManager
- Read `src/stealth/manager.ts` — understand existing script injections to avoid conflicts

## Critical Architecture Decision: CDP Access

**DO NOT call `webContents.debugger.attach()` directly.** Electron allows only ONE debugger per webContents. DevToolsManager already owns the debugger connection.

Instead, extend DevToolsManager with a **subscription system** so ScriptGuard and BehaviorMonitor can receive CDP events:

```typescript
// In src/devtools/manager.ts — add event subscription system

interface CDPSubscriber {
  name: string;
  events: string[];  // CDP event names to subscribe to
  handler: (method: string, params: any) => void;
}

class DevToolsManager {
  private subscribers: CDPSubscriber[] = [];

  // New method — called by ScriptGuard, BehaviorMonitor, etc.
  subscribe(subscriber: CDPSubscriber): void {
    this.subscribers.push(subscriber);
    console.log(`[CDP] Subscriber registered: ${subscriber.name} for ${subscriber.events.join(', ')}`);
  }

  unsubscribe(name: string): void {
    this.subscribers = this.subscribers.filter(s => s.name !== name);
  }

  // Modify existing handleCDPEvent to dispatch to subscribers:
  private handleCDPEvent(method: string, params: any): void {
    // ... existing handling (console capture, network capture, wingman bindings) ...

    // NEW: dispatch to subscribers
    for (const sub or this.subscribers) {
      if (sub.events.includes(method) || sub.events.includes('*')) {
        try {
          sub.handler(method, params);
        } catch (err) {
          console.error(`[CDP] Subscriber ${sub.name} error:`, err);
        }
      }
    }
  }

  // New method — allow security modules to send CDP commands through the existing connection
  async sendCommand(method: string, params?: any): Promise<any> {
    const wc = this.getAttachedWebContents();
    if (!wc) throw new Error('No webContents attached');
    return wc.debugger.sendCommand(method, params);
  }

  // ⚠️ CRITICAL: Enable CDP domains needed by security modules
  // Debugger.enable is NOT enabled by default — only Network, DOM, Page are.
  // Without Debugger.enable, ScriptGuard will NOT receive Debugger.scriptParsed events!
  async enableSecurityDomains(): Promise<void> {
    const wc = this.getAttachedWebContents();
    if (!wc) return;
    await wc.debugger.sendCommand('Debugger.enable');
    // Runtime.enable is already active (for wingman bindings)
    // Network.enable is already active (for network capture)
    console.log('[CDP] Security domains enabled (Debugger)');
  }
}
```

This extends (not replaces) DevToolsManager. All existing functionality stays intact.

## Deliverables

### 1. `src/security/script-guard.ts`

```typescript
import { SecurityDB } from './security-db';
import { Guardian } from './guardian';

class ScriptGuard {
  private db: SecurityDB;
  private guardian: Guardian;
  private devToolsManager: DevToolsManager;

  constructor(db: SecurityDB, guardian: Guardian, devToolsManager: DevToolsManager) {
    this.db = db;
    this.guardian = guardian;
    this.devToolsManager = devToolsManager;
    this.registerSubscriptions();
  }

  private registerSubscriptions(): void {
    // ⚠️ CRITICAL: Call enableSecurityDomains() first!
    // Without this, Debugger.scriptParsed events will NOT fire.
    this.devToolsManager.enableSecurityDomains();

    this.devToolsManager.subscribe({
      name: 'ScriptGuard',
      events: ['Debugger.scriptParsed', 'Runtime.consoleAPICalled'],
      handler: (method, params) => {
        switch (method) {
          case 'Debugger.scriptParsed':
            this.analyzeScript(params);
            break;
          case 'Runtime.consoleAPICalled':
            this.monitorConsole(params);
            break;
        }
      }
    });
  }

  // Analyze every loaded script
  private analyzeScript(scriptInfo: any): void {
    const { scriptId, url, sourceMapURL, length, hash } = scriptInfo;

    // Skip inline scripts (no URL) and chrome-extension scripts
    if (!url || url.startsWith('chrome-extension://')) return;

    const domain = this.extractDomain(url);
    if (!domain) return;

    // 1. Check script fingerprint database
    const known = this.db.getScriptFingerprint(domain, url);
    if (known?.trusted) return; // Known and trusted — skip

    // 2. NEW script on a domain we've visited before → FLAG
    if (!known && this.db.getDomainInfo(domain)?.visitCount > 3) {
      this.db.logEvent({
        timestamp: Date.now(),
        domain,
        tabId: null,
        eventType: 'warned',
        severity: 'medium',
        category: 'script',
        details: JSON.stringify({ url, reason: 'new-script-on-known-domain', length }),
        actionTaken: 'flagged',
      });
    }

    // 3. Store/update fingerprint
    this.db.upsertScriptFingerprint(domain, url, hash);
  }

  // Inject monitoring code — COORDINATE WITH STEALTH
  async injectMonitors(): Promise<void> {
    // Use DevToolsManager.sendCommand, NOT direct debugger access
    // Use Page.addScriptToEvaluateOnNewDocument for persistence across navigations

    const monitorScript = `(function() {
      // Guard against double-injection
      if (window.__tandemSecurityMonitorsActive) return;
      window.__tandemSecurityMonitorsActive = true;

      // === Keylogger detection ===
      // Watch for addEventListener('keydown'/'keypress') on input fields
      // from scripts loaded from external domains
      const origAddEventListener = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if ((type === 'keydown' || type === 'keypress' || type === 'keyup') &&
            (this instanceof HTMLInputElement || this instanceof HTMLTextAreaElement)) {
          // Check if caller script is from external domain
          // Use Error().stack to get caller origin
          try {
            const stack = new Error().stack || '';
            // Report via Runtime.addBinding (invisible to page)
            if (typeof __tandemSecurityAlert === 'function') {
              __tandemSecurityAlert(JSON.stringify({
                type: 'keylogger_suspect',
                eventType: type,
                elementTag: this.tagName,
                elementName: this.name || this.id || 'unknown',
                callerStack: stack.substring(0, 500),
              }));
            }
          } catch(e) {}
        }
        return origAddEventListener.call(this, type, listener, options);
      };

      // === Crypto miner detection ===
      // Monitor WebAssembly instantiation
      const origWasmInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = function(...args) {
        if (typeof __tandemSecurityAlert === 'function') {
          __tandemSecurityAlert(JSON.stringify({
            type: 'wasm_instantiate',
            timestamp: Date.now(),
          }));
        }
        return origWasmInstantiate.apply(this, args);
      };

      // === Clipboard hijack detection ===
      const origClipboardRead = navigator.clipboard?.readText;
      if (origClipboardRead) {
        navigator.clipboard.readText = function() {
          if (typeof __tandemSecurityAlert === 'function') {
            __tandemSecurityAlert(JSON.stringify({
              type: 'clipboard_read',
              timestamp: Date.now(),
            }));
          }
          return origClipboardRead.apply(this, arguments);
        };
      }

      // === Form action hijack detection ===
      // Monitor changes to form.action
      const formActionDescriptor = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'action');
      if (formActionDescriptor?.set) {
        const origSet = formActionDescriptor.set;
        Object.defineProperty(HTMLFormElement.prototype, 'action', {
          ...formActionDescriptor,
          set(value) {
            if (typeof __tandemSecurityAlert === 'function') {
              __tandemSecurityAlert(JSON.stringify({
                type: 'form_action_change',
                newAction: String(value).substring(0, 200),
                formId: this.id || 'unknown',
              }));
            }
            return origSet.call(this, value);
          }
        });
      }
    })();`;

    // Register the binding FIRST (invisible CDP-level binding)
    await this.devToolsManager.sendCommand('Runtime.addBinding', {
      name: '__tandemSecurityAlert',
    });

    // Subscribe to binding calls
    this.devToolsManager.subscribe({
      name: 'ScriptGuard:Alerts',
      events: ['Runtime.bindingCalled'],
      handler: (method, params) => {
        if (params.name === '__tandemSecurityAlert') {
          this.handleSecurityAlert(JSON.parse(params.payload));
        }
      }
    });

    // Inject as persistent script
    await this.devToolsManager.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: monitorScript,
      worldName: '', // main world — must be in same context as page scripts
    });

    // Also run immediately on current page
    await this.devToolsManager.sendCommand('Runtime.evaluate', {
      expression: monitorScript,
      silent: true,
    });
  }

  private handleSecurityAlert(alert: any): void {
    switch (alert.type) {
      case 'keylogger_suspect':
        this.db.logEvent({
          timestamp: Date.now(),
          domain: null, // Will be filled from current tab
          tabId: null,
          eventType: 'warned',
          severity: 'high',
          category: 'script',
          details: JSON.stringify(alert),
          actionTaken: 'flagged',
        });
        break;

      case 'wasm_instantiate':
        // Cross-reference with CPU monitoring (Phase 3 behavior monitor)
        // WASM + high CPU = crypto miner
        break;

      case 'clipboard_read':
        this.db.logEvent({ /* severity: medium, category: 'behavior' */ });
        break;

      case 'form_action_change':
        // Check if new action URL is external
        // If external and page is trusted → CRITICAL alert
        break;
    }
  }

  // Cleanup
  destroy(): void {
    this.devToolsManager.unsubscribe('ScriptGuard');
    this.devToolsManager.unsubscribe('ScriptGuard:Alerts');
  }
}
```

**Coordination with Stealth:**
- Stealth overrides: canvas, WebGL, fonts, audio, timing, navigator
- Security overrides: addEventListener, WebAssembly, clipboard, form.action
- These do NOT overlap — they modify different APIs
- Both use `Page.addScriptToEvaluateOnNewDocument` for persistence
- Security script checks `window.__tandemSecurityMonitorsActive` to prevent double-injection
- Both use the invisible `Runtime.addBinding` pattern (not detectable by pages)

### 2. `src/security/content-analyzer.ts`

```typescript
class ContentAnalyzer {
  private db: SecurityDB;
  private devToolsManager: DevToolsManager;

  constructor(db: SecurityDB, devToolsManager: DevToolsManager) {
    this.db = db;
    this.devToolsManager = devToolsManager;
  }

  // Full page analysis (called after page load, async is fine here)
  async analyzePage(): Promise<PageAnalysis> {
    // All queries go through DevToolsManager.sendCommand()

    // 1. Find all forms and their action URLs
    const forms = await this.devToolsManager.sendCommand('Runtime.evaluate', {
      expression: `JSON.stringify(Array.from(document.forms).folder(f => ({
        action: f.action, method: f.method, id: f.id,
        hasPassword: !!f.querySelector('input[type=password]'),
        hasEmail: !!f.querySelector('input[type=email]'),
      })))`,
      returnByValue: true,
    });

    // 2. Check for password fields on HTTP pages
    // 3. Count external scripts and their sources
    // 4. Find hidden iframes with forms
    // 5. Check for typosquatting in domain
    // 6. Mixed content check (HTTP resources on HTTPS page)
    // 7. Tracker inventory (count tracking pixels, known tracker domains)

    return analysis;
  }

  // Typosquatting detection
  checkTyposquatting(domain: string): TyposquatResult | null {
    // Compare against high-value domains using Levenshtein distance
    const targets = [
      'paypal.com', 'google.com', 'facebook.com', 'linkedin.com',
      'github.com', 'amazon.com', 'microsoft.com', 'apple.com',
      'twitter.com', 'instagram.com', 'netflix.com', 'bankofamerica.com',
    ];

    for (const target or targets) {
      const distance = this.levenshtein(domain, target);
      if (distance > 0 && distance <= 2) {
        return { suspectedTarget: target, distance, domain };
      }
      // Also check common substitutions: l→1, o→0, rn→m
      if (this.hasCommonSubstitution(domain, target)) {
        return { suspectedTarget: target, distance: 1, domain, substitution: true };
      }
    }
    return null;
  }
}
```

### 3. `src/security/behavior-monitor.ts`

```typescript
class BehaviorMonitor {
  private db: SecurityDB;
  private guardian: Guardian;
  private devToolsManager: DevToolsManager;
  private cpuCheckInterval: NodeJS.Timeout | null = null;

  constructor(db: SecurityDB, guardian: Guardian, devToolsManager: DevToolsManager) {
    this.db = db;
    this.guardian = guardian;
    this.devToolsManager = devToolsManager;
  }

  // Start resource monitoring for crypto miner detection
  startResourceMonitoring(webContents: Electron.WebContents): void {
    // Poll CPU usage every 10 seconds
    this.cpuCheckInterval = setInterval(async () => {
      try {
        const metrics = await this.devToolsManager.sendCommand('Performance.getMetrics');
        // Check for CPU spike patterns:
        // - TaskDuration increasing rapidly
        // - JSHeapUsedSize growing without page interaction
        // - Combined with WASM instantiation event = CRYPTO MINER
      } catch (e) {
        // Tab may have been closed
      }
    }, 10_000);
  }

  // Permission request monitoring
  // NOTE: This hooks into Electron's permission handler, NOT webRequest.
  // ⚠️ IMPORTANT: Electron allows only ONE setPermissionRequestHandler per session
  // (same limitation as webRequest). Currently no other handler exists in the codebase
  // (verified). If a permission handler is added elsewhere in the future, this must
  // be refactored into a dispatcher pattern similar to RequestDispatcher.
  setupPermissionHandler(session: Electron.Session): void {
    session.setPermissionRequestHandler((webContents, permission, callback) => {
      const url = webContents.getURL();
      const domain = this.extractDomain(url);
      const mode = this.guardian.getModeForDomain(domain || '');

      this.db.logEvent({
        timestamp: Date.now(),
        domain,
        tabId: null,
        eventType: 'warned',
        severity: 'medium',
        category: 'behavior',
        details: JSON.stringify({ permission, url }),
        actionTaken: 'logged',
      });

      // Camera/microphone from non-trusted domain = BLOCK
      if (['media', 'camera', 'microphone'].includes(permission) && mode === 'strict') {
        callback(false);
        return;
      }

      // Clipboard read = always flag
      if (permission === 'clipboard-read') {
        this.db.logEvent({ /* severity: high */ });
      }

      // Notifications from first-visit site = BLOCK
      if (permission === 'notifications') {
        const info = this.db.getDomainInfo(domain || '');
        if (!info || info.visitCount < 3) {
          callback(false);
          return;
        }
      }

      // Default: allow (don't break functionality)
      callback(true);
    });
  }

  // Cleanup
  destroy(): void {
    if (this.cpuCheckInterval) {
      clearInterval(this.cpuCheckInterval);
    }
  }
}
```

### 4. Update SecurityManager

Wire up the new modules:

```typescript
class SecurityManager {
  // ... existing from Phase 1-2
  private scriptGuard: ScriptGuard;
  private contentAnalyzer: ContentAnalyzer;
  private behaviorMonitor: BehaviorMonitor;

  constructor(devToolsManager: DevToolsManager) {
    // ... existing init
    this.scriptGuard = new ScriptGuard(this.db, this.guardian, devToolsManager);
    this.contentAnalyzer = new ContentAnalyzer(this.db, devToolsManager);
    this.behaviorMonitor = new BehaviorMonitor(this.db, this.guardian, devToolsManager);
  }

  // Call when tab is focused/attached
  async onTabAttached(webContents: Electron.WebContents): void {
    await this.scriptGuard.injectMonitors();
    this.behaviorMonitor.startResourceMonitoring(webContents);
  }
}
```

### 5. New API Endpoints

```typescript
// GET /security/page/analysis — Full page security analysis (async)
// GET /security/page/scripts — All loaded scripts + risk info
// GET /security/page/forms — All forms + credential risk assessment
// GET /security/page/trackers — Tracker inventory
// GET /security/monitor/resources — Resource usage per tab
// GET /security/monitor/permissions — All permission requests + status
// POST /security/monitor/kill — Kill a specific script/worker via CDP
```

## Key Principles

1. **All CDP access goes through DevToolsManager** — never `webContents.debugger.attach()` directly
2. **Monitor injections use `Runtime.addBinding`** — invisible to page (same pattern as Wingman Vision)
3. **Script analysis must NOT slow page load** — analyze async, only block confirmed threats
4. **False positives on scripts = broken websites** — err on monitoring over blocking
5. **Keylogger detection is HIGH priority** — input field listeners from external scripts = immediate alert
6. **Crypto miner detection is HIGH priority** — WebAssembly + CPU spike = kill it
7. **Security injections do NOT overlap with Stealth injections** — different APIs, both use `addScriptToEvaluateOnNewDocument`

## Verification Checklist

- [ ] Scripts from CDNs (cdnjs, unpkg, jsdelivr) → allowed, fingerprinted in DB
- [ ] New unknown script on a known site → flagged event logged
- [ ] Page with password field on HTTP → warning event
- [ ] Form submitting credentials to external domain → blocked (Phase 2 check still works)
- [ ] Typosquatting domain (e.g., paypa1.com) → detected and flagged
- [ ] CPU spike from WebAssembly → detected in behavior monitor
- [ ] Permission request for camera/mic → logged + blocked in strict mode
- [ ] Notification from first-visit site → blocked
- [ ] `GET /security/page/analysis` returns comprehensive report
- [ ] Monitor injections don't break any normal websites (test 10+ popular sites)
- [ ] Stealth still works (canvas fingerprinting protection active)
- [ ] Wingman Vision still works (scroll, selection, form tracking)
- [ ] DevToolsManager existing features unaffected
- [ ] Phase 0-2 regression check: blocking, logging, outbound guard all still work

## What NOT to Change

- Do NOT replace DevToolsManager — extend it with subscribe/sendCommand
- Do NOT modify Stealth script injections
- Do NOT modify Wingman Vision bindings
- Do NOT add WebSocket/AI agent features — that's Phase 4

## Commit Convention

```bash
git add src/security/script-guard.ts src/security/content-analyzer.ts src/security/behavior-monitor.ts src/security/security-manager.ts src/devtools/manager.ts
git commit -m "feat(security): Phase 3 — Script & Content Guard

- Add ScriptGuard with CDP-based script analysis via DevToolsManager
- Add ContentAnalyzer for phishing detection + typosquatting
- Add BehaviorMonitor for permission control + crypto miner detection
- Extend DevToolsManager with subscriber system + sendCommand API
- Inject security monitors via Runtime.addBinding (invisible to pages)
- Add /security/page/* and /security/monitor/* API endpoints

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push origin main
```

## Scope (1 Claude Code session — largest phase, consider splitting)

This is the most complex phase. If the session hits context limits, split into:
- **3a:** DevToolsManager extension + ScriptGuard + security injections
- **3b:** ContentAnalyzer + BehaviorMonitor + API endpoints

Full scope:
- DevToolsManager extension (subscriber system, sendCommand, enableSecurityDomains)
- ScriptGuard (CDP subscriptions, script analysis, security monitor injections)
- ContentAnalyzer (page analysis, typosquatting, phishing detection)
- BehaviorMonitor (permission handler, CPU monitoring, crypto miner detection)
- 7 API endpoints + verification

## Status Update Template

After completing this phase, update `docs/security-shield/STATUS.md`:

```markdown
## Phase 3: Script & Content Guard
- **Status:** COMPLETED
- **Date:** YYYY-MM-DD
- **Commit:** <hash>
- **Verification:**
  - [x] CDP subscriber system works
  - [x] Script fingerprinting active
  - [x] New-script-on-known-domain flagging works
  - [x] Typosquatting detection works
  - [x] Permission monitoring works
  - [x] Crypto miner detection works
  - [x] Security injections don't break sites
  - [x] Stealth + Wingman Vision unaffected
  - [x] Phase 0-2 regression OK
- **Issues encountered:** (none / describe)
- **Notes for next phase:** (anything Phase 4 session needs to know)
- **DevToolsManager changes:** (document exactly what was added/modified)
```
