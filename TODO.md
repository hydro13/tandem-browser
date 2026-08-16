# Tandem Browser TODO

> Internal development backlog for active and upcoming work.
> Historical release summaries belong in `CHANGELOG.md`.
> Architecture and product context belong in `PROJECT.md`.

Last updated: August 16, 2026

## Purpose

- Keep this file forward-looking.
- Track active priorities, maintenance tasks, and unresolved questions.
- Avoid turning this file into a second changelog or a historical roadmap.

## Current Snapshot

- Current app version: `1.11.4`
- MCP server: 257 tools (full API parity + awareness)
- The codebase scope is larger than this backlog summary and includes major subsystems such as `sidebar`, `workspaces`, `pinboards`, `sync`, `headless`, and `sessions`.
- Scheduled browsing already exists in baseline form via `WatchManager` and the `/watch/*` API routes.
- Session isolation already exists in baseline form via `SessionManager` and the `/sessions/*` API routes.
- `TODO.md` is the active engineering backlog; release history lives in `CHANGELOG.md`.

## Current Priorities

### Product Features

- [x] Update `skill/SKILL.md` so MCP-first clients, direct-HTTP clients, and the new durable handoff model are all documented with the current Tandem behavior
- [ ] Remove the remaining legacy OpenClaw compatibility IPC and unused webhook chat code after the signed gateway-chat path has shipped for a release or two
- [x] `WebSocket /watch/live` for live watch updates
- [x] Expose `captureApplicationScreenshot` and `captureRegionScreenshot` as HTTP API endpoints (e.g. `POST /screenshot/application`, `POST /screenshot/region`) so OpenClaw agents can trigger full-window and region captures programmatically without requiring IPC or human interaction
- [x] Show a notification when the Wingman panel is closed and Wingman replies
- [x] Google Photos upload support for screenshots; local OAuth client ID setup, connect/disconnect flow, and automatic upload path now exist
- [x] Screenshot capture modes for `Web Page`, `Application`, and in-app `Region` selection from the main toolbar screenshot button
- [x] Configurable quick links on the new tab page; links are no longer hardcoded
- [x] Configurable diff modes for watches beyond SHA-256 hash comparison
- [x] HAR export for the network inspector
- [ ] Design and build the `Personal News` experience; the sidebar currently has a placeholder slot, but the actual panel and feed model are not implemented yet
- [x] Built-in video recorder with Application and Region capture modes, tab audio + mic toggle, MP4 output via ffmpeg; replaces AudioCaptureManager
- [ ] Windows video recorder: find a proven system-audio capture path for the current `ffmpeg-static` binary or switch to an approved ffmpeg build strategy; Phase 11 proved DirectShow microphone capture works, but this machine has no DirectShow loopback/system-audio device and the bundled binary has no WASAPI input.
- [ ] Linux video recorder: implement desktop audio capture via PulseAudio/Pipewire monitor sources; current implementation captures mic audio but not webview/tab audio due to Electron process isolation limitations on Linux

### Maintenance Sweep

- [x] Resolve the four urgent security-audit findings: shell XSS escaping + CSP without inline scripts, header-only timing-safe WebSocket auth with failed-attempt lockout (Gatekeeper + `/watch/live`), form-memory key migration into the SecretStore with fail-closed behavior, and fail-closed Gatekeeper timeout fallbacks plus a vault unlock brute-force lockout
- [x] Align public-facing docs, repo metadata, and contribution guidance for a public developer preview
- [x] Reduce the first high-signal GitHub CodeQL security backlog: fix the bearer-token ReDoS, new-tab and OAuth callback XSS paths, URL substring checks in auth/search heuristics, path containment for session/workflow/import/update files, and baseline API rate limiting on the most sensitive flagged routes
- [x] Fix the `Snoze` typo in `docs/research/opera-browser-research.md` and do a quick spell-check in the same tab-snoozing section
- [x] Harden extension update version comparison in `src/extensions/update-checker.ts`; `isNewerVersion()` now handles uneven segment lengths and prerelease suffixes such as `1.2.3-beta`
- [x] Add focused tests for extension version comparison edge cases in `src/extensions/tests/`, including `1.2` vs `1.2.0`, `1.10.0` vs `1.9.9`, and pre-release suffix input

### Codebase Hygiene

