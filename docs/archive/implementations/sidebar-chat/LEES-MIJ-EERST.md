# Sidebar Chat Clients — START HERE

> **Date:** 2026-02-28
> **Status:** In progress
> **Goal:** WhatsApp, Discord, Slack, Telegram, Instagram and X/Twitter if sidebar webview panels next to the browser content
> **Order:** Phase 1 → 2 → 3 (elke phase is één session)

---

## Why this feature?

Robin uses daily 6 chat-apps and must nu constant schakelen between Tandem and losse apps. Door this if sidebar panels in te bouwen can he chatten terwijl he browst — without context te verliezen. Opera has this if kern-feature; the is the #1 gap in onze gap analyse (zie `docs/research/gap-analysis.md`, section "Sidebar Chat Clients — Full Spec").

---

## Architecture in 30 seconds

```
┌──────┐  ┌──────────────┐  ┌────────────────────┐  ┌──────────┐
│ Icon │  │  Panel       │  │  Browser Content    │  │ Wingman  │
│ Strip│→ │  Container   │  │  (main webview)     │  │ Panel    │
│ 48px │  │  (webview)   │  │                     │  │ (rechts) │
│      │  │  420px       │  │                     │  │          │
└──────┘  └──────────────┘  └────────────────────┘  └──────────┘
    ↕ IPC                        onafhankelijk          bestaand
    ↓
SidebarManager (main process)
  → beheert webview lifecycle
  → tracked notification badges
  → persisted config (~/.tandem/sidebar-config.json)
```

**Elke messenger is a `<webview>` tag with own partition:**
- `persist:whatsapp`, `persist:discord`, `persist:slack`, etc.
- Sessie/cookies blijven bewaard between herstart
- Gescheiden or Robin's main session (`persist:tandem`)

---

## Project Structure — Relevant Files

> ⚠️ Read ONLY the files in the "Files to read" table.
> Do NOT wander through the rest or the codebase.

### Read for ALL phases

| File | What it contains | Look for function |
|---------|---------------|-------------------|
| `AGENTS.md` | Anti-detect rules, code stijl, commit format | — (read fully) |
| `src/main.ts` | App startup, manager registratie, will-quit cleanup | `startAPI()`, `app.on('will-quit')` |
| `src/api/server.ts` | TandemAPI class, route registratie | `class TandemAPI`, `setupRoutes()` |
| `src/registry.ts` | ManagerRegistry interface — alle managers | `interface ManagerRegistry` |
| `src/api/context.ts` | RouteContext type definitie | `type RouteContext` |
| `shell/index.html` | Browser UI — zoek to `<div class="main-layout">` for the plek waar sidebar HTML must | `<div class="main-layout">` |
| `shell/css/main.css` | Layout styling — zoek `.main-layout` for the grid that aangepast must be | `.main-layout` |

### Additional reading per phase

_(see the relevant phase file)_

---

## Rules for this feature

> These are the HARD rules in addition to the general AGENTS.md rules.

1. **Sidebar webviews NIET in the webview injecteren** — the sidebar icon strip and panel container are shell-level HTML, net if the wingman panel. Ze zitten NAAST the main webview, not ERIN.

2. **No stealth script injection in sidebar webviews** — sidebar panels are for Robin's own usage (he logt zelf in, typt zelf). The stealth patches in `createWindow()` that via `app.on('web-contents-created')` be geïnjecteerd must sidebar webviews overslaan. Check the partition name: if that begint with `persist:whatsapp`, `persist:discord`, etc. → skip stealth injection.

3. **Own partitions per messenger** — nooit `persist:tandem` use for sidebar panels. Elke messenger gets are own partition zodat sessions fully geïsoleerd are.

4. **Default Chrome User-Agent for sidebar webviews** — sommige messengers (WhatsApp Web) weigeren non-Chrome UA's. Usage a default Chrome UA, not the Tandem stealth UA.

5. **No new npm packages** — alles is built with Electron's native `<webview>` tag and existing IPC patterns.

6. **Functienamen > regelnummers** — verwijs always to `function setupRoutes()`, nooit to "regel 287"

7. **Panel state persistence** — configuration is opgeslagen in `~/.tandem/sidebar-config.json`. Usage `tandemDir()` out `src/utils/paths.ts` for the pad.

---

## Manager Wiring — hoe SidebarManager registreren

Elke new manager must op **4 plekken** be aangesloten:

### 1. `src/registry.ts` — `ManagerRegistry` interface

