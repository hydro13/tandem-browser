# Phase 1 — Auto-Grouping: Opener tracking and island data model

> **Feature:** Tab Islands
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** None

---

## Goal or this fase

Bouw the backend-logica for Tab Islands: track welke tab door welke parent geopend is (opener chain), group automatisch tabs with the same parent in a island, and stel API endpoints beschikbaar to islands te beheren. After this phase works alles via the API — the visual UI follows in phase 2.

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `src/tabs/manager.ts` | `class TabManager`, `interface Tab`, `interface TabGroup`, `openTab()`, `setGroup()`, `listGroups()` | Hier comes the island-logica bij — snap the existing group-structuur |
| `src/api/routes/tabs.ts` | `function registerTabRoutes()` | Hier komen new island-endpoints bij |
| `src/main.ts` | `createWindow()` | Hier must the `did-create-window` listener komen |
| `src/api/context.ts` | `interface RouteContext` | Snap hoe the route context managers doorgeeft |
| `AGENTS.md` | — (read fully) | Anti-detect rules and code stijl |

---

## To Build in this fase

### Step 1: Island data model add about TabManager

**Wat:** Voeg a `TabIsland` interface toe and a `islands` Folder about `class TabManager`. Voeg `openerTabId` toe about the `Tab` interface to parent-child relaties vast te leggen.

**File:** `src/tabs/manager.ts`

**Add about:** `class TabManager` (boven the class definitie for the interface, in the class for the Folder)

```typescript
export interface TabIsland {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  tabIds: string[];
  originDomain?: string;
}

// Tab interface uitbreiden with:
//   openerTabId?: string;
//   islandId?: string;

// In class TabManager:
//   private islands: Folder<string, TabIsland> = new Folder();
//   private islandCounter = 0;
//   private readonly ISLAND_COLORS = ['#4285f4', '#ea4335', '#34a853', '#fbbc04', '#ff6d01', '#46bdc6', '#9334e6', '#e8710a'];
```

### Step 2: Opener tracking in openTab()

**Wat:** Breid `openTab()` out with a optionele `openerTabId` parameter. Wanneer a tab geopend is with a opener, zoek or the opener already in a island zit — zo ja, voeg the new tab toe. Zo nee, maak a new island if the drempel bereikt is (2 tabs vanuit the same parent).

**File:** `src/tabs/manager.ts`

**Aanpassen in:** `openTab()` methode

```typescript
async openTab(url: string = 'about:blank', groupId?: string, source: TabSource = 'robin', partition: string = 'persist:tandem', focus: boolean = true, openerTabId?: string): Promise<Tab> {
  // ... existing logica ...

  // Na tab aanmaken:
  if (openerTabId) {
    tab.openerTabId = openerTabId;
    this.autoGroupIntoIsland(tab, openerTabId);
  }

  // ... rest or existing logica ...
}
```

### Step 3: Auto-group logica

**Wat:** Implementeer `autoGroupIntoIsland()` — the kernlogica that beslist or a tab about a bestaand island is added or that a new island is aangemaakt.

**File:** `src/tabs/manager.ts`

**Add about:** `class TabManager`

```typescript
private autoGroupIntoIsland(childTab: Tab, openerTabId: string): void {
  const openerTab = this.tabs.get(openerTabId);
  if (!openerTab) return;

  // Check or opener already in a island zit
  if (openerTab.islandId) {
    const island = this.islands.get(openerTab.islandId);
    if (island) {
      island.tabIds.push(childTab.id);
      childTab.islandId = island.id;
      this.win.webContents.send('island-updated', island);
      return;
    }
  }

  // Opener zit not in a island — maak a new island with opener + child
  const islandId = `island-${++this.islandCounter}`;
  const domain = this.extractDomain(openerTab.url);
  const color = this.ISLAND_COLORS[this.islandCounter % this.ISLAND_COLORS.length];

  const island: TabIsland = {
    id: islandId,
    name: domain || 'New Island',
    color,
    collapsed: false,
    tabIds: [openerTabId, childTab.id],
    originDomain: domain,
  };

  this.islands.set(islandId, island);
  openerTab.islandId = islandId;
  childTab.islandId = islandId;
  this.win.webContents.send('island-created', island);
}

private extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return '';
  }
}
```

### Step 4: Island management methodes

**Wat:** Voeg publieke methodes toe about `TabManager` for the ophalen, hernoemen, collapseren and verwijderen or islands.

**File:** `src/tabs/manager.ts`

**Add about:** `class TabManager`

