// EPIPE crash fix for Linux (pipe errors on stdout/stderr)
process.stdout?.on('error', () => {});
process.stderr?.on('error', () => {});

process.on('uncaughtException', (err) => {
  // log is not yet initialized at this point — use console directly for fatal bootstrap errors
  console.error('[Main] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled rejection:', reason);
});

import { webContents, type WebContents } from 'electron';
import fs from 'fs';
import { app, BrowserWindow, session, ipcMain } from 'electron';
import path from 'path';
import { TandemAPI } from './api/server';
import { StealthManager } from './stealth/manager';
import { TabManager } from './tabs/manager';
import { PanelManager } from './panel/manager';
import { DrawOverlayManager } from './draw/overlay';
import { ActivityTracker } from './activity/tracker';
import { VoiceManager } from './voice/recognition';
import { BehaviorObserver } from './behavior/observer';
import { ConfigManager } from './config/manager';
import { SiteMemoryManager } from './memory/site-memory';
import { WatchManager } from './watch/watcher';
import { HeadlessManager } from './headless/manager';
import { FormMemoryManager } from './memory/form-memory';
import { ContextBridge } from './bridge/context-bridge';
import { PiPManager } from './pip/manager';
import { NetworkInspector } from './network/inspector';
import { ChromeImporter } from './import/chrome-importer';
import { BookmarkManager } from './bookmarks/manager';
import { HistoryManager } from './history/manager';
import { DownloadManager } from './downloads/manager';
import { AudioCaptureManager } from './audio/capture';
import type { ExtensionLoader } from './extensions/loader';
import { ExtensionManager } from './extensions/manager';
import { ExtensionToolbar } from './extensions/toolbar';
import { ClaroNoteManager } from './claronote/manager';
import { EventStreamManager } from './events/stream';
import { TaskManager } from './agents/task-manager';
import { TabLockManager } from './agents/tab-lock-manager';
import { ContextMenuManager } from './context-menu/manager';
import { DevToolsManager } from './devtools/manager';
import { WingmanStream } from './activity/wingman-stream';
import { buildAppMenu } from './menu/app-menu';
import { RequestDispatcher } from './network/dispatcher';
import { SecurityManager } from './security/security-manager';
import { SnapshotManager } from './snapshot/manager';
import { NetworkMocker } from './network/mocker';
import { SessionManager } from './sessions/manager';
import { StateManager } from './sessions/state';
import { ScriptInjector } from './scripts/injector';
import { LocatorFinder } from './locators/finder';
import { DeviceEmulator } from './device/emulator';
import { SidebarManager } from './sidebar/manager';
import { WorkspaceManager } from './workspaces/manager';
import { SyncManager } from './sync/manager';
import { PinboardManager } from './pinboards/manager';
import { SessionRestoreManager } from './session/restore';
import { ContentExtractor } from './content/extractor';
import { WorkflowEngine } from './workflow/engine';
import { LoginManager } from './auth/login-manager';
import type { ManagerRegistry } from './registry';
import { setMainWindow } from './notifications/alert';
import { registerIpcHandlers, syncTabsToContext } from './ipc/handlers';
import { API_PORT, WEBHOOK_PORT, DEFAULT_PARTITION, AUTH_POPUP_PATTERNS, COOKIE_FLUSH_INTERVAL_MS, CDP_ATTACH_DELAY_MS } from './utils/constants';
import { tandemDir } from './utils/paths';
import { createLogger } from './utils/logger';

const log = createLogger('Main');

const IS_DEV = process.argv.includes('--dev');

