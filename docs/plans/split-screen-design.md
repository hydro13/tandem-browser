# Design: Split Screen

> **Date:** 2026-02-28
> **Status:** Planned
> **Effort:** Medium (3-5d)
> **Author:** Kees

---

## Problem / Motivation

Power users want to view two websites side by side without having to switch between tabs. Think of: documentation on the left + code on the right, comparing products, or watching a video while taking notes.

**Opera has:** Split Screen with 2-4 panes (vertical, horizontal, grid). Drag a tab to the bottom to split, or Shift+click two tabs → right-click → Split Screen. Each panel has its own navigation.
**Tandem currently has:** One webview at a time in the main content area. No multi-pane support.
**Gap:** Completely missing — no way to show two pages side by side.

---

## User Experience — How It Works

> Robin opens Tandem and navigates to an API documentation page. He wants to simultaneously test his application.
> He opens a second tab with his app, selects both tabs (Shift+click), right-clicks → "Split Screen".
> The window splits vertically: docs on the left, his app on the right. Between the two panels is a draggable divider.
> Robin clicks on the left panel — the URL bar shows the docs URL. He navigates to a different docs page.
> The right panel remains unchanged on his app. Robin drags the divider to the left to give his app more space.
> When he's done, he right-clicks → "Exit Split Screen" and returns to normal single-tab browsing.

---

## Technical Approach

### Architecture

```
┌──────────────────────────────────────────────┐
│                  Shell (index.html)           │
│  ┌──────────┐  ┌──────────────────────────┐  │
│  │ Tab Bar   │  │ toolbar (URL bar etc.)   │  │
│  └──────────┘  └──────────────────────────┘  │
│  ┌─────────────────┬──┬─────────────────┐    │
│  │   BrowserView   │▌▌│  BrowserView    │    │
│  │   (left pane)   │▌▌│  (right pane)   │    │
│  │                 │▌▌│                 │    │
│  │  webContents A  │▌▌│  webContents B  │    │
│  └─────────────────┴──┴─────────────────┘    │
│                     ↑ draggable divider       │
└──────────────────────────────────────────────┘

API: POST /split/open → SplitScreenManager → setBounds() on BrowserViews
     POST /split/close → SplitScreenManager → delete secondary view
     GET  /split/status → current layout info
```

### New Files

| File | Responsibility |
|---------|---------------------|
| `src/split-screen/manager.ts` | SplitScreenManager — layout state, BrowserView lifecycle, bounds calculation |
| `src/api/routes/split.ts` | REST API endpoints for split screen |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/registry.ts` | Add `splitScreenManager` to `ManagerRegistry` | `interface ManagerRegistry` |
| `src/api/server.ts` | Register Split routes | `setupRoutes()` |
| `src/main.ts` | Instantiate SplitScreenManager, register, cleanup | `startAPI()`, `app.on('will-quit')` |
| `shell/index.html` | Divider element + split screen controls in toolbar | `<!-- Main layout -->` section |
| `shell/js/main.js` | Divider drag logic, active pane focus, split keyboard shortcuts | event handlers |
| `shell/css/main.css` | Styling for divider, active pane indicator | new CSS classes |

### New API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| POST | `/split/open` | Start split screen with `{tabId1, tabId2, layout}` — layout: `'vertical'` or `'horizontal'` |
| POST | `/split/close` | Close split screen, return to single view |
| GET | `/split/status` | Current split state: active/inactive, pane info, layout |
| POST | `/split/layout` | Switch layout: vertical ↔ horizontal |
| POST | `/split/focus/:paneIndex` | Focus specific panel (0=left/top, 1=right/bottom) |
| POST | `/split/resize` | Set divider position as ratio (0.0-1.0) |

### No new npm packages needed? ✅

---

## Phase Breakdown

| Phase | Scope | Sessions | Depends on |
|------|--------|---------|----------------|
| 1 | Electron BrowserView splitting backend + API endpoints | 1 | — |
| 2 | Shell UI: tab context menu, divider drag, active pane focus | 1 | Phase 1 |

---

## Risks / Pitfalls

- **Single-webview assumption:** The current shell assumes one `<webview>` tag. Split screen requires dynamically adjusting the webview container layout. The existing `<webview>` can remain as "pane 0" — the second pane is a new element.
- **BrowserView vs webview tag:** Electron's `BrowserView` is more powerful but more complex. We choose a second `<webview>` tag in the shell HTML — this is simpler, fits the existing pattern, and avoids the BrowserView→WebContentsView migration.
- **Focus management:** When the active pane switches, the toolbar (URL bar, back/forward) must target the correct webContents. This requires an `activePaneIndex` state in the shell.
- **Tab registration:** The second pane webview must also be registered with TabManager so navigation events are processed correctly.

---

## Anti-detect Considerations

- ✅ Everything via shell layout and Electron main process — no injection into the webview
- ✅ Split screen is purely a UI layer (two webviews side by side) — websites in the webviews only see their own page
- ✅ Divider and controls are in the shell, not in the webview

---

## Open Questions

- [ ] Support 4-pane grid (2x2) as well, or is 2-pane (vertical/horizontal) enough for V1?
- [ ] Drag tab to bottom as trigger for split screen — include in phase 2, or only via context menu?
