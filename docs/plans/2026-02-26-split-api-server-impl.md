# Split api/server.ts — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split the monolithic `src/api/server.ts` (~3500 lines, 160+ routes) into 12 route files, a context module, and a slim server shell — zero breaking changes to API consumers.

**Architecture:** Extract a `RouteContext` interface that holds all managers + shared helpers. Each route file exports a single `registerXxxRoutes(router, ctx)` function. The slimmed server.ts does Express setup, middleware, auth, and calls all 12 register functions.

**Tech Stack:** TypeScript, Express, Electron

---

## Pre-flight

Before starting, verify the codebase compiles:

```bash
npx tsc --noEmit
```

If this fails, fix existing errors first.

---

### Task 1: Create `src/api/context.ts` — RouteContext interface + shared helpers

**Files:**
- Create: `src/api/context.ts`

**Step 1: Create the context module**

This file defines the shared dependency object and helper functions currently living as private methods on TandemAPI (lines 265-303 of server.ts).

```typescript
// src/api/context.ts
import { Request } from 'express';
import { BrowserWindow, webContents } from 'electron';
import { TabManager } from '../tabs/manager';
import { PanelManager } from '../panel/manager';
import { DrawOverlayManager } from '../draw/overlay';
import { ActivityTracker } from '../activity/tracker';
import { VoiceManager } from '../voice/recognition';
import { BehaviorObserver } from '../behavior/observer';
import { ConfigManager } from '../config/manager';
import { SiteMemoryManager } from '../memory/site-memory';
import { WatchManager } from '../watch/watcher';
import { HeadlessManager } from '../headless/manager';
import { FormMemoryManager } from '../memory/form-memory';
import { ContextBridge } from '../bridge/context-bridge';
import { PiPManager } from '../pip/manager';
import { NetworkInspector } from '../network/inspector';
import { ChromeImporter } from '../import/chrome-importer';
import { BookmarkManager } from '../bookmarks/manager';
import { HistoryManager } from '../history/manager';
import { DownloadManager } from '../downloads/manager';
import { AudioCaptureManager } from '../audio/capture';
import { ExtensionLoader } from '../extensions/loader';
import { ExtensionManager } from '../extensions/manager';
import { ClaroNoteManager } from '../claronote/manager';
import { ContentExtractor } from '../content/extractor';
import { WorkflowEngine } from '../workflow/engine';
import { LoginManager } from '../auth/login-manager';
import { EventStreamManager } from '../events/stream';
import { TaskManager } from '../agents/task-manager';
import { TabLockManager } from '../agents/tab-lock-manager';
import { DevToolsManager } from '../devtools/manager';
import { CopilotStream } from '../activity/copilot-stream';
import { SecurityManager } from '../security/security-manager';
import { SnapshotManager } from '../snapshot/manager';
import { NetworkMocker } from '../network/mocker';
import { SessionManager } from '../sessions/manager';
import { StateManager } from '../sessions/state';
import { ScriptInjector } from '../scripts/injector';
import { LocatorFinder } from '../locators/finder';
import { DeviceEmulator } from '../device/emulator';

export interface RouteContext {
  win: BrowserWindow;
  tabManager: TabManager;
  panelManager: PanelManager;
  drawManager: DrawOverlayManager;
  activityTracker: ActivityTracker;
  voiceManager: VoiceManager;
  behaviorObserver: BehaviorObserver;
  configManager: ConfigManager;
  siteMemory: SiteMemoryManager;
  watchManager: WatchManager;
  headlessManager: HeadlessManager;
  formMemory: FormMemoryManager;
  contextBridge: ContextBridge;
  pipManager: PiPManager;
  networkInspector: NetworkInspector;
  chromeImporter: ChromeImporter;
  bookmarkManager: BookmarkManager;
  historyManager: HistoryManager;
  downloadManager: DownloadManager;
  audioCaptureManager: AudioCaptureManager;
  extensionLoader: ExtensionLoader;
  extensionManager: ExtensionManager;
  claroNoteManager: ClaroNoteManager;
  contentExtractor: ContentExtractor;
  workflowEngine: WorkflowEngine;
  loginManager: LoginManager;
  eventStream: EventStreamManager;
  taskManager: TaskManager;
  tabLockManager: TabLockManager;
  devToolsManager: DevToolsManager;
  copilotStream: CopilotStream;
  securityManager: SecurityManager | null;
  snapshotManager: SnapshotManager;
  networkMocker: NetworkMocker;
  sessionManager: SessionManager;
  stateManager: StateManager;
  scriptInjector: ScriptInjector;
  locatorFinder: LocatorFinder;
  deviceEmulator: DeviceEmulator;
}

/** Get active tab's WebContents, or null */
export async function getActiveWC(ctx: RouteContext): Promise<Electron.WebContents | null> {
  return ctx.tabManager.getActiveWebContents();
}

/** Run JS in the active tab's webview */
export async function execInActiveTab(ctx: RouteContext, code: string): Promise<any> {
  const wc = await getActiveWC(ctx);
  if (!wc) throw new Error('No active tab');
  return wc.executeJavaScript(code);
}

/** Resolve X-Session header to partition string */
export function getSessionPartition(ctx: RouteContext, req: Request): string {
  const sessionName = req.headers['x-session'] as string;
  if (!sessionName || sessionName === 'default') {
    return 'persist:tandem';
  }
  return ctx.sessionManager.resolvePartition(sessionName);
}

/** Get WebContents for a session (via X-Session header) */
export async function getSessionWC(ctx: RouteContext, req: Request): Promise<Electron.WebContents | null> {
  const sessionName = req.headers['x-session'] as string;
  if (!sessionName || sessionName === 'default') {
    return getActiveWC(ctx);
  }
  const partition = getSessionPartition(ctx, req);
  const tabs = ctx.tabManager.listTabs().filter(t => t.partition === partition);
  if (tabs.length === 0) return null;
  return webContents.fromId(tabs[0].webContentsId) || null;
}

/** Run JS in a session's tab (via X-Session header) */
export async function execInSessionTab(ctx: RouteContext, req: Request, code: string): Promise<any> {
  const wc = await getSessionWC(ctx, req);
  if (!wc) throw new Error('No active tab for this session');
  return wc.executeJavaScript(code);
}
```

**Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: No errors (context.ts is standalone, not imported yet).

**Step 3: Commit**

```bash
git add src/api/context.ts
git commit -m "refactor: add RouteContext interface and shared helpers"
```

---

### Task 2: Create `src/api/routes/browser.ts`

**Files:**
- Create: `src/api/routes/browser.ts`
- Modify: `src/api/server.ts`

**Routes moved:** (from server.ts lines 501-905)
- `POST /navigate`
- `GET /page-content`
- `GET /page-html`
- `POST /click`
- `POST /type`
- `POST /execute-js`
- `GET /screenshot`
- `GET /cookies`
- `POST /cookies/clear`
- `POST /scroll`
- `POST /copilot-alert`
- `POST /wait`
- `GET /links`
- `GET /forms`

**Step 1: Create the route file**

Create `src/api/routes/browser.ts`. The file should:
- `import { Router, Request, Response } from 'express';`
- `import path from 'path';` and `import os from 'os';`
- `import { RouteContext, getActiveWC, execInActiveTab, getSessionWC, execInSessionTab, getSessionPartition } from '../context';`
- `import { copilotAlert } from '../../main';`
- `import { humanizedClick, humanizedType } from '../../input/humanized';`
- Export `function registerBrowserRoutes(router: Router, ctx: RouteContext): void`
- Copy all 14 route handlers from server.ts lines 501-905
- Replace every `this.xxx` with `ctx.xxx`
- Replace `this.getActiveWC()` with `getActiveWC(ctx)`
- Replace `this.execInActiveTab(code)` with `execInActiveTab(ctx, code)`
- Replace `this.getSessionWC(req)` with `getSessionWC(ctx, req)`
- Replace `this.execInSessionTab(req, code)` with `execInSessionTab(ctx, req, code)`
- Replace `this.getSessionPartition(req)` with `getSessionPartition(ctx, req)`
- Replace `this.app.post(...)` / `this.app.get(...)` with `router.post(...)` / `router.get(...)`

