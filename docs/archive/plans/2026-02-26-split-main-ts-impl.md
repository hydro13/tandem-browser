# Split main.ts + Fix Circular Dependencies — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split `src/main.ts` (1016 lines) into 3 focused modules and fix the `wingmanAlert` circular dependency.

**Architecture:** Extract IPC handlers, application menu, and `wingmanAlert` into separate modules with clean dependency interfaces. `main.ts` becomes a bootstrap orchestrator that creates managers and wires modules together.

**Tech Stack:** Electron, TypeScript, Express

---

### Task 1: Create `src/notifications/alert.ts` — fix circular dependency (Item 4)

**Files:**
- Create: `src/notifications/alert.ts`
- Modify: `src/api/routes/browser.ts:5` (update import)
- Modify: `src/watch/watcher.ts:7` (update import)
- Modify: `src/headless/manager.ts:3` (update import)
- Modify: `src/main.ts:954-960` (remove wingmanAlert, add setMainWindow calls)

**Step 1: Create `src/notifications/alert.ts`**

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

**Step 2: Update consumers — change imports**

In `src/api/routes/browser.ts`, change:
```typescript
// FROM:
import { wingmanAlert } from '../../main';
// TO:
import { wingmanAlert } from '../../notifications/alert';
```

In `src/watch/watcher.ts`, change:
```typescript
// FROM:
import { wingmanAlert } from '../main';
// TO:
import { wingmanAlert } from '../notifications/alert';
```

In `src/headless/manager.ts`, change:
```typescript
// FROM:
import { wingmanAlert } from '../main';
// TO:
import { wingmanAlert } from '../notifications/alert';
```

**Step 3: Update `src/main.ts`**

Remove the `wingmanAlert` function and its export (lines 954-960). Add import and setter calls:

Add to imports:
```typescript
import { setMainWindow } from './notifications/alert';
```

In `createWindow()`, after `mainWindow = new BrowserWindow(...)` (after line 258), add:
```typescript
setMainWindow(mainWindow);
```

In the `mainWindow.on('closed', ...)` handler (line 267), add:
```typescript
setMainWindow(null);
```

Also remove the `Notification` import from the electron import line (line 13) if it's no longer used in main.ts. Check first — if nothing else uses it, remove it.

**Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors

Run: `npx vitest run`
Expected: all tests pass

**Step 5: Commit**

```bash
git add src/notifications/alert.ts src/api/routes/browser.ts src/watch/watcher.ts src/headless/manager.ts src/main.ts
git commit -m "refactor: extract wingmanAlert to notifications/alert (fixes circular dep)"
```

---

### Task 2: Create `src/menu/app-menu.ts`

**Files:**
- Create: `src/menu/app-menu.ts`
- Modify: `src/main.ts` (remove `buildAppMenu()`, add import + call)

**Step 1: Create `src/menu/app-menu.ts`**

Extract `buildAppMenu()` from `main.ts` lines 831-951. The function currently references module-level variables via closure. Replace with a deps interface.

```typescript
import { app, BrowserWindow, Menu } from 'electron';
import { TabManager } from '../tabs/manager';
import { PanelManager } from '../panel/manager';
import { DrawOverlayManager } from '../draw/overlay';
import { VoiceManager } from '../voice/recognition';
import { PiPManager } from '../pip/manager';
import { ConfigManager } from '../config/manager';
import { AudioCaptureManager } from '../audio/capture';

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

export function buildAppMenu(deps: MenuDeps): void {
  const send = (action: string) => deps.mainWindow?.webContents.send('shortcut', action);

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
          deps.tabManager?.reopenClosedTab();
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
      label: deps.configManager?.getConfig().general.agentName || 'Wingman',
      submenu: [
        { label: 'Toggle Panel', accelerator: 'CmdOrCtrl+K', click: () => {
          deps.panelManager?.togglePanel();
        }},
        { label: 'Voice Input', accelerator: 'CmdOrCtrl+Shift+M', click: () => deps.voiceManager?.toggleVoice() },
        { label: 'PiP Mode', accelerator: 'CmdOrCtrl+Shift+P', click: () => deps.pipManager?.toggle() },
        { type: 'separator' },
        { label: 'Draw Mode', accelerator: 'CmdOrCtrl+Shift+D', click: () => deps.drawManager?.toggleDrawMode() },
        { label: 'Quick Screenshot', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('quick-screenshot') },
        { type: 'separator' },
        { label: 'Record Tab Audio', accelerator: 'CmdOrCtrl+R', click: () => {
          if (deps.audioCaptureManager) {
            if (deps.audioCaptureManager.isRecording()) {
              deps.audioCaptureManager.stopRecording();
              deps.mainWindow?.webContents.send('audio-recording-status', { recording: false });
            } else {
              const activeTab = deps.tabManager?.getActiveTab();
              if (activeTab) {
                deps.audioCaptureManager.startRecording(activeTab.webContentsId).then(() => {
                  deps.mainWindow?.webContents.send('audio-recording-status', { recording: true });
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
```

