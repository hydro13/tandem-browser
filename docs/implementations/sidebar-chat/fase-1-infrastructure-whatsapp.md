# Phase 1 — Infrastructure: Sidebar Framework + WhatsApp Panel

> **Feature:** Sidebar Chat Clients
> **Sessions:** 1-2 sessions
> **Priority:** HIGH
> **Depends on:** None

---

## Goal or this fase

Bouw the complete sidebar framework: icon strip, panel container, SidebarManager, API endpoints, and the first werkende panel (WhatsApp). After this phase can Robin WhatsApp openen in a sidebar panel next to are browser content, with persistent session and notification badges.

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `LEES-MIJ-EERST.md` (this folder) | — (read fully) | Context, rules, wiring instructies |
| `src/main.ts` | `startAPI()`, `createWindow()`, `app.on('will-quit')`, `app.on('web-contents-created')` | Manager registratie, stealth skip logic |
| `src/api/server.ts` | `class TandemAPI`, `setupRoutes()` | Route registratie pattern |
| `src/registry.ts` | `interface ManagerRegistry` | Manager registry — hier must SidebarManager bij |
| `src/api/context.ts` | `type RouteContext` | Automatisch afgeleid or ManagerRegistry |
| `shell/index.html` | `<div class="main-layout">`, `<div class="wingman-panel">` | Waar sidebar HTML must komen |
| `shell/css/main.css` | `.main-layout`, `.browser-content`, `.wingman-panel` | Layout grid that aangepast must be |
| `src/api/routes/browser.ts` | `registerBrowserRoutes()` | Voorbeeld or hoe a route-file eruitziet |
| `src/panel/manager.ts` | `class PanelManager` | Referentie for panel-achtig management pattern |

---

## To Build in this fase

### Step 1: SidebarManager class

**Wat:** Core manager that sidebar panels beheert — state, configuration, notification tracking.

**File:** `src/sidebar/manager.ts`

```typescript
import { BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { tandemDir } from '../utils/paths';
import { createLogger } from '../utils/logger';

const log = createLogger('SidebarManager');

export interface SidebarService {
  id: string;
  name: string;
  url: string;
  partition: string;
  icon: string;         // emoji or SVG pad
  enabled: boolean;
  muted: boolean;
  width: number;
  unreadCount: number;
}

export interface SidebarConfig {
  panels: Record<string, {
    enabled: boolean;
    muted: boolean;
    width: number;
    customUrl?: string;  // for Slack workspace URL
  }>;
  lastActivePanel: string | null;
  sidebarVisible: boolean;
}

// Default services definitie
const DEFAULT_SERVICES: Omit<SidebarService, 'enabled' | 'muted' | 'width' | 'unreadCount'>[] = [
  { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com', partition: 'persist:whatsapp', icon: '💬' },
  { id: 'discord', name: 'Discord', url: 'https://discord.com/app', partition: 'persist:discord', icon: '🎮' },
  { id: 'slack', name: 'Slack', url: 'https://app.slack.com', partition: 'persist:slack', icon: '💼' },
  { id: 'telegram', name: 'Telegram', url: 'https://web.telegram.org/a/', partition: 'persist:telegram', icon: '✈️' },
  { id: 'instagram', name: 'Instagram', url: 'https://www.instagram.com', partition: 'persist:instagram', icon: '📷' },
  { id: 'x', name: 'X', url: 'https://x.com', partition: 'persist:x', icon: '𝕏' },
];

export class SidebarManager extends EventEmitter {
  private win: BrowserWindow;
  private config: SidebarConfig;
  private configPath: string;
  private activePanel: string | null = null;
  private sidebarWebContentsIds: Set<number> = new Set();

  constructor(win: BrowserWindow) { /* ... */ }

  // Panel lifecycle
  getServices(): SidebarService[] { /* ... */ }
  getActivePanel(): string | null { /* ... */ }
  togglePanel(serviceId: string): { visible: boolean; service: SidebarService } { /* ... */ }
  openPanel(serviceId: string): SidebarService { /* ... */ }
  closePanel(): void { /* ... */ }

  // Notifications
  updateUnreadCount(serviceId: string, count: number): void { /* ... */ }
  mutePanel(serviceId: string, muted: boolean): void { /* ... */ }

  // Sidebar webContents tracking (for stealth skip)
  registerWebContentsId(id: number): void { /* ... */ }
  isSidebarWebContents(id: number): boolean { /* ... */ }

  // Config persistence
  private loadConfig(): SidebarConfig { /* ... */ }
  private saveConfig(): void { /* ... */ }

  // Cleanup
  destroy(): void { /* ... */ }
}
```

