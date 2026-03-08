# Opera Browser — Fully Onderzoeksrapport
**Date:** 28 februari 2026  
**Goal:** Alles leren or Opera's UI/UX to Tandem Browser te verbeteren  
**Bron:** Opera help.opera.com + opera.com/features  

---

## 1. LAYOUT & STRUCTUUR

Opera has 5 hoofdcomponenten:

```
┌─────────────────────────────────────────────────────────┐
│ MENU BAR (macOS native / Windows Opera menu)             │
├─────────────────────────────────────────────────────────┤
│ [←][→][↻][⌂]  [ COMBINED ADDRESS + SEARCH BAR ]  [⚙]   │
├──┬──────────────────────────────────────────────────────┤
│  │  TAB BAR (at the top, with Tab Islands + emojis)         │
│  ├──────────────────────────────────────────────────────┤
│S │                                                       │
│I │                   WEB VIEW                            │
│D │                                                       │
│E │                                                       │
│B │                                                       │
│A │                                                       │
│R │                                                       │
└──┴──────────────────────────────────────────────────────┘
```

**Sidebar (links, vertical)**
- Workspaces (virtual desktops for tabs)
- Messengers: WhatsApp, Telegram, FB Messenger, Instagram, Discord, Slack, VK, X/Twitter
- Flow (cross-device sync)
- Speed Dial
- Bookmarks
- Personal News
- Tabs (overview panel)
- History
- Downloads
- Extensions
- Settings
- Music Player (detachable)
- Pinboards
- Aria (AI)

The sidebar is **fully aanpasbaar**: drag to reorder, enable/disable per item, narrow mode optie.

---

## 2. TAB MANAGEMENT — Opera's sterkste punt

### 2.1 Tab Islands ⭐⭐⭐
Tabs that vanuit the same page geopend be, be automatisch grouped in a "island":
- Benoembaar (geef a island a name)
- Inklapbaar (save space bij veel tabs)
- Per-island color instellen
- Manual islands also te maken
- Works together with Split Screen

**Verschil with Chrome Tab Groups:** Opera doet the _automatisch_ op basis or context, not handmatig.

**⭐ VISUELE IMPLEMENTATIE (live bestudeerd):**
Simpler than expected! Tab Islands are NOT a special container or bracket. They are tabs that sit closer together with a subtle extra gap between the groups. That is it. Example observed:
- Island 1: [Speed Dial] [Speed Dial] — gap — Island 2: [Gemini] [Add-ons] — gap — Island 3: [GitHub] [Claude]...
- Implementatie in Tandem: track `opener` tabId → group in tab bar via CSS margin/gap between groups. ~1 dag werk.

### 2.2 Workspaces ⭐⭐⭐
Zoals virtuele desktops, but for tabs:
- Multiple workspaces (bv. "Work", "Shopping", "Research")
- Elk workspace has own set tabs
- Tabs verplaatsbaar between workspaces (right-click → Move to Workspace)
- Own name + color + icon per workspace
- Snel schakelen via sidebar or keyboard shortcut
- Workspaces are visible at the top the sidebar

**⭐ VISUELE IMPLEMENTATIE (live bestudeerd):**
Workspaces appear as colored square icons at the top of the sidebar, above all messenger icons. Home icon (house) = default workspace. Other workspaces = colored squares with their own icon. Clicking switches all tabs to that workspace.

**Opera's definitie:** "Organize tab groups in separate customizable workspaces"

### 2.3 Split Screen
- Drag a tab omlaag → choice: links or rechts splitsen
- Or: Shift+select twee tabs → right-click → Create Split Screen
- Twee tabs next to elkaar
- Scheidingslijn clicking to te sluiten
- Works within Tab Islands
- Multiple split screen groups mogelijk

### 2.4 Tab Emojis
- Hover over tab → emoji picker appears
- Visual identificatie or tabs
- An- and uitzetten in Settings

### 2.5 Visual Tab Cycler
- Ctrl+Tab → thumbnail preview popup or alle open tabs
- Hou Ctrl ingedrukt, Tab to te cyclen, loslaten to te kiezen

### 2.6 Tab Preview
- Hover over tab → miniature preview or page content
- Sees content without focus te wisselen
- Optioneel in Settings

