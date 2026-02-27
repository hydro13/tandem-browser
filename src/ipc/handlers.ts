import { ipcMain, BrowserWindow } from 'electron';
import path from 'path';
import { TabManager } from '../tabs/manager';
import { PanelManager } from '../panel/manager';
import { DrawOverlayManager } from '../draw/overlay';
import { VoiceManager } from '../voice/recognition';
import { BehaviorObserver } from '../behavior/observer';
import { SiteMemoryManager } from '../memory/site-memory';
import { FormMemoryManager } from '../memory/form-memory';
import { ContextBridge } from '../bridge/context-bridge';
import { NetworkInspector } from '../network/inspector';
import { BookmarkManager } from '../bookmarks/manager';
import { HistoryManager } from '../history/manager';
import { EventStreamManager } from '../events/stream';
import { TaskManager } from '../agents/task-manager';
import { ContextMenuManager } from '../context-menu/manager';
import { DevToolsManager } from '../devtools/manager';
import { ActivityTracker } from '../activity/tracker';
import { SecurityManager } from '../security/security-manager';
import { ScriptInjector } from '../scripts/injector';
import { DeviceEmulator } from '../device/emulator';
import { CopilotStream } from '../activity/copilot-stream';
import { SnapshotManager } from '../snapshot/manager';

export interface IpcDeps {
  win: BrowserWindow;
  tabManager: TabManager;
  panelManager: PanelManager;
  drawManager: DrawOverlayManager;
  voiceManager: VoiceManager;
  behaviorObserver: BehaviorObserver;
  siteMemory: SiteMemoryManager;
  formMemory: FormMemoryManager;
  contextBridge: ContextBridge;
  networkInspector: NetworkInspector;
  bookmarkManager: BookmarkManager;
  historyManager: HistoryManager;
  eventStream: EventStreamManager;
  taskManager: TaskManager;
  contextMenuManager: ContextMenuManager;
  devToolsManager: DevToolsManager;
  activityTracker: ActivityTracker;
  securityManager: SecurityManager | null;
  scriptInjector: ScriptInjector;
  deviceEmulator: DeviceEmulator;
  copilotStream: CopilotStream;
  snapshotManager: SnapshotManager;
}

/** Sync tab list into ContextBridge for live context summary */
export function syncTabsToContext(tabManager: TabManager, contextBridge: ContextBridge): void {
  contextBridge.updateTabs(tabManager.listTabs());
}

