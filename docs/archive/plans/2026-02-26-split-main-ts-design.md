# Split main.ts + Fix Circular Dependencies — Design

## Goal

Split `src/main.ts` (1016 lines) into focused modules and fix the `wingmanAlert` circular dependency (Items 2 + 4 from STRUCTURE-IMPROVEMENTS.md).

## Current State

`main.ts` contains five distinct responsibilities:

| Block | Lines | Responsibility |
|-------|-------|----------------|
| Imports + globals | 1-107 | 35+ manager variables |
| `createWindow()` | 109-277 | BrowserWindow + stealth + webview handlers |
| `startAPI()` | 279-828 | Manager instantiation + **all IPC handlers** (~380 lines) |
| `buildAppMenu()` | 831-951 | Full application menu definition |
| `wingmanAlert()` + bootstrap | 954-1015 | Exported helper + app lifecycle |

The `wingmanAlert` function is exported from `main.ts` and imported by `browser.ts`, `watcher.ts`, and `headless/manager.ts` — creating a circular dependency (Item 4).

## Architecture

Split into 3 new modules + slimmed main.ts:

```
src/
  main.ts                (~400 lines — bootstrap, createWindow, startAPI, lifecycle)
  notifications/
    alert.ts             (~15 lines — wingmanAlert + setMainWindow setter)
  ipc/
    handlers.ts          (~400 lines — all IPC handlers)
  menu/
    app-menu.ts          (~130 lines — application menu template)
```

### Module 1: `src/notifications/alert.ts`

Breaks the circular dependency by moving `wingmanAlert` out or `main.ts`.

```typescript
import { BrowserWindow, Notification } from 'electron';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function wingmanAlert(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title: `🧀 ${title}`, body }).show();
  }
  mainWindow?.webContents.send('wingman-alert', { title, body });
}
```

Consumers change import from `'../main'` to `'../notifications/alert'`.
`main.ts` calls `setMainWindow(win)` after window creation and `setMainWindow(null)` on close.

### Module 2: `src/ipc/handlers.ts`

All IPC handler registrations extracted from `startAPI()`.

```typescript
export interface IpcDeps {
  win: BrowserWindow;
  tabManager: TabManager;
  panelManager: PanelManager;
  drawManager: DrawOverlayManager;
  voiceManager: VoiceManager;
  behaviorObserver: BehaviorObserver;
  configManager: ConfigManager;
  siteMemory: SiteMemoryManager;
  headlessManager: HeadlessManager;
  formMemory: FormMemoryManager;
  contextBridge: ContextBridge;
  networkInspector: NetworkInspector;
  bookmarkManager: BookmarkManager;
  historyManager: HistoryManager;
  downloadManager: DownloadManager;
  audioCaptureManager: AudioCaptureManager;
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
}

export function registerIpcHandlers(deps: IpcDeps): void { ... }
```

Includes:
- All `ipcMain.on(...)` handlers: `tab-update`, `tab-register`, `chat-send`, `voice-transcript`, `voice-status-update`, `activity-webview-event`, `form-submitted`
- All `ipcMain.handle(...)` handlers: `snap-for-wingman`, `quick-screenshot`, `bookmark-page`, `unbookmark-page`, `is-bookmarked`, `tab-new`, `tab-close`, `tab-focus`, `tab-focus-index`, `tab-list`, `show-tab-context-menu`, `emergency-stop`, `navigate`, `go-back`, `go-forward`, `reload`, `get-page-content`, `get-page-status`, `execute-js`, `chat-send-image`
- The `syncTabsToContext` helper (only used by IPC handlers)
- The IPC cleanup code (removeAllListeners / removeHandler)

### Module 3: `src/menu/app-menu.ts`

```typescript
export interface MenuDeps {
  mainWindow: BrowserWindow | null;
  tabManager: TabManager | null;
  panelManager: PanelManager | null;
  drawManager: DrawOverlayManager | null;
  voiceManager: VoiceManager | null;
  pipManager: PiPManager | null;
  configManager: ConfigManager | null;
  audioCaptureManager: AudioCaptureManager | null;
}

export function buildAppMenu(deps: MenuDeps): void { ... }
```

Contains the full menu template with all accelerators, click handlers, and tab-switch items.

### Module 4: `src/main.ts` (slimmed)

What remains:
- Process error handlers (lines 1-11)
- Imports (reduced — no more IPC/menu-specific imports)
- Module-level manager variables
- `createWindow()` — BrowserWindow creation, stealth, dispatcher, webview handlers
- `startAPI()` — manager instantiation + calls `registerIpcHandlers(deps)` + API start
- Bootstrap: `app.whenReady()`, `will-quit` cleanup, `window-all-closed`

## Circular Dependency Fix (Item 4)

Before:
```
main.ts exports wingmanAlert
  ← browser.ts imports from main
  ← watcher.ts imports from main
  ← headless/manager.ts imports from main
```

After:
```
notifications/alert.ts exports wingmanAlert
  ← browser.ts imports from notifications/alert
  ← watcher.ts imports from notifications/alert
  ← headless/manager.ts imports from notifications/alert
main.ts calls setMainWindow() — no circular dependency
```

## Testing

- `npx tsc --noEmit` must pass with zero errors
- `npx vitest run` must pass (all existing tests)
- Manual: app starts, IPC works, menu works, wingmanAlert works
