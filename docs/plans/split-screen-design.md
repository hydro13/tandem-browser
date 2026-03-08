# Design: Split Screen

> **Date:** 2026-02-28
> **Status:** Draft
> **Effort:** Medium (3-5d)
> **Author:** Kees

---

## Problem / Motivation

Power users willen twee websites next to elkaar bekijken without te hoeven wisselen between tabs. Think about: documentatie links + code rechts, vergelijken or producten, or a video kijken terwijl you aantekeningen maakt.

**Opera has:** Split Screen with 2-4 panes (vertical, horizontal, grid). Drag tab to beneden to te split, or Shift+click twee tabs → rechtermuisklik → Split Screen. Elk panel has own navigatie.
**Tandem currently has:** Één webview simultaneously in the main content area. No multi-pane support.
**Gap:** Completely missing — no manier to twee page's next to elkaar te tonen.

---

## User Experience — How It Works

> Robin opens Tandem and navigeert to a API documentatie page. He wil simultaneously are applicatie testen.
> He opens a second tab with are app, selecteert beide tabs (Shift+click), rechtermuisklik → "Split Screen".
> The window splitst vertical: links the docs, rechts are app. Between the twee panels zit a sleepbare divider.
> Robin clicks op the linker panel — the URL bar shows the docs URL. He navigeert to a andere docs page.
> The rechter panel blijft ongewijzigd op are app. Robin sleept the divider to links to are app meer ruimte te geven.
> If he complete is, clicks he rechtermuisklik → "Exit Split Screen" and keert terug to normaal single-tab browsen.

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

API: POST /split/open → SplitScreenManager → setBounds() op BrowserViews
     POST /split/close → SplitScreenManager → delete secondary view
     GET  /split/status → huidige layout info
```

### New Files

| File | Responsibility |
|---------|---------------------|
| `src/split-screen/manager.ts` | SplitScreenManager — layout state, BrowserView lifecycle, bounds berekening |
| `src/api/routes/split.ts` | REST API endpoints for split screen |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/registry.ts` | `splitScreenManager` add about `ManagerRegistry` | `interface ManagerRegistry` |
| `src/api/server.ts` | Split routes registreren | `setupRoutes()` |
| `src/main.ts` | SplitScreenManager instantiëren, registreren, cleanup | `startAPI()`, `app.on('will-quit')` |
| `shell/index.html` | Divider element + split screen controls in toolbar | `<!-- Main layout -->` section |
| `shell/js/main.js` | Divider drag logic, active pane focus, split keyboard shortcuts | event handlers |
| `shell/css/main.css` | Styling for divider, active pane indicator | new CSS classes |

### New API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| POST | `/split/open` | Start split screen with `{tabId1, tabId2, layout}` — layout: `'vertical'` or `'horizontal'` |
| POST | `/split/close` | Closes split screen, keert terug to single view |
| GET | `/split/status` | Huidige split state: active/inactive, pane info, layout |
| POST | `/split/layout` | Wissel layout: vertical ↔ horizontal |
| POST | `/split/focus/:paneIndex` | Focus specifiek panel (0=links/boven, 1=rechts/under) |
| POST | `/split/resize` | Set divider positie if ratio (0.0-1.0) |

### No new npm packages needed? ✅

---

## Phase Breakdown

| Phase | Scope | Sessions | Depends on |
|------|--------|---------|----------------|
| 1 | Electron BrowserView splitting backend + API endpoints | 1 | — |
| 2 | Shell UI: tab context menu, divider drag, active pane focus | 1 | Phase 1 |

---

## Risks / Pitfalls

- **Single-webview aanname:** The huidige shell gaat out or één `<webview>` tag. Split screen requires that we the webview-container layout dynamisch aanpassen. The existing `<webview>` can blijven if "pane 0" — the second pane is a new element.
- **BrowserView vs webview tag:** Electron's `BrowserView` is krachtiger but complexer. We kiezen for a second `<webview>` tag in the shell HTML — this is eenvoudiger, past bij the existing pattern, and vermijdt the BrowserView→WebContentsView migratie.
- **Focus management:** If the actieve pane wisselt, must the toolbar (URL bar, back/forward) the juiste webContents aansturen. Dit requires a `activePaneIndex` state in the shell.
- **Tab registratie:** The second pane webview must also geregistreerd be bij TabManager zodat navigatie-events correct verwerkt be.

---

## Anti-detect considerations

- ✅ Alles via shell layout and Electron main process — no injection into the webview
- ✅ Split screen is purely a UI-laag (twee webviews next to elkaar) — websites in the webviews zien only hun own page
- ✅ Divider and controls zitten in the shell, not in the webview

---

## Decisions Needed from Robin

- [ ] Wil you also 4-pane grid (2x2) support, or is 2-pane (vertical/horizontal) genoeg for V1?
- [ ] Drag tab to beneden if trigger for split screen — wil you this in phase 2, or only via context menu?

---

## Approval

Robin: [ ] Go / [ ] No-go / [ ] Go with adjustment: ___________
