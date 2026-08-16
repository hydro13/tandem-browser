import type { Session } from 'electron';
import fs from 'fs';
import path from 'path';
import type { RequestDispatcher } from '../network/dispatcher';
import { selectPlatform } from '../platform';
import type { StealthUaAdapter, StealthUaProfile } from '../platform/types';
import { createLogger } from '../utils/logger';
import { tandemDir } from '../utils/paths';
import { isGoogleAuthUrl } from '../utils/security';

const log = createLogger('StealthManager');

// ─── Manager ───

/**
 * StealthManager — makes Tandem look like a normal Chrome used by a real human,
 * hiding ONLY that an AI/Electron drives it. It does NOT spoof or block hardware
 * fingerprinting; the real, stable fingerprint (WebGL, canvas, audio, screen,
 * CPU, fonts, timing) is left untouched. See AGENTS.md "Anti-Detection
 * Architecture" for the intent and boundaries.
 *
 * What it hides:
 * 1. A real Chrome User-Agent + client hints (not Electron's)
 * 2. Automation indicators (navigator.webdriver)
 * 3. Electron giveaways on window (process / require / module)
 * 4. A missing window.chrome (runtime / loadTimes / csi / app stub)
 */
export class StealthManager {
  // === 1. Private state ===
  private session: Session;
  private readonly originalUserAgent: string;
  private readonly stealthUa: StealthUaAdapter;
  private readonly uaProfile: StealthUaProfile;

  // === 2. Constructor ===
  constructor(
    session: Session,
    stealthUa: StealthUaAdapter = selectPlatform().stealthUa,
  ) {
    this.session = session;
    this.stealthUa = stealthUa;
    // Store the real Electron UA before overwriting — needed for Google auth
    this.originalUserAgent = session.getUserAgent();

    // Build UA from Electron's actual Chromium version to avoid detection mismatches
    this.uaProfile = this.stealthUa.getProfile(process.versions.chrome);
  }

  // === 4. Public methods ===

  /** Apply stealth patches to the Electron session (User-Agent override). */
  async apply(options?: { cloudflarePolicySyncChannel?: string }): Promise<void> {
    // Set realistic User-Agent globally (LinkedIn etc. block "Electron" UA)
    // Google auth is excluded via the onBeforeSendHeaders handler in registerWith()
    this.session.setUserAgent(this.uaProfile.userAgent);

    // Write a session-level preload that injects stealth patches into EVERY
    // renderer frame — including cross-origin out-of-process iframes (OOPIF)
    // such as Cloudflare's Turnstile challenge iframe.  executeJavaScript() on
    // the top-level webContents only reaches the main frame; session.setPreloads()
    // runs the script in each renderer process (including OOPIF) BEFORE any page
    // scripts, so navigator.userAgentData and other APIs are patched early enough.
    await this.writeAndRegisterPreload(options?.cloudflarePolicySyncChannel);

    log.info('🛡️ Stealth applied (AI/Electron concealment; real hardware fingerprint left intact)');
  }

