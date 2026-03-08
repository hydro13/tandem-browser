# Design: Pinboards

> **Date:** 2026-02-28
> **Status:** Draft
> **Effort:** Hard (1-2 weken)
> **Author:** Kees

---

## Problem / Motivation

Robin uses Opera's Pinboards daily to collect web content: links for research, images for inspiration, text fragments from articles, and YouTube videos for later. It is a visual moodboard — faster and more flexible than bookmarks, richer than a text note.

Tandem mist this concept fully. Er are page notes (`POST /context/note`) and bookmarks with folders, but no visual board waar you vrij content op kunt gooien and organize.

**Opera has:** Virtuele "magneetborden" waar you links, images, text, screenshots and YouTube-embeds op sleept. Kanban-modus (To Do / In Progress / Done). Deelbaar via link (no login nodig for kijkers). Emoji-reacties. Toegankelijk via sidebar-icon, `opera://pinboards`, and right-click → "Save to Pinboard".

**Tandem currently has:** `POST /context/note` for text notes per URL. Bookmarks with folders (`BookmarkManager`). Sessie-state save. No visual board, no card-layout, no Kanban.

**Gap:** Tandem mist a plek to webcontent visual te collect and organize. Bookmarks are plat and saai. Page notes zitten vast about één URL. Robin has a creatieve ruimte nodig — a digitaal pinboard.

---

## User Experience — How It Works

> Robin doet research to a new project. He opens tien tabs, vindt a interessant article, a mooie image, and a YouTube-tutorial.
>
> He clicks with rechts op the image → "Save to Pinboard" → chooses are "Project X Research" board. The image appears if card op are board.
>
> He selecteert a alinea out a article → right-click → "Save selection to Pinboard". The text is a quote-card.
>
> Later he opens the Pinboard panel via the icon in the sidebar. He sees his existing boards: "Project X Research", "Design Inspiration", and "Read Later". He clicks "Project X Research" and sees a grid of cards — links with thumbnails, images, and text fragments.
>
> He sleept cards to ze te herordenen. He clicks op a link-card and the page opens in a new tab. He verwijdert a card that not meer relevant is.
>
> No cloud, no login, no sync — alles local in `~/.tandem/pinboards/`.

---

## Wat Pinboards are

Pinboards are visual moodboards within the browser. Think Pinterest-style boards, but private and local. You "pin" web content — links, images, text, quotes — onto a board for later use.

### Verschil with bookmarks
| | Bookmarks | Pinboards |
|---|-----------|-----------|
| **Structuur** | Hiërarchische folders | Visual card-grid |
| **Content** | Only URLs | Links, images, text, quotes |
| **Context** | Title + URL | Thumbnail, note, originele URL, type |
| **Organisatie** | Folders and subfolders | Multiple boards, drag-to-reorder |
| **Usage** | Permanente bladwijzers | Tijdelijke research, inspiratie, projecten |

### Use cases for Robin
- **Research sessions:** Links and quotes collect for a project
- **Design inspiratie:** Images and screenshots bijeenbrengen
- **Read later:** Save pages with more context than a bookmark
- **Project resources:** Alle relevante links for a lopend project op één plek

---

## Opera's Implementatie (referentie)

Opera biedt the full spectrum:
- **Content types:** text, links (with preview-cards), images, screenshots, YouTube-embeds, muziekbestanden, documenten
- **Organisatie:** vrije drag-and-drop op a canvas + Kanban-modus (kolommen)
- **Samenwerking:** delen via link, no login nodig, emoji-reacties
- **Toegang:** sidebar-icon, `opera://pinboards`, right-click context menu

### Wat we overnemen (V1)
- Multiple benoemde boards with emoji
- Content types: link, image, text/quote
- Right-click "Save to Pinboard"
- Sidebar-panel if toegangspunt
- Lokale JSON storage

### Wat we NIET bouwen (V1)
- Cloud sharing / deelbare links
- Emoji-reacties
- YouTube-embeds (comes in V2)
- Kanban-kolommen (comes in V2)
- Vrije canvas drag-and-drop (comes in V3)

---

## Tandem's Approach: Local-First

Tandem's filosofie is **local, privacy-first, no cloud dependencies**. Pinboards volgen this pattern:

- **Opslag:** `~/.tandem/pinboards/boards.json` — a JSON-file with alle boards and items
- **No server nodig:** Alles is via the existing Express API (localhost:8765) bediend
- **No login:** No accounts, no sync, no external services
- **Volledige controle:** Robin's data blijft op Robin's machine

Later (V2+) can cloud sharing optional be added, but V1 is 100% offline.

---

## Technical Approach

### Architecture

```
┌──────────────────────────────────────────────────────┐
│  Shell UI (sidebar panel / tandem://pinboards)        │
│  ┌──────────────────────────────────────────────────┐ │
│  │  Board List  │  Item Grid (cards)                │ │
│  └──────────────────────────────────────────────────┘ │
└────────────────────────┬─────────────────────────────┘
                         │ HTTP (localhost:8765)
┌────────────────────────▼─────────────────────────────┐
│  Express API — /pinboards endpoints                   │
│  registerPinboardRoutes() in routes/pinboards.ts      │
└────────────────────────┬─────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────┐
│  PinboardManager (src/pinboards/manager.ts)           │
│  CRUD operaties, JSON storage, thumbnail generatie    │
└────────────────────────┬─────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │  ~/.tandem/pinboards │
              │  └── boards.json     │
              └─────────────────────┘
```

### Data Model

```typescript
interface PinboardStore {
  boards: Pinboard[];
  lastModified: string;
}

interface Pinboard {
  id: string;           // unieke ID (timestamp + random)
  name: string;         // "Project X Research"
  emoji: string;        // "📌" (default) or chosen emoji
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
  items: PinboardItem[];
}

interface PinboardItem {
  id: string;           // unieke ID
  type: 'link' | 'image' | 'text' | 'quote';
  url?: string;         // bron-URL (for links and images)
  title?: string;       // paginatitel or zelf chosen title
  content?: string;     // tekstinhoud (for text/quote types)
  thumbnail?: string;   // data URI or pad to thumbnail
  note?: string;        // optionele gebruikersnotitie
  sourceUrl?: string;   // URL or the page waarvan the item comes
  createdAt: string;    // ISO 8601
  position: number;     // order in the board (0, 1, 2, ...)
}
```

**Type-specifiek behavior:**
| Type | `url` | `title` | `content` | `thumbnail` |
|------|-------|---------|-----------|-------------|
| `link` | Goal-URL | Paginatitel | — | Favicon or page screenshot |
| `image` | Afbeeldings-URL | Alt-text or filename | — | The image zelf (verkleind) |
| `text` | — | Optioneel | The getypte text | — |
| `quote` | — | — | Geselecteerde text | — |

### New Files

