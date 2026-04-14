# Tandem Browser TODO

> Internal development backlog for active and upcoming work.
> Historical release summaries belong in `CHANGELOG.md`.
> Architecture and product context belong in `PROJECT.md`.

Last updated: April 14, 2026

## Purpose

- Keep this file forward-looking.
- Track active priorities, maintenance tasks, and unresolved questions.
- Avoid turning this file into a second changelog or a historical roadmap.

## Current Snapshot

- Current app version: `0.72.2`
- MCP server: 248 tools (full API parity + awareness)
- The codebase scope is larger than this backlog summary and includes major subsystems such as `sidebar`, `workspaces`, `pinboards`, `sync`, `headless`, and `sessions`.
- Scheduled browsing already exists in baseline form via `WatchManager` and the `/watch/*` API routes.
- Session isolation already exists in baseline form via `SessionManager` and the `/sessions/*` API routes.
- `TODO.md` is the active engineering backlog; `docs/internal/ROADMAP.md` and `docs/internal/STATUS.md` are historical snapshots, not the day-to-day source of truth.

## Current Priorities

### Product Features

- [x] Update `skill/SKILL.md` so MCP-first clients, direct-HTTP clients, and the new durable handoff model are all documented with the current Tandem behavior
- [ ] Remove the remaining legacy OpenClaw compatibility IPC and unused webhook chat code after the signed gateway-chat path has shipped for a release or two
- [x] `WebSocket /watch/live` for live watch updates
- [ ] Expose `captureApplicationScreenshot` and `captureRegionScreenshot` as HTTP API endpoints (e.g. `POST /screenshot/application`, `POST /screenshot/region`) so OpenClaw agents can trigger full-window and region captures programmatically without requiring IPC or human interaction
- [x] Show a notification when the Wingman panel is closed and Wingman replies
- [x] Google Photos upload support for screenshots; local OAuth client ID setup, connect/disconnect flow, and automatic upload path now exist
- [x] Screenshot capture modes for `Web Page`, `Application`, and in-app `Region` selection from the main toolbar screenshot button
- [x] Configurable quick links on the new tab page; links are no longer hardcoded
- [x] Configurable diff modes for watches beyond SHA-256 hash comparison
- [x] HAR export for the network inspector
- [ ] Design and build the `Personal News` experience; the sidebar currently has a placeholder slot, but the actual panel and feed model are not implemented yet
- [x] Built-in video recorder with Application and Region capture modes, tab audio + mic toggle, MP4 output via ffmpeg; replaces AudioCaptureManager
- [ ] Linux video recorder: implement desktop audio capture via PulseAudio/Pipewire monitor sources; current implementation captures mic audio but not webview/tab audio due to Electron process isolation limitations on Linux

### Maintenance Sweep

- [x] Align public-facing docs, repo metadata, and contribution guidance for a public developer preview
- [x] Reduce the first high-signal GitHub CodeQL security backlog: fix the bearer-token ReDoS, new-tab and OAuth callback XSS paths, URL substring checks in auth/search heuristics, path containment for session/workflow/import/update files, and baseline API rate limiting on the most sensitive flagged routes
- [x] Fix the `Snoze` typo in `docs/research/opera-browser-research.md` and do a quick spell-check in the same tab-snoozing section
- [x] Harden extension update version comparison in `src/extensions/update-checker.ts`; `isNewerVersion()` now handles uneven segment lengths and prerelease suffixes such as `1.2.3-beta`
- [x] Add focused tests for extension version comparison edge cases in `src/extensions/tests/`, including `1.2` vs `1.2.0`, `1.10.0` vs `1.9.9`, and pre-release suffix input

### Codebase Hygiene

- [x] Make Wingman `openclaw` mode gateway-first for sends, sign a real OpenClaw device identity for the WebSocket handshake, and persist gateway replies into Tandem chat history so stock Tandem no longer depends on a local OpenClaw tandem-chat skill
- [x] Split `src/main.ts` bootstrap and teardown wiring into dedicated `src/bootstrap/` modules so manager composition stops growing in one file
- [x] Extract the largest shell surfaces out of `shell/index.html` and `shell/css/main.css` so sidebar logic, modal helpers, and stylesheet sections stop living in single inline or monolithic files
- [x] Split the Wingman and ClaroNote renderer surfaces out of `shell/js/main.js` into dedicated shell modules with explicit shared state instead of file-scope coupling
- [x] Extract browser tools (`bookmarks`, `history`, `find`, `voice`, `settings`, `screenshot`) out of `shell/js/main.js` into `shell/js/browser-tools.js` with the shared renderer bridge as the explicit integration surface
- [x] Extract tab rendering, navigation, zoom, and shared renderer state out of `shell/js/main.js` into `shell/js/tabs.js`, and keep active-tab coordination explicit through the renderer bridge
- [x] Extract the draw overlay surface out of `shell/js/main.js` into `shell/js/draw.js` so annotation state, screenshot compositing, and draw-mode lifecycles stop sharing a file with window chrome and shortcuts
- [x] Replace the last mixed shell entrypoint with dedicated `shell/js/window-chrome.js` and `shell/js/shortcut-router.js` modules so `main.js` is no longer needed as a catch-all shell loader
- [ ] Investigate strict Gatekeeper fallback blocking mainstream site scripts when the local agent bridge is unavailable; manual startup checks on March 14, 2026 showed GitHub asset scripts being denied under `strict_low_trust_script`
- [ ] Investigate the remaining 1Password MV3 service-worker startup noise (`DidStartWorkerFail ...: 5` and policy calculation errors) and determine whether it affects any real user-facing behavior; the old `__tandemExtensionHeaders` background error is fixed, and current manual checks indicate the extension still works for normal use
- [ ] Make `ContextBridge` summaries natively actor/workspace-aware so `/context/summary` and other non-MCP consumers stop relying on MCP-side enrichment for ownership context
- [ ] Expand the new handoff system beyond the first Activity-tab inbox with a dedicated handoff history/detail view; task-linked ready/resume/approve/reject actions now flow through a shared task↔handoff coordinator
- [x] Add GitHub Actions verification for `npm run verify` on pushes and pull requests