**Step 2: Update `src/main.ts`**

Remove the entire `buildAppMenu()` function (lines 831-951).

Add import at top:
```typescript
import { buildAppMenu } from './menu/app-menu';
```

Replace the call `buildAppMenu()` (line 970 in `app.whenReady`) with:
```typescript
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
```

Do the same for the `app.on('activate', ...)` callback (line 979).

Remove the `Menu` import from the electron import line (line 13) if no longer used in main.ts.

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors

**Step 4: Commit**

```bash
git add src/menu/app-menu.ts src/main.ts
git commit -m "refactor: extract buildAppMenu to menu/app-menu.ts"
```

---

### Task 3: Create `src/ipc/handlers.ts`

This is the largest extraction (~380 lines). The IPC handlers are in `startAPI()` from the IPC cleanup block through the end or the function.

**Files:**
- Create: `src/ipc/handlers.ts`
- Modify: `src/main.ts` (remove IPC handlers from `startAPI()`, add import + call)

**Step 1: Create `src/ipc/handlers.ts`**

Extract all IPC handlers from `startAPI()`. The file needs:

```typescript
import { ipcMain, BrowserWindow, webContents } from 'electron';
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
import { WingmanStream } from '../activity/wingman-stream';
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
  wingmanStream: WingmanStream;
  snapshotManager: SnapshotManager;
}

export function registerIpcHandlers(deps: IpcDeps): void {
  // Destructure for readability
  const {
    win, tabManager, panelManager, drawManager, voiceManager,
    behaviorObserver, siteMemory, formMemory, contextBridge,
    networkInspector, bookmarkManager, historyManager, eventStream,
    taskManager, contextMenuManager, devToolsManager, activityTracker,
    securityManager, scriptInjector, deviceEmulator, wingmanStream,
    snapshotManager,
  } = deps;

  // ═══ IPC Handler Cleanup — prevent duplicates on macOS reactivation ═══
  const ipcChannels = ['tab-update', 'tab-register', 'chat-send', 'voice-transcript', 'voice-status-update', 'activity-webview-event', 'form-submitted'];
  for (const channel or ipcChannels) {
    ipcMain.removeAllListeners(channel);
  }
  const ipcHandlerNames = ['snap-for-wingman', 'quick-screenshot', 'bookmark-page', 'unbookmark-page', 'is-bookmarked', 'tab-new', 'tab-close', 'tab-focus', 'tab-focus-index', 'tab-list', 'emergency-stop', 'show-tab-context-menu', 'chat-send-image', 'navigate', 'go-back', 'go-forward', 'reload', 'get-page-content', 'get-page-status', 'execute-js'];
  for (const handler or ipcHandlerNames) {
    try { ipcMain.removeHandler(handler); } catch { /* handler may not exist yet */ }
  }

  // Helper: sync tab list into ContextBridge for live context summary
  const syncTabsToContext = () => {
    if (tabManager && contextBridge) {
      contextBridge.updateTabs(tabManager.listTabs());
    }
  };

  // ... then paste ALL ipcMain.on(...) and ipcMain.handle(...) handlers
  // from startAPI(), replacing bare variable references with the
  // destructured deps variables (they have the same names, so no changes needed).
}
```

The key insight: because the destructured variable names match the original module-level variable names (`tabManager`, `panelManager`, etc.), the handler bodies can be copied verbatim with minimal changes:

- Replace `tabManager?.` with `tabManager?.` — **no change needed** (same variable name)
- Remove any `!` non-null assertions that were used because the module-level vars were `| null` — the `IpcDeps` interface types them as non-null (except `securityManager`)

Copy all handlers from main.ts lines 453-828 into `registerIpcHandlers()`. This includes:
- `tab-update` handler (line 454)
- `tab-register` handler (line 461)
- `chat-send` handler (line 482)
- `chat-send-image` handler (line 489)
- `snap-for-wingman` handler (line 497)
- `quick-screenshot` handler (line 510)
- `voice-transcript` handler (line 523)
- `voice-status-update` handler (line 530)
- `activity-webview-event` handler (line 539) — the big one (~100 lines)
- `form-submitted` handler (line 641)
- `bookmark-page` handler (line 650)
- `unbookmark-page` handler (line 660)
- `is-bookmarked` handler (line 671)
- `tab-new` handler (line 675)
- `tab-close` handler (line 686)
- `tab-focus` handler (line 696)
- `tab-focus-index` handler (line 712)
- `tab-list` handler (line 716)
- `show-tab-context-menu` handler (line 721)
- `emergency-stop` handler (line 726)
- `navigate` handler (line 738)
- `go-back` handler (line 747)
- `go-forward` handler (line 756)
- `reload` handler (line 765)
- `get-page-content` handler (line 774)
- `get-page-status` handler (line 788)
- `execute-js` handler (line 804)

