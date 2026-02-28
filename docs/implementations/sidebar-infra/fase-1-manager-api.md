# Fase 1 — Sidebar Infrastructuur: SidebarManager + Config API

> **Sessies:** 1
> **Afhankelijk van:** Niets
> **Volgende fase:** fase-2-shell-ui.md

---

## Doel

Bouw `SidebarManager` met config opslag en registreer REST API endpoints.
Na deze fase: Kees kan sidebar config lezen/schrijven via API. Nog geen UI.

---

## Bestaande bestanden te lezen — ALLEEN dit

| Bestand | Zoek naar | Waarom |
|---------|-----------|--------|
| `AGENTS.md` | — (volledig) | Regels + code stijl |
| `src/registry.ts` | `interface ManagerRegistry` | Hier voeg je `sidebarManager` toe |
| `src/main.ts` | `startAPI()` + `app.on('will-quit')` | Manager wiring |
| `src/api/server.ts` | blok met `import { register...Routes }` en `registerDataRoutes(router, ctx)` aanroep | Patroon voor nieuwe route import + aanroep |
| `src/bookmarks/manager.ts` | `class BookmarkManager` | Kopieer het load/save/tandemDir patroon |
| `src/utils/paths.ts` | `function tandemDir()`, `function ensureDir()` | Storage locatie |
| `src/utils/errors.ts` | `function handleRouteError()` | Error handling |
| `src/api/routes/data.ts` | `function registerDataRoutes()` + eerste 3 endpoints | Route patroon kopiëren |

---

## Te bouwen

### Stap 1: Types (`src/sidebar/types.ts`)

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

### Stap 2: Manager (`src/sidebar/manager.ts`)

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { tandemDir, ensureDir } from '../utils/paths';
import type { SidebarConfig, SidebarItem, SidebarState } from './types';

// Elke messenger krijgt eigen slot (zoals Opera) — geen gegroepeerde "Messengers" knop
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
    // Messenger items — elk apart, met eigen webview partition
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

### Stap 3: Routes (`src/api/routes/sidebar.ts`)

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

  // POST /sidebar/items/:id/toggle — enable/disable een item
  router.post('/sidebar/items/:id/toggle', (req: Request, res: Response) => {
    try {
      const item = ctx.sidebarManager.toggleItem(req.params.id);
      if (!item) { res.status(404).json({ error: 'Item not found' }); return; }
      res.json({ ok: true, item });
    } catch (e) { handleRouteError(res, e); }
  });

  // POST /sidebar/items/:id/activate — panel openen (of sluiten als al actief)
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

### Stap 4: Wiring in `src/registry.ts`

Voeg toe aan `interface ManagerRegistry`:
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

In de `registry` object:
```typescript
sidebarManager: sidebarManager!,
```

In `app.on('will-quit')`:
```typescript
if (sidebarManager) sidebarManager.destroy();
```

### Stap 6: Route registratie in `src/api/server.ts`

Import toevoegen:
```typescript
import { registerSidebarRoutes } from './routes/sidebar';
```

In de routes registratie sectie:
```typescript
registerSidebarRoutes(router, ctx);
```

---

## Acceptatiecriteria

```bash
TOKEN=$(cat ~/.tandem/api-token)

# 1. Config ophalen (standaard config)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/sidebar/config
# Verwacht: {"ok":true,"config":{"state":"narrow","activeItemId":null,"items":[...]}}

# 2. State wijzigen naar hidden
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
# Verwacht: {"ok":true,"config":{...items in nieuwe volgorde...}}

# 6. Config persistent (herstart en check)
# Stop app, start opnieuw, curl /sidebar/config → custom volgorde moet bewaard zijn
```

---

## Sessie Protocol

### Bij start:
```
1. Lees LEES-MIJ-EERST.md
2. Lees DIT bestand volledig
3. Run: curl http://localhost:8765/status && npx tsc && git status
4. Lees de bestanden in de tabel hierboven (alleen die bestanden!)
```

### Bij einde:
```
1. npx tsc — ZERO errors
2. npm start — app start zonder crashes
3. Alle 6 curl tests uitvoeren en output in rapport plakken
4. npx vitest run — bestaande tests blijven slagen
5. CHANGELOG.md: entry toevoegen
6. git add src/sidebar/ src/registry.ts src/main.ts src/api/server.ts src/api/routes/sidebar.ts CHANGELOG.md
7. git commit -m "🗂️ feat: sidebar infrastructure — SidebarManager + config API"
8. git push
9. Update LEES-MIJ-EERST.md: Fase 1 → ✅ + commit hash
10. Rapport: Gebouwd / Getest / Problemen / Volgende sessie: fase-2-shell-ui.md
```
