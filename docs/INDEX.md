# Documentation Index

> Navigation map for the entire Tandem Browser project.
> Read this to understand where everything lives.

## Start Here

Read these files in this order:

1. **[README.md](../README.md)** — Product overview, quick start, MCP/HTTP setup
2. **[PROJECT.md](../PROJECT.md)** — Architecture, philosophy, security model
3. **[AGENTS.md](../AGENTS.md)** — Rules for AI developers working on this codebase
4. **[CONTRIBUTING.md](../CONTRIBUTING.md)** — How to contribute
5. **[TODO.md](../TODO.md)** — Active engineering backlog (the source of truth)
6. **[skill/SKILL.md](../skill/SKILL.md)** — Agent instruction manual for using Tandem via MCP/HTTP

## Source Code

### Entry Points

| File | Purpose |
|------|---------|
| `src/main.ts` | App lifecycle, window creation, manager instantiation |
| `src/registry.ts` | Central manager registry — **read this to understand the system** |
| `src/api/server.ts` | Express API bootstrap, route registration |
| `src/mcp/server.ts` | MCP server entry point (236 tools) |
| `src/preload.ts` | contextBridge API surface for renderer |

### Modules (src/)

Each module is a self-contained subsystem with its own manager.

| Module | Key File | Responsibility |
|--------|----------|---------------|
| `activity/` | `tracker.ts`, `wingman-stream.ts` | User activity tracking, Wingman awareness stream |
| `agents/` | `task-manager.ts`, `tab-lock-manager.ts` | Agent task approval, tab locking for multi-agent |
| `api/` | `server.ts`, `routes/` | Express HTTP API (300+ endpoints) |
| `auth/` | `login-manager.ts` | Login detection, auth state tracking |
| `behavior/` | `observer.ts` | Learn user browsing patterns for humanized automation |
| `bookmarks/` | `manager.ts` | Bookmark tree, CRUD, search |
| `bootstrap/` | (multiple) | App startup wiring, extracted from main.ts |
| `bridge/` | `context-bridge.ts` | Main ↔ renderer communication bridge |
| `claronote/` | `manager.ts` | Voice-to-text integration (ClaroNote SaaS) |
| `clipboard/` | `manager.ts` | Clipboard read/write for agents |
| `config/` | `manager.ts` | App settings, persisted to ~/.tandem/ |
| `content/` | `extractor.ts` | Smart page-to-markdown extraction |
| `context-menu/` | (multiple) | Right-click context menus for tabs and pages |
| `device/` | `emulator.ts` | Mobile/tablet device emulation |
| `devtools/` | `manager.ts` | CDP bridge — console, network, DOM, storage |
| `downloads/` | `manager.ts` | Download progress, pause, resume |
| `draw/` | `overlay.ts` | Draw annotations visible to human and AI |
| `events/` | `stream.ts` | SSE event stream for real-time updates |
| `extensions/` | `loader.ts`, `manager.ts` | Chrome extension loading and management |
| `headless/` | `manager.ts` | Background browsing with dead-man switch |
| `history/` | `manager.ts` | Browsing history, full-text search |
| `import/` | `chrome-importer.ts` | Import bookmarks, history, cookies from Chrome |
| `input/` | (multiple) | Keyboard/mouse input simulation via sendInputEvent |
| `integrations/` | `google-photos.ts` | Google Photos upload for screenshots |
| `ipc/` | (multiple) | IPC channel definitions and handlers |
| `locators/` | `finder.ts` | Semantic element finding (by label, text, role) |
| `mcp/` | `server.ts`, `tools/` | MCP server with 236 tools across 32 files |
| `memory/` | `site-memory.ts`, `form-memory.ts` | Per-site notes, encrypted form field recall |
| `menu/` | (multiple) | Application menu (File, Edit, View, etc.) |
| `network/` | `inspector.ts`, `mocker.ts` | Network logging, HAR export, request mocking |
| `notifications/` | (multiple) | System notifications |
| `openclaw/` | (multiple) | OpenClaw gateway integration, Wingman chat |
| `pairing/` | `manager.ts` | Remote agent pairing (setup codes, token exchange, bindings) |
| `panel/` | `manager.ts` | Wingman side panel management |
| `passwords/` | (multiple) | Local password vault (AES-256-GCM) |
| `pinboards/` | `manager.ts` | Sidebar pinboards for saved items |
| `pip/` | `manager.ts` | Picture-in-picture mode |
| `preload/` | (multiple) | Preload scripts for webviews |
| `scripts/` | `injector.ts` | User script injection |
| `security/` | `security-manager.ts`, (8 layers) | 8-layer security shield |
| `session/` | (multiple) | Session persistence helpers |
| `sessions/` | `manager.ts`, `state.ts` | Isolated browser session partitions |
| `shared/` | `ipc-channels.ts` | Shared constants (IPC channel names) |
| `sidebar/` | `manager.ts` | Left sidebar config, panel routing |
| `snapshot/` | `manager.ts` | Accessibility tree with @ref IDs |
| `stealth/` | `manager.ts` | Anti-fingerprint, Chrome UA spoofing |
| `sync/` | `manager.ts` | Local sync and export |
| `tabs/` | `manager.ts` | Tab lifecycle, focus, groups, keyboard shortcuts |
| `utils/` | (multiple) | Logger, path helpers, shared utilities |
| `video/` | `recorder.ts` | Screen recording (application + region capture) |
| `voice/` | `recognition.ts` | Voice input via Web Speech API in shell |
| `watch/` | `watcher.ts` | Scheduled page monitoring |
| `workflow/` | `engine.ts` | Multi-step automation workflows |
| `workspaces/` | `manager.ts` | Named tab groups with icons and persistence |

