# Agent Tools — Implementation Status

> Read this file FIRST at the start or every Claude Code session.
> Each phase updates its own section after completion.

## Current State

**Next phase to implement:** —
**Last completed phase:** Phase 3
**Overall status:** COMPLETED

---

## Phase 1: Persistent Script & Style Injection

- **Status:** COMPLETED
- **Date:** 2026-02-21
- **Commit:** 5204c3c
- **Verification:**
  - [x] `GET /scripts` returns empty array on startup
  - [x] `POST /scripts/add` stores script, returns `{ok:true,name,active:true}`
  - [x] `POST /scripts/add` with duplicate name overwrites (no error)
  - [x] `GET /scripts` lists registered scripts with name + preview
  - [x] `DELETE /scripts/remove` removes by name
  - [x] Script re-executes after navigation (navigate → wait → check `window.__x`)
  - [x] `POST /scripts/enable` and `/disable` toggle without removing
  - [x] Disabled script does NOT re-inject after navigation
  - [x] `GET /styles` returns empty array on startup
  - [x] `POST /styles/add` injects CSS, returns `{ok:true,name}`
  - [x] CSS visible immediately on current page
  - [x] CSS re-injected after navigation
  - [x] `DELETE /styles/remove` removes CSS from current page + registry
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] `GET /execute-js` still works (no regression)
  - [x] `GET /snapshot` still works (no regression)
- **Issues encountered:** None
- **Notes for next phase:** ScriptInjector is available as `this.scriptInjector` in TandemAPI. The `reloadIntoTab(wc)` hook is in the `activity-webview-event` IPC handler in main.ts (did-finish-load block). Phase 2 can access the existing SnapshotManager for accessibility tree data.

---

## Phase 2: Semantic Locators (Playwright-style)

- **Status:** COMPLETED
- **Date:** 2026-02-21
- **Commit:** 83050be
- **Verification:**
  - [x] `POST /find {"by":"role","value":"button"}` — finds first button, returns ref
  - [x] `POST /find {"by":"role","value":"button","name":"Submit"}` — finds by name too
  - [x] `POST /find {"by":"text","value":"Sign in"}` — finds by text content
  - [x] `POST /find {"by":"placeholder","value":"Search"}` — finds input by placeholder
  - [x] `POST /find {"by":"label","value":"Email"}` — finds input associated with label
  - [x] `POST /find {"by":"testid","value":"submit-btn"}` — finds by data-testid
  - [x] `POST /find/click {"by":"text","value":"Sign in"}` — finds and clicks
  - [x] `POST /find/fill {"by":"placeholder","value":"Search","fillValue":"hello"}` — finds and fills
  - [x] `POST /find {"by":"role","value":"button","name":"Nonexistent"}` — returns `{found:false}`
  - [x] All locators return a `ref` that's usable with existing `POST /snapshot/click`
  - [x] `GET /snapshot` still works (no regression)
  - [x] `npx tsc --noEmit` — 0 errors
- **Issues encountered:** None
- **Notes for next phase:** LocatorFinder is available as `this.locatorFinder` in TandemAPI. It uses SnapshotManager's new `getAccessibilityTree()` method for role/text-based searches, and CDP DOM queries for placeholder/label/testid. The `registerBackendNodeId()` method on SnapshotManager allows DOM-found elements to get valid `@eN` refs that work with `clickRef()`/`fillRef()`. Phase 3 can use the existing DevToolsManager for device emulation CDP calls.

---

## Phase 3: Device Emulation

- **Status:** COMPLETED
- **Date:** 2026-02-21
- **Commit:** eec70fb
- **Verification:**
  - [x] `GET /device/profiles` — lists all built-in profiles
  - [x] `GET /device/status` — returns `{active:false}` on startup
  - [x] `POST /device/emulate {"device":"iPhone 15"}` — applies profile
  - [x] `GET /device/status` after emulate — shows active profile + dimensions
  - [x] Viewport visible in `window.screen.width` / `window.screen.height` in browser
  - [x] User-agent changed (check `navigator.userAgent` via `/execute-js`)
  - [x] `POST /device/emulate {"width":800,"height":600}` — custom dimensions work
  - [x] `POST /device/reset` — removes emulation, page returns to normal
  - [x] Emulation survives navigation (re-applied on new page load)
  - [x] `GET /device/status` returns `{active:false}` after reset
  - [x] `GET /screenshot` captures at emulated dimensions
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] All Phase 1 + 2 regressions pass
- **Issues encountered:** None
- **Notes for next phase:** DeviceEmulator is available as `this.deviceEmulator` in TandemAPI. Uses Electron native `enableDeviceEmulation()` / `disableDeviceEmulation()` API (not CDP). `screen.width`/`screen.height` reflect emulated dimensions; `window.innerWidth`/`innerHeight` reflects the actual webview element size (Electron limitation). The `reloadIntoTab(wc)` hook is in the `did-finish-load` block alongside ScriptInjector. User agent is set via `wc.setUserAgent()` and reset via `wc.session.getUserAgent()`.

---

## Known Issues & Workarounds

| Issue | Phase | Workaround | Status |
|-------|-------|------------|--------|
| — | — | — | — |

## Dependency Changes

| Phase | Dependency | Version | Reason |
|-------|-----------|---------|--------|
| — | — | — | — |

## File Inventory

### Phase 1
- [x] `src/scripts/injector.ts` — NEW (ScriptInjector class)
- [x] `src/main.ts` — MODIFIED (wire ScriptInjector to did-finish-load IPC)
- [x] `src/api/server.ts` — MODIFIED (register /scripts/* and /styles/* routes)

### Phase 2
- [x] `src/locators/finder.ts` — NEW (LocatorFinder class)
- [x] `src/snapshot/manager.ts` — MODIFIED (added getAccessibilityTree() and registerBackendNodeId())
- [x] `src/api/server.ts` — MODIFIED (register /find, /find/click, /find/fill, /find/all routes)
- [x] `src/main.ts` — MODIFIED (instantiate LocatorFinder, pass to TandemAPI)

### Phase 3
- [x] `src/device/emulator.ts` — NEW (DeviceEmulator class + profiles)
- [x] `src/main.ts` — MODIFIED (wire DeviceEmulator to did-finish-load for persistence)
- [x] `src/api/server.ts` — MODIFIED (register /device/* routes)
