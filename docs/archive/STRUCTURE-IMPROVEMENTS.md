# Structure Improvements — Voortgang

> Gebaseerd op `docs/CODEBASE-STRUCTURE-REPORT.md` (2026-02-26)
> Update this file na elke session that about a punt works.

## Status

| # | Verbetering | Status | Sessie | Notities |
|---|-------------|--------|--------|----------|
| 1 | Split `api/server.ts` in route files | DONE | 2026-02-26 | 3032→349 rules. 12 route files + context.ts |
| 2 | Split `main.ts` (IPC, bootstrap, menu) | DONE | 2026-02-26 | 1016→575 rules. 3 modules: ipc/, menu/, notifications/ |
| 3 | Shared utilities (`paths`, `url`, `errors`) | DONE | 2026-02-27 | `tandemDir()` in 40 files, `handleRouteError()` in 12 routes. URL utils overgeslagen (te divers). |
| 4 | Fix circulaire deps (`wingmanAlert`) | DONE | 2026-02-26 | Verplaatst to src/notifications/alert.ts + setter pattern |
| 5 | Unified `npm test` + meer tests | DONE | 2026-02-27 | 152 tests (was 86). TabManager, TaskManager, utils tests. |
| 6 | Type safety: CDP types + minder `any` | DONE | 2026-02-27 | 12 CDP types, catch blocks, subscriber handlers |
| 7 | Split `shell/index.html` | DONE | 2026-02-27 | 6572→451 rules. 4 files: css/main.css, css/shortcuts.css, js/main.js, js/shortcuts.js |
| 8 | Manager registry / DI pattern | DONE | 2026-02-27 | ManagerRegistry in src/registry.ts. TandemAPIOptions: 35→3 params. RouteContext = type alias. |
| 9 | Expliciete initialisatie order | DONE | 2026-02-27 | SecurityManager.init() consolideert 3 losse calls. initGatekeeper apart (post-start). |
| 10 | Naming consistency | DONE | 2026-02-27 | `SessionManager.cleanup()` → `destroy()`. ChatMessage/ActivityEntry later. |

## Hoe te use

Start a session with:
> "Voer punt [N] out or docs/STRUCTURE-IMPROVEMENTS.md"

Or for multiple quick wins:
> "Doe punten 3 and 4 or docs/STRUCTURE-IMPROVEMENTS.md"

## Logboek

<!-- Voeg hier per session a entry toe -->

### 2026-02-26 — Punt 1: Split `api/server.ts` in route files
- **Wat gedaan:** server.ts (3032 rules, 160+ routes) opgesplitst in 12 route files + context module
- **Files aangemaakt:**
  - `src/api/context.ts` — RouteContext interface + 5 shared helpers
  - `src/api/routes/browser.ts` — 14 routes (navigate, click, type, execute-js, etc.)
  - `src/api/routes/tabs.ts` — 7 routes (open, close, list, focus, etc.)
  - `src/api/routes/snapshots.ts` — 8 routes (snapshot, find, click, fill, etc.)
  - `src/api/routes/devtools.ts` — 15 routes (console, network, DOM, CDP, etc.)
  - `src/api/routes/extensions.ts` — 14 routes (load, install, gallery, updates, etc.)
  - `src/api/routes/network.ts` — 10 routes (log, mock, route, etc.)
  - `src/api/routes/sessions.ts` — 11 routes (create, switch, device emulation, etc.)
  - `src/api/routes/agents.ts` — 15 routes (tasks, autonomy, tab locks, etc.)
  - `src/api/routes/data.ts` — 25 routes (bookmarks, history, downloads, config, import)
  - `src/api/routes/content.ts` — 14 routes (extract, context bridge, scripts, styles)
  - `src/api/routes/media.ts` — 19 routes (panel, chat, voice, audio, screenshots)
  - `src/api/routes/misc.ts` — 58 routes (status, passwords, events, live, workflows, etc.)
- **Files gewijzigd:** `src/api/server.ts` (3032→349 rules)
- **Tests:** passing (86 passed, 38 skipped)
- **Openstaand:** no

### 2026-02-26 — Punt 2+4: Split `main.ts` + fix circulaire deps
- **Wat gedaan:** main.ts (1016 rules) opgesplitst in 3 modules + wingmanAlert circulaire dependency opgelost
- **Files aangemaakt:**
  - `src/notifications/alert.ts` — wingmanAlert + setMainWindow setter (breekt circulaire dep)
  - `src/menu/app-menu.ts` — buildAppMenu + MenuDeps interface (~130 rules)
  - `src/ipc/handlers.ts` — registerIpcHandlers + IpcDeps interface + syncTabsToContext (~295 rules)
- **Files gewijzigd:**
  - `src/main.ts` (1016→575 rules)
  - `src/api/routes/browser.ts` — import wingmanAlert or notifications/alert
  - `src/watch/watcher.ts` — import wingmanAlert or notifications/alert
  - `src/headless/manager.ts` — import wingmanAlert or notifications/alert
- **Tests:** passing (86 passed, 38 skipped)
- **Openstaand:** no

### 2026-02-27 — Punt 3+10: Shared utilities + naming consistency
- **Wat gedaan:** `src/utils/paths.ts` (tandemDir, ensureDir) + `src/utils/errors.ts` (handleRouteError) aangemaakt. 40 files gerefactored to tandemDir(). 184 catch blocks in 12 route files vervangen door handleRouteError(). SessionManager.cleanup() hernoemd to destroy().
- **Files aangemaakt:**
  - `src/utils/paths.ts` — tandemDir() + ensureDir()
  - `src/utils/errors.ts` — handleRouteError()
  - `docs/plans/2026-02-27-shared-utils-design.md` — Design doc
- **Files gewijzigd:** 40 src/ files + 1 cli/ file (tandemDir), 12 route files (handleRouteError), sessions/manager.ts + main.ts (cleanup→destroy)
- **Tests:** passing (86 passed, 38 skipped)
- **Open:** URL utilities were skipped (patterns too diverse). ChatMessage/ActivityEntry type renames can come later.

### Template
```
### [date] — Punt [N]: [title]
- **Wat gedaan:** ...
- **Files gewijzigd:** ...
- **Tests:** passing / failing
- **Openstaand:** ...
```
