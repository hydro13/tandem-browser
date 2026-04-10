# Design: Search in Tabs (Ctrl+Space)

> **Date:** 2026-02-28
> **Status:** Planned
> **Effort:** Easy (1-2d)
> **Author:** Kees

---

## Problem / Motivation

With 20+ tabs open it becomes difficult to find the right tab. Robin has to scroll through the tab bar and visually scan each tab. This costs time and is frustrating, especially when tab titles are truncated.

**Opera has:** Search in Tabs — Ctrl+Space opens a search popup. Real-time filtering of open tabs by title and URL. Shows favicon, title, URL. Recently closed tabs also visible. Arrow keys + Enter to navigate.

**Tandem currently has:** `GET /tabs/list` API endpoint via `function registerTabRoutes()` in `src/api/routes/tabs.ts`. `class TabManager` has `listTabs()` and `closedTabs` array. But: no search UI in the shell.

**Gap:** The data is there (API + manager), but the user interface is completely missing. This is a purely shell/UI feature.

---

## User Experience — How It Works

> Robin has 25 tabs open. He knows that somewhere a Stack Overflow tab is open about "TypeScript generics", but can't find it in the crowded tab bar.
>
> He presses **Ctrl+Space** (or Cmd+Space on macOS — no, that conflicts with Spotlight. We use **Ctrl+Space**).
>
> An overlay appears centered at the top of the window — a search bar with a list of all open tabs below it. Robin starts typing: "generics".
>
> The list filters in real-time: 2 tabs remain — the Stack Overflow page and a TypeScript docs tab. Robin presses ↓ and Enter → Tandem switches directly to that tab. The overlay disappears.
>
> Later Robin wants to find a tab he accidentally closed. He presses Ctrl+Space and scrolls down — below the open tabs there is a "Recently Closed" section with the last 10 closed tabs. He clicks one → the tab is reopened.

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
    │  │ │ <input> search bar  │ │  │
    │  │ └─────────────────────┘ │  │
    │  │ ┌─────────────────────┐ │  │
    │  │ │ Tab results list    │ │  │
    │  │ │ - favicon + title   │ │  │
    │  │ │ - URL (dim)         │ │  │
    │  │ └─────────────────────┘ │  │
    │  │ ┌─────────────────────┐ │  │
    │  │ │ Recently closed     │ │  │
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
| — | None — purely a shell UI addition |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/api/routes/tabs.ts` | New endpoint `GET /tabs/closed` for recently closed tabs | `function registerTabRoutes()` |
| `src/tabs/manager.ts` | Public method `getClosedTabs()` | `class TabManager` |
| `shell/index.html` | Search overlay HTML + JS (event listeners, fetch, rendering) | New section `// === TAB SEARCH ===` |
| `shell/css/main.css` | Overlay styling (centered popup, transparent background, results list) | New `.tab-search-*` classes |

### New API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| GET | `/tabs/closed` | List recently closed tabs (max 10) |

The existing endpoints are reused:
- `GET /tabs/list` — get all open tabs (existing)
- `POST /tabs/focus` — switch to a tab (existing)
- `POST /tabs/open` — reopen a closed tab (existing)

### No new npm packages needed? ✅

---

## Phase Breakdown

| Phase | Scope | Sessions | Depends on |
|------|--------|---------|----------------|
| 1 | Full implementation: overlay UI, keyboard shortcut, search logic, recently closed endpoint + UI | 1 | — |

---

## Risks / Pitfalls

- **Ctrl+Space conflict:** On some systems Ctrl+Space is already taken (input method switch on Linux). Mitigation: configurable shortcut, fallback to Cmd+K or Cmd+E.
- **Focus management:** When the overlay is open, keyboard input must go to the search bar, not to the webview. Mitigation: overlay with `tabIndex` and `focus()` on the input.
- **Speed with many tabs:** With 100+ tabs, filtering must be instant. Mitigation: client-side filtering on already-loaded data (no API call per keystroke).

---

## Anti-detect Considerations

- ✅ Fully shell-side — no webview interaction
- ✅ Keyboard shortcut is captured in the shell, not in the page
- ✅ Overlay is a shell element above the webview, invisible to websites

---

## Open Questions

- [ ] Keyboard shortcut: Ctrl+Space, or prefer Cmd+K / Cmd+E?
- [ ] Should the overlay also search bookmarks, or only open tabs + recently closed?
- [ ] Position: centered at the top (Chrome-style command palette), or dropdown from tab bar?
