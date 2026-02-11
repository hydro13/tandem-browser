# Tandem Browser — TODO & Roadmap

> Twee trappen, één fiets. 🚲

---

## Phase 1: Core ✅ DONE
> Fundament staat. Browser werkt, API draait, stealth is actief.

- [x] Electron browser met Chromium webview
- [x] HTTP API op localhost:8765
- [x] 13 endpoints: navigate, click, type, screenshot, page-content, page-html, execute-js, cookies, scroll, wait, links, forms, copilot-alert, status
- [x] Anti-detect stealth layer (UA, headers, navigator patches)
- [x] Persistent sessions (`persist:tandem` — cookies overleven restart)
- [x] Copilot alert systeem (macOS notification + in-browser overlay)
- [x] URL bar met smart input (zoeken of navigeren)
- [x] Donker thema UI

---

## Phase 2: Tandem Experience 🔄 ACTIEF
> Dit is wat Tandem Tandem maakt. Zonder dit is het gewoon weer een browser.

### 2.1 Tabs & Tab Groups ✅ DONE
- [x] Meerdere tabs openen/sluiten/wisselen
- [x] Tab bar met favicon + titel
- [x] Tab groups met kleuren (bijv. 🔵 Werk, 🟢 Research)
- [x] API: `POST /tabs/open`, `POST /tabs/close`, `GET /tabs/list`
- [x] API: `POST /tabs/group` — tabs groeperen
- [x] API: `POST /tabs/focus` — tab activeren
- [x] Keyboard shortcuts: Cmd+T (nieuw), Cmd+W (sluit), Cmd+1-9 (wissel)
- [x] Click/type herschreven naar sendInputEvent (Event.isTrusted = true)
- [x] Humanized delays: gaussian random timing (80-300ms click, 30-120ms typing)

### 2.2 Split Window + Kees Paneel ✅ DONE
- [x] Rechter paneel: Kees control panel (resizable)
- [x] Activity log — real-time feed van Robin's acties (navigatie, clicks, scrolls)
- [x] Chat interface — Robin typt/praat, Kees antwoordt
- [x] Screenshot preview — laatste snapshots met annotaties
- [x] Toggle: Cmd+K paneel open/dicht
- [x] API: `GET /activity-log` — stream van user events
- [x] API: `POST /panel/toggle`, `GET/POST /chat`

### 2.3 Draw/Annotatie Tool 🖍️ ✅ DONE
- [x] Transparante canvas overlay bovenop webview
- [x] Tools: pijlen, cirkels, rechthoeken, vrije lijn, tekst labels
- [x] Kleuren: rood (default), geel, groen, blauw
- [x] Toggle: Cmd+D draw mode aan/uit
- [x] "📸 Snap voor Kees" knop — screenshot MET annotaties
- [x] Annotaties verdwijnen na snap (of handmatig wissen)
- [x] API: `GET /screenshot/annotated` — laatste geannoteerde screenshot
- [x] API: `POST /screenshot/annotated`, `POST /draw/toggle`, `GET /screenshots`
- [x] Opslag: app userData/screenshots/ met timestamp

### 2.4 Voice Input 🎙️ ✅ DONE
- [x] Web Speech API integratie (nl-BE)
- [x] Hotkey: Cmd+M → start/stop luisteren
- [x] Live transcriptie in Kees paneel
- [x] Auto-send na stilte (of handmatig met Enter)
- [x] Visuele indicator: 🔴 pulserende dot wanneer actief
- [ ] Combi: voice + annotated screenshot = één bericht naar Kees
- [x] API: `POST /voice/start`, `POST /voice/stop`, `GET /voice/status`
- [x] Bugfix: voice auto-restart na onend (continuous listening 10s+)
- [x] Verbeterde visuele feedback: grotere pulserende indicator, "Spreek nu..."
- [ ] Later: Whisper lokaal als offline fallback

