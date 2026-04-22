// EPIPE crash fix for Linux (pipe errors on stdout/stderr)
process.stdout?.on('error', () => {});
process.stderr?.on('error', () => {});

process.on('uncaughtException', (err) => {
  // log is not yet initialized at this point — use console directly for fatal bootstrap errors
  // eslint-disable-next-line no-console -- early bootstrap failures happen before logger setup
  console.error('[Main] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console -- early bootstrap failures happen before logger setup
  console.error('[Main] Unhandled rejection:', reason);
});

import { nativeTheme, webContents, type WebContents } from 'electron';
import fs from 'fs';
import { app, BrowserWindow, session, ipcMain } from 'electron';

// Increase V8 heap limit for renderer processes to handle memory-heavy SPAs.
// Default Electron renderer heap is ~1.5GB which causes OOM on sites like zhipin.com.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
app.commandLine.appendSwitch('enable-precise-memory-info');
// Disable Chromium features that break Electron:
// - WebContentsForceDark: forces dark mode on sites that don't support it (unreadable pages)
// - ThirdPartyStoragePartitioning: partitions cookies by top-level site, breaking Google
//   cross-site auth (Electron doesn't support Related Website Sets)
// - TrackingProtection3pcd: blocks third-party cookies in cross-site contexts,
//   preventing Google auth cookies during youtube.com → accounts.google.com redirects
app.commandLine.appendSwitch('disable-features',
  'WebContentsForceDark,ThirdPartyStoragePartitioning,TrackingProtection3pcd');
import path from 'path';
import { TandemAPI } from './api/server';
import { StealthManager } from './stealth/manager';
import { buildAppMenu } from './menu/app-menu';
import { RequestDispatcher } from './network/dispatcher';
import { setMainWindow } from './notifications/alert';
import { API_PORT, WEBHOOK_PORT, DEFAULT_PARTITION, COOKIE_FLUSH_INTERVAL_MS } from './utils/constants';
import { tandemDir } from './utils/paths';
import { createLogger } from './utils/logger';
import { createManagerRegistry, destroyRuntime, initializeRuntimeManagers, registerRuntimeIpcHandlers } from './bootstrap/runtime';
import { registerInitialTabLifecycle } from './bootstrap/tab-session';
import { IpcChannels } from './shared/ipc-channels';
import type { PendingTabRegister, RuntimeManagers } from './bootstrap/types';
import { isGoogleAuthUrl, shouldSkipStealth, pathnameMatchesPrefix, tryParseUrl, urlHasProtocol, hostnameMatches } from './utils/security';
import { readConfigFileSync } from './config/io';
import { resolveInitialTheme, buildThemeAdditionalArg, toNativeThemeSource, type ResolvedTheme } from './theme/resolver';
import { CloudflarePolicyManager } from './cloudflare/policy-manager';
import {
  CLOUDFLARE_CHALLENGE_SELECTORS,
  getCloudflareNoTouchPartition,
  isCloudflareChallengeUrl,
  isCloudflareNoTouchPartition,
  responseHeadersContainCfClearance,
} from './utils/cloudflare';

const log = createLogger('Main');
const CLOUDFLARE_POLICY_SYNC_CHANNEL = 'tandem:cloudflare-policy-sync';
const CLOUDFLARE_INTERSTITIAL_TITLE_SNIPPETS = [
  'just a moment',
  'attention required',
  'please wait',
];

const IS_DEV = process.argv.includes('--dev');

let mainWindow: BrowserWindow | null = null;
let api: TandemAPI | null = null;
let runtime: RuntimeManagers | null = null;
let dispatcher: RequestDispatcher | null = null;
let cloudflarePolicyManager: CloudflarePolicyManager | null = null;
const earlyOopifStealthRegistered = new Set<number>();
const cloudflareNoTouchPartitions = new Set<string>();
const cloudflareNoTouchReroutes = new Set<number>();
let cookieFlushTimer: ReturnType<typeof setInterval> | null = null;
/** Queue webview webContents created before contextMenuManager is ready */
const pendingContextMenuWebContents: WebContents[] = [];
/** Queue tab-register IPC when it arrives before tabManager is ready */
let pendingTabRegister: PendingTabRegister | null = null;

function registerEarlyShellAuthIpc(): void {
  try { ipcMain.removeHandler(IpcChannels.GET_API_TOKEN); } catch { /* handler may not exist yet */ }
  ipcMain.handle(IpcChannels.GET_API_TOKEN, async () => {
    try {
      return fs.readFileSync(tandemDir('api-token'), 'utf-8').trim();
    } catch {
      return '';
    }
  });
}

function registerEarlyCloudflarePolicyIpc(): void {
  ipcMain.removeAllListeners(CLOUDFLARE_POLICY_SYNC_CHANNEL);
  ipcMain.on(CLOUDFLARE_POLICY_SYNC_CHANNEL, (event, rawUrl: string) => {
    const url = typeof rawUrl === 'string' ? rawUrl : '';
    event.returnValue = cloudflarePolicyManager?.getStealthDispositionForUrl(url) ?? 'full';
  });
}

function registerEarlyTabRegisterIpc(): void {
  ipcMain.removeAllListeners(IpcChannels.TAB_REGISTER);
  ipcMain.on(IpcChannels.TAB_REGISTER, (_event, data: PendingTabRegister) => {
    if (runtime?.tabManager) {
      return;
    }
    pendingTabRegister = data;
  });
}
/** Queue security coverage for webviews that load before SecurityManager is ready */
const pendingSecurityCoverageWebContentsIds: number[] = [];

function readApiTokenFromDisk(): string {
  try {
    return fs.readFileSync(tandemDir('api-token'), 'utf-8').trim();
  } catch {
    return '';
  }
}

function isLocalTandemApiUrl(rawUrl: string): boolean {
  const url = tryParseUrl(rawUrl);
  if (!url) {
    return false;
  }

  return (
    urlHasProtocol(url, 'http:') &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
    url.port === String(API_PORT)
  );
}

function isAuthPopupUrl(rawUrl: string): boolean {
  const url = tryParseUrl(rawUrl);
  if (!url || !urlHasProtocol(url, 'http:', 'https:')) {
    return false;
  }

  return (
    isGoogleAuthUrl(rawUrl) ||
    hostnameMatches(url, 'appleid.apple.com') ||
    hostnameMatches(url, 'login.microsoftonline.com') ||
    pathnameMatchesPrefix(url, '/oauth') ||
    pathnameMatchesPrefix(url, '/auth')
  );
}

function isInternalShellWebContents(webContentsId?: number): boolean {
  if (typeof webContentsId !== 'number' || webContentsId <= 0) {
    return false;
  }

  const sender = webContents.fromId(webContentsId);
  if (!sender || sender.isDestroyed()) {
    return false;
  }

  return sender.getURL().startsWith('file://');
}

function canUseWindow(win: BrowserWindow | null): win is BrowserWindow {
  return !!win && !win.isDestroyed() && !win.webContents.isDestroyed();
}

function clearCookieFlushTimer(): void {
  if (cookieFlushTimer) {
    clearInterval(cookieFlushTimer);
    cookieFlushTimer = null;
  }
}

function clearStartApiIpcListeners(): void {
  ipcMain.removeAllListeners('tab-register');
}

function queueSecurityCoverage(webContentsId: number): void {
  if (cloudflarePolicyManager?.isChallengeSensitiveTab(webContentsId)) {
    log.info(`☁️ Refusing security coverage queue for challenge-sensitive tab ${webContentsId}`);
    return;
  }

  if (runtime?.securityManager) {
    runtime.securityManager.onTabCreated(webContentsId).catch(e => log.warn('securityManager.onTabCreated failed:', e instanceof Error ? e.message : e));
    return;
  }

  if (!pendingSecurityCoverageWebContentsIds.includes(webContentsId)) {
    pendingSecurityCoverageWebContentsIds.push(webContentsId);
  }
}

function isCloudflareNoTouchWebContents(contents: WebContents): boolean {
  const trackedPartition = runtime?.tabManager
    .listTabs()
    .find((tab) => tab.webContentsId === contents.id)?.partition ?? null;
  if (trackedPartition && isCloudflareNoTouchPartition(trackedPartition)) {
    return true;
  }

  for (const partition of cloudflareNoTouchPartitions) {
    if (contents.session === session.fromPartition(partition)) {
      return true;
    }
  }

  return false;
}

function teardown(): void {
  clearCookieFlushTimer();
  clearStartApiIpcListeners();
  pendingTabRegister = null;
  pendingContextMenuWebContents.length = 0;
  pendingSecurityCoverageWebContentsIds.length = 0;
  destroyRuntime({
    api,
    runtime,
    mainWindow,
    canUseWindow,
  });
  api = null;
  runtime = null;
  dispatcher = null;
}

async function probeCloudflareChallengeSurface(contents: WebContents): Promise<boolean> {
  if (!cloudflarePolicyManager || contents.isDestroyed()) {
    return false;
  }

  const title = contents.getTitle().trim().toLowerCase();
  if (title && CLOUDFLARE_INTERSTITIAL_TITLE_SNIPPETS.some((snippet) => title.includes(snippet))) {
    cloudflarePolicyManager.markChallengeDetected(contents.id, contents.getURL() || null, 'title:interstitial');
    return true;
  }

  try {
    const detected = await contents.executeJavaScript(`
      (() => {
        const selectors = ${JSON.stringify(CLOUDFLARE_CHALLENGE_SELECTORS)};
        return selectors.some((selector) => !!document.querySelector(selector));
      })()
    `) as boolean;

    if (detected) {
      cloudflarePolicyManager.markChallengeDetected(contents.id, contents.getURL() || null, 'dom:selectors');
      return true;
    }
  } catch {
    // DOM probe is best-effort only.
  }

  return cloudflarePolicyManager.isChallengeSensitiveTab(contents.id);
}

async function registerEarlyOopifStealth(contents: WebContents, earlyScript: string): Promise<void> {
  if (contents.isDestroyed()) return;
  if (earlyOopifStealthRegistered.has(contents.id)) return;

  const currentUrl = contents.getURL();
  if (currentUrl && (isGoogleAuthUrl(currentUrl) || shouldSkipStealth(currentUrl))) {
    return;
  }
  if (cloudflarePolicyManager?.isChallengeSensitiveTab(contents.id)) {
    log.info(`☁️ Skipping CDP OOPIF early stealth attach for challenge-sensitive tab ${contents.id}`);
    return;
  }
  if (isCloudflareNoTouchWebContents(contents)) {
    log.info(`☁️ Skipping CDP OOPIF early stealth attach for no-touch tab ${contents.id}`);
    return;
  }

  try {
    if (!contents.debugger.isAttached()) {
      contents.debugger.attach('1.3');
    }
    await contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: earlyScript,
    });
    earlyOopifStealthRegistered.add(contents.id);
    log.info(`🛡️ CDP OOPIF early stealth injection registered for wc ${contents.id}`);
  } catch (e) {
    if (!contents.isDestroyed() && contents.debugger.isAttached()) {
      contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: earlyScript,
      }).then(() => {
        earlyOopifStealthRegistered.add(contents.id);
        log.info(`🛡️ CDP OOPIF early stealth injection registered via shared session for wc ${contents.id}`);
      }).catch(e2 => log.warn(`CDP stealth shared-session failed for wc ${contents.id}:`, e2 instanceof Error ? e2.message : e2));
    } else {
      log.warn(`CDP OOPIF stealth attach failed for wc ${contents.id}:`, e instanceof Error ? e.message : e);
    }
  }
}

