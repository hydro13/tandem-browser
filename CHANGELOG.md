# Changelog

All notable changes to Tandem Browser will be documented in this file.

## [v0.43.0] - 2026-03-02

- feat: About as overlay with true frosted glass effect

Changed About from separate BrowserWindow to in-window overlay,
matching bookmarks panel style:

- Overlay div in main window (not separate BrowserWindow)
- backdrop-filter now blurs actual page content behind it
- Same visual effect as bookmarks/history panels
- Click outside or X button to close
- GitHub link opens new tab in Tandem

True frosted glass effect finally achieved!

## [v0.42.0] - 2026-03-02

- feat: frosted glass effect for About window

Applied same styling as sidebar panels:
- backdrop-filter: blur(32px) + saturate + brightness
- Semi-transparent dark background
- Subtle border and shadow
- Transparent BrowserWindow for backdrop effect

Matches the beautiful glass effect from bookmarks panel

## [v0.41.9] - 2026-03-02

- fix: remove duplicate onOpenUrlInNewTab listener

Was registering the listener twice, causing 2 tabs to open
instead of 1 when clicking About links

## [v0.41.8] - 2026-03-02

- fix: remove duplicate onOpenUrlInNewTab handler

TypeScript error: object literal cannot have multiple properties
with the same name

## [v0.41.7] - 2026-03-02

- fix: About window links open in new Tandem tab

Instead of opening in system browser (Chrome), links from the
About window now open in a new tab within Tandem.

Added new IPC event 'open-url-in-new-tab' that triggers tab creation.

## [v0.41.6] - 2026-03-02

- fix: remove duplicate BrowserWindow import

BrowserWindow should be imported as value, not type

## [v0.41.5] - 2026-03-02

- fix: prevent crash on hamburger menu click

Issues fixed:
- Remove require() calls in IPC handler (caused hang)
- Use proper imports at top level
- Add 'as const' to role types
- Import shell from electron

The dynamic require() calls were blocking the event loop

## [v0.41.4] - 2026-03-02

- fix: TypeScript error in setWindowOpenHandler

Add explicit type for url parameter

## [v0.41.3] - 2026-03-02

- fix: About window branding and link behavior

Changes:
- Co-Pilot Browser → Wingman Browser
- Remove 'Tandem Repo' link (repo not public yet)
- About window frameless on Linux (no native menubar)
- External links open in system browser, not popup window

Fixes #3 issues reported by user

## [v0.41.2] - 2026-03-02

- fix: use _win instead of win in window control handlers

TypeScript error: variable is destructured as 'win: _win'

## [v0.41.1] - 2026-03-02

- fix: pinboard sync not loading on fresh device

When no local boards.json exists, load() creates an empty store with
lastModified set to now. mergeFromSync() then skips the shared file
because sharedTime < localTime (shared was written in the past).

Fix: if local has zero boards, always prefer the shared version
regardless of timestamp. This ensures new devices pick up existing
pinboards on first launch.

## [v0.41.0] - 2026-03-02

- feat: two-way sync — read shared data from Google Drive on startup

## [v0.40.0] - 2026-03-02

- feat: crash-safe session restore — continuous tab state persistence

## [v0.38.0] - 2026-03-01

- feat: pinboard appearance panel + masonry layout + inline editing

## [v0.37.0] - 2026-03-01

- feat: pin hover Edit/Remove actions + edit modal + Hydra Editor vendor bundle

## [v0.36.1] - 2026-03-01

- fix: responsive masonry columns + aspect-ratio card images, no stretch on wide panel

## [v0.36.0] - 2026-03-01

- feat: add text note editor to pinboard (pencil button + inline textarea)

## [v0.35.1] - 2026-03-01

- fix: show full text in quote/text pin cards, auto-height instead of clipping

## [v0.35.0] - 2026-03-01

- feat: realtime pinboard refresh via IPC after pin added from any context menu

## [v0.34.0] - 2026-03-01

- feat: OG metadata auto-fetch for thumbnails + masonry card layout fix (v0.33.1)

## [v0.33.0] - 2026-03-01

