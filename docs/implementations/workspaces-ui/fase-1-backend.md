# Phase 1 — Backend: WorkspaceManager + Tab Mapping + API

> **Feature:** Workspaces UI
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** None

---

## Goal or this fase

Bouw the `WorkspaceManager` that workspace metadata beheert (name, color, emoji) and tabs about workspaces koppelt. The manager bouwt bovenop the existing `SessionManager` — elke workspace correspondeert 1:1 with a session. Registreer API endpoints zodat workspaces via REST aangestuurd can be. After this phase can you via `curl` workspaces aanmaken, wisselen, and tabs verplaatsen.

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `src/sessions/manager.ts` | `class SessionManager`, `create()`, `setActive()`, `list()` | WorkspaceManager delegeert session operaties hiernaartoe |
| `src/sessions/types.ts` | `interface Session` | Session data model begrijpen |
| `src/tabs/manager.ts` | `class TabManager`, `listTabs()`, `getTab()` | Tab→workspace mapping |
| `src/main.ts` | `startAPI()` | Hier is WorkspaceManager aangemaakt and geregistreerd |
| `src/main.ts` | `app.on('will-quit')` | Cleanup add |
| `src/registry.ts` | `interface ManagerRegistry` | WorkspaceManager add |
| `src/api/server.ts` | `setupRoutes()` | Route-module registreren |
| `src/api/routes/sessions.ts` | `registerSessionRoutes()` | Referentiepatroon for route registratie |

---

## To Build in this fase

### Step 1: WorkspaceManager class

**Wat:** Manager that workspace metadata and tab-toewijzingen beheert. Elke workspace mapt op a SessionManager session. Metadata is opgeslagen in `~/.tandem/workspaces.json`.

**File:** `src/workspaces/manager.ts`

```typescript
import { SessionManager } from '../sessions/manager';
import { TabManager } from '../tabs/manager';

export interface WorkspaceMetadata {
  name: string;
  color: string;      // hex color, bv. '#4285f4'
  emoji: string;       // bv. '💼' or 'W'
  order: number;       // order in the strip
  isDefault: boolean;
  tabIds: number[];    // tabs that bij this workspace belong
}

export class WorkspaceManager {
  private workspaces: Folder<string, WorkspaceMetadata> = new Folder();
  private sessionManager: SessionManager;
  private tabManager: TabManager;

  constructor(sessionManager: SessionManager, tabManager: TabManager) { ... }

  /** Laad workspace metadata or disk */
  private loadFromDisk(): void { ... }

  /** Sla workspace metadata op to disk */
  private saveToDisk(): void { ... }

  /** List alle workspaces */
  list(): WorkspaceMetadata[] { ... }

  /** Maak new workspace (= session + metadata) */
  create(opts: { name: string; color?: string; emoji?: string }): WorkspaceMetadata { ... }

  /** Delete workspace (tabs gaan to default) */
  remove(name: string): void { ... }

  /** Activeer workspace (= session switch + notificatie) */
  switch(name: string): WorkspaceMetadata { ... }

  /** Haal actieve workspace op */
  getActive(): WorkspaceMetadata { ... }

  /** Update workspace metadata */
  update(name: string, opts: { color?: string; emoji?: string; newName?: string }): WorkspaceMetadata { ... }

  /** Verplaats tab to workspace */
  moveTab(tabId: number, workspaceName: string): void { ... }

  /** Haal tabs op for a workspace */
  getTabs(workspaceName: string): number[] { ... }

  /** Wijs new geopende tab toe about actieve workspace */
  assignTabToActive(tabId: number): void { ... }

  /** Cleanup */
  destroy(): void { ... }
}
```

**Kernlogica:**
- `create()` roept `sessionManager.create(name)` about and voegt metadata toe
- `switch()` roept `sessionManager.setActive(name)` about and stuurt IPC event `workspace-switched` to the shell
- `moveTab()` verplaatst tabId or the ene workspace's `tabIds` array to the andere
- `assignTabToActive()` is aangeroepen wanneer a new tab geopend is — voegt tabId toe about actieve workspace
- Default workspace has default color `#4285f4` (blauw) and emoji `🏠`

### Step 2: Persistence — workspaces.json

**Wat:** Workspace metadata save in `~/.tandem/workspaces.json` zodat the browser restarts overleeft.

**File:** `src/workspaces/manager.ts` (in `loadFromDisk()` and `saveToDisk()`)