async function promoteTabToCloudflareNoTouchSession(webContentsId: number, preferredUrl: string | null): Promise<void> {
  if (!runtime?.tabManager || !runtime.workspaceManager) {
    return;
  }
  if (cloudflareNoTouchReroutes.has(webContentsId)) {
    return;
  }

  const sourceTab = runtime.tabManager.listTabs().find((tab) => tab.webContentsId === webContentsId) ?? null;
  if (!sourceTab) {
    return;
  }
  if (isCloudflareNoTouchPartition(sourceTab.partition)) {
    return;
  }

  const targetUrl = preferredUrl || sourceTab.url || null;
  const targetPartition = targetUrl ? getCloudflareNoTouchPartition(targetUrl) : null;
  if (!targetUrl || !targetPartition) {
    return;
  }

  cloudflareNoTouchReroutes.add(webContentsId);
  cloudflareNoTouchPartitions.add(targetPartition);

  try {
    const existingReplacement = runtime.tabManager.listTabs().find((tab) =>
      tab.webContentsId !== webContentsId &&
      tab.partition === targetPartition &&
      tab.url === targetUrl
    ) ?? null;

    const workspaceId = runtime.workspaceManager.getWorkspaceIdForTab(webContentsId);

    if (existingReplacement) {
      if (workspaceId) {
        runtime.workspaceManager.moveTab(existingReplacement.webContentsId, workspaceId);
      }
      await runtime.tabManager.focusTab(existingReplacement.id);
      await runtime.tabManager.closeTab(sourceTab.id);
      log.info(`☁️ Reused existing no-touch tab ${existingReplacement.webContentsId} for Cloudflare challenge on wc ${webContentsId}`);
      return;
    }

    log.info(`☁️ Reopening Cloudflare tab ${webContentsId} in no-touch partition ${targetPartition}`);
    const replacementTab = await runtime.tabManager.openTab(
      targetUrl,
      sourceTab.groupId ?? undefined,
      sourceTab.source,
      targetPartition,
      true,
    );

    if (workspaceId) {
      runtime.workspaceManager.moveTab(replacementTab.webContentsId, workspaceId);
    }
    if (sourceTab.pinned) {
      runtime.tabManager.pinTab(replacementTab.id);
    }
    if (sourceTab.emoji) {
      if (sourceTab.emojiFlash) {
        runtime.tabManager.flashEmoji(replacementTab.id, sourceTab.emoji);
      } else {
        runtime.tabManager.setEmoji(replacementTab.id, sourceTab.emoji);
      }
    }

    await runtime.tabManager.closeTab(sourceTab.id);
  } catch (e) {
    log.warn(`Cloudflare no-touch reroute failed for wc ${webContentsId}:`, e instanceof Error ? e.message : e);
  } finally {
    cloudflareNoTouchReroutes.delete(webContentsId);
  }
}

