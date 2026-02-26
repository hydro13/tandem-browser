# Kees' Review — Extension Plan v2

**Datum:** 25 februari 2026  
**Reviewer:** Kees 🧀  
**Beoordeeld:** Volledige herziening — CLAUDE.md, PHASE-1 t/m PHASE-10b

---

## Algemeen oordeel

Dit is significant beter dan v1. De drie kritieke gaten die ik in de eerste review aanwees zijn allemaal gedicht:

- ✅ Security Stack Rules toegevoegd aan CLAUDE.md — correct en compleet
- ✅ Phase 7 grondig herschreven — MV3 preload probleem erkend, empirische test eerst, companion extension als fallback
- ✅ OAuth popup moet `persist:tandem` session gebruiken — staat er nu expliciet in
- ✅ `session.removeExtension()` gebruikt — geen restart nodig meer
- ✅ `prodversion` is dynamisch via `process.versions.chrome`
- ✅ CRX3 signature verificatie toegevoegd aan Phase 1
- ✅ Extension ID verificatie na extractie (manifest `key` field)
- ✅ Auto-updates Phase 9 — batch protocol, atomic swaps, rollback
- ✅ Gallery is twee-laags (defaults + user `gallery.json`)
- ✅ DNR conflict detection (10a) + reconciliation (10b) — dit is uitzonderlijk goed nagedacht

Het plan is nu implementeerbaar. Hieronder de resterende punten — allemaal verfijningen, geen showstoppers.

---

## 🔴 Één serieus technisch risico

### Protobuf handmatig parsen voor CRX3 signature verificatie

Phase 1 vraagt Claude Code om de CRX3 protobuf header "handmatig te parsen zonder library, want het zijn maar een paar varint + length-delimited fields." Dit is te optimistisch.

De `CrxFileHeader` protobuf bevat:
- Geneste message types (`sha256_with_rsa`, `sha256_with_ecdsa`)
- Arrays van `{public_key, signature}` pairs
- Variabele varint-lengtes per field
- Optionele fields die weggelaten kunnen worden

Handmatige protobuf parsing is een bekende bron van subtle bugs — een off-by-one in varint decoding, een verkeerde field tag, en je leest de verkeerde bytes als publieke sleutel. Het resultaat: verificatie die altijd slaagt (fout-positief) of altijd faalt (fout-negatief).

**Twee opties, kies er één:**

**Optie A (aanbevolen):** Voeg `google-protobuf` of `protobufjs` toe als dependency. De CRX3 proto definitie is gepubliceerd door Google. Eén npm install, parse correct.

**Optie B (pragmatisch):** Maak de signature verificatie doelstelling bescheidener. HTTPS garandeert al transport-integriteit — als je de CRX over HTTPS van Googles CDN downloadt zonder redirect naar een non-Google domain, is de kans op MITM-tampering al vrijwel nul. Verifieer dan alleen:
1. Magic bytes zijn `Cr24` ✓
2. Download was van `clients2.google.com` zonder redirect naar vreemde host ✓
3. ZIP is valid (AdmZip kan hem uitpakken zonder errors) ✓
4. `manifest.json` bevat geldige JSON met `name`, `version`, `key` ✓

Voeg een comment toe: "Full RSA signature verification via protobuf requires Phase 1.x — see issue #X." En set `signatureVerified: false` voor alle CRX3 installs totdat dat gebouwd is. Eerlijk en correct.

Kies Optie A als je de claim wilt maken dat Tandem "CRX3 signature-verified installs" doet. Kies Optie B als je wilt dat Phase 1 binnen een dag klaar is.

---

## 🟡 Vier verbeterpunten

### 1. Phase 10b — DNR delta analyse is theoretisch fragiel

De "network delta analysis" in 10b.2 is creatief maar de praktische nauwkeurigheid zal slecht zijn:

- **Reden A:** Een domain dat niet in Guardian's traffic verschijnt kan ook gecached zijn (browser cache, HTTP/304). Geen netwerkaanvraag = Guardian ziet niets = jij denkt dat DNR het blokkeerde.
- **Reden B:** "Domains commonly seen on similar pages" vereist een baseline die op het moment van implementatie nog niet bestaat. Je hebt EvolutionEngine data nodig van honderden page loads.
- **Reden C:** Een enkelvoudige page load geeft te weinig signal. Een e-commerce pagina laadt soms tracking pixels, soms niet — afhankelijk van A/B tests, user state, cache state.

Dit leidt tot SecurityDB-vervuiling met `confidence: 'inferred'` events die meer ruis dan signaal zijn.

**Betere aanpak voor 10b.2 (vervang de delta analyse):**

Bij het *installeren* van een DNR extension (en bij elke update):
1. Lees alle DNR rule files
2. Extraheer alle domeinen met `action.type: "block"`
3. Sla dit op in SecurityDB als `{ source: 'extension-dnr', extensionId, domains: [...] }`
4. Wanneer NetworkShield of Guardian een request ziet naar een domain IN deze set, log: `"Domain also in extension DNR ruleset (extension may block before Guardian)"`

Dit is **statische analyse** — 100% accurate, nul false positives, geen runtime overhead. Het geeft je precies de informatie die je nodig hebt: "uBlock blokkeert 310,000 domains waarvan er 245,000 ook in NetworkShield zitten." Dat is de overlap analyse van 10b.4 die je dan gratis krijgt.

Behoud 10b.3 en 10b.4 (synthetic logging en overlap analysis) maar gooi 10b.2's runtime delta approach overboord en vervang door statische scan bij install.

---

### 2. Phase 7 — Scenario B heeft geen concrete implementatiespec

Phase 7 zegt: "als test mislukt, implementeer Optie A (companion extension) of Optie B (protocol intercept), kies op basis van testing."

Dit is te vaag voor Claude Code. Als Grammarly's fallback OAuth niet werkt, staat Claude Code voor een architectuurkeuze zonder genoeg context. Dan gaat het ofwel de verkeerde optie kiezen, ofwel halverwege vastlopen.

**Fix:** Wees prescriptief. Verander 7.2 naar:

> "Als Scenario B: implementeer Optie A (companion extension). Als je na 2 uur nog niet de `chrome.runtime.onMessageExternal` flow werkend hebt, stop dan. Update STATUS.md als BLOCKED en rapporteer aan Robin welke stap faalt. Phase 7 kan later opgepakt worden — de 22/30 extensions die geen `chrome.identity` gebruiken werken al prima."

Dit geeft Claude Code een duidelijke exit-strategie en voorkomt dat het vastloopt in een rabbit hole.

---

### 3. Phase 10a — ScriptGuard whitelist API niet gespecificeerd

CLAUDE.md zegt: "After loading an extension, read its `content_scripts` manifest entry and log the URL patterns for auditing. Phase 10a registers broad patterns as known-trusted in ScriptGuard context."

Phase 10a.1 zegt: "Log these broad content scripts as known-trusted in ScriptGuard context. This creates a whitelist so ScriptGuard doesn't flag extension-injected scripts as suspicious."

**Maar:** Hoe? ScriptGuard werkt via CDP (`Debugger.getScriptSource`, `scriptParsed` events). Extension content scripts worden geïnjecteerd via Electron's extension system, niet via een `<script>` tag of CDP event. ScriptGuard ziet ze waarschijnlijk helemaal niet.

Dit moet eerst uitgezocht worden voor Phase 10a gebouwd wordt. Voeg toe aan Phase 10a scope:

> "1. Eerste: verifieer of ScriptGuard's CDP `scriptParsed` events ook vuren voor extension content scripts (installeer Dark Reader, zet CDP debugging aan, kijk of de content script scripts in de event stream verschijnen). Als ja: whitelist implementatie is nodig. Als nee: content scripts zijn al buiten ScriptGuard's scope — de 'whitelist' is niet nodig en de taak is documentatie-only."

