import fs from 'fs';
import path from 'path';
import { tandemDir } from '../utils/paths';
import { API_PORT } from '../utils/constants';
import { createLogger } from '../utils/logger';

const log = createLogger('ActionPolyfill');

// ─── Polyfill JavaScript (injected into extension service workers) ────────────

/**
 * Generate the chrome.action polyfill script to inject into extension service workers.
 *
 * Electron does not implement chrome.action (the MV3 replacement for
 * chrome.browserAction). MV3 extensions that call chrome.action.onClicked,
 * setIcon, setPopup, getUserSettings, setBadgeText, etc. crash at service
 * worker startup with "Cannot read properties of undefined".
 *
 * The polyfill:
 * - Only activates if chrome.action is missing or incomplete at runtime
 * - Proxies to chrome.browserAction where Electron provides it
 * - Creates safe stubs for all remaining methods
 * - Posts setBadgeText / setIcon updates to the Tandem API so badge state
 *   can be picked up by the toolbar (best-effort, silent on failure)
 */
function generatePolyfillScript(cwsId: string, apiPort: number): string {
  // Single quotes and no template literals — this runs in the SW context, not Node
  //
  // Strategy: ES module variable shadow.
  //
  // In Electron 40, the chrome global is a V8-native Proxy where defineProperty
  // and set traps are no-ops — we cannot add chrome.action via assignment or
  // Object.defineProperty. The only reliable approach in a module-type service
  // worker is to declare module-level `var chrome` and `var browser`, which are
  // hoisted to module scope and shadow the globals for ALL code in this file.
  //
  // Execution order (due to var hoisting):
  //   1. var chrome, var browser → hoisted to module scope (value: undefined)
  //   2. setup IIFE runs → captures globalThis.chrome, builds proxy, assigns
  //      chrome = proxy, browser = proxy
  //   3. Rest of the module runs with chrome/browser = our proxy
  //   4. proxy.get('action') → returns our polyfill object
  return `
/* Tandem chrome.action polyfill v4 — module-scope var shadow */
;(function() {
  var __tc = (typeof globalThis !== 'undefined' && globalThis.chrome) || (typeof self !== 'undefined' && self.chrome) || {};
  var CWS_ID = '${cwsId}';
  var API_PORT = ${apiPort};

  function makeEvent() {
    var listeners = [];
    return {
      addListener: function(cb) {
        if (typeof cb === 'function' && listeners.indexOf(cb) < 0) listeners.push(cb);
      },
      removeListener: function(cb) {
        var i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      },
      hasListener: function(cb) { return listeners.indexOf(cb) >= 0; },
      hasListeners: function() { return listeners.length > 0; },
      _fire: function() {
        var a = arguments;
        listeners.forEach(function(cb) { try { cb.apply(null, a); } catch(e) {} });
      }
    };
  }

  function notifyToolbar(endpoint, body) {
    fetch('http://127.0.0.1:' + API_PORT + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).catch(function() {});
  }

  var ba = (__tc.browserAction) || null;
  var actionObj = {
    onClicked: (ba && ba.onClicked) ? ba.onClicked : makeEvent(),
    openPopup: function(options) {
      if (ba && ba.openPopup) return ba.openPopup(options || {});
      return Promise.resolve();
    },
    setPopup: function(details, callback) {
      if (ba && ba.setPopup) return ba.setPopup(details, callback);
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    getPopup: function(details, callback) {
      if (ba && ba.getPopup) return ba.getPopup(details, callback);
      if (typeof callback === 'function') callback('');
      return Promise.resolve('');
    },
    setIcon: function(details, callback) {
      if (ba && ba.setIcon) return ba.setIcon(details, callback);
      notifyToolbar('/extensions/action/setIcon', { extensionId: CWS_ID, details: details });
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    setBadgeText: function(details, callback) {
      if (ba && ba.setBadgeText) return ba.setBadgeText(details, callback);
      notifyToolbar('/extensions/action/badge', { extensionId: CWS_ID, text: (details && details.text) || '' });
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    getBadgeText: function(details, callback) {
      if (ba && ba.getBadgeText) return ba.getBadgeText(details, callback);
      if (typeof callback === 'function') callback('');
      return Promise.resolve('');
    },
    setBadgeBackgroundColor: function(details, callback) {
      if (ba && ba.setBadgeBackgroundColor) return ba.setBadgeBackgroundColor(details, callback);
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    getBadgeBackgroundColor: function(details, callback) {
      if (ba && ba.getBadgeBackgroundColor) return ba.getBadgeBackgroundColor(details, callback);
      if (typeof callback === 'function') callback([0,0,0,0]);
      return Promise.resolve([0,0,0,0]);
    },
    setTitle: function(details, callback) {
      if (ba && ba.setTitle) return ba.setTitle(details, callback);
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    getTitle: function(details, callback) {
      if (ba && ba.getTitle) return ba.getTitle(details, callback);
      if (typeof callback === 'function') callback('');
      return Promise.resolve('');
    },
    enable: function(tabId, callback) {
      if (ba && ba.enable) return ba.enable(tabId, callback);
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    disable: function(tabId, callback) {
      if (ba && ba.disable) return ba.disable(tabId, callback);
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    isEnabled: function(tabId, callback) {
      if (typeof callback === 'function') callback(true);
      return Promise.resolve(true);
    },
    getUserSettings: function(callback) {
      if (ba && ba.getUserSettings) return ba.getUserSettings(callback);
      var s = { isOnToolbar: true };
      if (typeof callback === 'function') callback(s);
      return Promise.resolve(s);
    }
  };

  /*
   * chrome.notifications stub — Electron does not implement this API.
   * Required because 1Password's background.js calls:
   *   Fj()||(chrome.notifications.onClicked.addListener(...), ...)
   * at module init, crashing immediately if chrome.notifications is undefined.
   */
  var notificationsObj = (typeof __tc.notifications === 'object' && __tc.notifications !== null)
    ? __tc.notifications
    : {
        onClicked:       makeEvent(),
        onButtonClicked: makeEvent(),
        onClosed:        makeEvent(),
        create:  function(id, opts, cb) { if (typeof id === 'object') { cb = opts; } if (typeof cb === 'function') cb(id || ''); return Promise.resolve(id || ''); },
        getAll:  function(cb) { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
        clear:   function(id, cb) { if (typeof cb === 'function') cb(true); return Promise.resolve(true); },
        update:  function(id, opts, cb) { if (typeof cb === 'function') cb(false); return Promise.resolve(false); }
      };

  /* Build a proxy that returns stubs for missing APIs, forwards the rest */
  var proxy = new Proxy(__tc, {
    get: function(target, prop) {
      if (prop === 'action') return actionObj;
      if (prop === 'notifications') return notificationsObj;
      var val = target[prop];
      return (typeof val === 'function') ? val.bind(target) : val;
    },
    has: function(target, prop) { return prop === 'action' || prop === 'notifications' || (prop in target); }
  });

  /*
   * Assign to the module-level var chrome / var browser declared below.
   * Because var is hoisted, these assignments write to the module-scope
   * bindings that shadow the globals for ALL code that follows in this file.
   */
  chrome = proxy;
  try { browser = proxy; } catch(e) {}
  console.log('[Tandem] chrome.action polyfill v3 active for ${cwsId}');
})();
/* Module-scope declarations — hoisted above the IIFE, shadow the globals */
/* eslint-disable no-var */
var chrome; var browser; // jshint ignore:line
`;
}

