# Tandem Browser — Codebase Structure Report

**Date:** 2026-02-26
**Scope:** Full codebase analysis (~28,750 lines TS, 81 files, 170+ API endpoints)
**Goal:** Identify structural improvements for better Claude Code session productivity and easier debugging

---

## Executive Summary

Tandem Browser has a strong architectural vision (two-layer stealth architecture, manager pattern, centralized network pipeline). However, organic phase-by-phase growth has created several structural issues that make AI-assisted development harder and debugging slower. The two biggest problems are:

1. **God files** — `api/server.ts` (1700+ lines) and `main.ts` (1016 lines) contain too much logic and are the bottleneck for almost every change
2. **Missing shared utilities** — Common patterns repeat 5-10 times across the codebase, leading to inconsistency

---

## Issue 1: God Files

### `src/main.ts` (1016 lines)

**What it does (too much):**
- Instantiates all 36+ managers (lines 64-103)
- Registers all IPC handlers inline with business logic (lines 436-828)
- Contains a 100-line `activity-webview-event` handler (lines 539-638) that touches 8 subsystems
- Builds the entire application menu (lines 831-951)
- Exports `copilotAlert()` that creates circular dependencies

**Impact:** Every manager change requires edits at 3+ locations within this file. The `activity-webview-event` handler is the most complex business logic in the project, mixing history, site memory, security, scripts, device emulation, and context bridge — all in one IPC listener.

### `src/api/server.ts` (~1700 lines)

**What it does (too much):**
- 40+ imports, 35-parameter constructor (`TandemAPIOptions`)
- All 170+ HTTP routes in one file
- Circular dependency: line 9 imports `copilotAlert` from `../main`
- Does not fit in a single AI context window

**Impact:** Adding any new API route means editing this massive file. Route handlers aren't grouped by domain.

### Recommended Structure

```
src/
├── main.ts              → only createWindow() + app lifecycle (~200 lines)
├── ipc/
│   ├── handlers.ts      → all ipcMain handlers
│   ├── tab-handlers.ts  → tab-specific IPC
│   └── activity.ts      → activity-webview-event handler
├── api/
│   ├── server.ts        → Express setup + middleware (~150 lines)
│   ├── routes/
│   │   ├── tabs.ts
│   │   ├── navigation.ts
│   │   ├── interaction.ts
│   │   ├── content.ts
│   │   ├── security.ts
│   │   ├── sessions.ts
│   │   ├── extensions.ts
│   │   ├── snapshots.ts
│   │   └── ...
│   └── middleware/
│       └── auth.ts
├── bootstrap/
│   └── managers.ts      → all manager instantiation
└── menu.ts              → buildAppMenu()
```

---

## Issue 2: Dependency Injection — 35-Parameter Constructor

### Current Pattern

```typescript
export interface TandemAPIOptions {
  win: BrowserWindow;
  tabManager: TabManager;
  panelManager: PanelManager;
  // ... 32 more parameters
}
```

Every new manager requires changes at 4 locations:
1. Import in `main.ts`
2. Variable declaration in `main.ts`
3. Instantiation in `startAPI()`
4. Addition to `TandemAPIOptions` interface + private field in `TandemAPI`

### Recommendation: Simple Registry

```typescript
class ManagerRegistry {
  private managers = new Map<string, any>();

  register<T>(key: string, instance: T): T {
    this.managers.set(key, instance);
    return instance;
  }

  get<T>(key: string): T {
    return this.managers.get(key) as T;
  }

  destroy(): void {
    for (const [, m] of this.managers) {
      if (typeof m.destroy === 'function') m.destroy();
    }
  }
}
```

---

## Issue 3: Error Handling — Uniform but Problematic

### Pattern (285 occurrences across 23 files)

```typescript
catch (e: any) {
  console.warn('[Module] error:', e.message);
}
```

### Problems
- `e: any` bypasses TypeScript's type system
- Errors are never re-thrown — silent failures
- No distinction between expected errors and bugs
- No structured logging
- No error aggregation

### Recommendation

