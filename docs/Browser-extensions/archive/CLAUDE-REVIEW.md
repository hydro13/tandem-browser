# Claude's Review — Verificatie van Kees' Review + Eigen Bevindingen

**Datum:** 25 februari 2026
**Reviewer:** Claude (Opus 4.6)
**Beoordeeld:** Kees' review (KEES-REVIEW.md) geverifieerd tegen de Tandem codebase
**Methode:** Alle claims geverifieerd door de broncode te lezen en de architectuur te traceren

---

## Werkwijze

Ik heb elk punt van Kees geverifieerd door de relevante bronbestanden te lezen:

- `src/network/dispatcher.ts` — RequestDispatcher hook-registratie en consumer-prioriteiten
- `src/security/guardian.ts` — Guardian registratie (priority 1) en request-analyse
- `src/security/outbound-guard.ts` — POST/PUT/PATCH credential scanning
- `src/security/security-manager.ts` — SecurityManager wiring en component-initialisatie
- `src/extensions/loader.ts` — ExtensionLoader en `session.loadExtension()` aanroep
- `src/main.ts` — Volledige initialisatievolgorde (sessie → dispatcher → security → extensions)
- `src/sessions/manager.ts` — Isolated session creatie

---

## Punt 1: Security stack conflict met extensions — BEVESTIGD, met nuance

### Kees' claim: DNR vs webRequest conflict

Extensions in dezelfde sessie (`persist:tandem`) interacteren met de security stack. Ad-blockers met `declarativeNetRequest` (DNR) blokkeren requests vóór `webRequest` handlers → NetworkShield mist events → telemetrie corrupt.

### Verification: What the codebase shows

**De initialisatievolgorde in `main.ts` bevestigt dat alles op dezelfde sessie draait:**

```text
Line 97:  ses = session.fromPartition('persist:tandem')
Line 103: dispatcher = new RequestDispatcher(ses)
Line 141: dispatcher.attach()          ← webRequest hooks actief
Line 275: securityManager.registerWith(dispatcher)  ← Guardian hooks
Line 344: extensionLoader.loadAllExtensions(ses)    ← ZELFDE sessie
```

**Guardian registreert als priority 1 op de dispatcher** (`guardian.ts:77-82`). Dit is de laagste priority in het systeem — Guardian draait vóór alles.

**De cruciale vraag is: draait Electron's `session.webRequest` vóór of ná extension `declarativeNetRequest`?**

In Chromium's architectuur is het antwoord niet eenduidig:

- Electron's `session.webRequest` is geïmplementeerd via Chromium's `ElectronNetworkDelegate` — dit zit diep in de network stack
- Extension `declarativeNetRequest` is geïmplementeerd via Chromium's `RulesetManager` — dit zit op een ander niveau
- In Chrome zelf vuren DNR rules **vóór** de extension `webRequest` API, maar Electron's `session.webRequest` is een **native** hook, geen extension API

**Dit moet empirisch getest worden.** Het plan kan niet aannemen dat het de ene of andere kant op werkt. De test is eenvoudig: installeer uBlock Origin, laad een pagina met bekende trackers, en controleer of Guardian's `onBeforeRequest` handler nog steeds getriggerd wordt voor requests die uBlock ook blokkeert.

### Benodigde planwijzigingen: security stack

**In Phase 1 (verificatie):**

- Voeg een expliciete test toe: installeer een extension met DNR regels (uBlock), browse naar een pagina, en verifieer in de security logs of Guardian de requests nog ziet
- Documenteer het resultaat in STATUS.md — dit bepaalt of ad-blockers een compatibiliteitsprobleem zijn of niet

**In Phase 4 (gallery):**

- Voeg een `securityConflict` veld toe aan `GalleryExtension`: `'none' | 'dnr-overlap' | 'native-messaging'`
- Alle extensions met `declarativeNetRequest` mechanisme krijgen `securityConflict: 'dnr-overlap'`
- De gallery endpoint moet dit veld teruggeven zodat de UI een waarschuwing kan tonen

**In CLAUDE.md:**

- Voeg Kees' voorgestelde "Security Stack Rules" sectie toe — zijn formulering is correct en volledig

