# Tandem Browser

> "Two people, one vehicle, stronger together." — the tandem bicycle, and the philosophy behind this project.

## What is Tandem?

Tandem is an Electron-based browser built for human-AI collaboration. The name comes from the tandem bicycle: two riders, one machine, each contributing what the other can't do alone.

The browser runs two things in parallel. The human uses it like any other browser — navigating, logging in, handling captchas, making decisions. The AI has access to a full HTTP API on localhost:8765 with ~200 endpoints for navigation, interaction, data extraction, and automation. OpenClaw is the primary AI runtime Tandem is built around today. Websites see a normal Chrome browser on macOS. They don't see the AI.

The security layer exists because when an AI has access to your browser, your threat model changes. Every ad network, tracking pixel, and malicious domain is now in your agent's attack surface. Tandem runs a 6-layer security shield before anything reaches the page so OpenClaw can operate with stricter containment than a conventional browser automation stack.

Data stays local. Sessions are isolated. Nothing leaves the machine through Tandem without going through a filter first.

**GitHub:** `hydro13/tandem-browser`  
**Current version:** see `package.json` and `CHANGELOG.md`  
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
│  Tandem Browser (Electron 40)                                    │
│                                                                   │
│  ┌──────────────────────────┐  ┌───────────────────────────┐    │
│  │  Sidebar (shell)          │  │  Wingman Panel (shell)    │    │
│  │                          │  │                            │    │
│  │  Workspaces (SVG icons)  │  │  Chat / Activity /         │    │
│  │  Messengers:             │  │  Screenshots / ClaroNote   │    │
│  │   Telegram, WhatsApp,    │  │                            │    │
│  │   Discord, Gmail,        │  └───────────────────────────┘    │
│  │   Calendar, Instagram, X │                                    │
│  │  Utilities:              │  ┌───────────────────────────┐    │
│  │   Bookmarks, History,    │  │  Webview (Chromium)       │    │
│  │   Downloads              │  │                            │    │
│  │                          │  │  What websites see:        │    │
│  │  [resizable, frosted     │  │  "Chrome on macOS, BE"    │    │
│  │   glass, pin/overlay]    │  │                            │    │
│  └──────────────────────────┘  └───────────────────────────┘    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Electron Main Process                                       │ │
│  │                                                               │ │
│  │  SecurityManager     6-layer shield (see below)             │ │
│  │  StealthManager      Anti-fingerprint patches               │ │
│  │  TabManager          Multi-tab, groups, shortcuts           │ │
│  │  SidebarManager      Sidebar config + panel routing         │ │
│  │  WorkspaceManager    Named tab groups + persistence         │ │
│  │  BookmarkManager     Tree, search, CRUD                     │ │
│  │  HistoryManager      Full-text search, Cmd+Y                │ │
│  │  DownloadManager     Progress, pause, resume                │ │
│  │  ChromeImporter      Bookmarks, history, cookies            │ │
│  │  BehaviorObserver    Learn user patterns                    │ │
│  │  ContentExtractor    Smart page-to-markdown                 │ │
│  │  WorkflowEngine      Multi-step automation                  │ │
│  │  ClaroNoteManager    Voice-to-text integration              │ │
│  │  SiteMemory          Per-site persistent notes              │ │
│  │  WatchManager        Scheduled page monitoring              │ │
│  │  HeadlessManager     Background browsing + kill switch      │ │
│  │  FormMemory          Encrypted form field recall            │ │
│  │  AudioCapture        Tab audio recording                    │ │
│  │  ExtensionLoader     Chrome extension support               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                      │                                           │
│                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Tandem HTTP API — localhost:8765 (Express)                  │ │
│  │  ~200 endpoints across 12 route modules                      │ │
│  │                                                               │ │
│  │  Navigation, Content, Interaction, Tabs, Screenshots         │ │
│  │  Bookmarks, History, Downloads, Sessions, Workspaces         │ │
│  │  Security, DevTools (CDP bridge), Device emulation           │ │
│  │  Network mocking, Script injection, Behavior stats           │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │
         │ HTTP / fetch / curl
         ▼
