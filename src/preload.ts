import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('tandem', {
  // Navigation
  navigate: (url: string) => ipcRenderer.invoke('navigate', url),
  goBack: () => ipcRenderer.invoke('go-back'),
  goForward: () => ipcRenderer.invoke('go-forward'),
  reload: () => ipcRenderer.invoke('reload'),

  // Page content
  getPageContent: () => ipcRenderer.invoke('get-page-content'),
  getPageStatus: () => ipcRenderer.invoke('get-page-status'),
  executeJS: (code: string) => ipcRenderer.invoke('execute-js', code),

  // Tab management
  newTab: (url?: string) => ipcRenderer.invoke('tab-new', url),
  closeTab: (tabId: string) => ipcRenderer.invoke('tab-close', tabId),
  focusTab: (tabId: string) => ipcRenderer.invoke('tab-focus', tabId),
  focusTabByIndex: (index: number) => ipcRenderer.invoke('tab-focus-index', index),
  listTabs: () => ipcRenderer.invoke('tab-list'),

  // Tab events to main
  sendTabUpdate: (data: { tabId: string; title?: string; url?: string; favicon?: string }) => {
    ipcRenderer.send('tab-update', data);
  },
  registerTab: (webContentsId: number, url: string) => {
    ipcRenderer.send('tab-register', { webContentsId, url });
  },

  // Events from main process
  onCopilotAlert: (callback: (data: { title: string; body: string }) => void) => {
    ipcRenderer.on('copilot-alert', (_event, data) => callback(data));
  },
  onNavigated: (callback: (url: string) => void) => {
    ipcRenderer.on('navigated', (_event, url) => callback(url));
  },
  onShortcut: (callback: (action: string) => void) => {
    ipcRenderer.on('shortcut', (_event, action) => callback(action));
  },
  onTabRegistered: (callback: (data: { tabId: string }) => void) => {
    ipcRenderer.on('tab-registered', (_event, data) => callback(data));
  },

  // Panel
  onPanelToggle: (callback: (data: { open: boolean }) => void) => {
    ipcRenderer.on('panel-toggle', (_event, data) => callback(data));
  },
  onActivityEvent: (callback: (event: any) => void) => {
    ipcRenderer.on('activity-event', (_event, data) => callback(data));
  },
  onChatMessage: (callback: (msg: any) => void) => {
    ipcRenderer.on('chat-message', (_event, data) => callback(data));
  },
  sendChatMessage: (text: string) => {
    ipcRenderer.send('chat-send', text);
  },

  // Draw overlay
  onDrawMode: (callback: (data: { enabled: boolean }) => void) => {
    ipcRenderer.on('draw-mode', (_event, data) => callback(data));
  },
  onDrawClear: (callback: () => void) => {
    ipcRenderer.on('draw-clear', () => callback());
  },
  onScreenshotTaken: (callback: (data: { path: string; filename: string }) => void) => {
    ipcRenderer.on('screenshot-taken', (_event, data) => callback(data));
  },
  snapForKees: () => ipcRenderer.invoke('snap-for-kees'),
  quickScreenshot: () => ipcRenderer.invoke('quick-screenshot'),

  // Voice
  onVoiceToggle: (callback: (data: { listening: boolean }) => void) => {
    ipcRenderer.on('voice-toggle', (_event, data) => callback(data));
  },
  onVoiceTranscript: (callback: (data: { text: string; isFinal: boolean }) => void) => {
    ipcRenderer.on('voice-transcript-display', (_event, data) => callback(data));
  },
  sendVoiceTranscript: (text: string, isFinal: boolean) => {
    ipcRenderer.send('voice-transcript', { text, isFinal });
  },
  sendVoiceStatus: (listening: boolean) => {
    ipcRenderer.send('voice-status-update', { listening });
  },

  // Activity tracking
  sendWebviewEvent: (data: { type: string; url?: string; tabId?: string }) => {
    ipcRenderer.send('activity-webview-event', data);
  },
  onAutoSnapshotRequest: (callback: (data: { url: string }) => void) => {
    ipcRenderer.on('auto-snapshot-request', (_event, data) => callback(data));
  },

  // Kees typing indicator
  onKeesTyping: (callback: (data: { typing: boolean }) => void) => {
    ipcRenderer.on('kees-typing', (_event, data) => callback(data));
  },

  // Tab source changes (robin/kees control indicator)
  onTabSourceChanged: (callback: (data: { tabId: string; source: string }) => void) => {
    ipcRenderer.on('tab-source-changed', (_event, data) => callback(data));
  },

  // Download complete notification
  onDownloadComplete: (callback: (data: { id: string; filename: string; savePath: string }) => void) => {
    ipcRenderer.on('download-complete', (_event, data) => callback(data));
  },

  // Open URL in new tab (from popup redirect)
  onOpenUrlInNewTab: (callback: (url: string) => void) => {
    ipcRenderer.on('open-url-in-new-tab', (_event, url) => callback(url));
  },

  // Bookmark toggle
  bookmarkPage: (url: string, title: string) => ipcRenderer.invoke('bookmark-page', url, title),
  unbookmarkPage: (url: string) => ipcRenderer.invoke('unbookmark-page', url),
  isBookmarked: (url: string) => ipcRenderer.invoke('is-bookmarked', url),
});
