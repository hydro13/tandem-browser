# Tandem × Agent-Browser Gap Plan

> **Doel:** Tandem de 4 features geven die agent-browser zo populair maken,  
> zonder de stealth/symbiose-kern te breken.  
> **Scope:** 4 onafhankelijke fases, elke fase = 1-2 Claude Code sessies.  
> **Progress:** Elke sessie vinkt TODO.md af en commit naar main.

---

## Architectuur overzicht

```
┌─────────────────────────────────────────────────────┐
│                  Tandem API :8765                    │
│                                                      │
│  FASE 1: GET  /snapshot          ← accessibility tree│
│          GET  /snapshot?interactive=true             │
│          GET  /snapshot?selector=#main               │
│                                                      │
│  FASE 2: POST /network/mock      ← intercept/block   │
│          POST /network/unmock                        │
│          GET  /network/mocks                         │
│          POST /network/mock-clear                    │
│                                                      │
│  FASE 3: POST /sessions/create   ← isolated sessions │
│          GET  /sessions/list                         │
│          POST /sessions/switch                       │
│          POST /sessions/destroy                      │
│          POST /sessions/state/save                   │
│          POST /sessions/state/load                   │
│                                                      │
│  FASE 4: tandem CLI              ← npm package       │
│          tandem open <url>                           │
│          tandem snapshot                             │
│          tandem click <sel>                          │
│          tandem fill <sel> <text>                    │
│          tandem eval <js>                            │
└─────────────────────────────────────────────────────┘
```

---

## FASE 1 — Snapshot Endpoint (Accessibility Tree)

> **Prioriteit: HOOG** — Dit is de #1 killer feature die agent-browser zo goed maakt.  
> LLMs kunnen accessibility tree refs gebruiken zonder CSS selectors te kennen.

### Wat het doet
- `GET /snapshot` → geeft accessibility tree van de pagina
- Elk element krijgt een ref: `@e1`, `@e2`, etc. (persistent per pagina)
- Refs kunnen gebruikt worden in `/click`, `/type`, `/get-text`
- Filters: `?interactive=true` (alleen klikbare dingen), `?selector=` (scope)

### Bestaande code te lezen
- `src/api/server.ts` — hier komen de nieuwe endpoints bij
- `src/devtools/manager.ts` — CDP attach/detach patroon
- `AGENTS.md` — anti-detect regels (accessibility tree mag NIET via injected script)

### Aanpak (via CDP — geen injectie in webview)
```
CDP: Accessibility.getFullAXTree()
  → filter nodes (role, name, beschrijving)
  → wijs @e1, @e2 refs toe (stabiel per sessie)
  → sla ref-map op in memory
  → /click/@e1 → lookup nodeId → CDP: DOM.resolveNode → webContents.sendInputEvent
```

### Nieuwe bestanden
```
src/snapshot/
  manager.ts      ← SnapshotManager: getTree(), getRef(), clearRefs()
  types.ts        ← AccessibilityNode, SnapshotOptions, RefMap
```

### API endpoints
```
GET  /snapshot                     → volledige tree
GET  /snapshot?interactive=true    → alleen buttons/inputs/links
GET  /snapshot?compact=true        → geen lege structurele nodes
GET  /snapshot?selector=#main      → scope tot element
GET  /snapshot?depth=3             → max diepte 3
POST /snapshot/click               → {"ref":"@e2"} → klik via CDP
POST /snapshot/fill                → {"ref":"@e3","value":"test@x.com"}
GET  /snapshot/get-text            → {"ref":"@e1"} → tekst teruggeven
```

### Output formaat (zelfde als agent-browser)
```
- document [document]
  - navigation [navigation]
    - link "Home" [@e1] (focused)
    - link "About" [@e2]
  - main [main]
    - heading "Welcome" [@e3] level=1
    - button "Sign In" [@e4]
    - textbox "Email" [@e5] value=""
```

### Verificatie checklist
- [ ] `npx tsc` — geen errors
- [ ] `curl localhost:8765/snapshot` → accessibility tree met @e refs
- [ ] `curl localhost:8765/snapshot?interactive=true` → alleen klikbare elementen
- [ ] `curl -X POST localhost:8765/snapshot/click -d '{"ref":"@e1"}'` → navigeert
- [ ] Refs zijn stabiel (zelfde pagina = zelfde refs na reload)
- [ ] Anti-detect: Accessibility.getFullAXTree werkt via main process, NIET via injected script

### Commit bericht
```
🌳 feat: /snapshot endpoint with accessibility tree refs (@e1, @e2...)
```

---

## FASE 2 — Network Mocking & Interception

> **Prioriteit: MEDIUM** — Essentieel voor testing/development workflows.

### Wat het doet
- Requests intercepten, blokkeren, of mocken met fake responses
- Ingebouwd in CDP via `Fetch.enable` + `Fetch.fulfillRequest`
- Geen externe proxy nodig

