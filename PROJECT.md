# Tandem Browser 🧠🤝👤

> "Kees en Robin zijn één entiteit" — De browser waar AI en mens samen het internet op gaan.

## Missie

Een browser gebouwd voor **mens-AI symbiose**. Niet een headless scraper, niet een bot — een echte browser waar Robin (mens) en Kees (AI) samen doorheen navigeren. Robin is de copiloot die door detectie-gates loodst, Kees is de motor die data verwerkt, navigeert, en acties uitvoert.

## Waarom dit bestaat

1. **Platforms schermen zich af** — LinkedIn, X, zelfs gewone sites blokkeren AI crawlers
2. **AI zonder ogen is blind** — Kees kan geen actuele informatie zien zonder browser
3. **Samen door de muur** — Een echte browser met een echt mens erachter passeert elke detectie
4. **Data ownership** — Geen betaalde API's van derden, eigen toegang tot het open web

## Architectuur

```
┌─────────────────────────────────────────────────────────┐
│  Tandem Browser (Electron)                             │
│                                                         │
│  ┌──────────────┐  ┌─────────────────────────────────┐ │
│  │  Browser UI   │  │  Kees Control Panel             │ │
│  │  (Chromium)   │  │  - Command queue                │ │
│  │               │◄─┤  - Status dashboard             │ │
│  │  Robin ziet   │  │  - Page analysis                │ │
│  │  & navigeert  │  │  - Action log                   │ │
│  └──────────────┘  └─────────────────────────────────┘ │
│         │                        │                      │
│         ▼                        ▼                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Tandem API (localhost:8765)                     │  │
│  │                                                   │  │
│  │  /navigate    /click    /type    /screenshot      │  │
│  │  /extract     /cookies  /status  /page-content    │  │
│  │  /execute-js  /wait     /scroll  /copilot-alert   │  │
│  └──────────────────────────────────────────────────┘  │
│         │                        │                      │
│         ▼                        ▼                      │
│  ┌──────────────┐  ┌─────────────────────────────────┐ │
│  │  Anti-Detect  │  │  OpenClaw Integration           │ │
│  │  Layer        │  │                                 │ │
│  │  - Real UA    │  │  Kees (via exec/fetch) stuurt   │ │
│  │  - Fingerprint│  │  commando's naar de API         │ │
│  │  - Timing     │  │  en leest pagina content        │ │
│  │  - Cookies    │  │                                 │ │
│  └──────────────┘  └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Core Principes

1. **Echte browser** — Niet headless, niet Puppeteer. Een browser die Robin ook gewoon kan gebruiken.
2. **API-first** — Alles wat Kees kan doen gaat via de HTTP API op localhost.
3. **Copilot alerts** — Als er een captcha, login, of detectie is → Robin krijgt een notificatie.
4. **Stealth by default** — Fingerprint randomisatie, realistic timing, persistent sessies.
5. **Geen cloud** — Alles lokaal. Geen data die het netwerk verlaat (behalve naar de websites zelf).

## Features (MVP — Week 1)

### Phase 1: Core (MVP) ✅ GEBOUWD
- [x] Electron browser met navigatie
- [x] HTTP API op localhost:8765 (13 endpoints)
- [x] `/navigate`, `/page-content`, `/click`, `/type`
- [x] `/screenshot`, `/execute-js`, `/cookies`, `/status`
- [x] `/scroll`, `/wait`, `/links`, `/forms`, `/page-html`
- [x] Anti-detect: realistic UA, geen headless flags, stealth script
- [x] Persistent sessions (cookies overleven restart via `persist:tandem`)
- [x] Copilot alert systeem (macOS notification + in-browser overlay)

### Phase 2: Echte Browser Ervaring 🔄 NU
- [ ] **Tabs** — Meerdere tabs openen, sluiten, wisselen (via UI + API)
- [ ] **Favorieten/Bookmarks** — Opslaan, organiseren, importeren
- [ ] **Chrome import** — Favorieten, geschiedenis, cookies importeren vanuit Chrome
- [ ] **Wachtwoorden database** — Lokale encrypted password store (SQLite + AES-256)
- [ ] **Autofill** — Formulieren automatisch invullen met opgeslagen credentials
- [ ] **Download manager** — Downloads beheren via UI + API
- [ ] **Geschiedenis** — Browse history met zoekfunctie

### Phase 3: Stealth & Anti-Detect 🔒
- [ ] **Canvas fingerprint spoofing** — Randomized canvas output
- [ ] **WebGL fingerprint masking** — GPU info maskeren
- [ ] **Font enumeration spoofing** — Consistente font lijst
- [ ] **Proxy support** — SOCKS5/HTTP proxy per tab of globaal
- [ ] **Request interception** — Headers wijzigen, requests blokkeren
- [ ] **Timing randomisatie** — Menselijke delays bij automated actions
- [ ] **TLS fingerprint** — JA3 fingerprint matching met echte Chrome

### Phase 4: AI Integratie 🤖
- [ ] **OpenClaw skill** — Tandem als native OpenClaw tool/skill
- [ ] **Page-to-markdown** — Turndown integration voor clean markdown output
- [ ] **Smart extraction** — AI-gestuurde content extractie (artikel, profiel, product)
- [ ] **Session recording** — Opnemen en replay van browse sessies
- [ ] **Multi-step workflows** — Keten van acties definiëren en uitvoeren
- [ ] **Login state management** — Per-site login sessies beheren

### Phase 5: Polish & Distribution 🚀
- [ ] **Multi-profile support** — Gescheiden browse profielen
- [ ] **Keyboard shortcuts** — Cmd+T (tab), Cmd+L (URL), etc.
- [ ] **Themes** — Donker/licht/custom
- [ ] **Auto-update** — Electron auto-updater
- [ ] **electron-builder** — DMG/AppImage distributie
- [ ] **Documentatie** — API docs, gebruikershandleiding

## Tech Stack

- **Runtime:** Electron (latest)
- **Language:** TypeScript
- **API:** Express.js (localhost:8765)
- **Anti-detect:** Custom stealth layer
- **Build:** esbuild of tsc
- **Package:** electron-builder

## Hoe Kees het gebruikt (via OpenClaw)

```bash
# Navigeer naar een pagina
curl http://localhost:8765/navigate -d '{"url":"https://linkedin.com/in/robinwaslander"}'

# Lees de content
curl http://localhost:8765/page-content

# Klik op een element
curl http://localhost:8765/click -d '{"selector":"button.follow"}'

# Screenshot voor visuele analyse
curl http://localhost:8765/screenshot
```

In OpenClaw kan Kees dit aanroepen via `exec`:
```
exec: curl -s http://localhost:8765/page-content | head -100
```

## Hoe Robin het gebruikt

Gewoon als browser. Open het, browse, doe je ding. Als Kees iets nodig heeft verschijnt er een subtiel paneel met wat hij wil doen. Robin keurt goed of neemt over.

## Oorsprong

Herbouwd vanuit `totalrecall-browserV2` — Robin's eerdere custom browser die al VSCode extensions in de browser kon draaien en Claude CLI integratie had. De DNA is hetzelfde, de focus is verschoven van "dev tool" naar "tandem browsing tool".

## Naam

**Tandem** — twee personen, één voertuig. Samen trappen, samen sturen. Net als het schaakconcept waar een mens+AI team sterker is dan de beste AI of de beste mens alleen.