- feat: add 'Add to Pinboard' to tab context menu with board submenu + pin-flash animation

## [v0.32.1] - 2026-03-01

- fix: pinboards use showPrompt() instead of prompt(), add auth headers to all fetches

## [v0.32.0] - 2026-03-01

- feat: Pinboards — PinboardManager, REST API, sidebar panel, context menu (v0.32.0)

## [v0.31.0] - 2026-03-01

- feat: SyncManager — cross-device tab/history/workspace sync via shared folder

Add SyncManager that enables cross-device sync by writing device-specific
data (tabs, history) and shared data (workspaces) to a configurable sync
folder (Google Drive, iCloud, or any local path). Includes "Your Devices"
section in the history sidebar panel, API endpoints for config/status/trigger,
and debounced atomic writes to prevent corruption. Bumps to v0.30.0.

## [v0.29.0] - 2026-03-01

- feat: full Opera-style tab context menu with workspace icons, mute, duplicate, close actions

## [v0.28.0] - 2026-03-01

- feat: move tab to workspace via drag-and-drop and right-click context menu

## [v0.27.0] - 2026-03-01

- feat: Opera-style workspace icon picker, SVG strip icons, edit/delete UI

- Replace emoji text inputs with 24 inline SVG icons (Heroicons outline style)
- Inline create/edit sheet with 6-column icon grid picker (not floating modal)
- Edit workspace: rename, change icon, delete with inline confirmation
- Sidebar strip: SVG icons with indigo active / gray inactive styling
- Data model: emoji field migrated to icon slug with graceful migration
- Version bump to v0.26.0

## [v0.25.1] - 2026-03-01

- fix: replace native prompt/confirm with custom modal (Electron blocks native dialogs)

## [v0.25.0] - 2026-03-01

- feat: workspace manager + sidebar UI with tab filtering

Workspaces are named tab groups with emoji + color. Users can create,
switch, and delete workspaces from the sidebar. Tab bar filters to show
only the active workspace's tabs. Persisted to ~/.tandem/workspaces.json.

## [v0.24.0] - 2026-03-01

- feat: bookmarks sidebar panel with search and folder navigation

- New bookmark panel plugin for the sidebar Bookmarks item
- Renders full bookmark tree from Tandem /bookmarks API
- Folders and URLs displayed with favicons (Google s2 service)
- Click folder to navigate into it with breadcrumb trail
- Click breadcrumb to jump back up the tree
- Click URL to open in new tab via window.tandem.newTab()
- Live search with 250ms debounce via /bookmarks/search API
- Bookmarks tree cached after first load (no redundant fetches)
- CSS: search input, breadcrumb nav, folder/url items, scrollable list

## [v0.23.1] - 2026-03-01

- fix: Calendar auth popup and shared Google session partition

- Calendar webview now uses persist:gmail partition so one Google login
  covers both Calendar and Gmail (same account, same session)
- Fix new-window handler to NOT preventDefault on auth URLs — lets
  setWindowOpenHandler in main.ts open real popup windows for Google auth
  (previously auth was loaded inside the webview where Google blocks it)
- Auth URL patterns are specific (accounts.google.com etc.) to avoid
  interfering with in-app navigation in Telegram/Discord/etc.
- Reload handler propagates gmail reload to calendar (shared partition)

## [v0.23.0] - 2026-03-01

- feat: panel reload button + auto-reload sidebar webview after Google auth

## [v0.22.2] - 2026-03-01

- fix: allow Google auth popups from sidebar webviews (Gmail/Calendar login)

## [v0.22.1] - 2026-02-28

- fix: stronger frosted glass — more transparent panel, header shows blur clearly

## [v0.22.0] - 2026-02-28

- feat: frosted glass overlay panel, smooth animation, closed on startup

## [v0.21.3] - 2026-02-28

- fix: clear inline panel width on close so panel actually collapses

## [v0.21.2] - 2026-02-28

- fix: panel resize max width = window width — no arbitrary limit

## [v0.21.1] - 2026-02-28

- fix: panel resize — drag cover blocks webview, handle inside bounds, max 900px

