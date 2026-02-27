# Code Quality Improvements — Status Tracker

> **Read this file FIRST when starting a new session.**
> Update this file after completing any item.

## Current State

**Version:** 0.11.0 (pending — bump after first item completed)
**Last completed item:** —
**Overall:** 0/19 done

---

## Quick Wins (items 1–10)

| # | Description | Status | Session | Commit |
|---|-------------|--------|---------|--------|
| 1 | **Constants file** — Extract `API_PORT` (8765, 7 files), `WEBHOOK_PORT` (18789, 3 files), `DEFAULT_PARTITION` ('persist:tandem', 4 files), `AUTH_POPUP_DOMAINS`, named timeouts to `src/utils/constants.ts` | TODO | | |
| 2 | **Delete dead code** — Remove `src/chat/interfaces.ts` (never imported). Rename duplicate `ActivityEntry` → `TaskActivityEntry` in `src/agents/task-manager.ts` | TODO | | |
| 3 | **Fix tab-register race condition** — Remove duplicate `ipcMain.on('tab-register')` listener at `src/main.ts:509`. The handler at line 471 + pending drain at 491-503 already covers all cases | TODO | | |
| 4 | **Silent catch → warn** — Replace 16× `.catch(() => {})` with `.catch(e => console.warn(...))` across 8 files (main.ts, panel/manager.ts, ipc/handlers.ts, device/emulator.ts, network/mocker.ts, script-guard.ts, security-manager.ts, mcp/server.ts) | TODO | | |
| 5 | **Timing-safe token comparison** — Replace `===` with `crypto.timingSafeEqual` in `src/api/server.ts:111,113`. Deprecate query string token (`?token=`) with console.warn | TODO | | |
| 6 | **Dutch → English** — Translate Dutch strings and comments to English in ~10 files (mcp/api-client.ts, device/emulator.ts, main.ts, task-manager.ts, tab-lock-manager.ts, routes/agents.ts, mcp/server.ts, context-bridge.ts) | TODO | | |
| 7 | **Extract script-guard pure functions** — Move `calculateEntropy`, `normalizeScriptSource`, `computeASTHash`, `computeSimilarity` from `src/security/script-guard.ts` lines 9-160 → `src/security/script-utils.ts` | TODO | | |
| 8 | **Named timeout constants** — Replace magic numbers `30000`, `500`, etc. with named constants like `CDP_ATTACH_DELAY_MS`, `DEFAULT_TIMEOUT_MS` | TODO | | |
| 9 | **Fix require('fs') in route** — Move `const fs = require('fs')` to top-level import in `src/api/routes/browser.ts:212` | TODO | | |
| 10 | **Fix setInterval(async) without try/catch** — Wrap async callbacks in `src/extensions/update-checker.ts:661` and `src/security/behavior-monitor.ts:137` | TODO | | |

## Medium Efforts (items 11–16)

| # | Description | Status | Session | Commit |
|---|-------------|--------|---------|--------|
| 11 | **Logger utility** — Create `src/utils/logger.ts` with levels (debug/info/warn/error) + config-driven min level. Replace 207 `console.log` calls across 48 files | TODO | | |
| 12 | **ESLint setup** — Add `eslint.config.mjs` with `@typescript-eslint/recommended`, `no-floating-promises`, `no-console: warn`, `no-unused-vars`, `consistent-type-imports`. Add `npm run lint` script | TODO | | |
| 13 | **Split security-manager routes** — Extract `registerRoutes()` (lines 391-965, 34 endpoints) from `src/security/security-manager.ts` (978 lines) → `src/security/routes.ts` | TODO | | |
| 14 | **Lazy passwordManager** — Convert singleton at `src/passwords/manager.ts:160` to lazy init (factory/getter) so SQLite DB only opens when vault first accessed | TODO | | |
| 15 | **Tests: pure logic modules** — Add tests for `config/manager.ts` (config load/merge/defaults), pure functions in `script-guard.ts`, `passwords/manager.ts` (encrypted CRUD) | TODO | | |
| 16 | **Execute-js timeout** — Add `Promise.race` timeout (30s) and code length limit (1MB) on `/execute-js` endpoint in `src/api/routes/browser.ts` | TODO | | |

## Large Efforts (items 17–19)

| # | Description | Status | Session | Commit |
|---|-------------|--------|---------|--------|
| 17 | **API route tests** — Add integration tests for all 12 route files (~3000 lines total). Needs Express mocking setup | TODO | | |
| 18 | **Split security-db.ts** — Split 958-line file by table group into `db-events.ts`, `db-baselines.ts`, `db-blocklist.ts` | TODO | | |
| 19 | **Split devtools/manager.ts** — Split 863-line file into CDP lifecycle manager + storage/DOM/performance inspector | TODO | | |

---

## Session Log

<!-- Add an entry after each session -->

### Template
```
### [date] — Session N: Items X, Y, Z
- **Items completed:** #X, #Y
- **Version bumped to:** 0.11.X
- **Commit(s):** abc1234
- **Notes:** ...
```

---

## Version & Changelog Convention

See `docs/code-quality/CONVENTIONS.md` for the version bump + changelog workflow.
