# Design: Sidebar Infrastructuur (Foundation)

> **Date:** 2026-02-28
> **Status:** Under review by Robin
> **Effort:** Medium (3-5 days)
> **Priority:** #0 — this is the foundation for alle andere sidebar features

---

## Problem / Motivation

Tandem has currently **no linker sidebar**. Workspaces, Messengers, Pinboards, Personal News, Bookmarks, History and Downloads are separately ontworpen without shared foundation. If we ze los bouwen, gets elke feature are own ad-hoc icon strip — that is chaos.

Opera has this goed opgelost: één uniforme sidebar with a plug-in system. Alle features registreren zich daarin. Configureerbaar, drag-to-reorder, enable/disable.

---

## Current Tandem Layout

```
<body> (flex column)
├── .tab-bar            ← tabs + menu knop
├── .toolbar            ← adresbalk, knoppen
├── .bookmarks-bar      ← bookmarks bar
└── .main-layout        ← flex row
      ├── .browser-content   ← flex:1, webviews
      └── .wingman-panel     ← rechts, AI panel
```

**Goal:** `.sidebar` add if EERSTE kind or `.main-layout`:

```
└── .main-layout        ← flex row
      ├── .sidebar           ← NIEUW: links, 48px (icon) or 240px (panel open)
      ├── .browser-content   ← flex:1, webviews (ongewijzigd)
      └── .wingman-panel     ← rechts, ongewijzigd
```

---

## Sidebar Layout

```
┌────────────────────────────────────────────────────────────┐
│ .tab-bar                                                   │
│ .toolbar                                                   │
│ .bookmarks-bar                                             │
├──────┬──────────────────────────────────────┬─────────────┤
│      │                                      │             │
│ 48px │      .browser-content (flex:1)       │   Wingman   │
│      │                                      │   Panel     │
│ side │                                      │   (rechts)  │
│ bar  │                                      │             │
│      │                                      │             │
└──────┴──────────────────────────────────────┴─────────────┘
```

With open sidebar panel (bijv. Bookmarks):

```
├──────┬────────────────┬───────────────────────┬───────────┤
│ 48px │  240px panel   │   .browser-content    │  Wingman  │
│ icons│  (bijv. Books) │   (verkleint mee)     │  Panel    │
└──────┴────────────────┴───────────────────────┴───────────┘
```

---

## Sidebar Items (definitieve list, besloten 2026-02-28)

> **Besluit 2026-02-28 (na Opera screenshot review):**
> Elke messenger gets a **own slot** in the icon strip — not één "Messengers" knop with sub-panel.
> **Twee icon stijlen** (exact zoals Opera): colored brand SVG for messengers, outline grijs for utility.
> **Active indicator**: colored afgeronde vierkant achter the icon (not border-left).

### Utility items (outline Heroicons, lichtgrijs)

| # | Item | Type | SVG icon | Panel inhoud |
|---|------|------|----------|-------------|
| 1 | Workspaces | Panel | `squares-2x2` (grid) | Workspaces switch/create/delete |
| 2 | Personal News | Panel | `newspaper` | RSS/Atom feeds |
| 3 | Pinboards | Panel | `squares-plus` | Pinboard manager |
| 4 | Bookmarks | Panel | `bookmark` | Bookmark tree |
| 5 | History | Panel | `clock` | Browse history |
| 6 | Downloads | Panel | `arrow-down-tray` | Download manager |

### Messenger items (colored brand SVG, own webview per app)

| # | App | Icon color | Webview partition |
|---|-----|-----------|------------------|
| 7 | WhatsApp | #25D366 (groen) | `persist:whatsapp` |
| 8 | Telegram | #2AABEE (blauw) | `persist:telegram` |
| 9 | Discord | #5865F2 (paars) | `persist:discord` |
| 10 | Slack | #4A154B (paars/rood) | `persist:slack` |
| 11 | Instagram | gradient #E1306C→#F77737 | `persist:instagram` |
| 12 | X (Twitter) | #000000 (zwart) | `persist:x` |

> Icon stijl: Heroicons outline (MIT) for utility. Brand SVG logos for messengers (simpele herkenbare shapes, own kleuren).

**Not in sidebar:** Wingman AI Panel (blijft rechts, own toggle knop)

---

## Technical Architecture

### Item Types

```typescript
type SidebarItemType = 'panel' | 'webview';

interface SidebarItem {
  id: string;           // 'workspaces' | 'messengers' | 'news' | etc.
  label: string;        // "Workspaces"
  icon: string;         // emoji or SVG path
  type: SidebarItemType;
  enabled: boolean;
  order: number;
}

type SidebarState = 'hidden' | 'narrow' | 'wide';

interface SidebarConfig {
  items: SidebarItem[];
  state: SidebarState;  // 'narrow' = default
  activeItemId: string | null; // welk panel staat open
}
```

### Storage
- Config: `~/.tandem/sidebar-config.json`
- Default order: Workspaces → Messengers → Personal News → Pinboards → Bookmarks → History → Downloads

