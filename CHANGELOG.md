# Changelog

All notable changes to Tandem Browser are documented here.

---

## [0.11.2] — 2026-02-27

### Code Quality — Medium Items (Items 13–16)

- **Split security-manager routes**: extracted 34 Express route handlers from `SecurityManager` (978→414 lines) into new `security/routes.ts` (605 lines). SecurityManager no longer depends on Express
- **Lazy passwordManager**: replaced eager singleton with `getPasswordManager()` — SQLite vault DB only opens on first access
- **41 new tests**: `constants.test.ts` (14 tests), `config.test.ts` (27 tests with fs mocking and migration coverage). Total: 193 tests
- **Execution timeout**: `/execute-js` and `/devtools/evaluate` now have 30s timeout + 1MB code limit (prevents infinite loop DoS)

---

## [0.11.1] — 2026-02-27

### Code Quality — Quick Wins (Items 1–10)

- **Constants file**: `API_PORT`, `WEBHOOK_PORT`, `DEFAULT_PARTITION`, `AUTH_POPUP_PATTERNS`, timeout constants extracted to `src/utils/constants.ts`, replacing 15+ hardcoded values across 11 files
- **Dead code cleanup**: deleted unused `src/chat/interfaces.ts`, renamed duplicate `ActivityEntry` → `TaskActivityEntry`
- **Race condition fix**: removed duplicate `tab-register` IPC listener in main.ts
- **Silent catches**: replaced 16 `.catch(() => {})` with contextual `console.warn` across 8 files
- **Token security**: `crypto.timingSafeEqual` for API auth, deprecated query string token
- **Dutch → English**: translated all Dutch strings and comments across 12 files
- **Script utilities**: extracted 4 pure functions from `script-guard.ts` → `script-utils.ts` (independently testable, no Electron deps)
- **Named timeouts**: `COOKIE_FLUSH_INTERVAL_MS`, `CDP_ATTACH_DELAY_MS`, `DEFAULT_TIMEOUT_MS` replace magic numbers
- **Import fix**: moved `require('fs')` to top-level import in `routes/browser.ts`
- **Async safety**: wrapped `setInterval(async)` callbacks in try/catch in `update-checker.ts`

---

## [0.11.0] — 2026-02-27

### Code Quality & Architecture Refactoring

Major internal restructuring — 12 refactoring commits, 60+ files changed, zero feature regressions. All 152 tests passing.

#### Architecture
- **Split api/server.ts** into 12 route modules + context.ts (3032→349 lines)
- **Split main.ts** into ipc/handlers.ts, menu/app-menu.ts, notifications/alert.ts (1016→575 lines)
- **Split shell/index.html** into external CSS/JS files (6572→451 lines, 4 new files)
- **ManagerRegistry DI pattern**: replaced 35-param TandemAPIOptions with single registry interface
- **Explicit init order**: SecurityManager.init() consolidates 3 scattered initialization calls

#### Type Safety
- **CDP types**: 12 typed interfaces for Runtime, Network, DOM protocol domains
- **Removed all `catch(e: any)`**: 96 fixes across 32 files → `catch(e)` + `instanceof Error` checks
- **Reduced `: any` annotations**: 48 unsafe `any` replaced with proper types (64→16 remaining, all genuinely polymorphic)

#### Code Organization
- **Shared utilities**: `tandemDir()` used in 40 files, `handleRouteError()` in 12 route files
- **Fixed circular dependency**: copilotAlert extracted to `src/notifications/alert.ts`
- **Naming consistency**: `cleanup()` → `destroy()` across session manager

#### Testing
- **Unified test runner**: `npm test` auto-discovers `src/**/tests/**/*.test.ts`
- **152 tests** (was 86): added TabManager (30), TaskManager (26), utility (10) test suites

---

## [0.10.3] — 2026-02-26

### Behavioral Learning Models

