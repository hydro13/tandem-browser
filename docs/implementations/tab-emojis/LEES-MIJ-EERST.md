# Tab Emojis — START HERE

> **Date:** 2026-02-28
> **Status:** In progress
> **Goal:** Emoji-badges toewijzen about tabs for visual identificatie, persistent across sessions
> **Order:** Phase 1 (één session, compleet)

---

## Why this feature?

Robin has vaak multiple tabs open or the same site (GitHub repos, Google Docs). Favicon + title are not genoeg to snel the juiste tab te herkennen. Emoji-badges geven tabs a persoonlijke visual identiteit. Zie `docs/research/gap-analysis.md` section "Tab Emojis" and `docs/research/opera-complete-inventory.md` section 1.4 for the Opera referentie.

---

## Architecture in 30 seconds

```
  Tab hover → "+" knop → emoji picker popup
         │
         ▼
  fetch() POST /tabs/:id/emoji { emoji: "🔥" }
         │
         ▼
  TabManager.setEmoji(tabId, emoji)
         │
         ├──► Tab.emoji field update
         ├──► IPC: 'tab-emoji-changed' → Shell badge updaten
         └──► Save in ~/.tandem/tab-emojis.json (per URL)
```

---

## Project Structure — Relevant Files

> ⚠️ Read ONLY the files in the "Files to read" table.
> Do NOT wander through the rest or the codebase.

### Read for ALL phases

| File | What it contains | Look for function |
|---------|---------------|-------------------|
| `AGENTS.md` | Anti-detect rules, code stijl, commit format | — (read fully) |
| `src/main.ts` | App startup, manager registratie | `createWindow()`, `startAPI()` |
| `src/api/server.ts` | TandemAPI class, route registratie | `class TandemAPI`, `setupRoutes()` |

### Additional reading per phase

_(zie fase-1-emoji-tabs.md)_

---

## Rules for this feature

> These are the HARD rules in addition to the general AGENTS.md rules.

1. **Emoji picker in the shell** — a simple HTML/CSS popup grid. NO npm package for the emoji picker. Use native emoji rendering.
2. **Persistentie in JSON** — save in `~/.tandem/tab-emojis.json`. Key = genormaliseerde URL (hostname + pathname). Laden bij TabManager init.
3. **Functienamen > regelnummers** — verwijs to `function registerTabRoutes()`, nooit regelnummers.
4. **Existing Tab interface uitbreiden** — voeg `emoji?: string` toe about the `Tab` interface in `src/tabs/manager.ts`.

---

## Manager Wiring — no new manager nodig

Tab Emojis breiden the existing `TabManager` out — er is **no new manager** nodig.

### Existing wiring hergebruiken:

1. `src/tabs/manager.ts` → `class TabManager` → new methodes `setEmoji()`, `clearEmoji()`, `loadEmojis()`, `saveEmojis()`
2. `src/api/routes/tabs.ts` → `function registerTabRoutes()` → new endpoints
3. `shell/index.html` → emoji badge + picker UI in tab element

---

## API Endpoint Pattern — Copy Exactly

```typescript
// In function registerTabRoutes():

router.post('/tabs/:id/emoji', async (req: Request, res: Response) => {
  try {
    const { emoji } = req.body;
    if (!emoji) { res.status(400).json({ error: 'emoji required' }); return; }
    const ok = ctx.tabManager.setEmoji(req.params.id, emoji);
    if (!ok) { res.status(404).json({ error: 'Tab not found' }); return; }
    res.json({ ok: true });
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
| `fase-1-emoji-tabs.md` | Volledige implementatie: backend + shell UI + persistentie | 📋 Ready to start |

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
| 1 | Emoji opslag + API + tab badge UI | ⏳ not started | — |

> Claude Code: markeer phase if ✅ + voeg commit hash toe na afronden.