┌─────────────────────┐
│  AI Agent (OpenClaw) │
│                      │
│  Uses the API to     │
│  browse, extract,    │
│  automate, observe   │
└─────────────────────┘
```

---

## Security System

Six independent layers that run before anything reaches the page:

| Layer | Name | What it does |
|-------|------|-------------|
| 1 | NetworkShield | 811,000+ blocklist entries (URLhaus, PhishTank, Steven Black). Blocks at request level, 0.03ms decision time |
| 2 | OutboundGuard | Scans POST body for credential exfiltration, blocks known tracker domains |
| 3 | ContentAnalyzer | Typosquatting detection, script analysis, risk score 0-100 per page |
| 4 | ScriptGuard | CDP-based script fingerprinting, detects keyloggers and crypto miners |
| 5 | BehaviorMonitor | Welford's algorithm, per-domain baseline + anomaly detection, trust scores |
| 6 | GatekeeperWebSocket | AI agent makes real-time decisions on ambiguous requests |

None of this touches the webview. Websites don't know it's running.

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
Persistent webview panels for Telegram, WhatsApp, Discord, Gmail, Calendar, Instagram, X. Each panel has its own isolated browser session (own cookies, localStorage, cache). Panels are resizable with per-module width persistence. Frosted glass overlay mode or pinned push mode.

**Utilities**
Bookmarks (full tree, search, folder navigation), History, Downloads.

Sidebar toggle: `Cmd+Shift+B`. Setup panel (⚙️) to enable/disable individual items.

---

## Workspaces

Named tab groups. Each workspace has an icon (slug, e.g. "briefcase"), a name, and a list of assigned tab IDs. Tab bar filters to show only the active workspace's tabs.

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
Copy Page Address
─────────────────
Move to Workspace  ▶  [workspace icon + name per workspace]
─────────────────
Mute Tab / Unmute Tab
─────────────────
Close Tab
Close Other Tabs
Close Tabs to the Right
```

---

## API Overview

All endpoints require the `Authorization: Bearer <token>` header (token in `~/.tandem/config.json`). Localhost requests bypass auth.

Route modules:
- `browser.ts` — navigation, page content, screenshots
- `tabs.ts` — tab management, groups
- `workspaces.ts` — workspace CRUD + tab assignment
- `bookmarks.ts` — bookmark tree, search, CRUD
- `history.ts` — history search and management
- `downloads.ts` — download tracking
- `sessions.ts` — isolated browser sessions
- `security.ts` — blocklist status, risk scores, alerts
- `devtools.ts` — CDP bridge (console, network, DOM, storage)
- `behavior.ts` — behavior stats and pattern data
- `chat.ts` — local chat relay
- `snapshots.ts` — accessibility tree + agent interaction refs

---

## Key Files

```
src/main.ts                    App lifecycle, window, IPC, menu
src/api/server.ts              API setup + route registration
src/api/routes/                12 route modules
src/security/                  6-layer security system
src/stealth/manager.ts         Anti-fingerprint patches
src/tabs/manager.ts            Tab management
src/sidebar/manager.ts         Sidebar config + state
src/workspaces/manager.ts      Workspace CRUD + tab mapping
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
npx tsc

# Run (macOS: clear quarantine first)
xattr -cr node_modules/electron/dist/Electron.app
npx electron .

# API
curl http://localhost:8765/status
```

**macOS note:** Electron binaries get quarantined by Gatekeeper. Run `xattr -cr` before starting, or the process will be killed silently.

---

## Build History

| Date | Versions | What was built |
|------|----------|---------------|
| Feb 11 | v0.1–v0.14 | Full foundation: tabs, stealth, 6-layer security, Chrome import, site memory, scheduled watches, headless mode, form memory, context bridge, PiP, network inspector, ClaroNote, workflow engine, audio capture, extension support |
| Feb 26–27 | — | Refactor: API split into 12 route modules, ManagerRegistry, 739 integration tests, type safety overhaul, security hardening |
| Feb 28 | v0.15–v0.22 | Sidebar: SidebarManager, icon strip, 3-section layout, Gmail/Calendar, setup panel, pin/overlay toggle, persistent messenger webviews, resizable panels, frosted glass |
| Mar 1 | v0.23–v0.29 | Gmail auth fix, bookmarks panel, workspace manager + UI, Opera-style icon picker, drag-drop tab move, full right-click context menu |

---

## Related Projects

- **OpenClaw** — AI gateway the agent runs on (localhost:18789)
- **ClaroNote** — Voice-to-text SaaS, natively integrated in Tandem
- **Kanbu** — Project management tool (app.kanbu.be)