## [v0.21.0] - 2026-02-28

- feat: resizable sidebar panel with per-module width persistence

## [v0.20.1] - 2026-02-28

- fix: sidebar webviews navigate freely — prevent Telegram from opening in new tab

## [v0.20.0] - 2026-02-28

- feat: Telegram (and all messenger) webview panels with persistent sessions

## [v0.19.1] - 2026-02-28

- fix: group pin and close buttons together in panel header

## [v0.19.0] - 2026-02-28

- feat: sidebar panel pin/overlay toggle — push vs overlay mode

## [v0.18.2] - 2026-02-28

- fix: dark scrollbar for sidebar panel content

## [v0.18.1] - 2026-02-28

- fix: sidebar setup panel — title bug, English sections, cleaner icons

## [v0.18.0] - 2026-02-28

- feat: sidebar setup panel met per-item toggles

## [v0.17.2] - 2026-02-28

- fix: sidebar icon sizing — smaller icons, more breathing room

## [v0.17.1] - 2026-02-28

- fix: sidebar polish + lamp icon + config migration

## [v0.17.0] - 2026-02-28

- feat: sidebar 3-sectie layout + Google Calendar + Gmail

Aangepaste bestanden:
- shell/index.html: ocSidebar bijgewerkt
  - ICONS uitgebreid met Google Calendar (blauw) en Gmail (rood)
  - WEBVIEW_URLS map toegevoegd voor alle webview items
  - render() toont nu 3 secties: Workspaces / Communicatie / Utilities
  - Separators tussen de 3 secties
  - calendar + gmail krijgen brand-icon stijl (zoals messengers)
- src/sidebar/manager.ts: DEFAULT_CONFIG heeft 14 items in 3 secties

Getest:
- npx tsc: zero errors
- npm start: 3 secties zichtbaar met separators
- npx vitest run: alle tests slagen

## [v0.16.1] - 2026-02-28

- feat: sidebar 3-sectie layout + Google Calendar + Gmail

Aangepaste bestanden:
- shell/index.html: ocSidebar bijgewerkt
  - ICONS uitgebreid met Google Calendar (blauw) en Gmail (rood)
  - WEBVIEW_URLS map toegevoegd voor alle webview items
  - render() toont nu 3 secties: Workspaces / Communicatie / Utilities
  - Separators tussen de 3 secties
  - calendar + gmail krijgen brand-icon stijl (zoals messengers)
- src/sidebar/manager.ts: DEFAULT_CONFIG heeft 14 items in 3 secties

Getest:
- npx tsc: zero errors
- npm start: 3 secties zichtbaar met separators
- npx vitest run: alle tests slagen (pre-existing supertest failures ongewijzigd)

## [v0.16.0] - 2026-02-28

- feat: sidebar shell UI — icon strip, panel, narrow/wide/hidden, brand icons, Cmd+Shift+B

Nieuwe bestanden: geen
Aangepaste bestanden:
- shell/index.html: sidebar HTML toegevoegd als eerste kind van .main-layout
  - .sidebar container met .sidebar-strip (icon strip) en .sidebar-panel
  - ocSidebar JS object: render, activateItem, toggleState, toggleVisibility, init
  - Keyboard shortcut Cmd+Shift+B toggle hidden/narrow
- shell/css/main.css: sidebar CSS toegevoegd
  - 3 standen: hidden (0px) / narrow (48px) / wide (180px)
  - Utility icons: outline Heroicons grijs
  - Messenger icons: gekleurde brand SVG op gekleurde ronde achtergrond
  - Active indicator: gekleurde rounded square achter actief icoon
  - Separator lijn tussen utility en messenger blok

Getest:
- npx tsc: zero errors
- npm start: sidebar zichtbaar, panel opent/sluit, shortcuts werken
- npx vitest run: alle tests slagen

## [v0.15.3] - 2026-02-28

- fix: sidebar config gebruikt individuele messenger items + commit standaard

