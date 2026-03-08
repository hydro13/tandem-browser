# Code Review — Tandem Browser (full codebase)

**Date:** 2026-02-26
**Reviewer:** Claude Opus 4.6 (5 parallelle review-agents)
**Scope:** Volledige codebase review op security, bugs, architectuur, CLAUDE.md compliance and code hygiene

---

## KRITIEK — Security

### 1. Unauthenticated API — localhost origin bypass slaat alle auth over

Elke request without `Origin` header (curl, Python, malware) has full toegang tot alle 60+ endpoints, inclusief `/execute-js` and `/cookies`.

**File:** `src/api/server.ts`, lines 229-233

```ts
const origin = req.headers.origin || '';
if (origin === 'file://' || origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1') || !origin) {
  return next();  // No token required
}
```

**Fix:** Delete the `|| !origin` bypass. Vereis always a Bearer token.

---

### 2. Arbitrary file write via `/screenshot?save=`

The `save` query parameter is if raw filesystem path uses without validatie. Gecombineerd with #1 can elk local proces willekeurige files schrijven.

**File:** `src/api/server.ts`, lines 613-617

```ts
if (req.query.save) {
  const fs = require('fs');
  const filePath = req.query.save as string;  // NO validation
  fs.writeFileSync(filePath, png);
}
```

**Fix:** Valideer and restrict the pad tot a specific output directory.

---

### 3. XSS in activity feed — page-controlled data in innerHTML

URL's, titels and selectors or bezochte page's be ongeescaped in `innerHTML` geplaatst. The shell draait with `sandbox: false`, dus XSS geeft toegang tot the preload bridge.

**File:** `shell/index.html`, lines 2432-2441

```js
let text = event.type;
if (event.data.url) text = `${event.type}: ${event.data.url}`;
// ...
item.innerHTML = `<span class="a-icon">${icon}</span>...<span class="a-text">${text}</span>`;
```

**Fix:** Usage `escapeHtml(text)` (exists already in the file) op alle server-supplied strings.

---

### 4. XSS in bookmarks/downloads — namen ongeescaped in innerHTML

Bookmark namen, folder namen and download filenames be op multiple plaatsen ongeescaped in `innerHTML` gerenderd.

**Files:**
- `shell/index.html`, lines 4043, 4120, 2526
- `shell/bookmarks.html`, line 326

**Fix:** Usage `escapeHtml()` or `element.textContent` i.p.v. `innerHTML`.

---

### 5. `sandbox: false` op the main window

