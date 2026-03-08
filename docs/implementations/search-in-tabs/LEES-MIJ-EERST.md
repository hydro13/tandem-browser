# Search in Tabs — START HERE

> **Date:** 2026-02-28
> **Status:** In progress
> **Goal:** Ctrl+Space zoek-overlay to snel open tabs te vinden op title/URL, inclusief recent closed tabs
> **Order:** Phase 1 (één session, compleet)

---

## Why this feature?

Bij 20+ tabs is visual scannen or the tab bar te traag. Robin weet vaak wél a keyword out the title or URL, but can the tab not vinden. A zoek-overlay with real-time filtering is the snelste manier to to elke tab te springen. Zie `docs/research/gap-analysis.md` section "Search in Tabs" and `docs/research/opera-complete-inventory.md` section 1.6 for the Opera referentie.

---

## Architecture in 30 seconds

```
  Ctrl+Space → toggle #tab-search-overlay
         │
         ▼
  fetch() GET /tabs/list → alle open tabs
  fetch() GET /tabs/closed → recent closed
         │
         ▼
  Client-side filter op input.value
  ├── match title (case-insensitive)
  └── match URL (case-insensitive)
         │
         ▼
  Klik or Enter → POST /tabs/focus (open tab)
                → POST /tabs/open  (closed tab heropenen)
```

---

## Project Structure — Relevant Files

> ⚠️ Read ONLY the files in the "Files to read" table.
> Do NOT wander through the rest or the codebase.

### Read for ALL phases

| File | What it contains | Look for function |
|---------|---------------|-------------------|
| `AGENTS.md` | Anti-detect rules, code stijl, commit format | — (read fully) |
| `src/main.ts` | App startup, keyboard shortcut registratie | `createWindow()` |
| `src/api/server.ts` | TandemAPI class | `class TandemAPI`, `setupRoutes()` |

### Additional reading per phase

_(zie fase-1-search-overlay.md)_

---

## Rules for this feature

> These are the HARD rules in addition to the general AGENTS.md rules.

1. **Puur shell UI** — this is bijna fully a shell/index.html feature. The enige backend-aanpassing is één new endpoint (`GET /tabs/closed`).
2. **No npm packages** — the zoekfilter is simpele string matching in JavaScript. No fuzzy search library nodig.
3. **Keyboard-first** — the overlay must fully bedienbaar are with toetsenbord: Ctrl+Space open/closes, pijltjes navigeren, Enter selecteert, Escape closes.
4. **Functienamen > regelnummers** — verwijs to `function registerTabRoutes()`, nooit regelnummers.

---

## Manager Wiring — minimum

Er is **no new manager** nodig. Eén klein new endpoint add:

1. `src/tabs/manager.ts` → `class TabManager` → publiek maken or `closedTabs` via new methode `getClosedTabs()`
2. `src/api/routes/tabs.ts` → `function registerTabRoutes()` → `GET /tabs/closed`
3. `shell/index.html` → full overlay UI + JS

---

## API Endpoint Pattern — Copy Exactly

```typescript
// In function registerTabRoutes():

router.get('/tabs/closed', async (_req: Request, res: Response) => {
  try {
    const closed = ctx.tabManager.getClosedTabs();
    res.json({ ok: true, closed });
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
| `fase-1-search-overlay.md` | Volledige implementatie: overlay UI + keyboard + zoeklogica + recent closed | 📋 Ready to start |

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
| 1 | Ctrl+Space search overlay (shell UI) | ⏳ not started | — |

> Claude Code: markeer phase if ✅ + voeg commit hash toe na afronden.