async function createWindow(): Promise<BrowserWindow> {
  registerEarlyShellAuthIpc();
  registerEarlyCloudflarePolicyIpc();
  registerEarlyTabRegisterIpc();

  const partition = DEFAULT_PARTITION;
  const ses = session.fromPartition(partition);

  if (!cloudflarePolicyManager) {
    cloudflarePolicyManager = new CloudflarePolicyManager();
    cloudflarePolicyManager.on('challenge-detected', (event) => {
      log.info(`☁️ Cloudflare challenge detected (${event.signal}) for ${event.origin ?? event.url ?? 'unknown origin'}`);
      if (typeof event.webContentsId === 'number') {
        runtime?.securityManager.onCloudflarePolicyChanged(event.webContentsId).catch(e => {
          log.warn('securityManager.onCloudflarePolicyChanged failed:', e instanceof Error ? e.message : e);
        });
        void promoteTabToCloudflareNoTouchSession(event.webContentsId, event.url ?? null);
      }
    });
    cloudflarePolicyManager.on('clearance-seen', (event) => {
      log.info(`☁️ Cloudflare clearance seen (${event.signal}) for ${event.origin ?? event.url ?? 'unknown origin'}`);
      if (typeof event.webContentsId === 'number') {
        runtime?.securityManager.onCloudflarePolicyChanged(event.webContentsId).catch(e => {
          log.warn('securityManager.onCloudflarePolicyChanged failed:', e instanceof Error ? e.message : e);
        });
      }
    });
  }

  const stealth = new StealthManager(ses, partition);
  await stealth.apply({ cloudflarePolicySyncChannel: CLOUDFLARE_POLICY_SYNC_CHANNEL });

  // Create RequestDispatcher — central hub for all webRequest hooks
  dispatcher = new RequestDispatcher(ses);

  // Register StealthManager header modification (priority 10 — runs first)
  stealth.registerWith(dispatcher);

  // Cookie fix: ensure SameSite=None cookies have Secure flag (priority 10, response headers)
  // Case-insensitive header lookup — Chromium may use any casing for Set-Cookie
  dispatcher.registerHeadersReceived({
    name: 'CookieFix',
    priority: 10,
    handler: (_details, responseHeaders) => {
      // Find all Set-Cookie header keys regardless of casing
      const setCookieKeys = Object.keys(responseHeaders).filter(
        k => k.toLowerCase() === 'set-cookie'
      );
      for (const key of setCookieKeys) {
        const cookieHeaders = responseHeaders[key];
        if (Array.isArray(cookieHeaders)) {
          const fixedCookies = cookieHeaders.map((cookie: string) => {
            if (/SameSite=None/i.test(cookie) && !/;\s*Secure/i.test(cookie)) {
              return cookie + '; Secure';
            }
            return cookie;
          });
          // Normalize to lowercase key
          delete responseHeaders[key];
          responseHeaders['set-cookie'] = fixedCookies;
        }
      }
      return responseHeaders;
    }
  });

  // Safety net: fix SameSite=None cookies in the jar that weren't caught by the header handler
  // (e.g. cookies set via document.cookie or already present before the handler was attached)
  ses.cookies.on('changed', (_event, cookie, _cause, removed) => {
    if (removed) return;
    if (cookie.name.toLowerCase() === 'cf_clearance') {
      const cookieUrl = `https://${cookie.domain?.replace(/^\./, '') || 'unknown'}${cookie.path || '/'}`;
      cloudflarePolicyManager?.markClearanceSeen(null, cookieUrl, 'cookies:changed');
    }
    if (cookie.sameSite === 'no_restriction' && !cookie.secure) {
      const url = `https://${cookie.domain?.replace(/^\./, '') || 'unknown'}${cookie.path || '/'}`;
      ses.cookies.set({
        url,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || undefined,
        path: cookie.path || undefined,
        secure: true,
        httpOnly: cookie.httpOnly || undefined,
        sameSite: 'no_restriction',
        expirationDate: cookie.expirationDate || undefined,
      }).catch(() => { /* best effort — cookie may be read-only or expired */ });
    }
  });

  // WebSocket origin fix: Electron sends "null" origin for file:// pages (priority 50)
  dispatcher.registerBeforeSendHeaders({
    name: 'WebSocketOriginFix',
    priority: 50,
    handler: (details, headers) => {
      if (details.url.startsWith('ws://127.0.0.1') || details.url.startsWith('ws://localhost')) {
        headers['Origin'] = `http://127.0.0.1:${WEBHOOK_PORT}`;
      }
      return headers;
    }
  });

  dispatcher.registerBeforeSendHeaders({
    name: 'ShellApiAuth',
    priority: 55,
    handler: (details, headers) => {
      if (!isLocalTandemApiUrl(details.url)) {
        return headers;
      }

      if (!isInternalShellWebContents(details.webContentsId)) {
        return headers;
      }

      const token = readApiTokenFromDisk();
      if (!token) {
        return headers;
      }

      const nextHeaders = { ...headers };
      for (const key of Object.keys(nextHeaders)) {
        if (key.toLowerCase() === 'authorization') {
          delete nextHeaders[key];
        }
      }

      return {
        ...nextHeaders,
        Authorization: `Bearer ${token}`,
      };
    }
  });

  dispatcher.registerHeadersReceived({
    name: 'CloudflarePolicy',
    priority: 80,
    handler: (details, responseHeaders) => {
      cloudflarePolicyManager?.recordUrlSignal(
        typeof details.webContentsId === 'number' ? details.webContentsId : null,
        details.url || null,
        'headers:url',
      );
      if (responseHeadersContainCfClearance(responseHeaders)) {
        cloudflarePolicyManager?.markClearanceSeen(
          typeof details.webContentsId === 'number' ? details.webContentsId : null,
          details.url || null,
          'headers:set-cookie',
        );
      }
      return responseHeaders;
    }
  });

  dispatcher.registerBeforeRedirect({
    name: 'CloudflareRedirectPolicy',
    handler: (details) => {
      cloudflarePolicyManager?.recordUrlSignal(
        typeof details.webContentsId === 'number' ? details.webContentsId : null,
        details.redirectURL || null,
        'redirect:url',
      );
    }
  });

  // Attach dispatcher — activates all hooks with current consumers
  dispatcher.attach();

  // Flush cookies to disk periodically for reliability
  clearCookieFlushTimer();
  cookieFlushTimer = setInterval(() => {
    ses.cookies.flushStore().catch(e => log.warn('cookie flush failed:', e instanceof Error ? e.message : e));
  }, COOKIE_FLUSH_INTERVAL_MS);

  // Inject stealth script into all webviews via session preload
  const stealthSeed = stealth.getPartitionSeed();
  const stealthScript = StealthManager.getStealthScript(stealthSeed);
  // Minimal early script for CDP OOPIF injection — omits canvas/audio/timing patches
  // that crash Cloudflare Turnstile's OOPIF (ctx.getImageData() triggers GPU IPC in
  // a sandboxed cross-origin frame, causing V8 crash in challenges.cloudflare.com)
  const earlyScript = StealthManager.getEarlyScript();

  // Apply stealth patches to every webview's webContents on creation
  app.on('web-contents-created', (_event, contents) => {
    // Sidebar webview sessions — these navigate freely, no interception
    const SIDEBAR_PARTITIONS = ['persist:telegram','persist:whatsapp','persist:discord',
      'persist:slack','persist:instagram','persist:x','persist:calendar','persist:gmail'];
    const isSidebarWebview = SIDEBAR_PARTITIONS.some(
      p => contents.session === session.fromPartition(p)
    );

    if (contents.getType() === 'webview') {
      contents.on('did-navigate', (_event, url) => {
        if (url && !url.startsWith('about:') && !url.startsWith('data:')) {
          cloudflarePolicyManager?.onMainFrameNavigation(contents.id, url);
          cloudflarePolicyManager?.recordUrlSignal(contents.id, url, 'main-frame:url');
        }
      });

      contents.on('dom-ready', () => {
        void (async () => {
          // Skip stealth injection on sites that detect and block stealth patches
          const url = contents.getURL();
          if (url && !url.startsWith('about:') && !url.startsWith('data:')) {
            cloudflarePolicyManager?.onMainFrameNavigation(contents.id, url);
            cloudflarePolicyManager?.recordUrlSignal(contents.id, url, 'dom-ready:url');
          }
          const noTouchPartition = isCloudflareNoTouchWebContents(contents);
          const challengeSensitive = await probeCloudflareChallengeSurface(contents);
          if (isGoogleAuthUrl(url) || shouldSkipStealth(url)) {
            log.info('🔑 Skipping stealth for:', url.substring(0, 60));
            return;
          }
          if (noTouchPartition) {
            log.info(`☁️ No-touch partition active for tab ${contents.id}; skipping stealth and security hooks`);
            return;
          }
          if (!challengeSensitive) {
            if (!isSidebarWebview) {
              await registerEarlyOopifStealth(contents, earlyScript);
            }
            contents.executeJavaScript(stealthScript).catch((e) => log.warn('Stealth script injection failed:', e.message));
          } else {
            log.info(`☁️ Skipping full stealth for challenge-sensitive tab ${contents.id}`);
          }

          if (!isSidebarWebview) {
            if (!challengeSensitive) {
              queueSecurityCoverage(contents.id);
            } else {
              log.info(`☁️ Skipping security coverage queue for challenge-sensitive tab ${contents.id}`);
            }
          }
        })();
      });

      // did-frame-navigate: late-injection fallback for same-origin subframes.
      // For cross-origin OOPIFs this fires too late (after the frame's inline
      // scripts have already run), but the CDP registration above covers those.
      // Kept here as a safety net for edge cases the CDP path misses.
      contents.on('did-frame-navigate', (
        _event, url, _httpCode, _httpText, isMainFrame
      ) => {
        const noTouchPartition = isCloudflareNoTouchWebContents(contents);
        if (url && !url.startsWith('about:') && !url.startsWith('data:')) {
          if (isMainFrame) {
            cloudflarePolicyManager?.onMainFrameNavigation(contents.id, url);
            cloudflarePolicyManager?.recordUrlSignal(contents.id, url, 'frame:main-url');
          } else if (isCloudflareChallengeUrl(url)) {
            cloudflarePolicyManager?.markChallengeDetected(contents.id, url, 'frame:subframe-url');
          }
        }
        if (isMainFrame) return; // main frame handled by dom-ready above
        if (!url || url.startsWith('about:') || url.startsWith('data:')) return;
        if (isGoogleAuthUrl(url)) return; // never touch Google auth iframes
        if (noTouchPartition) return;
        // Skip Cloudflare challenge OOPIF — the full stealth script (canvas noise,
        // timing reduction) causes Turnstile to score the browser as bot. The minimal
        // CDP early script already runs there and patches userAgentData/webdriver.
        if (shouldSkipStealth(url)) return;
        if (cloudflarePolicyManager?.isChallengeSensitiveTab(contents.id)) return;

        // Walk the frame tree and inject into every non-Google, non-challenge subframe
        const injectFrame = (frame: { url: string; frames: typeof frame[]; executeJavaScript: (s: string) => Promise<unknown> }) => {
          const frameUrl = frame.url || '';
          if (!isGoogleAuthUrl(frameUrl) && !shouldSkipStealth(frameUrl)) {
            frame.executeJavaScript(stealthScript)
              .catch(() => { /* frame may have navigated away or be restricted */ });
          }
          for (const child of frame.frames) injectFrame(child);
        };
        if (contents.mainFrame) {
          for (const child of contents.mainFrame.frames) injectFrame(child);
        }
      });

      // Webview keystroke rhythm capture for the BehaviorCompiler.
      // PRIVACY FLOOR: we ONLY look at input.type to decide this is a
      // character keydown, and we NEVER read input.key, input.code, the
      // webContents URL, partition, tabId, or any other identifying
      // metadata. The observer receives just a millisecond interval and
      // persists it as the same shape as the shell keypress JSONL event.
      // Keystroke content never touches disk. See design doc in
      // docs/superpowers/behavior-compiler-design.md (phase 1, PR B).
      let lastWebviewKeypressTs = 0;
      contents.on('before-input-event', (_inputEvt, input) => {
        if (input.type !== 'keyDown') return;
        // input.key.length === 1 filters out modifier/arrow/function keys
        // without reading the value — only its length.
        if (!input.key || input.key.length !== 1) return;
        const now = Date.now();
        const interval = lastWebviewKeypressTs > 0 ? now - lastWebviewKeypressTs : 0;
        lastWebviewKeypressTs = now;
        if (interval > 0) {
          runtime?.behaviorObserver?.recordWebviewKeypress(interval);
        }
      });

      if (!isSidebarWebview) {
        contents.on('did-finish-load', () => {
          void (async () => {
            if (isCloudflareNoTouchWebContents(contents)) {
              log.info(`☁️ Skipping security onTabNavigated for no-touch tab ${contents.id}`);
              return;
            }
            const challengeSensitive = await probeCloudflareChallengeSurface(contents);
            if (challengeSensitive) {
              log.info(`☁️ Skipping security onTabNavigated for challenge-sensitive tab ${contents.id}`);
              return;
            }
            runtime?.securityManager.onTabNavigated(contents.id).catch(e => log.warn('securityManager.onTabNavigated failed:', e instanceof Error ? e.message : e));
          })();
        });

        contents.on('destroyed', () => {
          earlyOopifStealthRegistered.delete(contents.id);
          cloudflarePolicyManager?.onTabClosed(contents.id);
          runtime?.securityManager.onTabClosed(contents.id);
        });
      }

      // Register context menu for this webview (queue if manager not yet ready)
      if (runtime?.contextMenuManager) {
        runtime.contextMenuManager.registerWebContents(contents);
      } else {
        pendingContextMenuWebContents.push(contents);
      }

      // Workspace: assign new tab webContents to active workspace
      if (!isSidebarWebview && runtime?.workspaceManager) {
        runtime.workspaceManager.assignTab(contents.id);
        contents.on('destroyed', () => {
          runtime?.workspaceManager.removeTab(contents.id);
        });
      }

      // Wingman Vision: text selection + form tracking moved to CDP Runtime.addBinding (see DevToolsManager)

      // Handle popups from webviews
      contents.setWindowOpenHandler(({ url }) => {
        // OAuth/auth popups need window.opener — allow for ALL webviews (incl. sidebar)
        // e.g. Google login from Gmail/Calendar sidebar panel
        const isAuth = isAuthPopupUrl(url);
        // Sidebar webviews: allow auth popups, open other links in a new tab
        if (isSidebarWebview && !isAuth) {
          if (url && url !== 'about:blank' && mainWindow) {
            mainWindow.webContents.send(IpcChannels.OPEN_URL_IN_NEW_TAB, url);
          }
          return { action: 'deny' };
        }
        if (isAuth) {
          // Use sidebar partition for sidebar webviews so auth cookies are shared
          const authPartition = isSidebarWebview
            ? (SIDEBAR_PARTITIONS.find(p => contents.session === session.fromPartition(p)) ?? partition)
            : partition;
          return {
            action: 'allow',
            overrideBrowserWindowOptions: {
              width: 500,
              height: 700,
              webPreferences: {
                partition: authPartition,
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
              },
            },
          };
        }
        // All other popups → new tab
        if (url && url !== 'about:blank' && mainWindow) {
          mainWindow.webContents.send(IpcChannels.OPEN_URL_IN_NEW_TAB, url);
        }
        return { action: 'deny' };
      });
    }

    // Auto-reload sidebar webview after Google auth popup completes
    if (isSidebarWebview) {
      const sidebarPartition = SIDEBAR_PARTITIONS.find(
        p => contents.session === session.fromPartition(p)
      );
      if (sidebarPartition) {
        const sidebarId = sidebarPartition.replace('persist:', '');
        contents.on('did-create-window', (win) => {
          win.webContents.on('did-navigate', (_e, url) => {
            if (!isGoogleAuthUrl(url)) {
              win.close();
              if (mainWindow) {
                mainWindow.webContents.send(IpcChannels.RELOAD_SIDEBAR_WEBVIEW, sidebarId);
              }
            }
          });
        });
      }
    }

    // Catch-all: route unmanaged webContents navigations back through TabManager.
    // IMPORTANT: check hasWebContents at navigate time, NOT at registration time.
    // Reason: TabManager registers webContents asynchronously (via executeJavaScript),
    // so at web-contents-created time the webContents is not yet known to TabManager.
    // Checking at registration time would cause ALL tab navigations to be intercepted.
    // Skip popup BrowserWindows (type 'window') — they handle their own OAuth flows.
    if (contents.getType() !== 'window') {
      contents.on('will-navigate', (_e, url) => {
        if (isSidebarWebview) return; // let sidebar webviews navigate freely
        const currentTabManager = runtime?.tabManager;
        if (!currentTabManager || !mainWindow || !url || url === 'about:blank') {
          return;
        }
        if (!currentTabManager.hasWebContents(contents.id)) {
          mainWindow.webContents.send(IpcChannels.OPEN_URL_IN_NEW_TAB, url);
          contents.stop();
        }
      });
    }

    // Extension popup windows (type 'window', url starts with chrome-extension://) call
    // window.open() to open sign-in pages. Electron creates a new BrowserWindow that
    // flashes and immediately closes. Intercept and redirect to a tab in the main window.
    if (contents.getType() === 'window') {
      contents.on('dom-ready', () => {
        const url = contents.getURL();
        if (url.startsWith('chrome-extension://')) {
          contents.setWindowOpenHandler(({ url: targetUrl }) => {
            log.info(`[ExtPopup] window.open intercepted from extension popup: ${targetUrl}`);
            if (mainWindow && targetUrl && targetUrl !== 'about:blank') {
              mainWindow.webContents.send(IpcChannels.OPEN_URL_IN_NEW_TAB, targetUrl);
            }
            return { action: 'deny' };
          });
        }
      });
    }
  });

  // macOS: hiddenInset titlebar (tabs inline with traffic lights, Chrome-style)
  //        + under-window vibrancy (deepest native glass effect)
  //        + transparent background so macOS glass shows through chrome areas
  //        + trafficLightPosition centered in the 36px tab bar
  // Linux: frameless window (Chrome-style tabs + custom window controls)
  // Windows: native frame for now (TODO: implement custom titlebar)
  const platformWindowOptions: Partial<Electron.BrowserWindowConstructorOptions> = process.platform === 'darwin'
    ? {
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 10 },
        vibrancy: 'under-window',
        visualEffectState: 'active',
        backgroundColor: '#00000000',  // transparent so macOS vibrancy shows through chrome
      }
    : process.platform === 'linux'
    ? {
        frame: false,  // frameless → custom titlebar with Chrome-style tabs
      }
    : {};

  // Pre-paint theme resolution — eliminates dark→light flash.
  // We read the file directly because ConfigManager is not yet initialized.
  let initialTheme: ResolvedTheme = 'dark';
  try {
    const cfg = readConfigFileSync();
    const setting = cfg?.appearance?.theme ?? 'dark';
    nativeTheme.themeSource = toNativeThemeSource(setting);
    initialTheme = resolveInitialTheme(setting, nativeTheme);
    log.info(`[Theme] Pre-paint resolved theme: ${initialTheme} (setting=${setting}, nativeSource=${nativeTheme.themeSource})`);
  } catch (err) {
    log.warn('[Theme] Could not resolve initial theme, defaulting to dark', err);
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Tandem Browser',
    ...platformWindowOptions,
    webPreferences: {
      preload: path.join(__dirname, 'preload', 'index.js'),
      partition,
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [buildThemeAdditionalArg(initialTheme)],
    },
  });
  setMainWindow(mainWindow);

  void mainWindow.loadFile(path.join(__dirname, '..', 'shell', 'index.html'));

  // Only open shell DevTools in dev mode (--dev flag)
  if (IS_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    clearCookieFlushTimer();
    setMainWindow(null);
    mainWindow = null;
    teardown();
  });

  return mainWindow;
}