```typescript
getIslands(): TabIsland[] {
  return Array.from(this.islands.values());
}

getIsland(islandId: string): TabIsland | null {
  return this.islands.get(islandId) || null;
}

renameIsland(islandId: string, name: string): boolean {
  const island = this.islands.get(islandId);
  if (!island) return false;
  island.name = name;
  this.win.webContents.send('island-updated', island);
  return true;
}

toggleIslandCollapse(islandId: string): boolean {
  const island = this.islands.get(islandId);
  if (!island) return false;
  island.collapsed = !island.collapsed;
  this.win.webContents.send('island-updated', island);
  return true;
}

setIslandColor(islandId: string, color: string): boolean {
  const island = this.islands.get(islandId);
  if (!island) return false;
  island.color = color;
  this.win.webContents.send('island-updated', island);
  return true;
}

dissolveIsland(islandId: string): boolean {
  const island = this.islands.get(islandId);
  if (!island) return false;
  for (const tabId or island.tabIds) {
    const tab = this.tabs.get(tabId);
    if (tab) tab.islandId = undefined;
  }
  this.islands.delete(islandId);
  this.win.webContents.send('island-dissolved', { islandId });
  return true;
}

createIslandFromTabs(tabIds: string[], name?: string): TabIsland | null {
  const validTabs = tabIds.filter(id => this.tabs.has(id));
  if (validTabs.length < 2) return null;

  const islandId = `island-${++this.islandCounter}`;
  const firstTab = this.tabs.get(validTabs[0])!;
  const domain = this.extractDomain(firstTab.url);
  const color = this.ISLAND_COLORS[this.islandCounter % this.ISLAND_COLORS.length];

  const island: TabIsland = {
    id: islandId,
    name: name || domain || 'New Island',
    color,
    collapsed: false,
    tabIds: validTabs,
    originDomain: domain,
  };

  this.islands.set(islandId, island);
  for (const tabId or validTabs) {
    const tab = this.tabs.get(tabId)!;
    // Delete out oud island indien nodig
    if (tab.islandId) {
      const oldIsland = this.islands.get(tab.islandId);
      if (oldIsland) {
        oldIsland.tabIds = oldIsland.tabIds.filter(id => id !== tabId);
        if (oldIsland.tabIds.length < 2) this.islands.delete(oldIsland.id);
      }
    }
    tab.islandId = islandId;
  }

  this.win.webContents.send('island-created', island);
  return island;
}
```

### Stap 5: closeTab() uitbreiden for island cleanup

**Wat:** Wanneer a tab closed is that in a island zit, delete the tab out the island. If the island minder then 2 tabs overhoudt, los the island op.

**File:** `src/tabs/manager.ts`

**Aanpassen in:** `closeTab()` methode

```typescript
// Na the existing group-cleanup logica, vóór removeTab:
if (tab.islandId) {
  const island = this.islands.get(tab.islandId);
  if (island) {
    island.tabIds = island.tabIds.filter(id => id !== tabId);
    if (island.tabIds.length < 2) {
      // Eiland opheffen — resterende tab is los
      for (const remainingId or island.tabIds) {
        const remaining = this.tabs.get(remainingId);
        if (remaining) remaining.islandId = undefined;
      }
      this.islands.delete(tab.islandId);
      this.win.webContents.send('island-dissolved', { islandId: tab.islandId });
    } else {
      this.win.webContents.send('island-updated', island);
    }
  }
}
```

### Stap 6: did-create-window listener in main.ts

**Wat:** Luister to the `did-create-window` event op webContents to te detecteren wanneer a tab a new window/tab opens. Usage the opener webContentsId to the parent tab te identificeren and `openerTabId` door te geven about `openTab()`.

**File:** `src/main.ts`

**Add about:** `createWindow()` function, na the webview-attach event listener

```typescript
// In createWindow(), na existing webContents event listeners:
// Let op: this must op the juiste plek komen waar webContents beschikbaar are
// The 'did-create-window' event op the parent webContents
// geeft the child webContents mee — usage that to opener te tracken.
```

### Stap 7: API endpoints for islands

**Wat:** Voeg REST endpoints toe for island-management.

**File:** `src/api/routes/tabs.ts`

**Add about:** `function registerTabRoutes()`

