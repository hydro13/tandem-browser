# Design: Sidebar Infrastructuur (Fundament)

> **Datum:** 2026-02-28
> **Status:** Ter review door Robin
> **Effort:** Medium (3-5 dagen)
> **Prioriteit:** #0 — dit is het fundament voor alle andere sidebar features

---

## Probleem / Motivatie

Tandem heeft momenteel **geen linker sidebar**. Workspaces, Messengers, Pinboards, Personal News, Bookmarks, History en Downloads zijn afzonderlijk ontworpen zonder gedeeld fundament. Als we ze los bouwen, krijgt elke feature zijn eigen ad-hoc icon strip — dat wordt chaos.

Opera heeft dit goed opgelost: één uniforme sidebar met een plug-in systeem. Alle features registreren zich daarin. Configureerbaar, drag-to-reorder, enable/disable.

---

## Huidige layout van Tandem

```
<body> (flex column)
├── .tab-bar            ← tabs + menu knop
├── .toolbar            ← adresbalk, knoppen
├── .bookmarks-bar      ← bookmarks bar
└── .main-layout        ← flex row
      ├── .browser-content   ← flex:1, webviews
      └── .copilot-panel     ← rechts, AI panel
```

**Doel:** `.sidebar` toevoegen als EERSTE kind van `.main-layout`:

```
└── .main-layout        ← flex row
      ├── .sidebar           ← NIEUW: links, 48px (icon) of 240px (panel open)
      ├── .browser-content   ← flex:1, webviews (ongewijzigd)
      └── .copilot-panel     ← rechts, ongewijzigd
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
│ 48px │      .browser-content (flex:1)       │   Copilot   │
│      │                                      │   Panel     │
│ side │                                      │   (rechts)  │
│ bar  │                                      │             │
│      │                                      │             │
└──────┴──────────────────────────────────────┴─────────────┘
```

Met open sidebar panel (bijv. Bookmarks):

```
├──────┬────────────────┬───────────────────────┬───────────┤
│ 48px │  240px panel   │   .browser-content    │  Copilot  │
│ icons│  (bijv. Books) │   (verkleint mee)     │  Panel    │
└──────┴────────────────┴───────────────────────┴───────────┘
```

---

## Sidebar Items (definitieve lijst, besloten 2026-02-28)

> **Besluit 2026-02-28 (na Opera screenshot review):**
> Elke messenger krijgt een **eigen slot** in de icon strip — niet één "Messengers" knop met sub-panel.
> **Twee icon stijlen** (exact zoals Opera): gekleurde brand SVG voor messengers, outline grijs voor utility.
> **Active indicator**: gekleurde afgeronde vierkant achter het icoon (niet border-left).

### Utility items (outline Heroicons, lichtgrijs)

| # | Item | Type | SVG icon | Panel inhoud |
|---|------|------|----------|-------------|
| 1 | Workspaces | Panel | `squares-2x2` (grid) | Workspaces switch/create/delete |
| 2 | Personal News | Panel | `newspaper` | RSS/Atom feeds |
| 3 | Pinboards | Panel | `squares-plus` | Pinboard manager |
| 4 | Bookmarks | Panel | `bookmark` | Bookmark tree |
| 5 | History | Panel | `clock` | Browse history |
| 6 | Downloads | Panel | `arrow-down-tray` | Download manager |

### Messenger items (gekleurde brand SVG, eigen webview per app)

| # | App | Icon kleur | Webview partition |
|---|-----|-----------|------------------|
| 7 | WhatsApp | #25D366 (groen) | `persist:whatsapp` |
| 8 | Telegram | #2AABEE (blauw) | `persist:telegram` |
| 9 | Discord | #5865F2 (paars) | `persist:discord` |
| 10 | Slack | #4A154B (paars/rood) | `persist:slack` |
| 11 | Instagram | gradient #E1306C→#F77737 | `persist:instagram` |
| 12 | X (Twitter) | #000000 (zwart) | `persist:x` |

> Icon stijl: Heroicons outline (MIT) voor utility. Brand SVG logos voor messengers (simpele herkenbare shapes, eigen kleuren).

**Niet in sidebar:** Copilot AI Panel (blijft rechts, eigen toggle knop)

---

## Technische Architectuur

### Item Types

