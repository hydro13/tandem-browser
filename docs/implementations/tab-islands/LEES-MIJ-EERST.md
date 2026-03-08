# Tab Islands — START HERE

> **Date:** 2026-02-28
> **Status:** In progress
> **Goal:** Automatische visual groepering or gerelateerde tabs in islands, with collapse/expand and naamgeving
> **Order:** Phase 1 → 2 (elke phase is één session)

---

## Why this feature?

Robin opens regelmatig multiple tabs vanuit the same page (zoekresultaten, Reddit threads, documentatie). That tabs stand nu los in the tab bar without visual verband. Tab Islands group this tabs automatisch in herkenbare islands with color, name, and collapse-function. Zie `docs/research/gap-analysis.md` section "Tab Islands" for the full Opera comparison.

---

## Architecture in 30 seconds

```
  webContents 'did-create-window'
         │
         ▼
  TabManager.trackOpener(childId, parentId)
         │
         ▼
  autoGroupTabs() → island aanmaken/uitbreiden
         │
         ├──► REST API: GET /tabs/islands, POST .../collapse, etc.
         │
         └──► IPC: 'island-updated' → Shell UI
                                         │
                                         ▼
                                  Tab bar: .tab-island gap + label + collapse
```

---

## Project Structure — Relevant Files

> ⚠️ Read ONLY the files in the "Files to read" table.
> Do NOT wander through the rest or the codebase.

### Read for ALL phases

| File | What it contains | Look for function |
|---------|---------------|-------------------|
| `AGENTS.md` | Anti-detect rules, code stijl, commit format | — (read fully) |
| `src/main.ts` | App startup, manager registratie, window events | `createWindow()`, `startAPI()` |
| `src/api/server.ts` | TandemAPI class, route registratie | `class TandemAPI`, `setupRoutes()` |

### Additional reading per phase

_(see the relevant phase file)_

---

## Rules for this feature

> These are the HARD rules in addition to the general AGENTS.md rules.

1. **Opener tracking via Electron events** — usage `webContents` `'did-create-window'` event in the main process. NOOIT iets injecteren in the webview to parent-child relaties te detecteren.
2. **Eilanden are a uitbreiding or existing groups** — bouw voort op the existing `TabGroup` interface and `setGroup()` in `class TabManager`. Breek existing `POST /tabs/group` not.
3. **Functienamen > regelnummers** — verwijs always to `function registerTabRoutes()`, nooit to "regel 51".
4. **No new npm packages** — this is purely TypeScript + HTML/CSS.

---

## Manager Wiring — no new manager nodig

Tab Islands breiden the existing `TabManager` out — er is **no new manager** nodig. The island-logica is added if methodes op `class TabManager` in `src/tabs/manager.ts`.

### Existing wiring hergebruiken:

1. `src/api/server.ts` → `TandemAPIOptions` contains already `registry: ManagerRegistry` with `tabManager`
2. `src/api/routes/tabs.ts` → `function registerTabRoutes()` gets new island-endpoints
3. `src/main.ts` → `createWindow()` gets the `did-create-window` listener

---

## API Endpoint Pattern — Copy Exactly

```typescript
// In function registerTabRoutes():

router.get('/tabs/islands', async (_req: Request, res: Response) => {
  try {
    const islands = ctx.tabManager.getIslands();
    res.json({ ok: true, islands });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

**Rules:**
- `try/catch` rond ALLES, catch if `(e: any)`
- 400 for ontbrekende verplichte velden
- 404 for not-gevonden resources
- Success: always `{ ok: true, ...data }`

---

## Documents in This Folder

| File | What | Status |
|---------|-----|--------|
| `LEES-MIJ-EERST.md` | ← this file | — |
| `fase-1-auto-grouping.md` | Backend: opener tracking, island data model, API endpoints | 📋 Ready to start |
| `fase-2-visual-ui.md` | Shell UI: visual islands with gap, label, color, collapse | ⏳ Waiting for phase 1 |

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
| 1 | Auto-grouping backend (opener tracking) | ⏳ not started | — |
| 2 | Shell UI (visual gap + name + collapse) | ⏳ not started | — |

> Claude Code: markeer phase if ✅ + voeg commit hash toe na afronden.