let mainWindow: BrowserWindow | null = null;
let api: TandemAPI | null = null;
let tabManager: TabManager | null = null;
let panelManager: PanelManager | null = null;
let drawManager: DrawOverlayManager | null = null;
let activityTracker: ActivityTracker | null = null;
let voiceManager: VoiceManager | null = null;
let behaviorObserver: BehaviorObserver | null = null;
let configManager: ConfigManager | null = null;
let siteMemory: SiteMemoryManager | null = null;
let watchManager: WatchManager | null = null;
let headlessManager: HeadlessManager | null = null;
let formMemory: FormMemoryManager | null = null;
let contextBridge: ContextBridge | null = null;
let pipManager: PiPManager | null = null;
let networkInspector: NetworkInspector | null = null;
let chromeImporter: ChromeImporter | null = null;
let bookmarkManager: BookmarkManager | null = null;
let historyManager: HistoryManager | null = null;
let downloadManager: DownloadManager | null = null;
let audioCaptureManager: AudioCaptureManager | null = null;
let extensionLoader: ExtensionLoader | null = null;
let extensionManager: ExtensionManager | null = null;
let extensionToolbar: ExtensionToolbar | null = null;
let claroNoteManager: ClaroNoteManager | null = null;
let eventStream: EventStreamManager | null = null;
let taskManager: TaskManager | null = null;
let tabLockManager: TabLockManager | null = null;
let contextMenuManager: ContextMenuManager | null = null;
let devToolsManager: DevToolsManager | null = null;
let wingmanStream: WingmanStream | null = null;
let dispatcher: RequestDispatcher | null = null;
let securityManager: SecurityManager | null = null;
let snapshotManager: SnapshotManager | null = null;
let networkMocker: NetworkMocker | null = null;
let sessionManager: SessionManager | null = null;
let stateManager: StateManager | null = null;
let scriptInjector: ScriptInjector | null = null;
let locatorFinder: LocatorFinder | null = null;
let deviceEmulator: DeviceEmulator | null = null;
let sidebarManager: SidebarManager | null = null;
let workspaceManager: WorkspaceManager | null = null;
let syncManager: SyncManager | null = null;
let pinboardManager: PinboardManager | null = null;
let sessionRestoreManager: SessionRestoreManager | null = null;
let cookieFlushTimer: ReturnType<typeof setInterval> | null = null;
/** Queue webview webContents created before contextMenuManager is ready */
const pendingContextMenuWebContents: WebContents[] = [];
/** Queue tab-register IPC when it arrives before tabManager is ready */
let pendingTabRegister: { webContentsId: number; url: string } | null = null;