```typescript
type SidebarItemType = 'panel' | 'webview';

interface SidebarItem {
  id: string;           // 'workspaces' | 'messengers' | 'news' | etc.
  label: string;        // "Workspaces"
  icon: string;         // emoji of SVG path
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

### Opslag
- Config: `~/.tandem/sidebar-config.json`
- Standaard volgorde: Workspaces → Messengers → Personal News → Pinboards → Bookmarks → History → Downloads

### Nieuwe bestanden

| Bestand | Verantwoordelijkheid |
|---------|---------------------|
| `src/sidebar/manager.ts` | `SidebarManager` — config load/save, item registratie |
| `src/api/routes/sidebar.ts` | REST endpoints voor config + item status |

### Bestaande bestanden aanpassen

| Bestand | Aanpassing | Functie |
|---------|-----------|---------|
| `src/api/server.ts` | `sidebarManager` toevoegen | `TandemAPIOptions`, `class TandemAPI` |
| `src/main.ts` | Manager instantiëren + cleanup | `startAPI()`, `app.on('will-quit')` |
| `shell/index.html` | Sidebar HTML toevoegen | `<!-- Main layout -->` sectie |
| `shell/css/main.css` | Sidebar CSS | `.main-layout` sectie |

---

## API Endpoints

| Methode | Endpoint | Beschrijving |
|---------|---------|--------------|
| GET | `/sidebar/config` | Huidige config (items + volgorde + narrowMode) |
| POST | `/sidebar/config` | Config updaten (volgorde, narrowMode) |
| POST | `/sidebar/items/:id/toggle` | Item enable/disable |
| POST | `/sidebar/items/:id/activate` | Panel openen/sluiten |
| GET | `/sidebar/items` | Lijst alle geregistreerde items |

---

## Shell UI Gedrag

### Icon strip — 3 standen

**Hidden (0px):** volledig verborgen, toggle via ⌘⇧B
**Narrow (48px, standaard):** alleen icoon, geen labels, tooltip on hover — exact zoals Opera
**Wide (~180px):** icoon + label naast elkaar

**Active indicator (zoals Opera):**
- Gekleurde afgeronde vierkant (rounded square) als achtergrond achter het actieve icoon
- Kleur: accent kleur van Tandem (#4ecca3) of icon-eigen kleur voor messengers
- NIET border-left — dat is te subtiel

**Icon stijlen (zoals Opera):**
- **Utility items:** outline Heroicons, lichtgrijs (#aaa) — wordt wit bij hover
- **Messenger items:** gekleurde brand icons op ronde/vierkante background (zoals Opera WhatsApp groen, Telegram blauw)

- Klikken utility item = toggle panel open/dicht (rechts van strip)
- Klikken messenger item = toggle webview panel open (rechts van strip)
- Onderaan: ▶/◀ knop voor narrow↔wide, ⚙️ voor customization

### Panel container (uitschuifbaar, 240px)

- Verschijnt rechts van icon strip, links van browser content
- Inhoud wordt gerenderd door het actieve item (bijv. Bookmarks)
- Sluit bij klik op hetzelfde icoon of Escape
- Elke fase vult zijn eigen panel in

### Sidebar customization mode (⚙️)

- Items worden sleepbaar (drag-to-reorder)
- Toggle switches voor enable/disable
- Narrow mode toggle
- Opgeslagen via POST `/sidebar/config`

---

## Fase-opdeling

| Fase | Inhoud | Wat Claude Code bouwt |
|------|--------|----------------------|
| **1** | SidebarManager + config API | `src/sidebar/manager.ts` + routes + manager wiring |
| **2** | Shell UI: icon strip + leeg panel container | HTML + CSS + JS voor icon strip, panel toggle, animaties |
| **3** | Eerste echte plugin: Bookmarks | Bookmarks panel als bewijs dat het systeem werkt |

Na Fase 3 is het fundament klaar en bouwen we per feature een panel (Workspaces, Messengers, etc.) als losse Claude Code sessies.

---

## Risico's / Valkuilen

- **Browser content moet verkleinen:** als sidebar panel opengaat, moet `.browser-content` mee krimpen. Dit doet de Electron main process (setBounds op de BrowserView). De shell communiceert via IPC welke breedte de sidebar inneemt.
- **Webview items (Messengers):** hebben eigen persistente partities — dat is Fase Messengers, niet hier.
- **Drag-to-reorder:** HTML5 drag-and-drop is voldoende voor Fase 2; geen library nodig.

---

## Beslissingen genomen

- [x] Sidebar infrastructuur vóór individuele features
- [x] Items: Workspaces, Messengers, Personal News, Pinboards, Bookmarks, History, Downloads
- [x] Personal News: WEL bouwen (Robin's keuze 2026-02-28)
- [x] Rechter copilot panel blijft intact — apart systeem
- [x] Narrow mode (48px icon-only) als **standaard** — uitklapbaar naar breed (met labels)
- [x] Sidebar verbergbaar (collapsed = 0px) via toggle knop + keyboard shortcut
- [x] SVG icons (geen emoji)
- [x] Drag-to-reorder in customization mode: ja

### Sidebar states (3 standen)

```
hidden (0px)  →  narrow (48px, iconen)  →  wide (48px + label, ~180px)
     ↑ toggle shortcut ↓                       ↑ pijltje / hover ↓
```

- **Hidden:** sidebar volledig weg, browser content pakt volledige breedte
- **Narrow:** standaard — alleen SVG iconen, tooltip on hover
- **Wide:** icon + label naast elkaar, uitklapbaar via pijl of hover

### Keyboard shortcut

Shortcut voor toggle hidden↔narrow: **Cmd+Shift+B** (⌘⇧B)
(Cmd+B is al Bookmarks toggle in de meeste browsers — ⌘⇧B is vrij in Tandem)

## Open vragen voor Robin

- [ ] Shortcut akkoord? Voorstel: **⌘⇧B** (toggle sidebar zichtbaar/verborgen)