```typescript
import type { SidebarManager } from './sidebar/manager';

export interface ManagerRegistry {
  // ... existing managers ...
  sidebarManager: SidebarManager;  // ← add
}
```

### 2. `src/main.ts` — `startAPI()` function

```typescript
import { SidebarManager } from './sidebar/manager';

// Na aanmaken or aanverwante managers:
const sidebarManager = new SidebarManager(win);

// In the registry object:
const registry: ManagerRegistry = {
  // ... existing managers ...
  sidebarManager: sidebarManager!,
};
```

### 3. `src/main.ts` — `app.on('will-quit')` handler

```typescript
if (sidebarManager) sidebarManager.destroy();
```

### 4. `src/main.ts` — `createWindow()` stealth skip

In the `app.on('web-contents-created')` handler, waar stealth scripts geïnjecteerd be in webviews, voeg a check toe to sidebar partitions over te slaan:

```typescript
contents.on('dom-ready', () => {
  const url = contents.getURL();
  // Skip stealth for Google auth
  if (url.includes('accounts.google.com') || url.includes('consent.google.com')) {
    return;
  }
  // Skip stealth for sidebar messenger panels
  const session = contents.session;
  const partitionId = /* partition check logic */;
  if (partitionId && partitionId.startsWith('persist:') &&
      ['whatsapp', 'discord', 'slack', 'telegram', 'instagram', 'x'].some(s => partitionId.includes(s))) {
    return;
  }
  contents.executeJavaScript(stealthScript).catch(/* ... */);
});
```

**Let op:** Electron's `webContents.session` is beschikbaar but the partition name is not direct uitleesbaar. Alternatief: shows `SidebarManager` a Set bijhouden or sidebar webContents IDs and check daar tegen.

---

## API Endpoint Pattern — Copy Exactly

```typescript
// In src/api/routes/sidebar.ts:
import type { Router } from 'express';
import type { RouteContext } from '../context';

export function registerSidebarRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // SIDEBAR — Messenger panel management
  // ═══════════════════════════════════════════════

  router.get('/sidebar/panels', async (req, res) => {
    try {
      const panels = ctx.sidebarManager.listPanels();
      res.json({ ok: true, panels });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
```

**Rules:**
- `try/catch` rond ALLES, catch if `(e: any)`
- 400 for ontbrekende verplichte velden
- 404 for not-gevonden resources
- Success: always `{ ok: true, ...data }`

---

## Notification Badge Detection

Alle grote messengers embedden unread count in the page title. Universele detection:

```typescript
webview.addEventListener('page-title-updated', (event) => {
  const title = event.title;
  const match = title.match(/\((\d+)\)/);
  const unreadCount = match ? parseInt(match[1], 10) : 0;
  // Update badge in shell UI
});
```

| Service | Title pattern | Voorbeeld |
|---------|--------------|-----------|
| WhatsApp | `(N) WhatsApp` | `(3) WhatsApp` |
| Discord | `(N) Discord \| #channel` | `(5) Discord \| #general` |
| Slack | `* Slack` or `(N) Slack` | `* Slack - myteam` |
| Telegram | `Telegram (N)` | `Telegram (2)` |
| Instagram | `(N) Instagram` | `(1) Instagram` |
| X/Twitter | `(N) X` | `(4) X` |

---

## Documents in This Folder

| File | What | Status |
|---------|-----|--------|
| `LEES-MIJ-EERST.md` | ← this file | — |
| `fase-1-infrastructure-whatsapp.md` | Sidebar framework + WhatsApp panel | 📋 Ready to start |
| `fase-2-discord-slack.md` | Discord + Slack panels | ⏳ Waiting for phase 1 |
| `fase-3-telegram-instagram-x.md` | Telegram + Instagram + X panels | ⏳ Waiting for phase 2 |

---

## Quick Status Check (always run first)

```bash
# App draait?
curl http://localhost:8765/status

# TypeScript clean?
npx tsc

# Git status clean?
git status

# Tests slagen?
npx vitest run
```

---

## 📊 Phase Status — UPDATE AFTER EVERY PHASE

| Phase | Title | Status | Commit |
|------|-------|--------|--------|
| 1 | Sidebar infrastructuur + WhatsApp | ⏳ not started | — |
| 2 | Discord + Slack | ⏳ not started | — |
| 3 | Telegram + Instagram + X | ⏳ not started | — |

> Claude Code: markeer phase if ✅ + voeg commit hash toe na afronden.