- **Profile Compiler**: Added `src/behavior/compiler.ts` to process raw user input logs into statistical behavioral profiles.
- **Playback Engine**: Added `src/behavior/replay.ts` to simulate human mouse trajectories using smoothed mathematical curves and typing cadences using bigram delays.
- **Input System Integration**: Refactored `humanizedClick` and `humanizedType` in `src/input/humanized.ts` to consume the playback engine, removing naive hardcoded delays for ultra-realistic AI emulation.

---

## [0.10.2] — 2026-02-26

### Local Password Manager

- **Cryptographic Core (`src/security/crypto.ts`)**: Built a robust encryption engine using `AES-256-GCM` with key derivation via `PBKDF2` (100,000 iterations). 
- **Vault Storage (`src/passwords/manager.ts`)**: Encrypted payloads are saved in a local SQLite database (`~/.tandem/security/vault.db`) with zero cloud-sync integration. Ensures extreme data privacy.
- **Frontend Integration (`shell/index.html`)**: The Copilot side panel now features a dedicated `🔒` Lock icon, allowing on-demand unlocking and vault initialization via Master Password.
- **Autofill & Generation (`src/context-menu/menu-builder.ts`)**: Right-clicking an input element now shows a dynamic sub-menu if the vault is unlocked, allowing for context-aware password autofill or generating secure 24-character random passwords.

---

## [0.10.1] — 2026-02-26

### SPA Extraction Stabilization Fix

- Enhanced the `GET /page-content` API endpoint to handle heavily dynamic Single-Page Applications (SPAs) like Next.js and typical React sites.
- Implemented a sliding `MutationObserver` timeout that correctly resets on DOM changes instead of resolving prematurely.
- Added `minLength` configuration parameter to ensure extraction waits until the `innerText` size reaches an expected threshold or hits a hard timeout deadline.

---

## [0.10.0] — 2026-02-25

### Browser Extensions System

A complete browser extension infrastructure — from CRX download to runtime — built in 10 implementation phases with 73 automated tests.

#### 📦 Extension Loading & Management
- **CRX Downloader**: fetch extensions directly from Chrome Web Store by extension ID
- **Extension Gallery**: built-in gallery UI with 30 pre-curated extensions, search, categories, one-click install
- **Manifest V2 + V3 support**: parses and validates both manifest versions
- **Extension lifecycle**: install, enable, disable, uninstall with persistent state across restarts

#### 🧩 Runtime & Integration
- **Content Scripts**: automatic injection based on manifest `matches` patterns, `run_at` timing (`document_start`, `document_idle`, `document_end`)
- **Background Scripts**: service worker execution environment for Manifest V3
- **Browser Action / Page Action**: toolbar button rendering with badge text, badge color, popup HTML
- **Native Messaging**: host registration and message passing between extensions and native apps
- **OAuth Polyfill**: `chrome.identity.getAuthToken` / `launchWebAuthFlow` implementation for extensions that need Google auth

#### 🔒 Security & Isolation
- **Permission system**: manifest permissions parsed and enforced
- **Conflict detection**: warns when multiple extensions modify the same resources
- **CSP enforcement**: Content Security Policy applied per extension context

#### 🔄 Auto-Updates
- Extension update checks against Chrome Web Store
- Automatic download and install of new versions
- Version comparison logic (semver-compatible)

#### 🛠️ Extension Toolbar
- Dedicated toolbar area for extension icons
- Click to trigger browser action popup
- Right-click context menu per extension (options, disable, remove)

#### ✅ Test Coverage
- **73 automated tests** via Vitest — all passing
- Covers: CRX parsing, manifest validation, content script injection, permission checks, conflict detection, update logic, gallery search

---

## [0.9.0] — 2026-02-25

### Security Intelligence Upgrade

The most significant security release in Tandem's history. Inspired by reference implementations from the **Australian Signals Directorate (Azul)**, **GCHQ (CyberChef)**, and the **NSA (Ghidra)** — 9 implementation phases, 75 tasks, 4,800+ lines of new security code.

