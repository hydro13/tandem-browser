# PINBOARDS — START HERE

> **Date:** 2026-02-28
> **Status:** In progress
> **Goal:** Visual moodboards add about Tandem — lokale content-curation boards waar Robin links, images and text fragments op can collect
> **Order:** Phase 1 → 2 → 3 (elke phase is één session)

---

## Why this feature?

Robin uses Opera's Pinboards to webcontent te collect bij research, inspiratie and projectplanning. Tandem has bookmarks and page notes, but no visual board-concept. Pinboards vullen the gap between a simpele bookmark (only URL) and a full note-app. Zie `docs/research/gap-analysis.md` — Pinboards is #2 in the top 10 aanbevolen features, status: 🔴 HIGH priority.

---

## Architecture in 30 seconds

```
Context Menu (right-click)     Sidebar Panel (board UI)
         │                                  │
         ▼                                  ▼
    HTTP POST /pinboards/:id/items    HTTP GET /pinboards
         │                                  │
         ▼                                  ▼
┌─────────────────────────────────────────────────┐
│  registerPinboardRoutes()                        │
│  src/api/routes/pinboards.ts                     │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│  PinboardManager                                 │
│  src/pinboards/manager.ts                        │
│  CRUD boards + items, JSON load/save             │
└──────────────────────┬──────────────────────────┘
                       │
            ┌──────────▼──────────┐
            │  ~/.tandem/pinboards │
            │  └── boards.json     │
            └─────────────────────┘
```

---

## Project Structure — Relevant Files

> ⚠️ Read ONLY the files in the "Files to read" table.
> Do NOT wander through the rest or the codebase.

### Read for ALL phases

| File | What it contains | Look for function |
|---------|---------------|-------------------|
| `AGENTS.md` | Anti-detect rules, code stijl, commit format | — (read fully) |
| `src/main.ts` | App startup, manager registratie | `startAPI()`, `createWindow()`, `app.on('will-quit')` |
| `src/api/server.ts` | TandemAPI class, route registratie | `class TandemAPI`, `setupRoutes()` |
| `src/registry.ts` | Centrale registry or alle managers | `interface ManagerRegistry` |
| `src/api/routes/data.ts` | Voorbeeld or existing routes (bookmarks, history) | `registerDataRoutes()` |
| `src/bookmarks/manager.ts` | Vergelijkbare manager with JSON storage | `class BookmarkManager`, `load()`, `save()` |

### Additional reading per phase

| Phase | Extra files |
|------|----------------|
| Phase 1 | `src/utils/paths.ts` (`tandemDir()`, `ensureDir()`), `src/utils/errors.ts` (`handleRouteError()`) |
| Phase 2 | `src/context-menu/manager.ts`, `src/context-menu/menu-builder.ts`, `src/context-menu/types.ts`, `shell/index.html` (sidebar section) |
| Phase 3 | `shell/index.html` (existing UI patterns for cards/grids) |

---

## Rules for this feature

> These are the HARD rules in addition to the general AGENTS.md rules.

1. **Alles local** — no external API calls, no cloud, no tracking. Opslag uitsluitend in `~/.tandem/pinboards/`
2. **No new npm packages** — usage existing dependencies (Express, fs, path, crypto)
3. **Functienamen > regelnummers** — verwijs always to `function registerPinboardRoutes()`, nooit to "regel 42"
4. **Shell UI in aparte IIFE** — pinboard UI-code in shell/index.html if own IIFE section, net if `ocChat`
5. **No webview injectie** — alle UI zit in the shell, context menu via Electron's `ContextMenuBuilder`
6. **BookmarkManager if voorbeeld** — volg exact the same patterns for storage, ID-generatie, load/save

---

## Manager Wiring — hoe PinboardManager registreren

The `PinboardManager` must op **3 plekken** be aangesloten:

### 1. `src/registry.ts` — `ManagerRegistry` interface

```typescript
import type { PinboardManager } from './pinboards/manager';

export interface ManagerRegistry {
  // ... existing managers ...
  pinboardManager: PinboardManager;  // ← add
}
```

