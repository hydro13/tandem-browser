# TAB SNOOZING — START HERE

> **Date:** 2026-02-28
> **Status:** In progress
> **Goal:** Suspendeer inactieve tabs to geheugen vrij te maken — handmatig (rechtermuisklik) and automatisch (na X minuten inactiviteit)
> **Order:** Phase 1 → 2 (elke phase is één session)

---

## Why this feature?

Elke open tab verbruikt 50-300MB geheugen. With 20+ tabs is Tandem traag. Opera snoozet inactieve tabs automatisch. Tab Snoozing navigeert inactieve tabs to `about:blank` (geheugen vrij) and herlaadt the oorspronkelijke URL bij click. Dit is the #9 prioriteit in the gap analyse (docs/research/gap-analysis.md).

---

## Architecture in 30 seconds

```
Rechtermuisklik tab → "Snooze for 1h"
       ↓
  POST /tabs/:id/snooze {duration: '1h'}
       ↓
  SnoozeManager.snooze(tabId)
       ↓
  1. Store URL + title + favicon in snoozedTabs Folder
  2. Navigeer webview to about:blank (freed geheugen)
  3. Set timer for auto-wake (if duration opgegeven)
  4. IPC → shell: toon 💤 icon op tab
       ↓
  Klik op snoozed tab
       ↓
  SnoozeManager.wake(tabId)
       ↓
  1. Navigeer webview terug to opgeslagen URL
  2. Delete out snoozedTabs
  3. IPC → shell: delete 💤 icon
```

---

## Project Structure — Relevant Files

> ⚠️ Read ONLY the files in the "Files to read" table.
> Do NOT wander through the rest or the codebase.

### Read for ALL phases

| File | What it contains | Look for function |
|---------|---------------|-------------------|
| `AGENTS.md` | Anti-detect rules, code stijl, commit format | — (read fully) |
| `src/main.ts` | App startup, manager registratie | `startAPI()`, `createWindow()` |
| `src/api/server.ts` | TandemAPI class, route registratie | `class TandemAPI`, `setupRoutes()` |
| `src/registry.ts` | ManagerRegistry interface | `interface ManagerRegistry` |
| `src/tabs/manager.ts` | TabManager — tab lifecycle, getTab(), webContents access | `class TabManager` |

### Additional reading per phase

_(see the relevant phase file)_

---

## Rules for this feature

> These are the HARD rules in addition to the general AGENTS.md rules.

1. **about:blank for snooze** — navigeer webview to `about:blank` to geheugen vrij te maken. No `webContents.destroy()` (not beschikbaar for webview tags in Electron).
2. **Sla always URL + title + favicon op** — vóór snooze, sla alle info op that nodig is to the tab visual correct te tonen and te herstellen.
3. **Pinned tabs nooit auto-snoozen** — only handmatige snooze for pinned tabs.
4. **Functienamen > regelnummers** — verwijs always to `function registerSnoozeRoutes()`, nooit to "regel 99"

---

## Manager Wiring — How to Register a New Component

Each new manager must be wired into **3 places**:

### 1. `src/registry.ts` — `ManagerRegistry` interface

```typescript
export interface ManagerRegistry {
  // ... existing managers ...
  snoozeManager: SnoozeManager;  // ← add
}
```

### 2. `src/main.ts` — `startAPI()` function

```typescript
// Na tabManager aanmaak:
const snoozeManager = new SnoozeManager(win, tabManager!);

// In registry object:
snoozeManager: snoozeManager!,
```

### 3. `src/main.ts` — `app.on('will-quit')` handler

```typescript
if (snoozeManager) snoozeManager.destroy();
```

---

## API Endpoint Pattern — Copy Exactly

```typescript
// ═══════════════════════════════════════════════
// TAB SNOOZING — Memory management via tab suspension
// ═══════════════════════════════════════════════

router.post('/tabs/:id/snooze', async (req: Request, res: Response) => {
  try {
    const tabId = parseInt(req.params.id, 10);
    const result = await ctx.snoozeManager.snooze(tabId, req.body);
    res.json({ ok: true, ...result });
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
| `fase-1-snooze-backend.md` | SnoozeManager + discard + auto-snooze timer + API | 📋 Ready to start |
| `fase-2-ui.md` | 💤 icon, rechtermuisklik menu, snooze indicator | ⏳ Waiting for phase 1 |

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
| 1 | SnoozeManager + REST API | ⏳ not started | — |
| 2 | Shell UI (💤 badge + right-click menu) | ⏳ not started | — |

> Claude Code: markeer phase if ✅ + voeg commit hash toe na afronden.
