# Bookmark Unification Plan

> Status: Draft | Author: Kees | Date: 2026-03-02

## Huidige situatie (4 systemen)

| # | System | Locatie | Probleem |
|---|---------|---------|---------|
| 1 | Ster knop | `shell/js/main.js:2153` | No popup — slaat stil op in root |
| 2 | Bookmarks Bar | `shell/js/main.js:2217` | Werkend, behouden |
| 3 | Bookmarks Page | `shell/bookmarks.html` | Standalone, duplicaat or panel |
| 4 | Sidebar Panel ⭐ | `shell/index.html:654` | Mooiste, but read-only |

**Goal:** Sidebar Panel = master UI. Ster popup + CRUD add. Standalone page deprecaten.

---

## Phase 1 — Bookmark Star Popup

**File:** `shell/js/main.js` (rond line 2181 — `toggleBookmarkCurrentPage()`)

**Wat bouwen:**
- Klein popup dialoogje that appears bij click op ster (Chrome-stijl)
- Positie: verankerd about the ster knop, boven/under the URL balk
- Velden:
  - **Name** — input, pre-filled with `document.title`
  - **Folder** — dropdown with alle existing folders (via `GET /bookmarks`)
  - **Save** knop (groen) → `POST /bookmarks/add` with chosen folder if parentId
  - **Verwijderen** knop (rood, only if already gebookmarkt) → `DELETE /bookmarks/remove`
  - **Sluiten** bij click buiten popup or Escape
- If page already gebookmarkt is: popup opens in "edit mode" (name aanpassen, folder verplaatsen)
- Na save: ster is ★ (oranje), bar refresht

**HTML:** new `<div id="bookmark-popup">` add in `shell/index.html`
**CSS:** new blok in `shell/css/main.css` — frosted glass stijl (passend bij rest or Tandem)
**Auth:** fetch calls krijgen `Authorization: Bearer ${TOKEN}` header (fix meteen)

---

## Phase 2 — Sidebar Panel uitbreiden with CRUD

**File:** `shell/index.html:654-822` (inline bookmark panel script)

**Wat add:**
- **"+ Bookmark" knop** at the top panel (next to zoekbalk)
  → opens inline mini-form (name + URL velden) or hergebruikt the star popup logica
- **"+ Folder" knop** — already mogelijk via bookmarks.html, add about panel
- **Edit knop** bij hover over bookmark item (potloodicoon)
  → inline edit or klein modal — name + URL aanpassen
- **Delete knop** bij hover (prullenbak icon) → bevestigingsvraag → `DELETE /bookmarks/remove`
- **Drag-and-drop** to bookmarks te herordenen or to andere folder te slepen (toekomstige fase)

**Resultaat:** Panel is fully functioneel, bookmarks.html is overbodig.

---

## Phase 3 — Standalone Page deprecaten

**File:** `shell/bookmarks.html`

- Na phase 2: `Bookmark Manager` menu item opens the **sidebar panel** in plaats or a new tab
- `shell/bookmarks.html` blijft bestaan if fallback but is not meer actief gelinkt
- In a latere versie verwijderen

**Aanpassing:**
- `src/menu/app-menu.ts` — `open-bookmarks` event → stuur `open-sidebar-panel` with `bookmarks` if panel ID
- `shell/js/main.js` — `open-bookmarks` handler aanpassen

---

## Phase 4 — Auth fixes & code deduplicatie

**Auth:**
- `shell/js/main.js` — ster button fetch calls krijgen auth header
- `shell/bookmarks.html` — fetch calls krijgen auth header
- Or: bookmark endpoints whitelisten without auth (ze are already localhost-only)

**Code deduplicatie (optional, latere fase):**
- Gedeelde helper: `shell/js/bookmarks-utils.js`
  - `renderBookmarkItem(item)` — herbruikbaar template
  - `fetchBookmarks()` — centrale fetch with auth
  - `renderFolderTree(folders, selectedId)` — for dropdown in popup + panel

---

## Implementatieorder for Claude Code

```
Phase 1 → Phase 2 → Phase 3 → Phase 4
```

Start with Phase 1 (ster popup) — that lost the meest zichtbare bug op and is zelfstandig.
Phase 2 bouwt voort op the same popup/dialog patterns.
Phase 3 is purely routing — klein but impactvol.
Phase 4 is cleanup — can in the same PR or apart.

---

## Files that change

| File | Wijziging |
|---------|-----------|
| `shell/index.html` | Bookmark popup HTML add + panel CRUD knoppen |
| `shell/js/main.js` | Popup logica + auth fix ster button |
| `shell/css/main.css` | Popup styling (frosted glass) |
| `src/menu/app-menu.ts` | `open-bookmarks` → open sidebar panel |
| `shell/js/main.js` | `open-bookmarks` handler aanpassen |

**Not aanraken:**
- `src/bookmarks/manager.ts` — backend is prima
- `src/api/routes/data.ts` — API is compleet
- `shell/bookmarks.html` — only deprecaten, not aanpassen

---

## Definitie or complete

- [ ] Klik ster → popup appears with name + folder picker
- [ ] Popup slaat op in chosen folder (not always root)
- [ ] Popup shows edit/delete if page already gebookmarkt is
- [ ] Sidebar panel has + Bookmark, + Folder, edit and delete
- [ ] Bookmark Manager menu opens sidebar panel (not new tab)
- [ ] Alle bookmark API calls hebben auth headers
- [ ] `npm run build` slaagt without errors