**Important:** The `tab-register` handler in `startAPI()` (line 461) references `pendingTabRegister` which is a module-level variable in main.ts. This handler needs special treatment — it should stay in main.ts OR `pendingTabRegister` should be passed in via deps. Since it's only used in this one handler + the drain at the end or startAPI, **keep `tab-register` in main.ts** and only extract the other handlers.

Wait — actually looking more carefully, `tab-register` is registered TWICE:
1. Early in `app.whenReady()` (line 964) — temporary catcher before startAPI
2. Inside `startAPI()` (line 461) — the real handler

The early one stores to `pendingTabRegister`. The real one in startAPI also references `pendingTabRegister`. Both should stay in main.ts since they depend on the module-level `pendingTabRegister` variable. So **exclude `tab-register`** from the extraction.

**Step 2: Update `src/main.ts`**

In `startAPI()`:
1. Remove the IPC cleanup block (lines 436-444)
2. Remove the `syncTabsToContext` helper (lines 447-451)
3. Remove ALL `ipcMain.on(...)` handlers EXCEPT `tab-register` (line 461)
4. Remove ALL `ipcMain.handle(...)` handlers (lines 489-814)
5. Add call to `registerIpcHandlers`:

```typescript
import { registerIpcHandlers } from './ipc/handlers';

// Inside startAPI(), after all managers are created and wired:
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
  wingmanStream: wingmanStream!,
  snapshotManager: snapshotManager!,
});
```

Keep in `startAPI()`:
- All manager instantiation (lines 280-384)
- API startup (lines 386-434)
- The `tab-register` handler (line 461-479) — rename to avoid conflict with cleanup
- The `pendingTabRegister` drain (lines 817-828)

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors

Run: `npx vitest run`
Expected: all tests pass

**Step 4: Commit**

```bash
git add src/ipc/handlers.ts src/main.ts
git commit -m "refactor: extract IPC handlers to ipc/handlers.ts"
```

---

### Task 4: Clean up main.ts — remove unused imports

**Files:**
- Modify: `src/main.ts`

**Step 1: Remove unused imports from main.ts**

After the extractions, these imports may no longer be needed in main.ts (verify each):
- `Notification` from electron (moved to notifications/alert.ts)
- `Menu` from electron (moved to menu/app-menu.ts)
- `clipboard`, `nativeImage` from electron (check if used — likely unused)
- `globalShortcut` from electron (check if used — likely unused)

Keep:
- `app`, `BrowserWindow`, `session`, `ipcMain`, `webContents`, `WebContents` — used in createWindow/startAPI/bootstrap
- All manager imports — used in startAPI

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors

Run: `npx vitest run`
Expected: all tests pass

**Step 3: Verify line count**

Run: `wc -l src/main.ts src/notifications/alert.ts src/ipc/handlers.ts src/menu/app-menu.ts`
Expected: main.ts ~400 lines, alert.ts ~15 lines, handlers.ts ~400 lines, app-menu.ts ~130 lines

**Step 4: Commit**

```bash
git add src/main.ts
git commit -m "refactor: clean up unused imports in main.ts"
```

---

### Task 5: Update docs + final verification

**Files:**
- Modify: `docs/STRUCTURE-IMPROVEMENTS.md`

**Step 1: Update progress tracker**

Mark Items 2 and 4 as DONE in `docs/STRUCTURE-IMPROVEMENTS.md`:
```
| 2 | Split `main.ts` (IPC, bootstrap, menu) | DONE | 2026-02-26 | 1016→~400 rules. 3 modules extracted |
| 4 | Fix circulaire deps (`wingmanAlert`) | DONE | 2026-02-26 | Verplaatst to src/notifications/alert.ts |
```

Add logboek entry.

**Step 2: Final verification**

Run: `npx tsc --noEmit`
Expected: zero errors

Run: `npx vitest run`
Expected: all tests pass

**Step 3: Commit + push**

```bash
git add docs/STRUCTURE-IMPROVEMENTS.md
git commit -m "docs: mark Items 2+4 as DONE in STRUCTURE-IMPROVEMENTS"
git push
```
