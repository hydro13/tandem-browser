# Phase 1 — Backend: PinboardManager + REST API

> **Feature:** Pinboards
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** None

---

## Goal or this fase

Bouw the complete backend for Pinboards: a `PinboardManager` class that boards and items beheert with JSON-opslag, plus alle REST API endpoints. After this phase are alle CRUD-operaties bruikbaar via `curl`. The UI comes in phase 2.

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `src/bookmarks/manager.ts` | `class BookmarkManager`, `load()`, `save()`, `generateId()` | Exact hetzelfde storage pattern kopiëren |
| `src/api/routes/data.ts` | `registerDataRoutes()` | Copy route pattern (try/catch, handleRouteError, response format) |
| `src/registry.ts` | `interface ManagerRegistry` | Hier `pinboardManager` add |
| `src/api/server.ts` | `setupRoutes()` | Hier `registerPinboardRoutes()` importeren and aanroepen |
| `src/main.ts` | `startAPI()`, `app.on('will-quit')` | Instantiate and register the manager |
| `src/utils/paths.ts` | `tandemDir()`, `ensureDir()` | For storage path (`~/.tandem/pinboards/`) |
| `src/utils/errors.ts` | `handleRouteError()` | For error handling in routes |
| `src/api/context.ts` | `type RouteContext` | Understand how routes receive context |

---

## To Build in this fase

### Step 1: PinboardManager class

**Wat:** Core data manager that boards and items beheert. JSON opslag in `~/.tandem/pinboards/boards.json`. Follow the exact pattern or `BookmarkManager`: constructor loads data, elke mutatie roept `save()` about.

**File:** `src/pinboards/manager.ts`

```typescript
import path from 'path';
import fs from 'fs';
import { tandemDir, ensureDir } from '../utils/paths';
import { createLogger } from '../utils/logger';

const log = createLogger('PinboardManager');

export interface Pinboard {
  id: string;
  name: string;
  emoji: string;
  createdAt: string;
  updatedAt: string;
  items: PinboardItem[];
}

export interface PinboardItem {
  id: string;
  type: 'link' | 'image' | 'text' | 'quote';
  url?: string;
  title?: string;
  content?: string;
  thumbnail?: string;
  note?: string;
  sourceUrl?: string;
  createdAt: string;
  position: number;
}

interface PinboardStore {
  boards: Pinboard[];
  lastModified: string;
}

export class PinboardManager {
  private storePath: string;
  private store: PinboardStore;

  constructor() {
    const dir = ensureDir(tandemDir('pinboards'));
    this.storePath = path.join(dir, 'boards.json');
    this.store = this.load();
  }

  private load(): PinboardStore {
    // Laad bestaand file or maak leeg store object
    // Zie BookmarkManager.load() for exact pattern
  }

  private save(): void {
    // Update lastModified, schrijf JSON to disk
    // Zie BookmarkManager.save() for exact pattern
  }

  private generateId(): string {
    // Zelfde pattern if BookmarkManager:
    // Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
  }

  // --- Board CRUD ---

  listBoards(): Array<{ id: string; name: string; emoji: string; itemCount: number; createdAt: string; updatedAt: string }> {
    // Return all boards WITHOUT items (for the sidebar list)
    // Voeg itemCount toe if computed field
  }

  getBoard(boardId: string): Pinboard | null {
    // Retourneer één board MET alle items
  }

  createBoard(name: string, emoji?: string): Pinboard {
    // Maak new board, default emoji "📌"
    // save() aanroepen
  }

  updateBoard(boardId: string, updates: { name?: string; emoji?: string }): Pinboard | null {
    // Update name and/or emoji, updatedAt update
    // save() aanroepen
  }

  deleteBoard(boardId: string): boolean {
    // Delete board and alle items
    // save() aanroepen
  }

  // --- Item CRUD ---

  getItems(boardId: string): PinboardItem[] | null {
    // Retourneer items gesorteerd op position
    // null if board not exists
  }

  addItem(boardId: string, item: Omit<PinboardItem, 'id' | 'createdAt' | 'position'>): PinboardItem | null {
    // Voeg item toe about board, genereer id/createdAt/position
    // position = huidige items.length (add about einde)
    // save() aanroepen
    // null if board not exists
  }

  updateItem(boardId: string, itemId: string, updates: { title?: string; note?: string; content?: string }): PinboardItem | null {
    // Update item velden, board updatedAt update
    // save() aanroepen
  }

  deleteItem(boardId: string, itemId: string): boolean {
    // Delete item, herbereken positions or overige items
    // save() aanroepen
  }

  reorderItems(boardId: string, itemIds: string[]): boolean {
    // Zet positions op basis or order in itemIds array
    // save() aanroepen
  }

  destroy(): void {
    // Cleanup (currently noop — no file watchers or timers)
  }
}
```

