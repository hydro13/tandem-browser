# Tandem Browser

> "Two people, one vehicle, stronger together." — the tandem bicycle, and the philosophy behind this project.

## What is Tandem?

Tandem is an Electron-based browser built for human-AI collaboration. Any AI
agent that speaks MCP or HTTP can control it. The name comes from the tandem
bicycle: two riders, one machine, each contributing what the other can't do
alone.

The browser runs two things in parallel. The human uses it like any other browser
while AI agents operate through a built-in **MCP server** (244 tools) or a full
local **HTTP API** on `127.0.0.1:8765` with 300+ endpoints for navigation,
interaction, data extraction, automation, sessions, sync, extensions, and
developer tooling. Websites see a normal Chrome browser on macOS. They don't see
the AI.

Tandem was originally built for OpenClaw and continues to be maintained by an
OpenClaw maintainer, but the MCP server makes it equally accessible to Claude
Code, Cursor, Windsurf, or any other MCP-compatible agent.

The security layer exists because when an AI has access to your browser, your threat model changes. Every ad network, tracking pixel, and malicious domain is now in your agent's attack surface. Tandem runs an 8-layer security shield before anything reaches the page so agents can operate with stricter containment than a conventional browser automation stack.

Data stays local. Sessions are isolated. Nothing leaves the machine through Tandem without going through a filter first.

**GitHub:** `hydro13/tandem-browser`  
**Current version:** `0.70.0`  
**Repository status:** Public developer preview  
**Started:** February 11, 2026

---

## Philosophy

Human-AI symbiosis, not human-AI hierarchy. The goal isn't an AI that does things for you. It's a setup where both parties contribute what they're good at, and the result is better than either could produce alone.

In browser terms: the human handles ambiguity, judgment calls, authentication, and anything that requires a real person. The AI handles speed, memory, data extraction, parallel processing, and anything that would take the human too long. The browser is the shared workspace.

Within the product UI, the right-side assistant surface is called the Wingman panel. Kees is the default OpenClaw persona that operates through that panel today.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Tandem Browser (Electron 40)                                   │
│                                                                 │
│  ┌──────────────────────────┐  ┌───────────────────────────┐    │
│  │  Sidebar (shell)         │  │  Wingman Panel (shell)    │    │
│  │                          │  │                           │    │
│  │  Workspaces (SVG icons)  │  │  Chat / Activity /        │    │
│  │  Messengers:             │  │  Screenshots / ClaroNote  │    │
│  │   Telegram, WhatsApp,    │  │                           │    │
│  │   Discord, Slack, Gmail, │  └───────────────────────────┘    │
│  │   Calendar, Instagram, X │                                   │
│  │  Utilities:              │  ┌───────────────────────────┐    │
│  │   Pinboards, Bookmarks,  │  │  Webview (Chromium)       │    │
│  │   History, Downloads,    │  │                           │    │
│  │   Personal News*         │  │                           │    │
│  │                          │  │  What websites see:       │    │
│  │  [resizable, frosted     │  │  "Chrome on macOS, BE"    │    │
│  │   glass, pin/overlay]    │  │                           │    │
│  └──────────────────────────┘  └───────────────────────────┘    │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Electron Main Process                                     │ │
│  │                                                            │ │
│  │  SecurityManager     8-layer shield (see below)            │ │
│  │  StealthManager      Anti-fingerprint patches              │ │
│  │  TabManager          Multi-tab, groups, shortcuts          │ │
│  │  SidebarManager      Sidebar config + panel routing        │ │
│  │  WorkspaceManager    Named tab groups + persistence        │ │
│  │  BookmarkManager     Tree, search, CRUD                    │ │
│  │  HistoryManager      Full-text search, Cmd+Y               │ │
│  │  DownloadManager     Progress, pause, resume               │ │
│  │  ChromeImporter      Bookmarks, history, cookies           │ │
│  │  BehaviorObserver    Learn user patterns                   │ │
│  │  ContentExtractor    Smart page-to-markdown                │ │
│  │  WorkflowEngine      Multi-step automation                 │ │
│  │  ClaroNoteManager    Voice-to-text integration             │ │
│  │  SiteMemory          Per-site persistent notes             │ │
│  │  WatchManager        Scheduled page monitoring             │ │
│  │  HeadlessManager     Background browsing + kill switch     │ │
│  │  FormMemory          Encrypted form field recall           │ │
│  │  AudioCapture        Tab audio recording                   │ │
│  │  ExtensionLoader     Chrome extension support              │ │
│  │  SessionManager      Isolated browsing sessions            │ │
│  │  PinboardManager     Sidebar pinboards and saved items     │ │
│  │  SyncManager         Local/export sync surfaces            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                      │                                          │
│                      ▼                                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Tandem HTTP API — localhost:8765 (Express)                │ │
│  │  300+ route handlers across 16 route modules               │ │
│  │                                                            │ │
│  │  Navigation, Content, Interaction, Tabs, Screenshots       │ │
│  │  Sessions, Workspaces, Sidebar, Pinboards, Sync            │ │
│  │  Security, DevTools (CDP bridge), extensions, agents       │ │
│  │  Network mocking, script injection, media, data, content   │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │
         │ MCP / HTTP / fetch / curl
         ▼
