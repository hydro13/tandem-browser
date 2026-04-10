# SPLIT SCREEN — START HERE

> **Date:** 2026-02-28
> **Status:** In progress
> **Goal:** Twee websites next to elkaar bekijken in één Tandem window with draggable divider
> **Order:** Phase 1 → 2 (elke phase is één session)

---

## Why this feature?

Power users willen twee page's next to elkaar zien — docs + app, vergelijken, video + notes. Opera has this if Split Screen with drag-down gesture. Tandem has currently only single-webview, dus elke multi-pane workflow requires nu twee vensters. Dit is the #4 prioriteit in the gap analyse (docs/research/gap-analysis.md).

---

## Architecture in 30 seconds

```
POST /split/open {tabId1, tabId2, layout:'vertical'}
       ↓
  SplitScreenManager
       ↓
  Shell: voegt second <webview> toe next to existing
       ↓
  Divider element between the twee webviews
       ↓
  Active pane focus → toolbar stuurt the juiste webContents about
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

### Additional reading per phase

_(see the relevant phase file)_

---

## Rules for this feature

> These are the HARD rules in addition to the general AGENTS.md rules.

1. **Twee webviews in shell HTML** — the split screen uses a second `<webview>` tag in the shell, no Electron BrowserView API. Dit past bij the existing pattern.
2. **Active pane state** — the shell houdt a `activePaneIndex` bij (0 or 1). The toolbar (URL bar, back/forward) stuurt always the actieve pane about.
3. **Functienamen > regelnummers** — verwijs always to `function setupSplitRoutes()`, nooit to "regel 287"
4. **No new npm packages** — alles with existing Electron + Express tooling

---

## Manager Wiring — How to Register a New Component

Each new manager must be wired into **3 places**:

### 1. `src/registry.ts` — `ManagerRegistry` interface

```typescript
export interface ManagerRegistry {
  // ... existing managers ...
  splitScreenManager: SplitScreenManager;  // ← add
}
```

### 2. `src/main.ts` — `startAPI()` function

```typescript
// Na aanmaken or aanverwante managers:
const splitScreenManager = new SplitScreenManager(win, tabManager!);

// In registry object:
splitScreenManager: splitScreenManager!,
```

### 3. `src/main.ts` — `app.on('will-quit')` handler

```typescript
if (splitScreenManager) splitScreenManager.destroy();
```

---

## API Endpoint Pattern — Copy Exactly

```typescript
// ═══════════════════════════════════════════════
// SPLIT SCREEN — Multi-pane browsing
// ═══════════════════════════════════════════════

router.post('/split/open', async (req: Request, res: Response) => {
  try {
    const result = await ctx.splitScreenManager.open(req.body);
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
| `fase-1-browserviews.md` | Electron backend: SplitScreenManager + API routes | 📋 Ready to start |
| `fase-2-shell-ui.md` | Shell UI: divider drag, context menu, keyboard shortcuts | ⏳ Waiting for phase 1 |

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
| 1 | Electron BrowserView splitting + API | ⏳ not started | — |
| 2 | Shell UI (drag-to-split + resize divider) | ⏳ not started | — |

> Claude Code: markeer phase if ✅ + voeg commit hash toe na afronden.
