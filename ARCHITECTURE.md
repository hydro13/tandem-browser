# Tandem Browser — Architecture Guide

> Structure-focused system overview for AI developers.
> Read this to understand how the pieces fit together.
> For product vision, read PROJECT.md. For workflow rules, read AGENTS.md.

## System Overview

Tandem is an Electron 40 application with three distinct layers:

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Webview (Chromium)                                │
│  The actual web pages. Websites see "Chrome on macOS."      │
│  AI agents must NEVER inject into this layer directly.      │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Shell (Renderer)                                  │
│  Browser UI: tab bar, sidebar, Wingman panel, draw canvas.  │
│  Lives in shell/index.html + shell/js/ + shell/css/         │
│  Communicates with Layer 1 via contextBridge (preload.ts)   │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Main Process (Node.js)                            │
│  All managers, security, API server, MCP server.            │
│  Lives in src/. This is where all the logic runs.           │
│  Exposes HTTP API on 127.0.0.1:8765 and MCP via stdio.     │
└─────────────────────────────────────────────────────────────┘
         │
         │ MCP (stdio) or HTTP (localhost:8765)
         ▼
┌─────────────────────┐
│  AI Agent            │
│  Claude, OpenClaw,   │
│  Cursor, or any      │
│  MCP/HTTP client     │
└─────────────────────┘
```

**Critical rule:** Layer 3 (webview) must never know Layer 1 or Layer 2 exist.
All automated interaction goes through `webContents.sendInputEvent()`, never
DOM injection. See AGENTS.md "Anti-Detection Architecture" for details.

## Request Flow

How an AI agent's action travels through the system:

```
Agent calls MCP tool "tandem_click"
  → src/mcp/tools/snapshots.ts handles the tool call
  → Calls HTTP API internally or manager method directly
  → src/api/routes/snapshots.ts (if via HTTP)
  → ctx.snapshotManager.clickByRef(ref)
  → src/snapshot/manager.ts resolves the @ref to a DOM element
  → webContents.sendInputEvent({ type: 'mouseDown', ... })
  → Chromium processes the click as a real user event
  → Website JavaScript sees Event.isTrusted === true
```

For read operations:
```
Agent calls MCP tool "tandem_read_page"
  → src/mcp/tools/content.ts
  → ctx.contentExtractor.extract(tabId)
  → src/content/extractor.ts
  → webContents.executeJavaScript() (minimal, from main process)
  → Returns structured markdown to the agent