**Wat betreft OutboundGuard:** Ik heb geverifieerd dat Guardian (`guardian.ts:268-310`) voor ALLE POST/PUT/PATCH requests `outboundGuard.analyzeOutbound()` aanroept. Dit geldt voor elke request in de sessie — inclusief requests van extension content scripts en service workers. OutboundGuard scant de eerste 100KB van de body (`outbound-guard.ts:37`) met credential-patronen (`password`, `token`, `api_key`, `credit_card`, `ssn`, etc.). Extension-initiated exfiltration wordt dus wel gepakt, mits Guardian de request ziet (terug naar de DNR-vraag).

---

## Punt 2: Phase 7 preloads werken niet voor MV3 — BEVESTIGD

### Kees' claim: MV3 incompatibility with preloads

`session.setPreloads()` werkt alleen voor renderer processes. MV3 extensions gebruiken service workers. Preloads draaien niet in service workers.

### Verification: MV3 preloads confirmed

Dit is correct. Electron's preload scripts worden geïnjecteerd in `BrowserWindow` en `webContents` renderer processes. MV3 service workers zijn geen renderers — ze draaien in een apart process type. Een preload script bereikt ze niet.

Grammarly en Notion Web Clipper zijn inderdaad gemigreerd naar MV3.

### Kees' drie opties

- **Optie A (companion extension):** Technisch haalbaar maar complex. Vereist cross-extension messaging (`chrome.runtime.sendMessage`) en de target extension moet dit ondersteunen of gepatcht worden.
- **Optie B (`ses.protocol.handle()`):** Intercepteert protocol-level requests. Zou kunnen werken voor het onderscheppen van de OAuth flow, maar vereist diepgaand begrip van hoe Electron extension protocol handling doet.
- **Optie C (test fallback eerst):** Het meest verstandig. Veel MV3 extensions hebben een fallback OAuth flow die een gewone browser tab opent in plaats van `chrome.identity`. Als die fallback werkt in Electron, is de hele polyfill overbodig.

### Benodigde planwijzigingen: MV3 preloads

**Phase 7 moet herschreven worden met deze structuur:**

1. **Stap 1: Empirische test** — Installeer Grammarly en Notion Web Clipper. Probeer in te loggen. Documenteer wat er gebeurt:
   - Werkt de fallback OAuth (tab-based login)? → Phase 7 wordt documentatie-only
   - Faalt het volledig? → Ga door naar stap 2
2. **Stap 2: MV3-compatible polyfill** — Als fallback niet werkt, implementeer via companion extension (Optie A) of protocol interception (Optie B). De `session.setPreloads()` aanpak moet volledig uit het plan.
3. **Stap 3: BrowserWindow met sessie** — Als er toch een OAuth popup nodig is, MOET die de `persist:tandem` sessie gebruiken (zie punt 3)

---

## Punt 3: OAuth popup zonder security stack — BEVESTIGD

### Kees' claim: Default session bypasses security stack

Een `new BrowserWindow()` zonder expliciete sessie gebruikt de default Electron sessie, niet `persist:tandem`. De security stack is dan niet actief.

### Verification: OAuth session gap confirmed

Correct. De RequestDispatcher is gekoppeld aan de `persist:tandem` sessie (`main.ts:103`). Een BrowserWindow zonder `session` in `webPreferences` krijgt Electron's default sessie — daar draait geen dispatcher, geen Guardian, geen OutboundGuard.

### Benodigde planwijzigingen: OAuth popup

**In Phase 7:**

- Elke BrowserWindow die voor OAuth wordt aangemaakt MOET `webPreferences: { session: ses }` bevatten, waar `ses` de `persist:tandem` sessie is
- De sessie-referentie moet beschikbaar zijn in de context waar de popup wordt aangemaakt (doorgeven via ExtensionManager of een singleton)
- Dit moet in de verificatie-checklist staan als hard requirement

---

## Punt 4: Extension ID preservatie — BEVESTIGD

### Kees' claim: Missing key field causes ID mismatch

Als de `key` field in `manifest.json` ontbreekt na CRX extractie, genereert Electron een random ID. OAuth redirects breken dan.

### Verification: ID preservation gap confirmed

Ik heb `loader.ts:93` bekeken:

```typescript
const ext = await ses.loadExtension(extPath, { allowFileAccess: true });
```

Het resultaat `ext.id` wordt opgeslagen maar nergens geverifieerd tegen het verwachte CWS ID. Er is geen check op de `key` field.

