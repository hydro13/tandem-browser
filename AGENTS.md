# AGENTS.md — Tandem Browser Development Guide

## Wie ben je?

Je bent een developer agent die werkt aan **Tandem Browser** — een Electron browser voor AI-mens symbiose. Robin (mens) en Copilot (AI) browsen samen het web. Jij schrijft de code.

**Lees EERST `PROJECT.md`** — dat is het complete overzicht van wat Tandem is, hoe het werkt, en waarom.

## Het project

- **Repo:** `hydro13/tandem-browser` (privé, GitHub: hydro13)
- **Stack:** Electron 40 + TypeScript + Express.js API (localhost:8765)
- **Doel:** Browser waar een AI (via HTTP API + WebSocket) en een mens (via UI) samen browsen
- **Filosofie:** Lokaal, privacy-first, geen cloud dependencies
- **Omvang:** ~28,750 regels TypeScript (81 bestanden), ~10,190 regels HTML/JS (shell/), 170+ API endpoints, 38 src modules
- **Tests:** 124 geautomatiseerd (51 security + 73 extensions) via Vitest
- **Versie:** v0.10.0 — zie CHANGELOG.md voor volledige historie

## Projectstructuur

```
tandem-browser/
├── src/                          # 81 TypeScript bestanden, ~28,750 regels
│   ├── api/server.ts             # Express API (170+ endpoints)
│   ├── main.ts                   # Electron main process
│   ├── security/                 # 5-layer shield + intelligence upgrade
│   ├── extensions/               # Browser extension systeem (12 bestanden)
│   ├── snapshot/                 # Accessibility tree met @refs
│   ├── network/                  # Inspector + mocking
│   ├── sessions/                 # Multi-session isolatie
│   ├── mcp/                      # MCP protocol server
│   ├── agents/                   # TaskManager, X-Scout, TabLockManager
│   ├── devtools/                 # CDP bridge
│   └── ...                       # 28 andere modules
├── shell/                        # Browser UI (~10,190 regels HTML/JS)
├── cli/                          # tandem CLI (@hydro13/tandem-cli)
├── docs/
│   ├── implementations/          # Voltooide implementatie-plannen
│   │   ├── ai-integratie/        # MCP, EventStream, ChatRouter, Autonomie
│   │   ├── agent-browser-gaps/   # Snapshot, mock, sessions, CLI
│   │   ├── linux-portatie/       # Linux portatie roadmap
│   │   ├── cdp-devtools/         # DevTools Bridge plannen
│   │   ├── context-menu/         # Context Menu plannen
│   │   ├── copilot-vision/       # Copilot Vision plannen
│   │   └── liquid-glass/         # Liquid Glass Lite docs
│   ├── plans/                    # Niet-geïmplementeerde plannen
│   ├── archive/                  # Historische documenten
│   ├── Browser-extensions/       # Extension systeem (10 phases)
│   ├── agent-tools/              # Agent tools (3 phases + phase 4 TBD)
│   ├── security-fixes/           # Security fixes
│   ├── security-shield/          # Security Shield (5 layers)
│   └── security-upgrade/         # Security Intelligence (9 phases)
├── scripts/                      # Test & launch scripts
├── skill/                        # OpenClaw skill file
├── release/                      # Build artifacts (DMG, ZIP)
├── README.md
├── PROJECT.md
├── CHANGELOG.md
├── AGENTS.md                     # ← dit bestand
└── TODO.md
```

## Regels — WAT JE MOET DOEN

### 1. Lees eerst, bouw dan
- Lees ALTIJD `TODO.md` voor je begint — weet wat de huidige prioriteiten zijn
- Lees ALTIJD de bestaande code in `src/` — snap de architectuur
- Lees `PROJECT.md` voor de visie als je twijfelt over design keuzes
- Check `docs/implementations/` voor context over voltooide subsystemen

### 2. Test je eigen code
- **Compileer altijd:** `npx tsc` moet FOUTLOOS zijn voor je klaar bent
- **Start de app:** `npm run dev` en verifieer dat het opstart zonder crashes
- **Test API endpoints:** Gebruik `curl` om elke nieuwe/gewijzigde endpoint te testen
- **Test UI:** Neem een screenshot en verifieer visueel dat het er goed uitziet
- **Run tests:** `npx vitest run` — alle bestaande tests moeten blijven slagen
- **Rapporteer:** Geef een samenvatting van wat je getest hebt en wat de resultaten waren

### 3. Documentatie bijwerken
- **TODO.md:** Vink af wat je gebouwd hebt, voeg nieuwe items toe als je iets ontdekt
- **CHANGELOG.md:** Voeg een entry toe per fase/feature die je afrondt
- **Code comments:** JSDoc voor publieke functies, inline comments voor complexe logica