```

## Manager System

All business logic lives in managers. The full registry is in
`src/registry.ts` (46 managers). Managers are instantiated in `src/main.ts`
and wired together in `src/bootstrap/`.

### Manager Lifecycle

```
1. Constructor    — store dependencies (BrowserWindow, config paths)
2. init()         — async setup, load files from ~/.tandem/
3. Public methods — the API surface that routes and MCP tools call
4. setSyncManager — optional, for managers that sync state
5. cleanup()      — called on app quit (will-quit event)
```

### Manager Dependencies

Managers do NOT import each other. They receive dependencies through:
- Constructor injection (BrowserWindow)
- Setter injection (setSyncManager, setMainWindow)
- The ManagerRegistry (passed as RouteContext to API routes)

This keeps the dependency graph as a DAG with no circular imports.

### Where State Lives

All persistent data is stored in `~/.tandem/`:

| Data | File/Directory | Manager |
|------|---------------|---------|
| API token | `api-token` | API server |
| Sidebar config | `sidebar-config.json` | SidebarManager |
| Workspaces | `workspaces.json` | WorkspaceManager |
| Bookmarks | `bookmarks/` | BookmarkManager |
| History | `history/` | HistoryManager |
| Behavior profiles | `behavior/` | BehaviorObserver |
| Sessions | `sessions/` | SessionManager |
| Extensions | `extensions/` | ExtensionLoader |
| Passwords | `passwords/` (AES-256-GCM) | Password vault |
| Pinboards | `pinboards/` | PinboardManager |
| Form memory | `form-memory/` (encrypted) | FormMemoryManager |
| Site memory | `site-memory/` | SiteMemoryManager |
| Config/settings | `config.json` | ConfigManager |
| Watch definitions | `watches.json` | WatchManager |
| Workflows | `workflows/` | WorkflowEngine |

## API Architecture

### HTTP API (src/api/)

Express server bound to `127.0.0.1:8765`. Bearer token auth from
`~/.tandem/api-token`. 19 route files in `src/api/routes/`, all following:

```typescript
export function registerXRoutes(router: Router, ctx: RouteContext): void {
  router.get('/endpoint', (req, res) => {
    try {
      const result = ctx.someManager.doThing();
      res.json({ ok: true, ...result });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
```

RouteContext is the ManagerRegistry + BrowserWindow. Every route handler
accesses managers through `ctx.` — never by importing managers directly.

### MCP Server (src/mcp/)

236 tools across 32 files in `src/mcp/tools/`. Each file mirrors an API
route domain. The MCP server calls the same manager methods as the HTTP API.

### Tab Targeting

Three ways to target a tab:
1. **Active tab** — default for most routes
2. **X-Tab-Id header** — target a specific tab without stealing focus
3. **X-Session header** — target a named session partition

## Security Architecture

Eight layers, each independent, running before content reaches the page:

```
Request from web
  → Layer 1: NetworkShield      (blocklist: 811K+ entries)
  → Layer 2: OutboundGuard      (credential exfiltration scanning)
  → Layer 3: ContentAnalyzer    (typosquatting, risk scoring 0-100)
  → Layer 4: ScriptGuard        (CDP script fingerprinting, keylogger/miner detection)
  → Layer 5: BehaviorMonitor    (Welford's algorithm, per-domain anomaly detection)
  → Layer 6: GatekeeperWebSocket (AI agent real-time decisions)
  → Layer 7: EvolutionEngine    (adaptive threat rules, learning from new patterns)
  → Layer 8: PromptInjection    (scans agent-facing content for injection attempts)
  → Content delivered to webview (or blocked)
```

Security code lives in `src/security/`. Key files:

| File | Layer |
|------|-------|
| `network-shield.ts` | Layer 1 — domain/IP blocklists |
| `outbound-guard.ts` | Layer 2 — POST body scanning |
| `content-analyzer.ts` | Layer 3 — page risk analysis |
| `script-guard.ts` | Layer 4 — script fingerprinting |
| `behavior-monitor.ts` | Layer 5 — anomaly detection |
| `gatekeeper-ws.ts` | Layer 6 — AI decision channel |
| `evolution.ts` | Layer 7 — adaptive threat rules |
| `prompt-injection-guard.ts` | Layer 8 — injection defense |
| `security-manager.ts` | Orchestrator for all layers |
| `guardian.ts` | Unified threat coordination |

## Shell Architecture

The browser UI lives in `shell/` and runs in the Electron renderer process.

```
shell/
├── index.html          Main UI frame (sidebar, tab bar, Wingman panel)
├── js/
│   ├── tabs.js         Tab rendering, navigation, zoom, active-tab state
│   ├── browser-tools.js  Bookmarks, history, find, voice, settings, screenshots
│   ├── draw.js         Draw overlay, annotations, screenshot compositing
│   ├── window-chrome.js  Window controls, traffic lights, resize
│   └── shortcut-router.js  Keyboard shortcut handling
├── css/
│   └── main.css        All shell styles
├── newtab.html         New tab page
├── settings.html       Settings page
├── about.html          About page
└── bookmarks.html      Bookmarks manager
```

Shell communicates with main process through `contextBridge` (defined in
`src/preload.ts`). The shell NEVER accesses Node.js directly.

## Adding New Features

### Adding a new manager

1. Create `src/yourfeature/manager.ts` following the lifecycle pattern above
2. Add the type to `src/registry.ts`
3. Instantiate in `src/main.ts` (or appropriate `src/bootstrap/` file)
4. Add cleanup in the `will-quit` handler if needed

### Adding new API endpoints

1. Create `src/api/routes/yourfeature.ts` with `registerYourFeatureRoutes()`
2. Register in `src/api/server.ts`
3. Access managers through `ctx.yourManager`
4. Return `{ ok: true, data }` or use `handleRouteError(res, e)`

### Adding new MCP tools

1. Create `src/mcp/tools/yourfeature.ts`
2. Register in `src/mcp/server.ts`
3. Call the same manager methods the HTTP routes use

### Adding shell UI

1. Add HTML/JS in `shell/`
2. If it needs main process data, add an IPC channel in `src/shared/ipc-channels.ts`
3. Expose it through `src/preload.ts` contextBridge
4. Keep all AI/agent logic in the main process, never in the shell

## File Naming Conventions

- **Files:** kebab-case (`tab-lock-manager.ts`)
- **Classes:** PascalCase (`TabLockManager`)
- **Variables/functions:** camelCase (`getActiveTab()`)
- **IPC channels:** namespaced strings (`tandem:tab:focus`)
- **API routes:** kebab-case paths (`/tabs/list`, `/workspace/move-tab`)
- **MCP tools:** snake_case (`tandem_click`, `tandem_read_page`)

## Testing Strategy

### Framework and Configuration

Vitest with v8 coverage. Configuration in `vitest.config.ts`:

```
include:  src/**/tests/**/*.test.ts
setup:    src/api/tests/setup.ts   (patches supertest for IPv4/IPv6)
coverage: v8, reporters: text + html + json-summary
```

Key commands:

| Command | Purpose |
|---------|---------|
| `npm test` | Run all tests once (`vitest run`) |
| `npm run verify` | Compile + lint + test + consistency check |
| `npx vitest run --coverage` | Tests with coverage report |

### Test Location Convention

Tests live alongside their domain in `src/<domain>/tests/<name>.test.ts`:

```
src/
├── bookmarks/
│   ├── manager.ts
│   └── tests/
│       └── bookmarks.test.ts
├── api/
│   ├── routes/
│   │   ├── tabs.ts
│   │   └── content.ts
│   └── tests/
│       └── routes/
│           ├── tabs.test.ts
│           └── content.test.ts
└── mcp/
    ├── tools/
    │   ├── tabs.ts
    │   └── content.ts
    └── tests/
        ├── tabs.test.ts
        └── content.test.ts
```

API route tests mirror route filenames under `src/api/tests/routes/`.
MCP tool tests mirror tool filenames under `src/mcp/tests/`.

### Test Categories

| Category | Location | Files | What they test |
|----------|----------|-------|----------------|
| Manager unit tests | `src/<domain>/tests/` | 22 | Core manager logic (bookmarks, history, config, tabs, etc.) |
| API route tests | `src/api/tests/routes/` | 15 | HTTP endpoints via supertest, auth, error handling |
| MCP tool tests | `src/mcp/tests/` | 31 | Tool registration, argument validation, manager delegation |
| Security tests | `src/security/tests/` | 11 | Shield layers, threat detection, crypto, evolution engine |
| Extension tests | `src/extensions/tests/` | 4 | Extension loading, action polyfill, native messaging, trust |
| Utility tests | `src/utils/tests/` | 4 | Logger, constants, security helpers, general utils |

87 test files total.

### Writing New Tests

1. Create `src/<domain>/tests/<feature>.test.ts`
2. Mock Electron — `vi.mock('electron')` (most managers need `BrowserWindow`)
3. Mock the filesystem — `vi.mock('fs/promises')` for managers that persist to `~/.tandem/`
4. Test the public API — the same methods that routes and MCP tools call
5. Verify both success and error paths — use `handleRouteError` patterns for API tests

### CI Integration

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `verify.yml` | Every push and PR | `npm run verify` + coverage upload to Codecov |
| `codeql.yml` | PRs to main + weekly (Monday 04:00 UTC) | CodeQL security analysis |

Both checks must pass before merge. Coverage is tracked via Codecov with a
README badge.

## Key Design Constraints

1. **Local-first** — no data leaves the machine through Tandem
2. **Stealth** — websites must never detect this is an AI browser
3. **Node security** — `nodeIntegration: false`, `contextIsolation: true`
4. **API binding** — `127.0.0.1` only, never `0.0.0.0`
5. **No DOM injection** — all interaction via `sendInputEvent` or main process
6. **Single partition** — webview uses `persist:tandem` always
