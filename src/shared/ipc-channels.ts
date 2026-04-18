/**
 * Centralized IPC channel name constants for main ↔ renderer communication.
 * Grouped by domain. Use these instead of hardcoded strings.
 */

export const IpcChannels = {
  // Auth / API
  GET_API_TOKEN: 'get-api-token',

  // Navigation
  NAVIGATE: 'navigate',
  GO_BACK: 'go-back',
  GO_FORWARD: 'go-forward',
  RELOAD: 'reload',
  NAVIGATED: 'navigated',

  // Page content
  GET_PAGE_CONTENT: 'get-page-content',
  GET_PAGE_STATUS: 'get-page-status',
  // EXECUTE_JS removed in audit #34 High-4: the channel let any renderer
  // reachable via window.tandem run arbitrary JS in the active webview,
  // which is an unnecessary XSS amplifier. Use the HTTP /execute-js(/confirm)
  // routes — they're gated by the injection scanner and user approval.

  // Tab management
  TAB_NEW: 'tab-new',
  TAB_CLOSE: 'tab-close',
  TAB_FOCUS: 'tab-focus',
  TAB_FOCUS_INDEX: 'tab-focus-index',
  TAB_LIST: 'tab-list',
  TAB_UPDATE: 'tab-update',
  TAB_REGISTER: 'tab-register',
  TAB_REGISTERED: 'tab-registered',
  TAB_SOURCE_CHANGED: 'tab-source-changed',
  TAB_PIN_CHANGED: 'tab-pin-changed',
  TAB_EMOJI_CHANGED: 'tab-emoji-changed',
  SHOW_TAB_CONTEXT_MENU: 'show-tab-context-menu',

  // Panel / Chat
  PANEL_TOGGLE: 'panel-toggle',
  PANEL_OPEN_CHANGED: 'panel-open-changed',
  CHAT_SEND: 'chat-send',
  CHAT_SEND_LEGACY: 'chat-send-legacy',
  CHAT_SEND_IMAGE: 'chat-send-image',
  CHAT_PERSIST_MESSAGE: 'chat-persist-message',
  CHAT_MESSAGE: 'chat-message',

  // Wingman
  WINGMAN_ALERT: 'wingman-alert',
  WINGMAN_TYPING: 'wingman-typing',
  WINGMAN_CHAT_INJECT: 'wingman-chat-inject',

  // Draw / Screenshot
  DRAW_MODE: 'draw-mode',
  DRAW_CLEAR: 'draw-clear',
  SCREENSHOT_TAKEN: 'screenshot-taken',
  SCREENSHOT_MODE_SELECTED: 'screenshot-mode-selected',
  SNAP_FOR_WINGMAN: 'snap-for-wingman',
  QUICK_SCREENSHOT: 'quick-screenshot',
  CAPTURE_SCREENSHOT: 'capture-screenshot',
  SHOW_SCREENSHOT_MENU: 'show-screenshot-menu',

  // Recording
  GET_DESKTOP_SOURCE: 'get-desktop-source',
  START_RECORDING: 'start-recording',
  STOP_RECORDING: 'stop-recording',
  RECORDING_CHUNK: 'recording-chunk',
  RECORDING_MODE_SELECTED: 'recording-mode-selected',
  RECORDING_FINISHED: 'recording-finished',

  // Voice
  VOICE_TOGGLE: 'voice-toggle',
  VOICE_TRANSCRIPT: 'voice-transcript',
  VOICE_TRANSCRIPT_DISPLAY: 'voice-transcript-display',
  VOICE_STATUS_UPDATE: 'voice-status-update',

  // Activity
  ACTIVITY_EVENT: 'activity-event',
  ACTIVITY_WEBVIEW_EVENT: 'activity-webview-event',
  AUTO_SNAPSHOT_REQUEST: 'auto-snapshot-request',

  // Bookmarks
  BOOKMARK_PAGE: 'bookmark-page',
  UNBOOKMARK_PAGE: 'unbookmark-page',
  IS_BOOKMARKED: 'is-bookmarked',
  BOOKMARK_STATUS_CHANGED: 'bookmark-status-changed',

  // Extensions
  EXTENSION_TOOLBAR_LIST: 'extension-toolbar-list',
  EXTENSION_TOOLBAR_UPDATE: 'extension-toolbar-update',
  EXTENSION_TOOLBAR_REFRESH: 'extension-toolbar-refresh',
  EXTENSION_POPUP_OPEN: 'extension-popup-open',
  EXTENSION_POPUP_CLOSE: 'extension-popup-close',
  EXTENSION_PIN: 'extension-pin',
  EXTENSION_CONTEXT_MENU: 'extension-context-menu',
  EXTENSION_OPTIONS: 'extension-options',
  EXTENSION_REMOVE_REQUEST: 'extension-remove-request',

  // Downloads
  DOWNLOAD_COMPLETE: 'download-complete',

  // Window controls
  SHOW_APP_MENU: 'show-app-menu',
  WINDOW_MINIMIZE: 'window-minimize',
  WINDOW_MAXIMIZE: 'window-maximize',
  WINDOW_CLOSE: 'window-close',
  IS_WINDOW_MAXIMIZED: 'is-window-maximized',

  // Speech
  TRANSCRIBE_AUDIO: 'transcribe-audio',
  GET_SPEECH_BACKEND: 'get-speech-backend',
  REQUEST_MIC_PERMISSION: 'request-mic-permission',

  // Live mode
  LIVE_MODE_CHANGED: 'live-mode-changed',

  // Agents / Tasks
  EMERGENCY_STOP: 'emergency-stop',
  APPROVAL_REQUEST: 'approval-request',
  // Mirror of APPROVAL_REQUEST: fired when ANY path resolves the approval
  // (Wingman Chat card, Activity panel, API route, etc.) so every open UI
  // card for the same requestId can dismiss itself in sync.
  APPROVAL_RESPONSE: 'approval-response',
  TASK_UPDATED: 'task-updated',
  HANDOFF_UPDATED: 'handoff-updated',

  // Shortcuts
  SHORTCUT: 'shortcut',

  // Misc
  OPEN_URL_IN_NEW_TAB: 'open-url-in-new-tab',
  RELOAD_SIDEBAR_WEBVIEW: 'reload-sidebar-webview',
  WORKSPACE_SWITCHED: 'workspace-switched',
  PINBOARD_ITEM_ADDED: 'pinboard-item-added',
  FORM_SUBMITTED: 'form-submitted',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
