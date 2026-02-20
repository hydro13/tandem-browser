# Agent-Browser Gaps — TODO Checklist

> Vink af (`[x]`) wat klaar is. Zet datum + sessienummer erbij.
> Zie fase-documenten voor details per taak.

---

## Pre-requisites (check voor elke sessie)

```bash
TOKEN=$(cat ~/.tandem/api-token)
```

- [ ] `curl http://localhost:8765/status` — Tandem draait
- [ ] `curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/devtools/status` — CDP attached
- [ ] `npx tsc` — zero errors
- [ ] `git status` — clean

---

## Fase 1: /snapshot — Accessibility Tree met @refs

> **Sessies:** 1-2
> **Bestanden:** `src/snapshot/manager.ts`, `src/snapshot/types.ts`, `src/api/server.ts`, `src/main.ts`
> **Detail:** `fase-1-snapshot.md`

### Sessie 1.1: SnapshotManager + basis endpoint

- [x] `src/snapshot/types.ts` — interfaces (AccessibilityNode, RefMap, SnapshotOptions, SnapshotResult) _(2026-02-20, sessie 1.1)_
- [x] `src/snapshot/manager.ts` — SnapshotManager class _(2026-02-20, sessie 1.1)_
- [x] `getSnapshot()` — CDP `Accessibility.getFullAXTree()` via `devtools.sendCommand()` _(2026-02-20, sessie 1.1)_
- [x] `assignRefs()` — @e1, @e2, ... toewijzen (stabiel per pagina, reset bij navigatie) _(2026-02-20, sessie 1.1)_
- [x] `formatTree()` — output als tekst (zelfde stijl als agent-browser) _(2026-02-20, sessie 1.1)_
- [x] **Manager Wiring:** TandemAPIOptions + main.ts startAPI() + will-quit handler _(2026-02-20, sessie 1.1)_
- [x] `GET /snapshot` endpoint in server.ts (SNAPSHOT sectie, voor COPILOT STREAM) _(2026-02-20, sessie 1.1)_
- [x] `GET /snapshot?interactive=true` — filter op buttons/inputs/links _(2026-02-20, sessie 1.1)_
- [x] `npx tsc` — zero errors _(2026-02-20, sessie 1.1)_
- [x] Test: `curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/snapshot` _(2026-02-20, sessie 1.1)_
- [x] Test: `curl -H "Authorization: Bearer $TOKEN" "http://localhost:8765/snapshot?interactive=true"` _(2026-02-20, sessie 1.1)_
- [ ] Commit: `feat: /snapshot endpoint with accessibility tree refs`

### Sessie 1.2: Filters + @ref interactie

- [x] `GET /snapshot?compact=true` — lege structurele nodes weggooien _(2026-02-21, sessie 1.2)_
- [x] `GET /snapshot?selector=%23main` — scope via `DOM.querySelector` + subtree _(2026-02-21, sessie 1.2)_
- [x] `GET /snapshot?depth=3` — max diepte beperken _(2026-02-21, sessie 1.2)_
- [x] `POST /snapshot/click {"ref":"@e2"}` — klik via @ref (kopieer patroon van `/click` endpoint) _(2026-02-21, sessie 1.2)_
- [x] `POST /snapshot/fill {"ref":"@e3","value":"test"}` — fill via @ref (kopieer patroon van `/type` endpoint) _(2026-02-21, sessie 1.2)_
- [x] `GET /snapshot/text?ref=@e1` — tekst ophalen via @ref _(2026-02-21, sessie 1.2)_
- [x] Refs resetten bij navigatie (`Page.frameNavigated` CDP subscriber) _(2026-02-21, sessie 1.2)_
- [x] `npx tsc` — zero errors _(2026-02-21, sessie 1.2)_
- [ ] Test: `curl -X POST -H "Authorization: Bearer $TOKEN" localhost:8765/snapshot/click -H "Content-Type: application/json" -d '{"ref":"@e1"}'`
- [ ] Test: refs stabiel op zelfde pagina, reset na navigatie
- [x] Commit: `feat: /snapshot filters + @ref click/fill/text`

---

## Fase 2: /network/mock — Intercept & Mocking

