import { contextBridge, ipcRenderer } from 'electron';
import type { ActivityEvent, ChatMessage } from './panel/manager';
import type { ToolbarExtension } from './extensions/toolbar';

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
  showTabContextMenu: (tabId: string) => ipcRenderer.invoke('show-tab-context-menu', tabId),

  // Tab events to main
  sendTabUpdate: (data: { tabId: string; title?: string; url?: string; favicon?: string }) => {
    ipcRenderer.send('tab-update', data);
  },
  registerTab: (webContentsId: number, url: string) => {
    ipcRenderer.send('tab-register', { webContentsId, url });
  },

  // Events from main process
  onWingmanAlert: (callback: (data: { title: string; body: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { title: string; body: string }) => callback(data);
    ipcRenderer.on('wingman-alert', handler);
    return () => ipcRenderer.removeListener('wingman-alert', handler);
  },
  onNavigated: (callback: (url: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on('navigated', handler);
    return () => ipcRenderer.removeListener('navigated', handler);
  },
  onShortcut: (callback: (action: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on('shortcut', handler);
    return () => ipcRenderer.removeListener('shortcut', handler);
  },
  onOpenUrlInNewTab: (callback: (url: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on('open-url-in-new-tab', handler);
    return () => ipcRenderer.removeListener('open-url-in-new-tab', handler);
  },
    onTabRegistered: (callback: (data: { tabId: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string }) => callback(data);
    ipcRenderer.on('tab-registered', handler);
    return () => ipcRenderer.removeListener('tab-registered', handler);
  },

  // Panel
  onPanelToggle: (callback: (data: { open: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { open: boolean }) => callback(data);
    ipcRenderer.on('panel-toggle', handler);
    return () => ipcRenderer.removeListener('panel-toggle', handler);
  },
  onActivityEvent: (callback: (event: ActivityEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ActivityEvent) => callback(data);
    ipcRenderer.on('activity-event', handler);
    return () => ipcRenderer.removeListener('activity-event', handler);
  },
  onChatMessage: (callback: (msg: ChatMessage) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ChatMessage) => callback(data);
    ipcRenderer.on('chat-message', handler);
    return () => ipcRenderer.removeListener('chat-message', handler);
  },
  sendChatMessage: (text: string) => {
    ipcRenderer.send('chat-send', text);
  },
  sendChatImage: (text: string, image: string) => ipcRenderer.invoke('chat-send-image', { text, image }),

  // Draw overlay
  onDrawMode: (callback: (data: { enabled: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { enabled: boolean }) => callback(data);
    ipcRenderer.on('draw-mode', handler);
    return () => ipcRenderer.removeListener('draw-mode', handler);
  },
  onDrawClear: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('draw-clear', handler);
    return () => ipcRenderer.removeListener('draw-clear', handler);
  },
  onScreenshotTaken: (callback: (data: { path: string; filename: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { path: string; filename: string }) => callback(data);
    ipcRenderer.on('screenshot-taken', handler);
    return () => ipcRenderer.removeListener('screenshot-taken', handler);
  },
  snapForWingman: () => ipcRenderer.invoke('snap-for-wingman'),
  /** @deprecated Use snapForWingman */
  snapForKees: () => ipcRenderer.invoke('snap-for-wingman'),
  quickScreenshot: () => ipcRenderer.invoke('quick-screenshot'),

  // Voice
  onVoiceToggle: (callback: (data: { listening: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { listening: boolean }) => callback(data);
    ipcRenderer.on('voice-toggle', handler);
    return () => ipcRenderer.removeListener('voice-toggle', handler);
  },
  onVoiceTranscript: (callback: (data: { text: string; isFinal: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { text: string; isFinal: boolean }) => callback(data);
    ipcRenderer.on('voice-transcript-display', handler);
    return () => ipcRenderer.removeListener('voice-transcript-display', handler);
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
    const handler = (_event: Electron.IpcRendererEvent, data: { url: string }) => callback(data);
    ipcRenderer.on('auto-snapshot-request', handler);
    return () => ipcRenderer.removeListener('auto-snapshot-request', handler);
  },

  // Wingman typing indicator
  onWingmanTyping: (callback: (data: { typing: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { typing: boolean }) => callback(data);
    ipcRenderer.on('wingman-typing', handler);
    return () => ipcRenderer.removeListener('wingman-typing', handler);
  },
  /** @deprecated Use onWingmanTyping */
  onKeesTyping: (callback: (data: { typing: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { typing: boolean }) => callback(data);
    ipcRenderer.on('wingman-typing', handler);
    return () => ipcRenderer.removeListener('wingman-typing', handler);
  },

  // Live mode change events
  onLiveModeChanged: (callback: (data: { enabled: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { enabled: boolean }) => callback(data);
    ipcRenderer.on('live-mode-changed', handler);
    return () => ipcRenderer.removeListener('live-mode-changed', handler);
  },

  // Emergency stop — stops all agent activity
  emergencyStop: () => ipcRenderer.invoke('emergency-stop'),

  // Task approval events from main
  onApprovalRequest: (callback: (data: { requestId: string; taskId: string; stepId: string; description: string; action: Record<string, unknown>; riskLevel: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { requestId: string; taskId: string; stepId: string; description: string; action: Record<string, unknown>; riskLevel: string }) => callback(data);
    ipcRenderer.on('approval-request', handler);
    return () => ipcRenderer.removeListener('approval-request', handler);
  },

  // Tab source changes (robin/wingman control indicator)
  onTabSourceChanged: (callback: (data: { tabId: string; source: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; source: string }) => callback(data);
    ipcRenderer.on('tab-source-changed', handler);
    return () => ipcRenderer.removeListener('tab-source-changed', handler);
  },

  // Download complete notification
  onDownloadComplete: (callback: (data: { id: string; filename: string; savePath: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { id: string; filename: string; savePath: string }) => callback(data);
    ipcRenderer.on('download-complete', handler);
    return () => ipcRenderer.removeListener('download-complete', handler);
  },

  // Open URL in new tab (from popup redirect)
  onOpenUrlInNewTab: (callback: (url: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on('open-url-in-new-tab', handler);
    return () => ipcRenderer.removeListener('open-url-in-new-tab', handler);
  },

  // Wingman chat injection (from context menu)
  onWingmanChatInject: (callback: (text: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
    ipcRenderer.on('wingman-chat-inject', handler);
    return () => ipcRenderer.removeListener('wingman-chat-inject', handler);
  },
  /** @deprecated Use onWingmanChatInject */
  onKeesChatInject: (callback: (text: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
    ipcRenderer.on('wingman-chat-inject', handler);
    return () => ipcRenderer.removeListener('wingman-chat-inject', handler);
  },

  // Bookmark status change (from context menu)
  onBookmarkStatusChanged: (callback: (data: { url: string; bookmarked: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { url: string; bookmarked: boolean }) => callback(data);
    ipcRenderer.on('bookmark-status-changed', handler);
    return () => ipcRenderer.removeListener('bookmark-status-changed', handler);
  },

  // Bookmark toggle
  bookmarkPage: (url: string, title: string) => ipcRenderer.invoke('bookmark-page', url, title),
  unbookmarkPage: (url: string) => ipcRenderer.invoke('unbookmark-page', url),
  isBookmarked: (url: string) => ipcRenderer.invoke('is-bookmarked', url),

  // Extension toolbar
  getToolbarExtensions: () => ipcRenderer.invoke('extension-toolbar-list'),
  openExtensionPopup: (extensionId: string, anchorBounds?: { x: number; y: number }) => ipcRenderer.invoke('extension-popup-open', extensionId, anchorBounds),
  closeExtensionPopup: () => ipcRenderer.invoke('extension-popup-close'),
  pinExtension: (extensionId: string, pinned: boolean) => ipcRenderer.invoke('extension-pin', extensionId, pinned),
  showExtensionContextMenu: (extensionId: string) => ipcRenderer.invoke('extension-context-menu', extensionId),
  showExtensionOptions: (extensionId: string) => ipcRenderer.invoke('extension-options', extensionId),
  onExtensionToolbarUpdate: (callback: (extensions: ToolbarExtension[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, extensions: ToolbarExtension[]) => callback(extensions);
    ipcRenderer.on('extension-toolbar-update', handler);
    return () => ipcRenderer.removeListener('extension-toolbar-update', handler);
  },
  onExtensionRemoveRequest: (callback: (data: { id: string; diskId: string; name: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { id: string; diskId: string; name: string }) => callback(data);
    ipcRenderer.on('extension-remove-request', handler);
    return () => ipcRenderer.removeListener('extension-remove-request', handler);
  },
  onExtensionToolbarRefresh: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('extension-toolbar-refresh', handler);
    return () => ipcRenderer.removeListener('extension-toolbar-refresh', handler);
  },

  // Sidebar webview reload (after Google auth popup)
  onReloadSidebarWebview: (callback: (id: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string) => callback(id);
    ipcRenderer.on('reload-sidebar-webview', handler);
    return () => ipcRenderer.removeListener('reload-sidebar-webview', handler);
  },

  // Workspace switching
  onWorkspaceSwitched: (callback: (workspace: { id: string; name: string; icon: string; color: string; tabIds: number[] }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, workspace: { id: string; name: string; icon: string; color: string; tabIds: number[] }) => callback(workspace);
    ipcRenderer.on('workspace-switched', handler);
    return () => ipcRenderer.removeListener('workspace-switched', handler);
  },

  onPinboardItemAdded: (callback: (boardId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, boardId: string) => callback(boardId);
    ipcRenderer.on('pinboard-item-added', handler);
    return () => ipcRenderer.removeListener('pinboard-item-added', handler);
  },

  // Chrome-style compact title bar: platform detection and window controls
  getPlatform: () => process.platform,
  showAppMenu: (x: number, y: number) => ipcRenderer.send('show-app-menu', { x, y }),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  isWindowMaximized: () => ipcRenderer.invoke('is-window-maximized'),
});