- [ ] Cloudflare human-in-the-loop: challenge-sensitive tabs should pause cleanly for the human and resume conservatively after `cf_clearance` (phase 3 already gates ScriptGuard and resource monitoring on Cloudflare tabs). NOTE: this was built on the no-touch reroute, which the **Stealth** section now treats as a temporary fallback pending in-place challenge solving — settle that architecture question first, since it changes where the pause/resume happens (the UX itself carries over either way).
- [x] Make Wingman `openclaw` mode gateway-first for sends, sign a real OpenClaw device identity for the WebSocket handshake, and persist gateway replies into Tandem chat history so stock Tandem no longer depends on a local OpenClaw tandem-chat skill
- [x] Add a built-in Tandem local Wingman chat backend so MCP/API agents can read and reply in the panel without requiring OpenClaw on the host, while keeping the OpenClaw gateway backend available when installed
- [x] Split `src/main.ts` bootstrap and teardown wiring into dedicated `src/bootstrap/` modules so manager composition stops growing in one file
- [x] Extract the largest shell surfaces out of `shell/index.html` and `shell/css/main.css` so sidebar logic, modal helpers, and stylesheet sections stop living in single inline or monolithic files
- [x] Split the Wingman and ClaroNote renderer surfaces out of `shell/js/main.js` into dedicated shell modules with explicit shared state instead of file-scope coupling
- [x] Extract browser tools (`bookmarks`, `history`, `find`, `voice`, `settings`, `screenshot`) out of `shell/js/main.js` into `shell/js/browser-tools.js` with the shared renderer bridge as the explicit integration surface
- [x] Extract tab rendering, navigation, zoom, and shared renderer state out of `shell/js/main.js` into `shell/js/tabs.js`, and keep active-tab coordination explicit through the renderer bridge
- [x] Extract the draw overlay surface out of `shell/js/main.js` into `shell/js/draw.js` so annotation state, screenshot compositing, and draw-mode lifecycles stop sharing a file with window chrome and shortcuts
- [x] Replace the last mixed shell entrypoint with dedicated `shell/js/window-chrome.js` and `shell/js/shortcut-router.js` modules so `main.js` is no longer needed as a catch-all shell loader
- [ ] Investigate strict Gatekeeper fallback blocking mainstream site scripts when the local agent bridge is unavailable; manual startup checks on March 14, 2026 showed GitHub asset scripts being denied under `strict_low_trust_script`. The per-reason fallback policy (timeout vs absent agent) is now explicit and documented in `getGatekeeperFallbackAction()` in `src/security/guardian.ts`; this item remains about tuning `strict_low_trust_script` itself (trusted-CDN coverage / trust accrual)
- [ ] Investigate the remaining 1Password MV3 service-worker startup noise (`DidStartWorkerFail ...: 5` and policy calculation errors) and determine whether it affects any real user-facing behavior; the old `__tandemExtensionHeaders` background error is fixed, and current manual checks indicate the extension still works for normal use
- [ ] Make `ContextBridge` summaries natively actor/workspace-aware so `/context/summary` and other non-MCP consumers stop relying on MCP-side enrichment for ownership context
- [ ] Expand the new handoff system beyond the first Activity-tab inbox with a dedicated handoff history/detail view; task-linked ready/resume/approve/reject actions now flow through a shared task↔handoff coordinator
- [x] Add GitHub Actions verification for `npm run verify` on pushes and pull requests
- [x] Add Windows and macOS startup smoke coverage in GitHub Actions by booting Tandem and polling `http://127.0.0.1:8765/status`
- [x] Promote Windows `Verify (windows-latest)` to a blocking GitHub Actions check; Linux remains best-effort
- [x] Announce Windows 11 x64 as an officially supported platform with unsigned installer and portable GitHub Release assets
- [ ] Remove deprecated voice-transcription and live-mode main-process code after the shell-side cleanup lands (PR #TBD): preload bindings `window.tandem.transcribeAudio` and `window.tandem.onLiveModeChanged`, IPC handlers, HTTP route `POST /live/toggle` on port 8765, audio transcription pipeline, and MCP tools `tandem_live_toggle`, `tandem_live_status`, `tandem_audio_start`, `tandem_audio_stop`, `tandem_audio_status`, `tandem_audio_recordings`. The shell no longer references any of these.
- [ ] Restore image support in Wingman chat by routing image sends through the OpenClaw gateway. The legacy `GET/POST /chat` polling bridge was disabled on 17 March 2026 (commit `ede27d82`) and text sends were migrated to the gateway WebSocket, but the image path was not. Today `IpcChannels.CHAT_SEND_IMAGE` in `src/ipc/handlers.ts` only saves the base64 to `~/.tandem/chat-images/` and fires `PanelManager.fireWebhook()` with a `[image attached]` marker — no bytes or URL travel to OpenClaw. Fix: send images through the same gateway path as text (multimodal payload, or upload via `src/api/routes/media.ts` `media-chat-image` bucket and include the URL in the gateway message). Shell-side, collapse `window.tandem.sendChatImage` into `router.sendMessage(text, { image })`.

## Later

### Distribution and UX

- [ ] Full multi-profile UX on top or the existing `SessionManager` isolation model
- [ ] Windows signing and auto-update production readiness: Windows installer and portable builds are official but currently unsigned; code signing and end-to-end automatic update installation validation remain follow-up work.
- [ ] Production-ready DMG build for macOS with current naming and metadata
- [ ] AppImage build for Linux
- [ ] Documentation site
- [ ] Firefox import

### Stealth

> Stealth exists ONLY to hide that an AI/Electron drives the browser, so sites
> see a normal Chrome used by a real human — which is allowed. It does NOT spoof
> or block hardware fingerprinting: the real, stable fingerprint is fine and
> expected. Do NOT add fingerprint-spoofing features — WebGL/canvas/audio masking,
> colour depth, CPU/RAM, fonts, timing, screen-resolution spoofing, Battery API
> masking, geolocation spoofing, JA3/TLS matching, and the like. That is an
> unwinnable arms race that also makes the fingerprint internally inconsistent
> (real on challenge sites, fake elsewhere). Such patches were removed
> deliberately; keep them out.

- [ ] Solve Cloudflare challenges in-place in `persist:tandem` instead of
      rerouting to the isolated `persist:cf-human-*` no-touch partition. The
      no-touch reroute (`promoteTabToCloudflareNoTouchSession` in `src/main.ts`)
      is kept as a **temporary fallback** until in-place solving is proven,
      tested, and stable. Removing it also fixes the session-isolation problem
      (logged-in CF sites fall back to a fresh partition) and the missing
      cf_clearance sync back to the main session.

## Open Questions

- [x] Define what `Agent Tools Phase 4` should be; `docs/agent-tools/STATUS.md` still marks it as the next implementation target — Resolved: Phases 1-3 cover the needed functionality; marked project as COMPLETED
- [x] Define what `Security Fixes Phase 2` should be; `docs/security-fixes/STATUS.md` still leaves this open — Resolved: Phase 1 covers the needed fixes; marked project as COMPLETED

## Recently Completed

- [x] Agent bootstrap contract: pairing now returns explicit next-read links,
  `/agent/bootstrap` exposes runtime context plus the agent toolbox, and
  `/agent`, `/skill`, and `/agent/manifest` now make the required startup
  sequence clear for newly connected agents.
- [x] Configurable Agent API port settings: users can change the default
  `8765` port, local clients discover the configured loopback endpoint through
  bootstrap files, and remote Tailscale instructions use the configured port.
- [x] Windows support Phase 12: centralized shortcut accelerator and label
  handling, switched Electron menus to `CommandOrControl` accelerator strings,
  preserved macOS shortcut labels, and rendered Windows shortcut labels as
  `Ctrl+...`.
- [x] Windows support Phase 10: moved voice backend selection into the platform
  voice adapter, preserved the macOS Apple Speech path, added Windows
  `whisper.exe` PATH detection for opt-in Whisper transcription, and returns a
  clear Windows status when Whisper is not installed
- [x] Windows support Phase 9: moved native messaging host detection into the
  native-messaging platform adapter, added read-only Windows Chrome registry
  detection for HKCU/HKLM native messaging hosts, kept the filesystem fallback,
  and pinned macOS directory scanning behavior with tests
- [x] Windows support Phase 8: moved Chrome profile path detection into the
  chrome-import platform adapter, added Windows Chrome profile scanning under
  `%LOCALAPPDATA%\Google\Chrome\User Data`, enabled Windows bookmark and
  history import, and documented encrypted cookie import as unsupported without
  DPAPI support
- [x] Windows support Phase 7: moved stealth UA and UA-CH construction into
  the platform adapter, pinned macOS output with snapshots, and added Windows
  Chrome-on-Windows values for source runs
- [x] Windows support Phase 6: moved BrowserWindow chrome options into the
  platform adapter, enabled frameless Windows source runs, and reused the
  shell-owned min/max/close titlebar controls behind a Windows body class
- [x] Windows support Phase 5: added the safeStorage-backed secret store with
  encrypted and plaintext-initialization fallback records, plus Google Photos
  OAuth auth migration while preserving the local `api-token` bootstrap file
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
