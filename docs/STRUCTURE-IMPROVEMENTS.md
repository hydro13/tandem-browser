# Structure Improvements — Voortgang

> Gebaseerd op `docs/CODEBASE-STRUCTURE-REPORT.md` (2026-02-26)
> Update dit bestand na elke sessie die aan een punt werkt.

## Status

| # | Verbetering | Status | Sessie | Notities |
|---|-------------|--------|--------|----------|
| 1 | Split `api/server.ts` in route files | DONE | 2026-02-26 | 3032→349 regels. 12 route files + context.ts |
| 2 | Split `main.ts` (IPC, bootstrap, menu) | DONE | 2026-02-26 | 1016→575 regels. 3 modules: ipc/, menu/, notifications/ |
| 3 | Shared utilities (`paths`, `url`, `errors`) | DONE | 2026-02-27 | `tandemDir()` in 40 files, `handleRouteError()` in 12 routes. URL utils overgeslagen (te divers). |
| 4 | Fix circulaire deps (`copilotAlert`) | DONE | 2026-02-26 | Verplaatst naar src/notifications/alert.ts + setter pattern |
| 5 | Unified `npm test` + meer tests | TODO | — | TabManager, API routes, activity handler |
| 6 | Type safety: CDP types + minder `any` | TODO | — | Begin bij devtools/types.ts |
| 7 | Split `shell/index.html` | TODO | — | JS naar shell/js/, CSS naar shell/css/ |
| 8 | Manager registry / DI pattern | TODO | — | Vervangt 35-param TandemAPIOptions |
| 9 | Expliciete initialisatie volgorde | TODO | — | SecurityManager builder/init pattern |
| 10 | Naming consistency | DONE | 2026-02-27 | `SessionManager.cleanup()` → `destroy()`. ChatMessage/ActivityEntry later. |

## Hoe te gebruiken

Start een sessie met:
> "Voer punt [N] uit van docs/STRUCTURE-IMPROVEMENTS.md"

Of voor meerdere quick wins:
> "Doe punten 3 en 4 van docs/STRUCTURE-IMPROVEMENTS.md"

## Logboek

<!-- Voeg hier per sessie een entry toe -->

### 2026-02-26 — Punt 1: Split `api/server.ts` in route files
- **Wat gedaan:** server.ts (3032 regels, 160+ routes) opgesplitst in 12 route files + context module
- **Bestanden aangemaakt:**
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
- **Bestanden gewijzigd:** `src/api/server.ts` (3032→349 regels)
- **Tests:** passing (86 passed, 38 skipped)
- **Openstaand:** geen

### 2026-02-26 — Punt 2+4: Split `main.ts` + fix circulaire deps
- **Wat gedaan:** main.ts (1016 regels) opgesplitst in 3 modules + copilotAlert circulaire dependency opgelost
- **Bestanden aangemaakt:**
  - `src/notifications/alert.ts` — copilotAlert + setMainWindow setter (breekt circulaire dep)
  - `src/menu/app-menu.ts` — buildAppMenu + MenuDeps interface (~130 regels)
  - `src/ipc/handlers.ts` — registerIpcHandlers + IpcDeps interface + syncTabsToContext (~295 regels)
- **Bestanden gewijzigd:**
  - `src/main.ts` (1016→575 regels)
  - `src/api/routes/browser.ts` — import copilotAlert van notifications/alert
  - `src/watch/watcher.ts` — import copilotAlert van notifications/alert
  - `src/headless/manager.ts` — import copilotAlert van notifications/alert
- **Tests:** passing (86 passed, 38 skipped)
- **Openstaand:** geen

### 2026-02-27 — Punt 3+10: Shared utilities + naming consistency
- **Wat gedaan:** `src/utils/paths.ts` (tandemDir, ensureDir) + `src/utils/errors.ts` (handleRouteError) aangemaakt. 40 bestanden gerefactored naar tandemDir(). 184 catch blocks in 12 route files vervangen door handleRouteError(). SessionManager.cleanup() hernoemd naar destroy().
- **Bestanden aangemaakt:**
  - `src/utils/paths.ts` — tandemDir() + ensureDir()
  - `src/utils/errors.ts` — handleRouteError()
  - `docs/plans/2026-02-27-shared-utils-design.md` — Design doc
- **Bestanden gewijzigd:** 40 src/ files + 1 cli/ file (tandemDir), 12 route files (handleRouteError), sessions/manager.ts + main.ts (cleanup→destroy)
- **Tests:** passing (86 passed, 38 skipped)
- **Openstaand:** URL utilities overgeslagen (patronen te divers). ChatMessage/ActivityEntry type renames later.

### Template
```
### [datum] — Punt [N]: [titel]
- **Wat gedaan:** ...
- **Bestanden gewijzigd:** ...
- **Tests:** passing / failing
- **Openstaand:** ...
```
