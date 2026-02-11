# Changelog

## [Unreleased] — 2026-02-11

### 📦 Phase 4 — Echte Browser Features
- **4.1 Chrome Data Import**: Import bookmarks (JSON), history (SQLite), cookies (encrypted warning)
  - API: `GET /import/chrome/status`, `POST /import/chrome/bookmarks`, `POST /import/chrome/history`, `POST /import/chrome/cookies`
- **4.2 Bookmarks Manager**: CRUD, folders, bookmarks bar, star icon in URL bar, Cmd+D
  - API: `GET /bookmarks`, `POST /bookmarks/add`, `DELETE /bookmarks/remove`, `PUT /bookmarks/update`, `GET /bookmarks/search`, `GET /bookmarks/check`
- **4.3 History Manager**: Auto-track visits, search, history page (Cmd+Y)
  - API: `GET /history`, `GET /history/search`, `DELETE /history/clear`
- **4.4 Download Manager**: Electron download hooks, progress tracking, completion notifications
  - API: `GET /downloads`, `GET /downloads/active`
- **4.5 Find in Page**: Cmd+F search bar, match count, next/prev, Escape to close
- **Breaking**: Draw mode shortcut moved from Cmd+D → Cmd+Shift+D
- **Dependency**: Added `better-sqlite3` for SQLite reading

### 🖼️ Phase 3.7 — PiP Mode
- Added `PiPManager` — always-on-top mini window (350x250, frameless, draggable)
- `shell/pip.html` — mini dashboard: activity feed, status indicators (API/voice/learning), quick command input
- API: `POST /pip/toggle`, `GET /pip/status`
- Keyboard shortcut: Cmd+P to toggle
- Communicates via localhost API (not IPC)

### 🔍 Phase 3.8 — Network Inspector
- Added `NetworkInspector` — logs network traffic via Electron `session.webRequest` API (main process, anti-detect safe)
- Tracks: url, method, status, contentType, size, timestamp, initiator, domain
- Auto-discovery of API endpoints (JSON, /api/, /v1-3/, /graphql patterns)
- In-memory buffer (1000 requests) + flush to `~/.tandem/network/{domain}.json` on navigation
- API: `GET /network/log`, `GET /network/apis`, `GET /network/domains`, `DELETE /network/clear`

### 🎨 UI Improvements
- Tab bar: 🧀/👤 emoji per tab showing robin vs kees control
- Activity log: source indicator (robin/kees) per event with color coding
- Screenshots tab: improved 2-column grid layout with hover effects
- IPC: `onTabSourceChanged` bridge for real-time source updates

### 🧠 Phase 3.4 — Form Memory
- New `FormMemoryManager` class (`src/memory/form-memory.ts`)
- Tracks every form submission per domain in `~/.tandem/forms/{domain}.json`
- AES-256-GCM encryption for sensitive fields (type=password)
- Auto-generates encryption key in `~/.tandem/config.json`
- API: `GET /forms/memory`, `GET /forms/memory/:domain`, `POST /forms/fill`, `DELETE /forms/memory/:domain`
- Merge logic: returns most recent values per field for auto-fill

### 🌉 Phase 3.5 — Context Bridge
- New `ContextBridge` class (`src/bridge/context-bridge.ts`)
- Auto-records context snapshot on every page load: URL, title, summary (1000 chars), headings, links count
- Persistent searchable store in `~/.tandem/context/_index.json` (max 5000 entries)
- API: `GET /context/recent`, `GET /context/search?q=...`, `GET /context/page?url=...`, `POST /context/note`
- OpenClaw can query Tandem's web knowledge via curl

### 🧀 Phase 3.6 — Bidirectional Steering
- Tab source tracking: `Tab.source` field (`'robin'` | `'kees'`)
- `POST /tabs/open` supports `source` parameter
- `POST /tabs/source` to change tab controller
- `POST /navigate` auto-marks tab as kees-controlled
- `tab-source-changed` IPC event for renderer source indicators
- Activity log tracks source of each action

### 🧠 Phase 3.1 — Site Memory
- New `SiteMemoryManager` class (`src/memory/site-memory.ts`)
- Auto-extract page data on every visit: title, URL, meta description, headings, forms/links count, text preview (500 chars)
- Storage in `~/.tandem/site-memory/{domain}.json` — max 100 visits, 50 diffs per domain
- Diff detection: compares with previous visit, tracks new/removed headings, title/description changes, link/form count deltas
- Visit time tracking: records total time spent per domain
- API endpoints: `GET /memory/sites`, `GET /memory/site/:domain`, `GET /memory/site/:domain/diff`, `GET /memory/search?q=...`
- Full-text search across all site memories

### 👁️ Phase 3.2 — Scheduled Watches
- New `WatchManager` class (`src/watch/watcher.ts`)
- Background page monitoring via hidden BrowserWindow with stealth patches
- SHA-256 hash-based change detection on page text content
- macOS notification + copilot alert when changes detected
- Persistent watch list in `~/.tandem/watches.json` (survives restart)
- Max 20 watches to prevent overload
- API endpoints: `POST /watch/add`, `GET /watch/list`, `DELETE /watch/remove`, `POST /watch/check`