**Key methods:**
- `getServices()` — retourneert alle 6 services with hun huidige status
- `togglePanel(serviceId)` — toggle panel open/dicht, emit `'panel-toggled'` event
- `openPanel(serviceId)` — open specifiek panel, closes ander actief panel
- `closePanel()` — closes actief panel
- `updateUnreadCount(serviceId, count)` — update badge count, emit `'badge-updated'` event
- `isSidebarWebContents(id)` — check or a webContents ID bij a sidebar panel belongs (for stealth skip)

### Step 2: API Route file

**Wat:** REST endpoints for sidebar panel management.

**File:** `src/api/routes/sidebar.ts`

**Patroon kopiëren or:** `registerBrowserRoutes()` in `src/api/routes/browser.ts`

```typescript
import type { Router, Request, Response } from 'express';
import type { RouteContext } from '../context';

export function registerSidebarRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // SIDEBAR — Messenger panel management
  // ═══════════════════════════════════════════════

  // GET /sidebar/list — list or beschikbare services
  router.get('/sidebar/list', async (req: Request, res: Response) => {
    try {
      const services = ctx.sidebarManager.getServices();
      res.json({ ok: true, services });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /sidebar/panels — alias for /sidebar/list (backward compat)
  router.get('/sidebar/panels', async (req: Request, res: Response) => {
    try {
      const services = ctx.sidebarManager.getServices();
      res.json({ ok: true, panels: services });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /sidebar/open — open a specifiek panel
  router.post('/sidebar/open', async (req: Request, res: Response) => {
    try {
      const { service } = req.body;
      if (!service) return res.status(400).json({ error: 'Missing required field: service' });
      const result = ctx.sidebarManager.openPanel(service);
      res.json({ ok: true, panel: result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /sidebar/close — closes the actieve panel
  router.post('/sidebar/close', async (req: Request, res: Response) => {
    try {
      ctx.sidebarManager.closePanel();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /sidebar/toggle — toggle panel open/dicht
  router.post('/sidebar/toggle', async (req: Request, res: Response) => {
    try {
      const { service } = req.body;
      if (!service) return res.status(400).json({ error: 'Missing required field: service' });
      const result = ctx.sidebarManager.togglePanel(service);
      res.json({ ok: true, ...result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /sidebar/mute — mute/unmute notifications
  router.post('/sidebar/mute', async (req: Request, res: Response) => {
    try {
      const { service, muted } = req.body;
      if (!service) return res.status(400).json({ error: 'Missing required field: service' });
      ctx.sidebarManager.mutePanel(service, muted !== false);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /sidebar/status — sidebar status overzicht
  router.get('/sidebar/status', async (req: Request, res: Response) => {
    try {
      const activePanel = ctx.sidebarManager.getActivePanel();
      const services = ctx.sidebarManager.getServices();
      const totalUnread = services.reduce((sum, s) => sum + s.unreadCount, 0);
      res.json({ ok: true, activePanel, totalUnread, services });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
```

### Step 3: Registry + Server wiring

**Wat:** SidebarManager registreren in the ManagerRegistry and route registration.

**File:** `src/registry.ts`

**Add about:** `interface ManagerRegistry`

```typescript
import type { SidebarManager } from './sidebar/manager';

// In the interface:
sidebarManager: SidebarManager;
```

**File:** `src/api/server.ts`

**Add about:** imports + `setupRoutes()`

```typescript
import { registerSidebarRoutes } from './routes/sidebar';

// In setupRoutes():
registerSidebarRoutes(router, ctx);
```

**File:** `src/main.ts`

**Add about:** `startAPI()` function + registry object + will-quit handler

```typescript
import { SidebarManager } from './sidebar/manager';

// Variabele at the top:
let sidebarManager: SidebarManager | null = null;

// In startAPI():
sidebarManager = new SidebarManager(win);

// In registry object:
sidebarManager: sidebarManager!,

// In will-quit:
if (sidebarManager) sidebarManager.destroy();
```

### Step 4: Stealth skip for sidebar webviews

**Wat:** Voorkom that stealth scripts geïnjecteerd be in sidebar messenger panels.

**File:** `src/main.ts`

**Add about:** `app.on('web-contents-created')` handler, in the `dom-ready` callback

The `SidebarManager` houdt a `Set<number>` bij or sidebar webContents IDs. Bij stealth injection checken:

