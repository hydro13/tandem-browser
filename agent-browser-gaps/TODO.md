# Agent-Browser Gaps — TODO Checklist

> Vink af (`[x]`) wat klaar is. Zet datum + sessienummer erbij.  
> Zie fase-documenten voor details per taak.

---

## Pre-requisites (check voor elke sessie)

- [ ] `curl http://localhost:8765/status` — Tandem draait
- [ ] `curl http://localhost:8765/devtools/status` — CDP attached
- [ ] `npx tsc` — zero errors
- [ ] `git status` — clean

---

## Fase 1: /snapshot — Accessibility Tree met @refs

> **Sessies:** 1-2  
> **Bestanden:** `src/snapshot/manager.ts`, `src/snapshot/types.ts`, `src/api/server.ts`  
> **Detail:** `fase-1-snapshot.md`

### Sessie 1.1: SnapshotManager + basis endpoint
- [ ] `src/snapshot/types.ts` — interfaces (AccessibilityNode, RefMap, SnapshotOptions)
- [ ] `src/snapshot/manager.ts` — SnapshotManager class
- [ ] `getFullTree()` — CDP Accessibility.getFullAXTree() aanroepen
- [ ] `assignRefs()` — @e1, @e2, ... toewijzen (stabiel per pagina, reset bij navigatie)
- [ ] `formatTree()` — output als tekst (zelfde stijl als agent-browser)
- [ ] `GET /snapshot` endpoint in server.ts
- [ ] `GET /snapshot?interactive=true` — filter op buttons/inputs/links
- [ ] `npx tsc` — zero errors
- [ ] Test: `curl http://localhost:8765/snapshot` → accessibility tree met @e refs
- [ ] Test: `curl "http://localhost:8765/snapshot?interactive=true"` → minder nodes
- [ ] Commit: `🌳 feat: /snapshot endpoint with accessibility tree refs`

### Sessie 1.2: Filters + @ref interactie
- [ ] `GET /snapshot?compact=true` — lege structurele nodes weggooien
- [ ] `GET /snapshot?selector=%23main` — scope tot CSS selector
- [ ] `GET /snapshot?depth=3` — max diepte beperken
- [ ] `POST /snapshot/click {"ref":"@e2"}` — klik via @ref (→ CDP node → sendInputEvent)
- [ ] `POST /snapshot/fill {"ref":"@e3","value":"test"}` — fill via @ref
- [ ] `GET /snapshot/text?ref=@e1` — tekst ophalen via @ref
- [ ] Refs resetten bij navigatie (event listener op webContents.on('did-navigate'))
- [ ] `npx tsc` — zero errors
- [ ] Test: `curl -X POST localhost:8765/snapshot/click -d '{"ref":"@e1"}'` → navigeert
- [ ] Test: refs stabiel op zelfde pagina, reset na navigatie
- [ ] Commit: `🌳 feat: /snapshot filters + @ref click/fill/text`

---

## Fase 2: /network/mock — Intercept & Mocking

> **Sessies:** 1  
> **Bestanden:** `src/network/mocker.ts`, `src/network/types.ts`, `src/api/server.ts`  
> **Detail:** `fase-2-network-mock.md`

### Sessie 2.1: NetworkMocker + alle endpoints
- [ ] `src/network/types.ts` — interfaces (MockRule, MockResponse, InterceptPattern)
- [ ] `src/network/mocker.ts` — NetworkMocker class
- [ ] CDP: `Fetch.enable` activeren bij eerste mock, `Fetch.disable` bij mock-clear
- [ ] `handleRequest()` — match URL pattern, fulfillRequest of continueRequest
- [ ] Glob matching voor URL patterns (bijv. `**/api/**`)
- [ ] `POST /network/mock` — mock toevoegen (body: JSON response)
- [ ] `POST /network/mock` met `"abort":true` — request blokkeren
- [ ] `GET /network/mocks` — actieve mocks tonen
- [ ] `POST /network/unmock {"pattern":"..."}` — specifieke mock verwijderen
- [ ] `POST /network/mock-clear` — alles wissen + Fetch.disable
- [ ] Alias: `POST /network/route` → zelfde als `/network/mock`
- [ ] Bestaande `/devtools/network` endpoints werken nog
- [ ] `npx tsc` — zero errors
- [ ] Test: mock instellen → request doen → gemockte response ontvangen
- [ ] Test: abort mock → network error in browser
- [ ] Test: mock-clear → gewoon internet weer
- [ ] Commit: `🕸️ feat: network mocking via CDP Fetch (/network/mock)`

---

## Fase 3: /sessions — Geïsoleerde Browser Sessies