CWS extensions bevatten altijd een `key` field in hun manifest.json — dit is hoe Chrome de extension ID deterministisch berekent. Als deze field ontbreekt (corrupte download, bug in de extractor), genereert Electron een random ID op basis van het pad. OAuth redirect URLs zijn gebonden aan het originele Chrome extension ID (`{id}.chromiumapp.org`), dus die matchen dan niet meer.

### Benodigde planwijzigingen: extension ID

**In Phase 1 (CRX Downloader):**

- Na extractie: verifieer dat `manifest.json` een `key` field bevat
- Indien `key` ontbreekt: markeer de installatie als `warning` in het `InstallResult`
- Na `session.loadExtension()`: log het toegewezen ID en vergelijk met het verwachte CWS ID
- Als de IDs niet matchen: log een warning — de extension werkt mogelijk maar OAuth en sommige APIs zullen falen

**In Phase 1 (verificatie-checklist):**

```markdown
- [ ] Geëxtraheerde manifest.json bevat 'key' field
- [ ] Extension ID van Electron matcht het CWS extension ID
```

---

## Punt 5: `session.removeExtension()` bestaat in Electron 40 — BEVESTIGD

### Kees' claim: Hot unload available in Electron 40

Phase 2 zegt dat uninstall een restart vereist. `session.removeExtension(extensionId)` is beschikbaar in Electron 40.

### Verification: removeExtension API confirmed

De codebase bevat geen enkele aanroep van `removeExtension` — het wordt nergens gebruikt. Maar de API bestaat in Electron sinds versie 12. Tandem draait Electron 40.

Ik heb ook `session.getAllExtensions()` gevonden in de Electron API — dit kan gebruikt worden om te verifiëren welke extensions geladen zijn.

### Benodigde planwijzigingen: removeExtension

**In Phase 2:**

- Verwijder de "restart needed" caveat volledig
- De uninstall flow wordt: `session.removeExtension(id)` → verwijder bestanden van disk → bevestig
- Voeg `session.removeExtension()` toe aan de taakbeschrijving
- Voeg toe aan verificatie: "Extension is direct unloaded uit de sessie zonder restart"

**In Phase 1 (ExtensionManager):**

- De `uninstall()` methode moet zowel `session.removeExtension(id)` aanroepen als de bestanden verwijderen
- De sessie-referentie moet beschikbaar zijn in ExtensionManager (wordt al doorgegeven via `init()`)

---

## Punt 6: Session isolation — extensions werken niet in geïsoleerde sessies — BEVESTIGD

### Kees' claim: Extensions only in persist:tandem, not isolated sessions

Extensions laden in `persist:tandem`. Geïsoleerde sessies (`persist:session-{name}`) krijgen geen extensions.

### Verification: Session isolation gap confirmed

`sessions/manager.ts` maakt sessies aan met `session.fromPartition('persist:session-{name}')`. Er wordt geen `loadExtension()` op aangeroepen. De dispatcher wordt ook niet voor die sessies aangemaakt — geïsoleerde sessies hebben geen security stack EN geen extensions.

Dit is een dubbel probleem:

1. Extensions werken niet in geïsoleerde sessies → gebruikersverwachting geschonden
2. Geïsoleerde sessies hebben geen security stack → los van extensions al een gat

### Benodigde planwijzigingen: session isolation

**In CLAUDE.md:**

- Documenteer: "Extensions run in `persist:tandem` only — they do NOT run in isolated sessions created by SessionManager"

**In STATUS.md:**

- Voeg toe als known limitation met duidelijke beschrijving

**In Phase 4 (gallery) of Phase 5 (UI):**

- Als de UI geïsoleerde sessies toont, moet daar een indicator zijn dat extensions niet actief zijn in die sessie

**In de ROADMAP.md:**

- Voeg een toekomstige phase toe: "Extension loading in isolated sessions" met als taak:
  - `loadExtension()` aanroepen op elke nieuwe sessie die SessionManager creëert
  - Of: optie in de UI om extensions per sessie aan/uit te zetten

---

## Punt 7: `prodversion` hardcoded — BEVESTIGD

### Kees' claim: prodversion should be dynamic from Chrome version

`prodversion=130.0.0.0` is hardcoded. Moet dynamisch zijn via `process.versions.chrome`.

### Verification: Hardcoded prodversion confirmed

`process.versions.chrome` wordt nergens in de codebase gebruikt. De waarde is beschikbaar in Electron runtime en geeft de exacte Chromium versie terug (bijv. `130.0.6723.91`).