### 2.7 Search in Tabs
- Ctrl+Space → zoekbalk that open tabs doorzoekt op keyword
- Superhandig bij 20+ tabs

### 2.8 Pinned Tabs
- Pin tab: blijft always about (overleeft herstart)
- Verplaatst to links or tab bar
- Can not per ongeluk closed be

### 2.9 Save Tabs as Speed Dial Folder
- Right-click tab bar → "Save all tabs as Speed Dial folder"
- Save the whole session for later
- Selectie or tabs also mogelijk

### 2.10 Tab Snoozing
- Send a tab to sleep for later
- Ontbreekt still in Tandem!

---

## 3. SIDEBAR — The hart or Opera's UX

### 3.1 Integrated Messengers ⭐⭐⭐
Opera bouwde alle grote messengers IN the browser if sidebar panels:
- **WhatsApp** — fully functioneel in sidebar panel
- **Telegram** — fully functioneel
- **Facebook Messenger** — fully functioneel
- **Instagram** — DMs + feed
- **Discord** — fully server/channel interface
- **Slack** — workspace + channels
- **VK Messenger** — Russisch social
- **X/Twitter** — timeline + compose
- **Spotify** — muziek speler in sidebar

Elk has notification badges op the icon. The panels openen next to the main browser view without new tab.

### 3.2 Music Player ⭐⭐
- Spotify, Apple Music, YouTube Music, Deezer, Tidal in één plek
- Detachable: can losgemaakt be if floating module
- Overal op scherm te plaatsen (buiten browser)
- Pin to toolbar optie
- Auto-pause if andere media start

### 3.3 My Flow ⭐⭐⭐
Cross-device sync tool:
- Desktop ↔ Mobile Opera (QR code koppeling)
- Stuur links, notes, files heen and weer
- Encrypted
- Real-time sync
- No account needed (device-based pairing)

**Tandem equivalent:** We hebben no cross-device sync. Grote kans hier.

### 3.4 Pinboards ⭐⭐
Visual mood board / collectie tool:
- Sla web content op (links, images, text, video)
- Drag & drop interface
- Multiple boards
- Deelbaar with anderen
- Visual weergave (not if list but if board)

**Tandem equivalent:** No. Mogelijke toevoeging for "research sessions"

---

## 4. AI — ARIA ⭐⭐⭐

