# Design: Tab Snoozing

> **Date:** 2026-02-28
> **Status:** Under review
> **Effort:** Medium (3-5 days)
> **Author:** Kees

---

## Problem / Motivation

Bij intensief browsen stapelen tabs op that not actief uses be but indeed geheugen innemen. Elke open tab with webcontents uses 50-200MB RAM. Bij 20+ tabs runs this snel op.

**Opera has:** automatische tab-suspending na X minuten inactiviteit + manuele snooze via right-click. Sluimerende tabs bewaren hun URL but geven RAM vrij.
**Tandem currently has:** resource monitoring via `GET /security/monitor/resources` but no tab-suspending.
**Gap:** no geheugenoptimalisatie for inactieve tabs.

---

## User Experience

> Robin has 25 tabs open na a research session. Tandem uses 3GB RAM.
> He right-clickt op a group oudere tabs → "Snooze all" → ze krijgen a 💤 icon.
> RAM drops to 1.2GB. Later he clicks a sleeping tab → it loads again.
> Or: he snoozt a tab "tot morgen" → the herinnert hem er the next dag about.

---

## Technical Approach

### Architecture

```
TabSnoozingManager
  ├── snooze(tabId, until?: Date)
  │     └── webContents.setAudioMuted(true)
  │     └── webContents.stop()  
  │     └── webContents.loadURL('about:blank') — vrijgeven geheugen
  │     └── snoozedTabs.set(tabId, { url, title, favicon, until })
  │     └── save to ~/.tandem/snoozed-tabs.json
  ├── wake(tabId)
  │     └── webContents.loadURL(savedUrl)
  │     └── snoozedTabs.delete(tabId)
  └── autoSnoozeCheck() — elke 5 min, snooze tabs inactief >30 min
```

### New Files

| File | Responsibility |
|---------|---------------------|
| `src/tabs/snoozing.ts` | `TabSnoozingManager` class |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/api/server.ts` | `TandemAPIOptions` uitbreiden | `class TandemAPI` / `TandemAPIOptions` |
| `src/main.ts` | Manager instantiëren, timer starten, cleanup | `startAPI()`, `app.on('will-quit')` |
| `src/api/routes/tabs.ts` | New snooze endpoints | `function registerTabRoutes()` |
| `shell/index.html` | 💤 visual + right-click menu | `// === CONTEXT MENU ===`, tab bar render |

### New API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| POST | `/tabs/:id/snooze` | Snooze tab. Body: `{until?: string}` (ISO timestamp, optional) |
| POST | `/tabs/:id/wake` | Herstel snoozed tab |
| GET | `/tabs/snoozed` | List alle snoozed tabs |
| POST | `/tabs/snooze-inactive` | Snooze alle tabs inactief langer then X minuten |

---

## Phase Breakdown

| Phase | Scope | Sessions | Depends on |
|------|--------|---------|----------------|
| 1 | TabSnoozingManager + REST API | 1 | — |
| 2 | Shell UI (💤 badge + right-click menu + auto-snooze config) | 1 | Phase 1 |

---

## Risks / Pitfalls

- **webContents verloren:** if tabId verandert na reload → sla also the webContentsId op
- **Electron webContents.discard():** mooier then loadURL('about:blank'), but beschikbaarheid controleren in Electron 40
- **Auto-snooze and wingman tabs:** NOOIT wingman-beheerde tabs automatisch snoozen — check the tab source marker

---

## Anti-detect considerations

✅ Alles via Electron main process — no DOM manipulation in webview.
⚠️ Snoozed tabs that herladen na wake can cookie/session state verliezen op sommige sites — acceptabel behavior, documenteren.

---

## Decisions Needed from Robin

- [ ] Wil you auto-snooze about or out by default?
- [ ] Drempelwaarde inactiviteit: 30 min? Configureerbaar?
- [ ] Mogen wingman-tabs snoozed be? (Aanbeveling: nee)