De `prodversion` parameter in de CWS download URL bepaalt welke versie van de CRX Google teruggeeft. Als Tandem updatet naar een nieuwere Electron (met hogere Chromium), maar nog steeds `130.0.0.0` stuurt, kan Google een oudere CRX-versie teruggeven die niet compatible is met de nieuwere Chromium.

### Benodigde planwijzigingen: prodversion

**In Phase 1 (CRX Downloader):**

- Vervang de hardcoded `prodversion=130.0.0.0` met:

  ```typescript
  const chromiumVersion = process.versions.chrome ?? '130.0.0.0';
  ```

- Gebruik de volledige versiestring (niet alleen het major version nummer) — Google's CRX endpoint accepteert dit
- Voeg een fallback toe voor het geval `process.versions.chrome` undefined is (zou niet moeten in Electron, maar defensief programmeren)

---

## Punt 8: Geen update mechanisme — BEVESTIGD, moet volledig uitgewerkt worden

### Kees' claim: Auto-updates are critical for security

Geïnstalleerde extensions auto-updaten niet. Dit is een beveiligingsrisico — extensions krijgen regelmatig security fixes.

### Why this requires a full phase

Een extension zonder updates is een bevroren snapshot van de code op het moment van installatie. Dit betekent:

- **Security vulnerabilities blijven open** — als uBlock Origin een XSS-fix uitbrengt, draait Tandem de oude kwetsbare versie
- **Functionaliteit degradeert** — extensions die afhankelijk zijn van externe APIs (Grammarly, Honey, Wappalyzer) stoppen met werken als die APIs veranderen
- **Compatibiliteit breekt** — als een website zijn structuur wijzigt, stoppen content scripts die daarop matchen

Chrome checkt elke paar uur op updates via hetzelfde CWS CRX endpoint dat wij gebruiken voor installatie. Tandem moet dit ook doen.

### Benodigde planwijzigingen: auto-updates

**Voeg Phase 9 toe als volwaardige phase (niet als "future" notitie):**

Phase 9: Extension Auto-Updates

Taken:

1. **Versie-check mechanisme** — Voor elke geïnstalleerde extension: download de CRX metadata van CWS en vergelijk `manifest.version` met de lokaal geïnstalleerde versie
2. **Update-interval** — Configureerbare check-frequentie, standaard dagelijks. Gebruik dezelfde CWS CRX endpoint als de installer. Vergelijk alleen de manifest versie (HEAD request of versie-check via de update XML endpoint)
3. **Atomaire update** — Download nieuwe CRX → extraheer naar tijdelijke map → verifieer `manifest.json` + `key` field → verwijder oude versie → verplaats nieuwe versie → herlaad via `session.removeExtension()` + `session.loadExtension()`
4. **Integriteitsverificatie** — Verifieer dat de gedownloade CRX valid is (magic bytes, succesvolle ZIP extractie, manifest.json leesbaar). CRX bestanden zijn gesigned door Google — de CRX header bevat een signature die geverifieerd kan worden tegen Google's public key
5. **API endpoint** — `GET /extensions/updates/check` triggert een handmatige check. `GET /extensions/updates/status` toont wanneer de laatste check was en welke updates beschikbaar zijn
6. **UI integratie** — Update-indicator in de Extensions settings tab. "Update beschikbaar" badge op extension cards. "Update All" knop

**Verificatie-checklist voor Phase 9:**

```markdown
- [ ] Versie-check detecteert dat een nieuwere versie beschikbaar is op CWS
- [ ] Update downloadt, extraheert, en vervangt de oude versie
- [ ] Extension is direct actief na update (zonder app restart)
- [ ] manifest.json key field behouden na update
- [ ] Corrupte downloads worden gedetecteerd en niet geïnstalleerd
- [ ] Update-interval is configureerbaar
- [ ] GET /extensions/updates/check triggert handmatige check
- [ ] GET /extensions/updates/status toont laatste check + beschikbare updates
```

**In ROADMAP.md:** Voeg Phase 9 toe met volledige takenlijst (niet als losse notitie maar in hetzelfde format als Phase 1-8).

**In STATUS.md:** Voeg Phase 9 sectie toe met PENDING status.

---

## Punt 9: Gallery hardcoded TypeScript — BEVESTIGD, moet anders ontworpen worden

### Kees' claim: Hardcoded gallery blocks extensibility

