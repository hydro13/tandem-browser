# Kees' Review — Extension Plan (Claude Code Rewrite)

**Datum:** 25 februari 2026  
**Reviewer:** Kees 🧀  
**Beoordeeld:** README.md, CLAUDE.md, STATUS.md, ROADMAP.md, PHASE-1.md t/m PHASE-8.md

---

## Algemeen oordeel

Structureel is dit goed werk. De fasering is logisch, CLAUDE.md is een uitstekende session-instructie, de checklists zijn grondig, en de STATUS.md + ROADMAP.md aanpak voor Claude Code sessies is precies hoe je dit soort werk moet orkestreren. Claude Code zal hiermee uit de voeten kunnen.

**Maar er zijn 3 serieuze gaten die dit plan onveilig maken voor Tandem specifiek.** De rest is verbeterpunten. Lees vooral de rode punten zorgvuldig.

---

## 🔴 KRITIEK — Moet opgelost vóór implementatie

### 1. Security stack is volledig genegeerd — dit is het grootste probleem

Het plan installeert extensions in dezelfde sessie als de hele browser (`persist:tandem`). Dat betekent dat ze rechtstreeks interacteren met je RequestDispatcher, NetworkShield, OutboundGuard, ScriptGuard, en BehaviorMonitor. Er staat nergens een woord over hoe dat uitpakt.

**Het conflict met uBlock Origin (en andere ad blockers):**
Extensions als uBlock Origin installeren `declarativeNetRequest` regels. Die vuren **vóór** je `webRequest` handlers. Dat betekent: uBlock blokkeert een request → NetworkShield ziet het nooit → SecurityDB logt het nooit → EvolutionEngine baseline raakt corrupt → threat scoring klopt niet meer.

Je hebt 811.000 blocklist entries. Als uBlock Origin 300.000 van die domeinen ook blokkeert maar eerder in de pipeline, dan mist je beveiligingslaag al die events. Je hebt geen idee meer wat er geblokkeerd is en waarom.