Opera's inbuilte AI assistent:
- **Name:** Aria
- **Locatie:** Sidebar panel + address bar shortcut
- **Aangedreven door:** Multiple LLMs (Opera's own AI gateway)
- **Functies:**
  - Chat / Q&A
  - Page samenvatten (actieve tab if context)
  - Text genereren
  - Images genereren (Google Imagen2, op mobile)
  - Zoeken op the web
  - Voice input (spreek you questions in)
  - ChatGPT integratie if extra optie
- **Browser integratie:** Can actieve page read if context
- **Gratis** — inbegrepen in browser, account nodig for sommige functies

**Versus Tandem:** Tandem has this already via the Wingman panel and OpenClaw WebSocket integratie — but Opera's Aria has betere UX (voice, image gen, snellere sidebar toggle).

---

## 5. MEDIA & VIDEO ⭐⭐

### 5.1 Video Popout
- Hover over video → "Popout" knop appears at the top video
- Video is floating window (boven alle andere vensters)
- Aanpasbaar formaat + positie
- Works op YouTube, Twitch, Vimeo, Google Meet, Zoom...
- Transparantie aanpasbaar
- Auto-popout optie (automatisch if you to andere tab gaat)
- Fully playback control in the floating window
- Video blijft spelen in host tab if you floating closes

### 5.2 Lucid Mode — ❌ ONINTERESSANT VOOR TANDEM
Sharpening filter op gecomprimeerde video. Nuttig for media-browsers, compleet irrelevant for ons AI-werktuig. Nooit bouwen.

### 5.3 Video Skip
- Hover over video → "Skip" knop (dubbele pijl icon)
- Springt to the einde or video/advertentie
- Works also if site asks to adblocker out te zetten

---

## 6. PRIVACY & SECURITY

### 6.1 Ad Blocker (inbuilt)
- No extensie nodig
- Blokkeert also: cryptocurrency mining scripts (NoCoin)
- Badge rechts or adresbalk: shows aantal geblokkeerde ads/trackers
- Per-site uitzonderingen
- Multiple blokkeerlijsten

### 6.2 Tracker Blocker
- Analytic scripts, tracking pixels, data collection methoden
- Aparte instelling or ad blocker
- Own lijsten + uitzonderingen

### 6.3 Free VPN (inbuilt)
- Gratis, onbeperkt datavolume
- No logs
- 3 regio's: Europa, Azië, Amerika
- IP verandert to VPN server locatie
- "Bypass for default search engines" optie (zoekresultaten blijven local relevant)
- Toggle in adresbalk

### 6.4 Paste Protection ⭐
Uniek and slim:
- Detecteert if you a IBAN or creditcardnummer kopieert
- Monitort clipboard for 2 minuten (or tot you plakt)
- Waarschuwt if a externe app the clipboard has gewijzigd
- Beschermt tegen clipboard hijacking aanvallen

**Tandem equivalent:** We hebben NetworkShield + OutboundGuard — but no clipboard protection. New idee!

### 6.5 Private Window
- No history, no cookies, no cache
- Default Chromium incognito equivalent

---

## 7. START PAGE & SPEED DIAL

### 7.1 Speed Dial
- Visual thumbnails or favoriete sites
- Organiseerbaar in folders (één thumbnail sleep you op a andere)
- Aanpasbare kolommen
- Geanimeerde thumbnails optional
- Suggested Speed Dials (op basis or browsing)
- Promoted Speed Dials (Opera's advertentie model)
- Sla alle open tabs op if Speed Dial folder

### 7.2 Personal News
- Nieuws feed op start page
- Selecteer onderwerpen and talen
- Not beïnvloed door browsing history (privacy)
- Aanpasbaar via instellingen

### 7.3 Easy Setup Panel
- Knop rechtsboven bij adresbalk
- Quick access tot meest gebruikte instellingen:
  - Themes + wallpapers
  - Pin/unpin sidebar
  - Show/hide bookmarks bar
  - Ad blocker about/out
  - Download locatie
  - Clear browsing data
- Link to full Settings

---

## 8. PRODUCTIVITEIT

### 8.1 Search Pop-up Tool ⭐
Selecteer text op page → popup appears with:
- Zoeken with default search engine (één click)
- Kopiëren
- Delen (macOS)
- **Currency converter:** Selecteer "$30" → shows in jouw valuta
- **Unit converter:** Selecteer "10 miles" → shows in km
- **Time zone converter:** Selecteer "18:30 KST" → shows in jouw tijdzone

**Ondersteunde valuta:** 35+ valuta + 4 cryptocurrencies (BTC, ETH, LTC, BCH)  
**Ondersteunde eenheden:** lb↔kg, °F↔°C, oz↔g, mph↔km/h, mi↔km, enz.

### 8.2 Snapshot ⭐⭐
Inbuilte screenshot tool:
- Capture rectangle, fully scherm, or specifiek element
- Annoteer (text, vormen, arrows)
- Direct delen or save
- Knop in toolbar

**Tandem equivalent:** ⚠️ GEDEELTELIJK — Tandem HAS a snapshot tool with annotatie UI (pen, rechthoek, cirkel, freehand, text, kleuren, blur/pixelate), but the kwaliteit/werking is still work in progress. Verbetering staat op the TODO.

### 8.3 Easy Files
Upload dialoog shows recent gebruikte files at the top — no zoeken in mappenstructuur.

### 8.4 Battery Saver
- Activeer automatisch if laptop unplugged is
- Vermindert activiteit in background tabs
- Pauzeert plugins and animaties
- Herplant JavaScript timers
- Optimaliseert video playback parameters
- Shows geschatte resterende batterij tijd
- 50% langere browsetijd geclaimd

---

## 9. CUSTOMIZATION ⭐⭐

### 9.1 Themes
Drie themes with heel andere vibes:
- **Classic** — custom wallpaper, color kiezen (cool↔warm, calm↔vibrant), light/dark mode
- **Aurora** — geanimeerde dark mode, color: Borealis (rood/roze/paars) or Australis (blauw/groen)
- **Midsommar** — geanimeerde light mode, pastel tot gesatureerd, **MET GELUID**: browser sounds, keyboard sounds, achtergrondmuziek

You can the last 10 geconfigureerde themes save. Snel wisselen via Alt+Shift+T.

### 9.2 Wallpapers
- Custom upload
- Right-click image op website → "Use Image as Wallpaper"
- Community wallpapers op addons.opera.com

### 9.3 Extensions
- Own extensies store (addons.opera.com)
- **Chrome extensies werken also** via addon "Install Chrome extensions"

---

## 10. SYNC & CROSS-DEVICE

### 10.1 Opera Sync
- Sync via Opera account
- Synct: bookmarks, history, passwords, open tabs, settings, Flow inhoud
- Cross-device: desktop ↔ desktop ↔ mobile

### 10.2 My Flow (cross-device clipboard)
- Desktop Opera ↔ Opera Touch (iOS/Android)
- QR code koppeling (no account needed!)
- End-to-end encrypted
- Stuur: links, notes, files, images
- Real-time sync

---

## 11. OVERIGE FEATURES

### Continue Booking / Continue Shopping
- Browser herkent if you op reis/product page bent
- Shows reminder if you terugkomt to the same soort page
- "You was bezig with vlucht boeken to Barcelona..."

### Crypto Wallet (inbuilt)
- DeFi wallet
- Multiple netwerken
- No extensie nodig

### Opera Cashback
- Automatisch cashback bij online shoppen
- Browser detecteert webshops
- Deals/coupons be automatisch toegepast

---

## 12. MOUSE GESTURES & SHORTCUTS

### Mouse Gestures
- Inbuilte gestures (no extensie nodig)
- Right-click + beweging = actie
- Bv. rechts-omlaag = tab sluiten, rechts-links = terug

### Keyboard Shortcuts
- Ctrl+Tab: Visual Tab Cycler
- Ctrl+Space: Search in Tabs  
- Ctrl+F: Find on page
- Ctrl+Shift+E: Extensions
- Alt+P: Settings
- Alt+Shift+T: Cycle through saved themes

---

## 13. DEVELOPER TOOLS

Default Chromium DevTools + extra:
- Experiments page (feature flags)
- Proxy settings (per-browser instellbaar)
- Source code viewer

---

# ANALYSE: WAT KAN TANDEM HIERVAN LEREN?

## 🔴 Hoge prioriteit — Dit must Tandem also hebben

### 1. Tab Islands (automatische tab groepering)
Opera's beste UI innovatie. Tabs that vanuit the same parent geopend are, belong bij elkaar and Opera shows that zien. Dit is extreem intuitive. Tandem zou tabs that via wingman-navigatie geopend are if "wingman session" can group.

**Implementatie:** Track `opener` tab ID for elke new tab in Electron. Automatisch in tab bar group with visual connector.

### 2. Workspaces (virtual tab desktops) ⭐⭐⭐
Dit is a perfecte match for Tandem's use case. Stel you for:
- Workspace "Research" — Wingman works hier autonoom
- Workspace "Work" — Robin's dagelijkse tabs
- Workspace "Projects" — per project a workspace

**Al deels aanwezig:** `/sessions/create` in Tandem doet iets vergelijkbaars but is not visual in the browser UI. Dit verbeteren to echte visual workspaces.

### 3. Tab Preview (hover to content te zien)
Snel even zien wat er in a tab staat without te switchen. Electron can this with `webContents.capturePage()` + thumbnail in shell.

### 4. Search in Tabs
Ctrl+Space → alle open tabs doorzoeken. Trivial te implementeren in Tandem's shell UI.

### 5. Video Popout
Floating video player that boven alles zweeft. Electron can this via `BrowserWindow` with `alwaysOnTop: true` + WebContents capture.

### 6. Snapshot with annotaties — ⚠️ AANWEZIG MAAR WORK IN PROGRESS
Tandem has the tool (pen, rechthoek, cirkel, freehand, text, kleuren, blur/pixelate), but or that also lekker works is a second zaak. Staat op the TODO to te verbeteren/afmaken.

---

## 🟡 Medium prioriteit — Goede inspiratie

### 7. Easy Setup Quick Panel ⭐
Opera's quick settings panel rechtsbovenaan is heel slim. Tandem has a settings panel but that is hidden. A "Quick Panel" knop in the toolbar with the meest gebruikte opties (security shield, wingman panel toggle, new workspace, snapshot) zou the UX enorm verbeteren.

### 8. ~~Lucid Mode~~ — NIET BOUWEN
Sharpening filter op video. Complete onzin for Tandem — we are no media browser. Exists, oninteressant, nooit meer over nadenken.

### 9. Paste Protection
Clipboard monitoring for IBAN/creditcard nummers. Past perfect bij Tandem's security-first approach! 

**Implementatie:** Electron `clipboard` module + listener + alert.

### 10. Tab Emojis
Leuke manier to tabs te identificeren. Snel te implementeren, verbetert UX significant.

### 11. Music Player (detachable module)
Opera's music player can losgemaakt be if floating module. Tandem's Wingman panel can also detachable be made if floating widget — for snellere toegang without sidebar te openen.

### 12. Battery Saver
Reduce background tab activity. Relevant for Tandem — if Wingman tabs in background houdt, can that "sleeping" made be to RAM/CPU te besparen.

---

## 🟢 Lage prioriteit — Nice to have

### 13. Tab Snoozing (already in TODO!)
Snooze a tab for later. Opera has it, and the Tandem TODO already includes it as well.

### 14. Duplicate Tabs Highlighter
Detecteer if you the same URL already open hebt. Trivial te bouwen, nuttiger then you denkt.

### 15. Tab Emojis
Visual tabherkenning via emoji. Snel te implementeren.

### 16. Personal News op start page
Tandem's new tab page is nu leeg. A gecureerd nieuwsoverzicht (RSS feeds?) zou the nuttiger maken.

### 17. Save All Tabs as Collection
Sla alle open tabs op if named collection. Opera doet this in Speed Dial folders. Tandem equivalent: "Research Session save" if named set or URLs.

---

## 💡 ORIGINELE TANDEM IDEEËN geïnspireerd door Opera

### Idee A: "Wingman Workspace"
Speciale workspace for Wingman's autonomous browsing — separated or Robin's own tabs. Wingman opens tabs in are own workspace, Robin sees ze but ze storen are workflow not.

### Idee B: "Flow for Tandem" — Robin ↔ Kees file sync
Opera's Flow stuurt links/files between devices. Tandem equivalent: Robin stuurt a URL to Kees via the browser chat, Kees pakt hem op and navigeert er naartoe. We hebben already the chat, but no "push URL" function.

### Idee C: Tab Islands for Wingman Sessions
Alle tabs that Kees opens in a taak-session → automatisch in a "island" with the taaknaam. Zo zie you always organized: "this are Kees' research tabs for LinkedIn analysis".

### Idee D: Quick Panel in toolbar (Opera-stijl Easy Setup)
Één knop in the toolbar rechtsbovenaan that the meest gebruikte Tandem-functies shows:
- Security shield status + toggle
- New workspace
- Screenshot nemen
- Wingman task starten
- Recent notes/links (Flow)

### Idee E: Paste Protection + Clipboard AI
Tandem has the security voordeel. Uitbreiden: if Robin iets kopieert that op a verdachte site staat, clipboard monitoren and waarschuwen. Or: Kees can clipboard if context use ("ik zie you hebt this gekopieerd, wil you that ik the analyseer?").

---

## CONCLUSIE

Opera is the meest feature-rijke consumer browser and has 30 jaar productontwikkeling. The kernlessen for Tandem:

1. **Tab management is hun sterkste punt** — Tab Islands + Workspaces are briljant. Tandem must this bouwen.
2. **Sidebar if command center** — Opera's sidebar is informatie-dicht but organized. Tandem has this but can the verbeteren (badges, quick panel).
3. **Detachable components** — floating windows (video, music player) are enorm nuttig for productiviteit. Tandem's Wingman panel zou also detachable must are.
4. **Security if feature, not if hinder** — Paste Protection is genius: security that you helpt without you te blokkeren. Exact the Tandem filosofie.
5. **Cross-device sync (Flow)** — we hebben Kees↔Robin communicatie but no "push URL/file to device" feature. That is a gat.

**Grootste kansen for Tandem:**
- Visual Workspaces (UI for existing `/sessions`)
- Tab Islands (automatisch group)
- Video Popout (floating media player)  
- Paste Protection (security win)
- Easy Setup Quick Panel (discoverability)

---

*Rapport made door Kees — 28 februari 2026*  
*Bronnen: help.opera.com/and/latest/ + opera.com/features*