async function startAPI(win: BrowserWindow): Promise<void> {
  clearStartApiIpcListeners();
  runtime = await initializeRuntimeManagers({
    win,
    dispatcher,
    cloudflarePolicyManager: cloudflarePolicyManager ?? new CloudflarePolicyManager(),
    pendingContextMenuWebContents,
    pendingSecurityCoverageWebContentsIds,
    canUseWindow,
    log,
  });

  // Keep nativeTheme.themeSource in sync with user config — so macOS traffic
  // lights, titlebar, and form controls update live when the user changes
  // theme in settings without requiring a restart.
  runtime.configManager.onChange((_config, changed) => {
    const newTheme = changed?.appearance?.theme;
    if (newTheme === 'dark' || newTheme === 'light' || newTheme === 'system') {
      nativeTheme.themeSource = toNativeThemeSource(newTheme);
      log.info(`[Theme] nativeTheme.themeSource synced to '${nativeTheme.themeSource}' after config change`);
    }
  });

  const registry = createManagerRegistry(runtime);
  api = new TandemAPI({ win, port: API_PORT, registry });
  await api.start();
  log.info(`🧠 Tandem API running on http://localhost:${API_PORT}`);

  // Security: Monitor openclaw.json for unauthorized modifications (prompt injection defense)
  const { startConfigIntegrityMonitor } = await import('./openclaw/connect');
  startConfigIntegrityMonitor((detail) => {
    log.warn(`[ConfigIntegrity] ${detail}`);
    // Alert the user via notification
    const { Notification } = require('electron');
    new Notification({
      title: '⚠️ Security Alert — Tandem Browser',
      body: detail,
      urgency: 'critical',
    }).show();

  });

  // Phase 4: Wire GatekeeperWebSocket + NM proxy WebSocket onto the running HTTP server
  const httpServer = api.getHttpServer();
  if (httpServer) {
    runtime.securityManager.initGatekeeper(httpServer);
    // Start native messaging proxy WebSocket (Electron 40 workaround)
    const { nmProxy: _nmProxyMain } = await import('./extensions/nm-proxy');
    _nmProxyMain.startWebSocket(httpServer, {
      authorizeWebSocketRequest: ({ origin, extensionId, host, routePath }) =>
        api?.authorizeExtensionBridgeRequest({
          originHeader: origin,
          requestedExtensionId: extensionId,
          requestedHost: host,
          routePath,
        }) ?? {
          allowed: false,
          level: 'unknown',
          routePath,
          scope: null,
          reason: 'Denied native messaging WebSocket because the Tandem API is unavailable',
          extensionId: extensionId ?? 'unknown-extension',
          runtimeId: null,
          storageId: null,
          extensionName: null,
          permissions: [],
          auditLabel: 'unknown-extension [unknown]',
        },
    });
  }

  registerRuntimeIpcHandlers(win, runtime);
  registerInitialTabLifecycle({
    win,
    runtime,
    canUseWindow,
    pendingTabRegister,
    setPendingTabRegister: (data) => { pendingTabRegister = data; },
    log,
  });
}


