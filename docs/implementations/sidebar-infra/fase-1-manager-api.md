# Phase 1 — Sidebar Infrastructuur: SidebarManager + Config API

> **Sessions:** 1
> **Depends on:** None
> **Next phase:** fase-2-shell-ui.md

---

## Goal

Bouw `SidebarManager` with config opslag and registreer REST API endpoints.
After this phase: Kees can sidebar config read/schrijven via API. No UI yet.

---

## Existing Files to Read — ONLY These

| File | Look for | Why |
|---------|-----------|--------|
| `AGENTS.md` | — (fully) | Rules + code style |
| `src/registry.ts` | `interface ManagerRegistry` | Add `sidebarManager` toe |
| `src/main.ts` | `startAPI()` + `app.on('will-quit')` | Manager wiring |
| `src/api/server.ts` | blok with `import { register...Routes }` and `registerDataRoutes(router, ctx)` aanroep | Patroon for new route import + aanroep |
| `src/bookmarks/manager.ts` | `class BookmarkManager` | Copy the `load`/`save`/`tandemDir` pattern |
| `src/utils/paths.ts` | `function tandemDir()`, `function ensureDir()` | Storage location |
| `src/utils/errors.ts` | `function handleRouteError()` | Error handling |
| `src/api/routes/data.ts` | `function registerDataRoutes()` + first 3 endpoints | Copy route pattern |

---

## To Build

### Step 1: Types (`src/sidebar/types.ts`)

```typescript
export type SidebarState = 'hidden' | 'narrow' | 'wide';
export type SidebarItemType = 'panel' | 'webview';

export interface SidebarItem {
  id: string;
  label: string;
  icon: string;         // SVG string (Heroicons outline)
  type: SidebarItemType;
  enabled: boolean;
  order: number;
}

export interface SidebarConfig {
  state: SidebarState;
  activeItemId: string | null;
  items: SidebarItem[];
}
```

### Step 2: Manager (`src/sidebar/manager.ts`)

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { tandemDir, ensureDir } from '../utils/paths';
import type { SidebarConfig, SidebarItem, SidebarState } from './types';

// Elke messenger gets own slot (zoals Opera) — no gegroepeerde "Messengers" knop
const DEFAULT_CONFIG: SidebarConfig = {
  state: 'narrow',
  activeItemId: null,
  items: [
    { id: 'workspaces', label: 'Workspaces',   icon: '', type: 'panel',   enabled: true, order: 0 },
    { id: 'news',       label: 'Personal News', icon: '', type: 'panel',   enabled: true, order: 1 },
    { id: 'pinboards',  label: 'Pinboards',    icon: '', type: 'panel',   enabled: true, order: 2 },
    { id: 'bookmarks',  label: 'Bookmarks',    icon: '', type: 'panel',   enabled: true, order: 3 },
    { id: 'history',    label: 'History',      icon: '', type: 'panel',   enabled: true, order: 4 },
    { id: 'downloads',  label: 'Downloads',    icon: '', type: 'panel',   enabled: true, order: 5 },
    // Messenger items — elk apart, with own webview partition
    { id: 'whatsapp',   label: 'WhatsApp',     icon: '', type: 'webview', enabled: true, order: 6 },
    { id: 'telegram',   label: 'Telegram',     icon: '', type: 'webview', enabled: true, order: 7 },
    { id: 'discord',    label: 'Discord',      icon: '', type: 'webview', enabled: true, order: 8 },
    { id: 'slack',      label: 'Slack',        icon: '', type: 'webview', enabled: true, order: 9 },
    { id: 'instagram',  label: 'Instagram',    icon: '', type: 'webview', enabled: true, order: 10 },
    { id: 'x',          label: 'X (Twitter)',  icon: '', type: 'webview', enabled: true, order: 11 },
  ]
};

export class SidebarManager {
  private storageFile: string;
  private config: SidebarConfig;

  constructor() {
    this.storageFile = path.join(tandemDir(), 'sidebar-config.json');
    this.config = this.load();
  }

  getConfig(): SidebarConfig { return this.config; }

  updateConfig(partial: Partial<SidebarConfig>): SidebarConfig {
    this.config = { ...this.config, ...partial };
    this.save();
    return this.config;
  }

  toggleItem(id: string): SidebarItem | undefined {
    const item = this.config.items.find(i => i.id === id);
    if (!item) return undefined;
    item.enabled = !item.enabled;
    this.save();
    return item;
  }

  reorderItems(orderedIds: string[]): void {
    orderedIds.forEach((id, idx) => {
      const item = this.config.items.find(i => i.id === id);
      if (item) item.order = idx;
    });
    this.config.items.sort((a, b) => a.order - b.order);
    this.save();
  }

  setState(state: SidebarState): void {
    this.config.state = state;
    this.save();
  }

  setActiveItem(id: string | null): void {
    this.config.activeItemId = id;
    this.save();
  }

  private load(): SidebarConfig {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = JSON.parse(fs.readFileSync(this.storageFile, 'utf8'));
        // Merge with defaults to handle new items added in future versions
        return { ...DEFAULT_CONFIG, ...raw };
      }
    } catch { /* use defaults */ }
    return { ...DEFAULT_CONFIG };
  }

  private save(): void {
    try {
      ensureDir(tandemDir());
      fs.writeFileSync(this.storageFile, JSON.stringify(this.config, null, 2));
    } catch { /* ignore */ }
  }

  destroy(): void { /* nothing to clean up */ }
}
```

### Step 3: Routes (`src/api/routes/sidebar.ts`)

```typescript
import type { Router, Request, Response } from 'express';
import type { RouteContext } from '../context';
import { handleRouteError } from '../../utils/errors';

