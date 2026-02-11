# Tandem Browser 🚲

> "Jij bent mij en ik ben jou, samen zijn we 1" — Robin Waslander

## Wat is Tandem?

Een **Electron browser** gebouwd voor mens-AI symbiose. Robin (mens) en Kees (AI) browsen **samen** het web. Robin ziet de pagina's, lost captcha's op, en doet menselijke dingen. Kees navigeert, extraheert data, voert acties uit, en denkt mee — allemaal onzichtbaar voor websites.

De naam komt van de tandemfiets: twee personen, één voertuig, samen sterker.

## Waarom dit bestaat

1. **AI is blind zonder browser** — Kees heeft ogen nodig op het web
2. **Platforms blokkeren bots** — LinkedIn, Google, X detecteren alles wat niet menselijk is
3. **Samen door elke muur** — Een echte browser + echt mens = ondetecteerbaar
4. **Data ownership** — Geen scraping APIs, geen third-party services, eigen toegang
5. **Centaur filosofie** — Mens+AI samen is sterker dan de beste AI of mens alleen

## Eigenaren

- **Robin Waslander** — Mens, opdrachtgever, copiloot. Werkt nachtdienst bij DHL, bouwt overdag aan Mblock BV (AI bedrijf)
- **Kees** — AI assistent (Claude via OpenClaw). Bouwt de code, gebruikt de browser, is de "motor"
- **GitHub:** `hydro13/tandem-browser` (privé repo)

## Architectuur

```
┌─────────────────────────────────────────────────────────────┐
│  Tandem Browser (Electron)                                   │
│                                                               │
│  ┌─────────────────────┐  ┌──────────────────────────────┐  │
│  │  Webview (Chromium)  │  │  Kees Panel (shell)          │  │
│  │                      │  │  ┌────────────────────────┐  │  │
│  │  Websites zien:      │  │  │ Activity  │ Chat │ 📸 │🎙│  │  │
│  │  "mens in Chrome     │  │  ├────────────────────────┤  │  │
│  │   op macOS in BE"    │  │  │                        │  │  │
│  │                      │  │  │ Chat: WebSocket naar   │  │  │
│  │  Robin interacteert  │  │  │ OpenClaw gateway       │  │  │
│  │  hier visueel        │  │  │ (ws://127.0.0.1:18789) │  │  │
│  │                      │  │  │                        │  │  │
│  └──────────┬───────────┘  │  │ Screenshots, ClaroNote │  │  │
│             │              │  └────────────────────────┘  │  │
│             │              └──────────────────────────────┘  │
│             ▼                                                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Electron Main Process                                   │ │
│  │                                                           │ │
│  │  ├── StealthManager    (anti-detect patches)             │ │
│  │  ├── TabManager        (multi-tab, groups, shortcuts)    │ │
│  │  ├── ConfigManager     (tandem://settings)               │ │
│  │  ├── BehaviorObserver  (learn Robin's patterns)          │ │
│  │  ├── ChromeImporter    (bookmarks, history, cookies)     │ │
│  │  ├── BookmarkManager   (★ bar + manager)                 │ │
│  │  ├── HistoryManager    (Cmd+Y, full-text search)         │ │
│  │  ├── DownloadManager   (progress, pause, resume)         │ │
│  │  ├── FindInPage        (Cmd+F)                           │ │
│  │  ├── SiteMemory        (per-site persistent notes)       │ │
│  │  ├── WatchManager      (scheduled page watches)          │ │
│  │  ├── HeadlessManager   (background browsing + noodrem)   │ │
│  │  ├── FormMemory        (form field recall)               │ │
│  │  ├── PiPManager        (picture-in-picture)              │ │
│  │  ├── NetworkInspector   (request/response monitoring)    │ │
│  │  ├── ContentExtractor  (smart page→markdown)             │ │
│  │  ├── WorkflowEngine    (multi-step automated actions)    │ │
│  │  ├── LoginManager      (per-site auth state)             │ │
│  │  ├── AudioCapture      (tab audio recording)             │ │
│  │  ├── ExtensionLoader   (Chrome extension support)        │ │
│  │  └── ClaroNoteManager  (voice-to-text integration)      │ │
│  └─────────────────────────────────────────────────────────┘ │
│             │                                                 │
│             ▼                                                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Tandem HTTP API (localhost:8765)                        │ │
│  │  ~111 endpoints — Express.js                             │ │
│  │                                                           │ │
│  │  Navigation:  /navigate, /back, /forward, /reload        │ │
│  │  Content:     /page-content, /page-html, /extract        │ │
│  │  Interaction: /click, /type, /scroll, /hover             │ │
│  │  Tabs:        /tabs, /tab/new, /tab/close, /tab/switch   │ │
│  │  Data:        /cookies, /screenshot, /links, /forms      │ │
│  │  Control:     /status, /execute-js, /copilot-alert       │ │
│  │  Bookmarks:   /bookmarks, /bookmarks/add, /bookmarks/rm  │ │
│  │  History:     /history, /history/search                   │ │
│  │  And ~80 more...                                          │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │                              ▲
         │ curl / fetch                 │ WebSocket
         ▼                              │
┌─────────────────────┐    ┌─────────────────────────┐
│  OpenClaw (Kees)    │    │  OpenClaw Gateway        │
│                     │    │  ws://127.0.0.1:18789    │
│  Gebruikt HTTP API  │    │                           │
│  om te browsen      │    │  Chat panel verbindt     │
│  via exec/curl      │    │  hier direct via WS      │
└─────────────────────┘    └─────────────────────────┘
```