```typescript
// ~/.tandem/workspaces.json
{
  "workspaces": [
    {
      "name": "default",
      "color": "#4285f4",
      "emoji": "🏠",
      "order": 0,
      "isDefault": true,
      "tabIds": [1, 2, 3]
    },
    {
      "name": "Work",
      "color": "#4ecca3",
      "emoji": "💼",
      "order": 1,
      "isDefault": false,
      "tabIds": [4, 5]
    }
  ]
}
```

### Step 3: API routes

**Wat:** REST endpoints for workspace management.

**File:** `src/api/routes/workspaces.ts`

**Function:** `registerWorkspaceRoutes(router, ctx)`

```typescript
export function registerWorkspaceRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // WORKSPACES — Visual workspace management
  // ═══════════════════════════════════════════════

  router.get('/workspaces', (req, res) => { ... });
  router.post('/workspaces', (req, res) => { ... });
  router.delete('/workspaces/:name', (req, res) => { ... });
  router.post('/workspaces/:name/switch', (req, res) => { ... });
  router.put('/workspaces/:name', (req, res) => { ... });
  router.post('/workspaces/:name/move-tab', (req, res) => { ... });
  router.get('/workspaces/:name/tabs', (req, res) => { ... });
}
```

### Step 4: Wiring — registreer manager and routes

**File:** `src/registry.ts` — voeg `workspaceManager: WorkspaceManager` toe about interface

**File:** `src/main.ts` — instantieer in `startAPI()`:
```typescript
import { WorkspaceManager } from './workspaces/manager';
const workspaceManager = new WorkspaceManager(sessionManager!, tabManager!);
```

Voeg toe about registry object and will-quit cleanup.

**File:** `src/api/server.ts` — registreer routes in `setupRoutes()`:
```typescript
import { registerWorkspaceRoutes } from './routes/workspaces';
registerWorkspaceRoutes(router, ctx);
```

---

## Acceptatiecriteria — this must werken na the session

```bash
# Test 1: List workspaces (only default)
TOKEN=$(cat ~/.tandem/api-token)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/workspaces
# Verwacht: {"ok":true, "workspaces":[{"name":"default","color":"#4285f4","emoji":"🏠","order":0,"isDefault":true,"tabIds":[...]}]}

# Test 2: Maak new workspace
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/workspaces \
  -H "Content-Type: application/json" \
  -d '{"name": "Work", "color": "#4ecca3", "emoji": "💼"}'
# Verwacht: {"ok":true, "workspace":{"name":"Work","color":"#4ecca3","emoji":"💼","order":1,...}}

# Test 3: Switch to new workspace
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/workspaces/Work/switch
# Verwacht: {"ok":true, "workspace":{"name":"Work",...}}

# Test 4: Verplaats tab to workspace
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/workspaces/Work/move-tab \
  -H "Content-Type: application/json" \
  -d '{"tabId": 1}'
# Verwacht: {"ok":true}

# Test 5: Haal tabs op for workspace
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/workspaces/Work/tabs
# Verwacht: {"ok":true, "tabIds":[1]}

# Test 6: Update workspace metadata
curl -H "Authorization: Bearer $TOKEN" \
  -X PUT http://localhost:8765/workspaces/Work \
  -H "Content-Type: application/json" \
  -d '{"color": "#e94560", "emoji": "🔥"}'
# Verwacht: {"ok":true, "workspace":{"name":"Work","color":"#e94560","emoji":"🔥",...}}

# Test 7: Delete workspace
curl -H "Authorization: Bearer $TOKEN" \
  -X DELETE http://localhost:8765/workspaces/Work
# Verwacht: {"ok":true}

# Test 8: Can default not verwijderen
curl -H "Authorization: Bearer $TOKEN" \
  -X DELETE http://localhost:8765/workspaces/default
# Verwacht: {"error":"Cannot delete the default workspace"}
```

**Compilatie verificatie:**
- [ ] `npx tsc` — zero errors
- [ ] `npx vitest run` — alle existing tests slagen
- [ ] `npm start` — app start without crashes

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file (fase-1-backend.md) fully
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
6. git commit -m "🏢 feat: workspace manager + API endpoints"
7. git push
8. Rapport:
   ## Gebouwd
   ## Getest (plak curl output)
   ## Problemen
   ## Next session start bij fase-2-shell-ui.md
```

---

## Bekende valkuilen

- [ ] Vergeet not `destroy()` toe te voegen about will-quit handler
- [ ] Vergeet not `saveToDisk()` about te roepen na elke mutatie (create, update, remove, moveTab)
- [ ] TypeScript strict mode — no `any` buiten catch blocks
- [ ] Tab IDs can hergebruikt be na tab sluiting — clean stale tabIds out workspace data bij laden
- [ ] SessionManager.create() gooit error if session already exists — WorkspaceManager must this afhandelen