  /**
   * Writes a preload script to disk and registers it with the session.
   * The preload uses webFrame.executeJavaScriptInIsolatedWorld(0, ...) to
   * run the stealth patches in world 0 (the main/page world) before any page
   * scripts, for every frame including cross-origin iframes.
   *
   * Three cases:
   *   • file:// or Google auth  → skip entirely (Tandem shell UI / OAuth)
   *   • challenges.cloudflare.com → inject early script only (no DOM-touching work)
   *   • everything else           → inject full stealth script
   *
   * Using the preload path (rather than CDP Page.addScriptToEvaluateOnNewDocument)
   * is the only guaranteed way to reach cross-origin OOPIFs in Electron: the
   * type:'frame' preload runs inside the OOPIF's own renderer process, before
   * any of the frame's scripts. CDP's addScriptToEvaluateOnNewDocument may not
   * propagate to cross-process iframes depending on the Electron / Chromium version.
   */
  private async writeAndRegisterPreload(cloudflarePolicySyncChannel?: string): Promise<void> {
    const stealthScript = StealthManager.getStealthScript(
      this.uaProfile.chromeVersion,
      this.stealthUa,
    );
    const earlyScript = StealthManager.getEarlyScript(this.uaProfile.chromeVersion, this.stealthUa);

    // The preload runs in Electron's isolated renderer world.
    // executeJavaScriptInIsolatedWorld(0, ...) injects into world 0 = main page world,
    // running BEFORE the frame's own scripts because the preload executes first.
    const preloadContent = [
      `'use strict';`,
      `try {`,
      `  var _url = (typeof location !== 'undefined' && location.href) || '';`,
      `  var _isFile      = _url.startsWith('file://');`,
      `  var _isGoogleAuth = /accounts\\.google\\.com|accounts-google\\.com/i.test(_url);`,
      `  var _isTurnstile  = /challenges\\.cloudflare\\.com/i.test(_url);`,
      `  if (!_isFile && !_isGoogleAuth) {`,
      `    var _electron = require('electron');`,
      `    var _wf = _electron.webFrame;`,
      `    var _mode = _isTurnstile ? 'early' : 'full';`,
      cloudflarePolicySyncChannel
        ? `    try { _mode = _electron.ipcRenderer.sendSync(${JSON.stringify(cloudflarePolicySyncChannel)}, _url) || _mode; } catch(e) { /* fall back to default mode */ }`
        : `    /* no cloudflare policy sync channel configured */`,
      `    if (_mode === 'early') {`,
      `      // Minimal early patches only — no DOM-touching work that trips Turnstile`,
      `      _wf.executeJavaScriptInIsolatedWorld(0, [{ code: ${JSON.stringify(earlyScript)}, url: 'tandem://stealth-early' }]);`,
      `    } else if (_mode === 'full') {`,
      `      _wf.executeJavaScriptInIsolatedWorld(0, [{ code: ${JSON.stringify(stealthScript)}, url: 'tandem://stealth' }]);`,
      `    }`,
      `  }`,
      `} catch(e) { /* preload injection failed — ignored */ }`,
    ].join('\n');

    const preloadPath = path.join(tandemDir(), 'stealth-preload.js');
    await fs.promises.writeFile(preloadPath, preloadContent, { mode: 0o600 });
    // Use the new registerPreloadScript API (setPreloads deprecated in Electron 40).
    // type:'frame' registers this for every frame including cross-origin subframes.
    this.session.registerPreloadScript({ filePath: preloadPath, type: 'frame' });
    log.info('🛡️ Stealth preload registered for all frames (including OOPIF)');
  }