### 🕶️ Phase 3.3 — Headless Mode
- New `HeadlessManager` class (`src/headless/manager.ts`)
- Hidden BrowserWindow (show: false) for Kees to browse independently
- Same `persist:tandem` partition (shared cookies) + same stealth patches
- Captcha detection: checks for reCAPTCHA, hCaptcha, Cloudflare challenge selectors every 3s
- Auto-show + copilot alert on: captcha detected, login redirect, page crash
- API endpoints: `POST /headless/open`, `GET /headless/content`, `GET /headless/status`, `POST /headless/show`, `POST /headless/hide`, `POST /headless/close`

### ⚙️ Phase 2.8 — Settings/Config Scherm
- New `ConfigManager` class (`src/config/manager.ts`) — manages `~/.tandem/config.json`
- Settings page (`shell/settings.html`) with dark theme matching Tandem
- 6 settings sections: Algemeen, Screenshots, Voice, Stealth, Behavioral Learning, Data
- API endpoints: `GET /config`, `PATCH /config` (partial update, deep merge)
- API endpoints: `POST /behavior/clear`, `GET /data/export`, `POST /data/import`, `POST /data/wipe`
- Navigate to settings via `tandem://settings` in URL bar
- Keyboard shortcut: `Cmd+,` opens settings (macOS standard)
- Kees badge: right-click or long-press opens settings
- Live save on every change — no restart needed
- Confirmation modal for destructive actions (wipe data, clear behavior)
- Behavior stats displayed with auto-refresh (events today, session, avg keypress/click timing)
- Sticky navigation sidebar with scroll-aware highlighting

### 📸 Phase 2.7 — Screenshot Pipeline Voltooien
- Screenshot thumbnails in Kees paneel zijn nu clickable (opent full-size viewer in popup)
- Cmd+Shift+S quick screenshot werkt zonder draw mode (verified)
- Volledige pipeline: clipboard + ~/Pictures/Tandem/ + base64 panel preview

### 🧀 Phase 2.9 — Custom New Tab (Kees.ai)
- Nieuwe `shell/newtab.html` — custom new tab pagina
- Donker thema matching Tandem, centered layout met Tandem logo + 🧀
- Grote zoekbalk: submit → DuckDuckGo of directe URL navigatie
- Quick links: LinkedIn, GitHub, Kanbu, ClaroNote, DuckDuckGo, Gmail, YouTube, Reddit (met favicons)
- Recente tabs sectie (haalt data op van /tabs/list API)
- Kees chat widget rechtsonder (collapsible, met message polling)
- Nieuwe tabs laden newtab.html i.p.v. DuckDuckGo
- URL bar automatisch leeg bij new tab pagina's

### 🛡️ Bonus — Electron Fingerprint Hardening
- Complete `window.chrome` mock (runtime, loadTimes, csi, app met alle sub-objects)
- Verwijder Electron giveaways: window.process, require, module, exports, Buffer, __dirname, __filename
- `navigator.userAgentData` mock matching Chrome 131 (inclusief getHighEntropyValues)
- Verbeterde stealth voor bot-detectie tests (sannysoft, creepjs)

### 🐛 Bugfixes
- **Voice input**: Auto-restart recognition after `onend` event so continuous listening works 10s+
- **Voice UI**: Larger pulsating indicator (16px dot), "Spreek nu..." text, prominent styling
- **Screenshot without draw mode**: `Cmd+Shift+S` or toolbar 📸 button captures webview directly (no draw overlay needed), saves to clipboard + ~/Pictures/Tandem/
- **Chat auto-refresh**: Polls API every 2 seconds for new messages; messages sent via `POST /chat` appear instantly in Robin's panel
- **Chat auto-scroll**: Always scrolls to newest message

### 💬 Phase 2.6 — Kees Chat Koppeling
- Chat history persistent in `~/.tandem/chat-history.json` (survives app restart)
- Each message has timestamp + from (robin/kees)
- Chat UI: Robin messages right-aligned (green), Kees messages left-aligned (accent color)
- Timestamps shown on each message
- Typing indicator when Kees "thinks" — `POST /chat/typing` API endpoint
- `GET /chat?since_id=N` for efficient polling

### 🧬 Phase 2.8 — Behavioral Learning (Observation Layer)
- New `BehaviorObserver` class in main process (passive, no performance impact)
- Tracks: mouse clicks (position + timestamp), scroll events, keyboard timing (interval between keystrokes), navigation events, tab switches
- Raw data stored in `~/.tandem/behavior/raw/{date}.jsonl` (append-only, one event per line)
- `GET /behavior/stats` API endpoint with basic statistics (total events, avg click delay, avg keypress interval, etc.)