export function registerSidebarRoutes(router: Router, ctx: RouteContext): void {
  // GET /sidebar/config
  router.get('/sidebar/config', (_req: Request, res: Response) => {
    try {
      res.json({ ok: true, config: ctx.sidebarManager.getConfig() });
    } catch (e) { handleRouteError(res, e); }
  });

  // POST /sidebar/config — update state, activeItemId, item order
  router.post('/sidebar/config', (req: Request, res: Response) => {
    try {
      const config = ctx.sidebarManager.updateConfig(req.body);
      res.json({ ok: true, config });
    } catch (e) { handleRouteError(res, e); }
  });

  // POST /sidebar/items/:id/toggle — enable/disable a item
  router.post('/sidebar/items/:id/toggle', (req: Request, res: Response) => {
    try {
      const item = ctx.sidebarManager.toggleItem(req.params.id);
      if (!item) { res.status(404).json({ error: 'Item not found' }); return; }
      res.json({ ok: true, item });
    } catch (e) { handleRouteError(res, e); }
  });

  // POST /sidebar/items/:id/activate — panel openen (or sluiten if already actief)
  router.post('/sidebar/items/:id/activate', (req: Request, res: Response) => {
    try {
      const cfg = ctx.sidebarManager.getConfig();
      const newActive = cfg.activeItemId === req.params.id ? null : req.params.id;
      ctx.sidebarManager.setActiveItem(newActive);
      res.json({ ok: true, activeItemId: newActive });
    } catch (e) { handleRouteError(res, e); }
  });

  // POST /sidebar/reorder — drag-to-reorder
  router.post('/sidebar/reorder', (req: Request, res: Response) => {
    try {
      const { orderedIds } = req.body; // string[]
      if (!Array.isArray(orderedIds)) { res.status(400).json({ error: 'orderedIds must be array' }); return; }
      ctx.sidebarManager.reorderItems(orderedIds);
      res.json({ ok: true, config: ctx.sidebarManager.getConfig() });
    } catch (e) { handleRouteError(res, e); }
  });

  // POST /sidebar/state — toggle hidden/narrow/wide
  router.post('/sidebar/state', (req: Request, res: Response) => {
    try {
      const { state } = req.body;
      if (!['hidden', 'narrow', 'wide'].includes(state)) {
        res.status(400).json({ error: 'state must be hidden|narrow|wide' }); return;
      }
      ctx.sidebarManager.setState(state);
      res.json({ ok: true, state });
    } catch (e) { handleRouteError(res, e); }
  });
}
```

### Step 4: Wiring in `src/registry.ts`

Voeg toe about `interface ManagerRegistry`:
```typescript
import type { SidebarManager } from './sidebar/manager';
// ...in interface:
sidebarManager: SidebarManager;
```

### Stap 5: Wiring in `src/main.ts`

In `startAPI()`:
```typescript
import { SidebarManager } from './sidebar/manager';
// ...
sidebarManager = new SidebarManager();
```

In the `registry` object:
```typescript
sidebarManager: sidebarManager!,
```

In `app.on('will-quit')`:
```typescript
if (sidebarManager) sidebarManager.destroy();
```

### Stap 6: Route registratie in `src/api/server.ts`

Import add:
```typescript
import { registerSidebarRoutes } from './routes/sidebar';
```

In the routes registratie section:
```typescript
registerSidebarRoutes(router, ctx);
```

---

## Acceptatiecriteria

```bash
TOKEN=$(cat ~/.tandem/api-token)

# 1. Config ophalen (default config)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/sidebar/config
# Verwacht: {"ok":true,"config":{"state":"narrow","activeItemId":null,"items":[...]}}

# 2. State change to hidden
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"state":"hidden"}' http://localhost:8765/sidebar/state
# Verwacht: {"ok":true,"state":"hidden"}

# 3. Item activeren
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/sidebar/items/bookmarks/activate
# Verwacht: {"ok":true,"activeItemId":"bookmarks"}

# 4. Item disable/enable
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/sidebar/items/history/toggle
# Verwacht: {"ok":true,"item":{"id":"history","enabled":false,...}}

# 5. Reorder
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"orderedIds":["bookmarks","workspaces","messengers","news","pinboards","history","downloads"]}' \
  http://localhost:8765/sidebar/reorder
# Verwacht: {"ok":true,"config":{...items in new order...}}

# 6. Config persistent (herstart and check)
# Stop app, start again, curl /sidebar/config → custom order must be preserved
```

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file fully
3. Run: curl http://localhost:8765/status && npx tsc && git status
4. Read the files in the tabel hierboven (only that files!)
```

### Bij einde:
```
1. npx tsc — ZERO errors
2. npm start — app start without crashes
3. Alle 6 curl tests uitvoeren and output in rapport plakken
4. npx vitest run — existing tests blijven slagen
5. CHANGELOG.md: entry add
6. git add src/sidebar/ src/registry.ts src/main.ts src/api/server.ts src/api/routes/sidebar.ts CHANGELOG.md
7. git commit -m "🗂️ feat: sidebar infrastructure — SidebarManager + config API"
8. git push
9. Update LEES-MIJ-EERST.md: Phase 1 → ✅ + commit hash
10. Rapport: Gebouwd / Getest / Problemen / Next session: fase-2-shell-ui.md
```