> **Sessies:** 1
> **Bestanden:** `src/network/mocker.ts`, `src/network/types.ts`, `src/api/server.ts`, `src/main.ts`
> **Detail:** `fase-2-network-mock.md`

### Sessie 2.1: NetworkMocker + alle endpoints

- [ ] `src/network/types.ts` — interfaces (MockRule)
- [ ] `src/network/mocker.ts` — NetworkMocker class (met CDP subscriber voor Fetch.requestPaused)
- [ ] **Manager Wiring:** TandemAPIOptions + main.ts startAPI() + will-quit handler
- [ ] CDP: `Fetch.enable` via `devtools.sendCommand()` bij eerste mock, `Fetch.disable` bij mock-clear
- [ ] `handleRequestPaused()` — match URL pattern, fulfillRequest/failRequest/continueRequest
- [ ] Glob matching voor URL patterns (bijv. `**/api/**`)
- [ ] Body base64 encoding voor `Fetch.fulfillRequest`
- [ ] `POST /network/mock` — mock toevoegen (body: JSON response)
- [ ] `POST /network/mock` met `"abort":true` — request blokkeren
- [ ] `GET /network/mocks` — actieve mocks tonen
- [ ] `POST /network/unmock {"pattern":"..."}` — specifieke mock verwijderen
- [ ] `POST /network/mock-clear` — alles wissen + Fetch.disable
- [ ] Alias: `POST /network/route` → zelfde als `/network/mock`
- [ ] Bestaande `/network/log`, `/network/apis` etc. werken nog
- [ ] `npx tsc` — zero errors
- [ ] Test: mock instellen → request doen → gemockte response ontvangen
- [ ] Test: abort mock → network error in browser
- [ ] Test: mock-clear → gewoon internet weer
- [ ] Commit: `feat: network mocking via CDP Fetch (/network/mock)`

---

## Fase 3: /sessions — Geïsoleerde Browser Sessies

> **Sessies:** 3 (3.1 partition plumbing, 3.2 CRUD, 3.3 state + X-Session)
> **Bestanden:** `shell/index.html`, `src/tabs/manager.ts`, `src/sessions/*`, `src/api/server.ts`, `src/main.ts`
> **Detail:** `fase-3-sessions.md`

### Sessie 3.1: Partition Plumbing (renderer + TabManager)

> Geen nieuwe bestanden of endpoints — alleen bestaande code aanpassen.
> Na deze sessie werkt alles nog exact hetzelfde (default = 'persist:tandem').