### 4. Git discipline
- Commit na elke afgeronde sub-feature (niet één mega-commit)
- Commit messages: emoji + korte beschrijving
  - `🚲 feat: tab management met groups`
  - `🛡️ fix: stealth UA mismatch`
  - `📝 docs: API endpoints bijgewerkt`
  - `🧪 test: curl tests voor /tabs endpoints`
- Push naar `origin main` aan het eind

### 5. Code kwaliteit
- **TypeScript strict mode** — geen `any` tenzij echt nodig (en dan met comment waarom)
- **Error handling** — elke API endpoint vangt errors, geeft JSON terug
- **Geen hardcoded paths** — gebruik `path.join()`, `app.getPath()`, etc.
- **Separation of concerns** — elk bestand heeft één verantwoordelijkheid
- **Naming:** camelCase voor functies/variabelen, PascalCase voor classes, kebab-case voor bestanden

## Regels — WAT JE NIET MAG DOEN

### ❌ Absoluut niet
- **Geen dependencies toevoegen** zonder het te vermelden — elk nieuw package moet goedgekeurd
- **Geen bestaande endpoints breken** — backward compatibility behouden
- **Geen data naar externe servers** sturen — alles blijft lokaal
- **Geen `rm -rf`** of destructieve operaties op het filesystem
- **Geen secrets/tokens hardcoden** — gebruik environment variables of config files
- **Geen hele bestanden herschrijven** als een kleine edit volstaat

### ⚠️ Voorzichtig mee
- Electron security: `nodeIntegration: false`, `contextIsolation: true` behouden
- Webview partition: altijd `persist:tandem` gebruiken
- API alleen binden aan `127.0.0.1` — nooit `0.0.0.0`
- Stealth patches: niet verwijderen of uitschakelen

## ⚔️ ANTI-DETECTIE ARCHITECTUUR — KRITISCH

### De Gouden Regel
**Alles wat Copilot doet moet onzichtbaar zijn vanuit de webpagina's JavaScript context.**

De website mag ALLEEN zien: "een mens in Chrome op een Mac in België". Copilot staat over Robin's schouder mee te kijken, maar de website weet dat niet.

### Twee-lagen architectuur
- **Layer 1 (website ziet):** Normale Chromium webview, echte sessie, menselijk gedrag
- **Layer 2 (onzichtbaar):** Electron main process + shell UI waar Copilot opereert

### Verplichte patronen

| Wat | ❌ VERBODEN | ✅ VERPLICHT |
|-----|-----------|------------|
| Screenshot | Canvas API in webview | `webContents.capturePage()` main process |
| Click | `el.click()` / `dispatchEvent()` in webview | `webContents.sendInputEvent()` OS-level |
| Type | `el.value = "text"` in webview | `sendInputEvent({type:'char'})` per karakter |
| Page lezen | Injected DOM crawler script | `executeJavaScript()` vanuit main process (kort, minimaal) |
| Draw overlay | Canvas IN de webview | Canvas in de shell BOVEN de webview |
| Voice | Web Speech API in webview | Web Speech API in de shell |
| Copilot paneel | iframe/element in webview | Electron panel, apart van webview |
| Activity track | MutationObserver in pagina | Electron webview events |

### Wat websites detecteren
- `Event.isTrusted` — programmatische events = false → gebruik sendInputEvent
- `document.hasFocus()` — als Copilot panel focus heeft → mock focus behouden
- `performance.now()` timing — te snel = bot → random delays 80-300ms
- Injected DOM elements — alles wat niet van de site is → NOOIT in webview
- WebSocket naar localhost — onze API mag NIET vanuit de webview aangeroepen worden
- `window.process` / `window.require` — Electron giveaways → MOETEN undefined zijn
- `navigator.userAgentData` — moet matchen met echte Chrome
- `localhost:8765` port scan — sites kunnen proberen onze API te detecteren → CORS strict, geen response op cross-origin

### ⚠️ FUNDAMENTELE REGEL: GEEN UNIEKE FINGERPRINT
Tandem mag NOOIT een herkenbare fingerprint hebben. Als platforms (Meta, Google, LinkedIn)
Tandem als "AI browser" kunnen identificeren, is het game over voor ALLE gebruikers.

Tandem moet ononderscheidbaar zijn van echte Chrome op macOS.
- Elke Electron-specifieke API moet verborgen of gepatcht zijn
- Geen custom headers, geen custom properties, geen detecteerbare patterns
- Overweeg migratie naar Chrome Extension model als Electron niet veilig genoeg is

### Headless mode = "minimized met noodrem"
Background browsing is NOOIT volledig autonoom:
- Bij detectie/captcha → tab wordt ZICHTBAAR voor Robin
- Robin lost het op → tab gaat terug naar achtergrond
- Robin is altijd de noodrem en bodyguard

### Timing humanisatie — Behavioral Learning
Tandem leert Robin's gedragspatronen en repliceert die bij automated acties.

