# Phase 1 — BrowserViews: SplitScreenManager backend + API

> **Feature:** Split Screen
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** None

---

## Goal or this fase

Bouw the `SplitScreenManager` that the split screen state beheert: welke tabs in welk panel, welke layout (vertical/horizontal), and the divider positie. Registreer API endpoints zodat the split screen via REST aangestuurd can be. After this phase can you via `curl` a split screen openen and sluiten — the shell UI follows in phase 2.

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `src/main.ts` | `startAPI()` | Hier is SplitScreenManager aangemaakt and geregistreerd |
| `src/main.ts` | `app.on('will-quit')` | Cleanup add |
| `src/registry.ts` | `interface ManagerRegistry` | SplitScreenManager add |
| `src/api/server.ts` | `setupRoutes()` | Hier be route-modules geregistreerd |
| `src/api/routes/tabs.ts` | `registerTabRoutes()` | Referentiepatroon for route registratie |
| `src/api/context.ts` | `interface RouteContext` | Context type for route handlers (if this exists, anders skip) |
| `src/tabs/manager.ts` | `class TabManager`, `getTab()`, `listTabs()` | TabManager API that SplitScreenManager nodig has |
| `shell/index.html` | `<div class="browser-content">`, `id="webview-container"` | Begrijp the huidige webview layout |

---

## To Build in this fase

### Step 1: SplitScreenManager class

**Wat:** Core manager that split screen state beheert. Houdt bij or split actief is, welke tabIds in welk panel zitten, layout mode, and divider ratio.

**File:** `src/split-screen/manager.ts`

```typescript
export interface SplitLayout {
  mode: 'vertical' | 'horizontal';
  panes: SplitPane[];
  dividerRatio: number; // 0.0-1.0, default 0.5
}

export interface SplitPane {
  tabId: number;
  index: number; // 0 = links/boven, 1 = rechts/under
}

export class SplitScreenManager {
  private active = false;
  private layout: SplitLayout | null = null;
  private win: BrowserWindow;
  private tabManager: TabManager;

  constructor(win: BrowserWindow, tabManager: TabManager) { ... }

  /** Start split screen with twee tabs */
  async open(opts: { tabId1: number; tabId2: number; layout?: 'vertical' | 'horizontal' }): Promise<SplitLayout> { ... }

  /** Closes split screen */
  async close(): Promise<void> { ... }

  /** Haal huidige status op */
  getStatus(): { active: boolean; layout: SplitLayout | null } { ... }

  /** Wissel layout (vertical ↔ horizontal) */
  async setLayout(mode: 'vertical' | 'horizontal'): Promise<SplitLayout> { ... }

  /** Verplaats divider */
  async resize(ratio: number): Promise<void> { ... }

  /** Focus a specifiek panel */
  async focusPane(paneIndex: number): Promise<void> { ... }

  /** Cleanup */
  destroy(): void { ... }
}
```

**Logica:**
- `open()` valideert that beide tabIds bestaan via `tabManager.getTab()`, slaat the layout op, and stuurt a IPC event to the shell (`split-screen-open`) with the tab info
- `close()` reset the state and stuurt IPC event `split-screen-close`
- `focusPane()` stuurt IPC event `split-screen-focus` with the pane index
- The shell ontvangt this IPC events and past the DOM layout about (phase 2)

### Step 2: API routes

**Wat:** REST endpoints for split screen.

**File:** `src/api/routes/split.ts`

**Function:** `registerSplitRoutes(router, ctx)`