Nieuwe bestanden: geen
Aangepaste bestanden:
- src/sidebar/manager.ts: DEFAULT_CONFIG bijgewerkt van 7 items (met 1 'messengers' groep)
  naar 12 items (6 utility + 6 individuele messengers: whatsapp/telegram/discord/slack/instagram/x)
- git-hooks/post-commit: emoji-stripping toegevoegd zodat emoji-prefixed commits
  (bijv '🗂️ feat:') correct als 'feat:' herkend worden door auto-versioning
- CHANGELOG.md: v0.15.2 entry uitgebreid met volledige details (bestanden, endpoints, architectuur)
- AGENTS.md: commit message standaard toegevoegd met format, types, versie-regels en CHANGELOG format
- package.json: versie gecorrigeerd naar 0.15.2 (was blijven staan op 0.15.1 door emoji-bug in hook)

Getest:
- npx tsc: zero errors
- Manager geeft nu 12 items terug via GET /sidebar/config

## [v0.15.2] - 2026-02-28

### Toegevoegd
- **Sidebar Infrastructuur** (`src/sidebar/`) — fundament voor alle sidebar features
  - `src/sidebar/types.ts` — SidebarState ('hidden'|'narrow'|'wide'), SidebarItem, SidebarConfig types
  - `src/sidebar/manager.ts` — SidebarManager class met load/save/getConfig/updateConfig/toggleItem/reorderItems/setState/setActiveItem
  - `src/api/routes/sidebar.ts` — 6 REST endpoints:
    - `GET  /sidebar/config` — volledige config ophalen
    - `POST /sidebar/config` — config bijwerken (state, activeItemId)
    - `POST /sidebar/items/:id/toggle` — item enable/disable
    - `POST /sidebar/items/:id/activate` — panel openen of sluiten
    - `POST /sidebar/reorder` — drag-to-reorder (orderedIds array)
    - `POST /sidebar/state` — sidebar state wijzigen (hidden/narrow/wide)
  - 12 default sidebar items: workspaces, personal news, pinboards, bookmarks, history, downloads + whatsapp, telegram, discord, slack, instagram, x
  - Config persistent in `~/.tandem/sidebar-config.json`

### Gewijzigd
- `src/registry.ts` — `sidebarManager: SidebarManager` toegevoegd aan ManagerRegistry interface
- `src/main.ts` — SidebarManager instantiatie in `startAPI()` + cleanup in `app.on('will-quit')`
- `src/api/server.ts` — `registerSidebarRoutes(router, ctx)` toegevoegd
- `src/api/tests/helpers.ts` — test helper bijgewerkt voor nieuwe manager
- `git-hooks/post-commit` — emoji-prefix stripping zodat `🗂️ feat:` correct als `feat:` herkend wordt

### Architectuur
- Elke messenger (WhatsApp/Telegram/Discord/Slack/Instagram/X) krijgt eigen slot in sidebar — niet gegroepeerd
- Twee visuele stijlen in UI (fase 2): outline Heroicons voor utility, brand colored SVGs voor messengers
- Active indicator: gekleurde rounded square achter actief icoon (Opera-stijl)

## [v0.15.1] - 2026-02-28

- fix: About window now shows correct version

- Removed broken preload-about approach
- Version now hardcoded in shell/about.html (v0.15.0)
- Post-commit hook updated to auto-update about.html on version bump
- Cleaner and more reliable than runtime injection

## [v0.15.0] - 2026-02-28

- feat: add auto-versioning git hook + setup script

- git-hooks/post-commit: auto-bump version + update CHANGELOG
- setup-dev.sh: one-command dev environment setup
- Configures core.hooksPath to use git-hooks/ (committed in repo)
- Kees can run ./setup-dev.sh after next pull to enable hook
- Ensures consistent versioning across all dev machines

## [v0.14.3] - 2026-02-28

- fix: About window improvements (height 650, auto-version from package.json)

## [v0.14.2] - 2026-02-28

- fix: correct path depth for About window (shell/about.html now loads)

## [v0.14.1] - 2026-02-28

- feat: auto-sync webhook.secret with OpenClaw hooks.token (cross-platform fix)

## [v0.14.0] - 2026-02-27

- Initial stable release with 19/19 items complete