> **Sessies:** 1-2  
> **Bestanden:** `src/sessions/manager.ts`, `src/sessions/state.ts`, `src/api/server.ts`  
> **Detail:** `fase-3-sessions.md`

### Sessie 3.1: SessionManager + CRUD endpoints
- [ ] `src/sessions/types.ts` — interfaces (Session, SessionInfo)
- [ ] `src/sessions/manager.ts` — SessionManager class
- [ ] `createSession(name)` — nieuwe Electron partition (`persist:session-{name}`)
- [ ] `listSessions()` — alle sessies + welke actief
- [ ] `switchSession(name)` — actieve API sessie wisselen
- [ ] `destroySession(name)` — partition wissen, tabs sluiten
- [ ] Robin's sessie (`default` / `persist:tandem`) is altijd beschikbaar, nooit verwijderbaar
- [ ] `POST /sessions/create {"name":"agent1"}`
- [ ] `GET /sessions/list`
- [ ] `POST /sessions/switch {"name":"agent1"}`
- [ ] `POST /sessions/destroy {"name":"agent1"}`
- [ ] `npx tsc` — zero errors
- [ ] Test: sessie aanmaken → eigen cookies (log in op site, wissel sessie, niet ingelogd)
- [ ] Test: Robin's sessie onaangetast na create/switch/destroy
- [ ] Commit: `🗂️ feat: /sessions create/list/switch/destroy`

### Sessie 3.2: State save/load + X-Session header
- [ ] `src/sessions/state.ts` — StateManager class
- [ ] `saveState(name)` — cookies + localStorage → JSON bestand (~/.tandem/sessions/)
- [ ] `loadState(name)` — bestand → cookies + localStorage herstellen
- [ ] AES-256-GCM encryptie (optioneel, via env `TANDEM_SESSION_KEY`)
- [ ] `POST /sessions/state/save {"name":"twitter"}`
- [ ] `POST /sessions/state/load {"name":"twitter"}`
- [ ] `GET /sessions/state/list`
- [ ] `X-Session` header op bestaande endpoints (navigate, click, page-content, etc.)
- [ ] `npx tsc` — zero errors
- [ ] Test: state opslaan, sessie destroyen, state laden → ingelogd
- [ ] Test: `X-Session: agent1` header op `/navigate` werkt in agent1 sessie
- [ ] Commit: `🗂️ feat: session state save/load + X-Session header`

---

## Fase 4: tandem CLI

> **Sessies:** 1  
> **Bestanden:** `cli/index.ts`, `cli/client.ts`, `cli/commands/*.ts`  
> **Detail:** `fase-4-cli.md`

### Sessie 4.1: CLI — alle commands
- [ ] `cli/client.ts` — HTTP client naar localhost:8765 (Bearer auth)
- [ ] `cli/index.ts` — commander.js argument parsing + help
- [ ] `tandem open <url>` → POST /navigate
- [ ] `tandem snapshot [--interactive] [--compact] [--selector <s>] [--depth <n>]`
- [ ] `tandem click <sel-or-@ref>`
- [ ] `tandem fill <sel-or-@ref> <text>`
- [ ] `tandem eval <javascript>`
- [ ] `tandem screenshot [path]`
- [ ] `tandem cookies`
- [ ] `tandem cookies set <name> <value>`
- [ ] `tandem session list`
- [ ] `tandem session create <name>`
- [ ] `tandem session switch <name>`
- [ ] `tandem --session <name> <command>` → X-Session header
- [ ] `tandem --help` + `tandem <command> --help`
- [ ] `tandem --version`
- [ ] package.json: name `@hydro13/tandem-cli`, bin entry
- [ ] `npx tsc` — zero errors
- [ ] Test: `tandem open example.com` → navigeert
- [ ] Test: `tandem snapshot -i` → interactive tree
- [ ] Test: `tandem click @e2` → klik via ref
- [ ] Test: `tandem --session agent1 open x.com` → in agent1 sessie
- [ ] Commit: `⌨️ feat: tandem CLI wrapper (@hydro13/tandem-cli)`

---

## Sessie Protocol

### Bij start van elke sessie:
1. Lees `LEES-MIJ-EERST.md`
2. Lees het relevante `fase-X.md` document
3. Check deze TODO — waar waren we gebleven?
4. Run `curl http://localhost:8765/status && npx tsc`
5. Lees de te wijzigen bronbestanden

### Bij einde van elke sessie:
1. `npx tsc` — zero errors
2. `npm start` — app start, geen crashes
3. Curl test alle nieuwe endpoints (output plakken in rapport)
4. Update TODO.md — vink [x], zet datum
5. Git commit + push
6. Rapport schrijven (Gebouwd / Getest / Obstakels / Volgende sessie)