```typescript
import type { Router } from 'express';
import type { RouteContext } from '../context';

export function registerSplitRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // SPLIT SCREEN — Multi-pane browsing
  // ═══════════════════════════════════════════════

  router.post('/split/open', async (req, res) => {
    try {
      const { tabId1, tabId2, layout } = req.body;
      if (tabId1 === undefined || tabId2 === undefined) {
        return res.status(400).json({ error: 'tabId1 and tabId2 required' });
      }
      const result = await ctx.splitScreenManager.open({ tabId1, tabId2, layout });
      res.json({ ok: true, layout: result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/split/close', async (req, res) => {
    try {
      await ctx.splitScreenManager.close();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/split/status', (req, res) => {
    try {
      const status = ctx.splitScreenManager.getStatus();
      res.json({ ok: true, ...status });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/split/layout', async (req, res) => {
    try {
      const { mode } = req.body;
      if (!mode || !['vertical', 'horizontal'].includes(mode)) {
        return res.status(400).json({ error: 'mode must be "vertical" or "horizontal"' });
      }
      const result = await ctx.splitScreenManager.setLayout(mode);
      res.json({ ok: true, layout: result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/split/focus/:paneIndex', async (req, res) => {
    try {
      const paneIndex = parseInt(req.params.paneIndex, 10);
      await ctx.splitScreenManager.focusPane(paneIndex);
      res.json({ ok: true, focusedPane: paneIndex });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/split/resize', async (req, res) => {
    try {
      const { ratio } = req.body;
      if (ratio === undefined || ratio < 0 || ratio > 1) {
        return res.status(400).json({ error: 'ratio must be between 0.0 and 1.0' });
      }
      await ctx.splitScreenManager.resize(ratio);
      res.json({ ok: true, ratio });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
```

### Step 3: Wiring — registreer manager and routes

**Wat:** SplitScreenManager aansluiten op the system.

**File:** `src/registry.ts`
**Add about:** `interface ManagerRegistry`

```typescript
splitScreenManager: SplitScreenManager;
```

**File:** `src/main.ts`
**Add about:** `startAPI()`

```typescript
import { SplitScreenManager } from './split-screen/manager';

// Na tabManager aanmaak:
const splitScreenManager = new SplitScreenManager(win, tabManager!);

// In registry object:
splitScreenManager: splitScreenManager!,
```

**Add about:** `app.on('will-quit')`

```typescript
if (splitScreenManager) splitScreenManager.destroy();
```

**File:** `src/api/server.ts`
**Add about:** `setupRoutes()`

```typescript
import { registerSplitRoutes } from './routes/split';

// In setupRoutes():
registerSplitRoutes(router, ctx);
```

---

## Acceptatiecriteria — this must werken na the session

```bash
# Test 1: Open split screen (vertical)
TOKEN=$(cat ~/.tandem/api-token)
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/split/open \
  -H "Content-Type: application/json" \
  -d '{"tabId1": 1, "tabId2": 2, "layout": "vertical"}'
# Verwacht: {"ok":true, "layout":{"mode":"vertical","panes":[...],"dividerRatio":0.5}}

# Test 2: Haal status op
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/split/status
# Verwacht: {"ok":true, "active":true, "layout":{...}}

# Test 3: Wissel layout
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/split/layout \
  -H "Content-Type: application/json" \
  -d '{"mode": "horizontal"}'
# Verwacht: {"ok":true, "layout":{"mode":"horizontal",...}}

# Test 4: Focus pane
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/split/focus/1
# Verwacht: {"ok":true, "focusedPane":1}

# Test 5: Resize divider
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/split/resize \
  -H "Content-Type: application/json" \
  -d '{"ratio": 0.7}'
# Verwacht: {"ok":true, "ratio":0.7}

# Test 6: Closes split screen
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/split/close
# Verwacht: {"ok":true}

# Test 7: Status na sluiten
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/split/status
# Verwacht: {"ok":true, "active":false, "layout":null}
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
2. Read DIT file (fase-1-browserviews.md) fully
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
6. git commit -m "🖥️ feat: split screen manager + API endpoints"
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
- [ ] TypeScript strict mode — no `any` buiten catch blocks
- [ ] Valideer tabIds via `tabManager.getTab()` — gooi error if tab not exists
- [ ] IPC events sturen with `win.webContents.send()` — the shell luistert hier pas to in phase 2, but the events must already indeed verstuurd be