#### 🔬 JavaScript Threat Analysis (Phases 2A/2B)
- **25 YARA-style threat rules** covering obfuscation, exfiltration, injection, redirect, and evasion patterns
- Pattern categories: `eval(string)`, `String.fromCharCode` chains, cookie+fetch proximity detection, `ActiveXObject`, `document.write`, silent catch blocks, credential harvesting, and more
- Scoring engine with severity tiers: `low` / `medium` / `high` / `critical`
- Critical detections notify the Gatekeeper AI agent in real time
- Combined entropy + rule match boosts threat score by 25%

#### 📊 Shannon Entropy Detection (Phase 1)
- Detects obfuscated scripts that evade pattern matching
- Scores 0–8 bits; thresholds: >6.0 medium, >6.5 high, >7.0 critical
- Only applies to external scripts between 1KB and 500KB
- Runs asynchronously — zero impact on page load latency

#### 🧬 AST Fingerprinting (Phases 6A/6B — Ghidra BSim-inspired)
- Parses JavaScript with **Acorn** into an Abstract Syntax Tree
- Hashes structural features (node types, operators, arity) — ignoring variable names and string literals
- Two obfuscated variants of the same script produce the **same AST hash**
- Cosine similarity matching: ≥0.95 = structurally identical, ≥0.85 = structurally similar
- Scripts under 200KB are fingerprinted; syntax errors degrade gracefully

#### 🔗 Cross-Domain Script Correlation (Phases 3A/3B)
- Every external script fingerprinted with: `script_hash`, `normalized_hash` (comments stripped, whitespace collapsed), `ast_hash`, `ast_features`
- If a script hash appears on a known-blocked domain → critical event + Gatekeeper notification
- If 5+ distinct domains serve the same script → widespread script detection
- AST variant detection: 3+ domains with same AST structure but different regular hashes = obfuscation campaign
- API: `GET /security/scripts/correlations`

#### 🎯 Confidence-Weighted Pipeline (Phases 5A/5B/5C)
- `AnalysisConfidence` enum: `BLOCKLIST(100)`, `CREDENTIAL_EXFIL(200)`, `KNOWN_MALWARE_HASH(300)`, `BEHAVIORAL(500)`, `HEURISTIC(700)`, `ANOMALY(800)`, `SPECULATIVE(900)`
- Events with confidence ≤300: resolved locally, never forwarded to AI agent
- Events with confidence 301–600: forwarded with medium priority
- Events with confidence >600: forwarded with high priority — needs AI judgment
- Trust evolution weighted by confidence: ≤300 = full impact, 301–600 = 70%, >600 = 40%

#### 🔍 Deep Page Source Scanning (Phase 4 — CyberChef patterns)
- Battle-tested URL, domain, IPv4, email regex patterns from CyberChef (GCHQ)
- Scans up to 1MB of page HTML after load, plus all inline `<script>` blocks
- Detects **octal IP evasion** (e.g. `0177.0.0.1` → `127.0.0.1`) and flags with severity medium
- Blocked domains/IPs hidden anywhere in page source → `hidden-blocked-url` / `hidden-blocked-ip` events

#### 🔌 Security Plugin Architecture (Phases 7A/7B/7C)
- `SecurityAnalyzer` interface: `name`, `version`, `eventTypes`, `priority`, `initialize()`, `canAnalyze()`, `analyze()`, `destroy()`
- `AnalyzerManager`: priority-sorted dispatch, crash-safe per-analyzer try/catch, re-entrancy guard
- Three built-in analyzers:
  - `content-analyzer` (priority 400) — page phishing/tracker/mixed-content analysis
  - `behavior-monitor` (priority 500) — permissions, CPU, crypto miner detection
  - `event-burst-detector` (priority 950) — fires when 10+ events from one domain in 60 seconds
- API: `GET /security/analyzers/status`
- Developers can drop new analyzers into `src/security/analyzers/` without touching core code

#### ✅ Test Coverage (Phase 9)
- **51 automated tests** via Vitest — all green
- Covers: `calculateEntropy`, `normalizeScriptSource`, `computeASTHash`, `computeSimilarity`
- Every one of the 25 threat rules validated with true-positive and true-negative samples
- Electron modules fully mocked — tests run without a browser