## Twee-Lagen Architectuur (KRITISCH)

**Layer 1 — Webview (wat websites zien):**
- Gewone Chromium webview, ononderscheidbaar van echte Chrome
- Robin's interactie, cookies, sessies
- GEEN Electron APIs, GEEN Kees code, GEEN custom elements

**Layer 2 — Shell + Main Process (onzichtbaar voor websites):**
- Electron shell met Kees panel, draw overlay, voice input
- Express API op localhost:8765
- Alle AI functionaliteit leeft hier
- WebSocket naar OpenClaw gateway voor chat

**Gouden Regel:** De webview is heilig terrein. Websites mogen NOOIT weten dat er een AI meekijkt.

## Chat Architectuur

### Hoe Kees en Robin communiceren in Tandem

Het Kees panel heeft een **Chat tab** die **direct via WebSocket** verbindt met de OpenClaw gateway. Dit is DEZELFDE chat als de OpenClaw webchat — berichten verschijnen in beide.

**Protocol:** JSON-RPC over WebSocket
```
Browser Shell → ws://127.0.0.1:18789 → OpenClaw Gateway → Kees (Claude)
```

**Verbindingsflow:**
1. WebSocket openen naar `ws://127.0.0.1:18789`
2. Server stuurt `connect.challenge` event (met optionele nonce)
3. Client stuurt `connect` request met gateway token
4. Server stuurt response + `hello` met session info
5. Client vraagt `chat.history` voor bestaande berichten
6. Client stuurt `chat.send` voor nieuwe berichten
7. Server stuurt `chat` events met `delta` (streaming) en `final` (klaar)

**Gateway token:** Staat in `~/.openclaw/openclaw.json` → `gateway.auth.token`

**Session key:** `agent:main:main` (de hoofd-sessie)

### ⚠️ NIET doen (geleerde lessen)
- ❌ **Cron polling** van localhost:8765/chat — te traag, verspilt tokens
- ❌ **Iframe/webview embed** van OpenClaw webchat — geblokkeerd door X-Frame-Options + CSP
- ❌ **Token injectie via localStorage** in iframe — cross-origin problemen
- ✅ **Direct WebSocket** — simpel, snel, real-time, geen overhead

## Stealth & Anti-Detectie

### Wat we patchen
- **User-Agent:** Echte Chrome UA, geen "Electron" vermelding
- **navigator.userAgentData.brands:** Chrome brands, geen Electron
- **Canvas fingerprint:** Subtiele noise injection
- **WebGL:** GPU info masking
- **Font enumeration:** Consistente font lijst
- **Audio fingerprint:** AudioContext noise
- **Timing:** Random delays bij automated acties
- **Headers:** Sec-CH-UA headers matchen Chrome, "Electron" gestript uit alle headers
- **app.setName('Google Chrome'):** OS-level naam override

