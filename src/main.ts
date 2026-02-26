// EPIPE crash fix for Linux (pipe errors on stdout/stderr)
process.stdout?.on('error', () => {});
process.stderr?.on('error', () => {});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

import { app, BrowserWindow, session, ipcMain, WebContents } from 'electron';
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
import { ExtensionLoader } from './extensions/loader';
import { ExtensionManager } from './extensions/manager';
import { ExtensionToolbar } from './extensions/toolbar';
import { ClaroNoteManager } from './claronote/manager';
import { EventStreamManager } from './events/stream';
import { TaskManager } from './agents/task-manager';
import { TabLockManager } from './agents/tab-lock-manager';
import { ContextMenuManager } from './context-menu/manager';
import { DevToolsManager } from './devtools/manager';
import { CopilotStream } from './activity/copilot-stream';
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
import { setMainWindow } from './notifications/alert';
import { registerIpcHandlers, syncTabsToContext } from './ipc/handlers';

const IS_DEV = process.argv.includes('--dev');
const API_PORT = 8765;

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
let copilotStream: CopilotStream | null = null;
let dispatcher: RequestDispatcher | null = null;
let securityManager: SecurityManager | null = null;
let snapshotManager: SnapshotManager | null = null;
let networkMocker: NetworkMocker | null = null;
let sessionManager: SessionManager | null = null;
let stateManager: StateManager | null = null;
let scriptInjector: ScriptInjector | null = null;
let locatorFinder: LocatorFinder | null = null;
let deviceEmulator: DeviceEmulator | null = null;
/** Queue webview webContents created before contextMenuManager is ready */
const pendingContextMenuWebContents: WebContents[] = [];
/** Queue tab-register IPC when it arrives before tabManager is ready */
let pendingTabRegister: { webContentsId: number; url: string } | null = null;

