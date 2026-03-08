# Kees' Review — Extension Plan v2

**Date:** 25 februari 2026  
**Reviewer:** Kees 🧀  
**Beoordeeld:** Volledige herziening — CLAUDE.md, PHASE-1 t/m PHASE-10b

---

## Algemeen oordeel

Dit is significant beter then v1. The drie kritieke gaten that ik in the first review aanwees are allemaal gedicht:

- ✅ Security Stack Rules added about CLAUDE.md — correct and compleet
- ✅ Phase 7 grondig herschreven — MV3 preload probleem erkend, empirische test eerst, companion extension if fallback
- ✅ OAuth popup must `persist:tandem` session use — staat er nu expliciet in
- ✅ `session.removeExtension()` uses — no restart needed meer
- ✅ `prodversion` is dynamisch via `process.versions.chrome`
- ✅ CRX3 signature verificatie added about Phase 1
- ✅ Extension ID verificatie na extractie (manifest `key` field)
- ✅ Auto-updates Phase 9 — batch protocol, atomic swaps, rollback
- ✅ Gallery is twee-laags (defaults + user `gallery.json`)
- ✅ DNR conflict detection (10a) + reconciliation (10b) — this is uitzonderlijk goed nagedacht

The plan is nu implementeerbaar. Hieronder the resterende punten — allemaal verfijningen, no showstoppers.

---

## 🔴 Één serieus technisch risk

### Protobuf handmatig parsen for CRX3 signature verificatie

Phase 1 asks Claude Code to the CRX3 protobuf header "handmatig te parsen without library, want the are but a paar varint + length-delimited fields." Dit is te optimistisch.

The `CrxFileHeader` protobuf contains:
- Geneste message types (`sha256_with_rsa`, `sha256_with_ecdsa`)
- Arrays or `{public_key, signature}` pairs
- Variabele varint-lengtes per field
- Optionele fields that weggelaten can be

Handmatige protobuf parsing is a bekende bron or subtle bugs — a off-by-one in varint decoding, a verkeerde field tag, and you leest the verkeerde bytes if publieke sleutel. The resultaat: verificatie that always slaagt (fout-positief) or always faalt (fout-negatief).

**Twee opties, kies er één:**

**Optie A (aanbevolen):** Voeg `google-protobuf` or `protobufjs` toe if dependency. The CRX3 proto definitie is gepubliceerd door Google. Eén npm install, parse correct.

**Optie B (pragmatisch):** Maak the signature verificatie doelstelling bescheidener. HTTPS garandeert already transport-integriteit — if you the CRX over HTTPS or Googles CDN downloadt without redirect to a non-Google domain, is the kans op MITM-tampering already vrijwel nul. Verifieer then only:
1. Magic bytes are `Cr24` ✓
2. Download was or `clients2.google.com` without redirect to vreemde host ✓
3. ZIP is valid (AdmZip can hem uitpakken without errors) ✓
4. `manifest.json` contains geldige JSON with `name`, `version`, `key` ✓

Voeg a comment toe: "Full RSA signature verification via protobuf requires Phase 1.x — see issue #X." And set `signatureVerified: false` for alle CRX3 installs totdat that built is. Eerlijk and correct.

Kies Optie A if you the claim wilt maken that Tandem "CRX3 signature-verified installs" doet. Kies Optie B if you wilt that Phase 1 within a dag complete is.

---

## 🟡 Vier verbeterpunten

### 1. Phase 10b — DNR delta analyse is theoretisch fragiel

The "network delta analysis" in 10b.2 is creatief but the praktische nauwkeurigheid zal slecht are:

- **Reden A:** A domain that not in Guardian's traffic appears can also gecached are (browser cache, HTTP/304). No netwerkaanvraag = Guardian sees nothing = jij denkt that DNR the blokkeerde.
- **Reden B:** "Domains commonly seen on similar pages" requires a baseline that op the moment or implementatie still not exists. You hebt EvolutionEngine data nodig or honderden page loads.
- **Reason C:** A single page load provides too little signal. An e-commerce page sometimes loads tracking pixels and sometimes does not, depending on A/B tests, user state, and cache state.

Dit leidt tot SecurityDB-vervuiling with `confidence: 'inferred'` events that meer ruis then signaal are.

**Betere approach for 10b.2 (vervang the delta analyse):**

Bij the *installeren* or a DNR extension (and bij elke update):
1. Read alle DNR rule files
2. Extraheer alle domains with `action.type: "block"`
3. Sla this op in SecurityDB if `{ source: 'extension-dnr', extensionId, domains: [...] }`
4. Wanneer NetworkShield or Guardian a request sees to a domain IN this set, log: `"Domain also in extension DNR ruleset (extension may block before Guardian)"`

Dit is **statische analyse** — 100% accurate, nul false positives, no runtime overhead. The geeft you precies the informatie that you nodig hebt: "uBlock blokkeert 310,000 domains waarvan er 245,000 also in NetworkShield zitten." That is the overlap analyse or 10b.4 that you then gratis gets.

Behoud 10b.3 and 10b.4 (synthetic logging and overlap analysis) but gooi 10b.2's runtime delta approach overboord and vervang door statische scan bij install.

---

### 2. Phase 7 — Scenario B has no concrete implementatiespec

Phase 7 zegt: "if test mislukt, implementeer Optie A (companion extension) or Optie B (protocol intercept), kies op basis or testing."

Dit is te vaag for Claude Code. If Grammarly's fallback OAuth not works, staat Claude Code for a architectuurkeuze without genoeg context. Then gaat the ofwel the verkeerde optie kiezen, ofwel halverwege vastlopen.

