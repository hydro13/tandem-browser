# Design: Tab Islands

> **Date:** 2026-02-28
> **Status:** Draft
> **Effort:** Medium (3-5d)
> **Author:** Kees

---

## Problem / Motivation

When Robin opens many tabs from one page (for example, 5 links from a Google search result), those tabs sit separately in the tab bar. There is no visual relationship between them. After ten minutes, it is unclear which tabs belonged to which piece or research.

**Opera has:** Tab Islands — automatic grouping or tabs opened from the same parent. Color-coded clusters with names, collapsible, with visual connections between tabs in the same island.

**Tandem currently has:** `POST /tabs/group` via `function registerTabRoutes()` in `src/api/routes/tabs.ts`. Manual grouping with colors via `class TabManager` → `setGroup()` in `src/tabs/manager.ts`. Tabs have a `groupId` field and there is a `group-dot` element in the shell. But: no auto-grouping, no visual islands, no collapse behavior, and no naming.

**Gap:** The entire auto-grouping logic is missing (opener tracking), and the shell UI only shows a small colored dot instead or a real island design with gap, name, and collapse.

---

## User Experience — How It Works

> Robin opens Tandem and gaat to Google. He zoekt "best noise cancelling headphones 2026" and opens 4 reviews in new tabs.
>
> An **island** automatically appears in the tab bar: the 4 review tabs get a light-blue background and a small label "google.com" above them. To the left and right or the island is a subtle extra gap (8px) that visually separates it from standalone tabs.
>
> Robin clicks the island label and types "Headphones research" as the name. The 4 tabs are now clearly grouped.
>
> Later he opens 3 tabs from Reddit — they automatically form a second island (orange) labeled "reddit.com".
>
> Robin's tab bar is nu organized: 2 islands + a paar losse tabs. He clicks op the collapse-icoontje or the headphones-island → the 4 tabs klappen in tot één compact element with badge "(4)". Één click opens ze weer.

---

## Technical Approach

### Architecture

```
                    ┌─────────────────────┐
                    │   webContents        │
                    │   'did-create-window'│
                    │   → opener tabId     │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   TabManager         │
                    │   trackOpener()      │
                    │   autoGroupTabs()    │
                    │   islands Folder        │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                 │
    ┌─────────▼─────┐  ┌──────▼──────┐  ┌──────▼──────┐
    │ REST API       │  │ IPC events  │  │ Shell UI    │
    │ /tabs/islands  │  │ island-*    │  │ .tab-island │
    │ routes/tabs.ts │  │             │  │ gap + label │
    └───────────────┘  └─────────────┘  └─────────────┘
```

### New Files

| File | Responsibility |
|---------|---------------------|
| — | No new files — alles past in existing modules |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/tabs/manager.ts` | Opener tracking + island data model + auto-group logica | `class TabManager` → new methodes `trackOpener()`, `getIslands()`, `collapseIsland()` |
| `src/api/routes/tabs.ts` | New island endpoints | `function registerTabRoutes()` |
| `src/main.ts` | webContents 'did-create-window' event listener | `createWindow()` |
| `shell/index.html` | Island UI in the tab bar — gap, label, collapse | Tab bar section |
| `shell/css/main.css` | Island styling (gap, colors, collapse animation) | `.tab-island-*` klassen |

### New API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| GET | `/tabs/islands` | List all islands with their tabs |
| POST | `/tabs/islands/create` | Create an island from selected tabs |
| POST | `/tabs/islands/:id/rename` | Rename an island |
| POST | `/tabs/islands/:id/collapse` | Toggle collapse/expand |
| POST | `/tabs/islands/:id/color` | Change island color |
| DELETE | `/tabs/islands/:id` | Delete an island (tabs become standalone tabs) |

### No new npm packages needed? ✅

---

## Phase Breakdown

| Phase | Scope | Sessions | Depends on |
|------|--------|---------|----------------|
| 1 | Backend auto-grouping: opener tracking in `TabManager`, island data model, API endpoints | 1 | — |
| 2 | Shell UI: visual islands in the tab bar (gap, label, color, collapse/expand) | 1 | Phase 1 |

---

## Risks / Pitfalls

- **Opener tracking not always available:** Not all new tabs come through `did-create-window` — some are opened through the API (`POST /tabs/open`). Mitigation: also auto-group API-opened tabs when a `parentTabId` parameter is provided.
- **Tab drag-and-drop:** If tabs are dragged between islands, island state must update with them. Mitigation: handle drag events in the shell and make an API call to `/tabs/islands/:id/move`.
- **Performance with many islands:** With 50+ tabs and 10+ islands, rendering must stay fast. Mitigation: CSS-only gaps (no DOM reshuffling), with islands as CSS class markers on existing tab elements.

---

## Anti-detect considerations

- ✅ Everything goes through the Electron main process + shell — no injection into the webview
- ✅ Opener tracking uses bestaand Electron `webContents` event, not iets in the page
- ✅ UI wijzigingen only in the shell tab bar, onzichtbaar for websites

---

## Decisions Needed from Robin

- [ ] Auto-group drempel: bij 2 or 3 tabs vanuit the same parent a island vormen?
- [ ] Default island-name: parent domain (bv. "google.com") or iets anders?
- [ ] Kleur-toewijzing: automatisch roteren door a palette, or gebaseerd op favicon color?
- [ ] Existing `POST /tabs/group` behouden next to islands, or vervangen?

---

## Approval

Robin: [ ] Go / [ ] No-go / [ ] Go with adjustment: ___________
