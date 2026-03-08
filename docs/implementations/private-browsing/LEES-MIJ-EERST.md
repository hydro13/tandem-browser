# Private Browsing Window — START HERE

> **Date:** 2026-02-28
> **Status:** In progress
> **Goal:** Cmd+Shift+N opens a private-window with in-memory session that automatisch is gewist bij sluiten
> **Order:** Phase 1 (één session, compleet)

---

## Why this feature?

Robin wil soms iets opzoeken without sporen achter te laten — a verrassing for iemand, a gevoelige zoekopdracht, or simpelweg inloggen with a ander account. Tandem has indeed session-isolatie (`POST /sessions/create`), but that is a handmatig proces with persistente data. A private-window with één toetscombinatie that alles automatisch wist bij sluiten is the default verwachting or elke browser. Zie `docs/research/gap-analysis.md` section "Private Browsing" for the Opera comparison.

---

## Architecture in 30 seconds

```
  Cmd+Shift+N
       │
       ▼
  main.ts: createPrivateWindow()
       │
       ├──► new BrowserWindow({ partition: 'private-[uuid]' })
       │    └── NO 'persist:' prefix = in-memory only
       │
       ├──► Shell loads with ?private=true query param
       │    └── Shell shows paarse header + 🔒 indicator
       │
       └──► win.on('closed') → session.clearStorageData()
            └── Alles gewist: cookies, cache, localStorage, indexedDB
```

---

## Project Structure — Relevant Files

> ⚠️ Read ONLY the files in the "Files to read" table.
> Do NOT wander through the rest or the codebase.

### Read for ALL phases

| File | What it contains | Look for function |
|---------|---------------|-------------------|
| `AGENTS.md` | Anti-detect rules, code stijl, commit format | — (read fully) |
| `src/main.ts` | App startup, `BrowserWindow` creatie, keyboard shortcuts | `createWindow()`, `startAPI()` |
| `src/api/server.ts` | TandemAPI class, route registratie | `class TandemAPI`, `setupRoutes()` |

### Additional reading per phase

_(zie fase-1-private-window.md)_

---

## Rules for this feature

> These are the HARD rules in addition to the general AGENTS.md rules.

1. **In-memory partition** — use `session.fromPartition('private-[uuid]')` WITHOUT the `persist:` prefix. This is Electron's standard for ephemeral sessions.
2. **Unique partition per window** — each private window gets its own UUID-based partition. Two private windows share NO cookies.
3. **Cleanup on close** — bij the sluiten or the window: `session.clearStorageData()` aanroepen if extra zekerheid, hoewel the in-memory session already disappears.
4. **Stealth patches actief** — verifieer that Tandem's anti-detect patches (UA, fingerprint, etc.) also in the private-partition actief are.
5. **Functienamen > regelnummers** — verwijs to `function createWindow()` or `function registerBrowserRoutes()`, nooit regelnummers.

---

## Manager Wiring — no new manager nodig

Private Browsing maakt a new `BrowserWindow` about with a andere partition. Er is **no new manager** nodig — the logica zit in `src/main.ts`.

### Toe te voegen:

1. `src/main.ts` → new function `createPrivateWindow()` (gebaseerd op existing `createWindow()`, but with ephemere partition)
2. `src/main.ts` → Cmd+Shift+N accelerator registreren via `globalShortcut` or menu
3. `src/api/routes/browser.ts` → `function registerBrowserRoutes()` → `POST /window/private` endpoint
4. `shell/index.html` → detecteer `?private=true` and activeer paarse styling

---

## API Endpoint Pattern — Copy Exactly

```typescript
// In function registerBrowserRoutes():

router.post('/window/private', async (_req: Request, res: Response) => {
  try {
    // Trigger private window creation via IPC to main process
    const win = createPrivateWindow();
    res.json({ ok: true, windowId: win.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

**Rules:**
- `try/catch` rond ALLES, catch if `(e: any)`
- Success: always `{ ok: true, ...data }`

---

## Documents in This Folder

| File | What | Status |
|---------|-----|--------|
| `LEES-MIJ-EERST.md` | ← this file | — |
| `fase-1-private-window.md` | Volledige implementatie: window, partition, cleanup, shortcut, UI indicator | 📋 Ready to start |

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
| 1 | Private window (in-memory partition + API + UI) | ⏳ not started | — |

> Claude Code: markeer phase if ✅ + voeg commit hash toe na afronden.