#### 🧹 Code Quality (Phases 0A, 9)
- Deduplicated `KNOWN_TRACKERS` and `URL_LIST_SAFE_DOMAINS` — single source of truth in `types.ts`
- `EventCategory` extended with `'content'` for page analysis events
- CDP attachment timing improved: `Debugger.enable` moved into `attach()`, initial timeout reduced from 2000ms to 500ms
- Performance logging: warns on script analysis >50ms, page scan >100ms
- All DB migrations backward-compatible (`ALTER TABLE ADD COLUMN` with try/catch)

#### 🔧 Infrastructure Fixes (Phases 0B, 8)
- `cookie_count` now receives real values from Guardian's response header analysis
- `correlateEvents()` auto-triggered every 100 events or hourly
- Blocklist update scheduled every 24 hours; immediate catch-up on startup if overdue
- `sendEvent()` wired in `onEventLogged` — confidence-based Gatekeeper routing now actually works
- `script_hash` computed from fetched source (reliable) instead of CDP event param (unreliable)
- `debugger://` URL prefix filtered in ScriptGuard
- `@types/acorn` removed — Acorn v8 ships its own TypeScript declarations

---

## [0.8.0] — 2026-02-24

### macOS Native Chrome + Smart Scroll

#### 🍎 macOS Native UI
- **Vibrancy sidebar**: `vibrancy: 'sidebar'` + `visualEffectState: 'active'` — Copilot panel blurs content behind it (macOS only, Linux unchanged)
- **Under-window vibrancy**: transparent glass chrome across tab bar, toolbar, and bookmarks bar
- **Inline titlebar**: `hiddenInset` + `titleBarStyle: 'hiddenInset'` — tabs sit flush with traffic light buttons, Chrome-style
- Platform-guarded — all macOS UI changes are `process.platform === 'darwin'` gated

#### 📜 Smart Scroll
- Viewport-aware scroll detection
- Live mode toggle for continuous scroll tracking
- `focus` parameter on `POST /tabs/open` — open tabs in background without disturbing active SPA session (fixes Discord session bug)

---

## [0.7.0] — 2026-02-23

### Linux Support + Visual Overhaul

#### 🐧 Full Linux Support
- `scripts/run-linux.sh` — production-grade startup script for Linux
- `--no-sandbox` flag for sandboxed Linux environments (Docker, CI, most VMs)
- Wayland → X11 automatic fallback (`--ozone-platform=x11`) for stability
- GPU disabled automatically in headless/virtual environments
- Cross-platform Chrome data import: reads Chrome profile paths on Linux (`~/.config/google-chrome/`), macOS, and Windows
- UI translated from Dutch to English; agent name generalized from `Kees` → configurable `Copilot`
- `run-electron.js` script: cleans `ELECTRON_RUN_AS_NODE` before launch (required for VSCode/Claude Code integration)

#### ✨ Liquid Glass Lite (LGL)
- CSS-first glass effects without WebGL — zero performance overhead
- Glass chrome layer overlaid on top of webview content
- Smooth Copilot panel slide animation + improved resize behavior
- `LGL v2`: performant implementation using overlay layout, no layout thrashing
- macOS and Linux compatible

---

## [0.6.0] — 2026-02-21

### Agent Tools + Electron Upgrade + Security Hardening

#### ⚡ Electron Upgrade v28 → v40
- **Electron 40.6.0** (was v28) — major framework upgrade
- **Chromium 128 → 144** — latest rendering engine, Web API improvements
- **Node.js 18 → 24** — V8 engine update, performance improvements
- All deprecated APIs migrated, no breaking changes in Tandem code

#### 🤖 Agent Browser Tools
Three phases of Playwright-style agent automation built on top of Tandem's native CDP bridge:

**Phase 1 — Persistent Script & Style Injection**
- `POST /scripts/add` / `POST /scripts/remove` / `POST /scripts/enable` / `POST /scripts/disable` — inject JavaScript that survives navigation
- `POST /styles/add` / `POST /styles/remove` — inject CSS that persists across page loads
- Use case: debug overlays, custom UI patches, monitoring hooks

