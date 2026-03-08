# Design: Sidebar Chat Clients

> **Date:** 2026-02-28
> **Status:** Draft
> **Effort:** Hard (1-2 weeks)
> **Author:** Kees

---

## Problem / Motivation

Robin wants to use his chat apps next to his browser without constantly switching windows. WhatsApp, Discord, Slack, Telegram, Instagram, and X/Twitter are apps he uses every day, so they should be available seamlessly alongside browser content.

**Opera has:** Sidebar webview panels for WhatsApp, Discord, Slack, Telegram, Instagram, and X/Twitter. Each messenger runs as a separate webview next to the browser content. Sidebar icons with notification badges, pin/unpin, mute per panel, adjustable panel width, and independent login per service.

**Tandem has now:** A Wingman panel (left or right) and no messenger sidebar. The Wingman panel is a separate concept — it is the AI-human communication channel. There is no place for external chat apps.

**Gap:** No sidebar messenger integration. Robin currently has to switch between Tandem and separate apps/tabs for all or his communication.

---

## User Experience — How It Works

> Robin opens Tandem. On the left side he sees a narrow icon strip with 6 chat icons: WhatsApp, Discord, Slack, Telegram, Instagram, X. Each icon can show a notification badge (for example "3" for 3 unread messages).
>
> Robin clicks the WhatsApp icon. A panel slides open between the icon strip and the browser content, about 420px wide. WhatsApp Web loads inside it. Robin logs in once via QR code. His session stays persisted (`persist:whatsapp` partition).
>
> Robin clicks Discord while WhatsApp is open. WhatsApp hides, Discord appears in the same panel area. The WhatsApp webview stays in memory (session intact), but is not visible.
>
> Robin clicks the active Discord icon again. The panel closes. More room for browser content.
>
> In the evening Robin receives a WhatsApp message. The WhatsApp icon shows a red notification badge with "1". Robin clicks it, reads the message, and continues browsing.

---

## What Is NOT Included

- **Facebook Messenger** — not relevant for Robin
- **VKontakte (VK)** — not relevant for Robin
- **Spotify / Music Player** — separate project, different architecture (media vs chat)

---

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Tandem Browser Window                                          │
│                                                                 │
│  ┌──────┐  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │ Icon │  │  Sidebar     │  │                              │  │
│  │ Strip│  │  Panel       │  │     Browser Content          │  │
│  │      │  │  (webview)   │  │     (main webview)           │  │
│  │ 💬  │  │              │  │                              │  │
│  │ 🎮  │  │  WhatsApp    │  │                              │  │
│  │ 💼  │  │  Discord     │  │                              │  │
│  │ ✈️  │  │  Slack       │  │                              │  │
│  │ 📷  │  │  etc.        │  │                              │  │
│  │ 𝕏   │  │              │  │                              │  │
│  │      │  │  420px      │  │                              │  │
│  └──────┘  └──────────────┘  └──────────────────────────────┘  │
│    48px      0-600px                  rest                      │
└─────────────────────────────────────────────────────────────────┘
```

**Data flow:**

```
User clicks sidebar icon
  → shell/index.html JS catches click
  → IPC to main process: 'sidebar-panel-toggle'
  → SidebarManager.togglePanel(serviceId)
    → Check whether the webview already exists
      → Yes: toggle visibility (show/hide)
      → No: create a new <webview> with `persist:{service}` partition
  → IPC back to shell: panel state update
  → Shell updates layout (panel open/closed, badge updates)