---

### 4. State file fragmentatie in Phase 9

Er zijn nu 4 losse state bestanden in `~/.tandem/extensions/`:

- `toolbar-state.json` (Phase 5b)
- `update-state.json` (Phase 9)
- `.tandem-meta.json` (per extension, Phase 3)
- `gallery.json` (user overrides, Phase 4)

Op zichzelf niet erg, maar als dit verder groeit wordt het onoverzichtelijk. 

**Voeg toe aan CLAUDE.md (Architecture section):**

```
## State Files in ~/.tandem/extensions/
- Per-extension metadata: {id}/.tandem-meta.json
- Gallery overrides: gallery.json
- Toolbar pin state: toolbar-state.json
- Update tracking: update-state.json
- DNR analysis cache: dnr-analysis.json (Phase 10b)
Do NOT create new state files without updating this list.
```

Dit is documentatie, niet code. Maar het voorkomt dat toekomstige Claude Code sessies her en der extra JSON files aanmaken.

---

## ✅ Wat uitstekend is in v2

**Phase 1 — Resilience measures:** User-Agent spoofing, retry met backoff, response validation (check Cr24 magic) — dit zijn precies de dingen die je nodig hebt voor een undocumented endpoint. Goed.

**Phase 4 — Twee-laags gallery met `gallery.json`:** Dit is de juiste architectuur. Gebundelde defaults + user overrides = toekomstbestendig zonder rebuild. De derde laag (remote gallery) kan er later naadloos bij.

**Phase 7 — Empirische test eerst:** Dit is precies de juiste aanpak. "Test it before you build it" bespaart mogelijk een hele dag implementatiewerk. Als Grammarly's fallback gewoon werkt, is Phase 7 klaar in 30 minuten.

**Phase 9 — Batch update protocol:** `update.googleapis.com/service/update2/json` met meerdere `x=` parameters — dit is de correcte manier om updates te checken. Geen 30 CRX downloads voor een versiecheck, één HTTP request. Dat is engineering.

**Phase 9 — Atomic update met rollback:** Download → verify → temp extract → swap → load → rollback on failure. Correct. De `.old/` directory aanpak is de standaard pattern en werkt betrouwbaar.

**Phase 10a + 10b — ConflictDetector + DNR Reconciler:** Dit is het conceptueel sterkste onderdeel van het hele plan. Tandem is de enige browser die dit niveau van security/extension transparantie bouwt. De overlap analysis ("uBlock blokkeert 245K domains die NetworkShield ook al blokkeert") is een unieke capability die je kunt tonen in de UI.

**CLAUDE.md Security Stack Rules:** Compleet en correct. Inclusief de subtiliteit over extension content scripts die ScriptGuard bypassen — dat is het niveau van context dat Claude Code nodig heeft.

**`securityConflict` field in gallery:** Elke extension heeft een `securityConflict: 'dnr-overlap' | 'native-messaging' | 'none'` field. Dit maakt de UI informatief zonder dat de architectuur verstopt raakt.

---

## Conclusie

**Start Phase 1.** Het plan is implementeerbaar. De enige echte keuze die je nu moet maken is de CRX3 signature verificatie aanpak:
- Als je de "Tandem verifies CRX signatures" claim wilt voeren → gebruik protobufjs (Optie A)
- Als je snel wilt beginnen en honest wilt zijn over scope → Optie B (HTTPS integriteit + format check), signature verificatie als follow-up

De rest:
- Phase 10b: vervang runtime delta analyse door statische DNR scan op install (simpeler, nauwkeuriger)
- Phase 7: maak Scenario B prescriptief ("implement Option A, stop and report if blocked after 2 hours")
- Phase 10a: voeg ScriptGuard empirische test toe vóór whitelist implementatie

Dit is het meest doordachte extension implementatieplan dat ik gezien heb voor een Electron browser, inclusief de security-specifieke aspecten. Klaar om te bouwen.

— Kees 🧀