**Wat gedaan moet worden:**
- Definieer een "extension trust policy" voor de security stack: gaan extension requests door alle beveiligingslagen of niet?
- Overweeg: ad-blocker extensions actief weren uit de gallery (Tandem heeft NetworkShield al — uBlock is redundant en destructief voor je telemetrie), of ze op zijn minst sterk markeren als "⚠️ conflicteert met Tandem Security"
- Extension service worker `fetch()` requests gaan WEL door je webRequest hooks (Electron's webRequest pakt alles in de sessie) — maar `declarativeNetRequest` blokkeert eerder. Dit moet gedocumenteerd en getest worden.

**Wat ook moet:** Verifieer dat OutboundGuard's POST body scanning ook extension-initiated POSTs pakt. Een kwaadaardig script via een extension dat data exfiltreert zou door OutboundGuard moeten worden gepakt, niet eromheen.

---

### 2. Phase 7 (chrome.identity polyfill) werkt NIET voor MV3 extensions

Phase 7 stelt voor om `session.setPreloads()` te gebruiken om de polyfill te injecteren. Dit werkt alleen voor MV2 background pages (die zijn gewone renderers). **Grammarly is MV3.** MV3 extensions gebruiken service workers als background script, en preloads draaien NIET in service workers — alleen in renderer processen.

Concreet: als je dit implementeert zoals beschreven, werkt het voor geen enkele moderne extension. Grammarly, Notion Web Clipper — allemaal MV3 tegenwoordig.

**Correcte aanpak:**
Optie A (eenvoudig): De polyfill als een aparte "companion extension" implementeren die `chrome.identity.launchWebAuthFlow` aanbiedt via `chrome.runtime.sendMessage` cross-extension messaging. Extensies kunnen die dan aanroepen.

Optie B (correct maar complex): In Electron kun je via `ses.protocol.handle()` de `chrome-extension://` protocol requests intercepten. Voor MV3 service workers werkt dit beter. Maar dit vereist diepgaand Electron-begrip.

Optie C (pragmatisch voor nu): Mark extensions die `chrome.identity` gebruiken als `⚠️ Partial` in de gallery, met een note "Login werkt via tabblad" — veel extensions hebben een fallback waarbij ze een gewone browser tab openen voor OAuth. Grammarly doet dit ook. Test of de fallback werkt voordat je de hele polyfill bouwt.

**Aanbeveling:** Optie C eerst. Verificeer of Grammarly's fallback werkt in Electron. Als het werkt, hoeft Phase 7 veel eenvoudiger te zijn dan gepland.

---

### 3. OAuth popup in Phase 7 is een beveiligingsgat

Het plan maakt een `new BrowserWindow()` voor de OAuth flow. Dat window heeft:
- Geen NetworkShield
- Geen ScriptGuard  
- Geen OutboundGuard
- Geen ContentAnalyzer

Een aanvaller die een extension compileert met een kwaadaardige OAuth URL kan zo een volledig onbeschermde browser window openen in Tandem. Dat is een directe bypass van je gehele security stack.

**Fix:** De BrowserWindow voor OAuth MOET dezelfde sessie gebruiken als de main browser, zodat de RequestDispatcher er ook over gaat. Voeg toe aan Phase 7:
```typescript
const popup = new BrowserWindow({
  webPreferences: {
    session: ses, // ← ZELFDE sessie als de main browser
    ...
  }
});
```

---

## 🟡 BELANGRIJK — Moet geadresseerd worden

### 4. Extension ID preservatie — OAuth breekt als ID niet klopt

Wanneer je een CRX uitpakt en via `session.loadExtension()` laadt, gebruikt Electron de `key` field in `manifest.json` om de extension ID te berekenen (zelfde algoritme als Chrome). CWS extensions bevatten deze key altijd in hun manifest.json.

**Maar het plan verifieert dit nergens.** Als de `key` field ontbreekt na extractie (bug in de CRX extractor, truncated download, etc.), krijgt de extension een willekeurige Electron-gegenereerde ID. Dan werken OAuth redirects niet meer — want de OAuth app heeft het echte Chrome extension ID whitelisted (`{chrome-id}.chromiumapp.org`), niet de Electron-gegenereerde ID.

**Voeg toe aan Phase 1 verificatie:**
- Na extractie: verifieer dat `manifest.json` een `key` field heeft
- Log de extension ID die Electron toewijst na `session.loadExtension()`
- Vergelijk die ID met de ID in de CWS URL — ze moeten gelijk zijn

---

### 5. `session.removeExtension()` bestaat wel in Electron 40

Phase 2 zegt dat uninstall "mogelijk een restart vereist (Electron limitation)". Dat is niet meer waar voor Electron 40 — `session.removeExtension(extensionId)` is beschikbaar. Gebruik het. Zo unloadt een extension direct zonder restart.

---

### 6. Session isolation — extensions werken niet in geïsoleerde sessies

Tandem's SessionManager maakt geïsoleerde sessies (`session.fromPartition('persist:session-xxx')`). Extensions worden geladen in `persist:tandem` — de main sessie. Ze zijn NIET beschikbaar in geïsoleerde sessies.

Dit is nu geen blocker, maar zodra gebruikers extensions gaan gebruiken en dan ook `POST /sessions/create` gebruiken voor geïsoleerd browsen, verwachten ze dat hun ad blocker ook daar werkt. Dat doet het niet.

**Voeg toe aan Phase 1 of in een apart Phase 1.5:** Documenteer dit gedrag expliciet in STATUS.md als known limitation. Later kan er een "load extensions in all sessions" optie komen.

---

### 7. `prodversion` is hardcoded — moet dynamisch zijn

```
prodversion=130.0.0.0
```

Dit staat hardcoded in het plan. Electron 40 draait Chromium 130, dus het klopt nu — maar als Electron update naar 41 (Chromium 132), downloadt Tandem misschien de verkeerde CRX versie (MV3 format-wise).

**Fix:** `process.versions.chrome` geeft de Chromium versie terug in Electron. Gebruik dat:
```typescript
const chromiumVersion = process.versions.chrome?.split('.')[0] + '.0.0.0' ?? '130.0.0.0';
const crxUrl = `...&prodversion=${chromiumVersion}&...`;
```

---

### 8. Geen update mechanisme — beveiligingsrisico

Geïnstalleerde extensions auto-updaten niet. Chrome doet dit zelf via de CRX server. Als een extension een security fix krijgt (en dat gebeurt regelmatig — uBlock Origin en Grammarly updaten constant), blijft Tandem's installatie achter.

Dit is geen Phase 1 probleem maar moet in de roadmap staan. Voeg toe aan ROADMAP.md:

**Phase 9 (toekomst): Extension Auto-Updates**
- Weekly check: voor elke geïnstalleerde extension, download de huidige CRX en vergelijk manifest versie
- Als nieuwer: update automatisch (verwijder oude, installeer nieuwe)
- CRX hash verificatie om supply chain attacks te voorkomen

---

### 9. Toekomstige extensions — gallery is hardcoded TypeScript

De gallery in `gallery.ts` is een hardcoded array in TypeScript code. Elke nieuwe populaire extension toevoegen vereist een code change + deploy.

**Betere aanpak:** `~/.tandem/extensions/gallery.json` die bij startup geladen wordt, eventueel te updaten zonder rebuild. Of een optionele remote gallery endpoint (privacy-preserving — geen tracking, alleen een statische JSON file op een CDN).

---

## ✅ WAT GOED IS

- **CLAUDE.md is uitstekend** — de "one session per phase" regel, STATUS.md als entry point, de scope-beperkingen per fase, de "do NOT do" lijst — dit is precies hoe je Claude Code moet inzetten voor een groot project
- **CRX header parsing** — CRX2 en CRX3 zijn allebei correct beschreven (version 2 vs 3, header byte layout)
- **npm is correct** — Tandem heeft package-lock.json, dus `npm install adm-zip` is juist (niet pnpm)
- **`npm start` rule** — de waarschuwing over `ELECTRON_RUN_AS_NODE` is goud, Claude Code doet dit fout als je het niet expliciet zegt
- **Platform-aware Chrome paths** — macOS/Windows/Linux alle drie correct
- **Version subfolder logic** in Chrome importer — sorted + reversed voor laatste versie is correct
- **`fs.cpSync`** — correct, beschikbaar vanaf Node 16.7+, Tandem draait Node 25
- **Graceful degradation** voor native messaging — juiste aanpak
- **Pre-existing TypeScript errors** in tests vermeld — dit is een echte valkuil die Claude Code anders als blocker ziet
- **Phase scope limitations** — elke fase heeft een expliciete "do NOT do" lijst, dit voorkomt scope creep tussen sessies

---

## Aanbevolen aanpassingen aan het plan

### Aan CLAUDE.md toevoegen (Security Rules sectie):

```markdown
## Security Stack Rules

Tandem has a 6-layer security stack (NetworkShield, OutboundGuard, ContentAnalyzer, 
ScriptGuard, BehaviorMonitor, GatekeeperWebSocket) wired into the RequestDispatcher 
in main.ts. Extensions MUST NOT break this.

Rules:
1. NEVER bypass the RequestDispatcher for extension network requests
2. Extensions that install declarativeNetRequest rules (ad blockers) conflict with 
   NetworkShield — mark them as ⚠️ in the gallery with a conflict warning
3. OAuth popup windows (Phase 7) MUST use the same session as the main browser
4. Extensions run in persist:tandem — they do NOT run in isolated sessions
5. After session.loadExtension(), verify the assigned extension ID matches the 
   expected Chrome Store ID (check manifest.json has a 'key' field)
```

### Aan PHASE-1.md toevoegen (verification checklist):

```
- [ ] manifest.json in extracted extension contains 'key' field
- [ ] Extension ID assigned by Electron matches the CWS extension ID (log both)
- [ ] Extension network requests are visible in RequestDispatcher logs
- [ ] Security stack is not bypassed by extension requests
```

### Aan PHASE-7.md — complete rewrite van het polyfill mechanisme:

Vervang de `session.setPreloads()` aanpak met:
1. Test eerst of Grammarly's fallback OAuth (via normale browser tab) al werkt in Electron
2. Als dat werkt — klaar, geen polyfill nodig voor Phase 7
3. Als niet — MV2 background pages: preload werkt; MV3 service workers: companion extension nodig

### Aan ROADMAP.md toevoegen:

```markdown
## Phase 9 (Future): Extension Auto-Updates
- Weekly version check via CWS CRX endpoint
- Automatic update if newer version available
- CRX hash verification

## Phase 10 (Future): Extension Conflict Management  
- Detect when ad-blocker extensions conflict with NetworkShield
- Show warning in gallery for conflicting extensions
- Option to run extension in isolated session (separate from main session)
```

---

## Conclusie

**Start Phase 1 — maar met de security rules in CLAUDE.md eerst toegevoegd.** De CRX downloader en ExtensionManager zijn correct ontworpen en zullen werken. Phase 2 ook. Phase 3 ook.

**Phase 7 moet geherschreven worden** vóór implementatie — de preload aanpak werkt niet voor MV3 service workers.

**De OAuth popup BrowserWindow fix** (zelfde sessie) moet in Phase 7 zitten voor veiligheid.

**De extension/security-stack conflicten** zijn het grootste lange-termijn risico. Nu niet alles oplossen, maar documenteer het en zorg dat de gallery ad-blocker extensions markeert als conflicterend met NetworkShield.

Het plan is 85% klaar. De missing 15% zijn precies de dingen die Tandem anders maken dan een gewone browser — de security stack en de agent-browser architectuur. Dat is ook waarom Claude Code ze gemist heeft: het las de Tandem-specifieke context niet volledig.

— Kees 🧀