```

### New Files

| File | Responsibility |
|---------|---------------------|
| `src/sidebar/manager.ts` | `SidebarManager` — manages sidebar panels, state, notification tracking, and panel configuration |
| `src/api/routes/sidebar.ts` | `registerSidebarRoutes()` — REST API endpoints for sidebar management |
| `shell/css/sidebar.css` | Styling for the icon strip + panel container |

### Modify Existing Files

| File | Change | Function |
|---------|-----------|---------|
| `src/registry.ts` | Add `sidebarManager` to `ManagerRegistry` | `interface ManagerRegistry` |
| `src/api/server.ts` | Import and register sidebar routes | `setupRoutes()` |
| `src/api/context.ts` | Type export already contains `ManagerRegistry & { win }` — no change needed | `type RouteContext` |
| `src/main.ts` | Instantiate `SidebarManager`, register it in the registry, cleanup on will-quit | `startAPI()`, `app.on('will-quit')` |
| `shell/index.html` | Add sidebar icon strip HTML + panel container | New section before `<div class="main-layout">` |
| `shell/js/main.js` | Sidebar click handlers, IPC listeners, badge updates | Existing event handling |
| `shell/css/main.css` | Adjust layout grid for sidebar icon strip + panel | `.main-layout` class |

### New API Endpoints

| Method | Endpoint | Description |
|---------|---------|--------------|
| GET | `/sidebar/panels` | List all configured panels with status (visible, muted, notifications) |
| POST | `/sidebar/open` | Open/show a specific panel (`{ service: "whatsapp" }`) |
| POST | `/sidebar/close` | Close the active panel |
| POST | `/sidebar/toggle` | Toggle a panel open/closed (`{ service: "discord" }`) |
| GET | `/sidebar/list` | List available services with their URLs and status |
| POST | `/sidebar/mute` | Mute/unmute notifications for a panel (`{ service: "slack", muted: true }`) |
| GET | `/sidebar/status` | Sidebar status (which panel is open, notification counts) |

### Messenger Configuration

| Service | URL | Partition | Login Method | Notes |
|---------|-----|-----------|---------------|-------------|
| WhatsApp | `https://web.whatsapp.com` | `persist:whatsapp` | QR-code scan | Requires a Chrome-like User-Agent. `localStorage` contains encryption keys, so the partition must be persistent |
| Discord | `https://discord.com/app` | `persist:discord` | Email + password / QR | May show CAPTCHAs on first login. Minimum width ~420px |
| Slack | `https://app.slack.com` | `persist:slack` | Workspace URL + login | Workspace-specific: the user must configure the workspace URL. Default: `https://app.slack.com` |
| Telegram | `https://web.telegram.org/a/` | `persist:telegram` | QR code / phone number | Telegram Web A (most modern version) |
| Instagram | `https://www.instagram.com` | `persist:instagram` | Email + password | Responsive design, works well in narrow panels |
| X/Twitter | `https://x.com` | `persist:x` | Email + password | Fully responsive web app |

### Notification Badge Detection

Each messenger exposes unread messages differently. Strategy per service:

| Service | Detection Method |
|---------|-----------------|
| WhatsApp | `page-title-updated` event — title contains `(3) WhatsApp` for 3 unread |
| Discord | `page-title-updated` — title contains `(5) Discord` for 5 mentions |
| Slack | `page-title-updated` — title contains `* Slack` or `! Slack` |
| Telegram | `page-title-updated` — title contains `Telegram (2)` |
| Instagram | `page-title-updated` — title contains `(1) Instagram` |
| X/Twitter | `page-title-updated` — title contains `(4) X` |

**Pattern:** All major messengers embed the unread count in the page title. `webContents.on('page-title-updated')` is the universal detection method. No DOM injection is needed.

### Panel State Persistence

Configuration is stored in `~/.tandem/sidebar-config.json`:

```json
{
  "panels": {
    "whatsapp": { "enabled": true, "muted": false, "width": 420 },
    "discord": { "enabled": true, "muted": false, "width": 420 },
    "slack": { "enabled": true, "muted": false, "width": 420, "workspaceUrl": "https://myteam.slack.com" },
    "telegram": { "enabled": true, "muted": false, "width": 420 },
    "instagram": { "enabled": true, "muted": false, "width": 380 },
    "x": { "enabled": true, "muted": false, "width": 400 }
  },
  "lastActivePanel": "whatsapp",
  "sidebarVisible": true
}
```