### API Routes (src/api/routes/)

21 route files, all following the `registerXRoutes(router, ctx)` pattern:

| File | Endpoints | Domain |
|------|-----------|--------|
| `awareness.ts` | Activity digest, focus detection | AI awareness |
| `agents.ts` | Tasks, tab locks, autonomy, emergency stop | Agent coordination |
| `bootstrap.ts` | `/agent`, `/skill`, `/agent/manifest`, `/agent/version` | Agent discovery (public) |
| `browser.ts` | Navigate, click, type, scroll, screenshot | Core browser actions |
| `clipboard.ts` | Read/write clipboard | Clipboard access |
| `content.ts` | Page content, extraction, markdown | Content extraction |
| `data.ts` | Bookmarks, history, downloads, import/export | Persistent data |
| `devtools.ts` | Console, network, DOM, storage, performance | DevTools CDP bridge |
| `extensions.ts` | Extension CRUD, Chrome import, gallery | Extension system |
| `media.ts` | Voice, audio, video, screenshots, draw | Media and capture |
| `misc.ts` | Settings, passwords, watches, notifications | Utility endpoints |
| `network.ts` | Network log, mocking, HAR export, APIs | Network inspection |
| `pairing.ts` | Setup codes, token exchange, bindings, whoami | Remote agent pairing |
| `pinboards.ts` | Pinboard CRUD, items, settings | Sidebar pinboards |
| `previews.ts` | Create/update live HTML previews | Agent previews |
| `sessions.ts` | Session CRUD, state save/load, fetch relay | Session isolation |
| `sidebar.ts` | Sidebar config, state, activation, reorder | Sidebar management |
| `snapshots.ts` | Accessibility tree, @ref click/fill/text | Snapshot interaction |
| `sync.ts` | Sync surfaces, export | Data sync |
| `tabs.ts` | Tab CRUD, focus, groups, workspace assignment | Tab management |
| `workspaces.ts` | Workspace CRUD, tab movement, activation | Workspace management |

### MCP Tools (src/mcp/tools/)

32 tool files mirroring the HTTP API. Each file registers tools for one domain.

### Shell (Browser UI)

| File | Purpose |
|------|---------|
| `shell/index.html` | Main browser UI — sidebar, tab bar, Wingman panel |
| `shell/js/` | Modular renderer scripts (tabs, browser-tools, draw, etc.) |
| `shell/css/main.css` | All shell styles |
| `shell/newtab.html` | New tab page with quick links |
| `shell/settings.html` | Settings page |
| `shell/about.html` | About page |
| `shell/bookmarks.html` | Bookmarks manager page |

## Documentation

### Active Documentation

| Directory | Contents | When to read |
|-----------|----------|-------------|
| [implementations/](implementations/) | Current feature implementation docs (14 features) | When working on a specific subsystem |
| [plans/](plans/) | Design proposals for not-yet-implemented features (16 plans) | When planning new work |
| [templates/](templates/) | Templates for new feature docs, phase files, handoffs | When starting a new feature track |
| [research/](research/) | Opera gap analysis, feature inventories | For competitive context |
| [security-shield/](security-shield/) | Security architecture specs and phase docs | When working on security |
| [security-upgrade/](security-upgrade/) | Security intelligence upgrade (9 phases) | When working on security evolution |
| [Browser-extensions/](Browser-extensions/) | Extension system docs (10 phases) | When working on extensions |
| [agent-tools/](agent-tools/) | Agent tool development (3 phases + docs) | When adding MCP/API tools |
| [screenshots/](screenshots/) | Product screenshots for README and website | For marketing/docs |

### Reference Documentation

| File | Contents |
|------|----------|
| [api-current.md](api-current.md) | Current API notes for live features |
| [public-launch.md](public-launch.md) | Launch copy, taglines, GitHub topics |

### Internal (Historical)

| Directory | Contents | Note |
|-----------|----------|------|
| [internal/](internal/) | ROADMAP.md, STATUS.md | Historical snapshots, NOT the active backlog |
| [archive/](archive/) | Completed/superseded docs, old plans, past code reviews | Read only for context on past decisions |
| [temp/](temp/) | Working documents, migration notes | May be stale |

## Website

| File | Purpose |
|------|---------|
| [index.html](index.html) | tandembrowser.org landing page |
| [CNAME](CNAME) | GitHub Pages domain config → tandembrowser.org |
| [.nojekyll](.nojekyll) | Disables Jekyll processing for GitHub Pages |

## Other Root Files

| File | Purpose |
|------|---------|
| [CHANGELOG.md](../CHANGELOG.md) | Full release history |
| [SECURITY.md](../SECURITY.md) | Vulnerability reporting |
| [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | Community standards |
| [LICENSE](../LICENSE) | MIT license |
| `package.json` | Dependencies, scripts, version |
| `tsconfig.json` | TypeScript configuration |
| `vitest.config.ts` | Test configuration |
| `eslint.config.mjs` | Linting rules |