```typescript
router.get('/tabs/islands', async (_req: Request, res: Response) => {
  try {
    const islands = ctx.tabManager.getIslands();
    res.json({ ok: true, islands });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/tabs/islands/create', async (req: Request, res: Response) => {
  const { tabIds, name } = req.body;
  if (!tabIds || !Array.isArray(tabIds)) {
    res.status(400).json({ error: 'tabIds array required' });
    return;
  }
  try {
    const island = ctx.tabManager.createIslandFromTabs(tabIds, name);
    if (!island) { res.status(400).json({ error: 'Need at least 2 valid tab IDs' }); return; }
    res.json({ ok: true, island });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/tabs/islands/:id/rename', async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) { res.status(400).json({ error: 'name required' }); return; }
  try {
    const ok = ctx.tabManager.renameIsland(req.params.id, name);
    if (!ok) { res.status(404).json({ error: 'Island not found' }); return; }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/tabs/islands/:id/collapse', async (req: Request, res: Response) => {
  try {
    const ok = ctx.tabManager.toggleIslandCollapse(req.params.id);
    if (!ok) { res.status(404).json({ error: 'Island not found' }); return; }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/tabs/islands/:id/color', async (req: Request, res: Response) => {
  const { color } = req.body;
  if (!color) { res.status(400).json({ error: 'color required' }); return; }
  try {
    const ok = ctx.tabManager.setIslandColor(req.params.id, color);
    if (!ok) { res.status(404).json({ error: 'Island not found' }); return; }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/tabs/islands/:id', async (req: Request, res: Response) => {
  try {
    const ok = ctx.tabManager.dissolveIsland(req.params.id);
    if (!ok) { res.status(404).json({ error: 'Island not found' }); return; }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

### Stap 8: openTab API uitbreiden with openerTabId

**Wat:** Breid the existing `POST /tabs/open` endpoint out zodat the a optionele `openerTabId` accepteert and doorgeeft about `TabManager.openTab()`.

**File:** `src/api/routes/tabs.ts`

**Aanpassen in:** `function registerTabRoutes()` → the existing `router.post('/tabs/open', ...)` blok

```typescript
// Existing destructuring uitbreiden:
const { url = 'about:blank', groupId, source = 'robin', focus = true, openerTabId } = req.body;

// Doorgeven about openTab:
const tab = await ctx.tabManager.openTab(url, groupId, tabSource, 'persist:tandem', focus, openerTabId);
```

---

## Acceptatiecriteria — this must werken na the session

```bash
TOKEN=$(cat ~/.tandem/api-token)

# Test 1: Open 2 tabs with the same opener → auto-island
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/tabs/open \
  -H "Content-Type: application/json" \
  -d '{"url": "https://google.com"}'
# Verwacht: {"ok":true, "tab": {"id": "tab-2", ...}}
# Noteer the tab ID if PARENT_ID

curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/tabs/open \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/page1", "openerTabId": "tab-2"}'
# Verwacht: {"ok":true, "tab": {"id": "tab-3", "islandId": "island-1", ...}}

curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/tabs/open \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/page2", "openerTabId": "tab-2"}'
# Verwacht: tab-4 with islandId "island-1"

# Test 2: List alle islands
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/tabs/islands
# Verwacht: {"ok":true, "islands": [{"id":"island-1", "name":"google.com", "tabIds":["tab-2","tab-3","tab-4"], ...}]}

# Test 3: Hernoem island
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/tabs/islands/island-1/rename \
  -H "Content-Type: application/json" \
  -d '{"name": "Headphone Research"}'
# Verwacht: {"ok":true}

# Test 4: Toggle collapse
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/tabs/islands/island-1/collapse
# Verwacht: {"ok":true}

# Test 5: Handmatig island maken
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/tabs/islands/create \
  -H "Content-Type: application/json" \
  -d '{"tabIds": ["tab-3", "tab-4"], "name": "My Island"}'
# Verwacht: {"ok":true, "island": {...}}

# Test 6: Eiland opheffen
curl -H "Authorization: Bearer $TOKEN" \
  -X DELETE http://localhost:8765/tabs/islands/island-1
# Verwacht: {"ok":true}
```

**UI verificatie:**
- [ ] Still no visual verificatie nodig — phase 2 bouwt the UI

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file (fase-1-auto-grouping.md) fully
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
6. git commit -m "🏝️ feat: tab islands auto-grouping backend + API endpoints"
7. git push
8. Rapport:
   ## Gebouwd
   ## Getest (plak curl output)
   ## Problemen
   ## Next session start bij fase-2-visual-ui.md
```

---

## Bekende valkuilen

- [ ] `openTab()` signature wijzigt — controleer that alle existing callers (API routes, context menu, etc.) still werken with the new optionele parameter
- [ ] `did-create-window` event is not always beschikbaar for alle soorten tab-openingen — test with `window.open()` vanuit a webview
- [ ] TypeScript strict mode: `islandId` op `Tab` must optional are (`islandId?: string`) zodat existing tabs not breken
- [ ] Vergeet not the `will-quit` cleanup — islands hoeven not expliciet opgeruimd te be (ze are in-memory), but verifieer that er no memory leaks are
- [ ] `listTabs()` response contains nu `islandId` and `openerTabId` — controleer that this no existing consumers breekt
