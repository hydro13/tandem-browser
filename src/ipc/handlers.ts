import { desktopCapturer, ipcMain, Menu } from 'electron';
import fs from 'fs';
import path from 'path';
import type { BrowserWindow } from 'electron';
import type { TabManager } from '../tabs/manager';
import type { PanelManager } from '../panel/manager';
import type { DrawOverlayManager } from '../draw/overlay';
import type { VoiceManager } from '../voice/recognition';
import type { BehaviorObserver } from '../behavior/observer';
import type { SiteMemoryManager } from '../memory/site-memory';
import type { FormMemoryManager } from '../memory/form-memory';
import type { ContextBridge } from '../bridge/context-bridge';
import type { NetworkInspector } from '../network/inspector';
import type { BookmarkManager } from '../bookmarks/manager';
import type { HistoryManager } from '../history/manager';
import type { EventStreamManager } from '../events/stream';
import type { TaskManager } from '../agents/task-manager';
import type { ContextMenuManager } from '../context-menu/manager';
import type { DevToolsManager } from '../devtools/manager';
import type { ActivityTracker } from '../activity/tracker';
import type { SecurityManager } from '../security/security-manager';
import type { ScriptInjector } from '../scripts/injector';
import type { DeviceEmulator } from '../device/emulator';
import type { WingmanStream } from '../activity/wingman-stream';
import type { SnapshotManager } from '../snapshot/manager';
import type { VideoRecorderManager } from '../video/recorder';
import { tandemDir } from '../utils/paths';
import { createLogger } from '../utils/logger';
import { IpcChannels } from '../shared/ipc-channels';

const log = createLogger('IpcHandlers');

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
  wingmanStream: WingmanStream;
  snapshotManager: SnapshotManager;
  videoRecorderManager: VideoRecorderManager;
}

/** Sync tab list into ContextBridge for live context summary */
export function syncTabsToContext(tabManager: TabManager, contextBridge: ContextBridge): void {
  contextBridge.updateTabs(tabManager.listTabs());
}

