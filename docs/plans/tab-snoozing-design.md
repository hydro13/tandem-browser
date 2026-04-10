# Design: Tab Snoozing

> **Date:** 2026-02-28
> **Status:** Planned
> **Effort:** Medium (3-5 days)
> **Author:** Kees

---

## Problem / Motivation

During intensive browsing, tabs pile up that are not actively used but still consume memory. Each open tab with webContents uses 50-200MB RAM. With 20+ tabs this adds up quickly.

**Opera has:** Automatic tab suspending after X minutes of inactivity + manual snooze via right-click. Suspended tabs preserve their URL but free up RAM.
**Tandem currently has:** Resource monitoring via `GET /security/monitor/resources` but no tab suspending.
**Gap:** No memory optimization for inactive tabs.

---

## User Experience

> Robin has 25 tabs open after a research session. Tandem uses 3GB RAM.
> He right-clicks on a group of older tabs → "Snooze all" → they get a 💤 icon.
> RAM drops to 1.2GB. Later he clicks a sleeping tab → it loads again.
> Or: he snoozes a tab "until tomorrow" → it reminds him the next day.

---

## Technical Approach

### Architecture

```
TabSnoozingManager
  ├── snooze(tabId, until?: Date)
  │     └── webContents.setAudioMuted(true)
  │     └── webContents.stop()  
  │     └── webContents.loadURL('about:blank') — free memory
  │     └── snoozedTabs.set(tabId, { url, title, favicon, until })
  │     └── save to ~/.tandem/snoozed-tabs.json
  ├── wake(tabId)
  │     └── webContents.loadURL(savedUrl)
  │     └── snoozedTabs.delete(tabId)
  └── autoSnoozeCheck() — every 5 min, snooze tabs inactive >30 min
```

### New Files

| File | Responsibility |
|---------|---------------------|
| `src/tabs/snoozing.ts` | `TabSnoozingManager` class |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/api/server.ts` | Extend `TandemAPIOptions` | `class TandemAPI` / `TandemAPIOptions` |
| `src/main.ts` | Instantiate manager, start timer, cleanup | `startAPI()`, `app.on('will-quit')` |
| `src/api/routes/tabs.ts` | New snooze endpoints | `function registerTabRoutes()` |
| `shell/index.html` | 💤 visual + right-click menu | `// === CONTEXT MENU ===`, tab bar render |

### New API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| POST | `/tabs/:id/snooze` | Snooze tab. Body: `{until?: string}` (ISO timestamp, optional) |
| POST | `/tabs/:id/wake` | Restore snoozed tab |
| GET | `/tabs/snoozed` | List all snoozed tabs |
| POST | `/tabs/snooze-inactive` | Snooze all tabs inactive longer than X minutes |

---

## Phase Breakdown

| Phase | Scope | Sessions | Depends on |
|------|--------|---------|----------------|
| 1 | TabSnoozingManager + REST API | 1 | — |
| 2 | Shell UI (💤 badge + right-click menu + auto-snooze config) | 1 | Phase 1 |

---

## Risks / Pitfalls

- **webContents lost:** If tabId changes after reload → also store the webContentsId
- **Electron webContents.discard():** Cleaner than loadURL('about:blank'), but check availability in Electron 40
- **Auto-snooze and wingman tabs:** NEVER auto-snooze wingman-managed tabs — check the tab source marker

---

## Anti-detect Considerations

- ✅ Everything via Electron main process — no DOM manipulation in webview.
- ⚠️ Snoozed tabs that reload on wake may lose cookie/session state on some sites — acceptable behavior, document it.

---

## Open Questions

- [ ] Auto-snooze on or off by default?
- [ ] Inactivity threshold: 30 min? Configurable?
- [ ] Allow wingman tabs to be snoozed? (Recommendation: no)