## Later

### Distribution and UX

- [ ] Full multi-profile UX on top or the existing `SessionManager` isolation model
- [ ] Auto-updater integration (`electron-updater`); `release/` still contains an old `0.1.0` manifest
- [ ] Production-ready DMG build for macOS with current naming and metadata
- [ ] AppImage build for Linux
- [ ] Documentation site
- [ ] Firefox import

### Stealth and Browser Fidelity

- [ ] Proxy support (SOCKS5 or HTTP, per-tab or global)
- [ ] User-facing request interception and header rewrite rules
- [ ] TLS / JA3 fingerprint matching
- [ ] Screen resolution spoofing
- [ ] Battery API masking
- [ ] Geolocation spoofing

## Open Questions

- [x] Define what `Agent Tools Phase 4` should be; `docs/agent-tools/STATUS.md` still marks it as the next implementation target — Resolved: Phases 1-3 cover the needed functionality; marked project as COMPLETED
- [x] Define what `Security Fixes Phase 2` should be; `docs/security-fixes/STATUS.md` still leaves this open — Resolved: Phase 1 covers the needed fixes; marked project as COMPLETED

## Recently Completed

- [x] Version consistency sweep: package metadata, MCP server version reporting, README / PROJECT / landing-page version labels, and the consistency checker now stay aligned so startup and docs stop lagging behind the changelog
- [x] Closed-panel Wingman handoff attention state: open handoffs now keep a durable toolbar/toggle cue with count, status-derived urgency, and a non-spammy delayed escalation state so "the agent still needs you" stays visible after the transient popup disappears
- [x] Explicit human↔agent handoffs: durable handoff records with statuses (`needs_human`, `blocked`, `waiting_approval`, `ready_to_resume`, `completed_review`, `resolved`) now exist across HTTP API, MCP tools, live event surfaces, and the Wingman Activity inbox, with workspace/tab targeting and resolve/resume actions
- [x] Interaction reliability follow-up: snapshot fill now replaces populated field values deterministically, keyboard completion confirmation recognizes active-element focus shifts, and label locators have a runtime fallback for simple `label[for]` associations
- [x] Interaction completion semantics: selector, snapshot-ref, locator, and keyboard actions now return explicit tab scope, target resolution, completion mode, and lightweight post-action state across HTTP API and MCP
- [x] DevTools and network inspection tab scoping: `/devtools/*` and `/network/*` retrieval routes now default to active-tab scope, honor explicit tab targeting, and keep MCP descriptions aligned with the real behavior
- [x] Awareness tools: activity digest and real-time focus detection for shared human-AI context
- [x] URL bar autocomplete from browsing history (Chrome-style dropdown with inline completion)
- [x] MCP bookmark management: list, add, delete, update, folders, move, check (7 tools)
- [x] MCP history and site memory: list, clear, activity log, site memory search (6 tools)
- [x] MCP keyboard input: press-key and press-key-combo with new HTTP endpoints (2 tools)
- [x] MCP live preview: create, update, list, delete HTML previews in browser (4 tools)
- [x] Dark mode rendering fix: disabled Chromium WebContentsForceDark, set nativeTheme to system
- [x] Google CookieMismatch fix: restored real Electron UA for Google auth, disabled cookie partitioning, fixed Sec-CH-UA mismatch
- [x] Stealth UA auto-sync: dynamic version from process.versions.chrome instead of hardcoded Chrome/131
- [x] Workspace emoji icons: emoji strings now render directly in sidebar
- [x] MCP Server — Full API Parity: expanded from 24 to 231 tools across 29 modular files, covering every HTTP API endpoint. Refactored from monolithic server.ts into tools/ directory matching API route structure.
- [x] Preload sandbox fix: added esbuild bundling step so the split preload modules work with Electron's `sandbox: true`
- [x] Security dependency updates: resolved all 28 Dependabot alerts (electron, hono, lodash, brace-expansion, path-to-regexp)
- [x] Workspace API handoff for OpenClaw: `/tabs/open` now honors `workspaceId`, `/workspaces/:id/activate` and `/workspaces/:id/tabs` exist, and `/wingman-alert` can bring the requested workspace into view before notifying the user
- [x] Multi-actor workspace consistency: focused tab ownership, workspace selection, and SSE context now stay explicit across HTTP and MCP surfaces
- [x] API `X-Tab-Id` targeting for `/snapshot`, `/page-content`, `/page-html`, and `/execute-js`, with background-tab-safe CDP evaluation and tab-scoped snapshot refs
- [x] Password manager: local SQLite + AES-256-GCM vault, master password, autofill, password generator, and `GET /passwords/suggest`
- [x] Behavioral learning models: profile compiler, typing timing model, mouse trajectory replay, and fallback humanization behavior
- [x] SPA rendering fix for `/page-content` on dynamic pages; see `docs/archive/plans/spa-rendering-bug.md`