**Observation layer** (altijd actief, passief):
- Track via Electron main process events (NIET in webview)
- Mouse movement paths, click delays, scroll patterns, typing rhythm
- Opslag: `~/.tandem/behavior/` (raw data + gecompileerd profiel)

**Profiel bevat:**
- Typing bigram timing (interval per toets-combinatie)
- Click hesitatie distributie (hover → click delay)
- Scroll patronen (snelheid, pauzes, leestijd)
- Muispad curves (Bézier templates)
- Dagritme variatie (nacht = langzamer)
- Per-site gedragsclusters

**Bij automated acties:**
- Sample uit Robin's echte distributies (niet hardcoded ranges)
- Muisbewegingen: Bézier curves gebaseerd op geleerde paden
- Typing: Robin's eigen ritme per toets-combinatie + variatie
- Fallback (als profiel nog leeg): gaussian random 80-300ms clicks, 30-120ms typing

**Gouden regel:** Het gedrag moet statistisch ononderscheidbaar zijn van Robin's echte browsing.

## 💬 Chat Architectuur — BELANGRIJK

Het Copilot panel heeft een Chat tab die Robin en Copilot laat communiceren. Deze verbindt **direct via WebSocket** met de OpenClaw gateway (ws://127.0.0.1:18789).

### Hoe het werkt
1. WebSocket naar `ws://127.0.0.1:18789`
2. Wacht op `connect.challenge` event
3. Stuur `connect` request met gateway token uit `~/.openclaw/openclaw.json`
4. Laad history via `chat.history` (sessionKey: `agent:main:main`)
5. Stuur berichten via `chat.send`
6. Ontvang streaming updates via `chat` events (state: `delta` → `final`)

### ⚠️ NIET DOEN — Geleerde Lessen
We hebben drie andere methoden geprobeerd die NIET werkten:

1. **❌ Cron polling van localhost:8765/chat** — Te traag (zelfs 15 sec voelt als eeuwigheid), verspilt API tokens bij elke poll
2. **❌ Iframe embed van OpenClaw webchat** — Server stuurt `X-Frame-Options: DENY` en `Content-Security-Policy: frame-ancestors 'none'`. Zelfs met header stripping via `onHeadersReceived` was er het auth token probleem.
3. **❌ Webview met localStorage token injectie** — Aparte partition (`persist:openclaw-chat`) deelt geen storage met main partition. Token structuur complex (3 localStorage keys nodig). Te fragiel.

**✅ Direct WebSocket is de enige juiste aanpak.** Simpel, snel, real-time. De gateway token staat in `~/.openclaw/openclaw.json` → `gateway.auth.token`.

### Chat code locatie
Alle chat WebSocket code zit in `shell/index.html` in de `ocChat` IIFE. Zoek naar `// === OpenClaw WebSocket Chat ===` of `ocChat`.

## 🍎 macOS Quarantine — BELANGRIJK

Electron op macOS wordt geKILLed door Gatekeeper (SIGKILL na ~4 sec) als quarantine flags aanwezig zijn. **ALTIJD** voor het starten:
```bash
xattr -cr node_modules/electron/dist/Electron.app
```

Dit moet na elke `npm install` of als Electron opnieuw gedownload wordt. Bouw dit in start scripts in.

## Development Workflow

```
1. Lees TODO.md → kies de volgende feature
2. Check docs/implementations/ en docs/plans/ voor context
3. Lees bestaande code → snap de architectuur
4. Schrijf de code
5. `npx tsc` → fix alle type errors
6. `npx vitest run` → alle tests moeten slagen
7. `npm run dev` → test handmatig
8. `curl` test voor API endpoints
9. Update documentatie (TODO.md, CHANGELOG.md)
10. Git commit + push
11. Rapporteer aan Robin wat je gebouwd en getest hebt
```

## Hoe je rapporteert

Na elke sessie, geef:

```
## Gebouwd
- [feature 1]: wat het doet
- [feature 2]: wat het doet

## Getest
- ✅ `npx tsc` — geen errors
- ✅ `npx vitest run` — alle tests slagen
- ✅ `npm run dev` — app start, geen crashes
- ✅ `curl localhost:8765/nieuwe-endpoint` — response OK
- ⚠️ [eventuele issues gevonden]

## Documentatie
- TODO.md bijgewerkt
- CHANGELOG.md bijgewerkt

## Volgende stap
- [wat er nu aan de beurt is volgens TODO.md]
```

## Communicatie met Robin

Robin is de opdrachtgever. Hij:
- Beslist over design keuzes als er meerdere opties zijn
- Moet geïnformeerd worden over nieuwe dependencies
- Test de UI visueel — jij test de code
- Praat Nederlands, code en docs zijn Engels

Als je twijfelt → vraag. Liever één keer te veel gevraagd dan een verkeerde aanname.