### 2.5 Live Co-Pilot Feed 👁️ 🔄 STARTED
- [x] Event tracking: elke navigatie, click, scroll, form input → log
- [ ] DOM change detection — meld wat er veranderd is
- [x] Auto-snapshot bij belangrijke events (navigatie) — disabled by default
- [x] API: `GET /activity-log` — polling endpoint met timestamps
- [ ] API: `WS /watch/live` — WebSocket stream (later)

### 2.6 Kees Chat Koppeling 💬
- [ ] Chat paneel berichten doorsturen naar OpenClaw (via webhook of polling)
- [x] Kees kan antwoorden terugsturen via `POST /chat` → verschijnt in paneel
- [x] Chat history persistent (overleven restart) — ~/.tandem/chat-history.json
- [x] Chat UI: Robin rechts (groen), Kees links (accent), timestamps
- [x] Typing indicator als Kees "denkt" — `POST /chat/typing`
- [x] Chat auto-refresh polling (elke 2 seconden)
- [x] Auto-scroll naar nieuwste bericht
- [ ] Combi: annotated screenshot + voice/tekst = één bericht naar Kees
- [ ] Notificatie als Kees antwoordt terwijl paneel dicht is

### 2.7 Screenshot Pipeline 📸 ✅ DONE
- [x] Fix: Snap voor Kees knop maakt composiet screenshot (webview + canvas overlay)
- [x] Screenshot → clipboard (Electron clipboard.writeImage)
- [x] Screenshot → bestand opslaan (~/Pictures/Tandem/)
- [x] Cmd+Shift+S quick screenshot werkt zonder draw mode
- [x] Clickable thumbnails in Screenshots tab (opent full-size viewer)
- [ ] Screenshot → Apple Photos library (via `osascript` / Photos framework)
- [ ] Screenshot → Google Photos (via API, instelbaar)
- [ ] Configuratiescherm: aan/uit per bestemming
  - [x] ☑️ Clipboard (altijd aan)
  - [x] ☑️ Lokale folder: ~/Pictures/Tandem/
  - [ ] ☑️ Apple Photos
  - [ ] ☑️ Google Photos
- [x] Preview in Kees paneel (Screenshots tab) — base64 preview
- [x] Bestandsnaam: `tandem-{url-slug}-{timestamp}.png`