- [ ] `shell/index.html` regel ~1285: `createTab(tabId, url)` → `createTab(tabId, url, partition)`
- [ ] `shell/index.html` regel ~1289: `'persist:tandem'` → `partition || 'persist:tandem'`
- [ ] `shell/index.html` regel ~3009: monkey-patch 1 forward partition: `function(tabId, url, partition)`
- [ ] `shell/index.html` regel ~3010: `_origCreateTab.call(window.__tandemTabs, tabId, url, partition)`
- [ ] `shell/index.html` regel ~3629: monkey-patch 2 forward partition: `function(tabId, url, partition)`
- [ ] `shell/index.html` regel ~3630: `_origCreateTab2.call(window.__tandemTabs, tabId, url, partition)`
- [ ] Initial tab (regel ~1461) — NIET WIJZIGEN (altijd Robin's sessie)
- [ ] `src/tabs/manager.ts` Tab interface: voeg `partition: string` toe
- [ ] `src/tabs/manager.ts` openTab: voeg `partition` parameter toe (default `'persist:tandem'`)
- [ ] `src/tabs/manager.ts` openTab: pas executeJavaScript call aan om partition mee te geven
- [ ] `src/tabs/manager.ts` registerInitialTab: voeg `partition: 'persist:tandem'` toe
- [ ] `npx tsc` — zero errors
- [ ] `npm start` — app start normaal, tabs werken nog exact als voorheen
- [ ] Test: `curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/tabs/list` (tabs hebben partition veld)
- [ ] Commit: `refactor: make partition configurable in tab creation stack`

### Sessie 3.2: SessionManager + CRUD endpoints

> **Vereist:** Sessie 3.1 compleet

- [ ] `src/sessions/types.ts` — interfaces (Session, SessionState)
- [ ] `src/sessions/manager.ts` — SessionManager class
- [ ] **Manager Wiring:** TandemAPIOptions + main.ts startAPI() + will-quit handler
- [ ] `create(name)` — nieuwe Electron partition (`persist:session-{name}`)
- [ ] `list()` — alle sessies + welke actief
- [ ] `setActive(name)` — actieve API sessie wisselen
- [ ] `destroy(name)` — tabs sluiten, gooit error bij "default"
- [ ] `POST /sessions/create {"name":"agent1"}`
- [ ] `GET /sessions/list`
- [ ] `POST /sessions/switch {"name":"agent1"}`
- [ ] `POST /sessions/destroy {"name":"agent1"}`
- [ ] `npx tsc` — zero errors
- [ ] Test: sessie aanmaken, tonen, verwijderen
- [ ] Test: Robin's sessie onaangetast + kan niet verwijderd worden
- [ ] Commit: `feat: /sessions create/list/switch/destroy`

### Sessie 3.3: State save/load + X-Session header

> **Vereist:** Sessie 3.2 compleet

- [ ] `src/sessions/state.ts` — StateManager class
- [ ] `save()`: `session.fromPartition(partition).cookies.get({})` → JSON → disk
- [ ] `load()`: disk → JSON → `session.fromPartition(partition).cookies.set()` per cookie
- [ ] AES-256-GCM encryptie (optioneel, via env `TANDEM_SESSION_KEY`)
- [ ] **Manager Wiring:** Voeg `stateManager` toe aan TandemAPIOptions + startAPI()
- [ ] `POST /sessions/state/save {"name":"twitter"}`
- [ ] `POST /sessions/state/load {"name":"twitter"}`
- [ ] `GET /sessions/state/list`
- [ ] `getSessionPartition()` helper methode in TandemAPI class
- [ ] `X-Session` header op bestaande endpoints (navigate, click, page-content, etc.)
- [ ] `npx tsc` — zero errors
- [ ] Test: state opslaan → sessie destroyen → state laden → cookies terug
- [ ] Test: `X-Session: agent1` header op `/navigate` werkt in agent1 sessie
- [ ] Commit: `feat: session state save/load + X-Session header`

---

## Fase 4: tandem CLI

> **Sessies:** 1
> **Bestanden:** `cli/index.ts`, `cli/client.ts`, `cli/commands/*.ts`, `cli/package.json`, `cli/tsconfig.json`
> **Detail:** `fase-4-cli.md`

### Sessie 4.1: CLI — alle commands

- [ ] `cli/package.json` + `cli/tsconfig.json` (aparte TypeScript config)
- [ ] Root `tsconfig.json` aanpassen: `"cli"` toevoegen aan exclude
- [ ] `cli/client.ts` — HTTP client naar localhost:8765 (Bearer auth)
- [ ] `cli/index.ts` — commander.js + `#!/usr/bin/env node` + globale `--session` optie
- [ ] `tandem open <url>` → POST /navigate
- [ ] `tandem snapshot [--interactive] [--compact] [--selector <s>] [--depth <n>]`
- [ ] `tandem click <sel-or-@ref>` (detecteer @-prefix → /snapshot/click of /click)
- [ ] `tandem fill <sel-or-@ref> <text>`
- [ ] `tandem eval <javascript>`
- [ ] `tandem screenshot [path]` (base64 → `Buffer.from(b64, 'base64')` → file)
- [ ] `tandem cookies` + `tandem cookies set <name> <value>`
- [ ] `tandem session list/create/switch/destroy`
- [ ] `tandem --session <name> <command>` → X-Session header
- [ ] `tandem --help` + `tandem <command> --help`
- [ ] `tandem --version`
- [ ] `cd cli && npx tsc` — zero errors
- [ ] Root `npx tsc` — zero errors (geen conflict met cli/)
- [ ] Test: `tandem open example.com` → navigeert
- [ ] Test: `tandem snapshot -i` → interactive tree
- [ ] Test: `tandem click @e2` → klik via ref
- [ ] Test: `tandem --session agent1 open x.com` → in agent1 sessie
- [ ] Commit: `feat: tandem CLI wrapper (@hydro13/tandem-cli)`

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
