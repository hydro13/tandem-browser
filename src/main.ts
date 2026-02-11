import { app, BrowserWindow, session, ipcMain, Notification, globalShortcut, clipboard, nativeImage, webContents, Menu } from 'electron';
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

async function createWindow(): Promise<BrowserWindow> {
  const partition = 'persist:tandem';
  const ses = session.fromPartition(partition);

  const stealth = new StealthManager(ses, partition);
  await stealth.apply();

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
  panelManager = new PanelManager(win);
  drawManager = new DrawOverlayManager(win);
  activityTracker = new ActivityTracker(win, panelManager, drawManager);
  voiceManager = new VoiceManager(win, panelManager);
  behaviorObserver = new BehaviorObserver(win);
  siteMemory = new SiteMemoryManager();
  watchManager = new WatchManager();
  headlessManager = new HeadlessManager();
  formMemory = new FormMemoryManager();
  contextBridge = new ContextBridge();
  pipManager = new PiPManager();
  networkInspector = new NetworkInspector();
  chromeImporter = new ChromeImporter();
  bookmarkManager = new BookmarkManager();
  historyManager = new HistoryManager();
  downloadManager = new DownloadManager();
  audioCaptureManager = new AudioCaptureManager();
  extensionLoader = new ExtensionLoader();
  claroNoteManager = new ClaroNoteManager();

  // Hook download manager into session
  const partition = 'persist:tandem';
  const ses = session.fromPartition(partition);
  downloadManager.hookSession(ses, win);

  // Load extensions from ~/.tandem/extensions/
  extensionLoader.loadAllExtensions(ses).catch((err) => {
    console.warn('⚠️ Failed to load some extensions:', err);
  });

  api = new TandemAPI(win, API_PORT, tabManager, panelManager, drawManager, activityTracker, voiceManager, behaviorObserver, configManager, siteMemory, watchManager, headlessManager, formMemory, contextBridge, pipManager, networkInspector, chromeImporter, bookmarkManager, historyManager, downloadManager, audioCaptureManager, extensionLoader, claroNoteManager);
  await api.start();
  console.log(`🧠 Tandem API running on http://localhost:${API_PORT}`);

  // Listen for tab metadata updates from renderer
  ipcMain.on('tab-update', (_event, data: { tabId: string; title?: string; url?: string; favicon?: string }) => {
    tabManager?.updateTab(data.tabId, data);
  });

  // Listen for initial tab registration
  ipcMain.on('tab-register', (_event, data: { webContentsId: number; url: string }) => {
    if (tabManager && tabManager.count === 0) {
      const tab = tabManager.registerInitialTab(data.webContentsId, data.url);
      // Notify renderer of the tab ID
      win.webContents.send('tab-registered', { tabId: tab.id });
    }
  });

  // ═══ Chat IPC — Robin sends messages from renderer ═══
  ipcMain.on('chat-send', (_event, text: string) => {
    if (text && panelManager) {
      panelManager.addChatMessage('robin', text);
    }
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
  });

  ipcMain.on('voice-status-update', (_event, data: { listening: boolean }) => {
    if (voiceManager) {
      voiceManager.setListening(data.listening);
    }
  });

  // ═══ Activity tracking: webview events from renderer ═══
  ipcMain.on('activity-webview-event', (_event, data: { type: string; url?: string; tabId?: string }) => {
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
    // Flush network data when navigating away
    if (networkInspector && data.type === 'did-start-navigation' && data.url) {
      try {
        const prevTab = tabManager?.getActiveTab();
        if (prevTab?.url) {
          const prevDomain = new URL(prevTab.url).hostname;
          if (prevDomain) networkInspector.flushDomain(prevDomain);
        }
      } catch { /* ignore */ }
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

  ipcMain.handle('tab-new', async () => {
    const newtabPath = `file://${path.join(__dirname, '..', 'shell', 'newtab.html')}`;
    return tabManager?.openTab(newtabPath);
  });

  ipcMain.handle('tab-close', async (_event, tabId: string) => {
    return tabManager?.closeTab(tabId);
  });

  ipcMain.handle('tab-focus', async (_event, tabId: string) => {
    if (behaviorObserver) behaviorObserver.recordTabSwitch(tabId);
    return tabManager?.focusTab(tabId);
  });

  ipcMain.handle('tab-focus-index', async (_event, index: number) => {
    return tabManager?.focusByIndex(index);
  });

  ipcMain.handle('tab-list', async () => {
    return tabManager?.listTabs();
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
        { type: 'separator' },
        { label: 'Bookmark Page', accelerator: 'CmdOrCtrl+D', click: () => send('bookmark-page') },
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
          // Also directly toggle via shell JS as fallback (IPC may not reach shell)
          mainWindow?.webContents.executeJavaScript(`
            const p = document.getElementById('kees-panel');
            if (p) p.classList.toggle('open');
          `).catch(() => {});
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