**Step 2: Wire it into server.ts**

In `server.ts`:
- Add import: `import { registerBrowserRoutes } from './routes/browser';`
- In the constructor, after `this.setupRoutes()` is called (we'll replace this later), OR:
  - At the **start** of `setupRoutes()`, add: `registerBrowserRoutes(this.app as any, this as any);`
  - Then **delete** lines 501-905 from `setupRoutes()`

Actually, the cleaner interim approach: in `setupRoutes()`, replace the browser route block with the register call. To do this:
1. Build a `RouteContext` object from `this` at the top of `setupRoutes()`:
```typescript
const ctx: RouteContext = {
  win: this.win,
  tabManager: this.tabManager,
  panelManager: this.panelManager,
  // ... all fields
};
```
Wait — this gets repetitive if done per-task. Better approach:

**Interim pattern (used for all tasks 2-13):**

Add a private method `buildContext()` to TandemAPI that returns a RouteContext:

```typescript
private buildContext(): RouteContext {
  return {
    win: this.win,
    tabManager: this.tabManager,
    panelManager: this.panelManager,
    drawManager: this.drawManager,
    activityTracker: this.activityTracker,
    voiceManager: this.voiceManager,
    behaviorObserver: this.behaviorObserver,
    configManager: this.configManager,
    siteMemory: this.siteMemory,
    watchManager: this.watchManager,
    headlessManager: this.headlessManager,
    formMemory: this.formMemory,
    contextBridge: this.contextBridge,
    pipManager: this.pipManager,
    networkInspector: this.networkInspector,
    chromeImporter: this.chromeImporter,
    bookmarkManager: this.bookmarkManager,
    historyManager: this.historyManager,
    downloadManager: this.downloadManager,
    audioCaptureManager: this.audioCaptureManager,
    extensionLoader: this.extensionLoader,
    extensionManager: this.extensionManager,
    claroNoteManager: this.claroNoteManager,
    contentExtractor: this.contentExtractor,
    workflowEngine: this.workflowEngine,
    loginManager: this.loginManager,
    eventStream: this.eventStream,
    taskManager: this.taskManager,
    tabLockManager: this.tabLockManager,
    devToolsManager: this.devToolsManager,
    copilotStream: this.copilotStream,
    securityManager: this.securityManager,
    snapshotManager: this.snapshotManager,
    networkMocker: this.networkMocker,
    sessionManager: this.sessionManager,
    stateManager: this.stateManager,
    scriptInjector: this.scriptInjector,
    locatorFinder: this.locatorFinder,
    deviceEmulator: this.deviceEmulator,
  };
}
```

Then at the **top** of `setupRoutes()`, create ctx once:
```typescript
const ctx = this.buildContext();
```

And call each register function as we extract routes. This way routes are extracted incrementally.

**Step 3: In `setupRoutes()`, replace the browser route block**

At the top of setupRoutes(), add:
```typescript
const ctx = this.buildContext();
registerBrowserRoutes(this.app as unknown as Router, ctx);
```

Then delete the entire browser routes block (lines 501-905 of original file).

Note: We pass `this.app` cast to `Router` because Express Application implements the Router interface. Alternatively, create an `express.Router()` and mount it — but casting is simpler for the interim. In the final Task 14 cleanup, we switch to a proper Router.

**Step 4: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 5: Commit**

```bash
git add src/api/routes/browser.ts src/api/server.ts
git commit -m "refactor: extract browser routes to routes/browser.ts"
```

---

### Task 3: Create `src/api/routes/tabs.ts`

**Files:**
- Create: `src/api/routes/tabs.ts`
- Modify: `src/api/server.ts`

**Routes moved:** (server.ts lines 907-1006)
- `POST /tabs/open`
- `POST /tabs/close`
- `GET /tabs/list`
- `POST /tabs/focus`
- `POST /tabs/group`
- `POST /tabs/source` — **keep only ONE copy** (line 970). Delete the duplicate at line 1734.
- `POST /tabs/cleanup`

**Step 1: Create `src/api/routes/tabs.ts`**

- Import: `Router, Request, Response` from express, `webContents` from electron
- Import: `RouteContext` from `../context`
- Export: `registerTabRoutes(router: Router, ctx: RouteContext): void`
- Copy routes, replace `this.xxx` → `ctx.xxx`, `this.app.xxx` → `router.xxx`

**Step 2: Wire into server.ts and delete extracted routes**

Add to setupRoutes() after browser registration:
```typescript
registerTabRoutes(this.app as unknown as Router, ctx);
```

Delete:
- Tab management block (lines 907-1006 in original)
- **Duplicate** `/tabs/source` at lines 1730-1744

**Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/api/routes/tabs.ts src/api/server.ts
git commit -m "refactor: extract tab routes to routes/tabs.ts (deduplicate /tabs/source)"
```

---

### Task 4: Create `src/api/routes/snapshots.ts`

**Files:**
- Create: `src/api/routes/snapshots.ts`
- Modify: `src/api/server.ts`

**Routes moved:** (server.ts lines 3215-3329)
- `GET /snapshot`
- `POST /snapshot/click`
- `POST /snapshot/fill`
- `GET /snapshot/text`
- `POST /find`
- `POST /find/click`
- `POST /find/fill`
- `POST /find/all`

**Step 1: Create `src/api/routes/snapshots.ts`**

- Import: `LocatorQuery` from `../../locators/finder`
- Export: `registerSnapshotRoutes(router: Router, ctx: RouteContext): void`

**Step 2: Wire and delete from server.ts**

**Step 3: Verify**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/api/routes/snapshots.ts src/api/server.ts
git commit -m "refactor: extract snapshot + locator routes to routes/snapshots.ts"
```

---

### Task 5: Create `src/api/routes/devtools.ts`

**Files:**
- Create: `src/api/routes/devtools.ts`
- Modify: `src/api/server.ts`

**Routes moved:** (server.ts lines 3022-3213)
- `GET /devtools/status`
- `GET /devtools/console`
- `GET /devtools/console/errors`
- `POST /devtools/console/clear`
- `GET /devtools/network`
- `GET /devtools/network/:requestId/body`
- `POST /devtools/network/clear`
- `POST /devtools/dom/query`
- `POST /devtools/dom/xpath`
- `GET /devtools/storage`
- `GET /devtools/performance`
- `POST /devtools/evaluate`
- `POST /devtools/cdp`
- `POST /devtools/screenshot/element`
- `POST /devtools/toggle`

**Step 1: Create `src/api/routes/devtools.ts`**

Export: `registerDevtoolsRoutes(router: Router, ctx: RouteContext): void`

Note: the `/devtools/toggle` route uses `ctx.tabManager.getActiveWebContents()` directly — this is fine.

**Step 2: Wire and delete from server.ts**

**Step 3: Verify**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/api/routes/devtools.ts src/api/server.ts
git commit -m "refactor: extract devtools routes to routes/devtools.ts"
```

---

### Task 6: Create `src/api/routes/extensions.ts`

**Files:**
- Create: `src/api/routes/extensions.ts`
- Modify: `src/api/server.ts`

**Routes moved:** (server.ts lines 2299-2646)
- `GET /extensions/list`
- `POST /extensions/load`
- `POST /extensions/install`
- `DELETE /extensions/uninstall/:id`
- `GET /extensions/chrome/list`
- `POST /extensions/chrome/import`
- `GET /extensions/gallery`
- `GET /extensions/native-messaging/status`
- `POST /extensions/identity/auth`
- `GET /extensions/updates/check`
- `GET /extensions/updates/status`
- `POST /extensions/updates/apply`
- `GET /extensions/disk-usage`
- `GET /extensions/conflicts`

**Step 1: Create `src/api/routes/extensions.ts`**

- Import: `path, os, fs` (needed for uninstall path logic)
- Import: `ChromeExtensionImporter` from `../../extensions/chrome-importer`
- Import: `GalleryLoader` from `../../extensions/gallery-loader`

**Step 2: Wire and delete from server.ts**

**Step 3: Verify**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/api/routes/extensions.ts src/api/server.ts
git commit -m "refactor: extract extension routes to routes/extensions.ts"
```

---

### Task 7: Create `src/api/routes/network.ts`

**Files:**
- Create: `src/api/routes/network.ts`
- Modify: `src/api/server.ts`

**Routes moved:** (server.ts lines 1768-1893)
- `GET /network/log`
- `GET /network/apis`
- `GET /network/domains`
- `DELETE /network/clear`
- `POST /network/mock`
- `POST /network/route`
- `GET /network/mocks`
- `POST /network/unmock`
- `POST /network/unroute`
- `POST /network/mock-clear`

**Step 1-4: Create, wire, verify, commit**

```bash
git commit -m "refactor: extract network routes to routes/network.ts"
```

---

### Task 8: Create `src/api/routes/sessions.ts`

**Files:**
- Create: `src/api/routes/sessions.ts`
- Modify: `src/api/server.ts`

**Routes moved:** (server.ts lines 3331-3472)
- `GET /sessions/list`
- `POST /sessions/create`
- `POST /sessions/switch`
- `POST /sessions/destroy`
- `POST /sessions/state/save`
- `POST /sessions/state/load`
- `GET /sessions/state/list`
- `GET /device/profiles`
- `GET /device/status`
- `POST /device/emulate`
- `POST /device/reset`

**Step 1: Create `src/api/routes/sessions.ts`**

Import `getSessionPartition, getSessionWC` from `../context`.

**Step 2-4: Wire, verify, commit**

```bash
git commit -m "refactor: extract session + device routes to routes/sessions.ts"
```

---

### Task 9: Create `src/api/routes/agents.ts`

**Files:**
- Create: `src/api/routes/agents.ts`
- Modify: `src/api/server.ts`

**Routes moved:** (server.ts lines 1248-1419)
- `GET /tasks`
- `GET /tasks/:id`
- `POST /tasks`
- `POST /tasks/:id/approve`
- `POST /tasks/:id/reject`
- `POST /tasks/:id/status`
- `POST /emergency-stop`
- `GET /tasks/check-approval`
- `GET /autonomy`
- `PATCH /autonomy`
- `GET /activity-log/agent`
- `GET /tab-locks`
- `POST /tab-locks/acquire`
- `POST /tab-locks/release`
- `GET /tab-locks/:tabId`

**Step 1-4: Create, wire, verify, commit**

```bash
git commit -m "refactor: extract agent + task routes to routes/agents.ts"
```

---

### Task 10: Create `src/api/routes/data.ts`

**Files:**
- Create: `src/api/routes/data.ts`
- Modify: `src/api/server.ts`

**Routes moved:**
- `GET /bookmarks` + all `/bookmarks/*` (lines 2107-2198)
- `GET /history` + `/history/*` (lines 2200-2233)
- `GET /downloads` + `/downloads/active` (lines 2235-2255)
- `GET /config` + `PATCH /config` (lines 1227-1246)
- `GET /data/export` + `POST /data/import` (lines 1440-1480)
- All `/import/chrome/*` (lines 2026-2105)
- `GET /config/openclaw-token` (lines 413-434)

**Step 1: Create `src/api/routes/data.ts`**

- Import: `path, os, fs`
- Import: `ChromeImporter` if needed for the import routes (but it's already in ctx)
- Note: `GET /config/openclaw-token` reads from filesystem directly — just needs `path, os, fs`

**Step 2-4: Wire, verify, commit**

```bash
git commit -m "refactor: extract data routes to routes/data.ts"
```

---

### Task 11: Create `src/api/routes/content.ts`

**Files:**
- Create: `src/api/routes/content.ts`
- Modify: `src/api/server.ts`

**Routes moved:**
- `POST /content/extract` (lines 2796-2813)
- `POST /content/extract/url` (lines 2815-2828)
- All `/context/*` (lines 1673-1728)
- All `/scripts/*` (lines 1895-1957)
- All `/styles/*` (lines 1959-2024)

**Step 1: Create `src/api/routes/content.ts`**

Import: `getActiveWC, getSessionWC` from `../context`

**Step 2-4: Wire, verify, commit**

```bash
git commit -m "refactor: extract content routes to routes/content.ts"
```

---

### Task 12: Create `src/api/routes/media.ts`

**Files:**
- Create: `src/api/routes/media.ts`
- Modify: `src/api/server.ts`

**Routes moved:**
- `POST /panel/toggle` (lines 1008-1020)
- All `/chat/*` (lines 1022-1105)
- All `/voice/*` (lines 1159-1188)
- All `/audio/*` (lines 2257-2297)
- `GET /screenshot/annotated` + `POST /screenshot/annotated` (lines 1107-1137)
- `POST /draw/toggle` (lines 1139-1147)
- `GET /screenshots` (lines 1149-1157)
- All `/copilot-stream/*` (lines 3474-3487)

**Step 1: Create `src/api/routes/media.ts`**

Import: `fs` (for chat image serving)

**Step 2-4: Wire, verify, commit**

```bash
git commit -m "refactor: extract media routes to routes/media.ts"
```

---

### Task 13: Create `src/api/routes/misc.ts`

**Files:**
- Create: `src/api/routes/misc.ts`
- Modify: `src/api/server.ts`

**Routes moved (everything remaining):**
- `GET /status` (lines 310-347)
- All `/passwords/*` (lines 349-411)
- All `/events/*` (lines 436-452)
- All `/live/*` (lines 454-499) — **includes `liveMode` state variable!**
- `GET /activity-log` (lines 1190-1212)
- `GET /behavior/stats` + `POST /behavior/clear` (lines 1214-1438)
- All `/memory/*` (site memory, lines 1482-1523)
- All `/watch/*` (lines 1525-1568)
- All `/headless/*` (lines 1570-1627)
- All `/forms/memory/*` (lines 1629-1671)
- All `/pip/*` (lines 1746-1766)
- All `/claronote/*` (lines 2648-2763)
- `POST /data/wipe` (lines 2765-2794)
- All `/workflows/*` + `/workflow/*` (lines 2830-2942)
- All `/auth/*` (lines 2944-3020)

**Step 1: Create `src/api/routes/misc.ts`**

Important: the `liveMode` closure variable (line 458 `let liveMode = false;`) must become a **module-level variable** in `misc.ts`:

```typescript
// Module-level state for live mode
let liveMode = false;
```

This keeps the same behavior without needing RouteContext changes.

Also needs: `import { passwordManager } from '../../passwords/manager';` (singleton import)
And: `import { copilotAlert } from '../../main';` — wait, copilot-alert was moved to browser.ts. Check.

Actually `POST /copilot-alert` was moved to browser.ts in Task 2. So misc.ts does NOT need copilotAlert.

But misc.ts does need `PasswordCrypto`:
```typescript
const { PasswordCrypto } = require('../../security/crypto');
```
This is a dynamic require in the original (line 408). Keep it as-is.

**Step 2: Wire and delete remaining routes from server.ts**

After this step, `setupRoutes()` should be **empty** (or nearly empty — only the register calls remain).

**Step 3: Verify**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/api/routes/misc.ts src/api/server.ts
git commit -m "refactor: extract misc routes to routes/misc.ts"
```

---

### Task 14: Slim down `server.ts` — final cleanup

**Files:**
- Modify: `src/api/server.ts`

**Step 1: Clean up server.ts**

At this point, `setupRoutes()` should contain only the `ctx = this.buildContext()` line and 12 register calls. Now do the final restructure:

1. **Remove `setupRoutes()` method entirely** — move the register calls into the constructor
2. **Remove unused imports** — any imports that are now only used in route files should be removed from server.ts. Keep only what's needed for: Express setup, CORS, auth middleware, and building the RouteContext.
3. **Remove the private helper methods** (`getActiveWC`, `execInActiveTab`, `getSessionPartition`, `getSessionWC`, `execInSessionTab`) — they now live in `context.ts`
4. **Keep**: `TandemAPIOptions` interface, `TandemAPI` class, `getOrCreateAuthToken()`, constructor with middleware setup, `buildContext()`, `start()`, `getHttpServer()`, `stop()`

The final constructor should look like:

```typescript
constructor(opts: TandemAPIOptions) {
  // ... assign all fields from opts (unchanged) ...

  this.contentExtractor = new ContentExtractor();
  this.workflowEngine = new WorkflowEngine();
  this.loginManager = new LoginManager();

  this.app = express();
  // CORS setup (unchanged)
  this.app.use(express.json({ limit: '50mb' }));
  // Auth middleware (unchanged)
  this.authToken = getOrCreateAuthToken();
  this.app.use((req, res, next) => { /* auth logic unchanged */ });

  // Register all route groups
  const ctx = this.buildContext();
  registerBrowserRoutes(this.app as unknown as Router, ctx);
  registerTabRoutes(this.app as unknown as Router, ctx);
  registerSnapshotRoutes(this.app as unknown as Router, ctx);
  registerDevtoolsRoutes(this.app as unknown as Router, ctx);
  registerExtensionRoutes(this.app as unknown as Router, ctx);
  registerNetworkRoutes(this.app as unknown as Router, ctx);
  registerSessionRoutes(this.app as unknown as Router, ctx);
  registerAgentRoutes(this.app as unknown as Router, ctx);
  registerDataRoutes(this.app as unknown as Router, ctx);
  registerContentRoutes(this.app as unknown as Router, ctx);
  registerMediaRoutes(this.app as unknown as Router, ctx);
  registerMiscRoutes(this.app as unknown as Router, ctx);

  // Security routes (already separate)
  if (this.securityManager) {
    this.securityManager.registerRoutes(this.app);
  }
}
```

**Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

**Step 3: Verify tests pass**

```bash
npx vitest run
```

**Step 4: Commit**

```bash
git add src/api/server.ts
git commit -m "refactor: slim server.ts to thin shell (~200 lines)"
```

---

### Task 15: Final verification

**Step 1: Full build check**

```bash
npx tsc --noEmit
```

**Step 2: Run tests**

```bash
npx vitest run
```

**Step 3: Line count check**

```bash
wc -l src/api/server.ts src/api/context.ts src/api/routes/*.ts
```

Expected: server.ts ~200 lines, total across all files similar to original ~3500 lines.

**Step 4: Update progress tracker**

Edit `docs/STRUCTURE-IMPROVEMENTS.md`:
- Change Item 1 status from `TODO` to `DONE`
- Add logbook entry

**Step 5: Commit**

```bash
git add docs/STRUCTURE-IMPROVEMENTS.md
git commit -m "docs: mark split api/server.ts as done"
```

---

## What Does NOT Change (reminder)

1. **All URL paths remain identical** — zero breaking changes
2. **Auth middleware stays in server.ts**
3. **`TandemAPIOptions` interface stays** — that's Improvement #8
4. **`copilotAlert` circular dep stays** — that's Improvement #4
5. **Security routes stay in SecurityManager**
6. **`start()`, `stop()`, `getHttpServer()` stay on TandemAPI class**

## Known Issues Fixed During Implementation

1. **Duplicate `/tabs/source` route** — removed in Task 3 (keep line 970 version, delete line 1734 version)
2. **`liveMode` closure variable** — moved to module-level `let` in `routes/misc.ts`
