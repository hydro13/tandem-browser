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
nativeTheme.themeSource = 'system';
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
import { resolveInitialTheme, buildThemeAdditionalArg, type ResolvedTheme } from './theme/resolver';

const log = createLogger('Main');

const IS_DEV = process.argv.includes('--dev');

let mainWindow: BrowserWindow | null = null;
let api: TandemAPI | null = null;
let runtime: RuntimeManagers | null = null;
let dispatcher: RequestDispatcher | null = null;
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
  if (runtime?.securityManager) {
    runtime.securityManager.onTabCreated(webContentsId).catch(e => log.warn('securityManager.onTabCreated failed:', e instanceof Error ? e.message : e));
    return;
  }

  if (!pendingSecurityCoverageWebContentsIds.includes(webContentsId)) {
    pendingSecurityCoverageWebContentsIds.push(webContentsId);
  }
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

async function createWindow(): Promise<BrowserWindow> {
  registerEarlyShellAuthIpc();
  registerEarlyTabRegisterIpc();

  const partition = DEFAULT_PARTITION;
  const ses = session.fromPartition(partition);

  const stealth = new StealthManager(ses, partition);
  await stealth.apply();

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

  // Apply stealth patches to every webview's webContents on creation
  app.on('web-contents-created', (_event, contents) => {
    // Sidebar webview sessions — these navigate freely, no interception
    const SIDEBAR_PARTITIONS = ['persist:telegram','persist:whatsapp','persist:discord',
      'persist:slack','persist:instagram','persist:x','persist:calendar','persist:gmail'];
    const isSidebarWebview = SIDEBAR_PARTITIONS.some(
      p => contents.session === session.fromPartition(p)
    );

    if (contents.getType() === 'webview') {
      contents.on('dom-ready', () => {
        // Skip stealth injection on sites that detect and block stealth patches
        const url = contents.getURL();
        if (isGoogleAuthUrl(url) || shouldSkipStealth(url)) {
          log.info('🔑 Skipping stealth for:', url.substring(0, 60));
          return;
        }
        contents.executeJavaScript(stealthScript).catch((e) => log.warn('Stealth script injection failed:', e.message));

        if (!isSidebarWebview) {
          queueSecurityCoverage(contents.id);
        }
      });

      if (!isSidebarWebview) {
        contents.on('did-finish-load', () => {
          runtime?.securityManager.onTabNavigated(contents.id).catch(e => log.warn('securityManager.onTabNavigated failed:', e instanceof Error ? e.message : e));
        });

        contents.on('destroyed', () => {
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
    initialTheme = resolveInitialTheme(setting, nativeTheme);
    log.info(`[Theme] Pre-paint resolved theme: ${initialTheme} (setting=${setting})`);
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
    pendingContextMenuWebContents,
    pendingSecurityCoverageWebContentsIds,
    canUseWindow,
    log,
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