export function registerIpcHandlers(deps: IpcDeps): void {
  const {
    win: _win, tabManager, panelManager, drawManager, voiceManager,
    behaviorObserver, siteMemory, formMemory, contextBridge,
    networkInspector, bookmarkManager, historyManager, eventStream,
    taskManager, contextMenuManager, devToolsManager, activityTracker,
    securityManager, scriptInjector, deviceEmulator, wingmanStream: _wingmanStream,
    snapshotManager: _snapshotManager,
    videoRecorderManager,
  } = deps;

  // ═══ IPC Handler Cleanup — prevent duplicates on macOS reactivation ═══
  const ipcChannels = [
    IpcChannels.TAB_UPDATE,
    IpcChannels.CHAT_SEND,
    IpcChannels.CHAT_SEND_LEGACY,
    IpcChannels.VOICE_TRANSCRIPT,
    IpcChannels.VOICE_STATUS_UPDATE,
    IpcChannels.ACTIVITY_WEBVIEW_EVENT,
    IpcChannels.FORM_SUBMITTED,
    IpcChannels.SHOW_APP_MENU,
    IpcChannels.WINDOW_MINIMIZE,
    IpcChannels.WINDOW_MAXIMIZE,
    IpcChannels.WINDOW_CLOSE,
    IpcChannels.SHOW_SCREENSHOT_MENU,
    IpcChannels.RECORDING_CHUNK,
  ];
  for (const channel of ipcChannels) {
    ipcMain.removeAllListeners(channel);
  }
  const ipcHandlers = [
    IpcChannels.SNAP_FOR_WINGMAN,
    IpcChannels.QUICK_SCREENSHOT,
    IpcChannels.SHOW_SCREENSHOT_MENU,
    IpcChannels.BOOKMARK_PAGE,
    IpcChannels.UNBOOKMARK_PAGE,
    IpcChannels.IS_BOOKMARKED,
    IpcChannels.TAB_NEW,
    IpcChannels.TAB_CLOSE,
    IpcChannels.TAB_FOCUS,
    IpcChannels.TAB_FOCUS_INDEX,
    IpcChannels.TAB_LIST,
    IpcChannels.EMERGENCY_STOP,
    IpcChannels.SHOW_TAB_CONTEXT_MENU,
    IpcChannels.CHAT_SEND_IMAGE,
    IpcChannels.CHAT_PERSIST_MESSAGE,
    IpcChannels.NAVIGATE,
    IpcChannels.GO_BACK,
    IpcChannels.GO_FORWARD,
    IpcChannels.RELOAD,
    IpcChannels.GET_PAGE_CONTENT,
    IpcChannels.GET_PAGE_STATUS,
    IpcChannels.EXECUTE_JS,
    IpcChannels.GET_API_TOKEN,
    IpcChannels.IS_WINDOW_MAXIMIZED,
    IpcChannels.START_RECORDING,
    IpcChannels.STOP_RECORDING,
    IpcChannels.GET_DESKTOP_SOURCE,
  ];
  for (const handler of ipcHandlers) {
    try { ipcMain.removeHandler(handler); } catch { /* handler may not exist yet */ }
  }

  // Listen for tab metadata updates from renderer
  ipcMain.on(IpcChannels.TAB_UPDATE, (_event, data: { tabId: string; title?: string; url?: string; favicon?: string }) => {
    tabManager.updateTab(data.tabId, data);
    eventStream.handleTabEvent('tab-updated', { tabId: data.tabId, url: data.url, title: data.title });
    syncTabsToContext(tabManager, contextBridge);
  });

  // ═══ Chat IPC — User sends messages from renderer ═══
  ipcMain.on(IpcChannels.CHAT_SEND, (_event, text: string) => {
    if (text) {
      panelManager.addChatMessage('user',text);
    }
  });

  // Legacy webhook-based path kept as a fallback during OpenClaw chat migration.
  ipcMain.on(IpcChannels.CHAT_SEND_LEGACY, (_event, text: string) => {
    if (text) {
      panelManager.addChatMessage('user',text);
    }
  });

  // ═══ Chat Image IPC — User pastes image from clipboard ═══
  ipcMain.handle(IpcChannels.CHAT_SEND_IMAGE, async (_event, data: { text: string; image: string }) => {
    const filename = panelManager.saveImage(data.image);
    const msg = panelManager.addChatMessage('user',data.text || '', filename);
    return { ok: true, message: msg };
  });

  ipcMain.handle(IpcChannels.CHAT_PERSIST_MESSAGE, async (_event, data: {
    from: 'user' | 'wingman' | 'claude';
    text?: string;
    image?: string;
    notifyWebhook?: boolean;
  }) => {
    const text = typeof data?.text === 'string' ? data.text : '';
    const image = typeof data?.image === 'string' ? data.image : undefined;
    if (!text && !image) {
      return { ok: false, error: 'text or image required' };
    }

    const savedImage = image?.startsWith('data:image/')
      ? panelManager.saveImage(image)
      : image;
    const msg = panelManager.addChatMessage(
      data.from,
      text,
      savedImage,
      {
        notifyWebhook: data.notifyWebhook,
        emitIpc: false,
      },
    );
    return { ok: true, message: msg };
  });

  // ═══ Screenshot Snap — composites webview + canvas, saves + clipboard ═══
  ipcMain.handle(IpcChannels.SNAP_FOR_WINGMAN, async () => {
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
  ipcMain.handle(IpcChannels.QUICK_SCREENSHOT, async () => {
    try {
      const activeTab = tabManager.getActiveTab();
      if (!activeTab) return { ok: false, error: 'No active tab' };

      const result = await drawManager.captureQuickScreenshot(activeTab.webContentsId, activeTab.url);
      return result;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle(IpcChannels.CAPTURE_SCREENSHOT, async (_event, data: {
    mode: 'page' | 'application' | 'region';
    region?: { x: number; y: number; width: number; height: number };
  }) => {
    try {
      const activeTab = tabManager.getActiveTab();
      const currentUrl = activeTab?.url || 'tandem://window';

      if (data.mode === 'application') {
        return await drawManager.captureApplicationScreenshot(currentUrl);
      }

      if (data.mode === 'region') {
        if (!data.region) {
          return { ok: false, error: 'Region is required' };
        }
        return await drawManager.captureRegionScreenshot(data.region, currentUrl);
      }

      if (!activeTab) {
        return { ok: false, error: 'No active tab' };
      }

      return await drawManager.captureQuickScreenshot(activeTab.webContentsId, activeTab.url);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle(IpcChannels.SHOW_SCREENSHOT_MENU, async (_event, anchor: { x?: number; y?: number }) => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Web Page',
        click: () => _win.webContents.send(IpcChannels.SCREENSHOT_MODE_SELECTED, 'page'),
      },
      {
        label: 'Application',
        click: () => _win.webContents.send(IpcChannels.SCREENSHOT_MODE_SELECTED, 'application'),
      },
      {
        label: 'Region',
        click: () => _win.webContents.send(IpcChannels.SCREENSHOT_MODE_SELECTED, 'region'),
      },
      { type: 'separator' },
      {
        label: 'Record Application',
        click: () => _win.webContents.send(IpcChannels.RECORDING_MODE_SELECTED, 'application'),
      },
      {
        label: 'Record Region',
        click: () => _win.webContents.send(IpcChannels.RECORDING_MODE_SELECTED, 'region'),
      },
    ]);

    menu.popup({
      window: _win,
      x: typeof anchor?.x === 'number' ? anchor.x : undefined,
      y: typeof anchor?.y === 'number' ? anchor.y : undefined,
    });

    return { ok: true };
  });

  // ═══ Recording IPC ═══
  ipcMain.handle(IpcChannels.START_RECORDING, async (_event, data: {
    mode: 'application' | 'region';
    region?: { x: number; y: number; width: number; height: number };
  }) => {
    return videoRecorderManager.startRecording(data.mode, data.region);
  });

  ipcMain.on(IpcChannels.RECORDING_CHUNK, (_event, data: ArrayBuffer) => {
    videoRecorderManager.writeChunk(Buffer.from(data));
  });

  ipcMain.handle(IpcChannels.STOP_RECORDING, async () => {
    const result = await videoRecorderManager.stopRecording();
    if (result.ok && result.recording) {
      _win.webContents.send(IpcChannels.RECORDING_FINISHED, {
        path: result.recording.filePath,
        filename: result.recording.filename,
        duration: result.recording.duration,
      });
    }
    return result;
  });

  // ═══ Native Speech Transcription (Apple Speech / Whisper) ═══
  ipcMain.handle(IpcChannels.TRANSCRIBE_AUDIO, async (_event, data: { buffer: ArrayBuffer; language?: string }) => {
    const { transcribeAudio } = await import('../voice/speech-transcriber');
    const buffer = Buffer.from(data.buffer);
    const language = data.language || 'nl-BE';
    return transcribeAudio(buffer, language);
  });

  ipcMain.handle(IpcChannels.GET_SPEECH_BACKEND, async () => {
    const { detectBackend } = await import('../voice/speech-transcriber');
    return { backend: detectBackend() };
  });



  // ═══ Microphone Permission Request ═══
  ipcMain.handle(IpcChannels.REQUEST_MIC_PERMISSION, async () => {
    if (process.platform !== 'darwin') return { granted: true };
    const { systemPreferences } = require('electron');
    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status === 'granted') return { granted: true };
    if (status === 'denied') return { granted: false, status: 'denied' };
    // 'not-determined' — ask
    const granted = await systemPreferences.askForMediaAccess('microphone');
    return { granted };
  });

  // ═══ Desktop Source for Renderer Video Capture ═══
  ipcMain.handle(IpcChannels.GET_DESKTOP_SOURCE, async () => {
    try {
      // On macOS, check Screen Recording permission before attempting capture
      if (process.platform === 'darwin') {
        const { systemPreferences } = require('electron');
        const status = systemPreferences.getMediaAccessStatus('screen');
        if (status !== 'granted') {
          log.warn(`Screen Recording permission not granted (status: ${status})`);
          return { error: 'screen-permission-denied' };
        }
      }
      // Get window source for video
      const windowSources = await desktopCapturer.getSources({ types: ['window'], fetchWindowIcons: false });
      const tandemSource = windowSources.find((s: Electron.DesktopCapturerSource) => s.name.includes('Tandem')) || windowSources[0];

      // Get screen source for audio (window sources don't include audio on macOS)
      // This is optional - don't let it block recording if it fails
      let audioSourceId: string | null = null;
      try {
        const screenSources = await desktopCapturer.getSources({ types: ['screen'], fetchWindowIcons: false });
        audioSourceId = screenSources[0]?.id || null;
      } catch (err) {
        log.warn('Failed to get screen source for audio:', err instanceof Error ? err.message : err);
      }

      return tandemSource ? {
        id: tandemSource.id,
        name: tandemSource.name,
        audioSourceId,
      } : null;
    } catch (error) {
      log.warn('Failed to get desktop sources:', error instanceof Error ? error.message : error);
      return null;
    }
  });

  // ═══ Voice IPC ═══
  ipcMain.on(IpcChannels.VOICE_TRANSCRIPT, (_event, data: { text: string; isFinal: boolean }) => {
    voiceManager.handleTranscript(data.text, data.isFinal);
    eventStream.handleVoiceInput(data);
  });

  ipcMain.on(IpcChannels.VOICE_STATUS_UPDATE, (_event, data: { listening: boolean }) => {
    voiceManager.setListening(data.listening);
    eventStream.handleVoiceStatus(data);
    contextBridge.setVoiceActive(data.listening);
  });

  // ═══ Activity tracking: webview events from renderer ═══
  ipcMain.on(IpcChannels.ACTIVITY_WEBVIEW_EVENT, (_event, data: { type: string; url?: string; tabId?: string }) => {
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
          if (wc) siteMemory.recordVisit(wc, data.url!).catch((e) => log.warn('Site memory recordVisit failed:', e.message));
        }).catch((e) => log.warn('Get active webcontents for site memory failed:', e.message));
      }
    }
    // Security: run baseline learning + anomaly detection on page load completion
    if (securityManager && data.type === 'did-finish-load' && data.url) {
      try {
        const domain = new URL(data.url).hostname.toLowerCase();
        if (domain) {
          securityManager.onPageLoaded(domain).catch((e) =>
            log.warn('onPageLoaded failed:', e.message)
          );
        }
      } catch { /* invalid URL, skip */ }
    }
    // Re-inject persistent scripts, styles, and device emulation after page load
    if (data.type === 'did-finish-load') {
      tabManager.getActiveWebContents().then(wc => {
        if (wc && !wc.isDestroyed()) {
          scriptInjector.reloadIntoTab(wc).catch((e) =>
            log.warn('reloadIntoTab failed:', e.message)
          );
          deviceEmulator.reloadIntoTab(wc).catch((e) =>
            log.warn('reloadIntoTab failed:', e.message)
          );
        }
      }).catch(e => log.warn('getActiveWebContents for script/emulator reload failed:', e instanceof Error ? e.message : e));
    }
    // Flush network data when navigating away
    if (data.type === 'did-start-navigation' && data.url) {
      try {
        const prevTab = tabManager.getActiveTab();
        if (prevTab?.url) {
          const prevDomain = new URL(prevTab.url).hostname;
          if (prevDomain) networkInspector.flushDomain(prevDomain);
        }
      } catch (e) { log.warn('Network flush domain parse failed:', e instanceof Error ? e.message : String(e)); }
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
            }).catch((e) => log.warn('Context bridge snapshot failed:', e.message));
          }
        }).catch((e) => log.warn('Get active webcontents for context bridge failed:', e.message));
      }
    }
  });

  // ═══ Form submit tracking ═══
  ipcMain.on(IpcChannels.FORM_SUBMITTED, (_event, data: { url: string; fields: Array<{ name: string; type: string; id: string; value: string }> }) => {
    if (data.url && data.fields) {
      formMemory.recordForm(data.url, data.fields);
    }
    eventStream.handleFormSubmit({ url: data.url, fields: data.fields });
  });

  // Tab management IPC for renderer shortcuts
  // Bookmark IPC handlers
  ipcMain.handle(IpcChannels.BOOKMARK_PAGE, async (_event, url: string, title: string) => {
    const existing = bookmarkManager.findByUrl(url);
    if (existing) return { ok: true, bookmark: existing, alreadyBookmarked: true };
    const bookmark = bookmarkManager.add(title || url, url);
    return { ok: true, bookmark, alreadyBookmarked: false };
  });

  ipcMain.handle(IpcChannels.UNBOOKMARK_PAGE, async (_event, url: string) => {
    const existing = bookmarkManager.findByUrl(url);
    if (existing) {
      bookmarkManager.remove(existing.id);
      return { ok: true };
    }
    return { ok: false };
  });

  ipcMain.handle(IpcChannels.IS_BOOKMARKED, async (_event, url: string) => {
    return bookmarkManager.isBookmarked(url);
  });

  ipcMain.handle(IpcChannels.TAB_NEW, async (_event, url?: string) => {
    const targetUrl = url || `file://${path.join(__dirname, '..', '..', 'shell', 'newtab.html')}`;
    const tab = await tabManager.openTab(targetUrl);
    if (tab) {
      eventStream.handleTabEvent('tab-opened', { tabId: tab.id, url: targetUrl });
      activityTracker.onWebviewEvent({ type: 'tab-open', tabId: tab.id, url: targetUrl, source: 'user' });
    }
    syncTabsToContext(tabManager, contextBridge);
    return tab;
  });

  ipcMain.handle(IpcChannels.TAB_CLOSE, async (_event, tabId: string) => {
    // Capture tab info before closing
    const closingTab = tabManager.getTab(tabId);
    const result = await tabManager.closeTab(tabId);
    if (result) {
      // Normal close — emit events only for tabs that were actually tracked.
      eventStream.handleTabEvent('tab-closed', { tabId });
      activityTracker.onWebviewEvent({ type: 'tab-close', tabId, url: closingTab?.url, title: closingTab?.title });
    } else {
      // Tab not in main-process Map → possible renderer orphan.
      // Attempt reconciliation so the zombie is removed from the tab strip.
      await tabManager.reconcileWithRenderer().catch(() => { /* best-effort */ });
    }
    syncTabsToContext(tabManager, contextBridge);
    return result;
  });

  ipcMain.handle(IpcChannels.TAB_FOCUS, async (_event, tabId: string) => {
    behaviorObserver.recordTabSwitch(tabId);
    const tabs = tabManager.listTabs();
    const tab = tabs.find(t => t.id === tabId);
    eventStream.handleTabEvent('tab-focused', { tabId, url: tab?.url, title: tab?.title });
    activityTracker.onWebviewEvent({ type: 'tab-switch', tabId, url: tab?.url, title: tab?.title });
    const result = await tabManager.focusTab(tabId);
    syncTabsToContext(tabManager, contextBridge);
    // Attach CDP to the focused tab directly (avoids race with TabManager active tab state)
    if (tab?.webContentsId) {
      await devToolsManager.attachToTab(tab.webContentsId).catch(e => log.warn('devToolsManager.attachToTab failed:', e instanceof Error ? e.message : e));
      securityManager?.onTabAttached(tab.webContentsId).catch(e => log.warn('securityManager.onTabAttached failed:', e instanceof Error ? e.message : e));
    }
    return result;
  });

  ipcMain.handle(IpcChannels.TAB_FOCUS_INDEX, async (_event, index: number) => {
    return tabManager.focusByIndex(index);
  });

  ipcMain.handle(IpcChannels.TAB_LIST, async () => {
    return tabManager.listTabs();
  });

  // ═══ Tab Context Menu — right-click on tab bar ═══
  ipcMain.handle(IpcChannels.SHOW_TAB_CONTEXT_MENU, async (_event, tabId: string) => {
    contextMenuManager.showTabContextMenu(tabId);
  });

  // ═══ Emergency Stop — Escape key from renderer ═══
  ipcMain.handle(IpcChannels.EMERGENCY_STOP, async () => {
    const result = taskManager.emergencyStop();
    panelManager.addChatMessage('wingman', `🛑 Emergency stop! ${result.stopped} tasks stopped.`);
    return result;
  });

  // Navigation IPC handlers
  ipcMain.handle(IpcChannels.NAVIGATE, async (_event, url: string) => {
    const wc = await tabManager.getActiveWebContents();
    if (wc) {
      void wc.loadURL(url);
      return { success: true };
    }
    return { success: false, error: 'No active tab' };
  });

  ipcMain.handle(IpcChannels.GO_BACK, async () => {
    const wc = await tabManager.getActiveWebContents();
    if (wc && wc.navigationHistory.canGoBack()) {
      wc.navigationHistory.goBack();
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle(IpcChannels.GO_FORWARD, async () => {
    const wc = await tabManager.getActiveWebContents();
    if (wc && wc.navigationHistory.canGoForward()) {
      wc.navigationHistory.goForward();
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle(IpcChannels.RELOAD, async () => {
    const wc = await tabManager.getActiveWebContents();
    if (wc) {
      wc.reload();
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle(IpcChannels.GET_PAGE_CONTENT, async () => {
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

  ipcMain.handle(IpcChannels.GET_PAGE_STATUS, async () => {
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

  ipcMain.handle(IpcChannels.EXECUTE_JS, async (_event, code: string) => {
    const wc = await tabManager.getActiveWebContents();
    if (!wc) return { success: false, error: 'No active tab' };

    try {
      const result = await wc.executeJavaScript(code);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IpcChannels.GET_API_TOKEN, async () => {
    try {
      return fs.readFileSync(tandemDir('api-token'), 'utf-8').trim();
    } catch {
      return '';
    }
  });

  // App menu popup (frameless window on Linux)
  ipcMain.on(IpcChannels.SHOW_APP_MENU, (_event, data: { x: number; y: number }) => {
    const send = (action: string) => _win.webContents.send(IpcChannels.SHORTCUT, action);
    
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'Tandem',
        submenu: [
          {
            label: 'About Tandem Browser',
            click: () => send('show-about'),
          },
          { type: 'separator' },
          { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => send('open-settings') },
          { type: 'separator' },
          { label: 'Quit', role: 'quit' as const },
        ],
      },
      {
        label: 'File',
        submenu: [
          { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => send('new-tab') },
          { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => send('close-tab') },
          { type: 'separator' },
          { label: 'Bookmark Page', accelerator: 'CmdOrCtrl+D', click: () => send('bookmark-page') },
          { label: 'Bookmark Manager', click: () => send('open-bookmarks') },
          { label: 'History', accelerator: 'CmdOrCtrl+Y', click: () => send('open-history') },
          { label: 'Find in Page', accelerator: 'CmdOrCtrl+F', click: () => send('find-in-page') },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' as const },
          { role: 'redo' as const },
          { type: 'separator' },
          { role: 'cut' as const },
          { role: 'copy' as const },
          { role: 'paste' as const },
          { role: 'selectAll' as const },
        ],
      },
      {
        label: 'View',
        submenu: [
          { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => send('reload') },
          { type: 'separator' },
          { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => send('zoom-in') },
          { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => send('zoom-out') },
          { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: () => send('zoom-reset') },
          { type: 'separator' },
          { role: 'togglefullscreen' as const },
        ],
      },
      {
        label: 'Wingman',
        submenu: [
          { label: 'Toggle Panel', accelerator: 'CmdOrCtrl+K', click: () => send('toggle-panel') },
          { label: 'Voice Input', accelerator: 'CmdOrCtrl+Shift+M', click: () => send('voice-input') },
          { type: 'separator' },
          { label: 'Draw Mode', accelerator: 'CmdOrCtrl+Shift+D', click: () => send('toggle-draw') },
          { label: 'Quick Screenshot', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('quick-screenshot') },
        ],
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' as const },
          { role: 'close' as const },
        ],
      },
      {
        label: 'Help',
        submenu: [
          { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+?', click: () => send('show-shortcuts') },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: _win, x: data.x, y: data.y });
  });

    // Window controls (frameless window on Linux)
  ipcMain.on(IpcChannels.PANEL_OPEN_CHANGED, (_event, data: { open: boolean }) => {
    // Update internal state only — do NOT send panel-toggle IPC back to avoid feedback loop
    panelManager.setPanelOpenSilent(data.open);
  });

  ipcMain.on(IpcChannels.WINDOW_MINIMIZE, () => {
    _win.minimize();
  });

  ipcMain.on(IpcChannels.WINDOW_MAXIMIZE, () => {
    if (_win.isMaximized()) {
      _win.unmaximize();
    } else {
      _win.maximize();
    }
  });

  ipcMain.on(IpcChannels.WINDOW_CLOSE, () => {
    _win.close();
  });

  ipcMain.handle(IpcChannels.IS_WINDOW_MAXIMIZED, () => {
    return _win.isMaximized();
  });


}