### 2.8 Settings/Config Scherm ⚙️ ✅ DONE
- [x] Instellingen pagina (tandem://settings)
- [x] Screenshot bestemmingen configureren
- [x] Startpagina kiezen
- [x] Stealth level (low/medium/high)
- [x] Kees paneel positie (links/rechts)
- [x] Voice input taal (nl-BE, en-US, etc.)
- [x] Behavioral learning aan/uit
- [x] Data export/import
- [x] Opslag in ~/.tandem/config.json
- [x] ConfigManager class (src/config/manager.ts)
- [x] API: GET /config, PATCH /config (partial update)
- [x] Cmd+, shortcut voor instellingen
- [x] Kees badge rechts-klik → instellingen
- [x] Behavioral data wissen + statistieken
- [x] Data export/import/wipe met bevestiging

### 2.9 Custom New Tab — Kees.ai 🧀 ✅ DONE
- [x] Custom new-tab page (shell/newtab.html) in plaats van DuckDuckGo
- [x] Kees chat widget in new-tab (bottom-right, collapsible)
- [x] Zoekbalk: DuckDuckGo zoeken of URL navigatie
- [x] Quick links: LinkedIn, GitHub, Kanbu, ClaroNote, DuckDuckGo, Gmail, YouTube, Reddit
- [x] Recente tabs overzicht (via API)
- [x] Tandem branding + donker thema
- [x] URL bar leeg bij nieuwe tab
- [ ] Snelle acties: "wat staat er op mijn agenda?" (later)
- [ ] Weerwidget (Herent) (later)
- [ ] Instelbare quick links via config (later)

### 2.8 Behavioral Learning 🧬
- [x] Observation layer: track mouse, clicks, scroll, keypress via Electron events
- [x] Raw data opslag: `~/.tandem/behavior/raw/{date}.jsonl`
- [x] API: `GET /behavior/stats` — basis statistieken
- [ ] Profiel compiler: statistische analyse na ~1 week data
- [ ] Typing bigram timing model (per toets-paar interval)
- [ ] Mouse path Bézier curve templates
- [ ] Scroll pattern model (snelheid + pauze distributie)
- [ ] Click hesitatie model (hover → click delay)
- [ ] Dagritme variatie (correlatie tijd ↔ snelheid)
- [ ] Per-site gedragsclusters
- [ ] Replay engine: sample uit profiel bij automated acties
- [ ] Profiel: `~/.tandem/behavior/robin-profile.json`
- [ ] Fallback: gaussian defaults als profiel nog leeg

---

## Phase 3: Kees' Brein 🧠
> Dit maakt Kees slim. Niet alleen meekijken maar onthouden, begrijpen, en zelfstandig handelen.

### 3.1 Site Memory — Geheugen per website ✅ DONE
- [x] `~/.tandem/site-memory/{domain}.json` — structured data per site
- [x] Auto-extract bij bezoek: titel, meta, key content, forms, links, text preview
- [x] Diff detectie: wat is veranderd sinds vorige keer?
- [x] API: `GET /memory/sites`, `GET /memory/site/{domain}`, `GET /memory/site/{domain}/diff`
- [x] Doorzoekbaar: `GET /memory/search?q=...`
- [x] Track: eerste bezoek, laatste bezoek, aantal bezoeken, totale tijd

### 3.2 Scheduled Watches — Ogen die altijd aan staan ✅ DONE
- [x] Watch list: URLs + check interval + change detection (SHA-256 hash)
- [x] Background checking via verborgen BrowserWindow (niet zichtbaar voor Robin)
- [x] Notificatie bij verandering (macOS notificatie + copilot alert)
- [x] Max 20 watches (voorkom overload)
- [x] API: `POST /watch/add`, `GET /watch/list`, `DELETE /watch/remove`, `POST /watch/check`
- [ ] Cron integratie: "check LinkedIn elke ochtend om 9:00"
- [ ] Configureerbaar: wat telt als "veranderd"? (text diff, element, screenshot diff)

### 3.3 Headless Mode — Kees browst solo ✅ DONE
- [x] Verborgen BrowserWindow (show: false) voor background browsing
- [x] Dezelfde stealth patches als main window
- [x] Dezelfde persist:tandem partition (cookies gedeeld)
- [x] Captcha detectie → auto-show + copilot alert
- [x] Login redirect detectie → auto-show + alert
- [x] Robin kan headless tab "zichtbaar" maken / verbergen
- [x] API: `POST /headless/open`, `GET /headless/content`, `GET /headless/status`, `POST /headless/show`, `POST /headless/hide`, `POST /headless/close`

### 3.4 Form Memory — Alle formulieren onthouden ✅ DONE
- [x] Track elke form submit: welke velden, welke waarden
- [x] `~/.tandem/forms/{domain}.json`
- [x] Auto-suggest bij volgende bezoek (via `POST /forms/fill`)
- [x] "Kees, vul dit in" → formulier invullen met opgeslagen data
- [x] Gaat verder dan passwords: adressen, telefoonnummers, voorkeuren
- [x] API: `GET /forms/memory`, `GET /forms/memory/{domain}`, `POST /forms/fill`, `DELETE /forms/memory/{domain}`
- [x] Sensitive data (password velden) AES-256-GCM encrypted
- [x] Encryption key auto-generated in `~/.tandem/config.json`

### 3.5 Context Bridge — Tandem ↔ OpenClaw ✅ DONE
- [x] Alles wat Kees leest in Tandem → beschikbaar via API
- [x] Web geheugen persistent: snapshots in `~/.tandem/context/`
- [x] Doorzoekbaar: `GET /context/search?q=...`
- [x] API: `GET /context/recent`, `GET /context/search`, `GET /context/page`, `POST /context/note`
- [x] Auto-records context snapshot bij elke pagina load
- [ ] Tandem als OpenClaw skill: `tandem.read("linkedin.com/in/robinwaslander")` (later)

### 3.6 Bidirectioneel Stuur — Kees navigeert, Robin ziet ✅ DONE
- [x] Kees opent een pagina → verschijnt live in Robin's browser
- [x] Tab.source tracking: 'robin' | 'kees'
- [x] Robin kan overnemen, Kees kan terugnemen via `POST /tabs/source`
- [x] Visuele indicator: 🧀/👤 via `tab-source-changed` IPC event
- [x] `POST /tabs/open` met `source: "kees"` → tab krijgt kees indicator
- [x] `POST /navigate` auto-marks tab als kees-controlled
- [x] Activity log toont source per actie
- [x] Renderer UI: 🧀/👤 emoji in tab bar + activity source coloring

### 3.7 PiP Mode — Always-on-top mini-venster ✅ DONE
- [x] Klein floating venster (Electron BrowserWindow, alwaysOnTop, 350x250, frameless)
- [x] Laatste activiteit (3 recente events) + quick command input + status indicators
- [x] Drag anywhere op scherm (hele venster is drag area behalve input)
- [x] Toggle: Cmd+P
- [x] Sluit NIET als main window minimized wordt (apart BrowserWindow)
- [x] API: `POST /pip/toggle`, `GET /pip/status`
- [x] Communiceert via localhost API (niet IPC)

### 3.8 Network Inspector — Kees begrijpt het verkeer ✅ DONE
- [x] Request logging via Electron `session.webRequest` API (NIET in webview — veilig!)
- [x] Per request: url, method, status, contentType, size, timestamp, initiator, domain
- [x] Groepering per domein met request counts
- [x] Automatische API discovery (JSON responses, /api/ paths, /v1-3/, /graphql, /rest/)
- [x] In-memory (laatste 1000 requests) + flush naar `~/.tandem/network/{domain}.json`
- [x] API: `GET /network/log`, `GET /network/apis`, `GET /network/domains`, `DELETE /network/clear`
- [ ] Export: HAR format (later)

---

## Phase 4: Echte Browser Features 📦 ✅ DONE
> Van "tool" naar "dagelijkse browser".

### 4.1 Chrome Data Import ✅ DONE
- [x] Chrome bookmarks import (JSON parse)
- [x] Chrome history import (SQLite via better-sqlite3)
- [x] Chrome cookies import (met Keychain warning — encrypted values niet importeerbaar)
- [x] API: POST /import/chrome/bookmarks, history, cookies + GET /import/chrome/status
- [ ] Firefox import (optioneel, later)

### 4.2 Bookmarks Manager ✅ DONE
- [x] BookmarkManager class met CRUD + folder support
- [x] Bookmarks bar in shell (toggle-baar, onder URL bar)
- [x] Star icon in URL bar (★/☆) — toont of pagina gebookmarked is
- [x] Cmd+D = bookmark huidige pagina
- [x] Draw mode verplaatst naar Cmd+Shift+D
- [x] API: GET /bookmarks, POST /add, DELETE /remove, PUT /update, GET /search, GET /check

### 4.3 History Manager ✅ DONE
- [x] Auto-track elke navigatie → history entry
- [x] Opslag: ~/.tandem/history.json (max 10000 entries, FIFO)
- [x] Zoekfunctie
- [x] Cmd+Y = open history page (shell/history.html)
- [x] API: GET /history, GET /history/search, DELETE /history/clear

### 4.4 Download Manager ✅ DONE
- [x] Hook into Electron session.on('will-download')
- [x] Track: filename, url, size, progress, status
- [x] macOS notificatie bij download complete
- [x] API: GET /downloads, GET /downloads/active

### 4.5 Find in Page ✅ DONE
- [x] Cmd+F → zoekbalk bovenaan webview
- [x] Webview findInPage() API
- [x] Volgende/vorige match, match count
- [x] Escape = sluiten

### Browser Basics — TODO
- [ ] Zoom in/out (Cmd+/-)
- [ ] Print / PDF export

### Wachtwoorden & Autofill — TODO
- [ ] Lokale password database (SQLite + AES-256-GCM)
- [ ] Master password bij eerste keer
- [ ] Autofill login formulieren
- [ ] Password generator
- [ ] API: `GET /passwords/suggest` — credentials voor huidige site
- [ ] Nooit cloud sync — alles lokaal

---

## Phase 4: Advanced Stealth 🔒
> Onzichtbaar voor elke detectie.

- [ ] Canvas fingerprint randomisatie
- [ ] WebGL renderer/vendor spoofing
- [ ] Font enumeration masking
- [ ] AudioContext fingerprint spoofing
- [ ] Proxy support (SOCKS5/HTTP, per-tab of globaal)
- [ ] Request interception (headers wijzigen/blokkeren)
- [ ] TLS/JA3 fingerprint matching
- [ ] Timing humanisatie (random delays 50-200ms bij automated actions)
- [ ] Screen resolution spoofing
- [ ] Battery API masking
- [ ] Geolocation spoofing (optioneel)

---

## Phase 5: OpenClaw Integratie 🤖
> Tandem als native tool voor Kees.

- [ ] OpenClaw Skill package (`tandem-browser` skill)
- [ ] Smart content extraction (artikel, profiel, product → structured JSON)
- [ ] Turndown integration (HTML → clean markdown)
- [ ] Multi-step workflow engine (keten van acties)
- [ ] Login state manager (per-site sessies)
- [ ] Session recording & replay
- [ ] Scheduled browsing (cron: check elke ochtend of X veranderd is)

---

## Phase 5.8: Help & Keyboard Shortcuts ⌨️
- [ ] `shell/help.html` — Help pagina met alle features uitgelegd
- [ ] **Cmd+?** → Keyboard shortcuts popup (overlay, niet nieuwe pagina)
- [ ] Shortcuts overlay: alle shortcuts gegroepeerd (Navigatie, Kees, Tools, Browser)
- [ ] Zoekbaar: typ in overlay om shortcut te vinden
- [ ] Help pagina: feature overzicht, tips, "wat kan Kees allemaal?"
- [ ] Eerste keer openen: auto-toon shortcuts overlay (onboarding)
- [ ] Link naar help vanuit Settings scherm

---

## Phase 6: Polish & Distribution 🚀
> Van project naar product.

- [ ] Multi-profile support (gescheiden browse contexten)
- [ ] Keyboard shortcuts overzicht (Cmd+?)
- [ ] Themes (donker/licht/custom)
- [ ] Auto-updater (electron-updater)
- [ ] DMG build (macOS)
- [ ] AppImage build (Linux)
- [ ] Documentatie site
- [ ] Onboarding flow (eerste keer openen)

---

## Architectuur Notities

```
~/Documents/dev/tandem-browser/
├── src/
│   ├── main.ts              # Electron main process
│   ├── preload.ts            # Context bridge
│   ├── api/server.ts         # Express API (localhost:8765)
│   └── stealth/manager.ts    # Anti-detect patches
├── shell/
│   └── index.html            # Browser UI
├── PROJECT.md                # Visie & architectuur
├── TODO.md                   # ← dit bestand
├── README.md                 # Quick start & API docs
└── package.json
```

**GitHub:** `hydro13/tandem-browser` (privé)
**Stack:** Electron + TypeScript + Express
**Filosofie:** Robin = ogen & handen, Kees = brein & motor

---

*Laatst bijgewerkt: 11 februari 2026*