### New Files

| File | Responsibility |
|---------|---------------------|
| `src/sidebar/manager.ts` | `SidebarManager` — config load/save, item registratie |
| `src/api/routes/sidebar.ts` | REST endpoints for config + item status |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/api/server.ts` | `sidebarManager` add | `TandemAPIOptions`, `class TandemAPI` |
| `src/main.ts` | Manager instantiëren + cleanup | `startAPI()`, `app.on('will-quit')` |
| `shell/index.html` | Sidebar HTML add | `<!-- Main layout -->` section |
| `shell/css/main.css` | Sidebar CSS | `.main-layout` section |

---

## API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| GET | `/sidebar/config` | Huidige config (items + order + narrowMode) |
| POST | `/sidebar/config` | Config updaten (order, narrowMode) |
| POST | `/sidebar/items/:id/toggle` | Item enable/disable |
| POST | `/sidebar/items/:id/activate` | Panel openen/sluiten |
| GET | `/sidebar/items` | List alle geregistreerde items |

---

## Shell UI Behavior

### Icon strip — 3 standen

**Hidden (0px):** fully hidden, toggle via ⌘⇧B
**Narrow (48px, default):** only icon, no labels, tooltip on hover — exact zoals Opera
**Wide (~180px):** icon + label next to elkaar

**Active indicator (zoals Opera):**
- Gekleurde afgeronde vierkant (rounded square) if achtergrond achter the actieve icon
- Kleur: accent color or Tandem (#4ecca3) or icon-own color for messengers
- NIET border-left — that is te subtiel

**Icon stijlen (zoals Opera):**
- **Utility items:** outline Heroicons, lichtgrijs (#aaa) — is wit bij hover
- **Messenger items:** colored brand icons op ronde/vierkante background (zoals Opera WhatsApp groen, Telegram blauw)

- Klikken utility item = toggle panel open/dicht (rechts or strip)
- Klikken messenger item = toggle webview panel open (rechts or strip)
- Onderaan: ▶/◀ knop for narrow↔wide, ⚙️ for customization

### Panel container (uitschuifbaar, 240px)

- Appears rechts or icon strip, links or browser content
- Inhoud is gerenderd door the actieve item (bijv. Bookmarks)
- Closes bij click op hetzelfde icon or Escape
- Elke phase fills are own panel in

### Sidebar customization mode (⚙️)

- Items be sleepbaar (drag-to-reorder)
- Toggle switches for enable/disable
- Narrow mode toggle
- Opgeslagen via POST `/sidebar/config`

---

## Phase Breakdown

| Phase | Inhoud | Wat Claude Code bouwt |
|------|--------|----------------------|
| **1** | SidebarManager + config API | `src/sidebar/manager.ts` + routes + manager wiring |
| **2** | Shell UI: icon strip + leeg panel container | HTML + CSS + JS for icon strip, panel toggle, animaties |
| **3** | First echte plugin: Bookmarks | Bookmarks panel if bewijs that the system works |

Na Phase 3 is the foundation complete and bouwen we per feature a panel (Workspaces, Messengers, etc.) if losse Claude Code sessions.

---

## Risks / Pitfalls

- **Browser content must verkleinen:** if sidebar panel opengaat, must `.browser-content` mee krimpen. Dit doet the Electron main process (setBounds op the BrowserView). The shell communiceert via IPC welke width the sidebar inneemt.
- **Webview items (Messengers):** hebben own persistente partities — that is Phase Messengers, not hier.
- **Drag-to-reorder:** HTML5 drag-and-drop is voldoende for Phase 2; no library nodig.

---

## Decisions Made

- [x] Sidebar infrastructuur vóór individuele features
- [x] Items: Workspaces, Messengers, Personal News, Pinboards, Bookmarks, History, Downloads
- [x] Personal News: WEL bouwen (Robin's choice 2026-02-28)
- [x] Rechter wingman panel blijft intact — apart system
- [x] Narrow mode (48px icon-only) if **default** — uitklapbaar to breed (with labels)
- [x] Sidebar verbergbaar (collapsed = 0px) via toggle knop + keyboard shortcut
- [x] SVG icons (no emoji)
- [x] Drag-to-reorder in customization mode: ja

### Sidebar states (3 standen)

```
hidden (0px)  →  narrow (48px, icons)  →  wide (48px + label, ~180px)
     ↑ toggle shortcut ↓                       ↑ pijltje / hover ↓
```

- **Hidden:** sidebar fully weg, browser content pakt full width
- **Narrow:** default — only SVG icons, tooltip on hover
- **Wide:** icon + label next to elkaar, uitklapbaar via pijl or hover

### Keyboard shortcut

Shortcut for toggle hidden↔narrow: **Cmd+Shift+B** (⌘⇧B)
(Cmd+B is already Bookmarks toggle in the meeste browsers — ⌘⇧B is vrij in Tandem)

## Open Questions for Robin

- [ ] Shortcut akkoord? Voorstel: **⌘⇧B** (toggle sidebar visible/hidden)
