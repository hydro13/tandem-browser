import { app, BrowserWindow, session, ipcMain, Notification, globalShortcut, clipboard, nativeImage, webContents, WebContents, Menu } from 'electron';
import path from 'path';
import fs from 'fs';

// Keep app name as Tandem — don't pretend to be Chrome (causes Google login mismatch)
// TotalRecall V2 uses default Electron identity and Google login works fine
import os from 'os';
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
import { ClaroNoteManager } from './claronote/manager';
import { EventStreamManager } from './events/stream';
import { TaskManager } from './agents/task-manager';
import { TabLockManager } from './agents/tab-lock-manager';
import { ContextMenuManager } from './context-menu/manager';
import { DevToolsManager } from './devtools/manager';
import { CopilotStream } from './activity/copilot-stream';
import { RequestDispatcher } from './network/dispatcher';
import { SecurityManager } from './security/security-manager';

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
let claroNoteManager: ClaroNoteManager | null = null;
let eventStream: EventStreamManager | null = null;
let taskManager: TaskManager | null = null;
let tabLockManager: TabLockManager | null = null;
let contextMenuManager: ContextMenuManager | null = null;
let devToolsManager: DevToolsManager | null = null;
let copilotStream: CopilotStream | null = null;
let dispatcher: RequestDispatcher | null = null;
let securityManager: SecurityManager | null = null;
/** Queue webview webContents created before contextMenuManager is ready */
const pendingContextMenuWebContents: WebContents[] = [];

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
  });

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Tandem Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition,
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,  // Required for preload/contextBridge to work (TotalRecall V2 also uses this)
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'shell', 'index.html'));

  // Only open shell DevTools in dev mode (--dev flag)
  if (IS_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    tabManager = null;
    if (behaviorObserver) behaviorObserver.destroy();
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
  extensionLoader = new ExtensionLoader();
  claroNoteManager = new ClaroNoteManager();
  eventStream = new EventStreamManager();
  taskManager = new TaskManager();
  tabLockManager = new TabLockManager();
  devToolsManager = new DevToolsManager(tabManager!);
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
  extensionLoader.loadAllExtensions(ses).catch((err) => {
    console.warn('⚠️ Failed to load some extensions:', err);
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
    claroNoteManager: claroNoteManager!,
    eventStream: eventStream!,
    taskManager: taskManager!,
    tabLockManager: tabLockManager!,
    devToolsManager: devToolsManager!,
    copilotStream: copilotStream!,
    securityManager: securityManager!,
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

  // ═══ IPC Handler Cleanup — prevent duplicates on macOS reactivation ═══
  const ipcChannels = ['tab-update', 'tab-register', 'chat-send', 'voice-transcript', 'voice-status-update', 'activity-webview-event', 'form-submitted'];
  for (const channel of ipcChannels) {
    ipcMain.removeAllListeners(channel);
  }
  const ipcHandlers = ['snap-for-kees', 'quick-screenshot', 'bookmark-page', 'unbookmark-page', 'is-bookmarked', 'tab-new', 'tab-close', 'tab-focus', 'tab-focus-index', 'tab-list', 'emergency-stop', 'show-tab-context-menu', 'chat-send-image'];
  for (const handler of ipcHandlers) {
    try { ipcMain.removeHandler(handler); } catch { /* handler may not exist yet */ }
  }

  // Helper: sync tab list into ContextBridge for live context summary
  const syncTabsToContext = () => {
    if (tabManager && contextBridge) {
      contextBridge.updateTabs(tabManager.listTabs());
    }
  };

  // Listen for tab metadata updates from renderer
  ipcMain.on('tab-update', (_event, data: { tabId: string; title?: string; url?: string; favicon?: string }) => {
    tabManager?.updateTab(data.tabId, data);
    eventStream?.handleTabEvent('tab-updated', { tabId: data.tabId, url: data.url, title: data.title });
    syncTabsToContext();
  });

  // Listen for initial tab registration
  ipcMain.on('tab-register', (_event, data: { webContentsId: number; url: string }) => {
    if (tabManager && tabManager.count === 0) {
      const tab = tabManager.registerInitialTab(data.webContentsId, data.url);
      // Notify renderer of the tab ID
      win.webContents.send('tab-registered', { tabId: tab.id });
      eventStream?.handleTabEvent('tab-opened', { tabId: tab.id, url: data.url });
      syncTabsToContext();
      // Auto-attach CDP for Copilot Vision + Security on startup
      setTimeout(async () => {
        await devToolsManager?.attachToTab(data.webContentsId).catch(() => {});
        securityManager?.onTabAttached().catch(() => {});
      }, 2000);
    }
  });

  // ═══ Chat IPC — Robin sends messages from renderer ═══
  ipcMain.on('chat-send', (_event, text: string) => {
    if (text && panelManager) {
      panelManager.addChatMessage('robin', text);
    }
  });

  // ═══ Chat Image IPC — Robin pastes image from clipboard ═══
  ipcMain.handle('chat-send-image', async (_event, data: { text: string; image: string }) => {
    if (!panelManager) return { ok: false };
    const filename = panelManager.saveImage(data.image);
    const msg = panelManager.addChatMessage('robin', data.text || '', filename);
    return { ok: true, message: msg };
  });

  // ═══ Screenshot Snap — composites webview + canvas, saves + clipboard ═══
  ipcMain.handle('snap-for-kees', async () => {
    try {
      const activeTab = tabManager?.getActiveTab();
      if (!activeTab) return { ok: false, error: 'No active tab' };

      const result = await drawManager!.captureAnnotatedFull(activeTab.webContentsId, activeTab.url);
      return result;
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  // ═══ Quick Screenshot (no draw mode) ═══
  ipcMain.handle('quick-screenshot', async () => {
    try {
      const activeTab = tabManager?.getActiveTab();
      if (!activeTab) return { ok: false, error: 'No active tab' };

      const result = await drawManager!.captureQuickScreenshot(activeTab.webContentsId, activeTab.url);
      return result;
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  // ═══ Voice IPC ═══
  ipcMain.on('voice-transcript', (_event, data: { text: string; isFinal: boolean }) => {
    if (voiceManager) {
      voiceManager.handleTranscript(data.text, data.isFinal);
    }
    eventStream?.handleVoiceInput(data);
  });

  ipcMain.on('voice-status-update', (_event, data: { listening: boolean }) => {
    if (voiceManager) {
      voiceManager.setListening(data.listening);
    }
    eventStream?.handleVoiceStatus(data);
    contextBridge?.setVoiceActive(data.listening);
  });

  // ═══ Activity tracking: webview events from renderer ═══
  ipcMain.on('activity-webview-event', (_event, data: { type: string; url?: string; tabId?: string }) => {
    // Feed into EventStreamManager for SSE
    if (eventStream) {
      const activeTab = tabManager?.getActiveTab();
      eventStream.handleWebviewEvent({ ...data, title: activeTab?.title });
    }
    if (activityTracker) {
      activityTracker.onWebviewEvent(data);
    }
    // Also record in behavioral observer
    if (behaviorObserver && data.type === 'did-navigate' && data.url) {
      behaviorObserver.recordNavigation(data.url, data.tabId);
    }
    // Record history on navigation
    if (historyManager && data.type === 'did-navigate' && data.url) {
      // We'll get the title later on did-finish-load, for now record URL
      historyManager.recordVisit(data.url, '');
    }
    // Update history title on page finish
    if (historyManager && data.type === 'did-finish-load' && data.url) {
      const activeTab2 = tabManager?.getActiveTab();
      if (activeTab2?.title) {
        historyManager.recordVisit(data.url, activeTab2.title);
      }
    }
    // Record site memory on page load completion
    if (siteMemory && data.type === 'did-finish-load' && data.url) {
      const activeTab = tabManager?.getActiveTab();
      if (activeTab) {
        tabManager?.getActiveWebContents().then(wc => {
          if (wc) siteMemory!.recordVisit(wc, data.url!).catch((e) => console.warn('Site memory recordVisit failed:', e.message));
        }).catch((e) => console.warn('Get active webcontents for site memory failed:', e.message));
      }
    }
    // Security: run baseline learning + anomaly detection on page load completion
    if (securityManager && data.type === 'did-finish-load' && data.url) {
      try {
        const domain = new URL(data.url).hostname.toLowerCase();
        if (domain) {
          securityManager.onPageLoaded(domain).catch((e) =>
            console.warn('[Security] onPageLoaded failed:', e.message)
          );
        }
      } catch { /* invalid URL, skip */ }
    }
    // Flush network data when navigating away
    if (networkInspector && data.type === 'did-start-navigation' && data.url) {
      try {
        const prevTab = tabManager?.getActiveTab();
        if (prevTab?.url) {
          const prevDomain = new URL(prevTab.url).hostname;
          if (prevDomain) networkInspector.flushDomain(prevDomain);
        }
      } catch (e: any) { console.warn('Network flush domain parse failed:', e.message); }
    }
    // Track visit end when navigating away
    if (siteMemory && data.type === 'did-start-navigation' && data.url) {
      // End tracking for previous URL
      const activeTab = tabManager?.getActiveTab();
      if (activeTab?.url) siteMemory.trackVisitEnd(activeTab.url);
    }
    // Record context snapshot on page load
    if (contextBridge && data.type === 'did-finish-load' && data.url) {
      const activeTab = tabManager?.getActiveTab();
      if (activeTab) {
        tabManager?.getActiveWebContents().then(wc => {
          if (wc) {
            wc.executeJavaScript(`
              (() => {
                const title = document.title || '';
                const headings = Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 30).map(h => h.textContent?.trim() || '').filter(Boolean);
                const linksCount = document.querySelectorAll('a[href]').length;
                const body = document.body ? document.body.innerText || '' : '';
                return { title, headings, linksCount, body };
              })()
            `).then((pageData: { title: string; headings: string[]; linksCount: number; body: string }) => {
              contextBridge!.recordSnapshot(data.url!, pageData.title, pageData.body, pageData.headings, pageData.linksCount);
            }).catch((e) => console.warn('Context bridge snapshot failed:', e.message));
          }
        }).catch((e) => console.warn('Get active webcontents for context bridge failed:', e.message));
      }
    }
  });

  // ═══ Form submit tracking ═══
  ipcMain.on('form-submitted', (_event, data: { url: string; fields: Array<{ name: string; type: string; id: string; value: string }> }) => {
    if (formMemory && data.url && data.fields) {
      formMemory.recordForm(data.url, data.fields);
    }
    eventStream?.handleFormSubmit({ url: data.url, fields: data.fields });
  });

  // Tab management IPC for renderer shortcuts
  // Bookmark IPC handlers
  ipcMain.handle('bookmark-page', async (_event, url: string, title: string) => {
    if (bookmarkManager) {
      const existing = bookmarkManager.findByUrl(url);
      if (existing) return { ok: true, bookmark: existing, alreadyBookmarked: true };
      const bookmark = bookmarkManager.add(title || url, url);
      return { ok: true, bookmark, alreadyBookmarked: false };
    }
    return { ok: false };
  });

  ipcMain.handle('unbookmark-page', async (_event, url: string) => {
    if (bookmarkManager) {
      const existing = bookmarkManager.findByUrl(url);
      if (existing) {
        bookmarkManager.remove(existing.id);
        return { ok: true };
      }
    }
    return { ok: false };
  });

  ipcMain.handle('is-bookmarked', async (_event, url: string) => {
    return bookmarkManager ? bookmarkManager.isBookmarked(url) : false;
  });

  ipcMain.handle('tab-new', async (_event, url?: string) => {
    const targetUrl = url || `file://${path.join(__dirname, '..', 'shell', 'newtab.html')}`;
    const tab = await tabManager?.openTab(targetUrl);
    if (tab) {
      eventStream?.handleTabEvent('tab-opened', { tabId: tab.id, url: targetUrl });
      activityTracker?.onWebviewEvent({ type: 'tab-open', tabId: tab.id, url: targetUrl, source: 'robin' });
    }
    syncTabsToContext();
    return tab;
  });

  ipcMain.handle('tab-close', async (_event, tabId: string) => {
    // Capture tab info before closing
    const closingTab = tabManager?.getTab(tabId);
    eventStream?.handleTabEvent('tab-closed', { tabId });
    activityTracker?.onWebviewEvent({ type: 'tab-close', tabId, url: closingTab?.url, title: closingTab?.title });
    const result = await tabManager?.closeTab(tabId);
    syncTabsToContext();
    return result;
  });

  ipcMain.handle('tab-focus', async (_event, tabId: string) => {
    if (behaviorObserver) behaviorObserver.recordTabSwitch(tabId);
    const tabs = tabManager?.listTabs() || [];
    const tab = tabs.find(t => t.id === tabId);
    eventStream?.handleTabEvent('tab-focused', { tabId, url: tab?.url, title: tab?.title });
    activityTracker?.onWebviewEvent({ type: 'tab-switch', tabId, url: tab?.url, title: tab?.title });
    const result = await tabManager?.focusTab(tabId);
    syncTabsToContext();
    // Attach CDP to the focused tab directly (avoids race with TabManager active tab state)
    if (tab?.webContentsId) {
      await devToolsManager?.attachToTab(tab.webContentsId).catch(() => {});
      securityManager?.onTabAttached().catch(() => {});
    }
    return result;
  });

  ipcMain.handle('tab-focus-index', async (_event, index: number) => {
    return tabManager?.focusByIndex(index);
  });

  ipcMain.handle('tab-list', async () => {
    return tabManager?.listTabs();
  });

  // ═══ Tab Context Menu — right-click on tab bar ═══
  ipcMain.handle('show-tab-context-menu', async (_event, tabId: string) => {
    contextMenuManager?.showTabContextMenu(tabId);
  });

  // ═══ Emergency Stop — Escape key from renderer ═══
  ipcMain.handle('emergency-stop', async () => {
    if (taskManager) {
      const result = taskManager.emergencyStop();
      if (panelManager) {
        panelManager.addChatMessage('kees', `🛑 Noodrem! ${result.stopped} taken gestopt door Robin.`);
      }
      return result;
    }
    return { stopped: 0 };
  });

  // Navigation IPC handlers
  ipcMain.handle('navigate', async (_event, url: string) => {
    const wc = await tabManager?.getActiveWebContents();
    if (wc) {
      wc.loadURL(url);
      return { success: true };
    }
    return { success: false, error: 'No active tab' };
  });

  ipcMain.handle('go-back', async () => {
    const wc = await tabManager?.getActiveWebContents();
    if (wc && wc.canGoBack()) {
      wc.goBack();
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('go-forward', async () => {
    const wc = await tabManager?.getActiveWebContents();
    if (wc && wc.canGoForward()) {
      wc.goForward();
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('reload', async () => {
    const wc = await tabManager?.getActiveWebContents();
    if (wc) {
      wc.reload();
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('get-page-content', async () => {
    const wc = await tabManager?.getActiveWebContents();
    if (!wc) return { success: false, error: 'No active tab' };

    try {
      const content = await wc.executeJavaScript(`
        document.documentElement.outerHTML
      `);
      return { success: true, content };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('get-page-status', async () => {
    const wc = await tabManager?.getActiveWebContents();
    if (!wc) return { success: false, error: 'No active tab' };

    try {
      const status = await wc.executeJavaScript(`({
        url: window.location.href,
        title: document.title,
        readyState: document.readyState
      })`);
      return { success: true, ...status };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('execute-js', async (_event, code: string) => {
    const wc = await tabManager?.getActiveWebContents();
    if (!wc) return { success: false, error: 'No active tab' };

    try {
      const result = await wc.executeJavaScript(code);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}

function buildAppMenu(): void {
  const send = (action: string) => mainWindow?.webContents.send('shortcut', action);

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => send('open-settings') },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => send('new-tab') },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => send('close-tab') },
        { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: () => {
          tabManager?.reopenClosedTab();
        }},
        { type: 'separator' },
        { label: 'Bookmark Page', accelerator: 'CmdOrCtrl+D', click: () => send('bookmark-page') },
        { label: 'Toggle Bookmarks Bar', accelerator: 'CmdOrCtrl+Shift+B', click: () => send('toggle-bookmarks-bar') },
        { label: 'Bookmark Manager', click: () => send('open-bookmarks') },
        { label: 'Find in Page', accelerator: 'CmdOrCtrl+F', click: () => send('find-in-page') },
        { label: 'History', accelerator: 'CmdOrCtrl+Y', click: () => send('open-history') },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => send('zoom-in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => send('zoom-out') },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: () => send('zoom-reset') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Kees',
      submenu: [
        { label: 'Toggle Panel', accelerator: 'CmdOrCtrl+K', click: () => {
          panelManager?.togglePanel();
        }},
        { label: 'Voice Input', accelerator: 'CmdOrCtrl+Shift+M', click: () => voiceManager?.toggleVoice() },
        { label: 'PiP Mode', accelerator: 'CmdOrCtrl+Shift+P', click: () => pipManager?.toggle() },
        { type: 'separator' },
        { label: 'Draw Mode', accelerator: 'CmdOrCtrl+Shift+D', click: () => drawManager?.toggleDrawMode() },
        { label: 'Quick Screenshot', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('quick-screenshot') },
        { type: 'separator' },
        { label: 'Record Tab Audio', accelerator: 'CmdOrCtrl+R', click: () => {
          if (audioCaptureManager) {
            if (audioCaptureManager.isRecording()) {
              audioCaptureManager.stopRecording();
              mainWindow?.webContents.send('audio-recording-status', { recording: false });
            } else {
              const activeTab = tabManager?.getActiveTab();
              if (activeTab) {
                audioCaptureManager.startRecording(activeTab.webContentsId).then(() => {
                  mainWindow?.webContents.send('audio-recording-status', { recording: true });
                }).catch((e) => console.warn('Audio capture start failed:', e.message));
              }
            }
          }
        }},
        { label: 'ClaroNote Record', accelerator: 'CmdOrCtrl+Shift+C', click: () => send('claronote-record') },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+Shift+/', click: () => send('show-shortcuts') },
        { type: 'separator' },
        { label: 'Show Onboarding', click: () => send('show-onboarding') },
      ],
    },
  ];

  // Add Cmd+1-9 tab switching (hidden menu items)
  const tabSwitchItems: Electron.MenuItemConstructorOptions[] = [];
  for (let i = 1; i <= 9; i++) {
    tabSwitchItems.push({
      label: `Tab ${i}`,
      accelerator: `CmdOrCtrl+${i}`,
      visible: false,
      click: () => send(`focus-tab-${i - 1}`),
    });
  }
  (template[1].submenu as Electron.MenuItemConstructorOptions[]).push(
    { type: 'separator' },
    ...tabSwitchItems
  );

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Copilot alert — notify Robin when Kees needs help
export function copilotAlert(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title: `🧀 ${title}`, body }).show();
  }
  mainWindow?.webContents.send('copilot-alert', { title, body });
}

app.whenReady().then(async () => {
  const win = await createWindow();
  await startAPI(win);
  buildAppMenu();

  // Keep shortcuts always registered while app is running
  // (blur/focus approach broke shortcuts when webview had focus)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().then(w => {
        startAPI(w);
        buildAppMenu();
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