```typescript
// src/utils/errors.ts
export function logError(module: string, operation: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[${module}] ${operation} failed: ${message}`);
}
```

---

## Issue 4: Missing Shared Utilities

### Duplicated Patterns

**Directory initialization** (8+ files):
```typescript
const tandemDir = path.join(os.homedir(), '.tandem');
if (!fs.existsSync(tandemDir)) fs.mkdirSync(tandemDir, { recursive: true });
```

**Domain extraction** (4+ files):
```typescript
try { domain = new URL(url).hostname.toLowerCase(); } catch {}
```

**IPC channel list** (manually maintained in `main.ts:437-444`):
```typescript
const ipcChannels = ['tab-update', 'tab-register', ...]; // manual!
```

### Recommendation

```
src/utils/
├── paths.ts       → getTandemDir(), getSecurityDir(), getDataPath()
├── url.ts         → extractDomain(), isValidUrl(), normalizeUrl()
├── errors.ts      → logError(), wrapAsync()
└── constants.ts   → IPC_CHANNELS, API_PORT, etc.
```

---

## Issue 5: Type Safety — 379x `: any`

### Worst Offenders

| File | `: any` count | Cause |
|------|--------------|-------|
| `src/api/server.ts` | 191 | Route handlers, catch blocks |
| `src/security/security-manager.ts` | 38 | CDP callbacks |
| `src/devtools/manager.ts` | 21 | CDP callbacks |

### Root Cause

The CDP boundary at `devtools/manager.ts:15` defines:
```typescript
(method: string, params: any) => void
```
This propagates `any` to all security modules.

### Recommendation: Typed CDP Events

```typescript
interface CDPEventMap {
  'Debugger.scriptParsed': { scriptId: string; url: string; ... };
  'Performance.metrics': { metrics: Array<{ name: string; value: number }> };
}
```

---

## Issue 6: Testing — Less Than 5% Coverage

### Current State

Only 2 test files exist:
- `src/extensions/tests/extensions.test.ts` (506 lines, well-written)
- `src/security/tests/security.test.ts` (320 lines, well-written)

### Not Tested
- TabManager, SessionManager, SecurityManager
- RequestDispatcher, TandemAPI (170+ routes)
- DevToolsManager, WorkflowEngine
- All IPC handlers
- The `activity-webview-event` handler (most complex business logic)

### No unified test command — only `test:security` and `test:extensions`

### Recommendation

1. Add `"test": "vitest run"` to package.json
2. Test pure logic first (no Electron mocking needed): TabManager, BookmarkManager, HistoryManager, ConfigManager
3. Test API routes with supertest
4. Test the activity-webview-event handler

---

## Issue 7: Circular Dependencies

### Current State

```
main.ts ←→ api/server.ts      (copilotAlert import)
main.ts ←  headless/manager.ts (copilotAlert import)
main.ts ←  watch/watcher.ts    (copilotAlert import)
```

### Recommendation

Move `copilotAlert` to `src/notifications/alert.ts` or make it an event on EventStreamManager.

---

## Issue 8: Implicit Initialization Order

### Problem

SecurityManager requires a 3-step initialization with no documentation:
1. `new SecurityManager()` (constructor)
2. `securityManager.setDevToolsManager(devToolsManager)` (main.ts:322)
3. `securityManager.initGatekeeper(httpServer)` (main.ts:432)

Missing step 2 or 3 causes partial failure with no errors.

### Recommendation

Make the order explicit via builder pattern or async `init()` method.

---

## Issue 9: `shell/index.html` — Monolith UI

### Problem

The entire browser UI is one HTML file (~3000+ lines). No framework, no modules, no bundler.

### Recommendation (Minimally Invasive)

Split JavaScript into separate files loaded via `<script>` tags:
```
shell/
├── index.html         → HTML structure + CSS (~500 lines)
├── js/
│   ├── tabs.js        → __tandemTabs implementation
│   ├── addressbar.js  → URL bar logic
│   ├── panel.js       → Copilot panel
│   ├── bookmarks.js   → Bookmarks bar
│   └── shortcuts.js   → Keyboard shortcut handling
└── css/
    └── lgl.css        → Liquid Glass Lite design system
```

---

## Issue 10: Naming & Consistency

| Issue | Example | Recommendation |
|-------|---------|----------------|
| `destroy()` vs `cleanup()` | `SessionManager.cleanup()` vs all others using `destroy()` | Unify to `destroy()` |
| `Phase N` comments | 40+ in security-manager.ts | Remove or consolidate |
| Duplicate `ChatMessage` types | `chat/interfaces.ts` vs `panel/manager.ts` | Rename one |
| Duplicate `ActivityEntry` types | 3 different definitions with same name | Create one shared type |

---

## Priority Matrix

| # | Action | Impact | Effort | Claude Code Benefit |
|---|--------|--------|--------|-------------------|
| 1 | Split `api/server.ts` into route files | High | Medium | Routes fit in context window |
| 2 | Split `main.ts` (IPC, bootstrap, menu) | High | Medium | Changes become local |
| 3 | Shared utilities module (`paths`, `url`, `errors`) | Medium | Low | Less duplication = fewer bugs |
| 4 | Fix circular dependency (`copilotAlert`) | Medium | Low | Cleaner import graph |
| 5 | Unified `npm test` + tests for TabManager/API | Medium | Medium | Find bugs earlier |
| 6 | Type safety: CDP types + fewer `any` | Medium | Medium | Better autocompletion |
| 7 | Split `shell/index.html` | Medium | Medium | UI changes become easier |
| 8 | Manager registry / DI pattern | Low | Medium | Less boilerplate for new features |
| 9 | Explicit initialization order | Low | Low | Prevents init-order bugs |
| 10 | Naming consistency fixes | Low | Low | Code is more readable |

---

## Good Patterns to Preserve

These patterns work well and should be kept:

1. **RequestDispatcher** (`src/network/dispatcher.ts`) — Clean Observer pattern with priority sorting. This is the best-designed module in the codebase.
2. **Manager pattern** — Consistent `class XyzManager` with `destroy()` lifecycle. 30/30 managers implement proper cleanup.
3. **TabManager** (`src/tabs/manager.ts`) — Clean, focused, well-documented. The model for how all managers should look.
4. **Security test quality** — The existing tests are excellent: proper mocking, thorough edge cases.
5. **Two-layer architecture** — The stealth invariant is well-enforced throughout.
6. **Preload bridge** — Clean typed API surface in `preload.ts`.

---

## Metrics Summary

| Metric | Value |
|--------|-------|
| Total TypeScript lines | ~28,750 |
| Source files | 81 |
| API endpoints | 170+ |
| Manager classes | 36+ |
| Test files | 2 |
| Test coverage | <5% |
| `: any` occurrences | 379 |
| `catch (e: any)` occurrences | 285 |
| Circular dependencies | 3 |
| Largest file | `api/server.ts` (~1700 lines) |
