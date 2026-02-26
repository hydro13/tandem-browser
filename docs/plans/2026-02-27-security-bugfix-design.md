# Security & Bug Fixes — Design

**Datum:** 2026-02-27
**Bron:** `docs/CODE-REVIEW-2026-02-26.md`
**Beslissingen:** Auth bypass (#1) wordt niet gefixt (bewuste keuze: localhost blijft open). Print/PDF (#2 uit TODO) geschrapt.

---

## Blok A — XSS fixes

### #3 Activity feed: `source` class injection
**File:** `shell/index.html:3011`
**Fix:** Valideer `source` tegen allowlist `['kees', 'robin']` voordat het in de class wordt geïnterpoleerd.

### #4 Bookmarks: unescaped innerHTML
**File:** `shell/bookmarks.html` lines 404, 408-409, 427-428, 431-432, 566-567
**Fix:** Wrap `item.name`, `item.url`, `item.id` in `escapeHtml()`. Valideer URL scheme bij `window.location.href = item.url` (alleen `http:` en `https:`).

---

## Blok B — MCP approval gate

### #7 `tandem_execute_js` zonder user approval
**File:** `src/mcp/server.ts:219-235`
**Fix:** Voor `apiCall` wordt aangeroepen, stuur IPC bericht naar main window met de code preview. Wacht op user approve/deny via IPC response. Timeout na 30s = deny.

---

## Blok C — Extension hardening

### #6 CRX3 signature verificatie
**File:** `src/extensions/crx-downloader.ts`
**Fix:** Niet-triviaal (RSA/protobuf). Markeer als known-limitation met warning in UI bij installatie. Voeg host-check toe als mitigatie (alleen Google CDN downloads accepteren).

### #8 OAuth endpoint extensionId validatie
**File:** `src/api/routes/extensions.ts:239-261`
**Fix:** Valideer `extensionId` tegen `extensionManager.getInstalledExtensions()`. Reject als het ID niet geïnstalleerd is.

---

## Blok D — Bug fixes

### #12 activate handler geen .catch()
**File:** `src/main.ts:521-537`
**Fix:** Voeg `.catch(err => console.error(...))` toe aan de promise chain.

### #19 Debug console.log
**File:** `shell/index.html:6427`
**Fix:** Verwijder de `console.log`.

### #22 X-Scout approve() stub
**File:** `src/agents/x-scout.ts:353-361`
**Fix:** Maak duidelijk dat het een placeholder is: chat message aanpassen naar "⚠️ Approve registered but action execution not yet implemented".

### #24 focusByIndex tab volgorde
**File:** `src/tabs/manager.ts:272-278`
**Fix:** `listTabs()` sorteert al pinned-first. De Map insertion order matcht creation order, wat ook de visuele volgorde is. Dit is correct tenzij drag-reorder wordt geïmplementeerd. Markeer als acceptable.

---

## Scope

9 items, geschat ~1 uur werk. Blok A en D zijn straightforward text changes. Blok B vereist IPC roundtrip. Blok C is deels mitigatie.