Versterkt the impact or XSS (#3, #4). Moderne Electron (20+) ondersteunt `sandbox: true` with `contextIsolation: true` + preload.

**File:** `src/main.ts`, line 246

**Fix:** Zet `sandbox: true`. Verplaats Node.js built-in calls out the preload to the main process via IPC.

---

### 6. No CRX3 cryptografische signature verificatie

Extensions be geinstalleerd without RSA/ECDSA verificatie. A MITM can gemodificeerde extensions leveren.

**File:** `src/extensions/crx-downloader.ts`, line 205

**Fix:** Weiger installatie wanneer `signatureVerified === false`, tenzij the user expliciet accepteert.

---

### 7. MCP `tandem_execute_js` without approval gate

A prompt-geinjecteerde AI session can willekeurig JavaScript uitvoeren in the actieve tab without gebruikersbevestiging.

**File:** `src/mcp/server.ts`, lines 219-230

**Fix:** Route MCP-initiated JS execution door the `TaskManager` approval flow with `requiresApproval: true`.

---

### 8. `/extensions/identity/auth` unauthenticated

Elk local proces can a OAuth popup openen to a willekeurige HTTPS URL.

**Files:** `src/api/server.ts`, line 224; `src/extensions/identity-polyfill.ts`, lines 204-208

**Fix:** Vereis token authenticatie. Restrict tot bekende extension IDs.

---

### 9. API token if URL query parameter (SSE)

Token lekt to logs, browser history and Referer headers.

**File:** `src/mcp/server.ts`, lines 730-731

**Fix:** Stuur the token if HTTP header i.p.v. query parameter.

---

## KRITIEK — Bugs & Architectuur

### 10. No `uncaughtException` / `unhandledRejection` handler

The app crasht silently bij onverwachte fouten. No diagnostiek, no user feedback.

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

Elke new consumer-registratie na `attach()` vervangt the existing webRequest listener. In-flight requests krijgen hun callback nooit.

**File:** `src/network/dispatcher.ts`, lines 53-81

**Fix:** Registreer alle consumers for `attach()`, or usage a stable wrapper that dynamisch out the consumer list leest.

---

### 12. `activate` handler (macOS) awaited startAPI not

`startAPI()` without `await` + `buildAppMenu()` synchroon = race condition, errors swallowed, dubbele IPC handler registratie crasht the app.

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

**Fix:** `await startAPI(w)` and after that pas `buildAppMenu()`.

---

### 13. `tab-register` IPC race condition

The window can laden voordat `tabManager` geinitialiseerd is in `startAPI`. The initiele tab is then nooit geregistreerd.

**File:** `src/main.ts`, lines 448-462

**Fix:** Queue the `tab-register` bericht or registreer the IPC handler for the window loads.

---

### 14. Guardian backpressure conditie logisch omgekeerd

`&&` must `||` are — backpressure works only if the socket disconnected is, not if the queue vol raakt bij a connected agent. Memory leak.

**File:** `src/security/guardian.ts`, lines 50-53

```ts
// Huidige (fout):
if (!status.connected && status.pendingDecisions >= 100) return;
// Correcte logica:
if (!status.connected || status.pendingDecisions >= 100) return;
```

---

### 15. `writeFileSync` blokkeert main thread bij elke navigatie

`HistoryManager.save()` schrijft synchroon JSON bij elke page load. Bij 10.000+ entries bevriest the UI.

**File:** `src/history/manager.ts`, lines 50-84

**Fix:** Debounced async write or migreer to SQLite (dependency is already aanwezig).

---

### 16. SecurityDB is nooit closed

WAL is not ge-checkpointed bij afsluiten. Can leiden tot groeiende WAL files and inconsistente state.

**File:** `src/security/security-manager.ts` (destroy method)

**Fix:** Roep `this.db.close()` about in `SecurityManager.destroy()`.

---

### 17. `getSessionWC()` focust a tab if side-effect

Elke GET request verandert the actieve tab. Parallelle API calls interfere with elkaar.

**File:** `src/api/server.ts`, lines 277-288

**Fix:** Geef WebContents direct terug out the session lookup without `focusTab()`.

---

## BELANGRIJK — Code Hygiene

### 18. `productName: "Google Chrome"` in package.json

The builte app heet letterlijk "Google Chrome". Trademark/impersonatie issue. Contradicts the comment in main.ts that zegt "don't pretend to be Chrome".

**File:** `package.json`, line 47

**Fix:** Wijzig to `"Tandem"` or `"Tandem Browser"`.

---

### 19. 17x `[DEBUG]` console.log in onboarding code

Duidelijk debug leftovers that the DevTools console vervuilen.

**File:** `shell/index.html`, lines 5624-5724

**Fix:** Delete alle `console.log('[DEBUG]` rules.

---

### 20. Hardcoded `'levelsio'` username in X Scout agent

Elke user that the agent runt bezoekt automatisch the X profiel or a specifiek persoon.

**File:** `src/agents/x-scout.ts`, line 262

**Fix:** Maak this configureerbaar or delete the.

---

### 21. `dist/` contains macOS " 2" duplicate files

`main 2.js`, `preload 2.js`, etc. — Finder copy-artefacten that rommel veroorzaken.

**Fix:** Delete the " 2" files. Overweeg `dist/` in `.gitignore` op te nemen.

---

### 22. Unimplemented `approve()` in X Scout

Approval is bevestigd but the actie is nooit uitgevoerd. Misleidt users.

**File:** `src/agents/x-scout.ts`, line 359

**Fix:** Implementeer the actie-executie or maak duidelijk that the a placeholder is.

---

### 23. `cookieCounts` Folder groeit oneindig

No eviction, no TTL, no max size. Memory leak bij lange sessions.

**File:** `src/security/guardian.ts`, lines 558-561

**Fix:** Voeg a TTL or max-size eviction toe.

---

### 24. `focusByIndex` uses insertion order i.p.v. gesorteerde tab order

Cmd+1-9 focust the verkeerde tab if er pinned tabs are.

**File:** `src/tabs/manager.ts`, lines 272-278

**Fix:** Usage `this.listTabs()` i.p.v. `Array.from(this.tabs.values())`.

---

## Positief — Goed geimplementeerd

- Alle webRequest hooks gaan door `RequestDispatcher` (no directe `session.webRequest` calls)
- Alle CDP access gaat door `DevToolsManager` (no directe `debugger.attach()` calls)
- Shared security constants stand in `types.ts` (KNOWN_TRACKERS, BANKING_PATTERNS, etc.)
- Alle hot-path DB queries use prepared statements (60+ pre-compiled in SecurityDB)
- Extension code is netjes afgebakend in `src/extensions/`
- Security code is afgebakend in `src/security/`
- No async/await in webRequest handler callbacks
