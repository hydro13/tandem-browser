import { session as electronSession, Session, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LaunchWebAuthFlowRequest {
  url: string;
  interactive: boolean;
  extensionId: string;
}

interface LaunchWebAuthFlowResult {
  redirectUrl?: string;
  error?: string;
}

// ─── Polyfill JavaScript (injected into extension service workers) ───────────

/**
 * Generate the polyfill JavaScript to inject into an extension's service worker.
 * The CWS ID is embedded at injection time so getRedirectURL() returns the
 * correct Chrome Web Store extension ID (not the Electron-assigned ID).
 *
 * The polyfill provides:
 * - chrome.identity.getRedirectURL(path) → https://CWS_ID.chromiumapp.org/path
 * - chrome.identity.launchWebAuthFlow(details) → tab-based OAuth flow
 */
function generatePolyfillScript(cwsId: string, apiPort: number): string {
  // Use single quotes and no template literals — this runs in the SW, not Node
  return `
/* Tandem chrome.identity polyfill — injected at load time */
(function() {
  if (typeof chrome === 'undefined' || chrome.identity) return;
  var CWS_ID = '${cwsId}';
  var API_PORT = ${apiPort};

  chrome.identity = {
    getRedirectURL: function(path) {
      return 'https://' + CWS_ID + '.chromiumapp.org/' + (path || '');
    },
    launchWebAuthFlow: function(details) {
      return new Promise(function(resolve, reject) {
        if (!details || !details.url) {
          reject(new Error('launchWebAuthFlow: url is required'));
          return;
        }
        if (!details.interactive) {
          reject(new Error('Identity API: non-interactive auth is not supported in Tandem'));
          return;
        }
        /* Interactive flow: ask Tandem main process to open a BrowserWindow */
        fetch('http://127.0.0.1:' + API_PORT + '/extensions/identity/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: details.url,
            interactive: true,
            extensionId: CWS_ID
          })
        }).then(function(res) {
          return res.json();
        }).then(function(data) {
          if (data.error) reject(new Error(data.error));
          else if (data.redirectUrl) resolve(data.redirectUrl);
          else reject(new Error('No redirect URL received'));
        }).catch(function(err) {
          reject(new Error('Identity polyfill fetch failed: ' + err.message));
        });
      });
    }
  };
  console.log('[Tandem] chrome.identity polyfill active for ' + CWS_ID);
})();
`;
}

// ─── IdentityPolyfill class ─────────────────────────────────────────────────

/**
 * IdentityPolyfill — Provides chrome.identity support for MV3 extensions.
 *
 * Electron does not implement chrome.identity. Extensions that use
 * chrome.identity.launchWebAuthFlow() or chrome.identity.getRedirectURL()
 * for OAuth login flows will fail without this polyfill.
 *
 * Architecture:
 * 1. Before extensions are loaded, injectPolyfills() prepends a small JS
 *    snippet to each extension's service worker file (on disk).
 * 2. The snippet provides chrome.identity with getRedirectURL() and
 *    launchWebAuthFlow() implementations.
 * 3. registerChromiumAppHandler() intercepts *.chromiumapp.org URLs via
 *    session.protocol.handle() so OAuth redirects resolve instead of
 *    hitting DNS (chromiumapp.org subdomains don't resolve publicly).
 * 4. An API endpoint handles launchWebAuthFlow requests by opening a
 *    BrowserWindow and monitoring for the OAuth redirect.
 */
export class IdentityPolyfill {
  private apiPort: number;
  private activeAuthWindows: Map<string, BrowserWindow> = new Map();

  constructor(apiPort: number = 8765) {
    this.apiPort = apiPort;
  }

  /**
   * Inject chrome.identity polyfill into extension service workers.
   * Must be called BEFORE loading extensions via session.loadExtension().
   *
   * For each extension that declares the "identity" permission in its manifest,
   * prepends polyfill code to the service worker entry point.
   *
   * @returns List of extension IDs that were patched
   */
  injectPolyfills(): string[] {
    const extensionsDir = path.join(os.homedir(), '.tandem', 'extensions');
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

        // Only patch extensions that declare "identity" permission
        const permissions: string[] = [
          ...(Array.isArray(manifest.permissions) ? manifest.permissions : []),
          ...(Array.isArray(manifest.optional_permissions) ? manifest.optional_permissions : []),
        ];
        if (!permissions.includes('identity')) continue;

        // Only patch MV3 extensions with service workers
        if (manifest.manifest_version !== 3) continue;
        const swFile = manifest.background?.service_worker;
        if (!swFile) continue;

        const swPath = path.join(extPath, swFile);
        if (!fs.existsSync(swPath)) continue;

        const cwsId = dir.name; // Folder name is the CWS ID
        const polyfillCode = generatePolyfillScript(cwsId, this.apiPort);
        const marker = '/* Tandem chrome.identity polyfill';

        const existing = fs.readFileSync(swPath, 'utf-8');

        // Skip if already patched
        if (existing.includes(marker)) {
          patched.push(cwsId);
          continue;
        }

        // Prepend polyfill to the service worker
        fs.writeFileSync(swPath, polyfillCode + '\n' + existing, 'utf-8');
        patched.push(cwsId);
        console.log(`🔑 Identity polyfill injected into ${manifest.name || cwsId}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`⚠️ Failed to inject identity polyfill for ${dir.name}: ${msg}`);
      }
    }

    return patched;
  }

  /**
   * Register handling for *.chromiumapp.org OAuth redirects.
   *
   * NOTE: Do NOT use ses.protocol.handle('https', ...) here.
   * Intercepting the global 'https' scheme breaks Chromium's native network
   * stack — cookies, HTTP/2, and session state are NOT forwarded correctly
   * through net.fetch() passthrough, causing sites to lose their login sessions.
   *
   * The OAuth redirect is captured via will-navigate / will-redirect events
   * on the popup BrowserWindow inside handleLaunchWebAuthFlow() — no global
   * protocol handler is needed. chromiumapp.org subdomains do not need to
   * resolve via DNS because we intercept the navigation before it completes.
   */
  registerChromiumAppHandler(_ses: Session): void {
    // Intentionally a no-op. See comment above.
    console.log('🔑 chromiumapp.org OAuth redirects handled via popup navigation events (no protocol intercept)');
  }

  /**
   * Handle a launchWebAuthFlow request from an extension's service worker.
   * Opens a BrowserWindow with the persist:tandem session and monitors for
   * the OAuth redirect to *.chromiumapp.org.
   *
   * Security: BrowserWindow uses persist:tandem session so all security
   * stack protections (NetworkShield, OutboundGuard, etc.) are active.
   */
  async handleLaunchWebAuthFlow(req: LaunchWebAuthFlowRequest): Promise<LaunchWebAuthFlowResult> {
    const { url, interactive, extensionId } = req;

    if (!interactive) {
      return { error: 'Non-interactive auth is not supported' };
    }

    if (!url || !url.startsWith('https://')) {
      return { error: 'Invalid auth URL' };
    }

    // Only allow one auth flow per extension at a time
    const existing = this.activeAuthWindows.get(extensionId);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return { error: 'Auth flow already in progress' };
    }

    return new Promise<LaunchWebAuthFlowResult>((resolve) => {
      const ses = electronSession.fromPartition('persist:tandem');

      const popup = new BrowserWindow({
        width: 500,
        height: 700,
        show: true,
        webPreferences: {
          session: ses,      // MUST be persist:tandem — Security Stack Rules
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      this.activeAuthWindows.set(extensionId, popup);

      let resolved = false;
      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          this.activeAuthWindows.delete(extensionId);
          if (!popup.isDestroyed()) {
            popup.close();
          }
        }
      };

      const captureRedirect = (redirectUrl: string): boolean => {
        try {
          const parsed = new URL(redirectUrl);
          if (parsed.hostname.endsWith('.chromiumapp.org')) {
            cleanup();
            resolve({ redirectUrl });
            return true;
          }
        } catch {
          // Invalid URL — ignore
        }
        return false;
      };

      // Monitor navigation events for the OAuth redirect
      popup.webContents.on('will-navigate', (_event, navUrl) => {
        captureRedirect(navUrl);
      });

      popup.webContents.on('will-redirect', (_event, navUrl) => {
        captureRedirect(navUrl);
      });

      // Also check did-navigate in case will-navigate/will-redirect don't fire
      popup.webContents.on('did-navigate', (_event, navUrl) => {
        captureRedirect(navUrl);
      });

      // Handle popup closed by user
      popup.on('closed', () => {
        if (!resolved) {
          resolved = true;
          this.activeAuthWindows.delete(extensionId);
          resolve({ error: 'Auth window was closed by user' });
        }
      });

      // Timeout: 5 minutes
      setTimeout(() => {
        if (!resolved) {
          cleanup();
          resolve({ error: 'Auth flow timed out (5 minutes)' });
        }
      }, 5 * 60 * 1000);

      // Navigate to the OAuth URL
      popup.loadURL(url).catch((err: Error) => {
        if (!resolved) {
          cleanup();
          resolve({ error: `Failed to load auth URL: ${err.message}` });
        }
      });
    });
  }

  /**
   * Close all active auth windows and clean up.
   */
  destroy(): void {
    for (const [, popup] of this.activeAuthWindows) {
      if (!popup.isDestroyed()) {
        popup.close();
      }
    }
    this.activeAuthWindows.clear();
  }
}
