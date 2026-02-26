# Design: Split api/server.ts into Route Files

**Date:** 2026-02-26
**Status:** Approved
**Issue:** Structure Improvements #1

---

## Problem

`src/api/server.ts` is ~1700 lines / ~3500 lines with all 160+ routes in a single `setupRoutes()` method. This file:
- Does not fit in a single AI context window
- Makes every route change require navigating a massive file
- Has a 35-parameter constructor (`TandemAPIOptions`)
- Contains a circular dependency (`import { copilotAlert } from '../main'`)

## Design

### Architecture

```
src/api/
├── server.ts        → Express setup, middleware, auth, route registration (~200 lines)
├── context.ts       → RouteContext interface + shared helpers (~60 lines)
└── routes/
    ├── browser.ts       → Core browser automation
    ├── tabs.ts          → Tab management
    ├── snapshots.ts     → Accessibility snapshots + element finding
    ├── devtools.ts      → CDP/DevTools endpoints
    ├── extensions.ts    → Extension management
    ├── network.ts       → Network inspection + mocking
    ├── sessions.ts      → Session isolation + device emulation
    ├── agents.ts        → Task management + autonomy
    ├── data.ts          → Bookmarks, history, downloads, config, import
    ├── content.ts       → Content extraction, context, scripts, styles
    ├── media.ts         → Voice, audio, screenshots, panel, chat, copilot-stream
    └── misc.ts          → Status, passwords, events, live, watch, headless, pip,
                           forms memory, site memory, behavior, activity-log,
                           claronote, workflows, auth, data wipe
```

### RouteContext — Shared Dependency Object

```typescript
// src/api/context.ts
import { Request } from 'express';
import { WebContents } from 'electron';

export interface RouteContext {
  win: Electron.BrowserWindow;
  tabManager: TabManager;
  panelManager: PanelManager;
  // ... all current managers from TandemAPIOptions
  // + the 3 internally-created managers:
  contentExtractor: ContentExtractor;
  workflowEngine: WorkflowEngine;
  loginManager: LoginManager;
}

// Shared helpers (currently private methods on TandemAPI)
export async function getActiveWC(ctx: RouteContext): Promise<WebContents | null>;
export async function execInActiveTab(ctx: RouteContext, code: string): Promise<any>;
export function getSessionPartition(ctx: RouteContext, req: Request): string;
export async function getSessionWC(ctx: RouteContext, req: Request): Promise<WebContents | null>;
export async function execInSessionTab(ctx: RouteContext, req: Request, code: string): Promise<any>;
```

### Route File Pattern

Each route file exports a single registration function:

```typescript
// src/api/routes/tabs.ts
import { Router } from 'express';
import { RouteContext, getActiveWC } from '../context';

export function registerTabRoutes(router: Router, ctx: RouteContext): void {
  router.post('/tabs/open', async (req, res) => {
    try {
      const { url, groupId, source, partition, focus } = req.body;
      const tab = await ctx.tabManager.openTab(
        url || `file://${path.join(__dirname, '..', '..', '..', 'shell', 'newtab.html')}`,
        groupId, source || 'copilot', partition, focus
      );
      ctx.eventStream.handleTabEvent('tab-opened', { tabId: tab.id, url });
      res.json({ ok: true, tab });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  // ... more tab routes
}
```

### server.ts — Thin Shell

```typescript
// src/api/server.ts (after refactor)
export class TandemAPI {
  private app: express.Application;
  private server: http.Server | null = null;
  private ctx: RouteContext;