### Step 2: API Routes

**Wat:** REST endpoints for alle CRUD-operaties. Follow the exact pattern or `registerDataRoutes()` in `src/api/routes/data.ts`.

**File:** `src/api/routes/pinboards.ts`

```typescript
import type { Router, Request, Response } from 'express';
import type { RouteContext } from '../context';
import { handleRouteError } from '../../utils/errors';

export function registerPinboardRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // PINBOARDS — Content Curation Boards
  // ═══════════════════════════════════════════════

  // GET /pinboards — list or alle boards (without items)
  router.get('/pinboards', (req: Request, res: Response) => {
    try {
      const boards = ctx.pinboardManager.listBoards();
      res.json({ ok: true, boards });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // POST /pinboards — new board aanmaken
  router.post('/pinboards', (req: Request, res: Response) => {
    try {
      const { name, emoji } = req.body;
      if (!name) { res.status(400).json({ error: 'name required' }); return; }
      const board = ctx.pinboardManager.createBoard(name, emoji);
      res.json({ ok: true, board });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // GET /pinboards/:id — board ophalen with items
  router.get('/pinboards/:id', (req: Request, res: Response) => {
    try {
      const board = ctx.pinboardManager.getBoard(req.params.id);
      if (!board) { res.status(404).json({ error: 'Board not found' }); return; }
      res.json({ ok: true, board });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // PUT /pinboards/:id — board update
  router.put('/pinboards/:id', (req: Request, res: Response) => {
    try {
      const { name, emoji } = req.body;
      const board = ctx.pinboardManager.updateBoard(req.params.id, { name, emoji });
      if (!board) { res.status(404).json({ error: 'Board not found' }); return; }
      res.json({ ok: true, board });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // DELETE /pinboards/:id — board verwijderen
  router.delete('/pinboards/:id', (req: Request, res: Response) => {
    try {
      const deleted = ctx.pinboardManager.deleteBoard(req.params.id);
      if (!deleted) { res.status(404).json({ error: 'Board not found' }); return; }
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // GET /pinboards/:id/items — items or a board
  router.get('/pinboards/:id/items', (req: Request, res: Response) => {
    try {
      const items = ctx.pinboardManager.getItems(req.params.id);
      if (items === null) { res.status(404).json({ error: 'Board not found' }); return; }
      res.json({ ok: true, items });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // POST /pinboards/:id/items — item add
  router.post('/pinboards/:id/items', (req: Request, res: Response) => {
    try {
      const { type, url, title, content, thumbnail, note, sourceUrl } = req.body;
      if (!type) { res.status(400).json({ error: 'type required' }); return; }
      if (!['link', 'image', 'text', 'quote'].includes(type)) {
        res.status(400).json({ error: 'type must be link, image, text, or quote' }); return;
      }
      const item = ctx.pinboardManager.addItem(req.params.id, {
        type, url, title, content, thumbnail, note, sourceUrl
      });
      if (!item) { res.status(404).json({ error: 'Board not found' }); return; }
      res.json({ ok: true, item });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // PUT /pinboards/:id/items/:itemId — item update
  router.put('/pinboards/:id/items/:itemId', (req: Request, res: Response) => {
    try {
      const { title, note, content } = req.body;
      const item = ctx.pinboardManager.updateItem(req.params.id, req.params.itemId, {
        title, note, content
      });
      if (!item) { res.status(404).json({ error: 'Board or item not found' }); return; }
      res.json({ ok: true, item });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // DELETE /pinboards/:id/items/:itemId — item verwijderen
  router.delete('/pinboards/:id/items/:itemId', (req: Request, res: Response) => {
    try {
      const deleted = ctx.pinboardManager.deleteItem(req.params.id, req.params.itemId);
      if (!deleted) { res.status(404).json({ error: 'Board or item not found' }); return; }
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // POST /pinboards/:id/items/reorder — items herordenen
  router.post('/pinboards/:id/items/reorder', (req: Request, res: Response) => {
    try {
      const { itemIds } = req.body;
      if (!itemIds || !Array.isArray(itemIds)) {
        res.status(400).json({ error: 'itemIds array required' }); return;
      }
      const reordered = ctx.pinboardManager.reorderItems(req.params.id, itemIds);
      if (!reordered) { res.status(404).json({ error: 'Board not found' }); return; }
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
```