### Bestaande code te lezen
- `src/devtools/network-capture.ts` — bestaande network monitoring
- `src/devtools/manager.ts` — CDP lifecycle
- `AGENTS.md` — anti-detect (network intercept is onzichtbaar voor site JS)

### Aanpak
```
CDP: Fetch.enable({patterns:[{urlPattern:"*",requestStage:"Request"}]})
  → Per request: check tegen mock-lijst
  → Match? → Fetch.fulfillRequest(mockData)
  → Geen match? → Fetch.continueRequest()
```

### Nieuwe bestanden
```
src/network/
  mocker.ts       ← NetworkMocker: addMock(), removeMock(), clearMocks()
  types.ts        ← MockRule, MockResponse, InterceptPattern
```

### API endpoints
```
POST /network/mock
Body: {
  "pattern": "**/api/users/**",     // glob of exact URL
  "status": 200,
  "body": {"users": []},            // JSON response
  "headers": {"Content-Type": "application/json"},
  "delay": 500                      // optionele vertraging (ms)
}

POST /network/mock {"pattern": "*.tracking.js", "abort": true}  // blokkeren

GET  /network/mocks                 // alle actieve mocks tonen
POST /network/unmock {"pattern": "..."} // specifieke mock verwijderen
POST /network/mock-clear            // alles wissen

// Route alias (agent-browser compatibel)
POST /network/route                 // alias voor /network/mock
POST /network/unroute               // alias voor /network/unmock
```

### Verificatie checklist
- [ ] `npx tsc` — geen errors
- [ ] Mock instellen, request doen → gemockte response ontvangen
- [ ] Abort mock → request geblokkeerd (network error)
- [ ] `GET /network/mocks` → lijst van actieve regels
- [ ] `/network/mock-clear` → alle mocks weg
- [ ] Existing network capture endpoints (`/devtools/network`) werken nog

### Commit bericht
```
🕸️ feat: network mocking via CDP Fetch interception (/network/mock)
```

---

## FASE 3 — Multi-Session (Geïsoleerde Tab Sessies)

> **Prioriteit: MEDIUM** — Meerdere AI agents tegelijk in Tandem.

