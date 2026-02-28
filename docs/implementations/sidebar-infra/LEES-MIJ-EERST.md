# Sidebar Infrastructuur — START HIER

> **Datum:** 2026-02-28
> **Design doc:** `docs/plans/sidebar-infra-design.md`
> **Volgorde:** Fase 1 → 2 → 3 (elke fase is één Claude Code sessie)
> **Prioriteit:** #0 — fundament voor Workspaces, Messengers, Pinboards, etc.

---

## Waarom dit project?

Tandem heeft geen linker sidebar. Alle geplande features (Workspaces, Messengers, Personal News, Pinboards, Bookmarks, History, Downloads) moeten in een uniforme, configureerbare sidebar leven — niet als losse ad-hoc icon strips. Dit bouwt het fundament.

---

## Architectuur in 30 seconden

```
.main-layout (flex row, shell/index.html)
  ├── .sidebar (NIEUW, links)
  │     ├── .sidebar-icon-strip (48px altijd)
  │     │     ├── [icon knop per item]
  │     │     └── [toggle narrow/wide + customize knop onderaan]
  │     └── .sidebar-panel (240px, uitschuifbaar)
  │           └── [inhoud gerenderd door actief item]
  ├── .browser-content (flex:1, ongewijzigd)
  └── .copilot-panel (rechts, ongewijzigd)

Sidebar states:
  hidden (0px) ←→ narrow (48px) ←→ wide (~180px)
  Shortcut: ⌘⇧B (toggle hidden↔narrow)
```

### Manager wiring — 3 touch points (ALTIJD alle 3!)

| Touch point | Functie | Bestand |
|-------------|---------|---------|
| 1. Interface | `ManagerRegistry` — voeg `sidebarManager` toe | `src/registry.ts` |
| 2. Instantiëren | `startAPI()` — `new SidebarManager()` | `src/main.ts` |
| 3. Cleanup | `app.on('will-quit')` — `sidebarManager.destroy()` | `src/main.ts` |

---

## Relevante bestanden per fase

### Fase 1 (Backend + API)
| Bestand | Wat zoeken | Waarom |
|---------|-----------|--------|
| `src/registry.ts` | `interface ManagerRegistry` | SidebarManager toevoegen |
| `src/main.ts` | `startAPI()`, `app.on('will-quit')` | Manager instantiëren + cleanup |
| `src/api/server.ts` | `import { register...Routes }` blok bovenaan | Import sidebar routes toevoegen |
| `src/api/routes/data.ts` | `function registerDataRoutes()` | Patroon kopiëren voor nieuwe route file |
| `src/bookmarks/manager.ts` | `class BookmarkManager` | Patroon voor JSON storage + load/save |
| `src/utils/paths.ts` | `function tandemDir()`, `function ensureDir()` | Storage helpers |
| `src/utils/errors.ts` | `function handleRouteError()` | Error handling patroon |

### Fase 2 (Shell UI)
| Bestand | Wat zoeken | Waarom |
|---------|-----------|--------|
| `shell/index.html` | `<!-- Main layout -->` comment | Sidebar HTML hier invoegen |
| `shell/css/main.css` | `.main-layout {` | CSS voor sidebar naast browser-content |
| `shell/index.html` | `<!-- Copilot Panel Toggle Button -->` | Patroon voor toggle knop |

### Fase 3 (Eerste plugin: Bookmarks)
| Bestand | Wat zoeken | Waarom |
|---------|-----------|--------|
| `src/api/routes/data.ts` | `function registerDataRoutes()`, `/bookmarks` endpoints | Bestaande bookmark API gebruiken |
| `shell/index.html` | sidebar panel container (gebouwd in fase 2) | Bookmarks panel HTML toevoegen |

---

## Code patronen

### Manager patroon (kopieer van BookmarkManager)
```typescript
import { tandemDir, ensureDir } from '../utils/paths';

export class SidebarManager {
  private storageFile: string;
  private config: SidebarConfig;

  constructor() {
    this.storageFile = path.join(tandemDir(), 'sidebar-config.json');
    this.config = this.load();
  }

  private load(): SidebarConfig { /* JSON.parse of default */ }
  private save(): void { /* JSON.stringify naar storageFile */ }
  destroy(): void { /* cleanup timers etc */ }
}
```

### Route patroon (kopieer van registerDataRoutes)
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

### Registry patroon
In `src/registry.ts` → `interface ManagerRegistry`:
```typescript
sidebarManager: SidebarManager;
```

---

## Anti-detect noot

Sidebar leeft volledig in de SHELL (Electron BrowserWindow) — NIET in een webview.
Geen DOM-manipulatie in webpages. Geen stealth impact.

---

## Hard rules voor Claude Code

1. **Nooit regelnummers** — altijd functienamen zoals `startAPI()`, `registerDataRoutes()`
2. **Lees eerst, schrijf dan** — lees elk bestand voor je het aanpast
3. **npx tsc na elke stap** — zero TypeScript errors voor je doorgaat
4. **Alle 3 manager touch points** — registry + startAPI + will-quit
5. **Patroon volgen** — kopieer bestaande manager/route structuur, geen eigen varianten

---

## 📊 Fase Status — BIJWERKEN NA ELKE FASE

| Fase | Titel | Status | Commit |
|------|-------|--------|--------|
| 1 | SidebarManager + config API | ✅ klaar | 0e34eae |
| 2 | Shell UI (icon strip + panel container + shortcut) | ✅ klaar | a6fb57a |
| 3 | Eerste plugin: Bookmarks panel | ⏳ niet gestart | — |

> Claude Code: markeer fase als ✅ + voeg commit hash toe na afronden.
