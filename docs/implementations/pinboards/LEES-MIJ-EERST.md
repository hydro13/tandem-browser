# PINBOARDS — START HIER

> **Datum:** 2026-02-28
> **Status:** In progress
> **Doel:** Visuele moodboards toevoegen aan Tandem — lokale content-curation borden waar Robin links, afbeeldingen en tekstfragmenten op kan verzamelen
> **Volgorde:** Fase 1 → 2 → 3 (elke fase is één sessie)

---

## Waarom deze feature?

Robin gebruikt Opera's Pinboards om webcontent te verzamelen bij research, inspiratie en projectplanning. Tandem heeft bookmarks en page notes, maar geen visueel bord-concept. Pinboards vullen de gap tussen een simpele bookmark (alleen URL) en een volledige notitie-app. Zie `docs/research/gap-analysis.md` — Pinboards is #2 in de top 10 aanbevolen features, status: 🔴 HIGH priority.

---

## Architectuur in 30 seconden

```
Context Menu (rechtermuisknop)     Sidebar Panel (board UI)
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

## Projectstructuur — relevante bestanden

> ⚠️ Lees ALLEEN de bestanden in de "Te lezen" tabel.
> Ga NIET wandelen door de rest van de codebase.

### Te lezen voor ALLE fases

| Bestand | Wat staat erin | Zoek naar functie |
|---------|---------------|-------------------|
| `AGENTS.md` | Anti-detect regels, code stijl, commit format | — (lees volledig) |
| `src/main.ts` | App startup, manager registratie | `startAPI()`, `createWindow()`, `app.on('will-quit')` |
| `src/api/server.ts` | TandemAPI class, route registratie | `class TandemAPI`, `setupRoutes()` |
| `src/registry.ts` | Centrale registry van alle managers | `interface ManagerRegistry` |
| `src/api/routes/data.ts` | Voorbeeld van bestaande routes (bookmarks, history) | `registerDataRoutes()` |
| `src/bookmarks/manager.ts` | Vergelijkbare manager met JSON storage | `class BookmarkManager`, `load()`, `save()` |

### Per fase aanvullend te lezen

| Fase | Extra bestanden |
|------|----------------|
| Fase 1 | `src/utils/paths.ts` (`tandemDir()`, `ensureDir()`), `src/utils/errors.ts` (`handleRouteError()`) |
| Fase 2 | `src/context-menu/manager.ts`, `src/context-menu/menu-builder.ts`, `src/context-menu/types.ts`, `shell/index.html` (sidebar sectie) |
| Fase 3 | `shell/index.html` (bestaande UI patronen voor kaarten/grids) |

---

## Regels voor deze feature

> Dit zijn de HARDE regels naast de algemene AGENTS.md regels.

1. **Alles lokaal** — geen externe API calls, geen cloud, geen tracking. Opslag uitsluitend in `~/.tandem/pinboards/`
2. **Geen nieuwe npm packages** — gebruik bestaande dependencies (Express, fs, path, crypto)
3. **Functienamen > regelnummers** — verwijs altijd naar `function registerPinboardRoutes()`, nooit naar "regel 42"
4. **Shell UI in aparte IIFE** — pinboard UI-code in shell/index.html als eigen IIFE sectie, net als `ocChat`
5. **Geen webview injectie** — alle UI zit in de shell, context menu via Electron's `ContextMenuBuilder`
6. **BookmarkManager als voorbeeld** — volg exact dezelfde patronen voor storage, ID-generatie, load/save

---

## Manager Wiring — hoe PinboardManager registreren

De `PinboardManager` moet op **3 plekken** worden aangesloten:

### 1. `src/registry.ts` — `ManagerRegistry` interface

```typescript
import type { PinboardManager } from './pinboards/manager';

export interface ManagerRegistry {
  // ... bestaande managers ...
  pinboardManager: PinboardManager;  // ← toevoegen
}
```

### 2. `src/main.ts` — manager instantiëren

```typescript
import { PinboardManager } from './pinboards/manager';

// Na aanmaken van aanverwante managers:
const pinboardManager = new PinboardManager();

// In registry object:
const registry: ManagerRegistry = {
  // ... bestaande managers ...
  pinboardManager,
};
```

### 3. `src/main.ts` — `app.on('will-quit')` handler

```typescript
// PinboardManager heeft geen destroy() nodig — het is alleen JSON I/O
// Maar als er cleanup logica is (bv. file watchers), voeg toe:
// pinboardManager.destroy();
```

### 4. `src/api/server.ts` — routes registreren

```typescript
import { registerPinboardRoutes } from './routes/pinboards';

// In setupRoutes():
registerPinboardRoutes(router, ctx);
```

---

## API Endpoint Patroon — kopieer exact

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

**Regels:**
- `try/catch` rond ALLES, catch als `(e: any)`
- Gebruik `handleRouteError()` uit `src/utils/errors.ts`
- 400 voor ontbrekende verplichte velden
- 404 voor niet-gevonden boards of items
- Success: altijd `{ ok: true, ...data }`

---

## Context Menu Integratie — hoe "Save to Pinboard" toevoegen

De context menu werkt via drie bestanden:

### `src/context-menu/types.ts` — `ContextMenuDeps` uitbreiden

```typescript
import type { PinboardManager } from '../pinboards/manager';

export interface ContextMenuDeps {
  // ... bestaande deps ...
  pinboardManager: PinboardManager;  // ← toevoegen
}
```

### `src/context-menu/menu-builder.ts` — nieuwe methode

Voeg een `addPinboardItems()` methode toe aan `ContextMenuBuilder`. Deze wordt aangeroepen vanuit `build()`, na de Tandem-specifieke items.

Drie varianten op basis van context:
- **Link context** (`params.linkURL` niet leeg): "Save link to Pinboard"
- **Image context** (`params.mediaType === 'image'`): "Save image to Pinboard"
- **Selection context** (`params.selectionText` niet leeg): "Save selection to Pinboard"
- **Page context** (altijd): "Save page to Pinboard"

Elke item opent een submenu met de beschikbare boards (via `pinboardManager.listBoards()`).

### `src/main.ts` — deps doorgeven

Bij het instantiëren van `ContextMenuManager`, `pinboardManager` meegeven in de deps.

---

## Documenten in deze map

| Bestand | Wat | Status |
|---------|-----|--------|
| `LEES-MIJ-EERST.md` | ← dit bestand | — |
| `fase-1-backend-api.md` | PinboardManager + REST API endpoints | ✅ Klaar |
| `fase-2-ui-panel.md` | Sidebar panel + context menu integratie | ✅ Klaar |
| `fase-3-visual-board.md` | Visueel card-grid met drag, delete, polish | ✅ Klaar |

---

## Quick Status Check (altijd eerst uitvoeren)

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

## 📊 Fase Status — BIJWERKEN NA ELKE FASE

| Fase | Titel | Status | Commit |
|------|-------|--------|--------|
| 1 | PinboardManager + REST API | ✅ klaar | v0.32.0 |
| 2 | Sidebar panel + card grid UI | ✅ klaar | v0.32.0 |
| 3 | Bug fixes (prompt→modal, auth headers) | ✅ klaar | v0.32.1 |
| 4 | Tab context menu "Add to Pinboard" | ⏳ niet gestart | — |
| 5 | OG metadata auto-fetch (echte thumbnails) | ⏳ niet gestart | — |
| 6 | Card layout: masonry + auto-height | ⏳ niet gestart | — |

> Claude Code: markeer fase als ✅ + voeg commit hash toe na afronden.