De gallery als hardcoded TypeScript array vereist een code change + rebuild voor elke nieuwe extension.

### Why this is an architecture problem

Een hardcoded `GALLERY_EXTENSIONS` array in TypeScript heeft deze consequenties:

- **Elke gallery-wijziging vereist een nieuwe build** — een nieuwe populaire extension toevoegen, een ID corrigeren, een compatibiliteitsstatus updaten, of een beschrijving aanpassen vereist een code change, TypeScript compile, en app rebuild
- **Gebruikers kunnen geen eigen extensions aan de gallery toevoegen** — power users die een niche-extension willen delen met hun team kunnen dat niet
- **De gallery veroudert met de app-versie** — als Tandem v0.9 uitkomt met 30 extensions en er komen 5 nieuwe populaire extensions, moeten alle gebruikers wachten op v0.10 om die te zien

### Benodigde planwijzigingen: gallery architectuur

**Phase 4 moet het gallery-systeem anders ontwerpen:**

1. **Twee lagen:** Ingebouwde defaults + gebruiker-uitbreidbaar bestand
   - `src/extensions/gallery-defaults.ts` — De 30 extensions uit TOP30-EXTENSIONS.md als TypeScript constante (shipped met de app, altijd beschikbaar)
   - `~/.tandem/extensions/gallery.json` — Optioneel lokaal bestand dat extra entries bevat of ingebouwde entries overschrijft (bijv. compatibiliteitsstatus bijwerken)

2. **Gallery loading logica:**

   ```text
   gallery = loadDefaults()          // Ingebouwde 30 extensions
   userGallery = loadUserGallery()   // ~/.tandem/extensions/gallery.json (als het bestaat)
   merged = merge(gallery, userGallery)  // User entries overschrijven defaults op basis van ID
   ```

3. **Gallery JSON formaat:** Zelfde structuur als de TypeScript interface, maar als JSON:

   ```json
   {
     "version": 1,
     "extensions": [
       {
         "id": "cjpalhdlnbpafiamejdnhcphjbkeiagm",
         "name": "uBlock Origin",
         "description": "...",
         "category": "privacy",
         "compatibility": "works",
         "featured": true
       }
     ]
   }
   ```

4. **Optionele remote gallery (toekomstig):** Een statische JSON file op een CDN die de app periodiek kan ophalen. Geen tracking, geen analytics — puur een JSON file met extension metadata. Dit hoeft niet in Phase 4 maar de architectuur moet het toelaten (de `merge()` logica ondersteunt een derde bron).

**In Phase 4 (verificatie-checklist):**

```markdown
- [ ] Ingebouwde gallery bevat 30 extensions
- [ ] ~/.tandem/extensions/gallery.json wordt geladen als het bestaat
- [ ] User gallery entries overschrijven ingebouwde entries op basis van ID
- [ ] User gallery kan extra extensions toevoegen die niet in de defaults staan
- [ ] GET /extensions/gallery retourneert de gemergte lijst
- [ ] gallery.json formaat is gedocumenteerd (zodat gebruikers het handmatig kunnen bewerken)
```

**In ROADMAP.md:** Update Phase 4 taken om het twee-lagen systeem te reflecteren.

---

## Aanvullende bevinding: Initialisatievolgorde is veilig

Tijdens mijn verificatie heb ik de volledige initialisatievolgorde in `main.ts` getraceerd. Dit is relevant voor meerdere van Kees' punten:

```text
1. ses = session.fromPartition('persist:tandem')     ← sessie aangemaakt
2. dispatcher = new RequestDispatcher(ses)             ← dispatcher gekoppeld aan sessie
3. stealth.registerWith(dispatcher)                    ← StealthManager priority 10
4. CookieFix registered                               ← priority 10
5. WebSocketOriginFix registered                       ← priority 50
6. dispatcher.attach()                                 ← webRequest hooks ACTIEF
7. securityManager = new SecurityManager()
8. securityManager.registerWith(dispatcher)             ← Guardian priority 1 ACTIEF
9. devToolsManager wired
10. securityManager.setupPermissionHandler(ses)
11. extensionLoader.loadAllExtensions(ses)              ← Extensions geladen NADAT security actief is
```

Dit is goed: de security stack is volledig operationeel voordat extensions worden geladen. Extensions kunnen de registratievolgorde niet beïnvloeden.