```typescript
contents.on('dom-ready', () => {
  const url = contents.getURL();
  // Existing Google auth skip...
  if (url.includes('accounts.google.com') || url.includes('consent.google.com')) {
    return;
  }
  // Skip stealth for sidebar messenger panels
  if (sidebarManager && sidebarManager.isSidebarWebContents(contents.id)) {
    log.info('📱 Skipping stealth for sidebar panel:', url.substring(0, 60));
    return;
  }
  contents.executeJavaScript(stealthScript).catch(/* ... */);
});
```

### Stap 5: Shell HTML — Sidebar icon strip + panel container

**Wat:** HTML structuur for the sidebar, ingevoegd in `shell/index.html`.

**File:** `shell/index.html`

**Zoek to:** `<div class="main-layout">`

**Voeg toe BINNEN the main-layout div, if first child (vóór `<div class="browser-content">`):**

```html
<!-- === SIDEBAR CHAT === -->
<div class="sidebar-chat" id="sidebar-chat">
  <!-- Icon strip -->
  <div class="sidebar-icons" id="sidebar-icons">
    <button class="sidebar-icon" data-service="whatsapp" title="WhatsApp">
      <span class="sidebar-icon-emoji">💬</span>
      <span class="sidebar-badge" id="badge-whatsapp" style="display:none;">0</span>
    </button>
    <button class="sidebar-icon" data-service="discord" title="Discord">
      <span class="sidebar-icon-emoji">🎮</span>
      <span class="sidebar-badge" id="badge-discord" style="display:none;">0</span>
    </button>
    <button class="sidebar-icon" data-service="slack" title="Slack">
      <span class="sidebar-icon-emoji">💼</span>
      <span class="sidebar-badge" id="badge-slack" style="display:none;">0</span>
    </button>
    <button class="sidebar-icon" data-service="telegram" title="Telegram">
      <span class="sidebar-icon-emoji">✈️</span>
      <span class="sidebar-badge" id="badge-telegram" style="display:none;">0</span>
    </button>
    <button class="sidebar-icon" data-service="instagram" title="Instagram">
      <span class="sidebar-icon-emoji">📷</span>
      <span class="sidebar-badge" id="badge-instagram" style="display:none;">0</span>
    </button>
    <button class="sidebar-icon" data-service="x" title="X / Twitter">
      <span class="sidebar-icon-emoji">𝕏</span>
      <span class="sidebar-badge" id="badge-x" style="display:none;">0</span>
    </button>
  </div>

  <!-- Panel container (webviews be hier dynamisch aangemaakt) -->
  <div class="sidebar-panel-container" id="sidebar-panel-container" style="display:none;">
    <div class="sidebar-panel-header" id="sidebar-panel-header">
      <span class="sidebar-panel-title" id="sidebar-panel-title">WhatsApp</span>
      <button class="sidebar-panel-close" id="sidebar-panel-close" title="Sluiten">✕</button>
    </div>
    <div class="sidebar-panel-content" id="sidebar-panel-content">
      <!-- <webview> tags be hier dynamisch ingevoegd -->
    </div>
  </div>
</div>
<!-- === END SIDEBAR CHAT === -->
```

### Stap 6: Shell CSS — Sidebar styling

**Wat:** CSS for the sidebar icon strip and panel container.

**File:** `shell/css/sidebar.css` (new file)

**Add about `shell/index.html`:** `<link rel="stylesheet" href="css/sidebar.css">` (bij the andere CSS imports)

Key styling:
- `.sidebar-chat` — flex container, hoogte 100%
- `.sidebar-icons` — verticale strip, 48px breed, centered icons
- `.sidebar-icon` — 40x40px knoppen with hover effect
- `.sidebar-badge` — rode cirkel with getal, absolute positioned
- `.sidebar-panel-container` — 420px breed, flex column
- `.sidebar-panel-content` — flex: 1, contains the webview
- `.main-layout` grid aanpassen: voeg sidebar-chat kolom toe

**Belangrijk:** `.main-layout` in `shell/css/main.css` must be aangepast or:
```css
.main-layout { display: flex; /* or grid */ }
```
to a layout that the sidebar icon strip + panel meeneemt if linker kolommen.

### Stap 7: Shell JS — Sidebar interactie

**Wat:** JavaScript for sidebar click handlers, webview management, IPC communicatie, badge updates.

**File:** `shell/js/main.js` (bestaand file uitbreiden)

**Or new file:** `shell/js/sidebar.js` (add if `<script>` in index.html)