┌─────────────────────┐
│  AI Agent           │
│  (MCP or HTTP)      │
│                     │
│  Uses MCP tools or  │
│  HTTP API to browse,│
│  extract, automate  │
└─────────────────────┘
```

`* Personal News currently exists as a sidebar slot and planned surface, not as a fully implemented panel experience yet.`

---

## Security System

Eight independent layers that run before anything reaches the page:

| Layer | Name | What it does |
|-------|------|-------------|
| 1 | NetworkShield | Curated phishing, malware, and malicious-infrastructure feeds (URLhaus, Phishing Database, OpenPhish, ThreatFox, Steven Black). Blocks at request level before page load |
| 2 | OutboundGuard | Scans POST body for credential exfiltration, blocks known tracker domains |
| 3 | ContentAnalyzer | Typosquatting detection, script analysis, risk score 0-100 per page |
| 4 | ScriptGuard | CDP-based script fingerprinting, detects keyloggers and crypto miners |
| 5 | BehaviorMonitor | Welford's algorithm, per-domain baseline + anomaly detection, trust scores |
| 6 | GatekeeperWebSocket | AI agent makes real-time decisions on ambiguous requests |
| 7 | EvolutionEngine | Adaptive threat rules that learn from new attack patterns |
| 8 | PromptInjection | Scans agent-facing content for prompt injection attempts, blocks or warns |

None or this touches the webview. Websites don't know it's running.

---

## Anti-Detection

The browser presents itself as a normal Chrome instance on macOS. What gets patched:

- User-Agent: real Chrome UA, no Electron strings
- `navigator.userAgentData.brands`: Chrome brands only
- Canvas fingerprint: subtle noise injection
- WebGL: GPU info masking
- Font enumeration: consistent list
- Audio fingerprint: AudioContext noise
- Timing: randomized delays on automated actions
- HTTP headers: Sec-CH-UA matches Chrome, "Electron" stripped
- `app.setName('Google Chrome')`: OS-level name override

**Interaction rule:** All automated interactions go through `webContents.sendInputEvent()`, not `el.click()` or `dispatchEvent()`. `Event.isTrusted` stays true.

---

## Sidebar

Opera-style sidebar on the left. Three sections:

**Workspaces** (top)
Named tab groups with 24-icon SVG picker (Heroicons outline). Create, edit, rename, delete. Drag tabs from the tab bar onto a workspace icon to move them. Right-click any tab for the full context menu including "Move to Workspace."

**Communication**
Persistent webview panels for Telegram, WhatsApp, Discord, Slack, Gmail, Calendar, Instagram, and X. Each panel has its own isolated browser session (own cookies, localStorage, cache). Panels are resizable with per-module width persistence. Frosted glass overlay mode or pinned push mode.

**Utilities**
Pinboards, Bookmarks (full tree, search, folder navigation), History, Downloads, plus a `Personal News` sidebar slot that is currently a placeholder for future design and implementation work.

Sidebar toggle: `Cmd+Shift+B`. Setup panel (⚙️) to enable/disable individual items.

---

## Workspaces

Named tab groups. Each workspace has an icon (slug, e.g. "briefcase"), a name, and a list or assigned tab IDs. Tab bar filters to show only the active workspace's tabs.

Persisted to `~/.tandem/workspaces.json`. Default workspace ("home" icon) is always present and cannot be deleted.

API: `GET /workspaces`, `POST /workspaces`, `PUT /workspaces/:id`, `DELETE /workspaces/:id`, `POST /workspaces/:id/move-tab`, `POST /workspaces/:id/switch`

---

## Tab Context Menu

Right-click any tab:

```
New Tab
─────────────────
Reload
Duplicate Tab
Add to / Remove from Quick Links
Pin Tab / Unpin Tab
Mute Tab / Unmute Tab
Let Wingman handle this tab / Take back from Wingman
Set Emoji...  ▶  [50 popular emojis grid, + Remove Emoji if set]
─────────────────
Close Tab
Close Other Tabs
Close Tabs to the Right
─────────────────
Reopen Closed Tab
```

---

## API Overview

Most endpoints require the `Authorization: Bearer <token>` header. The token is stored in `~/.tandem/api-token`. `/status` is public, and a narrow set or helper routes is also available to installed extensions under explicit route-level checks.

Current route modules:
- `browser.ts` — navigation, screenshots, page actions
- `tabs.ts` — tab management, groups, focus, emoji badges
- `snapshots.ts` — accessibility tree and `@ref` interaction surfaces
- `devtools.ts` — CDP bridge (console, network, DOM, storage)
- `extensions.ts` — extension management and helper routes
- `network.ts` — mocking and network tooling
- `sessions.ts` — isolated sessions, session fetch relay, saved session state
- `agents.ts` — agent workflow endpoints
- `data.ts` — bookmarks, history, downloads, and import/export surfaces
- `content.ts` — content extraction and page-to-markdown style helpers
- `media.ts` — screenshots, audio capture, and related media endpoints
- `misc.ts` — settings, watch routes, passwords, and smaller utility endpoints
- `sidebar.ts` — sidebar config, state, ordering, activation
- `workspaces.ts` — workspace CRUD and tab assignment
- `sync.ts` — sync surfaces
- `pinboards.ts` — pinboard CRUD and panel data

Selected read and browser routes now accept `X-Tab-Id` so agents can target
background tabs without stealing focus. Current support includes `/snapshot`,
`/page-content`, `/page-html`, `/execute-js`, `/wait`, `/links`, and `/forms`.

Security routes are registered separately from `src/security/routes.ts`.

---

## Key Files

```
src/main.ts                    App lifecycle, window, IPC, menu
src/api/server.ts              API setup + route registration
src/api/routes/                16 route modules
src/security/routes.ts         Security-specific API routes
src/security/                  8-layer security system
src/stealth/manager.ts         Anti-fingerprint patches
src/tabs/manager.ts            Tab management
src/sidebar/manager.ts         Sidebar config + state
src/workspaces/manager.ts      Workspace CRUD + tab mapping
src/sessions/manager.ts        Isolated session registry
src/pinboards/manager.ts       Pinboard persistence and panel data
src/sync/manager.ts            Sync and export surfaces
src/config/manager.ts          Settings
src/behavior/observer.ts       Behavioral learning
src/content/extractor.ts       Smart page-to-markdown
src/workflow/engine.ts         Multi-step automation
src/preload.ts                 contextBridge API surface
shell/index.html               Main UI (shell, sidebar, panels)
shell/js/main.js               Tab bar, drag-drop, context menu
shell/css/main.css             All shell styles
```

---

## Development

```bash
# Install
npm install

# Build TypeScript
npm run compile

# Run
npm start

# API
curl http://127.0.0.1:8765/status
```

**macOS note:** `npm start` already clears Electron quarantine flags before launch. If Electron is re-downloaded or started outside the provided scripts, run `xattr -cr node_modules/electron/dist/Electron.app` first or macOS may terminate the process silently.

---

## Related Projects

- **OpenClaw** — AI gateway the agent runs on
- **ClaroNote** — Voice-to-text SaaS, natively integrated in Tandem
- **Kanbu** — Project management tool 