  /** Register header modification as a dispatcher consumer */
  registerWith(dispatcher: RequestDispatcher): void {
    dispatcher.registerBeforeSendHeaders({
      name: 'StealthManager',
      priority: 10,
      handler: (_details, headers) => {
        // For Google auth domains: restore real Electron UA (Google blocks fake Chrome UA)
        // but keep everything else — TotalRecall V2 works with default Electron UA on Google
        const url = _details.url || '';
        if (isGoogleAuthUrl(url)) {
          // Restore the real Electron UA — deleting the header doesn't work because
          // session.setUserAgent() bakes the Chrome UA into Chromium's default headers.
          // We must overwrite it with the original Electron UA.
          headers['User-Agent'] = this.originalUserAgent;
          // Also remove fake Sec-CH-UA headers — session.setUserAgent() causes Chromium
          // to auto-send Chrome-like client hints at the session level. If we let the
          // real Electron UA through but keep Chrome Sec-CH-UA, Google detects the
          // mismatch and flags the session (CookieMismatch).
          delete headers['Sec-CH-UA'];
          delete headers['Sec-CH-UA-Mobile'];
          delete headers['Sec-CH-UA-Platform'];
          delete headers['Sec-CH-UA-Full-Version-List'];
          // Catch any other Sec-CH-UA-* variants (e.g. Sec-CH-UA-Arch, Sec-CH-UA-Model)
          for (const key of Object.keys(headers)) {
            if (key.toLowerCase().startsWith('sec-ch-ua')) {
              delete headers[key];
            }
          }
          return headers;
        }

        // Remove Electron/automation giveaways
        delete headers['X-Electron'];

        // Remove any header containing "Electron"
        for (const key of Object.keys(headers)) {
          if (typeof headers[key] === 'string' && headers[key].includes('Electron')) {
            headers[key] = headers[key].replace(/Electron\/[\d.]+\s*/g, '');
          }
        }

        // Ensure realistic Accept-Language
        // Key-casing note: Chromium sends 'accept-language' (lowercase HTTP/2).
        // Checking headers['Accept-Language'] always returns undefined, so the
        // condition was always true but set a capitalized key that coexists with
        // the original. Use case-insensitive lookup, then set with lowercase key.
        const hasAcceptLanguage = Object.keys(headers).some(
          k => k.toLowerCase() === 'accept-language'
        );
        if (!hasAcceptLanguage) {
          headers['accept-language'] = 'nl-BE,nl;q=0.9,en-US;q=0.8,en;q=0.7';
        }

        // === Sec-CH-UA client hints — inject "Google Chrome" brand ===
        // Chromium omits "Google Chrome" from its auto-generated sec-ch-ua,
        // sending only "Chromium" + a rotating GREASE token. Cloudflare (and
        // other bot-detection systems) detect the missing brand as Electron.
        //
        // Key-casing bug: Chromium uses lowercase HTTP/2-style keys
        // ('sec-ch-ua'). Setting 'Sec-CH-UA' (capitalized) does NOT overwrite
        // the original — both coexist as separate object keys.  We must
        // enumerate all keys case-insensitively, capture the value, delete
        // the originals, then re-set with the correct (lowercase) key name.

        // Capture Chromium's natural values — preserves the correct GREASE token
        const getHdr = (lower: string): string => {
          for (const k of Object.keys(headers)) {
            if (k.toLowerCase() === lower) return String(headers[k]);
          }
          return '';
        };
        const chromiumBrands   = getHdr('sec-ch-ua');
        const chromiumFullList = getHdr('sec-ch-ua-full-version-list');

        // Delete all sec-ch-ua* headers regardless of casing
        for (const k of Object.keys(headers)) {
          if (k.toLowerCase().startsWith('sec-ch-ua')) delete headers[k];
        }

        // Inject "Google Chrome" brand while preserving the natural GREASE token
        const withGoogleChrome = (brands: string, version: string): string => {
          if (brands.includes('Google Chrome')) return brands;
          if (!brands) {
            // Chromium didn't send this header — build minimal correct list
            return `"Chromium";v="${version}", "Google Chrome";v="${version}", "Not(A:Brand";v="8"`;
          }
          return `${brands}, "Google Chrome";v="${version}"`;
        };

        headers['sec-ch-ua']          = withGoogleChrome(chromiumBrands, this.uaProfile.chromeMajor);
        headers['sec-ch-ua-mobile']   = '?0';
        headers['sec-ch-ua-platform'] = this.uaProfile.requestHeaders.platform;
        if (this.uaProfile.requestHeaders.platformVersion) {
          headers['sec-ch-ua-platform-version'] = this.uaProfile.requestHeaders.platformVersion;
        }
        // Only send full-version-list if Chromium already included it;
        // it's a high-entropy hint that browsers normally send only on request.
        if (chromiumFullList) {
          headers['sec-ch-ua-full-version-list'] =
            withGoogleChrome(chromiumFullList, this.uaProfile.chromeVersion);
        }

        return headers;
      }
    });
  }