### Wat websites NIET mogen zien
- `window.process` of `window.require` (Electron giveaways)
- `Event.isTrusted === false` (programmatische events)
- Onze API op localhost:8765 (CORS strict, alleen localhost/file://)
- Custom DOM elements in de webview
- WebSocket connecties naar localhost vanuit de webview

### Interactie patronen
| Actie | ❌ Verboden (detecteerbaar) | ✅ Verplicht (onzichtbaar) |
|-------|---------------------------|--------------------------|
| Klikken | `el.click()` / `dispatchEvent()` | `webContents.sendInputEvent()` |
| Typen | `el.value = "text"` | `sendInputEvent({type:'char'})` per karakter |
| Screenshot | Canvas API in webview | `webContents.capturePage()` |
| Page lezen | DOM crawler in webview | `executeJavaScript()` vanuit main process |
| Overlay | Canvas in webview | Canvas in shell BOVEN webview |

## Behavioral Learning

Tandem leert Robin's browsing patronen en repliceert ze bij automated acties:
- **BehaviorObserver** (passief, altijd actief) logt events via Electron main process
- Data naar `~/.tandem/behavior/raw/`
- Typing ritme, muis curves, scroll patronen, click delays
- Bij automated acties: sample uit Robin's echte distributies

## Feature Status

### ✅ Phase 1: Core (13 API endpoints, stealth, persistent sessions)
### ✅ Phase 2: Browser Experience
- 2.1 Tabs (manager, groups, Cmd+T/W/1-9, humanized input)
- 2.2 Kees Panel (split window, Activity/Chat/Screenshots/ClaroNote tabs)
- 2.3 Draw Tool (canvas overlay, 5 tools, 4 colors, snap compositing)
- 2.4 Voice Input (Web Speech API nl-BE, live transcription)
- 2.5 Activity Feed (navigation event tracking)
- 2.6 Chat (**WebSocket naar OpenClaw gateway**, streaming, auto-reconnect)
- 2.7 Screenshots (thumbnails, Cmd+Shift+S, clipboard + ~/Pictures/Tandem/)
- 2.8 Settings (tandem://settings, ConfigManager, 6 sections)
- 2.8b Behavioral Learning (BehaviorObserver, raw data collection)
- 2.9 New Tab (custom kees.ai page, search, quick links)

### ✅ Phase 3: Advanced
- Site memory, scheduled watches, headless mode, form memory
- Context bridge, bidirectional control, PiP mode, network inspector

### ✅ Phase 4: Chrome Compatibility
- Chrome import (bookmarks/history/cookies)
- Bookmarks manager + bar + ★
- History manager + Cmd+Y
- Download manager
- Find in page (Cmd+F)

### ✅ Phase 5: Stealth & Integration
- Canvas/WebGL/font/audio fingerprint protection
- Audio capture (Cmd+R), extension support
- OpenClaw integration (content extractor, workflow engine, login manager, skill package)
- ClaroNote native integration (voice recording, API proxy, Kees Panel tab)

### 🔄 Phase 6: Polish (in progress)
- Help page, keyboard shortcuts overlay
- Zoom support, light theme, onboarding flow

## Key Files

```
src/main.ts              # App lifecycle, window creation, IPC handlers, menu
src/api/server.ts        # Express API — alle ~111 endpoints
src/stealth/manager.ts   # Anti-detect patches
src/tabs/manager.ts      # Tab management
src/config/manager.ts    # Settings/config
src/behavior/observer.ts # Behavioral learning
src/chrome/importer.ts   # Chrome data import
src/content/extractor.ts # Smart page→markdown
src/workflow/engine.ts   # Multi-step automation
src/auth/login-manager.ts# Per-site auth state
src/claronote/manager.ts # ClaroNote voice-to-text
shell/index.html         # Main UI (shell, panels, chat, all client JS)
skill/SKILL.md           # OpenClaw skill definition
```

## Development

```bash
# Install
npm install

# Build TypeScript
npx tsc

# Run (macOS: clear quarantine first!)
xattr -cr node_modules/electron/dist/Electron.app
npx electron .

# API is on localhost:8765
curl http://localhost:8765/status
```

### macOS Quarantine Fix
Electron op macOS wordt geKILLed door Gatekeeper als de quarantine flag aanwezig is. **ALTIJD** `xattr -cr` runnen voor het starten:
```bash
xattr -cr node_modules/electron/dist/Electron.app
```

## Oorsprong

Herbouwd vanuit `totalrecall-browserV2` — Robin's eerdere custom Electron browser. De DNA is hetzelfde, de focus verschoven van "dev tool" naar "tandem browsing tool".

## Gerelateerde Projecten

- **OpenClaw** — AI gateway waar Kees draait (localhost:18789)
- **ClaroNote** — Robin's voice-to-text SaaS (api.claronote.com), native geïntegreerd in Tandem
- **Kanbu** — Robin's project management tool (app.kanbu.be)
- **GenX** — AI agent ecosystem op Robin's servers