function registerEarlyShellAuthIpc(): void {
  try { ipcMain.removeHandler('get-api-token'); } catch { /* handler may not exist yet */ }
  ipcMain.handle('get-api-token', async () => {
    try {
      return fs.readFileSync(tandemDir('api-token'), 'utf-8').trim();
    } catch {
      return '';
    }
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
  try {
    const url = new URL(rawUrl);
    return (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port === String(API_PORT);
  } catch {
    return false;
  }
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
  if (securityManager) {
    securityManager.onTabCreated(webContentsId).catch(e => log.warn('securityManager.onTabCreated failed:', e instanceof Error ? e.message : e));
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

  if (api) api.stop();
  api = null;

  if (behaviorObserver) behaviorObserver.destroy();
  behaviorObserver = null;

  if (watchManager) watchManager.destroy();
  watchManager = null;

  if (headlessManager) headlessManager.destroy();
  headlessManager = null;

  if (pipManager) pipManager.destroy();
  pipManager = null;

  if (networkInspector) networkInspector.destroy();
  networkInspector = null;

  if (voiceManager && canUseWindow(mainWindow)) {
    voiceManager.stop();
  }
  voiceManager = null;

  if (audioCaptureManager) audioCaptureManager.stopRecording();
  audioCaptureManager = null;

  if (chromeImporter) chromeImporter.destroy();
  chromeImporter = null;

  if (taskManager) taskManager.destroy();
  taskManager = null;

  if (tabLockManager) tabLockManager.destroy();
  tabLockManager = null;

  if (contextMenuManager) contextMenuManager.destroy();
  contextMenuManager = null;

  if (devToolsManager) devToolsManager.destroy();
  devToolsManager = null;

  if (wingmanStream) wingmanStream.destroy();
  wingmanStream = null;

  if (securityManager) securityManager.destroy();
  securityManager = null;

  if (snapshotManager) snapshotManager.destroy();
  snapshotManager = null;

  if (networkMocker) networkMocker.destroy();
  networkMocker = null;

  if (sessionManager) sessionManager.destroy();
  sessionManager = null;

  if (extensionToolbar) extensionToolbar.destroy();
  extensionToolbar = null;

  if (extensionManager) extensionManager.getIdentityPolyfill().destroy();
  if (extensionManager) extensionManager.destroyUpdateChecker();
  extensionManager = null;
  extensionLoader = null;

  if (historyManager) historyManager.destroy();
  historyManager = null;

  if (sidebarManager) sidebarManager.destroy();
  sidebarManager = null;

  if (workspaceManager) workspaceManager.destroy();
  workspaceManager = null;

  if (pinboardManager) pinboardManager.destroy();
  pinboardManager = null;

  if (syncManager) syncManager.destroy();
  syncManager = null;

  panelManager = null;
  drawManager = null;
  configManager = null;
  siteMemory = null;
  formMemory = null;
  contextBridge = null;
  downloadManager = null;
  claroNoteManager = null;
  eventStream = null;
  dispatcher = null;
  stateManager = null;
  scriptInjector = null;
  locatorFinder = null;
  deviceEmulator = null;
  sessionRestoreManager = null;
  tabManager = null;
}

async function createWindow(): Promise<BrowserWindow> {
  registerEarlyShellAuthIpc();

  const partition = DEFAULT_PARTITION;
  const ses = session.fromPartition(partition);

  const stealth = new StealthManager(ses, partition);
  await stealth.apply();

  // Create RequestDispatcher — central hub for all webRequest hooks
  dispatcher = new RequestDispatcher(ses);

  // Register StealthManager header modification (priority 10 — runs first)
  stealth.registerWith(dispatcher);

  // Cookie fix: ensure SameSite=None cookies have Secure flag (priority 10, response headers)
  dispatcher.registerHeadersReceived({
    name: 'CookieFix',
    priority: 10,
    handler: (_details, responseHeaders) => {
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
        // Skip stealth injection on Google auth pages — our patches break their login detection
        const url = contents.getURL();
        if (url.includes('accounts.google.com') || url.includes('consent.google.com')) {
          log.info('🔑 Skipping stealth for Google auth:', url.substring(0, 60));
          return;
        }
        contents.executeJavaScript(stealthScript).catch((e) => log.warn('Stealth script injection failed:', e.message));

        if (!isSidebarWebview) {
          queueSecurityCoverage(contents.id);
        }
      });

      if (!isSidebarWebview) {
        contents.on('did-finish-load', () => {
          securityManager?.onTabNavigated(contents.id).catch(e => log.warn('securityManager.onTabNavigated failed:', e instanceof Error ? e.message : e));
        });

        contents.on('destroyed', () => {
          securityManager?.onTabClosed(contents.id);
        });
      }

      // Register context menu for this webview (queue if manager not yet ready)
      if (contextMenuManager) {
        contextMenuManager.registerWebContents(contents);
      } else {
        pendingContextMenuWebContents.push(contents);
      }

      // Workspace: assign new tab webContents to active workspace
      if (!isSidebarWebview && workspaceManager) {
        workspaceManager.assignTab(contents.id);
        contents.on('destroyed', () => {
          workspaceManager?.removeTab(contents.id);
        });
      }

      // Wingman Vision: text selection + form tracking moved to CDP Runtime.addBinding (see DevToolsManager)

      // Handle popups from webviews
      contents.setWindowOpenHandler(({ url }) => {
        // OAuth/auth popups need window.opener — allow for ALL webviews (incl. sidebar)
        // e.g. Google login from Gmail/Calendar sidebar panel
        const isAuth = AUTH_POPUP_PATTERNS.some(p => url.includes(p));
        // Sidebar webviews: allow auth popups, deny everything else
        if (isSidebarWebview && !isAuth) return { action: 'deny' };
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
          mainWindow.webContents.send('open-url-in-new-tab', url);
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
            if (!url.includes('accounts.google.com') && !url.includes('google.com/o/oauth2')) {
              win.close();
              if (mainWindow) {
                mainWindow.webContents.send('reload-sidebar-webview', sidebarId);
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
        if (tabManager && !tabManager.hasWebContents(contents.id) && mainWindow && url && url !== 'about:blank') {
          mainWindow.webContents.send('open-url-in-new-tab', url);
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
              mainWindow.webContents.send('open-url-in-new-tab', targetUrl);
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

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Tandem Browser',
    ...platformWindowOptions,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition,
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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

  configManager = new ConfigManager();
  tabManager = new TabManager(win);
  panelManager = new PanelManager(win, configManager);
  drawManager = new DrawOverlayManager(win, configManager);
  wingmanStream = new WingmanStream(configManager);
  activityTracker = new ActivityTracker(win, panelManager, drawManager, wingmanStream);
  voiceManager = new VoiceManager(win, panelManager);
  behaviorObserver = new BehaviorObserver(win);
  siteMemory = new SiteMemoryManager();
  watchManager = new WatchManager();
  headlessManager = new HeadlessManager();
  formMemory = new FormMemoryManager();
  contextBridge = new ContextBridge();
  pipManager = new PiPManager();
  networkInspector = new NetworkInspector();
  if (dispatcher) networkInspector.registerWith(dispatcher);
  securityManager = new SecurityManager();
  chromeImporter = new ChromeImporter(configManager);
  bookmarkManager = new BookmarkManager();
  historyManager = new HistoryManager();
  downloadManager = new DownloadManager();
  audioCaptureManager = new AudioCaptureManager();
  extensionManager = new ExtensionManager();
  extensionLoader = extensionManager.getLoader();
  claroNoteManager = new ClaroNoteManager();
  eventStream = new EventStreamManager();
  taskManager = new TaskManager();
  tabLockManager = new TabLockManager();
  devToolsManager = new DevToolsManager(tabManager!);
  snapshotManager = new SnapshotManager(devToolsManager!);
  networkMocker = new NetworkMocker(devToolsManager!);
  sessionManager = new SessionManager();
  stateManager = new StateManager();
  scriptInjector = new ScriptInjector();
  locatorFinder = new LocatorFinder(devToolsManager!, snapshotManager!);
  deviceEmulator = new DeviceEmulator();
  sidebarManager = new SidebarManager();
  workspaceManager = new WorkspaceManager();
  workspaceManager.setMainWindow(win);
  syncManager = new SyncManager();
  const deviceSyncConfig = configManager.getConfig().deviceSync;
  if (deviceSyncConfig.enabled && deviceSyncConfig.syncRoot) {
    syncManager.init(deviceSyncConfig);
  }
  pinboardManager = new PinboardManager();
  pinboardManager.setSyncManager(syncManager);
  sessionRestoreManager = new SessionRestoreManager(syncManager);
  tabManager.setSyncManager(syncManager);
  tabManager.setSessionRestore(sessionRestoreManager);
  tabManager.setWorkspaceIdResolver((webContentsId) => workspaceManager?.getWorkspaceIdForTab(webContentsId) ?? null);
  historyManager.setSyncManager(syncManager);
  workspaceManager.setSyncManager(syncManager);
  devToolsManager.setWingmanStream(wingmanStream!);
  devToolsManager.setActivityTracker(activityTracker!);

  // SecurityManager consolidated init (was 3 scattered calls, now 1)
  // initGatekeeper() follows after api.start() since it needs the HTTP server

  contextMenuManager = new ContextMenuManager({
    win,
    tabManager: tabManager!,
    bookmarkManager: bookmarkManager!,
    historyManager: historyManager!,
    panelManager: panelManager!,
    downloadManager: downloadManager!,
    pinboardManager: pinboardManager!,
  });

  // Drain any webview webContents that were created before contextMenuManager was ready
  while (pendingContextMenuWebContents.length > 0) {
    const wc = pendingContextMenuWebContents.shift()!;
    if (!wc.isDestroyed()) {
      contextMenuManager.registerWebContents(wc);
    }
  }

  // Connect ContextBridge to EventStreamManager for live context (Phase 2.2)
  contextBridge.connectEventStream(eventStream);

  // Wire TaskManager events to renderer (Phase 4)
  taskManager.on('approval-request', (data: Record<string, unknown>) => {
    if (canUseWindow(win)) {
      win.webContents.send('approval-request', data);
    }
  });
  taskManager.on('task-updated', (task: Record<string, unknown>) => {
    if (canUseWindow(win)) {
      win.webContents.send('task-updated', task);
    }
  });
  taskManager.on('emergency-stop', (data: Record<string, unknown>) => {
    if (canUseWindow(win)) {
      win.webContents.send('emergency-stop', data);
    }
  });

  // Hook download manager into session
  const partition = DEFAULT_PARTITION;
  const ses = session.fromPartition(partition);
  downloadManager.hookSession(ses, win);

  // Initialize SecurityManager with all external deps (consolidated from 3 scattered calls)
  if (securityManager) {
    securityManager.init({
      dispatcher: dispatcher || undefined,
      devToolsManager: devToolsManager!,
      session: ses,
    });
  }

  while (pendingSecurityCoverageWebContentsIds.length > 0) {
    const wcId = pendingSecurityCoverageWebContentsIds.shift()!;
    securityManager?.onTabCreated(wcId).catch(e => log.warn('securityManager.onTabCreated failed:', e instanceof Error ? e.message : e));
  }

  // Configure native messaging host directories before loading extensions.
  // Electron 40 requires session.setNativeMessagingHostDirectory() to be called
  // before chrome.runtime.connectNative() / sendNativeMessage() will work.
  // We call it on both the partition session and defaultSession to cover all cases.
  // Manifests are mirrored to these dirs by NativeMessagingSetup.mirrorManifestsToTandemDir().
  try {
    const os = await import('os');
    const path = await import('path');
    const nativeMsgDirs = [
      path.join(os.homedir(), 'Library', 'Application Support', 'Tandem Browser', 'NativeMessagingHosts'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'),
      '/Library/Google/Chrome/NativeMessagingHosts',
    ].filter(d => { try { return require('fs').existsSync(d); } catch { return false; } });

    for (const dir of nativeMsgDirs) {
      for (const targetSession of [ses, session.defaultSession]) {
        const s = targetSession as unknown as Record<string, unknown>;
        if (typeof s['setNativeMessagingHostDirectory'] === 'function') {
          (s['setNativeMessagingHostDirectory'] as (p: string) => void)(dir);
          log.info(`🔌 Native messaging: set host directory ${dir}`);
        }
      }
      if (nativeMsgDirs.indexOf(dir) === 0) break; // Use first valid dir only
    }
  } catch (err) {
    log.warn('⚠️ Native messaging dir setup failed:', err instanceof Error ? err.message : String(err));
  }

  // Load extensions from ~/.tandem/extensions/
  extensionToolbar = new ExtensionToolbar(extensionManager);
  extensionToolbar.setMainWindow(win);

  extensionManager.init(ses).then(() => {
    // Register toolbar IPC handlers after extensions are loaded
    extensionToolbar!.registerIpcHandlers(ses);
    // Send initial toolbar state to renderer
    extensionToolbar!.notifyToolbarUpdate(ses);
  }).catch((err) => {
    log.warn('⚠️ Failed to load some extensions:', err);
    // Still register IPC handlers so toolbar works (just empty)
    extensionToolbar!.registerIpcHandlers(ses);
  });

  // Auto-start Chrome bookmark sync if enabled in config
  if (configManager.getConfig().sync.chromeBookmarks) {
    chromeImporter.startSync();
  }

  const registry: ManagerRegistry = {
    tabManager: tabManager!,
    panelManager: panelManager!,
    drawManager: drawManager!,
    activityTracker: activityTracker!,
    voiceManager: voiceManager!,
    behaviorObserver: behaviorObserver!,
    configManager: configManager!,
    siteMemory: siteMemory!,
    watchManager: watchManager!,
    headlessManager: headlessManager!,
    formMemory: formMemory!,
    contextBridge: contextBridge!,
    pipManager: pipManager!,
    networkInspector: networkInspector!,
    chromeImporter: chromeImporter!,
    bookmarkManager: bookmarkManager!,
    historyManager: historyManager!,
    downloadManager: downloadManager!,
    audioCaptureManager: audioCaptureManager!,
    extensionLoader: extensionLoader!,
    extensionManager: extensionManager!,
    claroNoteManager: claroNoteManager!,
    contentExtractor: new ContentExtractor(),
    workflowEngine: new WorkflowEngine(),
    loginManager: new LoginManager(),
    eventStream: eventStream!,
    taskManager: taskManager!,
    tabLockManager: tabLockManager!,
    devToolsManager: devToolsManager!,
    wingmanStream: wingmanStream!,
    securityManager: securityManager!,
    snapshotManager: snapshotManager!,
    networkMocker: networkMocker!,
    sessionManager: sessionManager!,
    stateManager: stateManager!,
    scriptInjector: scriptInjector!,
    locatorFinder: locatorFinder!,
    deviceEmulator: deviceEmulator!,
    sidebarManager: sidebarManager!,
    workspaceManager: workspaceManager!,
    syncManager: syncManager!,
    pinboardManager: pinboardManager!,
  };

  api = new TandemAPI({ win, port: API_PORT, registry });
  await api.start();
  log.info(`🧠 Tandem API running on http://localhost:${API_PORT}`);

  // Phase 4: Wire GatekeeperWebSocket + NM proxy WebSocket onto the running HTTP server
  const httpServer = api.getHttpServer();
  if (httpServer) {
    if (securityManager) {
      securityManager.initGatekeeper(httpServer);
    }
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

  // Register all IPC handlers from extracted module
  registerIpcHandlers({
    win,
    tabManager: tabManager!,
    panelManager: panelManager!,
    drawManager: drawManager!,
    voiceManager: voiceManager!,
    behaviorObserver: behaviorObserver!,
    siteMemory: siteMemory!,
    formMemory: formMemory!,
    contextBridge: contextBridge!,
    networkInspector: networkInspector!,
    bookmarkManager: bookmarkManager!,
    historyManager: historyManager!,
    eventStream: eventStream!,
    taskManager: taskManager!,
    contextMenuManager: contextMenuManager!,
    devToolsManager: devToolsManager!,
    activityTracker: activityTracker!,
    securityManager,
    scriptInjector: scriptInjector!,
    deviceEmulator: deviceEmulator!,
    wingmanStream: wingmanStream!,
    snapshotManager: snapshotManager!,
  });

  // Restore saved session tabs after the initial tab is registered
  async function restoreSessionTabs(initialTabId: string): Promise<void> {
    if (!sessionRestoreManager || !tabManager) return;
    const currentWorkspaceManager = workspaceManager;
    const saved = sessionRestoreManager.load();
    if (!saved || saved.tabs.length === 0) return;

    log.info(`Restoring ${saved.tabs.length} tabs from session`);
    currentWorkspaceManager?.resetTabAssignments();
    const defaultWorkspaceId = currentWorkspaceManager?.list().find(ws => ws.isDefault)?.id ?? null;

    // Open all saved tabs
    let firstRestoredTabId: string | null = null;
    for (const savedTab of saved.tabs) {
      try {
        const tab = await tabManager.openTab(savedTab.url, savedTab.groupId ?? undefined, 'robin', 'persist:tandem', false);
        const targetWorkspaceId = savedTab.workspaceId && currentWorkspaceManager?.get(savedTab.workspaceId)
          ? savedTab.workspaceId
          : defaultWorkspaceId;
        if (targetWorkspaceId && currentWorkspaceManager) {
          currentWorkspaceManager.moveTab(tab.webContentsId, targetWorkspaceId);
        }
        if (savedTab.pinned) tabManager.pinTab(tab.id);
        if (savedTab.title) tab.title = savedTab.title;
        if (!firstRestoredTabId) firstRestoredTabId = tab.id;
        // Track which saved tab ID maps to active
        if (saved.activeTabId === savedTab.id) {
          firstRestoredTabId = tab.id; // override: this is the active one
        }
      } catch (e) {
        log.warn('Failed to restore tab:', savedTab.url, e instanceof Error ? e.message : String(e));
      }
    }

    // Close the initial default tab (it was just the shell bootstrap)
    if (firstRestoredTabId) {
      await tabManager.closeTab(initialTabId);
      const activeWorkspace = currentWorkspaceManager?.getActive();
      if (activeWorkspace && currentWorkspaceManager) {
        currentWorkspaceManager.switch(activeWorkspace.id);
      }
      // Focus the previously active tab (or the first restored tab)
      await tabManager.focusTab(firstRestoredTabId);
    }
  }

  // Listen for initial tab registration
  ipcMain.on('tab-register', (_event, data: { webContentsId: number; url: string }) => {
    if (!tabManager) {
      pendingTabRegister = data;
      return;
    }
    if (tabManager.count === 0) {
      const tab = tabManager.registerInitialTab(data.webContentsId, data.url);
      // Notify renderer of the tab ID
      if (canUseWindow(win)) {
        win.webContents.send('tab-registered', { tabId: tab.id });
      }
      eventStream?.handleTabEvent('tab-opened', { tabId: tab.id, url: data.url });
      syncTabsToContext(tabManager!, contextBridge!);
      // Auto-attach CDP for Wingman Vision + Security on startup
      // Reduced from 2000ms to CDP_ATTACH_DELAY_MS to minimize ScriptGuard race window
      setTimeout(async () => {
        await devToolsManager?.attachToTab(data.webContentsId).catch(e => log.warn('devToolsManager.attachToTab failed:', e instanceof Error ? e.message : e));
        securityManager?.onTabAttached(data.webContentsId).catch(e => log.warn('securityManager.onTabAttached failed:', e instanceof Error ? e.message : e));
      }, CDP_ATTACH_DELAY_MS);
      // Restore saved session tabs (replaces the default new tab), then reconcile
      // to remove any renderer orphans that result from failed tab restorations.
      restoreSessionTabs(tab.id)
        .then(() => tabManager?.reconcileWithRenderer()
          .then(r => {
            if (r.removed.length > 0) {
              log.info(`Post-restore reconcile: removed ${r.removed.length} renderer orphan(s): ${r.removed.join(', ')}`);
            }
          })
          .catch(e => log.warn('Post-restore reconcile failed:', e instanceof Error ? e.message : String(e)))
        )
        .catch(e => log.warn('Session restore failed:', e instanceof Error ? e.message : String(e)));
    }
  });

  // Process any tab-register message that arrived before startAPI was ready
  if (pendingTabRegister && tabManager && tabManager.count === 0) {
    const data = pendingTabRegister;
    pendingTabRegister = null;
    const tab = tabManager.registerInitialTab(data.webContentsId, data.url);
    if (canUseWindow(win)) {
      win.webContents.send('tab-registered', { tabId: tab.id });
    }
    eventStream?.handleTabEvent('tab-opened', { tabId: tab.id, url: data.url });
    syncTabsToContext(tabManager!, contextBridge!);
    setTimeout(async () => {
      await devToolsManager?.attachToTab(data.webContentsId).catch(e => log.warn('devToolsManager.attachToTab failed:', e instanceof Error ? e.message : e));
      securityManager?.onTabAttached(data.webContentsId).catch(e => log.warn('securityManager.onTabAttached failed:', e instanceof Error ? e.message : e));
    }, CDP_ATTACH_DELAY_MS);
    // Restore saved session tabs (replaces the default new tab), then reconcile.
    restoreSessionTabs(tab.id)
      .then(() => tabManager?.reconcileWithRenderer()
        .then(r => {
          if (r.removed.length > 0) {
            log.info(`Post-restore reconcile: removed ${r.removed.length} renderer orphan(s): ${r.removed.join(', ')}`);
          }
        })
        .catch(e => log.warn('Post-restore reconcile failed:', e instanceof Error ? e.message : String(e)))
      )
      .catch(e => log.warn('Session restore failed:', e instanceof Error ? e.message : String(e)));
  }
}


void app.whenReady().then(async () => {
  const win = await createWindow();
  await startAPI(win);
  buildAppMenu({
    mainWindow: win,
    tabManager,
    panelManager,
    drawManager,
    voiceManager,
    pipManager,
    configManager,
    audioCaptureManager,
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
          tabManager,
          panelManager,
          drawManager,
          voiceManager,
          pipManager,
          configManager,
          audioCaptureManager,
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