**Fix:** Wees prescriptief. Verander 7.2 to:

> "If Scenario B: implementeer Optie A (companion extension). If you na 2 uur still not the `chrome.runtime.onMessageExternal` flow werkend hebt, stop then. Update STATUS.md if BLOCKED and rapporteer about Robin welke stap faalt. Phase 7 can later opgepakt be — the 22/30 extensions that no `chrome.identity` use werken already prima."

Dit geeft Claude Code a duidelijke exit-strategie and voorkomt that the vastloopt in a rabbit hole.

---

### 3. Phase 10a — ScriptGuard whitelist API not gespecificeerd

CLAUDE.md zegt: "After loading an extension, read its `content_scripts` manifest entry and log the URL patterns for auditing. Phase 10a registers broad patterns as known-trusted in ScriptGuard context."

Phase 10a.1 zegt: "Log these broad content scripts as known-trusted in ScriptGuard context. This creates a whitelist so ScriptGuard doesn't flag extension-injected scripts as suspicious."

**Maar:** Hoe? ScriptGuard works via CDP (`Debugger.getScriptSource`, `scriptParsed` events). Extension content scripts be geïnjecteerd via Electron's extension system, not via a `<script>` tag or CDP event. ScriptGuard sees ze waarschijnlijk helemaal not.

Dit must eerst uitgezocht be for Phase 10a built is. Voeg toe about Phase 10a scope:

> "1. First: verifieer or ScriptGuard's CDP `scriptParsed` events also vuren for extension content scripts (installeer Dark Reader, zet CDP debugging about, kijk or the content script scripts in the event stream verschijnen). If ja: whitelist implementatie is nodig. If nee: content scripts are already buiten ScriptGuard's scope — the 'whitelist' is not nodig and the taak is documentatie-only."

---

### 4. State file fragmentatie in Phase 9

Er are nu 4 losse state files in `~/.tandem/extensions/`:

- `toolbar-state.json` (Phase 5b)
- `update-state.json` (Phase 9)
- `.tandem-meta.json` (per extension, Phase 3)
- `gallery.json` (user overrides, Phase 4)

Op zichzelf not erg, but if this verder groeit is the onoverzichtelijk. 

**Voeg toe about CLAUDE.md (Architecture section):**

```
## State Files in ~/.tandem/extensions/
- Per-extension metadata: {id}/.tandem-meta.json
- Gallery overrides: gallery.json
- Toolbar pin state: toolbar-state.json
- Update tracking: update-state.json
- DNR analysis cache: dnr-analysis.json (Phase 10b)
Do NOT create new state files without updating this list.
```

Dit is documentatie, not code. Maar the voorkomt that toekomstige Claude Code sessions her and der extra JSON files aanmaken.

---

## ✅ Wat uitstekend is in v2

**Phase 1 — Resilience measures:** User-Agent spoofing, retry with backoff, response validation (check Cr24 magic) — this are precies the dingen that you nodig hebt for a undocumented endpoint. Goed.

**Phase 4 — Twee-laags gallery with `gallery.json`:** Dit is the juiste architectuur. Gebundelde defaults + user overrides = toekomstbestendig without rebuild. The derde laag (remote gallery) can er later naadloos bij.

**Phase 7 — Empirische test eerst:** Dit is precies the juiste approach. "Test it before you build it" bespaart mogelijk a hele dag implementatiewerk. If Grammarly's fallback gewoon works, is Phase 7 complete in 30 minuten.

**Phase 9 — Batch update protocol:** `update.googleapis.com/service/update2/json` with multiple `x=` parameters — this is the correcte manier to updates te checken. No 30 CRX downloads for a versiecheck, één HTTP request. That is engineering.

**Phase 9 — Atomic update with rollback:** Download → verify → temp extract → swap → load → rollback on failure. Correct. The `.old/` directory approach is the default pattern and works betrouwbaar.

**Phase 10a + 10b — ConflictDetector + DNR Reconciler:** Dit is the conceptueel sterkste onderdeel or the hele plan. Tandem is the enige browser that this niveau or security/extension transparantie bouwt. The overlap analysis ("uBlock blokkeert 245K domains that NetworkShield also already blokkeert") is a unieke capability that you kunt tonen in the UI.

**CLAUDE.md Security Stack Rules:** Compleet and correct. Inclusief the subtiliteit over extension content scripts that ScriptGuard bypassen — that is the niveau or context that Claude Code nodig has.

**`securityConflict` field in gallery:** Elke extension has a `securityConflict: 'dnr-overlap' | 'native-messaging' | 'none'` field. Dit maakt the UI informatief without that the architectuur verstopt raakt.

---

## Conclusie

**Start Phase 1.** The plan is implementeerbaar. The enige echte choice that you nu must maken is the CRX3 signature verificatie approach:
- If you the "Tandem verifies CRX signatures" claim wilt voeren → usage protobufjs (Optie A)
- If you snel wilt beginnen and honest wilt are over scope → Optie B (HTTPS integriteit + format check), signature verificatie if follow-up

The rest:
- Phase 10b: vervang runtime delta analyse door statische DNR scan op install (simpeler, nauwkeuriger)
- Phase 7: maak Scenario B prescriptief ("implement Option A, stop and report if blocked after 2 hours")
- Phase 10a: voeg ScriptGuard empirische test toe vóór whitelist implementatie

Dit is the meest doordachte extension implementatieplan that ik gezien heb for a Electron browser, inclusief the security-specific aspecten. Complete to te bouwen.

— Kees 🧀