| File | Responsibility |
|---------|---------------------|
| `src/pinboards/manager.ts` | `PinboardManager` class — CRUD, storage, ID-generatie |
| `src/api/routes/pinboards.ts` | `registerPinboardRoutes()` — REST endpoints |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/registry.ts` | `pinboardManager` add about `ManagerRegistry` | `interface ManagerRegistry` |
| `src/api/server.ts` | Pinboard routes importeren and registreren | `setupRoutes()` |
| `src/main.ts` | `PinboardManager` instantiëren, about registry add, cleanup in will-quit | `startAPI()`, `app.on('will-quit')` |
| `src/context-menu/types.ts` | `PinboardManager` add about `ContextMenuDeps` | `interface ContextMenuDeps` |
| `src/context-menu/menu-builder.ts` | "Save to Pinboard" items add | `build()`, new methode `addPinboardItems()` |
| `shell/index.html` | Pinboard sidebar-icon + panel UI | Sidebar section |

### New API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| GET | `/pinboards` | List or alle boards (without items, for sidebar) |
| POST | `/pinboards` | New board aanmaken (name, emoji) |
| GET | `/pinboards/:id` | Eén board ophalen with alle items |
| PUT | `/pinboards/:id` | Bord update (name, emoji) |
| DELETE | `/pinboards/:id` | Bord verwijderen inclusief alle items |
| GET | `/pinboards/:id/items` | Alle items or a board |
| POST | `/pinboards/:id/items` | Item add about board |
| PUT | `/pinboards/:id/items/:itemId` | Item update (note, position, title) |
| DELETE | `/pinboards/:id/items/:itemId` | Item verwijderen |
| POST | `/pinboards/:id/items/reorder` | Items herordenen (array or IDs in new order) |

### No New npm Packages Needed ✅

Alles is built with existing dependencies:
- Express (API routes)
- `fs` / `path` (JSON storage)
- `crypto` (ID generatie, or `Date.now().toString(36)` pattern or `BookmarkManager`)

---

## Phase Breakdown

| Phase | Scope | Sessions | Depends on |
|------|--------|---------|----------------|
| 1 | **Backend + API** — `PinboardManager` class, JSON storage, alle REST endpoints, registry wiring | 1 | — |
| 2 | **UI Panel + Context Menu** — Sidebar icon, panel with boardlijst + itemgrid, right-click "Save to Pinboard" | 1 | Phase 1 |
| 3 | **Visual Board View** — Kaarten with thumbnails, drag-to-reorder, delete, board switching, polish | 1 | Phase 2 |

### Details per fase

**Phase 1 — Backend + API** (`docs/implementations/pinboards/fase-1-backend-api.md`)
- `PinboardManager` class with CRUD for boards and items
- JSON storage in `~/.tandem/pinboards/boards.json`
- Alle endpoints registreren via `registerPinboardRoutes()`
- Registry wiring: `ManagerRegistry`, `main.ts`, `will-quit` cleanup
- Curl-tests if acceptatiecriteria

**Phase 2 — UI Panel + Context Menu** (`docs/implementations/pinboards/fase-2-ui-panel.md`)
- Pinboard icon in the sidebar (next to existing icons)
- Paneel shows boardlijst + items or geselecteerd board
- Rechtermuisknuk context menu: "Save page to Pinboard", "Save image to Pinboard", "Save selection to Pinboard"
- Basis item-weergave (list with title, type-icon, date)

**Phase 3 — Visual Board View** (`docs/implementations/pinboards/fase-3-visual-board.md`)
- Card-grid layout with thumbnails, titels, notes
- Drag-to-reorder (with positie-update to API)
- Delete-knop per card
- Board-switcher dropdown
- Visual polish: hover-effecten, type-icons, lege-state

---

## Risks / Pitfalls

- **JSON file grootte:** If Robin honderden items with inline thumbnails (data URIs) opslaat, can `boards.json` large be. **Mitigation:** Thumbnails if aparte files save in `~/.tandem/pinboards/thumbnails/`, only pad save in JSON. Maar V1 begint simpel with data URIs for kleine hoeveelheden.
- **Context menu complexiteit:** The `ContextMenuBuilder` is already vrij large. **Mitigation:** `addPinboardItems()` if aparte methode, only tonen if er boards bestaan.
- **UI in shell/index.html:** Shell is already a large file. **Mitigation:** Pinboard UI if apart panel/section with own IIFE, vergelijkbaar with the `ocChat` pattern.
- **Thumbnail generatie:** `webContents.capturePage()` for page-screenshots is async and can traag are. **Mitigation:** V1 uses favicon-URLs for links, no screenshots. Thumbnails for images are the images zelf (verkleind via CSS, not server-side).

---

## Anti-detect considerations

- ✅ Alles via Electron main process / shell — no injection into the webview
- ✅ Context menu items be built door `ContextMenuBuilder` in the main process
- ✅ Pinboard panel is onderdeel or the shell UI, not or the webview
- ✅ No netwerk calls to externe diensten — alles local
- ⚠️ Bij "Save image to Pinboard": the `srcURL` comes out the webview `context-menu` event params (default Electron/Chromium behavior, not detecteerbaar)
- ⚠️ Bij "Save selection to Pinboard": the `selectionText` comes out the same params (default behavior)

---

## Decisions Needed from Robin

- [ ] **Bord emoji:** Default emoji-selector or vrij tekstveld? (Voorstel: vrij tekstveld, default "📌")
- [ ] **Thumbnail strategie:** Favicons for links (simpel, snel) or page screenshots (richer, trager)?
- [ ] **Sidebar positie:** Own icon in sidebar or onderdeel or bestaand wingman panel?
- [ ] **Maximaal aantal boards:** Onbeperkt or cap? (Voorstel: onbeperkt, net if bookmarkmappen)

---

## Approval

Robin: [ ] Go / [ ] No-go / [ ] Go with adjustment: ___________
