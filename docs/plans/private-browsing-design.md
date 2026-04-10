# Design: Private Browsing Window

> **Date:** 2026-02-28
> **Status:** Planned
> **Effort:** Easy (1-2d)
> **Author:** Kees

---

## Problem / Motivation

Tandem has session isolation via `/sessions` (with `persist:` partitions), but no true private window that automatically wipes everything on close. Robin currently has to create a session manually and then clear the data manually.

**Opera has:** Private Browsing — Cmd+Shift+N opens a new window that stores no history, keeps no cookies, and automatically clears everything on close. It is visually recognizable through a dark theme.

**Tandem currently has:** `POST /sessions/create` and `POST /sessions/switch` via `function registerSessionRoutes()` in `src/api/routes/sessions.ts`. Sessions use `persist:[name]` partitions that do persist data on disk.

**Gap:** No ephemeral (in-memory) session that cleans itself up automatically. No Cmd+Shift+N shortcut. No visual indicator for private mode.

---

## User Experience — How It Works

> Robin wants to look something up quickly without it ending up in his browsing history.
>
> He presses **Cmd+Shift+N**. A new Tandem window opens with a distinctive dark-purple title bar/header. The tab bar subtly shows "🔒 Private" as an indicator.
>
> Robin browses normally in this window — everything works the same, but:
> - No history is stored
> - Cookies exist only in memory (they disappear on close)
> - No autofill, no form memory
> - Downloads do remain (they have already been written to disk)
>
> Robin closes the private window (Cmd+W or ✕). All session data (cookies, cache, localStorage) is automatically cleared. It is as if the window never existed.
>
> Tandem's main window is unchanged — his normal session, tabs, and history remain intact.

---

## Technical Approach

### Architecture

```
    Cmd+Shift+N
         │
    ┌────▼─────────────────────────────┐
    │ main.ts                           │
    │ createPrivateWindow()             │
    │                                   │
    │ new BrowserWindow({               │
    │   partition: 'private-[uuid]'     │  ← NO 'persist:' prefix
    │ })                                │     = in-memory only
    │                                   │
    │ win.on('closed', () => {          │
    │   session.clearStorageData()      │  ← clear everything on close
    │ })                                │
    └───────────────────────────────────┘
```

### Electron Session Partitions

The difference is in the partition string:
- `persist:tandem` → data is stored on disk (normal behavior)
- `private-abc123` → **no `persist:` prefix** → data is in-memory only and disappears automatically

Electron's `session.fromPartition()` without a `persist:` prefix creates an ephemeral session. That is exactly what we need.

### New Files

| File | Responsibility |
|---------|---------------------|
| — | None — the logic fits in `main.ts` and existing modules |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/main.ts` | `createPrivateWindow()` function + Cmd+Shift+N accelerator registration | `createWindow()` (as reference) |
| `src/api/routes/browser.ts` | `POST /window/private` endpoint | `function registerBrowserRoutes()` |
| `shell/index.html` | Private indicator in the tab bar + purple theme detection | Tab bar section |
| `shell/css/main.css` | `.private-mode` class for purple header styling | Root variables |

### New API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| POST | `/window/private` | Open a new private window |

### No new npm packages needed? ✅

---

## Phase Breakdown

| Phase | Scope | Sessions | Depends on |
|------|--------|---------|----------------|
| 1 | Full implementation: `createPrivateWindow()`, ephemeral partition, cleanup on close, shortcut, visual indicator, API endpoint | 1 | — |

---

## Risks / Pitfalls

- **Multiple private windows:** Each private window must get its own unique partition (`private-[uuid]`), otherwise they will share cookies. Mitigation: generate a UUID per window.
- **Wingman in private mode:** Should the AI wingman be available in private windows? Opera disables Aria. Mitigation: let Robin decide — optionally disable it.
- **Downloads:** Files downloaded in private mode remain on disk — that is expected behavior (as in all browsers), but it should be communicated to Robin.
- **Extensions:** Loading Chrome extensions in private mode can violate privacy (extensions can log data). Mitigation: do not load extensions in private mode by default, with an optional opt-in.

---

## Anti-detect Considerations

- ✅ Ephemeral partition is a default Electron feature — no detectable difference from the webview
- ⚠️ **Note:** the User-Agent and fingerprint must be identical to the normal window. A different partition must not produce a different fingerprint profile. This is the default behavior in Electron (same Chromium instance), but verify that Tandem's stealth patches are also active in the new partition.
- ✅ Visual indicator (purple header) is shell-side, invisible to websites

---

## Open Questions

- [ ] Wingman available in the private window? Opera disables Aria.
- [ ] Load extensions in private mode? Default off, optionally enabled?
- [ ] Should the private window get its own API port, or use the same 8765?
- [ ] Visual: dark-purple header, or a different color/indicator?