### No New npm Packages Needed ✅

Everything is built with Electron's native `<webview>` tag and existing IPC patterns.

---

## Phase Breakdown

| Phase | Scope | Sessions | Depends on |
|------|--------|---------|----------------|
| 1 | Sidebar infrastructure (icon strip, panel container, SidebarManager) + WhatsApp panel | 1-2 | — |
| 2 | Discord + Slack panels (same pattern, Slack workspace config) | 1 | Phase 1 |
| 3 | Telegram + Instagram + X/Twitter panels | 1 | Phase 2 |

---

## Risks / Pitfalls

- **WhatsApp Web UA check:** WhatsApp Web checks the User-Agent and rejects non-Chrome browsers. The sidebar webview must use a standard Chrome UA, not the Tandem stealth UA. Mitigation: set an explicit Chrome UA per sidebar webview via `webview.setUserAgent()`.

- **Discord CAPTCHA on first login:** Discord sometimes shows CAPTCHAs when logging in from a "new" browser profile. Mitigation: persistent partition (`persist:discord`) so the session is remembered after first login. Optional: send a standard Chrome UA.

- **Slack workspace URL variation:** Slack uses workspace-specific URLs (`https://myteam.slack.com`). The user must be able to configure this. Mitigation: configuration option per panel with default `https://app.slack.com`.

- **Panel width vs content:** Some web apps (Discord) have a minimum width. If the panel is too narrow, the layout breaks. Mitigation: enforce a minimum width or 360px, default 420px.

- **Memory usage:** Each sidebar webview is a separate Electron renderer process. 6 simultaneous webviews means significant memory use. Mitigation: lazy loading, only create them when first opened. Optional: tab snoozing for hidden sidebar panels.

- **Session isolation vs stealth:** Sidebar panels use their own partitions (`persist:whatsapp`, etc.), not the default `persist:tandem` partition. This is correct because it prevents messenger cookies from interfering with Robin's main session.

---

## Anti-Detect Considerations

Sidebar messenger panels are **DIFFERENT** from Wingman-driven browsing activity:

- ✅ **No anti-detect needed for messenger panels** — these are legitimate websites that Robin controls himself. Robin logs in himself, types himself, scrolls himself. There is no AI automation in these panels.

- ✅ **Separate partitions** — messenger panels do not share cookies/storage with the main session (`persist:tandem`). This is desired: Robin's WhatsApp login must not leak into his browsing session and vice versa.

- ⚠️ **User-Agent:** Sidebar webviews must use a standard Chrome User-Agent. Some messengers (WhatsApp Web) reject non-Chrome UAs. Tandem's stealth UA patches do not apply here because they are for the main webview.

- ⚠️ **Stealth script injection:** The `web-contents-created` handler in `createWindow()` injects stealth scripts into ALL webviews. Sidebar webviews must **NOT** receive the stealth script. Those patches are meant for sites where Wingman is active, not for Robin's own messenger use. Consider checking the partition name and skipping stealth for `persist:whatsapp`, `persist:discord`, etc.

- ✅ **No localhost API calls from sidebar webviews** — the messengers communicate only with their own servers. No cross-origin risk to our API.

---

## Decisions Needed from Robin

- [x] Which messengers: WhatsApp, Discord, Slack, Telegram, Instagram, X/Twitter ✅
- [x] NOT included: Facebook Messenger, VK ✅
- [ ] Sidebar left or right? Proposal: **left** (Wingman panel is on the right, Opera also puts it on the left)
- [ ] Should sidebar panels receive the stealth script? Proposal: **no** — Robin operates these himself, no AI interaction
- [ ] Default panel width? Proposal: **420px** (wide enough for all messengers)
- [ ] Should all 6 icons always be visible, or only enabled panels? Proposal: **always show all 6** (consistent, easy to discover)

---

## Approval

Robin: [ ] Go / [ ] No-go / [ ] Go with adjustment: ___________