### Wat het doet
- Elke "sessie" heeft eigen cookies, storage, navigatiehistorie
- Sessie = named partition in Electron (`persist:session-{name}`)
- Standaard sessie = `persist:tandem` (Robin's normale sessie)
- Extra sessies voor AI agents, testing, geïsoleerde workflows

### Bestaande code te lezen
- `src/tabs/manager.ts` — tab lifecycle + webview partitions
- `src/api/server.ts` — bestaande tab endpoints
- `AGENTS.md` — webview partition regels

### Aanpak
```
Electron partition systeem:
- Robin's sessie: persist:tandem  (onveranderd, steeds beschikbaar)
- Agent sessie 1: persist:session-agent1
- Agent sessie 2: persist:session-agent2
- Incognito: in-memory:session-temp

State opslaan/laden = Electron session.defaultSession.cookies.get/set
Versleuteling = AES-256-GCM (zelfde als agent-browser)
```

### Nieuwe bestanden
```
src/sessions/
  manager.ts      ← SessionManager: create(), list(), switch(), destroy()
  state.ts        ← StateManager: save(), load(), encrypt(), decrypt()
  types.ts        ← Session, SessionState, EncryptionConfig
```

### API endpoints
```
GET  /sessions/list
→ [{"name":"default","partition":"persist:tandem","active":true,"tabs":3},
   {"name":"agent1","partition":"persist:session-agent1","active":false,"tabs":1}]

POST /sessions/create {"name":"agent1"}
POST /sessions/switch {"name":"agent1"}   // actieve sessie wisselen
POST /sessions/destroy {"name":"agent1"}  // + alle tabs sluiten

// State opslaan/laden (met optionele encryptie)
POST /sessions/state/save {"name":"twitter","path":"~/.tandem/sessions/"}
POST /sessions/state/load {"name":"twitter","path":"~/.tandem/sessions/"}
GET  /sessions/state/list

// --session flag via X-Session header (agent-browser compatibel)
// Alle bestaande endpoints respecteren X-Session header
```

### Backward compatibility
- Bestaande endpoints werken op de `default` (Robin's) sessie als geen header
- `X-Session: agent1` header → operatie op agent1 sessie

### Verificatie checklist
- [ ] `npx tsc` — geen errors
- [ ] Sessie aanmaken → eigen partition, eigen cookies
- [ ] Robin's sessie (`default`) onaangetast
- [ ] Staat opslaan → bestand op disk; laden → cookies hersteld
- [ ] `X-Session` header werkt op `/navigate`, `/click`, `/page-content`
- [ ] Sessie destroyen → tabs gesloten, partition gewist

### Commit bericht
```
🗂️ feat: multi-session support with isolated Electron partitions
```

---

## FASE 4 — CLI Wrapper

> **Prioriteit: LAAG** — Nice-to-have, maakt Tandem toegankelijk voor meer tools.

### Wat het doet
- `tandem` CLI als thin wrapper rond de REST API
- Zelfde command pattern als agent-browser maar dan naar Tandem
- Npm package: `@hydro13/tandem-cli`

### Bestaande code te lezen
- `README.md` — bestaande API endpoints
- Package.json voor versie/naam

### Nieuwe bestanden
```
cli/
  index.ts        ← main entry point, argument parsing
  commands/
    open.ts       → POST /navigate
    snapshot.ts   → GET /snapshot
    click.ts      → POST /click of POST /snapshot/click (@ref)
    fill.ts       → POST /type
    eval.ts       → POST /devtools/evaluate
    screenshot.ts → GET /screenshot
    cookies.ts    → GET /cookies
    session.ts    → /sessions/* endpoints
  client.ts       ← HTTP client naar localhost:8765
  types.ts
```

### Commands
```
tandem open <url>
tandem snapshot [--interactive] [--compact] [--selector <sel>]
tandem click <selector-or-@ref>
tandem fill <selector-or-@ref> <text>
tandem eval <javascript>
tandem screenshot [path]
tandem cookies
tandem cookies set <name> <value>
tandem session list
tandem session create <name>
tandem session switch <name>
tandem --session <name> open <url>   // session flag
tandem --help
tandem --version
```

### Installatie
```bash
npm install -g @hydro13/tandem-cli
# of lokaal
npm link
```

### Verificatie checklist
- [ ] `npx tsc` — geen errors
- [ ] `tandem open example.com` → navigeert
- [ ] `tandem snapshot -i` → accessibility tree
- [ ] `tandem click @e2` → klik via ref
- [ ] `tandem --session agent1 open site.com` → in agent1 sessie
- [ ] `tandem --help` → overzicht commands

### Commit bericht
```
⌨️ feat: tandem CLI wrapper (@hydro13/tandem-cli)
```

---

## Claude Code Sessie Template

Elke fase start Claude Code met deze context:

```
Je werkt aan Tandem Browser — een Electron AI-mens symbiose browser van Robin Waslander.

LEES EERST (verplicht, in deze volgorde):
1. AGENTS.md         ← regels, anti-detect architectuur, verplichte patronen
2. PROJECT.md        ← wat Tandem is en waarom
3. TODO.md           ← huidige status, wat al gedaan is
4. AGENT-BROWSER-GAPS-PLAN.md ← het plan dat je uitvoert
5. src/api/server.ts ← bestaande endpoints (voeg toe, breek niets)
6. [fase-specifieke bestanden — zie per fase hierboven]

Dan: implementeer FASE [X] uit AGENT-BROWSER-GAPS-PLAN.md.

Verificatie (verplicht voor je klaar bent):
1. npx tsc — 0 errors
2. npm run dev — app start zonder crashes
3. Curl test ELKE nieuwe endpoint
4. Update TODO.md: vink [x] af wat gedaan is
5. Update CHANGELOG.md
6. Git commit + push

Rapporteer daarna:
## Gebouwd
## Getest  
## Volgende stap
```

---

## Progress Tracking

Update deze tabel na elke sessie:

| Fase | Feature | Status | Sessie | Datum |
|------|---------|--------|--------|-------|
| 1 | /snapshot accessibility tree | ⬜ TODO | — | — |
| 1 | /snapshot?interactive | ⬜ TODO | — | — |
| 1 | /snapshot/click + /snapshot/fill via @ref | ⬜ TODO | — | — |
| 2 | /network/mock (intercept) | ⬜ TODO | — | — |
| 2 | /network/mock abort (blokkeren) | ⬜ TODO | — | — |
| 2 | /network/mocks + /network/mock-clear | ⬜ TODO | — | — |
| 3 | /sessions/create + /sessions/list | ⬜ TODO | — | — |
| 3 | /sessions/state/save + load | ⬜ TODO | — | — |
| 3 | X-Session header op bestaande endpoints | ⬜ TODO | — | — |
| 4 | tandem CLI — basis commands | ⬜ TODO | — | — |
| 4 | tandem CLI — session flag | ⬜ TODO | — | — |

**Legende:** ⬜ TODO · 🔄 In progress · ✅ Done · ❌ Geblokkeerd

---

## Volgorde aanbeveling

1. **Fase 1 eerst** — snapshot is de biggest bang for buck, maakt Tandem direct bruikbaar voor andere AI tools
2. **Fase 2** — network mocking, relatief zelfstandig, geen afhankelijkheden
3. **Fase 3** — multi-session, bouwt op tab manager
4. **Fase 4 laatste** — CLI is thin wrapper, heeft alle bovenstaande features nodig
