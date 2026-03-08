# Design: Search in Tabs (Ctrl+Space)

> **Date:** 2026-02-28
> **Status:** Draft
> **Effort:** Easy (1-2d)
> **Author:** Kees

---

## Problem / Motivation

With 20+ tabs open is the lastig to the juiste tab te vinden. Robin must door the tab bar scrollen and elk tabje visual scannen. Dit kost tijd and is frustrerend, vooral if the tab-titels afgekort are.

**Opera has:** Search in Tabs — Ctrl+Space opens a zoek-popup. Real-time filteren or open tabs op title and URL. Shows favicon, title, URL. Recent closed tabs also visible. Pijltjestoetsen + Enter to te navigeren.

**Tandem currently has:** `GET /tabs/list` API endpoint via `function registerTabRoutes()` in `src/api/routes/tabs.ts`. `class TabManager` has `listTabs()` and `closedTabs` array. Maar: no zoek-UI in the shell.

**Gap:** The data is er (API + manager), but the gebruikersinterface ontbreekt fully. Dit is a purely shell/UI feature.

---

## User Experience — How It Works

> Robin has 25 tabs open. He weet that ergens a Stack Overflow tab open staat over "TypeScript generics", but can hem not vinden in the overvolle tab bar.
>
> He drukt **Ctrl+Space** (or Cmd+Space op macOS — nee, that conflicteert with Spotlight. We use **Ctrl+Space**).
>
> A overlay appears midden at the top the window — a zoekbalk with a list or alle open tabs eronder. Robin begint te typen: "generics".
>
> The list filtert real-time: er blijven 2 tabs over — the Stack Overflow page and a TypeScript docs tab. Robin drukt ↓ and Enter → Tandem schakelt direct to that tab. The overlay disappears.
>
> Later Robin wants to find a tab that he accidentally closed. He presses Ctrl+Space and scrolls down — under the open tabs there is a "Recently Closed" section with the last 10 closed tabs. He clicks one → the tab is reopened.

---

## Technical Approach

### Architecture

```
    ┌──────────────────────────────┐
    │ Shell UI (index.html)         │
    │                               │
    │  Ctrl+Space → toggle overlay  │
    │  ┌─────────────────────────┐  │
    │  │ #tab-search-overlay     │  │
    │  │ ┌─────────────────────┐ │  │
    │  │ │ <input> zoekbalk    │ │  │
    │  │ └─────────────────────┘ │  │
    │  │ ┌─────────────────────┐ │  │
    │  │ │ Tab resultaten list │ │  │
    │  │ │ - favicon + title   │ │  │
    │  │ │ - URL (dim)         │ │  │
    │  │ └─────────────────────┘ │  │
    │  │ ┌─────────────────────┐ │  │
    │  │ │ Recent closed     │ │  │
    │  │ └─────────────────────┘ │  │
    │  └─────────────────────────┘  │
    │              │                 │
    │    fetch() GET /tabs/list     │
    │    fetch() POST /tabs/focus   │
    │    fetch() POST /tabs/open    │
    └──────────────────────────────┘
```

### New Files

| File | Responsibility |
|---------|---------------------|
| — | No — purely shell UI toevoeging |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/api/routes/tabs.ts` | New endpoint `GET /tabs/closed` for recent closed tabs | `function registerTabRoutes()` |
| `src/tabs/manager.ts` | Publieke methode `getClosedTabs()` | `class TabManager` |
| `shell/index.html` | Zoek-overlay HTML + JS (event listeners, fetch, rendering) | New section `// === TAB SEARCH ===` |
| `shell/css/main.css` | Overlay styling (centered popup, transparante achtergrond, resultaten list) | New `.tab-search-*` klassen |

### New API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| GET | `/tabs/closed` | List recent closed tabs (max 10) |

The existing endpoints be hergebruikt:
- `GET /tabs/list` — haal alle open tabs op (bestaand)
- `POST /tabs/focus` — schakel to a tab (bestaand)
- `POST /tabs/open` — heropen a closed tab (bestaand)

### No new npm packages needed? ✅

---

## Phase Breakdown

| Phase | Scope | Sessions | Depends on |
|------|--------|---------|----------------|
| 1 | Volledige implementatie: overlay UI, keyboard shortcut, zoeklogica, recent closed endpoint + UI | 1 | — |

---

## Risks / Pitfalls

- **Ctrl+Space conflict:** Op sommige systemen is Ctrl+Space already bezet (input method switch op Linux). Mitigation: configureerbare shortcut, fallback op Cmd+K or Cmd+E.
- **Focus-management:** Wanneer the overlay open is, must keyboard input to the zoekbalk gaan, not to the webview. Mitigation: overlay overlay with `tabIndex` and `focus()` op the input.
- **Snelheid bij veel tabs:** Bij 100+ tabs must filtering instant are. Mitigation: client-side filtering op already-geladen data (no API call per keystroke).

---

## Anti-detect considerations

- ✅ Fully shell-side — no webview interaction
- ✅ Keyboard shortcut is afgevangen in the shell, not in the page
- ✅ Overlay is a shell-element boven the webview, onzichtbaar for websites

---

## Decisions Needed from Robin

- [ ] Keyboard shortcut: Ctrl+Space, or liever Cmd+K / Cmd+E?
- [ ] Must the overlay also bookmarks doorzoeken, or only open tabs + recent closed?
- [ ] Positie: centered at the top (Chrome-style command palette), or dropdown vanuit tab bar?

---

## Approval

Robin: [ ] Go / [ ] No-go / [ ] Go with adjustment: ___________
