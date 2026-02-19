import { SecurityDB } from './security-db';
import { Guardian } from './guardian';
import { DevToolsManager } from '../devtools/manager';

/**
 * ScriptGuard — CDP-based script analysis and security monitor injection.
 *
 * Uses the DevToolsManager subscriber system to:
 * 1. Track all loaded scripts via Debugger.scriptParsed
 * 2. Fingerprint scripts per domain (detect new/changed scripts)
 * 3. Inject invisible security monitors via Runtime.addBinding:
 *    - Keylogger detection (addEventListener on input fields from external scripts)
 *    - Crypto miner detection (WebAssembly.instantiate monitoring)
 *    - Clipboard hijack detection (clipboard.readText monitoring)
 *    - Form action hijack detection (form.action setter monitoring)
 *
 * IMPORTANT: Security monitor injections do NOT overlap with Stealth injections:
 *   Stealth: canvas, WebGL, fonts, audio, timing, navigator
 *   Security: addEventListener, WebAssembly, clipboard, form.action
 */
export class ScriptGuard {
  private db: SecurityDB;
  private guardian: Guardian;
  private devToolsManager: DevToolsManager;
  private monitorInjected = false;
  private scriptsParsed: Map<string, { url: string; length: number }> = new Map();
  private wasmEvents: number[] = []; // timestamps of WASM instantiations

  constructor(db: SecurityDB, guardian: Guardian, devToolsManager: DevToolsManager) {
    this.db = db;
    this.guardian = guardian;
    this.devToolsManager = devToolsManager;
    this.registerSubscriptions();
  }

