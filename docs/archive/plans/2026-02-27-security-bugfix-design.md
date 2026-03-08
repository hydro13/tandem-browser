# Security & Bug Fixes — Design

**Date:** 2026-02-27
**Bron:** `docs/CODE-REVIEW-2026-02-26.md`
**Decisions:** Auth bypass (#1) is not gefixt (bewuste choice: localhost blijft open). Print/PDF (#2 out TODO) geschrapt.

---

## Blok A — XSS fixes

### #3 Activity feed: `source` class injection
**File:** `shell/index.html:3011`
**Fix:** Valideer `source` tegen allowlist `['kees', 'robin']` voordat the in the class is geïnterpoleerd.

### #4 Bookmarks: unescaped innerHTML
**File:** `shell/bookmarks.html` lines 404, 408-409, 427-428, 431-432, 566-567
**Fix:** Wrap `item.name`, `item.url`, `item.id` in `escapeHtml()`. Valideer URL scheme bij `window.location.href = item.url` (only `http:` and `https:`).

---

## Blok B — MCP approval gate

### #7 `tandem_execute_js` without user approval
**File:** `src/mcp/server.ts:219-235`
**Fix:** Before `apiCall` is invoked, send an IPC message to the main window with the code preview. Wait for user approval/denial via the IPC response. Timeout after 30s = deny.

---

## Blok C — Extension hardening

### #6 CRX3 signature verificatie
**File:** `src/extensions/crx-downloader.ts`
**Fix:** Not-triviaal (RSA/protobuf). Markeer if known-limitation with warning in UI bij installatie. Voeg host-check toe if mitigation (only Google CDN downloads accepteren).

### #8 OAuth endpoint extensionId validatie
**File:** `src/api/routes/extensions.ts:239-261`
**Fix:** Valideer `extensionId` tegen `extensionManager.getInstalledExtensions()`. Reject if the ID not geïnstalleerd is.

---

## Blok D — Bug fixes

### #12 activate handler no .catch()
**File:** `src/main.ts:521-537`
**Fix:** Voeg `.catch(err => console.error(...))` toe about the promise chain.

### #19 Debug console.log
**File:** `shell/index.html:6427`
**Fix:** Delete the `console.log`.

### #22 X-Scout approve() stub
**File:** `src/agents/x-scout.ts:353-361`
**Fix:** Maak duidelijk that the a placeholder is: chat message aanpassen to "⚠️ Approve registered but action execution not yet implemented".

### #24 focusByIndex tab order
**File:** `src/tabs/manager.ts:272-278`
**Fix:** `listTabs()` sorteert already pinned-first. The Folder insertion order matcht creation order, wat also the visual order is. Dit is correct tenzij drag-reorder is geïmplementeerd. Markeer if acceptable.

---

## Scope

9 items, geschat ~1 uur werk. Blok A and D are straightforward text changes. Blok B requires IPC roundtrip. Blok C is deels mitigation.