export function registerIpcHandlers(deps: IpcDeps): void {
  const {
    win, tabManager, panelManager, drawManager, voiceManager,
    behaviorObserver, siteMemory, formMemory, contextBridge,
    networkInspector, bookmarkManager, historyManager, eventStream,
    taskManager, contextMenuManager, devToolsManager, activityTracker,
    securityManager, scriptInjector, deviceEmulator, copilotStream,
    snapshotManager,
  } = deps;

  // ═══ IPC Handler Cleanup — prevent duplicates on macOS reactivation ═══
  const ipcChannels = ['tab-update', 'chat-send', 'voice-transcript', 'voice-status-update', 'activity-webview-event', 'form-submitted'];
  for (const channel of ipcChannels) {
    ipcMain.removeAllListeners(channel);
  }
  const ipcHandlers = ['snap-for-copilot', 'quick-screenshot', 'bookmark-page', 'unbookmark-page', 'is-bookmarked', 'tab-new', 'tab-close', 'tab-focus', 'tab-focus-index', 'tab-list', 'emergency-stop', 'show-tab-context-menu', 'chat-send-image', 'navigate', 'go-back', 'go-forward', 'reload', 'get-page-content', 'get-page-status', 'execute-js'];
  for (const handler of ipcHandlers) {
    try { ipcMain.removeHandler(handler); } catch { /* handler may not exist yet */ }
  }

  // Listen for tab metadata updates from renderer
  ipcMain.on('tab-update', (_event, data: { tabId: string; title?: string; url?: string; favicon?: string }) => {
    tabManager.updateTab(data.tabId, data);
    eventStream.handleTabEvent('tab-updated', { tabId: data.tabId, url: data.url, title: data.title });
    syncTabsToContext(tabManager, contextBridge);
  });

  // ═══ Chat IPC — Robin sends messages from renderer ═══
  ipcMain.on('chat-send', (_event, text: string) => {
    if (text) {
      panelManager.addChatMessage('robin', text);
    }
  });

  // ═══ Chat Image IPC — Robin pastes image from clipboard ═══
  ipcMain.handle('chat-send-image', async (_event, data: { text: string; image: string }) => {
    const filename = panelManager.saveImage(data.image);
    const msg = panelManager.addChatMessage('robin', data.text || '', filename);
    return { ok: true, message: msg };
  });

  // ═══ Screenshot Snap — composites webview + canvas, saves + clipboard ═══
  ipcMain.handle('snap-for-copilot', async () => {
    try {
      const activeTab = tabManager.getActiveTab();
      if (!activeTab) return { ok: false, error: 'No active tab' };

      const result = await drawManager.captureAnnotatedFull(activeTab.webContentsId, activeTab.url);
      return result;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // ═══ Quick Screenshot (no draw mode) ═══
  ipcMain.handle('quick-screenshot', async () => {
    try {
      const activeTab = tabManager.getActiveTab();
      if (!activeTab) return { ok: false, error: 'No active tab' };

      const result = await drawManager.captureQuickScreenshot(activeTab.webContentsId, activeTab.url);
      return result;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // ═══ Voice IPC ═══
  ipcMain.on('voice-transcript', (_event, data: { text: string; isFinal: boolean }) => {
    voiceManager.handleTranscript(data.text, data.isFinal);
    eventStream.handleVoiceInput(data);
  });

  ipcMain.on('voice-status-update', (_event, data: { listening: boolean }) => {
    voiceManager.setListening(data.listening);
    eventStream.handleVoiceStatus(data);
    contextBridge.setVoiceActive(data.listening);
  });

  // ═══ Activity tracking: webview events from renderer ═══
  ipcMain.on('activity-webview-event', (_event, data: { type: string; url?: string; tabId?: string }) => {
    // Feed into EventStreamManager for SSE
    const activeTab = tabManager.getActiveTab();
    eventStream.handleWebviewEvent({ ...data, title: activeTab?.title });

    activityTracker.onWebviewEvent(data);

    // Also record in behavioral observer
    if (data.type === 'did-navigate' && data.url) {
      behaviorObserver.recordNavigation(data.url, data.tabId);
    }
    // Record history on navigation
    if (data.type === 'did-navigate' && data.url) {
      // We'll get the title later on did-finish-load, for now record URL
      historyManager.recordVisit(data.url, '');
    }
    // Update history title on page finish
    if (data.type === 'did-finish-load' && data.url) {
      const activeTab2 = tabManager.getActiveTab();
      if (activeTab2?.title) {
        historyManager.recordVisit(data.url, activeTab2.title);
      }
    }
    // Record site memory on page load completion
    if (data.type === 'did-finish-load' && data.url) {
      const activeTabForSiteMem = tabManager.getActiveTab();
      if (activeTabForSiteMem) {
        tabManager.getActiveWebContents().then(wc => {
          if (wc) siteMemory.recordVisit(wc, data.url!).catch((e) => console.warn('Site memory recordVisit failed:', e.message));
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
    // Re-inject persistent scripts, styles, and device emulation after page load
    if (data.type === 'did-finish-load') {
      tabManager.getActiveWebContents().then(wc => {
        if (wc && !wc.isDestroyed()) {
          scriptInjector.reloadIntoTab(wc).catch((e) =>
            console.warn('[ScriptInjector] reloadIntoTab failed:', e.message)
          );
          deviceEmulator.reloadIntoTab(wc).catch((e) =>
            console.warn('[DeviceEmulator] reloadIntoTab failed:', e.message)
          );
        }
      }).catch(() => {});
    }
    // Flush network data when navigating away
    if (data.type === 'did-start-navigation' && data.url) {
      try {
        const prevTab = tabManager.getActiveTab();
        if (prevTab?.url) {
          const prevDomain = new URL(prevTab.url).hostname;
          if (prevDomain) networkInspector.flushDomain(prevDomain);
        }
      } catch (e) { console.warn('Network flush domain parse failed:', e instanceof Error ? e.message : String(e)); }
    }
    // Track visit end when navigating away
    if (data.type === 'did-start-navigation' && data.url) {
      // End tracking for previous URL
      const activeTabNav = tabManager.getActiveTab();
      if (activeTabNav?.url) siteMemory.trackVisitEnd(activeTabNav.url);
    }
    // Record context snapshot on page load
    if (data.type === 'did-finish-load' && data.url) {
      const activeTabCtx = tabManager.getActiveTab();
      if (activeTabCtx) {
        tabManager.getActiveWebContents().then(wc => {
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
              contextBridge.recordSnapshot(data.url!, pageData.title, pageData.body, pageData.headings, pageData.linksCount);
            }).catch((e) => console.warn('Context bridge snapshot failed:', e.message));
          }
        }).catch((e) => console.warn('Get active webcontents for context bridge failed:', e.message));
      }
    }
  });

  // ═══ Form submit tracking ═══
  ipcMain.on('form-submitted', (_event, data: { url: string; fields: Array<{ name: string; type: string; id: string; value: string }> }) => {
    if (data.url && data.fields) {
      formMemory.recordForm(data.url, data.fields);
    }
    eventStream.handleFormSubmit({ url: data.url, fields: data.fields });
  });

  // Tab management IPC for renderer shortcuts
  // Bookmark IPC handlers
  ipcMain.handle('bookmark-page', async (_event, url: string, title: string) => {
    const existing = bookmarkManager.findByUrl(url);
    if (existing) return { ok: true, bookmark: existing, alreadyBookmarked: true };
    const bookmark = bookmarkManager.add(title || url, url);
    return { ok: true, bookmark, alreadyBookmarked: false };
  });

  ipcMain.handle('unbookmark-page', async (_event, url: string) => {
    const existing = bookmarkManager.findByUrl(url);
    if (existing) {
      bookmarkManager.remove(existing.id);
      return { ok: true };
    }
    return { ok: false };
  });

  ipcMain.handle('is-bookmarked', async (_event, url: string) => {
    return bookmarkManager.isBookmarked(url);
  });

  ipcMain.handle('tab-new', async (_event, url?: string) => {
    const targetUrl = url || `file://${path.join(__dirname, '..', 'shell', 'newtab.html')}`;
    const tab = await tabManager.openTab(targetUrl);
    if (tab) {
      eventStream.handleTabEvent('tab-opened', { tabId: tab.id, url: targetUrl });
      activityTracker.onWebviewEvent({ type: 'tab-open', tabId: tab.id, url: targetUrl, source: 'robin' });
    }
    syncTabsToContext(tabManager, contextBridge);
    return tab;
  });

  ipcMain.handle('tab-close', async (_event, tabId: string) => {
    // Capture tab info before closing
    const closingTab = tabManager.getTab(tabId);
    eventStream.handleTabEvent('tab-closed', { tabId });
    activityTracker.onWebviewEvent({ type: 'tab-close', tabId, url: closingTab?.url, title: closingTab?.title });
    const result = await tabManager.closeTab(tabId);
    syncTabsToContext(tabManager, contextBridge);
    return result;
  });

  ipcMain.handle('tab-focus', async (_event, tabId: string) => {
    behaviorObserver.recordTabSwitch(tabId);
    const tabs = tabManager.listTabs();
    const tab = tabs.find(t => t.id === tabId);
    eventStream.handleTabEvent('tab-focused', { tabId, url: tab?.url, title: tab?.title });
    activityTracker.onWebviewEvent({ type: 'tab-switch', tabId, url: tab?.url, title: tab?.title });
    const result = await tabManager.focusTab(tabId);
    syncTabsToContext(tabManager, contextBridge);
    // Attach CDP to the focused tab directly (avoids race with TabManager active tab state)
    if (tab?.webContentsId) {
      await devToolsManager.attachToTab(tab.webContentsId).catch(() => {});
      securityManager?.onTabAttached().catch(() => {});
    }
    return result;
  });

  ipcMain.handle('tab-focus-index', async (_event, index: number) => {
    return tabManager.focusByIndex(index);
  });

  ipcMain.handle('tab-list', async () => {
    return tabManager.listTabs();
  });

  // ═══ Tab Context Menu — right-click on tab bar ═══
  ipcMain.handle('show-tab-context-menu', async (_event, tabId: string) => {
    contextMenuManager.showTabContextMenu(tabId);
  });

  // ═══ Emergency Stop — Escape key from renderer ═══
  ipcMain.handle('emergency-stop', async () => {
    const result = taskManager.emergencyStop();
    panelManager.addChatMessage('copilot', `🛑 Emergency stop! ${result.stopped} tasks stopped.`);
    return result;
  });

  // Navigation IPC handlers
  ipcMain.handle('navigate', async (_event, url: string) => {
    const wc = await tabManager.getActiveWebContents();
    if (wc) {
      wc.loadURL(url);
      return { success: true };
    }
    return { success: false, error: 'No active tab' };
  });

  ipcMain.handle('go-back', async () => {
    const wc = await tabManager.getActiveWebContents();
    if (wc && wc.canGoBack()) {
      wc.goBack();
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('go-forward', async () => {
    const wc = await tabManager.getActiveWebContents();
    if (wc && wc.canGoForward()) {
      wc.goForward();
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('reload', async () => {
    const wc = await tabManager.getActiveWebContents();
    if (wc) {
      wc.reload();
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('get-page-content', async () => {
    const wc = await tabManager.getActiveWebContents();
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
    const wc = await tabManager.getActiveWebContents();
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
    const wc = await tabManager.getActiveWebContents();
    if (!wc) return { success: false, error: 'No active tab' };

    try {
      const result = await wc.executeJavaScript(code);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