Key functionaliteit:
- Click handlers op `.sidebar-icon` knoppen
- Dynamisch aanmaken or `<webview>` tags with juiste partition and URL
- `page-title-updated` event listener op elke sidebar webview for badge detection
- Default Chrome User-Agent instellen via `webview.setUserAgent()`
- IPC communicatie with main process for SidebarManager state sync
- Panel resize handle (optional in phase 1, can later)

```javascript
// Sidebar icon click handler
document.querySelectorAll('.sidebar-icon').forEach(btn => {
  btn.addEventListener('click', () => {
    const serviceId = btn.dataset.service;
    toggleSidebarPanel(serviceId);
  });
});

function toggleSidebarPanel(serviceId) {
  // Check or webview already exists
  let webview = document.getElementById(`sidebar-wv-${serviceId}`);
  const container = document.getElementById('sidebar-panel-container');
  const content = document.getElementById('sidebar-panel-content');

  if (!webview) {
    // Maak new webview about
    webview = document.createElement('webview');
    webview.id = `sidebar-wv-${serviceId}`;
    webview.setAttribute('partition', `persist:${serviceId}`);
    webview.setAttribute('src', SIDEBAR_SERVICES[serviceId].url);
    webview.setAttribute('useragent', CHROME_UA);
    webview.style.cssText = 'width:100%;height:100%;';
    content.appendChild(webview);

    // Badge detection via page title
    webview.addEventListener('page-title-updated', (e) => {
      const match = e.title.match(/\((\d+)\)/);
      updateBadge(serviceId, match ? parseInt(match[1], 10) : 0);
    });
  }

  // Toggle visibility
  // ...verberg alle andere webviews, toon this
}
```

---

## Acceptatiecriteria — this must werken na the session

```bash
# Test 1: List or sidebar services
TOKEN=$(cat ~/.tandem/api-token)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/sidebar/list
# Verwacht: {"ok":true,"services":[{"id":"whatsapp","name":"WhatsApp",...},{"id":"discord",...},...]}

# Test 2: Open WhatsApp panel
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/sidebar/open \
  -H "Content-Type: application/json" \
  -d '{"service": "whatsapp"}'
# Verwacht: {"ok":true,"panel":{"id":"whatsapp","name":"WhatsApp","url":"https://web.whatsapp.com",...}}

# Test 3: Closes panel
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/sidebar/close
# Verwacht: {"ok":true}

# Test 4: Toggle panel
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/sidebar/toggle \
  -H "Content-Type: application/json" \
  -d '{"service": "whatsapp"}'
# Verwacht: {"ok":true,"visible":true,"service":{...}}

# Test 5: Status overzicht
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/sidebar/status
# Verwacht: {"ok":true,"activePanel":"whatsapp","totalUnread":0,"services":[...]}

# Test 6: Mute notifications
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/sidebar/mute \
  -H "Content-Type: application/json" \
  -d '{"service": "whatsapp", "muted": true}'
# Verwacht: {"ok":true}
```

**UI verificatie:**
- [ ] Sidebar icon strip visible about the linkerkant or the browser window (6 emoji icons vertical)
- [ ] Klikken op WhatsApp icon opens a panel (~420px) next to the browser content
- [ ] WhatsApp Web loads in the panel (QR-code login scherm visible)
- [ ] Nogmaals clicking op WhatsApp icon closes the panel
- [ ] Na QR-code login: session blijft bewaard na browser herstart
- [ ] Notification badge appears op icon wanneer unread berichten binnenkomen

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file (fase-1-infrastructure-whatsapp.md) fully
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
6. git commit -m "🗨️ feat: sidebar chat infrastructure + WhatsApp panel"
7. git push
8. Rapport:
   ## Gebouwd
   ## Getest (plak curl output)
   ## Problemen
   ## Next session start bij fase-2-discord-slack.md
```

---

## Bekende valkuilen

- [ ] Vergeet not `sidebarManager.destroy()` in the will-quit handler
- [ ] Vergeet not the `registerSidebarRoutes()` call in `setupRoutes()`
- [ ] WhatsApp Web weigert non-Chrome UA — stel UA in via `webview.setUserAgent()`
- [ ] TypeScript strict mode — no `any` buiten catch
- [ ] Test in `persist:tandem` session (not in guest) — the sidebar panels use own partitions but the hoofd-app must op `persist:tandem` draaien
- [ ] `createWindow()` stealth skip — zorg that sidebar webContents IDs geregistreerd be VOORDAT stealth injection plaatsvindt (timing!)
- [ ] `.main-layout` CSS grid/flex aanpassen zodat sidebar er LINKS or the browser content bij comes (not the existing layout breken!)