  private registerSubscriptions(): void {
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

  /** Analyze every loaded script (called via CDP Debugger.scriptParsed) */
  private analyzeScript(scriptInfo: any): void {
    const { scriptId, url, length, hash } = scriptInfo;

    // Skip inline scripts (no URL), chrome-extension, and devtools scripts
    if (!url || url.startsWith('chrome-extension://') || url.startsWith('devtools://')) return;

    // Track in memory
    this.scriptsParsed.set(scriptId, { url, length: length || 0 });

    const domain = this.extractDomain(url);
    if (!domain) return;

    // 1. Check script fingerprint database
    const known = this.db.getScriptFingerprint(domain, url);
    if (known?.trusted) return; // Known and trusted — skip

    // 2. NEW script on a domain we've visited before → FLAG
    if (!known) {
      const domainInfo = this.db.getDomainInfo(domain);
      if (domainInfo && domainInfo.visitCount > 3) {
        this.db.logEvent({
          timestamp: Date.now(),
          domain,
          tabId: null,
          eventType: 'warned',
          severity: 'medium',
          category: 'script',
          details: JSON.stringify({ url: url.substring(0, 500), reason: 'new-script-on-known-domain', length }),
          actionTaken: 'flagged',
        });
      }
    }

    // 3. Store/update fingerprint
    this.db.upsertScriptFingerprint(domain, url, hash);
  }

  /** Monitor console for suspicious patterns */
  private monitorConsole(params: any): void {
    // Watch for crypto mining indicators in console
    if (params.type === 'error' || params.type === 'warning') {
      const text = (params.args || []).map((a: any) => a.value || a.description || '').join(' ');
      if (/coinhive|cryptonight|monero|minero|coinbase.*miner/i.test(text)) {
        this.db.logEvent({
          timestamp: Date.now(),
          domain: null,
          tabId: null,
          eventType: 'warned',
          severity: 'high',
          category: 'script',
          details: JSON.stringify({ reason: 'crypto-miner-console', text: text.substring(0, 500) }),
          actionTaken: 'flagged',
        });
      }
    }
  }

  /**
   * Inject security monitor code into the current page.
   * Uses Runtime.addBinding (invisible to page — same pattern as Copilot Vision).
   * Uses Page.addScriptToEvaluateOnNewDocument for persistence across navigations.
   */
  async injectMonitors(): Promise<void> {
    if (this.monitorInjected) return;

    const monitorScript = `(function() {
      // Guard against double-injection
      if (window.__tandemSecurityMonitorsActive) return;
      window.__tandemSecurityMonitorsActive = true;

      // === Keylogger detection ===
      var origAddEventListener = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if ((type === 'keydown' || type === 'keypress' || type === 'keyup') &&
            (this instanceof HTMLInputElement || this instanceof HTMLTextAreaElement)) {
          try {
            var stack = new Error().stack || '';
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

      // === Crypto miner detection (WebAssembly) ===
      if (typeof WebAssembly !== 'undefined' && WebAssembly.instantiate) {
        var origWasmInstantiate = WebAssembly.instantiate;
        WebAssembly.instantiate = function() {
          try {
            if (typeof __tandemSecurityAlert === 'function') {
              __tandemSecurityAlert(JSON.stringify({
                type: 'wasm_instantiate',
                timestamp: Date.now(),
              }));
            }
          } catch(e) {}
          return origWasmInstantiate.apply(this, arguments);
        };
      }

      // === Clipboard hijack detection ===
      if (navigator.clipboard && navigator.clipboard.readText) {
        var origClipboardRead = navigator.clipboard.readText.bind(navigator.clipboard);
        navigator.clipboard.readText = function() {
          try {
            if (typeof __tandemSecurityAlert === 'function') {
              __tandemSecurityAlert(JSON.stringify({
                type: 'clipboard_read',
                timestamp: Date.now(),
              }));
            }
          } catch(e) {}
          return origClipboardRead.apply(this, arguments);
        };
      }

      // === Form action hijack detection ===
      var formActionDescriptor = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'action');
      if (formActionDescriptor && formActionDescriptor.set) {
        var origSet = formActionDescriptor.set;
        Object.defineProperty(HTMLFormElement.prototype, 'action', {
          get: formActionDescriptor.get,
          set: function(value) {
            try {
              if (typeof __tandemSecurityAlert === 'function') {
                __tandemSecurityAlert(JSON.stringify({
                  type: 'form_action_change',
                  newAction: String(value).substring(0, 200),
                  formId: this.id || 'unknown',
                }));
              }
            } catch(e) {}
            return origSet.call(this, value);
          },
          enumerable: formActionDescriptor.enumerable,
          configurable: formActionDescriptor.configurable,
        });
      }
    })();`;

    try {
      // Register the binding FIRST (invisible CDP-level binding)
      await this.devToolsManager.sendCommand('Runtime.addBinding', {
        name: '__tandemSecurityAlert',
      });

      // Subscribe to binding calls
      this.devToolsManager.subscribe({
        name: 'ScriptGuard:Alerts',
        events: ['Runtime.bindingCalled'],
        handler: (_method, params) => {
          if (params.name === '__tandemSecurityAlert') {
            try {
              this.handleSecurityAlert(JSON.parse(params.payload));
            } catch { /* invalid JSON */ }
          }
        }
      });

      // Inject as persistent script (survives navigations)
      await this.devToolsManager.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: monitorScript,
        worldName: '', // main world — must see page scripts
      });

      // Also run immediately on current page
      await this.devToolsManager.sendCommand('Runtime.evaluate', {
        expression: monitorScript,
        silent: true,
      });

      this.monitorInjected = true;
      console.log('[ScriptGuard] Security monitors injected');
    } catch (e: any) {
      console.warn('[ScriptGuard] Monitor injection failed:', e.message);
    }
  }

  private handleSecurityAlert(alert: any): void {
    // Get current URL for domain context
    const wc = this.devToolsManager.getAttachedWebContents();
    const currentUrl = wc ? wc.getURL() : '';
    const domain = this.extractDomain(currentUrl);

    switch (alert.type) {
      case 'keylogger_suspect':
        this.db.logEvent({
          timestamp: Date.now(),
          domain,
          tabId: null,
          eventType: 'warned',
          severity: 'high',
          category: 'script',
          details: JSON.stringify(alert),
          actionTaken: 'flagged',
        });
        break;

      case 'wasm_instantiate':
        // Track WASM instantiation timestamps for crypto miner correlation
        this.wasmEvents.push(Date.now());
        // Keep only recent events (last 5 minutes)
        const fiveMinAgo = Date.now() - 5 * 60_000;
        this.wasmEvents = this.wasmEvents.filter(t => t > fiveMinAgo);

        this.db.logEvent({
          timestamp: Date.now(),
          domain,
          tabId: null,
          eventType: 'warned',
          severity: 'medium',
          category: 'behavior',
          details: JSON.stringify({ ...alert, domain, wasmCount: this.wasmEvents.length }),
          actionTaken: 'flagged',
        });
        break;

      case 'clipboard_read':
        this.db.logEvent({
          timestamp: Date.now(),
          domain,
          tabId: null,
          eventType: 'warned',
          severity: 'medium',
          category: 'behavior',
          details: JSON.stringify({ ...alert, domain }),
          actionTaken: 'flagged',
        });
        break;

      case 'form_action_change': {
        // Check if new action URL is external
        const newDomain = this.extractDomain(alert.newAction);
        if (newDomain && domain && newDomain !== domain) {
          this.db.logEvent({
            timestamp: Date.now(),
            domain,
            tabId: null,
            eventType: 'warned',
            severity: 'high',
            category: 'script',
            details: JSON.stringify({ ...alert, domain, externalTarget: newDomain }),
            actionTaken: 'flagged',
          });
        }
        break;
      }
    }
  }

  /** Get recent WASM event count (for crypto miner correlation in BehaviorMonitor) */
  getRecentWasmCount(): number {
    const fiveMinAgo = Date.now() - 5 * 60_000;
    this.wasmEvents = this.wasmEvents.filter(t => t > fiveMinAgo);
    return this.wasmEvents.length;
  }

  /** Get all scripts parsed in this session */
  getScriptsParsed(): Map<string, { url: string; length: number }> {
    return this.scriptsParsed;
  }

  /** Reset state (call on tab switch) */
  reset(): void {
    this.monitorInjected = false;
    this.scriptsParsed.clear();
  }

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  destroy(): void {
    this.devToolsManager.unsubscribe('ScriptGuard');
    this.devToolsManager.unsubscribe('ScriptGuard:Alerts');
  }
}