### Step 3: Registry Wiring

**Wat:** `PinboardManager` registreren in the centrale registry zodat routes and context menu er bij can.

**File: `src/registry.ts`**

Voeg toe about the imports:
```typescript
import type { PinboardManager } from './pinboards/manager';
```

Voeg toe about `interface ManagerRegistry`:
```typescript
pinboardManager: PinboardManager;
```

**File: `src/api/server.ts`**

Voeg toe about the imports:
```typescript
import { registerPinboardRoutes } from './routes/pinboards';
```

Voeg toe in `setupRoutes()`:
```typescript
registerPinboardRoutes(router, ctx);
```

**File: `src/main.ts`**

Zoek to the blok waar managers be geïnstantieerd (bij `startAPI()` or in the registry-object). Voeg toe:
```typescript
import { PinboardManager } from './pinboards/manager';

const pinboardManager = new PinboardManager();

// In the registry object:
pinboardManager,
```

In `app.on('will-quit')`:
```typescript
pinboardManager.destroy();
```

---

## Acceptatiecriteria — this must werken na the session

```bash
TOKEN=$(cat ~/.tandem/api-token)

# Test 1: List boards (leeg)
curl -s http://localhost:8765/pinboards | jq .
# Verwacht: {"ok":true,"boards":[]}

# Test 2: Bord aanmaken
curl -s -X POST http://localhost:8765/pinboards \
  -H "Content-Type: application/json" \
  -d '{"name": "Research Project", "emoji": "🔬"}' | jq .
# Verwacht: {"ok":true,"board":{"id":"...","name":"Research Project","emoji":"🔬",...}}
# ⬆️ Sla the board ID op for next tests:
BOARD_ID=$(curl -s -X POST http://localhost:8765/pinboards \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Board", "emoji": "🧪"}' | jq -r '.board.id')

# Test 3: List boards (not leeg)
curl -s http://localhost:8765/pinboards | jq .
# Verwacht: {"ok":true,"boards":[{"id":"...","name":"...","emoji":"...","itemCount":0,...}]}

# Test 4: Bord ophalen
curl -s http://localhost:8765/pinboards/$BOARD_ID | jq .
# Verwacht: {"ok":true,"board":{"id":"...","items":[],...}}

# Test 5: Bord update
curl -s -X PUT http://localhost:8765/pinboards/$BOARD_ID \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Board", "emoji": "✅"}' | jq .
# Verwacht: {"ok":true,"board":{"name":"Updated Board","emoji":"✅",...}}

# Test 6: Link item add
curl -s -X POST http://localhost:8765/pinboards/$BOARD_ID/items \
  -H "Content-Type: application/json" \
  -d '{"type": "link", "url": "https://example.com", "title": "Example Site"}' | jq .
# Verwacht: {"ok":true,"item":{"id":"...","type":"link","url":"https://example.com",...}}

# Test 7: Quote item add
curl -s -X POST http://localhost:8765/pinboards/$BOARD_ID/items \
  -H "Content-Type: application/json" \
  -d '{"type": "quote", "content": "Dit is a interessant citaat", "sourceUrl": "https://article.com"}' | jq .
# Verwacht: {"ok":true,"item":{"id":"...","type":"quote","content":"Dit is a interessant citaat",...}}

# Test 8: Image item add
curl -s -X POST http://localhost:8765/pinboards/$BOARD_ID/items \
  -H "Content-Type: application/json" \
  -d '{"type": "image", "url": "https://example.com/photo.jpg", "title": "Mooie foto"}' | jq .
# Verwacht: {"ok":true,"item":{"id":"...","type":"image",...}}

# Test 9: Items ophalen
curl -s http://localhost:8765/pinboards/$BOARD_ID/items | jq .
# Verwacht: {"ok":true,"items":[...3 items gesorteerd op position...]}

# Test 10: Item update (note add)
ITEM_ID=$(curl -s http://localhost:8765/pinboards/$BOARD_ID/items | jq -r '.items[0].id')
curl -s -X PUT http://localhost:8765/pinboards/$BOARD_ID/items/$ITEM_ID \
  -H "Content-Type: application/json" \
  -d '{"note": "Review this later"}' | jq .
# Expect: {"ok":true,"item":{"note":"Review this later",...}}

# Test 11: Items herordenen
ITEM_IDS=$(curl -s http://localhost:8765/pinboards/$BOARD_ID/items | jq '[.items[].id]')
# Draai the order to:
REVERSED=$(echo $ITEM_IDS | jq 'reverse')
curl -s -X POST http://localhost:8765/pinboards/$BOARD_ID/items/reorder \
  -H "Content-Type: application/json" \
  -d "{\"itemIds\": $REVERSED}" | jq .
# Verwacht: {"ok":true}

# Test 12: Item verwijderen
curl -s -X DELETE http://localhost:8765/pinboards/$BOARD_ID/items/$ITEM_ID | jq .
# Verwacht: {"ok":true}

# Test 13: Bord verwijderen
curl -s -X DELETE http://localhost:8765/pinboards/$BOARD_ID | jq .
# Verwacht: {"ok":true}

# Test 14: Not-bestaand board
curl -s http://localhost:8765/pinboards/nonexistent | jq .
# Verwacht: {"error":"Board not found"} with status 404

# Test 15: Validatie — ontbrekend field
curl -s -X POST http://localhost:8765/pinboards \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
# Verwacht: {"error":"name required"} with status 400

# Test 16: Validatie — ongeldig type
curl -s -X POST http://localhost:8765/pinboards/$BOARD_ID/items \
  -H "Content-Type: application/json" \
  -d '{"type": "video"}' | jq .
# Verwacht: {"error":"type must be link, image, text, or quote"} with status 400

# Test 17: Storage check — file exists
ls -la ~/.tandem/pinboards/boards.json
# Verwacht: file exists with JSON inhoud
```

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file (fase-1-backend-api.md) fully
3. Run: curl http://localhost:8765/status && npx tsc && git status
4. Read the files in the "Files to read" table above
```

### Bij einde:
```
1. npx tsc — ZERO errors verplicht
2. npm start — app start without crashes
3. Alle curl tests out "Acceptatiecriteria" uitvoeren
4. npx vitest run — alle existing tests blijven slagen
5. Update CHANGELOG.md with korte entry
6. git commit -m "📌 feat: PinboardManager + REST API endpoints"
7. git push
8. Rapport:
   ## Gebouwd
   ## Getest (plak curl output)
   ## Problemen
   ## Next session start bij fase-2-ui-panel.md
```

---

## Bekende valkuilen

- [ ] **Vergeet not `ensureDir()`** — the `~/.tandem/pinboards/` directory must bestaan for first schrijf
- [ ] **Vergeet not registry wiring** — 3 plekken: `registry.ts`, `main.ts` (instantiëren + will-quit), `server.ts` (routes)
- [ ] **Position herberekenen bij delete** — if item with position 1 is removed, must items with position 2+ to beneden schuiven
- [ ] **TypeScript strict mode** — no `any` buiten catch blocks. Usage `handleRouteError()` in plaats or `(e: any) => res.status(500).json()`
- [ ] **Lege emoji default** — if no emoji is meegegeven, usage "📌" if default
- [ ] **JSON encoding** — `JSON.stringify(store, null, 2)` for leesbare opslag (same if BookmarkManager)