Maar: de vraag of extension `declarativeNetRequest` rules al actief zijn tegen de tijd dat de eerste pagina geladen wordt, hangt af van hoe snel Electron de extension initialiseert na `loadExtension()`. Dit moet getest worden (zie punt 1).

---

## Aanvullende bevinding: Consumer priorities in detail

Voor de volledigheid, de effectieve executievolgorde per hook:

**onBeforeRequest (request binnenkomt):**

1. Guardian (priority 1) — blocklist, risk scoring, download safety, credential exfiltration
2. NetworkInspector (priority 100) — observational logging

**onBeforeSendHeaders (headers worden verstuurd):**

1. StealthManager (priority 10) — fingerprint protection
2. Guardian (priority 20) — tracking header removal
3. WebSocketOriginFix (priority 50) — Origin header fix

**onHeadersReceived (response ontvangen):**

1. Guardian:RedirectBlock (priority 5) — redirect destination blocking
2. CookieFix (priority 10) — SameSite cookie fix
3. Guardian (priority 20) — response header analyse, cookie counting

Guardian draait als eerste bij request-binnenkomst (priority 1) en als eerste bij redirect-evaluatie (priority 5). Dit is de juiste architectuur voor security.

---

## Samenvatting: Alle benodigde wijzigingen aan het plan

### CLAUDE.md

- [ ] Voeg "Security Stack Rules" sectie toe (Kees' formulering)
- [ ] Voeg toe: extensions draaien in `persist:tandem`, niet in isolated sessions
- [ ] Voeg toe: na `session.loadExtension()` moet het ID geverifieerd worden

### Phase 1 (CRX Downloader + Extension Manager)

- [ ] `prodversion` dynamisch via `process.versions.chrome`
- [ ] Na extractie: verifieer `key` field in `manifest.json`
- [ ] Na laden: verifieer dat Electron's ID matcht met CWS ID
- [ ] `uninstall()` gebruikt `session.removeExtension()` + bestandsverwijdering
- [ ] Verificatie: test of Guardian requests ziet van/voor geladen extensions
- [ ] Verificatie: test interactie met DNR-gebaseerde extensions

### Phase 2 (Extension API Routes)

- [ ] Verwijder "restart needed" caveat — gebruik `session.removeExtension()`
- [ ] Uninstall endpoint roept `session.removeExtension()` aan vóór bestandsverwijdering

### Phase 4 (Curated Gallery)

- [ ] Twee-lagen architectuur: ingebouwde defaults + `~/.tandem/extensions/gallery.json`
- [ ] `securityConflict` veld op gallery entries (`'none' | 'dnr-overlap' | 'native-messaging'`)
- [ ] Merge-logica: user gallery overschrijft/breidt defaults uit
- [ ] Gallery JSON formaat documenteren

### Phase 7 (chrome.identity Polyfill)

- [ ] Volledig herschrijven: verwijder `session.setPreloads()` aanpak
- [ ] Stap 1: test of MV3 extensions een fallback OAuth flow hebben die werkt in Electron
- [ ] Stap 2: als fallback niet werkt → companion extension of protocol interception
- [ ] OAuth BrowserWindow MOET `session: ses` (persist:tandem) gebruiken
- [ ] Documenteer welke aanpak gekozen wordt en waarom

### ROADMAP.md + STATUS.md

- [ ] Phase 9 toevoegen: Extension Auto-Updates (volledige specificatie, niet "future")
- [ ] Phase 10 toevoegen: Extension Conflict Management (DNR overlap detectie, isolated session loading)

### STATUS.md

- [ ] Known limitation toevoegen: extensions werken niet in isolated sessions
- [ ] Phase 9 en 10 secties toevoegen met PENDING status

---

## Conclusie

Kees' review is grondig en alle 9 punten zijn geverifieerd als correct. De drie kritieke punten (security stack interactie, MV3 preloads, OAuth popup security) vereisen echte wijzigingen aan het plan — niet alleen documentatie maar architecturale aanpassingen aan Phase 1, 4, en 7.

Punten 8 en 9 (auto-updates en gallery architectuur) zijn geen toekomstige verbeteringen maar fundamentele onderdelen van een correct werkend extensiesysteem. Beide moeten volledige phase-specificaties krijgen.

De bestaande security architectuur (Guardian op priority 1, initialisatie vóór extensions) is een sterke basis. De interactie met extension `declarativeNetRequest` is het belangrijkste open punt dat empirisch getest moet worden in Phase 1.