// ─── ActionPolyfill class ─────────────────────────────────────────────────────

/**
 * ActionPolyfill — provides chrome.action (MV3) support for extensions in Electron.
 *
 * Electron does not implement chrome.action. MV3 extensions that call
 * chrome.action.onClicked.addListener(), setIcon(), getUserSettings(), etc.
 * crash on service worker startup with:
 *   "Cannot read properties of undefined (reading 'onClicked')"
 *   "Service worker registration failed. Status code: 15"
 *
 * Architecture:
 * 1. injectPolyfills() scans ~/.tandem/extensions/ for all MV3 extensions
 *    that have a background service worker
 * 2. Prepends a polyfill script to each service worker file on disk
 *    (same strategy as IdentityPolyfill — Electron reads the file at load time)
 * 3. Polyfill is idempotent — guarded by a marker comment and a runtime check
 * 4. Called from ExtensionManager.init() BEFORE session.loadExtension()
 *
 * Future: when Electron adds native chrome.action support, the runtime guard
 *   `if (chrome.action && typeof chrome.action.onClicked !== 'undefined') return;`
 * ensures the polyfill becomes a no-op without requiring code changes.
 */
export class ActionPolyfill {
  private apiPort: number;

  constructor(apiPort: number = API_PORT) {
    this.apiPort = apiPort;
  }

  /**
   * Inject chrome.action polyfill into all MV3 extension service workers.
   * Must be called BEFORE loading extensions via session.loadExtension().
   *
   * Targets all MV3 extensions that declare a background service_worker —
   * not limited to extensions with a specific permission, because chrome.action
   * is used widely without needing to be listed in permissions.
   *
   * @returns List of extension folder names that were patched
   */
  injectPolyfills(): string[] {
    const extensionsDir = tandemDir('extensions');
    if (!fs.existsSync(extensionsDir)) return [];

    const patched: string[] = [];
    const dirs = fs.readdirSync(extensionsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('_'));

    for (const dir of dirs) {
      const extPath = path.join(extensionsDir, dir.name);
      const manifestPath = path.join(extPath, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

        // Only MV3 extensions use chrome.action
        if (manifest.manifest_version !== 3) continue;

        // Only patch extensions with service workers
        const swFile = manifest.background?.service_worker;
        if (!swFile) continue;

        const swPath = path.join(extPath, swFile);
        if (!fs.existsSync(swPath)) continue;

        const cwsId = dir.name;
        const polyfillCode = generatePolyfillScript(cwsId, this.apiPort);
        const marker = '/* Tandem chrome.action polyfill v4';

        const existing = fs.readFileSync(swPath, 'utf-8');

        // Skip if already patched
        if (existing.includes(marker)) {
          patched.push(cwsId);
          continue;
        }

        // Prepend polyfill to the service worker
        fs.writeFileSync(swPath, polyfillCode + '\n' + existing, 'utf-8');
        patched.push(cwsId);
        log.info(`🎯 Action polyfill injected into ${manifest.name || cwsId}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`⚠️ Failed to inject action polyfill for ${dir.name}: ${msg}`);
      }
    }

    return patched;
  }
}
