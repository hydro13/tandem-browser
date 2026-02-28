# Code Review — Tandem Browser (full codebase)

**Datum:** 2026-02-26
**Reviewer:** Claude Opus 4.6 (5 parallelle review-agents)
**Scope:** Volledige codebase review op security, bugs, architectuur, CLAUDE.md compliance en code hygiene

---

## KRITIEK — Security

### 1. Unauthenticated API — localhost origin bypass slaat alle auth over

Elke request zonder `Origin` header (curl, Python, malware) heeft volledige toegang tot alle 60+ endpoints, inclusief `/execute-js` en `/cookies`.

**File:** `src/api/server.ts`, lines 229-233

```ts
const origin = req.headers.origin || '';
if (origin === 'file://' || origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1') || !origin) {
  return next();  // No token required
}
```

**Fix:** Verwijder de `|| !origin` bypass. Vereis altijd een Bearer token.

---

### 2. Arbitrary file write via `/screenshot?save=`

De `save` query parameter wordt als raw filesystem path gebruikt zonder validatie. Gecombineerd met #1 kan elk lokaal proces willekeurige bestanden schrijven.

**File:** `src/api/server.ts`, lines 613-617

```ts
if (req.query.save) {
  const fs = require('fs');
  const filePath = req.query.save as string;  // NO validation
  fs.writeFileSync(filePath, png);
}
```

**Fix:** Valideer en restrict het pad tot een specifieke output directory.

---

### 3. XSS in activity feed — page-controlled data in innerHTML

URL's, titels en selectors van bezochte pagina's worden ongeescaped in `innerHTML` geplaatst. De shell draait met `sandbox: false`, dus XSS geeft toegang tot de preload bridge.

**File:** `shell/index.html`, lines 2432-2441

```js
let text = event.type;
if (event.data.url) text = `${event.type}: ${event.data.url}`;
// ...
item.innerHTML = `<span class="a-icon">${icon}</span>...<span class="a-text">${text}</span>`;
```

**Fix:** Gebruik `escapeHtml(text)` (bestaat al in het bestand) op alle server-supplied strings.

---

### 4. XSS in bookmarks/downloads — namen ongeescaped in innerHTML

Bookmark namen, folder namen en download filenames worden op meerdere plaatsen ongeescaped in `innerHTML` gerenderd.

**Files:**
- `shell/index.html`, lines 4043, 4120, 2526
- `shell/bookmarks.html`, line 326

**Fix:** Gebruik `escapeHtml()` of `element.textContent` i.p.v. `innerHTML`.

---

### 5. `sandbox: false` op het main window