void app.whenReady().then(async () => {
  const win = await createWindow();
  await startAPI(win);
  buildAppMenu({
    mainWindow: win,
    tabManager: runtime?.tabManager ?? null,
    panelManager: runtime?.panelManager ?? null,
    drawManager: runtime?.drawManager ?? null,
    voiceManager: runtime?.voiceManager ?? null,
    pipManager: runtime?.pipManager ?? null,
    configManager: runtime?.configManager ?? null,
    videoRecorderManager: runtime?.videoRecorderManager ?? null,
  });

  // Keep shortcuts always registered while app is running
  // (blur/focus approach broke shortcuts when webview had focus)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      teardown();
      createWindow().then(async (w) => {
        await startAPI(w);
        buildAppMenu({
          mainWindow: w,
          tabManager: runtime?.tabManager ?? null,
          panelManager: runtime?.panelManager ?? null,
          drawManager: runtime?.drawManager ?? null,
          voiceManager: runtime?.voiceManager ?? null,
          pipManager: runtime?.pipManager ?? null,
          configManager: runtime?.configManager ?? null,
          videoRecorderManager: runtime?.videoRecorderManager ?? null,
        });
      }).catch((err) => {
        log.error('Failed to recreate window:', err);
      });
    }
  });
});

app.on('will-quit', () => {
  teardown();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