**Phase 2 — Semantic Locators**
- `GET /snapshot` — full accessibility tree with stable `@eN` refs (Playwright-style)
- `POST /snapshot/click {"ref":"@e12"}` — click by ref, no fragile CSS selectors
- `POST /snapshot/fill {"ref":"@e3","value":"..."}` — fill inputs by ref
- `GET /snapshot/text?ref=@e1` — extract text by ref
- `POST /find {"by":"text|role|placeholder|label|testid","value":"..."}` — semantic element search
- `POST /find/click`, `POST /find/fill` — locate and act in one call
- `GET /find/all` — return all matches

**Phase 3 — Device Emulation**
- `POST /device/emulate {"device":"iPhone 15"}` — full device profile (viewport, UA, touch)
- `GET /device/profiles` — list all supported devices
- `POST /device/reset` — back to desktop mode

**Session Management**
- `POST /sessions/create` — isolated browser contexts (separate cookies, localStorage, history)
- `POST /sessions/switch` / `POST /sessions/destroy` — context lifecycle
- `POST /sessions/state/save {"name":"linkedin"}` / `POST /sessions/state/load` — persist and restore auth states
- `GET /sessions/state/list` — list saved states

**Network Mocking**
- `POST /network/mock {"pattern":"**/api/**","status":200,"body":{}}` — intercept and mock responses
- `POST /network/mock {"pattern":"...","abort":true}` — block requests entirely
- `GET /network/mocks` / `POST /network/unmock` / `POST /network/mock-clear`

**Tandem CLI**
- `@hydro13/tandem-cli` npm package — full API access from the command line
- `tandem snapshot`, `tandem click <ref>`, `tandem fill <ref> <text>`, `tandem eval <js>`
- `tandem session list|create|switch|destroy`
- `tandem open <url>`, `tandem screenshot [path]`, `tandem cookies`

#### 🔒 Security Hardening
- Fixed 4 critical Guardian blind spots (redirect detection, WebSocket handling)
- Real redirect blocking via `onHeadersReceived` (replaces unreliable `onBeforeRedirect`)
- Eliminated WebSocket false positives
- Critical security fixes: JS injection prevention, anti-detection hardening, CORS lockdown

---

## [0.5.0] — 2026-02-19

### Security Shield — Five-Layer Defense System

The original security architecture: a complete, layered threat detection system built into the browser core.

#### Architecture

```
Incoming request
    ↓
[Layer 1] Guardian + NetworkShield    — sync, <5ms, blocks known-bad domains/URLs
    ↓
[Layer 2] OutboundGuard               — POST/PUT/PATCH body scanning for credential exfiltration
    ↓
[Layer 3] ScriptGuard + ContentAnalyzer + BehaviorMonitor  — CDP-based runtime analysis
    ↓
[Layer 4] GatekeeperWebSocket         — async AI agent bridge for ambiguous decisions
    ↓
[Layer 5] EvolutionEngine + ThreatIntel + BlocklistUpdater — learning, correlation, updates
```

#### 🛡️ Layer 1 — Network Shield
- **811,000+ blocklist entries** in memory (URLhaus, PhishTank, Steven Black)
- Sub-millisecond domain lookup (in-memory Set + SQLite fallback)
- Auto-updated every 24 hours from three independent threat intelligence feeds
- Parent-domain matching: blocks `evil.com` and all subdomains
- Three guardian modes per domain: `strict` / `balanced` / `permissive` (banking auto-elevated to strict)

#### 🚫 Layer 2 — Outbound Guard
- Scans POST/PUT/PATCH request bodies for credential exfiltration patterns
- Detects: password fields, session tokens, API keys, credit card numbers sent to third parties
- Content-Type whitelist: skips body scan for known-safe media types
- Multi-field form safety guard prevents false negatives on mixed uploads

