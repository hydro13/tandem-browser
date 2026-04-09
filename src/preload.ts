import { contextBridge, ipcRenderer } from 'electron';
import type { ActivityEvent, ChatMessage } from './panel/manager';
import type { ToolbarExtension } from './extensions/toolbar';
import { IpcChannels } from './shared/ipc-channels';
contextBridge.exposeInMainWorld('__TANDEM_TOKEN__', '');
contextBridge.exposeInMainWorld('__TANDEM_VERSION__', process.env.npm_package_version || '');

contextBridge.exposeInMainWorld('tandem', {
  getApiToken: () => ipcRenderer.invoke(IpcChannels.GET_API_TOKEN),

  // Navigation
  navigate: (url: string) => ipcRenderer.invoke(IpcChannels.NAVIGATE, url),
  goBack: () => ipcRenderer.invoke(IpcChannels.GO_BACK),
  goForward: () => ipcRenderer.invoke(IpcChannels.GO_FORWARD),
  reload: () => ipcRenderer.invoke(IpcChannels.RELOAD),

  // Page content
  getPageContent: () => ipcRenderer.invoke(IpcChannels.GET_PAGE_CONTENT),
  getPageStatus: () => ipcRenderer.invoke(IpcChannels.GET_PAGE_STATUS),
  executeJS: (code: string) => ipcRenderer.invoke(IpcChannels.EXECUTE_JS, code),

  // Tab management
  newTab: (url?: string) => ipcRenderer.invoke(IpcChannels.TAB_NEW, url),
  closeTab: (tabId: string) => ipcRenderer.invoke(IpcChannels.TAB_CLOSE, tabId),
  focusTab: (tabId: string) => ipcRenderer.invoke(IpcChannels.TAB_FOCUS, tabId),
  focusTabByIndex: (index: number) => ipcRenderer.invoke(IpcChannels.TAB_FOCUS_INDEX, index),
  listTabs: () => ipcRenderer.invoke(IpcChannels.TAB_LIST),
  showTabContextMenu: (tabId: string) => ipcRenderer.invoke(IpcChannels.SHOW_TAB_CONTEXT_MENU, tabId),

  // Tab events to main
  sendTabUpdate: (data: { tabId: string; title?: string; url?: string; favicon?: string }) => {
    ipcRenderer.send(IpcChannels.TAB_UPDATE, data);
  },
  registerTab: (webContentsId: number, url: string) => {
    ipcRenderer.send(IpcChannels.TAB_REGISTER, { webContentsId, url });
  },

  // Events from main process
  onWingmanAlert: (callback: (data: { title: string; body: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { title: string; body: string }) => callback(data);
    ipcRenderer.on(IpcChannels.WINGMAN_ALERT, handler);
    return () => ipcRenderer.removeListener(IpcChannels.WINGMAN_ALERT, handler);
  },
  onNavigated: (callback: (url: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on(IpcChannels.NAVIGATED, handler);
    return () => ipcRenderer.removeListener(IpcChannels.NAVIGATED, handler);
  },
  onShortcut: (callback: (action: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on(IpcChannels.SHORTCUT, handler);
    return () => ipcRenderer.removeListener(IpcChannels.SHORTCUT, handler);
  },
  onScreenshotModeSelected: (callback: (mode: 'page' | 'application' | 'region') => void) => {
    const handler = (_event: Electron.IpcRendererEvent, mode: 'page' | 'application' | 'region') => callback(mode);
    ipcRenderer.on(IpcChannels.SCREENSHOT_MODE_SELECTED, handler);
    return () => ipcRenderer.removeListener(IpcChannels.SCREENSHOT_MODE_SELECTED, handler);
  },
    onTabRegistered: (callback: (data: { tabId: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string }) => callback(data);
    ipcRenderer.on(IpcChannels.TAB_REGISTERED, handler);
    return () => ipcRenderer.removeListener(IpcChannels.TAB_REGISTERED, handler);
  },

  // Panel
  onPanelToggle: (callback: (data: { open: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { open: boolean }) => callback(data);
    ipcRenderer.on(IpcChannels.PANEL_TOGGLE, handler);
    return () => ipcRenderer.removeListener(IpcChannels.PANEL_TOGGLE, handler);
  },
  onActivityEvent: (callback: (event: ActivityEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ActivityEvent) => callback(data);
    ipcRenderer.on(IpcChannels.ACTIVITY_EVENT, handler);
    return () => ipcRenderer.removeListener(IpcChannels.ACTIVITY_EVENT, handler);
  },
  onChatMessage: (callback: (msg: ChatMessage) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ChatMessage) => callback(data);
    ipcRenderer.on(IpcChannels.CHAT_MESSAGE, handler);
    return () => ipcRenderer.removeListener(IpcChannels.CHAT_MESSAGE, handler);
  },
  sendChatMessage: (text: string) => {
    ipcRenderer.send(IpcChannels.CHAT_SEND, text);
  },
  sendLegacyChatMessage: (text: string) => {
    ipcRenderer.send(IpcChannels.CHAT_SEND_LEGACY, text);
  },
  sendChatImage: (text: string, image: string) => ipcRenderer.invoke(IpcChannels.CHAT_SEND_IMAGE, { text, image }),
  persistChatMessage: (data: {
    from: 'robin' | 'wingman' | 'kees' | 'claude';
    text?: string;
    image?: string;
    notifyWebhook?: boolean;
  }) => ipcRenderer.invoke(IpcChannels.CHAT_PERSIST_MESSAGE, data),

  // Draw overlay
  onDrawMode: (callback: (data: { enabled: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { enabled: boolean }) => callback(data);
    ipcRenderer.on(IpcChannels.DRAW_MODE, handler);
    return () => ipcRenderer.removeListener(IpcChannels.DRAW_MODE, handler);
  },
  onDrawClear: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IpcChannels.DRAW_CLEAR, handler);
    return () => ipcRenderer.removeListener(IpcChannels.DRAW_CLEAR, handler);
  },
  onScreenshotTaken: (callback: (data: { path: string; filename: string; appPath?: string; base64?: string }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { path: string; filename: string; appPath?: string; base64?: string },
    ) => callback(data);
    ipcRenderer.on(IpcChannels.SCREENSHOT_TAKEN, handler);
    return () => ipcRenderer.removeListener(IpcChannels.SCREENSHOT_TAKEN, handler);
  },
  snapForWingman: () => ipcRenderer.invoke(IpcChannels.SNAP_FOR_WINGMAN),
  /** @deprecated Use snapForWingman */
  snapForKees: () => ipcRenderer.invoke(IpcChannels.SNAP_FOR_WINGMAN),
  quickScreenshot: () => ipcRenderer.invoke(IpcChannels.QUICK_SCREENSHOT),
  captureScreenshot: (
    mode: 'page' | 'application' | 'region',
    region?: { x: number; y: number; width: number; height: number },
  ) => ipcRenderer.invoke(IpcChannels.CAPTURE_SCREENSHOT, { mode, region }),
  showScreenshotMenu: (anchor: { x: number; y: number }) => ipcRenderer.invoke(IpcChannels.SHOW_SCREENSHOT_MENU, anchor),

  // Recording
  getDesktopSource: () => ipcRenderer.invoke(IpcChannels.GET_DESKTOP_SOURCE),
  startRecording: (mode: 'application' | 'region', region?: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke(IpcChannels.START_RECORDING, { mode, region }),
  stopRecording: () => ipcRenderer.invoke(IpcChannels.STOP_RECORDING),
  sendRecordingChunk: (data: ArrayBuffer) => ipcRenderer.send(IpcChannels.RECORDING_CHUNK, data),
  onRecordingModeSelected: (callback: (mode: 'application' | 'region') => void) => {
    const handler = (_event: Electron.IpcRendererEvent, mode: 'application' | 'region') => callback(mode);
    ipcRenderer.on(IpcChannels.RECORDING_MODE_SELECTED, handler);
    return () => ipcRenderer.removeListener(IpcChannels.RECORDING_MODE_SELECTED, handler);
  },
  onRecordingFinished: (callback: (data: { path: string; filename: string; duration: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { path: string; filename: string; duration: number }) => callback(data);
    ipcRenderer.on(IpcChannels.RECORDING_FINISHED, handler);
    return () => ipcRenderer.removeListener(IpcChannels.RECORDING_FINISHED, handler);
  },

  // Voice
  onVoiceToggle: (callback: (data: { listening: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { listening: boolean }) => callback(data);
    ipcRenderer.on(IpcChannels.VOICE_TOGGLE, handler);
    return () => ipcRenderer.removeListener(IpcChannels.VOICE_TOGGLE, handler);
  },
  onVoiceTranscript: (callback: (data: { text: string; isFinal: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { text: string; isFinal: boolean }) => callback(data);
    ipcRenderer.on(IpcChannels.VOICE_TRANSCRIPT_DISPLAY, handler);
    return () => ipcRenderer.removeListener(IpcChannels.VOICE_TRANSCRIPT_DISPLAY, handler);
  },
  sendVoiceTranscript: (text: string, isFinal: boolean) => {
    ipcRenderer.send(IpcChannels.VOICE_TRANSCRIPT, { text, isFinal });
  },
  sendVoiceStatus: (listening: boolean) => {
    ipcRenderer.send(IpcChannels.VOICE_STATUS_UPDATE, { listening });
  },

  // Activity tracking
  sendWebviewEvent: (data: { type: string; url?: string; tabId?: string }) => {
    ipcRenderer.send(IpcChannels.ACTIVITY_WEBVIEW_EVENT, data);
  },
  onAutoSnapshotRequest: (callback: (data: { url: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { url: string }) => callback(data);
    ipcRenderer.on(IpcChannels.AUTO_SNAPSHOT_REQUEST, handler);
    return () => ipcRenderer.removeListener(IpcChannels.AUTO_SNAPSHOT_REQUEST, handler);
  },

  // Wingman typing indicator
  onWingmanTyping: (callback: (data: { typing: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { typing: boolean }) => callback(data);
    ipcRenderer.on(IpcChannels.WINGMAN_TYPING, handler);
    return () => ipcRenderer.removeListener(IpcChannels.WINGMAN_TYPING, handler);
  },
  /** @deprecated Use onWingmanTyping */
  onKeesTyping: (callback: (data: { typing: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { typing: boolean }) => callback(data);
    ipcRenderer.on(IpcChannels.WINGMAN_TYPING, handler);
    return () => ipcRenderer.removeListener(IpcChannels.WINGMAN_TYPING, handler);
  },

  // Live mode change events
  onLiveModeChanged: (callback: (data: { enabled: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { enabled: boolean }) => callback(data);
    ipcRenderer.on(IpcChannels.LIVE_MODE_CHANGED, handler);
    return () => ipcRenderer.removeListener(IpcChannels.LIVE_MODE_CHANGED, handler);
  },

  // Emergency stop — stops all agent activity
  emergencyStop: () => ipcRenderer.invoke(IpcChannels.EMERGENCY_STOP),

  // Task approval events from main
  onApprovalRequest: (callback: (data: { requestId: string; taskId: string; stepId: string; description: string; action: Record<string, unknown>; riskLevel: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { requestId: string; taskId: string; stepId: string; description: string; action: Record<string, unknown>; riskLevel: string }) => callback(data);
    ipcRenderer.on(IpcChannels.APPROVAL_REQUEST, handler);
    return () => ipcRenderer.removeListener(IpcChannels.APPROVAL_REQUEST, handler);
  },

  // Tab source changes (robin/wingman control indicator)
  onTabSourceChanged: (callback: (data: { tabId: string; source: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; source: string }) => callback(data);
    ipcRenderer.on(IpcChannels.TAB_SOURCE_CHANGED, handler);
    return () => ipcRenderer.removeListener(IpcChannels.TAB_SOURCE_CHANGED, handler);
  },

  // Download complete notification
  onDownloadComplete: (callback: (data: { id: string; filename: string; savePath: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { id: string; filename: string; savePath: string }) => callback(data);
    ipcRenderer.on(IpcChannels.DOWNLOAD_COMPLETE, handler);
    return () => ipcRenderer.removeListener(IpcChannels.DOWNLOAD_COMPLETE, handler);
  },

  // Open URL in new tab (from popup redirect)
  onOpenUrlInNewTab: (callback: (url: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on(IpcChannels.OPEN_URL_IN_NEW_TAB, handler);
    return () => ipcRenderer.removeListener(IpcChannels.OPEN_URL_IN_NEW_TAB, handler);
  },

  // Wingman chat injection (from context menu)
  onWingmanChatInject: (callback: (text: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
    ipcRenderer.on(IpcChannels.WINGMAN_CHAT_INJECT, handler);
    return () => ipcRenderer.removeListener(IpcChannels.WINGMAN_CHAT_INJECT, handler);
  },
  /** @deprecated Use onWingmanChatInject */
  onKeesChatInject: (callback: (text: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
    ipcRenderer.on(IpcChannels.WINGMAN_CHAT_INJECT, handler);
    return () => ipcRenderer.removeListener(IpcChannels.WINGMAN_CHAT_INJECT, handler);
  },

  // Bookmark status change (from context menu)
  onBookmarkStatusChanged: (callback: (data: { url: string; bookmarked: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { url: string; bookmarked: boolean }) => callback(data);
    ipcRenderer.on(IpcChannels.BOOKMARK_STATUS_CHANGED, handler);
    return () => ipcRenderer.removeListener(IpcChannels.BOOKMARK_STATUS_CHANGED, handler);
  },

  // Bookmark toggle
  bookmarkPage: (url: string, title: string) => ipcRenderer.invoke(IpcChannels.BOOKMARK_PAGE, url, title),
  unbookmarkPage: (url: string) => ipcRenderer.invoke(IpcChannels.UNBOOKMARK_PAGE, url),
  isBookmarked: (url: string) => ipcRenderer.invoke(IpcChannels.IS_BOOKMARKED, url),

  // Extension toolbar
  getToolbarExtensions: () => ipcRenderer.invoke(IpcChannels.EXTENSION_TOOLBAR_LIST),
  openExtensionPopup: (extensionId: string, anchorBounds?: { x: number; y: number }) => ipcRenderer.invoke(IpcChannels.EXTENSION_POPUP_OPEN, extensionId, anchorBounds),
  closeExtensionPopup: () => ipcRenderer.invoke(IpcChannels.EXTENSION_POPUP_CLOSE),
  pinExtension: (extensionId: string, pinned: boolean) => ipcRenderer.invoke(IpcChannels.EXTENSION_PIN, extensionId, pinned),
  showExtensionContextMenu: (extensionId: string) => ipcRenderer.invoke(IpcChannels.EXTENSION_CONTEXT_MENU, extensionId),
  showExtensionOptions: (extensionId: string) => ipcRenderer.invoke(IpcChannels.EXTENSION_OPTIONS, extensionId),
  onExtensionToolbarUpdate: (callback: (extensions: ToolbarExtension[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, extensions: ToolbarExtension[]) => callback(extensions);
    ipcRenderer.on(IpcChannels.EXTENSION_TOOLBAR_UPDATE, handler);
    return () => ipcRenderer.removeListener(IpcChannels.EXTENSION_TOOLBAR_UPDATE, handler);
  },
  onExtensionRemoveRequest: (callback: (data: { id: string; diskId: string; name: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { id: string; diskId: string; name: string }) => callback(data);
    ipcRenderer.on(IpcChannels.EXTENSION_REMOVE_REQUEST, handler);
    return () => ipcRenderer.removeListener(IpcChannels.EXTENSION_REMOVE_REQUEST, handler);
  },
  onExtensionToolbarRefresh: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IpcChannels.EXTENSION_TOOLBAR_REFRESH, handler);
    return () => ipcRenderer.removeListener(IpcChannels.EXTENSION_TOOLBAR_REFRESH, handler);
  },

  // Sidebar webview reload (after Google auth popup)
  onReloadSidebarWebview: (callback: (id: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string) => callback(id);
    ipcRenderer.on(IpcChannels.RELOAD_SIDEBAR_WEBVIEW, handler);
    return () => ipcRenderer.removeListener(IpcChannels.RELOAD_SIDEBAR_WEBVIEW, handler);
  },

  // Workspace switching
  onWorkspaceSwitched: (callback: (workspace: { id: string; name: string; icon: string; color: string; tabIds: number[] }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, workspace: { id: string; name: string; icon: string; color: string; tabIds: number[] }) => callback(workspace);
    ipcRenderer.on(IpcChannels.WORKSPACE_SWITCHED, handler);
    return () => ipcRenderer.removeListener(IpcChannels.WORKSPACE_SWITCHED, handler);
  },

  onPinboardItemAdded: (callback: (boardId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, boardId: string) => callback(boardId);
    ipcRenderer.on(IpcChannels.PINBOARD_ITEM_ADDED, handler);
    return () => ipcRenderer.removeListener(IpcChannels.PINBOARD_ITEM_ADDED, handler);
  },

  // Chrome-style compact title bar: platform detection and window controls
  setPanelOpen: (open: boolean) => ipcRenderer.send(IpcChannels.PANEL_OPEN_CHANGED, { open }),
  requestMicPermission: () => ipcRenderer.invoke(IpcChannels.REQUEST_MIC_PERMISSION),

  transcribeAudio: (buffer: ArrayBuffer, language?: string) => ipcRenderer.invoke(IpcChannels.TRANSCRIBE_AUDIO, { buffer, language }),
  getSpeechBackend: () => ipcRenderer.invoke(IpcChannels.GET_SPEECH_BACKEND),
  getPlatform: () => process.platform,
  showAppMenu: (x: number, y: number) => ipcRenderer.send(IpcChannels.SHOW_APP_MENU, { x, y }),
  minimizeWindow: () => ipcRenderer.send(IpcChannels.WINDOW_MINIMIZE),
  maximizeWindow: () => ipcRenderer.send(IpcChannels.WINDOW_MAXIMIZE),
  closeWindow: () => ipcRenderer.send(IpcChannels.WINDOW_CLOSE),
  isWindowMaximized: () => ipcRenderer.invoke(IpcChannels.IS_WINDOW_MAXIMIZED),
});