  /**
   * Minimal "early" stealth script — safe to inject into cross-origin OOPIFs
   * (e.g. Cloudflare Turnstile) via CDP Page.addScriptToEvaluateOnNewDocument.
   *
   * Same AI/Electron-hiding layer as the full script (webdriver, userAgentData,
   * window.chrome stub, remove window.process/require, plugins, languages), kept
   * minimal and free of any DOM/GPU-touching work so it is safe inside sandboxed
   * challenge frames.
   *
   * Uses its own idempotency guard (Symbol '__tandem_early_v1') so it doesn't
   * collide with the full stealth script that runs at dom-ready on main frames.
   */
  static getEarlyScript(
    chromeVersion: string = process.versions.chrome,
    stealthUa: StealthUaAdapter = selectPlatform().stealthUa,
  ): string {
    const profile = stealthUa.getProfile(chromeVersion);
    const brands = JSON.stringify(profile.clientHints.brands);
    const fullVersionList = JSON.stringify(profile.clientHints.fullVersionList);
    return `
(function() {
  var _sym = Symbol.for('__tandem_early_v1');
  if (window[_sym]) return;
  Object.defineProperty(window, _sym, { value: 1, configurable: false, writable: false, enumerable: false });

  // 1. Hide webdriver flag
  try { Object.defineProperty(navigator, 'webdriver', { get: function() { return false; }, configurable: true }); } catch(e) {}

  // 2. navigator.userAgentData — inject "Google Chrome" brand (the critical Cloudflare check)
  try {
    Object.defineProperty(navigator, 'userAgentData', {
      get: function() {
        return {
          brands: ${brands},
          mobile: false,
          platform: ${JSON.stringify(profile.clientHints.platform)},
          getHighEntropyValues: function(hints) {
            return Promise.resolve({
              brands: ${brands},
              mobile: false,
              platform: ${JSON.stringify(profile.clientHints.platform)},
              platformVersion: ${JSON.stringify(profile.clientHints.platformVersion)},
              architecture: ${JSON.stringify(profile.clientHints.architecture)},
              bitness: ${JSON.stringify(profile.clientHints.bitness)},
              model: ${JSON.stringify(profile.clientHints.model)},
              uaFullVersion: ${JSON.stringify(profile.clientHints.uaFullVersion)},
              fullVersionList: ${fullVersionList},
            });
          },
          toJSON: function() {
            return { brands: this.brands, mobile: this.mobile, platform: this.platform };
          },
        };
      },
      configurable: true,
    });
  } catch(e) {}

  // 3. Minimal window.chrome stub (Cloudflare checks chrome.runtime existence)
  try {
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) {
      window.chrome.runtime = {
        connect: function() { return { onDisconnect: { addListener: function() {} }, onMessage: { addListener: function() {} }, postMessage: function() {}, disconnect: function() {} }; },
        sendMessage: function() {},
        id: undefined,
      };
    }
  } catch(e) {}

  // 4. Remove Electron giveaways from window (safe — no GPU IPC involved)
  try { delete window.process; } catch(e) {}
  try { delete window.require; } catch(e) {}
  try { Object.defineProperty(window, 'process', { get: function() { return undefined; }, configurable: true }); } catch(e) {}

  // 5. Realistic navigator.plugins (Cloudflare may check for empty plugins list)
  try {
    Object.defineProperty(navigator, 'plugins', {
      get: function() {
        return [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client',     filename: 'internal-nacl-plugin' },
        ];
      },
      configurable: true,
    });
  } catch(e) {}

  // 6. Realistic languages
  try {
    Object.defineProperty(navigator, 'languages', {
      get: function() { return ['nl-BE', 'nl', 'en-US', 'en']; },
      configurable: true,
    });
  } catch(e) {}
})();
    `;
  }

