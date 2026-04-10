# Sidebar Infrastructure — START HERE

> **Date:** 2026-02-28
> **Design doc:** `docs/plans/sidebar-infra-design.md`
> **Order:** Phase 1 → 2 → 3 (each phase is one Claude Code session)
> **Priority:** #0 — foundation for Workspaces, Messengers, Pinboards, etc.

---

## Why This Project?

Tandem does not have a left sidebar yet. All planned features (Workspaces, Messengers, Personal News, Pinboards, Bookmarks, History, Downloads) need to live in one uniform, configurable sidebar, not as separate ad hoc icon strips. This builds the foundation.

---

## Architecture in 30 Seconds

```
.main-layout (flex row, shell/index.html)
  ├── .sidebar (NEW, left)
  │     ├── .sidebar-icon-strip (48px always)
  │     │     ├── [icon button per item]
  │     │     └── [toggle narrow/wide + customize button at the bottom]
  │     └── .sidebar-panel (240px, collapsible)
  │           └── [content rendered by active item]
  ├── .browser-content (flex:1, unchanged)
  └── .wingman-panel (right, unchanged)

Sidebar states:
  hidden (0px) ←→ narrow (48px) ←→ wide (~180px)
  Shortcut: ⌘⇧B (toggle hidden↔narrow)
```

### Manager Wiring — 3 Touch Points (ALWAYS all 3!)

| Touch point | Purpose | File |
|-------------|---------|---------|
| 1. Interface | `ManagerRegistry` — add `sidebarManager` | `src/registry.ts` |
| 2. Instantiation | `startAPI()` — `new SidebarManager()` | `src/main.ts` |
| 3. Cleanup | `app.on('will-quit')` — `sidebarManager.destroy()` | `src/main.ts` |

---

## Relevant Files per Phase

### Phase 1 (Backend + API)
| File | What to look for | Why |
|---------|-----------|--------|
| `src/registry.ts` | `interface ManagerRegistry` | Add `SidebarManager` |
| `src/main.ts` | `startAPI()`, `app.on('will-quit')` | Instantiate manager + cleanup |
| `src/api/server.ts` | top `import { register...Routes }` block | Add the sidebar routes import |
| `src/api/routes/data.ts` | `function registerDataRoutes()` | Copy the pattern for the new route file |
| `src/bookmarks/manager.ts` | `class BookmarkManager` | Pattern for JSON storage + load/save |
| `src/utils/paths.ts` | `function tandemDir()`, `function ensureDir()` | Storage helpers |
| `src/utils/errors.ts` | `function handleRouteError()` | Error-handling pattern |

### Phase 2 (Shell UI)
| File | What to look for | Why |
|---------|-----------|--------|
| `shell/index.html` | `<!-- Main layout -->` comment | Insert sidebar HTML here |
| `shell/css/main.css` | `.main-layout {` | CSS for the sidebar next to browser-content |
| `shell/index.html` | `<!-- Wingman Panel Toggle Button -->` | Pattern for the toggle button |

### Phase 3 (First Plugin: Bookmarks)
| File | What to look for | Why |
|---------|-----------|--------|
| `src/api/routes/data.ts` | `function registerDataRoutes()`, `/bookmarks` endpoints | Reuse the existing bookmark API |
| `shell/index.html` | sidebar panel container (built in phase 2) | Add the bookmarks panel HTML |

---

## Code Patterns

### Manager Pattern (copy from `BookmarkManager`)
```typescript
import { tandemDir, ensureDir } from '../utils/paths';

export class SidebarManager {
  private storageFile: string;
  private config: SidebarConfig;

  constructor() {
    this.storageFile = path.join(tandemDir(), 'sidebar-config.json');
    this.config = this.load();
  }

  private load(): SidebarConfig { /* JSON.parse or default */ }
  private save(): void { /* JSON.stringify to storageFile */ }
  destroy(): void { /* cleanup timers etc. */ }
}
```

### Route Pattern (copy from `registerDataRoutes`)
```typescript
export function registerSidebarRoutes(router: Router, ctx: RouteContext): void {
  router.get('/sidebar/config', (_req, res) => {
    try {
      res.json({ ok: true, config: ctx.sidebarManager.getConfig() });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
```

### Registry Pattern
In `src/registry.ts` → `interface ManagerRegistry`:
```typescript
sidebarManager: SidebarManager;
```

---

## Anti-Detect Note

The sidebar lives entirely in the SHELL (Electron BrowserWindow), NOT in a webview.
No DOM manipulation inside webpages. No stealth impact.

---

## Hard Rules for Claude Code

1. **Never line numbers** — always use function names such as `startAPI()` and `registerDataRoutes()`
2. **Read first, write second** — read each file before editing it
3. **`npx tsc` after every step** — zero TypeScript errors before you continue
4. **All 3 manager touch points** — registry + `startAPI()` + `will-quit`
5. **Follow the pattern** — copy the existing manager/route structure, no custom variants

---

## 📊 Phase Status — UPDATE AFTER EVERY PHASE

| Phase | Title | Status | Commit |
|------|-------|--------|--------|
| 1 | `SidebarManager` + config API | ✅ done | 0e34eae |
| 2 | Shell UI (icon strip + panel container + shortcut) | ✅ done | a6fb57a |
| 3 | First plugin: Bookmarks panel | ⏳ not started | — |

> Claude Code: mark the phase as ✅ and add the commit hash after completion.