async function createWindow(): Promise<BrowserWindow> {
  const partition = 'persist:tandem';
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
        headers['Origin'] = 'http://127.0.0.1:18789';
      }
      return headers;
    }
  });

  // Attach dispatcher — activates all hooks with current consumers
  dispatcher.attach();

  // Flush cookies to disk every 30 seconds for reliability
  setInterval(() => { ses.cookies.flushStore().catch(() => {}); }, 30000);

  // Inject stealth script into all webviews via session preload
  const stealthSeed = stealth.getPartitionSeed();
  const stealthScript = StealthManager.getStealthScript(stealthSeed);

  // Apply stealth patches to every webview's webContents on creation
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'webview') {
      contents.on('dom-ready', () => {
        // Skip stealth injection on Google auth pages — our patches break their login detection
        const url = contents.getURL();
        if (url.includes('accounts.google.com') || url.includes('consent.google.com')) {
          console.log('🔑 Skipping stealth for Google auth:', url.substring(0, 60));
          return;
        }
        contents.executeJavaScript(stealthScript).catch((e) => console.warn('Stealth script injection failed:', e.message));
      });

      // Register context menu for this webview (queue if manager not yet ready)
      if (contextMenuManager) {
        contextMenuManager.registerWebContents(contents);
      } else {
        pendingContextMenuWebContents.push(contents);
      }

      // Copilot Vision: text selection + form tracking moved to CDP Runtime.addBinding (see DevToolsManager)

      // Handle popups from webviews
      contents.setWindowOpenHandler(({ url }) => {
        // OAuth/auth popups need window.opener — allow as real popup with proper config
        const isAuth = url.includes('accounts.google.com') || url.includes('appleid.apple.com')
          || url.includes('login.microsoftonline.com') || url.includes('/oauth') || url.includes('/auth');
        if (isAuth) {
          return {
            action: 'allow',
            overrideBrowserWindowOptions: {
              width: 500,
              height: 700,
              webPreferences: {
                partition,
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

    // Catch-all: route unmanaged webContents navigations back through TabManager.
    // IMPORTANT: check hasWebContents at navigate time, NOT at registration time.
    // Reason: TabManager registers webContents asynchronously (via executeJavaScript),
    // so at web-contents-created time the webContents is not yet known to TabManager.
    // Checking at registration time would cause ALL tab navigations to be intercepted.
    // Skip popup BrowserWindows (type 'window') — they handle their own OAuth flows.
    if (contents.getType() !== 'window') {
      contents.on('will-navigate', (_e, url) => {
        if (tabManager && !tabManager.hasWebContents(contents.id) && mainWindow && url && url !== 'about:blank') {
          mainWindow.webContents.send('open-url-in-new-tab', url);
          contents.stop();
        }
      });
    }
  });

  // macOS: hiddenInset titlebar (tabs inline with traffic lights, Chrome-style)
  //        + under-window vibrancy (deepest native glass effect)
  //        + transparent background so macOS glass shows through chrome areas
  //        + trafficLightPosition centered in the 36px tab bar
  // Linux/Windows: no changes — Max's LGL CSS handles Linux styling
  const platformWindowOptions: Partial<Electron.BrowserWindowConstructorOptions> = process.platform === 'darwin'
    ? {
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 10 },
        vibrancy: 'under-window',
        visualEffectState: 'active',
        backgroundColor: '#00000000',  // transparent so macOS vibrancy shows through chrome
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

  mainWindow.loadFile(path.join(__dirname, '..', 'shell', 'index.html'));

  // Only open shell DevTools in dev mode (--dev flag)
  if (IS_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    setMainWindow(null);
    mainWindow = null;
    tabManager = null;
    if (behaviorObserver) {
      behaviorObserver.destroy();
      behaviorObserver = null;
    }
  });

  return mainWindow;
}

async function startAPI(win: BrowserWindow): Promise<void> {
  configManager = new ConfigManager();
  tabManager = new TabManager(win);
  panelManager = new PanelManager(win, configManager);
  drawManager = new DrawOverlayManager(win, configManager);
  copilotStream = new CopilotStream(configManager);
  activityTracker = new ActivityTracker(win, panelManager, drawManager, copilotStream);
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
  if (dispatcher) securityManager.registerWith(dispatcher);
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
  devToolsManager.setCopilotStream(copilotStream!);
  devToolsManager.setActivityTracker(activityTracker!);

  // Phase 3: Wire DevToolsManager into SecurityManager for CDP-based security analysis
  if (securityManager) {
    securityManager.setDevToolsManager(devToolsManager);
  }

  contextMenuManager = new ContextMenuManager({
    win,
    tabManager: tabManager!,
    bookmarkManager: bookmarkManager!,
    historyManager: historyManager!,
    panelManager: panelManager!,
    downloadManager: downloadManager!,
  });

  // Drain any webview webContents that were created before contextMenuManager was ready
  while (pendingContextMenuWebContents.length > 0) {
    const wc = pendingContextMenuWebContents.shift()!;
    if (!wc.isDestroyed()) {
      contextMenuManager.registerWebContents(wc);
    }
  }

  // Connect ContextBridge to EventStreamManager for live context (Fase 2.2)
  contextBridge.connectEventStream(eventStream);

  // Wire TaskManager events to renderer (Fase 4)
  taskManager.on('approval-request', (data: any) => {
    win.webContents.send('approval-request', data);
  });
  taskManager.on('task-updated', (task: any) => {
    win.webContents.send('task-updated', task);
  });
  taskManager.on('emergency-stop', (data: any) => {
    win.webContents.send('emergency-stop', data);
  });

  // Hook download manager into session
  const partition = 'persist:tandem';
  const ses = session.fromPartition(partition);
  downloadManager.hookSession(ses, win);

  // Phase 3: Setup permission handler for BehaviorMonitor
  if (securityManager) {
    securityManager.setupPermissionHandler(ses);
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
    console.warn('⚠️ Failed to load some extensions:', err);
    // Still register IPC handlers so toolbar works (just empty)
    extensionToolbar!.registerIpcHandlers(ses);
  });

  // Auto-start Chrome bookmark sync if enabled in config
  if (configManager.getConfig().sync.chromeBookmarks) {
    chromeImporter.startSync();
  }

  api = new TandemAPI({
    win,
    port: API_PORT,
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
    eventStream: eventStream!,
    taskManager: taskManager!,
    tabLockManager: tabLockManager!,
    devToolsManager: devToolsManager!,
    copilotStream: copilotStream!,
    securityManager: securityManager!,
    snapshotManager: snapshotManager!,
    networkMocker: networkMocker!,
    sessionManager: sessionManager!,
    stateManager: stateManager!,
    scriptInjector: scriptInjector!,
    locatorFinder: locatorFinder!,
    deviceEmulator: deviceEmulator!,
  });
  await api.start();
  console.log(`🧠 Tandem API running on http://localhost:${API_PORT}`);

  // Phase 4: Wire GatekeeperWebSocket onto the running HTTP server
  if (securityManager) {
    const httpServer = api.getHttpServer();
    if (httpServer) {
      securityManager.initGatekeeper(httpServer);
    }
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
    copilotStream: copilotStream!,
    snapshotManager: snapshotManager!,
  });

  // Listen for initial tab registration
  ipcMain.on('tab-register', (_event, data: { webContentsId: number; url: string }) => {
    if (!tabManager) {
      pendingTabRegister = data;
      return;
    }
    if (tabManager.count === 0) {
      const tab = tabManager.registerInitialTab(data.webContentsId, data.url);
      // Notify renderer of the tab ID
      win.webContents.send('tab-registered', { tabId: tab.id });
      eventStream?.handleTabEvent('tab-opened', { tabId: tab.id, url: data.url });
      syncTabsToContext(tabManager!, contextBridge!);
      // Auto-attach CDP for Copilot Vision + Security on startup
      // Reduced from 2000ms to 500ms to minimize ScriptGuard race window
      setTimeout(async () => {
        await devToolsManager?.attachToTab(data.webContentsId).catch(() => {});
        securityManager?.onTabAttached().catch(() => {});
      }, 500);
    }
  });

  // Process any tab-register message that arrived before startAPI was ready
  if (pendingTabRegister && tabManager && tabManager.count === 0) {
    const data = pendingTabRegister;
    pendingTabRegister = null;
    const tab = tabManager.registerInitialTab(data.webContentsId, data.url);
    win.webContents.send('tab-registered', { tabId: tab.id });
    eventStream?.handleTabEvent('tab-opened', { tabId: tab.id, url: data.url });
    syncTabsToContext(tabManager!, contextBridge!);
    setTimeout(async () => {
      await devToolsManager?.attachToTab(data.webContentsId).catch(() => {});
      securityManager?.onTabAttached().catch(() => {});
    }, 500);
  }
}


app.whenReady().then(async () => {
  // Register tab-register early to avoid race with window loading
  ipcMain.on('tab-register', (_event, data: { webContentsId: number; url: string }) => {
    pendingTabRegister = data;
  });

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
        console.error('[activate] Failed to recreate window:', err);
      });
    }
  });
});

app.on('will-quit', () => {
  // Cleanup all managers and resources
  if (api) api.stop();
  if (behaviorObserver) behaviorObserver.destroy();
  if (watchManager) watchManager.destroy();
  if (headlessManager) headlessManager.destroy();
  if (pipManager) pipManager.destroy();
  if (networkInspector) networkInspector.destroy();
  if (voiceManager) voiceManager.stop();
  if (audioCaptureManager) audioCaptureManager.stopRecording();
  if (chromeImporter) chromeImporter.destroy();
  if (taskManager) taskManager.destroy();
  if (tabLockManager) tabLockManager.destroy();
  if (contextMenuManager) contextMenuManager.destroy();
  if (devToolsManager) devToolsManager.destroy();
  if (copilotStream) copilotStream.destroy();
  if (securityManager) securityManager.destroy();
  if (snapshotManager) snapshotManager.destroy();
  if (networkMocker) networkMocker.destroy();
  if (sessionManager) sessionManager.cleanup();
  if (extensionToolbar) extensionToolbar.destroy();
  if (extensionManager) extensionManager.getIdentityPolyfill().destroy();
  if (extensionManager) extensionManager.destroyUpdateChecker();
  if (historyManager) historyManager.destroy();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
