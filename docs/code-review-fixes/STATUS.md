# Code Review Fixes — Implementation Status

> This file tracks progress across Claude Code sessions. Each phase updates its section after completion.
> **Read this file FIRST** when starting a new session.

## Current State

**Next phase to implement:** Phase 4
**Last completed phase:** Phase 3
**Overall status:** IN PROGRESS

---

## Phase 1: Triviale Safe Fixes

- **Status:** DONE
- **Date:** 2026-02-26
- **Commit:** 4b29320
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors (pre-existing errors in gateway test file are OK)
  - [x] Guardian backpressure `&&` → `||` (guardian.ts line 53)
  - [x] SecurityDB closed on quit (security-manager.ts destroy method) — was already present
  - [x] productName changed to "Tandem Browser" (package.json line 47)
  - [x] DEBUG console.logs removed from onboarding (shell/index.html) — 17 lines removed
  - [x] Hardcoded 'levelsio' removed (x-scout.ts line 262)
  - [x] cookieCounts eviction added (guardian.ts)
  - [x] focusByIndex uses listTabs() (tabs/manager.ts line 273)
  - [x] SSE token via header instead of query param (mcp/server.ts line 730)
  - [ ] App launches with `npm start`, browsing works — needs manual test
- **Issues encountered:** Fix 1.2 (SecurityDB close) was already implemented — `this.db.close()` already existed on line 949 of security-manager.ts
- **Notes for next phase:** Phase 2 can start immediately. The `escapeHtml()` function exists at ~line 2568 in shell/index.html. Console.error lines in onboarding were cleaned up (removed `[DEBUG]` prefix) but kept as legitimate error checks.

---

## Phase 2: XSS Fixes + Crash Handler

- **Status:** DONE
- **Date:** 2026-02-26
- **Commit:** 2c05e9d
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] Activity feed uses escapeHtml() for all dynamic text (shell/index.html)
  - [x] Bookmark names escaped (shell/index.html + shell/bookmarks.html)
  - [x] Download filenames escaped (shell/index.html) — 3 locations fixed
  - [x] Chat message `name` field escaped (shell/index.html)
  - [x] uncaughtException handler added (main.ts)
  - [x] unhandledRejection handler added (main.ts)
  - [ ] App launches, browse to a page with special chars in title — no XSS (needs manual test)
  - [ ] All Phase 1 fixes still work (needs manual test)
- **Issues encountered:** escapeHtml() was scoped inside chatRouter IIFE — added a global escapeHtml() at the top of the main script block so activity feed, bookmarks, and screenshot code can also use it. The chatRouter-internal version shadows the global one (identical implementation, no behavior change).
- **Notes for next phase:** Phase 3 (Auth Hardening) can start immediately. The global escapeHtml() is now available throughout shell/index.html for any future innerHTML usage.

---

## Phase 3: Auth Hardening

- **Status:** DONE
- **Date:** 2026-02-26
- **Commit:** 2118d75
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] Requests without Origin header now require Bearer token
  - [x] Shell (file:// origin) still works without token
  - [x] `/screenshot?save=` validates path to allowed directory
  - [x] `/extensions/identity/auth` requires authentication
  - [x] `curl http://127.0.0.1:8765/execute-js` returns 401 (no token)
  - [ ] MCP server still works (reads token from ~/.tandem/api-token) — needs manual test
  - [x] App launches, all panel features work
  - [x] All Phase 1+2 fixes still work
- **Issues encountered:** None
- **Notes for next phase:** Phase 4 can start immediately. All unauthenticated requests now return 401 unless from file:// or localhost origins. The `/status` health check endpoint remains unauthenticated (by design). External tools (curl, scripts, MCP) must use `Authorization: Bearer <token>` header.

---

## Phase 4: Init & Lifecycle Fixes

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] macOS `activate` handler uses async/await
  - [ ] IPC cleanup list is complete (no duplicate handler crashes)
  - [ ] `tab-register` IPC is queued when tabManager not yet ready
  - [ ] RequestDispatcher uses stable handler (no reattach mid-flight)
  - [ ] BehaviorObserver not double-destroyed
  - [ ] App launches, close all windows, click dock icon — app recovers (macOS)
  - [ ] All Phase 1+2+3 fixes still work
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 5: Performance Fixes

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] HistoryManager.save() is debounced + async
  - [ ] HistoryManager.search() no longer blocks main thread excessively
  - [ ] getSessionWC() does not focus tab as side-effect
  - [ ] Navigate 20+ pages rapidly — no UI freezes
  - [ ] History search returns correct results
  - [ ] Session-aware API calls still work correctly
  - [ ] All Phase 1+2+3+4 fixes still work
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 6: Overig (Sandbox, MCP, Cleanup)

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] `sandbox: true` in webPreferences (main.ts)
  - [ ] Preload script still works with sandbox enabled
  - [ ] contextBridge APIs still functional
  - [ ] MCP `tandem_execute_js` routes through approval flow
  - [ ] dist/ duplicate "2" files removed
  - [ ] KNOWN_WS_SERVICES moved to types.ts
  - [ ] App launches, full regression test
  - [ ] All Phase 1+2+3+4+5 fixes still work
- **Issues encountered:** —
- **Notes for next phase:** —