#### 🔍 Layer 3 — Runtime Analysis
- **ScriptGuard**: CDP `Debugger.scriptParsed` — tracks every script loaded by every page, fingerprints with SHA-256 hash, stores domain+URL+hash in SQLite
- **ContentAnalyzer**: detects hidden iframes, mixed content, known trackers, typosquatting, password fields on HTTP pages
- **BehaviorMonitor**: permission request tracking, clipboard read detection, CPU spike detection for crypto miners, memory growth monitoring

#### 🤖 Layer 4 — Gatekeeper AI Bridge
- WebSocket connection at `/security/gatekeeper` for any AI agent
- Non-blocking: browser never waits for AI response — fail-open design
- Decision queue with REST API: `GET /security/gatekeeper/queue`, `POST /security/gatekeeper/decision/:id`
- AI agent can allow/block/warn with optional reason

#### 📈 Layer 5 — Adaptive Learning
- **EvolutionEngine**: per-domain trust scores (0–100), new domains start at 30
  - +1 per clean visit (max 90), -10 on anomaly, -15 on block
  - Welford's algorithm for statistical baseline, 2-sigma anomaly detection
- **ThreatIntel**: correlates events across domains, generates reports, detects zero-day candidates
- **BlocklistUpdater**: automated 24h refresh cycle with delta updates

#### 🗄️ Persistence
- SQLite database at `~/.tandem/security/shield.db` (WAL mode, all queries via prepared statements)
- 6 tables: `events`, `domain_info`, `blocklist`, `script_fingerprints`, `blocklist_metadata`, `pattern_matches`
- 40+ prepared statements — all hot-path queries pre-compiled

#### 🌐 Security API (32 routes)
- `GET /security/status` — full system status
- `GET /security/events` — event log with filtering
- `GET /security/domain/:domain` — trust score + event history
- `GET /security/scripts/correlations` — cross-domain script analysis
- `GET /security/analyzers/status` — plugin analyzer registry
- And more: outbound stats, gatekeeper queue, evolution data, threat reports

---

## [0.4.0] — 2026-02-18

### CDP DevTools Bridge + Context Menu + Chat Bridge

#### 🔧 CDP DevTools Bridge
Full Chrome DevTools Protocol access via HTTP API:
- `GET /devtools/console` — live console logs with level filtering (`error`, `warn`, `log`, `info`)
- `GET /devtools/network` — all network requests with domain/type/status filtering
- `GET /devtools/network/:id/body` — fetch response body by request ID
- `POST /devtools/dom/query` — CSS selector query, returns matched elements
- `POST /devtools/dom/xpath` — XPath query
- `GET /devtools/storage` — cookies + localStorage + sessionStorage
- `GET /devtools/performance` — heap size, DOM node count, JS heap metrics
- `POST /devtools/evaluate` — execute JavaScript in page context
- `POST /devtools/cdp` — raw CDP command passthrough

#### 🖱️ Context Menu (6 phases)
Full right-click context menu system built in 6 phases:
- Standard: Back, Forward, Reload, Save As, Print, View Source, Inspect
- Link: Open in new tab/window, Copy URL, Save link
- Image: Save image, Copy image, Open in new tab
- Selection: Copy, Search with DuckDuckGo, Summarize (via Copilot)
- Input/editable: Cut, Copy, Paste, Select All, Spell check
- Tab bar: Duplicate tab, Pin tab, Close other tabs
- Tandem-specific: Ask Copilot about selection, Bookmark this page, Summarize page

#### 💬 Chat Bridge
- Webhook notification to OpenClaw for real-time message delivery
- Chat history persistent in `~/.tandem/chat-history.json`
- Message timestamps, deduplication, typing indicator (`POST /chat/typing`)
- Poll endpoint: `GET /chat?since_id=N` for efficient incremental updates
- Image attachment support: chat images saved to `~/.tandem/chat-images/`

#### 👁️ Copilot Vision
- Real-time activity stream from browser to AI via `Runtime.addBinding` (CDP stealth injection)
- Tracks: scroll events, text selections, form interactions, navigation
- Screenshot capture with base64 payload delivery to Copilot panel