### 2. `src/main.ts` — manager instantiëren

```typescript
import { PinboardManager } from './pinboards/manager';

// Na aanmaken or aanverwante managers:
const pinboardManager = new PinboardManager();

// In registry object:
const registry: ManagerRegistry = {
  // ... existing managers ...
  pinboardManager,
};
```

### 3. `src/main.ts` — `app.on('will-quit')` handler

```typescript
// PinboardManager has no destroy() nodig — the is only JSON I/O
// Maar if er cleanup logica is (bv. file watchers), voeg toe:
// pinboardManager.destroy();
```

### 4. `src/api/server.ts` — routes registreren

```typescript
import { registerPinboardRoutes } from './routes/pinboards';

// In setupRoutes():
registerPinboardRoutes(router, ctx);
```

---

## API Endpoint Pattern — Copy Exactly

```typescript
// ═══════════════════════════════════════════════
// PINBOARDS — Content Curation Boards
// ═══════════════════════════════════════════════

router.get('/pinboards', (req: Request, res: Response) => {
  try {
    const boards = ctx.pinboardManager.listBoards();
    res.json({ ok: true, boards });
  } catch (e: any) {
    handleRouteError(res, e);
  }
});
```

**Rules:**
- `try/catch` rond ALLES, catch if `(e: any)`
- Usage `handleRouteError()` out `src/utils/errors.ts`
- 400 for ontbrekende verplichte velden
- 404 for not-gevonden boards or items
- Success: always `{ ok: true, ...data }`

---

## Context Menu Integratie — hoe "Save to Pinboard" add

The context menu works via drie files:

### `src/context-menu/types.ts` — `ContextMenuDeps` uitbreiden

```typescript
import type { PinboardManager } from '../pinboards/manager';

export interface ContextMenuDeps {
  // ... existing deps ...
  pinboardManager: PinboardManager;  // ← add
}
```

### `src/context-menu/menu-builder.ts` — new methode

Voeg a `addPinboardItems()` methode toe about `ContextMenuBuilder`. This is aangeroepen vanuit `build()`, na the Tandem-specific items.

Drie varianten op basis or context:
- **Link context** (`params.linkURL` not leeg): "Save link to Pinboard"
- **Image context** (`params.mediaType === 'image'`): "Save image to Pinboard"
- **Selection context** (`params.selectionText` not leeg): "Save selection to Pinboard"
- **Page context** (always): "Save page to Pinboard"

Elke item opens a submenu with the beschikbare boards (via `pinboardManager.listBoards()`).

### `src/main.ts` — deps doorgeven

Bij the instantiëren or `ContextMenuManager`, `pinboardManager` meegeven in the deps.

---

## Documents in This Folder

| File | What | Status |
|---------|-----|--------|
| `LEES-MIJ-EERST.md` | ← this file | — |
| `fase-1-backend-api.md` | PinboardManager + REST API endpoints | ✅ Complete |
| `fase-2-ui-panel.md` | Sidebar panel + context menu integratie | ✅ Complete |
| `fase-3-visual-board.md` | Visual card-grid with drag, delete, polish | ✅ Complete |

---

## Quick Status Check (always run first)

```bash
# App draait?
curl http://localhost:8765/status

# TypeScript clean?
npx tsc

# Git status clean?
git status

# Tests slagen?
npx vitest run
```

---

## 📊 Phase Status — UPDATE AFTER EVERY PHASE

| Phase | Title | Status | Commit |
|------|-------|--------|--------|
| 1 | PinboardManager + REST API | ✅ done | v0.32.0 |
| 2 | Sidebar panel + card grid UI | ✅ done | v0.32.0 |
| 3 | Bug fixes (prompt→modal, auth headers) | ✅ done | v0.32.1 |
| 4 | Tab context menu "Add to Pinboard" | ⏳ not started | — |
| 5 | OG metadata auto-fetch (echte thumbnails) | ⏳ not started | — |
| 6 | Card layout: masonry + auto-height | ⏳ not started | — |

> Claude Code: markeer phase if ✅ + voeg commit hash toe na afronden.
