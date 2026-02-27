# Code Quality Improvements — Status Tracker

> **Read this file FIRST when starting a new session.**
> Update this file after completing any item.

## Current State

**Version:** 0.11.3
**Last completed item:** #11
**Overall:** 15/19 done

---

## Quick Wins (items 1–10)

| # | Description | Status | Session | Commit |
|---|-------------|--------|---------|--------|
| 1 | **Constants file** — Extract `API_PORT`, `WEBHOOK_PORT`, `DEFAULT_PARTITION`, `AUTH_POPUP_PATTERNS` to `src/utils/constants.ts` | DONE | 2026-02-27 | 0995eae |
| 2 | **Delete dead code** — Remove `src/chat/interfaces.ts`. Rename duplicate `ActivityEntry` → `TaskActivityEntry` | DONE | 2026-02-27 | 0995eae |
| 3 | **Fix tab-register race condition** — Remove duplicate `ipcMain.on('tab-register')` listener | DONE | 2026-02-27 | 0995eae |
| 4 | **Silent catch → warn** — Replace 16× `.catch(() => {})` with `.catch(e => console.warn(...))` | DONE | 2026-02-27 | 0995eae |
| 5 | **Timing-safe token comparison** — `crypto.timingSafeEqual` + deprecate query string token | DONE | 2026-02-27 | 0995eae |
| 6 | **Dutch → English** — Translate Dutch strings/comments in 12 files | DONE | 2026-02-27 | 7b81a52 |
| 7 | **Extract script-guard pure functions** — 4 functions → `src/security/script-utils.ts` | DONE | 2026-02-27 | 7b81a52 |
| 8 | **Named timeout constants** — `COOKIE_FLUSH_INTERVAL_MS`, `CDP_ATTACH_DELAY_MS`, `DEFAULT_TIMEOUT_MS` | DONE | 2026-02-27 | 7b81a52 |
| 9 | **Fix require('fs') in route** — Move to top-level import in `routes/browser.ts` | DONE | 2026-02-27 | 7b81a52 |
| 10 | **Fix setInterval(async) without try/catch** — Wrapped in `update-checker.ts` | DONE | 2026-02-27 | 7b81a52 |

## Medium Efforts (items 11–16)

| # | Description | Status | Session | Commit |
|---|-------------|--------|---------|--------|
| 11 | **Logger utility** — Create `src/utils/logger.ts` with levels (debug/info/warn/error) + config-driven min level. Replace 207 `console.log` calls across 48 files | DONE | 2026-02-27 | |
| 12 | **ESLint setup** — Add `eslint.config.mjs` with `@typescript-eslint/recommended`, `no-floating-promises`, `no-console: warn`, `no-unused-vars`, `consistent-type-imports`. Add `npm run lint` script | TODO | | |
| 13 | **Split security-manager routes** — 34 routes → `src/security/routes.ts` (978→414 lines) | DONE | 2026-02-27 | 4179a09 |
| 14 | **Lazy passwordManager** — `getPasswordManager()` lazy init, DB opens on first access | DONE | 2026-02-27 | 4179a09 |
| 15 | **Tests: pure logic modules** — 41 new tests (constants + config with fs mocking). 193 total | DONE | 2026-02-27 | 4179a09 |
| 16 | **Execute-js timeout** — 30s timeout + 1MB limit on `/execute-js` and `/devtools/evaluate` | DONE | 2026-02-27 | 4179a09 |

## Large Efforts (items 17–19)

| # | Description | Status | Session | Commit |
|---|-------------|--------|---------|--------|
| 17 | **API route tests** — Add integration tests for all 12 route files (~3000 lines total). Needs Express mocking setup | TODO | | |
| 18 | **Split security-db.ts** — Split 958-line file by table group into `db-events.ts`, `db-baselines.ts`, `db-blocklist.ts` | TODO | | |
| 19 | **Split devtools/manager.ts** — Split 863-line file into CDP lifecycle manager + storage/DOM/performance inspector | TODO | | |

---

## Session Log

<!-- Add an entry after each session -->

### 2026-02-27 — Session 2: Item 11 (logger utility)

- **Items completed:** #11
- **Version bumped to:** 0.11.3
- **Commit(s):** TBD
- **Notes:** Created `src/utils/logger.ts` (`createLogger` factory, 5 levels, `TANDEM_LOG_LEVEL` env var). Replaced all 355 console.log/warn/error calls across 51 source files. 2 intentional exceptions: bootstrap process handlers in main.ts (before import block) and injected browser JS in identity-polyfill.ts. 9 new logger tests (202 total). 0 new TS errors.

### 2026-02-27 — Session 1 (continued): Items 13-16 (medium items)
- **Items completed:** #13, #14, #15, #16
- **Version bumped to:** 0.11.2
- **Commit(s):** `4179a09`
- **Notes:** Same session as quick wins, still had context left. Split security-manager.ts (978→414 lines), lazy passwordManager, 41 new tests (193 total), execution timeout on /execute-js and /devtools/evaluate.

### 2026-02-27 — Session 1: Items 1-10 (all quick wins)
- **Items completed:** #1, #2, #3, #4, #5, #6, #7, #8, #9, #10
- **Version bumped to:** 0.11.1
- **Commit(s):** `0995eae` (items 1-5), `7b81a52` (items 6-10)
- **Notes:** All 10 quick wins done in one session using parallel subagents. 40+ files changed, 152 tests passing, 0 new TS errors. Created `src/utils/constants.ts`, `src/security/script-utils.ts`. Deleted `src/chat/interfaces.ts`.

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