---

## [0.3.0] — 2026-02-13

### Multi-Model AI + Session Management

#### 🤖 AI Coordination
- **MCP server** (Model Context Protocol) — 15 tools + 4 resources, standardized AI ↔ browser interface
- **EventStream** — server-sent events (SSE) for real-time page activity
- **ContextManager** — maintains browsing context across AI sessions
- **ChatRouter** — routes messages to multiple AI backends (OpenClaw, local models)
- **DualMode**: human and AI can control the same tab simultaneously with source tracking
- **TabLockManager**: prevents AI actions on tabs currently controlled by the human

#### 🤖 Agent Autonomie
- **TaskManager**: autonomous task queue — AI agent can plan, approve, execute, and report multi-step browser tasks
- **Approval UI**: user-facing approval panel for agent-proposed actions (allow/deny/modify)
- **Noodrem (Emergency Stop)**: hard kill switch for all agent activity — immediately halts autonomous execution
- **X-Scout**: background reconnaissance agent that pre-fetches and analyzes pages before the main agent visits them

#### 📋 Tab Sessions & State
- Tab source tracking: each tab has a `source` field (`'robin'` | `'copilot'`)
- `POST /tabs/open` with `source` parameter
- Session state: save/load named browser states (cookies, localStorage, tab positions)
- `X-Session` header support for session context in API calls

---

## [0.2.0] — 2026-02-11

### Full Browser Feature Suite

The first major feature release — transforming the initial prototype into a capable daily-driver browser.

#### 📚 Phase 4 — Chrome Parity Features
- **Bookmarks**: full CRUD, folder hierarchy, bookmarks bar, Cmd+D to bookmark, star icon in URL bar
  - `GET/POST /bookmarks`, folder creation, search, import from Chrome JSON
- **History**: automatic visit tracking, full-text search, history page (Cmd+Y), `DELETE /history/clear`
- **Downloads**: Electron download hooks, progress tracking, completion notifications, `GET /downloads/active`
- **Find in Page**: Cmd+F search bar, match count, next/prev navigation, Escape to close
- **Chrome Data Import** (`POST /import/chrome/*`): bookmarks (JSON), browsing history (SQLite)

#### 🧠 Phase 3 — Copilot Intelligence
- **Site Memory** (`/memory/sites`): auto-extracts title, meta, headings, forms, links, 500-char text preview on every visit. Max 100 visits + 50 diffs per domain, full-text search
- **Scheduled Watches**: monitor any URL for changes. SHA-256 hash-based diff detection, macOS notifications + copilot alert on change. `POST /watch/add`, max 20 concurrent watches
- **Headless Mode**: hidden BrowserWindow for Copilot to browse independently (same cookies). Captcha/login-wall detection with auto-show + alert. `POST /headless/open`
- **Form Memory**: encrypted (AES-256-GCM) form data per domain. Auto-fill support. `GET /forms/memory/:domain`, `POST /forms/fill`
- **Context Bridge**: records URL, title, summary, headings, link count on every page load. Searchable store (max 5,000 entries). `GET /context/search?q=...`
- **Bidirectional Steering**: explicit tab source switching. `POST /tabs/source`
- **PiP Mode**: always-on-top mini window (350×250, frameless, draggable) with status dashboard. Cmd+P to toggle
- **Network Inspector**: logs all traffic via `session.webRequest` (main process, anti-detect safe). Detects API endpoints (JSON, `/api/`, `/v1-3/`, `/graphql`). `GET /network/log`, `GET /network/apis`