  /**
   * JavaScript injected into pages to hide that an AI/Electron drives the
   * browser: navigator.webdriver, window.process/require, the UA brands, and a
   * window.chrome stub. It does NOT touch WebGL / canvas / audio / screen / CPU /
   * fonts / timing — the real hardware fingerprint is left intact.
   */
  static getStealthScript(
    chromeVersion: string = process.versions.chrome,
    stealthUa: StealthUaAdapter = selectPlatform().stealthUa,
  ): string {
    const profile = stealthUa.getProfile(chromeVersion);
    const brands = JSON.stringify(profile.clientHints.brands);
    const fullVersionList = JSON.stringify(profile.clientHints.fullVersionList);
    return `
      // ═══ Make Tandem look like a normal Chrome — nothing more ═══
      // The ONLY goal is to hide that an AI/Electron drives the browser, never to
      // spoof or block hardware fingerprinting. Real WebGL, canvas, audio, fonts,
      // colour depth, CPU/memory and timing are left completely untouched, so the
      // page sees a real, stable, human fingerprint. We override only the signals
      // that would reveal automation (webdriver), Electron (window.process/require,
      // the UA brands), or a non-Chrome runtime (missing window.chrome).
      //
      // Idempotency guard: both the session preload and the dom-ready injection
      // run this script. The Symbol key is invisible to page JS (not enumerable).
      (function() {
        var _appliedSym = Symbol.for('__tandem_stealth_v1');
        if (window[_appliedSym]) return;
        Object.defineProperty(window, _appliedSym, { value: 1, configurable: false, writable: false, enumerable: false });

      // Hide webdriver flag
      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      // Hide Electron from plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' }
        ]
      });

      // Realistic languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['nl-BE', 'nl', 'en-US', 'en']
      });

      // Chrome runtime — complete mock matching real Chrome
      if (!window.chrome) {
        window.chrome = {};
      }
      if (!window.chrome.runtime) {
        window.chrome.runtime = {
          OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
          OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
          PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
          PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
          PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
          RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
          connect: function() { return { onDisconnect: { addListener: function() {} }, onMessage: { addListener: function() {} }, postMessage: function() {}, disconnect: function() {} }; },
          sendMessage: function() {},
          id: undefined,
        };
      }
      if (!window.chrome.loadTimes) {
        window.chrome.loadTimes = function() {
          return { commitLoadTime: Date.now() / 1000, connectionInfo: 'h2', finishDocumentLoadTime: Date.now() / 1000, finishLoadTime: Date.now() / 1000, firstPaintAfterLoadTime: 0, firstPaintTime: Date.now() / 1000, navigationType: 'Other', npnNegotiatedProtocol: 'h2', requestTime: Date.now() / 1000 - 0.3, startLoadTime: Date.now() / 1000 - 0.3, wasAlternateProtocolAvailable: false, wasFetchedViaSpdy: true, wasNpnNegotiated: true };
        };
      }
      if (!window.chrome.csi) {
        window.chrome.csi = function() {
          return { onloadT: Date.now(), pageT: Date.now() / 1000, startE: Date.now(), tran: 15 };
        };
      }
      if (!window.chrome.app) {
        window.chrome.app = { isInstalled: false, getDetails: function() { return null; }, getIsInstalled: function() { return false; }, installState: function() { return 'not_installed'; }, runningState: function() { return 'cannot_run'; }, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } };
      }

      // Remove Electron giveaways from window
      try { delete window.process; } catch(e) {}
      try { delete window.require; } catch(e) {}
      try { delete window.module; } catch(e) {}
      try { delete window.exports; } catch(e) {}
      try { delete window.Buffer; } catch(e) {}
      try { delete window.__dirname; } catch(e) {}
      try { delete window.__filename; } catch(e) {}
      // Ensure process is truly gone
      Object.defineProperty(window, 'process', { get: () => undefined, configurable: true });

      // navigator.userAgentData — ALWAYS override to match real Chrome
      // Electron exposes its own brands which bot-detection systems detect.
      // The GREASE brand MUST match what Chromium sends in the sec-ch-ua HTTP
      // header — Cloudflare cross-checks them.  Chromium 120+ uses "Not(A:Brand"
      // version "8".  The header handler (registerWith) preserves this naturally.
      {
        // Chrome 120+ GREASE brand — must stay in sync with the sec-ch-ua header
        var __greaseBrand   = 'Not(A:Brand';
        var __greaseVersion = '8';
        Object.defineProperty(navigator, 'userAgentData', {
          get: () => ({
            brands: ${brands},
            mobile: false,
            platform: ${JSON.stringify(profile.clientHints.platform)},
            getHighEntropyValues: (hints) => Promise.resolve({
              brands: ${brands},
              mobile: false,
              platform: ${JSON.stringify(profile.clientHints.platform)},
              platformVersion: ${JSON.stringify(profile.clientHints.platformVersion)},
              architecture: ${JSON.stringify(profile.clientHints.architecture)},
              bitness: ${JSON.stringify(profile.clientHints.bitness)},
              model: ${JSON.stringify(profile.clientHints.model)},
              uaFullVersion: ${JSON.stringify(profile.clientHints.uaFullVersion)},
              fullVersionList: ${fullVersionList},
            }),
            toJSON: function() {
              return { brands: this.brands, mobile: this.mobile, platform: this.platform };
            },
          }),
          configurable: true,
        });
      }

      // Permissions API
      const originalQuery = window.navigator.permissions?.query;
      if (originalQuery) {
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
      }

      // Ensure window.Notification exists
      if (!window.Notification) {
        window.Notification = { permission: 'default' };
      }

      // ConnectionType for Network Information API
      if (navigator.connection) {
        // Already exists, fine
      }

      })(); // end of stealth IIFE — no globals leaked to the page
    `;
  }
}