Versterkt de impact van XSS (#3, #4). Moderne Electron (20+) ondersteunt `sandbox: true` met `contextIsolation: true` + preload.

**File:** `src/main.ts`, line 246

**Fix:** Zet `sandbox: true`. Verplaats Node.js built-in calls uit de preload naar de main process via IPC.

---

### 6. Geen CRX3 cryptografische signature verificatie

Extensions worden geinstalleerd zonder RSA/ECDSA verificatie. Een MITM kan gemodificeerde extensions leveren.

**File:** `src/extensions/crx-downloader.ts`, line 205

**Fix:** Weiger installatie wanneer `signatureVerified === false`, tenzij de gebruiker expliciet accepteert.

---

### 7. MCP `tandem_execute_js` zonder approval gate

Een prompt-geinjecteerde AI sessie kan willekeurig JavaScript uitvoeren in de actieve tab zonder gebruikersbevestiging.

**File:** `src/mcp/server.ts`, lines 219-230

**Fix:** Route MCP-initiated JS execution door het `TaskManager` approval flow met `requiresApproval: true`.

---

### 8. `/extensions/identity/auth` unauthenticated

Elk lokaal proces kan een OAuth popup openen naar een willekeurige HTTPS URL.

**Files:** `src/api/server.ts`, line 224; `src/extensions/identity-polyfill.ts`, lines 204-208

**Fix:** Vereis token authenticatie. Restrict tot bekende extension IDs.

---

### 9. API token als URL query parameter (SSE)

Token lekt naar logs, browser history en Referer headers.

**File:** `src/mcp/server.ts`, lines 730-731

**Fix:** Stuur de token als HTTP header i.p.v. query parameter.

---

## KRITIEK — Bugs & Architectuur

### 10. Geen `uncaughtException` / `unhandledRejection` handler

De app crasht silently bij onverwachte fouten. Geen diagnostiek, geen user feedback.

**File:** `src/main.ts`

**Fix:**
```ts
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});
```

---

### 11. `RequestDispatcher.reattach()` vervangt Electron handlers mid-flight

Elke nieuwe consumer-registratie na `attach()` vervangt de bestaande webRequest listener. In-flight requests krijgen hun callback nooit.

**File:** `src/network/dispatcher.ts`, lines 53-81

**Fix:** Registreer alle consumers voor `attach()`, of gebruik een stable wrapper die dynamisch uit de consumer list leest.

---

### 12. `activate` handler (macOS) awaited startAPI niet

`startAPI()` zonder `await` + `buildAppMenu()` synchroon = race condition, errors swallowed, dubbele IPC handler registratie crasht de app.

**File:** `src/main.ts`, lines 939-946

```ts
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().then(w => {
      startAPI(w);         // not awaited
      buildAppMenu();      // runs before startAPI completes
    });
  }
});
```

**Fix:** `await startAPI(w)` en daarna pas `buildAppMenu()`.

---

### 13. `tab-register` IPC race condition

Het window kan laden voordat `tabManager` geinitialiseerd is in `startAPI`. De initiele tab wordt dan nooit geregistreerd.

**File:** `src/main.ts`, lines 448-462

**Fix:** Queue het `tab-register` bericht of registreer de IPC handler voor het window laadt.

---

### 14. Guardian backpressure conditie logisch omgekeerd

`&&` moet `||` zijn — backpressure werkt alleen als de socket disconnected is, niet als de queue vol raakt bij een connected agent. Memory leak.

**File:** `src/security/guardian.ts`, lines 50-53

```ts
// Huidige (fout):
if (!status.connected && status.pendingDecisions >= 100) return;
// Correcte logica:
if (!status.connected || status.pendingDecisions >= 100) return;
```

---

### 15. `writeFileSync` blokkeert main thread bij elke navigatie

`HistoryManager.save()` schrijft synchroon JSON bij elke page load. Bij 10.000+ entries bevriest de UI.

**File:** `src/history/manager.ts`, lines 50-84

**Fix:** Debounced async write of migreer naar SQLite (dependency is al aanwezig).

---

### 16. SecurityDB wordt nooit gesloten

WAL wordt niet ge-checkpointed bij afsluiten. Kan leiden tot groeiende WAL files en inconsistente state.

**File:** `src/security/security-manager.ts` (destroy method)

**Fix:** Roep `this.db.close()` aan in `SecurityManager.destroy()`.

---

### 17. `getSessionWC()` focust een tab als side-effect

Elke GET request verandert de actieve tab. Parallelle API calls interfereren met elkaar.

**File:** `src/api/server.ts`, lines 277-288

**Fix:** Geef WebContents direct terug uit de session lookup zonder `focusTab()`.

---

## BELANGRIJK — Code Hygiene

### 18. `productName: "Google Chrome"` in package.json

De gebouwde app heet letterlijk "Google Chrome". Trademark/impersonatie issue. Contradicts de comment in main.ts die zegt "don't pretend to be Chrome".

**File:** `package.json`, line 47

**Fix:** Wijzig naar `"Tandem"` of `"Tandem Browser"`.

---

### 19. 17x `[DEBUG]` console.log in onboarding code

Duidelijk debug leftovers die de DevTools console vervuilen.

**File:** `shell/index.html`, lines 5624-5724

**Fix:** Verwijder alle `console.log('[DEBUG]` regels.

---

### 20. Hardcoded `'levelsio'` username in X Scout agent

Elke gebruiker die de agent runt bezoekt automatisch het X profiel van een specifiek persoon.

**File:** `src/agents/x-scout.ts`, line 262

**Fix:** Maak dit configureerbaar of verwijder het.

---

### 21. `dist/` bevat macOS " 2" duplicate files

`main 2.js`, `preload 2.js`, etc. — Finder copy-artefacten die rommel veroorzaken.

**Fix:** Verwijder de " 2" bestanden. Overweeg `dist/` in `.gitignore` op te nemen.

---

### 22. Unimplemented `approve()` in X Scout

Goedkeuring wordt bevestigd maar de actie wordt nooit uitgevoerd. Misleidt gebruikers.

**File:** `src/agents/x-scout.ts`, line 359

**Fix:** Implementeer de actie-executie of maak duidelijk dat het een placeholder is.

---

### 23. `cookieCounts` Map groeit oneindig

Geen eviction, geen TTL, geen max size. Memory leak bij lange sessies.

**File:** `src/security/guardian.ts`, lines 558-561

**Fix:** Voeg een TTL of max-size eviction toe.

---

### 24. `focusByIndex` gebruikt insertion order i.p.v. gesorteerde tab volgorde

Cmd+1-9 focust de verkeerde tab als er pinned tabs zijn.

**File:** `src/tabs/manager.ts`, lines 272-278

**Fix:** Gebruik `this.listTabs()` i.p.v. `Array.from(this.tabs.values())`.

---

## Positief — Goed geimplementeerd

- Alle webRequest hooks gaan door `RequestDispatcher` (geen directe `session.webRequest` calls)
- Alle CDP access gaat door `DevToolsManager` (geen directe `debugger.attach()` calls)
- Shared security constants staan in `types.ts` (KNOWN_TRACKERS, BANKING_PATTERNS, etc.)
- Alle hot-path DB queries gebruiken prepared statements (60+ pre-compiled in SecurityDB)
- Extension code is netjes afgebakend in `src/extensions/`
- Security code is afgebakend in `src/security/`
- Geen async/await in webRequest handler callbacks