#### 🔒 Phase 5 — Stealth & Fingerprint Protection
- **Canvas fingerprint randomisation**: seeded PRNG with ±2 noise per channel, consistent per session
- **WebGL spoofing**: vendor/renderer overridden to `"ANGLE (Apple, Apple M1, OpenGL 4.1)"`
- **Font enumeration protection**: only standard macOS fonts pass `document.fonts.check()`
- **Audio fingerprint protection**: subtle noise on `AnalyserNode` + `OfflineAudioContext`
- **Timing protection**: `performance.now()` reduced to 100μs, `Date.now()` ±1ms jitter
- **`window.chrome` mock**: complete runtime, loadTimes, csi, app sub-objects
- **Electron giveaway removal**: strips `window.process`, `require`, `module`, `exports`, `Buffer`, `__dirname`
- **`navigator.userAgentData` mock**: matches Chrome 131 including `getHighEntropyValues`
- **Google auth bypass**: intercepts Google login and opens in native BrowserWindow popup (bypasses embedded browser block)

#### 🎙️ Tab Audio Capture
- **Cmd+R** to capture tab audio stream
- Audio routed from webview to Copilot for real-time transcription/analysis
- Visual indicator in tab bar when audio capture is active

#### ❓ Help & Keyboard Shortcuts
- **Help page** (`tandem://help`) — full feature overview and getting started guide
- **Keyboard shortcuts overlay** (Cmd+?) — quick reference for all shortcuts
- All shortcuts documented and organized by category

#### 🔑 API Authentication
- **Bearer token auth** on all API endpoints (`localhost:8765`)
- Token generated on startup, stored in `~/.tandem/api-token`
- Unauthorized requests return 401 — prevents local network exploitation

#### 🎙️ ClaroNote Integration
- Native voice-to-text recording via ClaroNote API
- Waveform visualization, recording timer
- Notes management: list recent notes with UPLOADING→PROCESSING→READY status
- Cmd+Shift+C quick-record shortcut
- JWT auth stored in `~/.tandem/claronote-auth.json`

#### ⚙️ Settings & Config
- Full settings page (`tandem://settings`, Cmd+,)
- Sections: General, Screenshots, Voice, Stealth, Behavioral Learning, Data
- Live save on every change, no restart needed
- Data management: export, import, wipe with confirmation modal
- `GET /config`, `PATCH /config` (deep merge)

#### 🆕 Custom New Tab
- Custom new tab page replacing browser default
- Large search bar (DuckDuckGo or direct URL)
- Quick links with favicons (LinkedIn, GitHub, Kanbu, Gmail, YouTube, etc.)
- Recent tabs section pulled from `/tabs/list` API
- Collapsible Copilot chat widget

#### 🔄 Multi-Step Workflow Engine
- `WorkflowEngine`: chainable step sequences (navigate, wait, click, type, extract, screenshot, scroll, condition)
- Condition logic: `if element exists` / `text contains` / `URL matches` → `goto` / `skip` / `abort`
- Variables system: pass data between steps
- `POST /workflow/run`, `GET /workflow/status/:id`, `POST /workflow/stop`

#### 📊 Behavioral Learning
- Passive observation of mouse clicks, scroll events, keyboard timing, navigation, tab switches
- Raw data: `~/.tandem/behavior/raw/{date}.jsonl` (append-only)
- `GET /behavior/stats`: avg click delay, avg keypress interval, total events

---

## [0.1.0] — 2026-02-11

### Initial Release

- Electron + TypeScript browser built for human-AI symbiosis
- Stealth layer: Chrome User-Agent spoofing, Electron signature removal
- Tab management with favicon display, title, close button
- Copilot side panel with Chat, Screenshots, and Activity tabs
- Draw/annotation overlay (Cmd+Shift+D) with pen, eraser, colors, undo, save
- Screenshot pipeline: clipboard + `~/Pictures/Tandem/` + base64 panel preview (Cmd+Shift+S)
- REST API on `localhost:8765` — foundation for all AI automation
- Tab bar with emoji source indicators (👤 human / 🤖 copilot per tab)
- Humanized input module: simulates natural mouse movement and keystroke timing
- Behavioral observation layer: passive tracking for future pattern learning
- `npm start` launch script (cleans `ELECTRON_RUN_AS_NODE` for VSCode/Claude Code compatibility)

---

*Tandem Browser is currently in private development. Follow [@Robin_waslander](https://x.com/Robin_waslander) on X for updates.*