  constructor(opts: TandemAPIOptions) {
    this.ctx = this.buildContext(opts);
    this.app = express();

    // Middleware (CORS, JSON, auth) — stays here
    this.setupMiddleware();

    // Register all route groups
    const router = express.Router();
    registerBrowserRoutes(router, this.ctx);
    registerTabRoutes(router, this.ctx);
    registerSnapshotRoutes(router, this.ctx);
    registerDevtoolsRoutes(router, this.ctx);
    registerExtensionRoutes(router, this.ctx);
    registerNetworkRoutes(router, this.ctx);
    registerSessionRoutes(router, this.ctx);
    registerAgentRoutes(router, this.ctx);
    registerDataRoutes(router, this.ctx);
    registerContentRoutes(router, this.ctx);
    registerMediaRoutes(router, this.ctx);
    registerMiscRoutes(router, this.ctx);
    this.app.use(router);

    // Security routes (already separate)
    if (this.ctx.securityManager) {
      this.ctx.securityManager.registerRoutes(this.app);
    }
  }
}
```

### Exact Route-to-File Mapping

#### `routes/browser.ts` — Core browser automation (~300 lines)
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
- `POST /wait`
- `GET /links`
- `GET /forms`
- `POST /copilot-alert`

#### `routes/tabs.ts` — Tab management (~100 lines)
- `POST /tabs/open`
- `POST /tabs/close`
- `GET /tabs/list`
- `POST /tabs/focus`
- `POST /tabs/group`
- `POST /tabs/source` (both occurrences — deduplicate the duplicate!)
- `POST /tabs/cleanup`

#### `routes/snapshots.ts` — Accessibility snapshots + element finding (~120 lines)
- `GET /snapshot`
- `POST /snapshot/click`
- `POST /snapshot/fill`
- `GET /snapshot/text`
- `POST /find`
- `POST /find/click`
- `POST /find/fill`
- `POST /find/all`

#### `routes/devtools.ts` — CDP/DevTools endpoints (~200 lines)
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

#### `routes/extensions.ts` — Extension management (~350 lines)
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

#### `routes/network.ts` — Network inspection + mocking (~130 lines)
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

#### `routes/sessions.ts` — Session isolation + device emulation (~150 lines)
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

#### `routes/agents.ts` — Task management + autonomy (~150 lines)
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

#### `routes/data.ts` — Bookmarks, history, downloads, config, import (~300 lines)
- `GET /bookmarks` + all `/bookmarks/*` (8 routes)
- `GET /history` + all `/history/*` (3 routes)
- `GET /downloads` + `/downloads/active` (2 routes)
- `GET /config` + `PATCH /config` (2 routes)
- `GET /data/export` + `POST /data/import` (2 routes)
- All `/import/chrome/*` (8 routes)

#### `routes/content.ts` — Content extraction, context, scripts, styles (~200 lines)
- `POST /content/extract`
- `POST /content/extract/url`
- All `/context/*` (5 routes)
- All `/scripts/*` (5 routes)
- All `/styles/*` (5 routes)

#### `routes/media.ts` — Voice, audio, screenshots, panel, chat, copilot-stream (~200 lines)
- `POST /panel/toggle`
- All `/chat/*` (5 routes)
- All `/voice/*` (3 routes)
- All `/audio/*` (4 routes)
- `GET /screenshot/annotated` + `POST /screenshot/annotated`
- `POST /draw/toggle`
- `GET /screenshots`
- All `/copilot-stream/*` (2 routes)

#### `routes/misc.ts` — Remaining routes (~350 lines)
- `GET /status`
- All `/passwords/*` (6 routes)
- All `/events/*` (2 routes)
- All `/live/*` (3 routes) + `liveMode` state
- All `/watch/*` (4 routes)
- All `/headless/*` (5 routes)
- All `/pip/*` (2 routes)
- All `/forms/memory/*` (4 routes)
- All `/memory/*` (4 routes)
- All `/behavior/*` (2 routes)
- `GET /activity-log`
- All `/claronote/*` (8 routes)
- All `/workflows/*` + `/workflow/*` (6 routes)
- All `/auth/*` (6 routes)
- `POST /data/wipe`
- `GET /config/openclaw-token`

## What Does NOT Change

1. **All URL paths remain identical** — zero breaking changes for API consumers
2. **Auth middleware stays in server.ts** — single location for security
3. **`TandemAPIOptions` interface stays** — refactoring that is Improvement #8
4. **`copilotAlert` circular dep stays** — that is Improvement #4
5. **Security routes stay in SecurityManager** — already separately registered
6. **`start()`, `stop()`, `getHttpServer()` stay on TandemAPI class**

## Known Issues to Fix During Implementation

1. **Duplicate `/tabs/source` route** — defined at both line 970 and line 1734. Keep one, remove the other.
2. **`liveMode` state** — currently a closure variable inside `setupRoutes()`. Move to a simple object/field in RouteContext or in the misc routes module.
3. **`contentExtractor`, `workflowEngine`, `loginManager`** — currently instantiated inside the TandemAPI constructor (not injected). Move creation to RouteContext builder or keep in server.ts.

## Testing Plan

After refactoring:
1. `npx tsc` — must compile without errors
2. `npx vitest run` — all existing tests must pass
3. Manual: `npm run dev` + verify API responds on localhost:8765
4. Smoke test key endpoints: `curl localhost:8765/status`, `curl localhost:8765/tabs/list`
