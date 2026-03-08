# Changelog

All notable changes to Tandem Browser will be documented in this file.

## [Unreleased] - 2026-03-08

### Changed
- **Verification baseline** (`package.json`, `eslint.config.mjs`, `tsconfig.eslint.json`, `.github/workflows/verify.yml`) — restored ESLint coverage for the test tree, added a single `npm run verify` command, and wired the same verification command into GitHub Actions so compile, lint, and test can run from one entry point locally and in CI
- **Planning source cleanup** (`TODO.md`, `docs/internal/README.md`, `docs/internal/ROADMAP.md`, `docs/internal/STATUS.md`) — made `TODO.md` the single active engineering backlog and downgraded the older internal roadmap/status files into explicit historical snapshots to reduce planning drift
- **Documentation consistency** (`PROJECT.md`, `README.md`, `CONTRIBUTING.md`) — synchronized the current version and replaced machine-local documentation links with repo-relative links that work on GitHub and in local clones
- **Bootstrap composition split** (`src/main.ts`, `src/bootstrap/runtime.ts`, `src/bootstrap/tab-session.ts`, `src/bootstrap/types.ts`) — moved runtime manager composition, teardown logic, and initial-tab/session-restore orchestration out of `main.ts` so the Electron entrypoint is back to being an orchestration layer instead of a monolithic service factory
- **Shell surface split** (`shell/index.html`, `shell/js/sidebar.js`, `shell/js/extensions.js`, `shell/js/modal.js`, `shell/css/main.css`, `shell/css/browser-shell.css`, `shell/css/sidebar.css`, `shell/css/wingman.css`, `shell/css/sidebar-panels.css`) — extracted the sidebar and modal inline scripts into dedicated renderer files, moved extension/about panel logic out of `main.js`, and turned the shell stylesheet into an import-based aggregator with surface-specific partials
- **Wingman and ClaroNote split** (`shell/js/main.js`, `shell/js/wingman.js`, `shell/js/claronote.js`, `shell/index.html`) — moved the Wingman panel, chat, approvals, panel resizing, and ClaroNote renderer logic out of `main.js`, and replaced implicit file-scope coupling with an explicit renderer bridge on `window.__tandemRenderer`
- **Browser tools split** (`shell/js/main.js`, `shell/js/browser-tools.js`, `shell/index.html`) — moved renderer-side bookmarks, history, find-in-page, voice input, settings navigation, and screenshot preview logic out of `main.js`, and kept the integration boundary explicit through `window.__tandemRenderer` instead of hidden file-scope access
- **Tabs and renderer bridge split** (`shell/js/tabs.js`, `shell/js/main.js`, `shell/index.html`, `src/main.ts`) — moved tab creation, focus, navigation, zoom, activity tracking, and the shared renderer bridge out of `main.js` into a dedicated tabs module, and restored the early `tab-register` queue in the Electron main process so the shell can bootstrap safely before runtime managers are ready
- **Draw overlay split** (`shell/js/draw.js`, `shell/js/main.js`, `shell/index.html`) — moved annotation state, scroll tracking, draw-mode lifecycle handling, and screenshot compositing out of `main.js` into a dedicated draw module, leaving the shell entrypoint focused on window chrome and shortcut orchestration
- **Final shell entrypoint split** (`shell/js/window-chrome.js`, `shell/js/shortcut-router.js`, `shell/index.html`) — replaced the last mixed shell entrypoint with dedicated modules for window chrome and shortcut routing, so the renderer shell no longer relies on `shell/js/main.js` as a catch-all loader

### Technical Details
- ESLint now uses a dedicated TypeScript project file so `src/**/tests/**/*.test.ts` no longer fails parser setup just because runtime `tsconfig.json` excludes test files from the build output
- Verification now has one canonical entry point: `npm run verify`
- The shell renderer split now leaves `shell/js/main.js` focused on tabs, drawing, and core orchestration, while `shell/js/browser-tools.js` owns the browser utility surface
- `shell/js/main.js` is now down to the remaining titlebar, keyboard shortcut orchestration, and draw overlay flow, while `shell/js/tabs.js` owns the renderer tab lifecycle and shared state bridge
- The shell entrypoint is now down to window chrome plus shortcut orchestration, with `shell/js/draw.js` owning the draw overlay lifecycle and screenshot composition path
- The shell renderer now loads by surface-specific modules (`tabs`, `browser-tools`, `draw`, `wingman`, `claronote`, `extensions`, `window-chrome`, `shortcut-router`) instead of routing current behavior through a single generic `main.js`

## [v0.45.1] - 2026-03-08

- fix: english consistency cleanup pass 2 (ui-copy)

What was built/changed:
- Modified files: CHANGELOG.md, shell/*.html, shell/js/main.js, shell/js/shortcuts.js, shell/css/main.css, src/api/routes/browser.ts, src/api/routes/sessions.ts, src/api/routes/sidebar.ts, src/api/tests/routes/browser.test.ts, src/bridge/context-bridge.ts, src/config/manager.ts, src/downloads/manager.ts, src/headless/manager.ts, src/mcp/server.ts, src/sidebar/manager.ts, src/watch/watcher.ts
- Translated remaining first-party Dutch UI strings, placeholders, alerts, comments, bookmark manager copy, ClaroNote states, and related test expectations
- Left compatibility-sensitive identifiers and locale/config values unchanged where translation would risk regressions

Why this approach:
- Limits the pass to textual consistency changes and avoids renaming routes, persisted keys, IPC surfaces, CSS/DOM identifiers, or browser-fingerprint settings

Tested:
- npm run compile: passed
- npx vitest run: fails with pre-existing unrelated failures in src/tabs/tests/tabs.test.ts, src/extensions/tests/action-polyfill.test.ts, src/api/tests/routes/agents.test.ts, src/api/tests/routes/browser.test.ts (unrelated GET /links case), and src/api/tests/routes/security.test.ts

## [v0.45.0] - 2026-03-08

- feat: add session fetch relay and security containment design

Add POST /sessions/fetch endpoint for same-origin API calls via tab context,
with auth header safety rails, timeout handling, and full test coverage.
Include security containment review design doc.

- fix: repository-wide English consistency cleanup pass 2

Translate remaining first-party Dutch text outside Markdown in shell UI copy,
placeholders, comments, notifications, and related test expectations. Keep
compatibility-sensitive identifiers, locale codes, and persisted/config
surfaces unchanged where translation would be risky.

## [v0.44.88] - 2026-03-08

### Added
- **Session fetch relay** (`src/api/routes/sessions.ts`) — added `POST /sessions/fetch` so the local API can execute same-origin requests inside the selected tab context, reuse the browser session for authenticated SPA/API calls, and return the response payload without exposing auth headers or tokens
- **Route coverage** (`src/api/tests/routes/sessions.test.ts`, `src/api/tests/helpers.ts`) — added focused tests for successful tab-context fetches, `tabId` selection, JSON body serialization, timeout handling, and the new header/origin safety rails

### Technical Details
- `function registerSessionRoutes()` now validates request method, blocks direct auth/cookie/sec/proxy header injection, resolves relative URLs against the active tab URL, and rejects cross-origin targets before executing page-context `fetch()`
- The relay runs through `webContents.executeJavaScript()` with a 15-second abort timeout, preserves page cookies and any app-level `window.fetch` wrappers already present in the tab, and normalizes JSON responses plus response headers into a stable API envelope
- Verification: `npm run compile` passed; `npx vitest run src/api/tests/routes/sessions.test.ts` passed; `npm start` and manual curl validation were not run in this session

## [v0.44.87] - 2026-03-07

### Changed
- **Curated security feed expansion** (`src/security/blocklists/updater.ts`, `src/security/types.ts`) — expanded the browser-core blocklist manifest with OpenPhish plus high-confidence ThreatFox domain and URL feeds, added explicit source signal/scope metadata, and kept new sources limited to phishing and malware intelligence instead or ad/tracker mega-lists
- **Structured feed filtering** (`src/security/blocklists/updater.ts`) — taught the shared CSV/JSON parser layer to filter records by typed field criteria and to recognize comment-prefixed CSV header rows so mixed IOC exports can stay domain/url-first without feed-specific code paths
- **Phase 4 regression coverage** (`src/security/tests/blocklist-updater.test.ts`) — added focused tests for the expanded source cadence folder and ThreatFox CSV filtering behavior

### Technical Details
- `class BlocklistUpdater` now advertises six runtime blocklist sources through the shared manifest: URLhaus, Phishing Database, OpenPhish, ThreatFox domains, ThreatFox URLs, and the existing StevenBlack legacy carryover source
- ThreatFox entries are constrained to high-confidence domain/url IOCs before they ever reach `NetworkShield`, which keeps the current domain-first lookup model intact and leaves CIDR/range blocking out or scope
- Verification: `npm run compile` passed; `npx vitest run src/security/tests/blocklist-updater.test.ts` passed; full `npx vitest run` still reports unrelated pre-existing failures in `src/tabs/tests/tabs.test.ts` and `src/extensions/tests/action-polyfill.test.ts`; `npm start` plus `curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8765/security/status` succeeded and returned the expanded source set

## [v0.44.85] - 2026-03-07

### Changed
- **Tiered security blocklist scheduler** (`src/security/security-manager.ts`, `src/security/blocklists/updater.ts`, `src/security/security-db.ts`) — replaced the single 24-hour refresh rule with per-source hourly/daily/weekly cadence, persisted freshness and failure metadata per feed, and prevented overlapping scheduled refresh runs
- **Security freshness visibility** (`src/security/routes.ts`, `src/security/db-blocklist.ts`) — exposed per-source blocklist freshness through `/security/status` and `/security/blocklist/stats`, and aligned database `lastUpdate` reporting with persisted refresh metadata instead or the request timestamp
- **Phase 3 regression coverage** (`src/security/tests/blocklist-updater.test.ts`, `src/api/tests/routes/security.test.ts`) — added focused tests for due-source selection, per-source failure isolation, and freshness/status responses

### Technical Details
- `class BlocklistUpdater` now owns source cadence checks, updates only due feeds during scheduled runs, records `lastUpdated` / `lastAttempted` / failure state per source, and reloads `NetworkShield` only after at least one successful source refresh
- `class SecurityManager` now schedules hourly freshness checks while serializing queued refresh runs so stale-source checks cannot overlap into concurrent downloads
- Verification: `npm run compile` passed; `npx vitest run src/security/tests/blocklist-updater.test.ts src/api/tests/routes/security.test.ts` passed; full `npx vitest run` still reports unrelated pre-existing failures in `src/tabs/tests/tabs.test.ts` and `src/extensions/tests/action-polyfill.test.ts`; `npm start` plus `curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8765/security/status` succeeded and returned per-source freshness data

## [v0.44.83] - 2026-03-07

### Changed
- **Security blocklist fast-start hydration** (`src/security/network-shield.ts`, `src/security/security-manager.ts`) — replaced synchronous startup blocklist parsing with a snapshot-first load path, queued background hydration, and atomic in-memory swaps so Tandem becomes usable before cached feeds finish rebuilding
- **Hydration regression coverage** (`src/security/tests/network-shield-hydration.test.ts`) — added focused coverage for snapshot boot, no-clear reload behavior, cached hydrate promotion, and snapshot persistence refresh

### Technical Details
- `class NetworkShield` now boots from `startup-snapshot.json` when available, keeps DB-backed blocklist checks live during hydration, and rebuilds replacement `Set` instances before swapping them into request checks
- Background hydration yields between cached sources, serializes overlapping reload requests, and persists a last-known-good snapshot plus blocklist metadata only after the replacement state is complete
- Verification: `npm run compile` passed; `npx vitest run src/security/tests/` passed; `npm start` reached API/UI readiness before blocklist hydration completed and later logged an atomic hydrate completion with 794198 domains / 1887 IP origins; full `npx vitest run` still reports unrelated pre-existing failures in `src/tabs/tests/tabs.test.ts` and `src/extensions/tests/action-polyfill.test.ts`

## [v0.44.81] - 2026-03-07

### Changed
- **Security blocklist parser foundation** (`src/security/types.ts`, `src/security/blocklists/updater.ts`, `src/security/network-shield.ts`) — replaced hardcoded per-file parser branches with a shared source manifest and parser layer that supports legacy text feeds plus declarative JSON and CSV sources without changing the current security feed set

### Technical Details
- Added typed blocklist parser/source definitions so the updater and `NetworkShield` can use the same parser contract for hosts, domain lists, URL lists, JSON records, and CSV columns
- Moved cached blocklist loading onto the same `BLOCKLIST_SOURCES` manifest used for downloads, including stable cache filenames for the existing URLhaus, phishing, and Steven Black feeds
- Shared URL-list safe-domain filtering and IP-origin extraction across both update-time parsing and runtime in-memory loading to keep request checks aligned ahead or the fast-start snapshot phase
- Verification: `npm run compile` passed; `npm start` plus `curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8765/security/status` succeeded; full `npx vitest run` still reports unrelated pre-existing failures in `src/tabs/tests/tabs.test.ts` and `src/extensions/tests/action-polyfill.test.ts`

## [v0.44.80] - 2026-03-07

### Changed
- **Automatic containment responses** (`src/security/security-manager.ts`, `src/security/guardian.ts`, `src/security/script-guard.ts`, `src/security/behavior-monitor.ts`, `src/main.ts`) — turned critical script and runtime detections into real containment actions that quarantine the affected tab, force strict mode, lower trust, and preserve an incident evidence snapshot for later review
- **Shell-side recovery messaging** (`src/main.ts`) — routed containment incidents through the existing emergency-stop shell path and added a native warning dialog so Robin gets an immediate explanation plus a recovery instruction without exposing any UI inside the page

### Technical Details
- `class Guardian` now supports per-webContents quarantine so contained browsing tabs fail closed on subsequent network activity without widening trust for extension, sidebar, or shell traffic
- `class SecurityManager` now records bounded containment incidents with parsed-script and recent resource evidence, downgrades the affected domain, and exposes the incidents for follow-up review
- `class BehaviorMonitor` can terminate execution for the affected tab when miner-like WASM and CPU behavior trips a critical threshold
- Verification: `npm run compile` passed; full `npx vitest run` still reports unrelated pre-existing failures in `src/tabs/tests/tabs.test.ts` and `src/extensions/tests/action-polyfill.test.ts`

## [v0.44.78] - 2026-03-07

### Changed
- **Extension trust scoping** (`src/extensions/manager.ts`, `src/api/server.ts`, `src/api/routes/extensions.ts`) — added explicit `trusted` / `limited` / `unknown` extension trust levels and route-specific helper scopes so extension-origin callers must present the right permissions for `active-tab`, `webNavigation`, `identity`, and native messaging helpers
- **Native messaging boundary checks** (`src/extensions/native-messaging.ts`, `src/extensions/nm-proxy.ts`, `src/main.ts`) — applied the same trust decision to the native messaging HTTP and WebSocket bridges, validated host manifests against allowed extension IDs plus known runtime/CWS host mappings, and bound bridge audit logs to the calling extension identity
- **Tests** (`src/api/tests/server-auth.test.ts`, `src/extensions/tests/trust.test.ts`, `src/extensions/tests/native-messaging.test.ts`, `src/api/tests/routes/extensions.test.ts`) — added focused coverage for scoped helper auth, bridge identity mismatch rejection, and native messaging host allowlist enforcement

### Technical Details
- Extension-origin helper routes now evaluate a central `ExtensionManager.evaluateApiRouteAccess()` decision instead or relying on a generic "installed extension" allow path
- Tandem records extension helper allow/deny decisions with extension identity, trust level, and route scope in the API/NM proxy logs
- `POST /extensions/identity/auth` now resolves installation status through the same stable extension identity lookup used by the trust model
- Verification: `npm run compile` passed; focused extension/security Vitest coverage passed; `npm start` plus local `curl` checks succeeded; full `npx vitest run` still reports unrelated pre-existing failures in `src/tabs/tests/tabs.test.ts` and `src/extensions/tests/action-polyfill.test.ts`

## [v0.44.76] - 2026-03-07

- fix: isolate tabs per workspace

## [v0.44.75] - 2026-03-07

- fix: restore workspace tab switching

## [v0.44.74] - 2026-03-07

- fix: restore 1password extension helper auth

What was built/changed:
- Modified files: src/api/server.ts, src/extensions/action-polyfill.ts
- Added explicit extension ID propagation for local extension helper routes
- Allowed trusted extension helper auth via origin, referer, or X-Tandem-Extension-Id for installed extensions
- Upgraded existing on-disk 1Password patches so old active-tab/log bridge calls are rewritten on startup

Why this approach:
- Electron does not consistently send Origin for extension background/service-worker fetches to localhost
- 1Password lost its active-tab and frame bridge after API hardening because those helper requests no longer authenticated reliably
- The fix stays scoped to trusted extension helper routes and installed extension IDs

Tested:
- npm run compile: zero errors
- npm start: 1Password helper patch upgrade applied at startup
- Manual: user confirmed autofill flow works again

## [v0.44.73] - 2026-03-07

- fix: remove fs access from sandboxed preload

What was built/changed:
- Modified files: src/preload.ts
- Removed direct fs-based API token reads from the Electron preload
- Kept the preload bridge minimal and Electron-safe under sandbox mode

Why this approach:
- The preload was crashing on startup with 'module not found: fs'
- That removed window.tandem entirely, which broke tabs, sidebar rendering, and internal shell controls
- Local API auth now lives in the main-process session hook and token IPC, not in the preload filesystem path

Tested:
- npm run compile: zero errors
- npm start: preload no longer fails to load, shell starts without the preload fs crash

## [v0.44.72] - 2026-03-07

- fix: normalize shell API auth header override

What was built/changed:
- Modified files: src/main.ts
- Normalized Authorization headers before injecting the shell bearer token for local file:// requests

Why this approach:
- Chromium can carry both authorization and Authorization header keys during request rewriting
- Removing all casing variants before setting the bearer token ensures the shell auth hook actually wins

Tested:
- npm run compile: zero errors
- npm start: shell unauthorized requests for /sidebar/config, /workspaces, and /bookmarks no longer reproduced locally

## [v0.44.71] - 2026-03-07

- fix: restore shell API auth in session layer

What was built/changed:
- Modified files: src/main.ts
- Added a RequestDispatcher header hook for internal shell requests to the local Tandem API
- Kept API hardening intact for non-shell callers

Why this approach:
- Renderer-side token bootstrapping was still fragile across shell pages and internal webviews
- Injecting the bearer token in Electron's request layer fixes shell/index.html and file:// webviews without re-trusting localhost broadly

Tested:
- npm run compile: zero errors

## [v0.44.70] - 2026-03-07

- fix: bootstrap shell auth across internal pages

What was built/changed:
- Modified files: src/main.ts, shell/index.html, shell/newtab.html, shell/settings.html, shell/bookmarks.html
- New file: shell/js/api-auth.js
- Registered the get-api-token IPC handler before the shell window loads so the first authenticated shell requests do not race startup
- Added a shared shell auth bootstrap that wraps local Tandem API fetch calls and retries token acquisition during early startup
- Enabled the same auth bootstrap on shell subpages such as newtab, settings, and bookmarks

Why this approach:
- Internal shell pages were still failing closed because they either ran before the token IPC bridge was ready or were never using the shell auth wrapper at all; this makes the internal caller path explicit and consistent without reopening broad loopback trust

Tested:
- npm run compile: zero errors
- Manual runtime verification still requires restarting the already-running Tandem app

## [v0.44.69] - 2026-03-07

- fix: fetch shell API token via IPC

What was built/changed:
- Modified files: src/ipc/handlers.ts, src/preload.ts, shell/index.html
- Added an IPC handler for reading the local API token from the main process
- Switched the preload getApiToken bridge to use ipcRenderer.invoke instead or relying on preload-side file access
- Updated the shell bootstrap fetch wrapper to lazily await and cache the token before authenticating local Tandem API requests

Why this approach:
- The shell page still emitted unauthenticated requests because token retrieval in the sandboxed renderer path was not reliable; fetching the token from the main process makes the page-world auth wrapper deterministic

Tested:
- npm run compile: zero errors
- Manual runtime still requires restarting the already-running Tandem app to load the new preload and shell bootstrap

## [v0.44.68] - 2026-03-07

- fix: restore shell and extension API auth

What was built/changed:
- Modified files: shell/index.html, src/preload.ts, src/api/server.ts
- Added a shell bootstrap that patches page-world fetch for local Tandem API calls using the preload-exposed bearer token
- Exposed getApiToken() from preload so shell scripts can recover the local API token consistently
- Broadened trusted extension ID matching so runtime IDs and on-disk extension IDs both satisfy the Phase 1 extension auth checks

Why this approach:
- The earlier preload-only fetch patch ran in the isolated preload world, but the shell page was still issuing unauthenticated requests from the page world; this fix authenticates the actual caller while preserving the hardened API boundary

Tested:
- npm run compile: zero errors
- Manual runtime verification still requires restarting the already-running Tandem app to load the updated preload and shell bootstrap

## [v0.44.67] - 2026-03-07

- fix: restore shell auth for local API calls

What was built/changed:
- Modified files: src/preload.ts
- Exposed the local API token to the shell and wrapped shell-side fetch so requests to the Tandem API automatically include Authorization: Bearer unless an explicit auth header is already present

Why this approach:
- Keeps the Phase 1 API hardening intact while restoring authenticated shell access for sidebar, chat polling, and other local UI calls that were previously relying on implicit loopback trust

Tested:
- npm run compile: zero errors
- Manual runtime still requires restarting the already-running Tandem app so the updated preload script is loaded

## [v0.44.66] - 2026-03-07

- fix: strengthen outbound containment policy (security-hardening)

What was built/changed:
- Modified files: src/security/guardian.ts, src/security/outbound-guard.ts, src/security/types.ts, src/security/tests/gatekeeper-enforcement.test.ts, src/security/tests/outbound-containment.test.ts, package.json, CHANGELOG.md
- Added richer outbound decision metadata so Guardian logs explain why mutating requests and WebSocket upgrades were allowed, flagged, held, or blocked
- Tightened mode-sensitive containment for unknown WebSocket endpoints, first-visit mutating destinations, and trusted-to-untrusted cross-origin transitions, while exempting same-site cross-subdomain traffic to keep balanced mode usable
- Added focused tests for the new outbound containment policies and Guardian enforcement path

Why this approach:
- Keeps Phase 4 scoped to the outbound decision layer while using the existing Gatekeeper hold/block path for higher-risk cases instead or inventing a separate enforcement mechanism

Tested:
- npm run compile: zero errors
- npx vitest run src/security/tests/outbound-containment.test.ts src/security/tests/gatekeeper-enforcement.test.ts: all 11 tests pass
- npx vitest run: still fails on unrelated pre-existing suites in src/extensions/tests/action-polyfill.test.ts and src/tabs/tests/tabs.test.ts
- Manual: npm start succeeded, initialized the security stack and API on 127.0.0.1:8765, and curl http://127.0.0.1:8765/status returned ready state

## [v0.44.65] - 2026-03-07

- fix: expand per-tab runtime security coverage (security-hardening)

What was built/changed:
- Modified files: src/devtools/manager.ts, src/ipc/handlers.ts, src/main.ts, src/security/behavior-monitor.ts, src/security/script-guard.ts, src/security/security-manager.ts, package.json, CHANGELOG.md
- Added multi-tab CDP attachment state in DevToolsManager so security code can target specific webContents without stealing the primary active-tab session
- Moved ScriptGuard and BehaviorMonitor runtime state to per-tab maps and added explicit tab created/navigated/closed lifecycle handling in SecurityManager and main process wiring

Why this approach:
- Expands security coverage to live background/restored tabs while preserving the existing active-tab CDP APIs used by the rest or the browser

Tested:
- npm run compile: zero errors
- npx vitest run: fails on pre-existing unrelated suites in src/extensions/tests/action-polyfill.test.ts and src/tabs/tests/tabs.test.ts
- Manual: npm start succeeded and initialized the security stack plus API on 127.0.0.1:8765

## [v0.44.63] - 2026-03-07

- fix: enforce gatekeeper decisions for risky requests (security-hardening)

What was built/changed:
- Modified files: src/network/dispatcher.ts, src/security/guardian.ts, src/security/gatekeeper-ws.ts, src/security/types.ts, src/security/tests/gatekeeper-enforcement.test.ts
- Gatekeeper enforcement: async `onBeforeRequest` support in `RequestDispatcher`, explicit Gatekeeper decision classes, request holds for risky first-visit navigations, deny-on-timeout handling for strict low-trust scripts and suspicious downloads, and explicit fallback behavior when Gatekeeper is disconnected or saturated
- Logging/tests: Gatekeeper queue and resolution logs now record hold/allow/block/timeout states, and focused tests cover async request holds plus timeout policy behavior

Why this approach:
- Keeps balanced browsing usable by limiting request holds to selected risky cases while making stricter paths fail closed instead or silently defaulting to allow

Tested:
- npm run compile: zero errors
- npx vitest run src/security/tests/gatekeeper-enforcement.test.ts: all 4 tests pass
- npx vitest run: still fails on unrelated pre-existing suites in src/extensions/tests/action-polyfill.test.ts and src/tabs/tests/tabs.test.ts
- Manual: npm run dev started successfully, initialized the security stack and API on 127.0.0.1:8765
- Curl: GET /status returned ready state from the running app

## [v0.44.62] - 2026-03-07

- fix: tighten local API auth boundary (security-hardening)

What was built/changed:
- Modified files: src/api/server.ts, src/api/routes/extensions.ts, src/extensions/nm-proxy.ts, src/main.ts, package.json, CHANGELOG.md, docs/implementations/security-hardening/LEES-MIJ-EERST.md
- New API behavior: bearer auth required for normal HTTP routes, explicit trusted-extension allowlist for extension helper routes, query-string token auth removed, native-messaging WS upgrade now validates installed extension origins

Why this approach:
- Replaces blanket loopback trust with an explicit caller model while keeping only the minimum extension-specific bridges outside bearer auth

Tested:
- npm run compile: zero errors
- npx vitest run: fails on pre-existing unrelated suites in src/extensions/tests/action-polyfill.test.ts and src/tabs/tests/tabs.test.ts
- Manual: npm run dev attempted, but a user-run Tandem process already held 127.0.0.1:8765
- Curl: isolated TandemAPI on 127.0.0.1:8876 returned 401 for unauthenticated /tabs/list, 200 with bearer token, 401 for query-token auth, and 401 for /extensions/active-tab without a trusted extension origin

## [v0.44.60] - 2026-03-07

- docs(workflow): add reusable multi-phase execution templates

Added generic templates for self-tracking multi-phase implementation tracks and
for universal session prompts, so the same workflow used for security hardening
can be reused for future larger feature or hardening efforts.

Updated `AGENTS.md` to explicitly point maintainers and coding sessions to this
template pattern whenever work spans multiple sessions.

## [v0.44.59] - 2026-03-07

- docs(security): add self-tracking phase log and universal session prompt

Updated the security hardening handoff guide so each future session can detect
the next unfinished phase automatically, record its own completion state, and
leave a structured handoff for the next session.

Also added a reusable universal session prompt document for the security
hardening track so new sessions can be started with the same scoped workflow
without manually naming the phase each time.

## [v0.44.58] - 2026-03-07

- docs(security): add phased security hardening roadmap

Added a dedicated security hardening planning track with one master design
document plus six implementation phase documents covering API auth, Gatekeeper
enforcement, per-tab monitoring, outbound containment, extension trust, and
automatic containment actions.

The goal or the new docs set is to let future sessions execute the security work
in bounded steps without relying on chat context or losing sight or the overall
hardening objective.

## [v0.44.57] - 2026-03-07

- docs(repo): translate AGENTS guide to English

Translated the internal `AGENTS.md` workflow guide into English while keeping
the same project rules, anti-detection constraints, development workflow, and
reporting expectations. This keeps the maintainer instructions consistent with
the rest or the repository-facing documentation cleanup.

## [v0.44.56] - 2026-03-07

- docs(repo): clarify OpenClaw positioning and classify maintainer workflow docs

Updated the top-level project docs to position Tandem more clearly as the
browser environment built for OpenClaw, while keeping Wingman as the user-facing
name for the right-side collaboration panel and documenting Kees as the default
OpenClaw persona.

Cleaned up several `docs/` entry points so contributor workflow files such as
`CLAUDE.md` and historical `LEES-MIJ-EERST.md` packs are clearly treated as
maintainer artifacts rather than the primary public documentation surface. Also
modernized electron-builder output naming with an explicit
`tandem-browser-${version}-${arch}.${ext}` artifact pattern and macOS package
targets.

## [v0.44.55] - 2026-03-07

- docs(repo): add GitHub community files and separate internal planning docs

Added GitHub issue templates and `CODEOWNERS`, introduced `docs/README.md` plus
`docs/internal/README.md`, and moved the top-level roadmap/status planning files
under `docs/internal/` to keep the public docs surface cleaner.

Updated the README with a clearer UI summary including the left sidebar
capabilities, removed personal contact data from package metadata and setup
scripts, and revised the security reporting doc away from direct personal email.

## [v0.44.54] - 2026-03-07

- docs(repo): add public-facing repo docs and improve release metadata

Rewrote the README around public-facing positioning and onboarding, added
standard top-level `LICENSE`, `CONTRIBUTING.md`, and `SECURITY.md` files, and
marked the remaining root internal workflow documents as internal-only.

Updated `package.json` metadata with repository, homepage, issue tracker,
keywords, and platform build categories so the repo and release configuration
look more complete ahead or a future public release.

## [v0.44.53] - 2026-03-07

- chore(repo): remove local artifacts and stale release metadata

Removed tracked local Playwright console logs, ad-hoc root-level scratch test
files, and an unused screenshot asset from the repository root so the workspace
is cleaner for future public release preparation.

Updated top-level documentation to stop hardcoding stale version numbers and
aligned release-facing references to point at `package.json` and `CHANGELOG.md`
instead. Also refreshed the architecture overview in `PROJECT.md` to reference
Electron 40.

## [v0.44.52] - 2026-03-07

- fix(extensions): add storage.session + notification state shims for 1Password

Extended the 1Password action polyfill with a `chrome.storage.session` shim in
the service worker, including `get`, `set`, `remove`, `clear`, and
`storage.onChanged` support. This gives the extension an ephemeral runtime store
for policy calculation and other short-lived state that Electron does not expose
reliably in this context.

Upgraded the notification stub from a pure no-op to an in-memory implementation
that tracks created notifications and allows `update()` / `clear()` calls to
succeed. This removes a class or `replaceNotification: messenger-error` failures
when 1Password updates passkey and inline notification state.

## [v0.44.51] - 2026-03-07

- fix(extensions): retry 1Password USO tab messages without frame targeting

Adjusted `/extensions/web-navigation/frames` so the top-level frame is exposed as
Chrome-style `frameId: 0` instead or Electron's raw routing id. This makes the
frame tree look like a normal Chrome tab to extensions that reason about the
main frame separately from subframes.

Updated the extension action polyfill to intercept `chrome.tabs.sendMessage()`
and strip unsupported `documentId` targeting. For 1Password's `uso-*` messages,
the polyfill now retries once without `frameId` / `documentId` when Electron
rejects the targeted delivery, so inline autofill UI can still talk to the
top-frame content script on normal login forms.

## [v0.44.50] - 2026-03-07

- fix(extensions): bridge webNavigation frame data for 1Password autofill

Added `/extensions/web-navigation/frames` and `/extensions/web-navigation/frame`
so extension service workers can query the real frame tree or the active webview
via Electron `WebFrameMain` data instead or getting an empty `webNavigation`
stub.

Updated the 1Password action polyfill to route `chrome.webNavigation.getAllFrames()`
and `getFrame()` through those endpoints, which should let the extension detect
sign-in frames and target the correct input fields for autofill.

## [v0.44.49] - 2026-03-07

- chore(about): simplify About page — remove Dutch quote and Wingman subtitle, update tagline to "Built for your AI. Security included.", remove team credits line

## [v0.44.48] - 2026-03-06

- fix(extensions): add 1password7 NM host + migrate to session.extensions.loadExtension

Added `com.1password.1password7` as a supported alias for the existing
1Password native messaging host so the NM proxy now resolves both host
names to the same native helper binary and no longer treats the `...7`
variant as missing.

Migrated extension loading from deprecated `session.loadExtension()` to
`session.extensions.loadExtension()` in the extension loader and session
loading paths, and updated the related inline documentation to match the
Electron 40 API.

## [v0.44.47] - 2026-03-06

- fix(lifecycle): teardown managers and IPC listeners on window close

Added a central teardown path in `src/main.ts` that destroys all live
managers, stops the API, clears the cookie flush interval, removes the
`tab-register` IPC listener, and resets retained startup state when the
main window closes or the app reactivates on macOS.

`src/ipc/handlers.ts` now removes every IPC channel and handler it
re-registers, including window controls and `is-window-maximized`, so
reactivation no longer stacks stale handlers bound to destroyed windows.

Guarded renderer sends for TaskManager event forwarding in `src/main.ts`
and all renderer sends in `src/voice/recognition.ts`, preventing
`Object has been destroyed` crashes during shutdown and reactivation.

## [v0.44.46] - 2026-03-06

- feat(tabs): shrink tabs dynamically when many are open, like Chrome

Tab items now use `flex: 1` with `min-width: 28px` (was fixed 120px),
so the tab strip compresses automatically as more tabs are added.
Tab titles truncate with ellipsis at narrow widths; the favicon remains
visible at all sizes.

## [v0.44.45] - 2026-03-06

- fix(stability): guard win.webContents calls with isDestroyed() checks

All `win.webContents.send()` calls in `panel/manager.ts` are now guarded
with `isDestroyed()` checks, preventing 'TypeError: Object has been
destroyed' crashes when the panel window closes while IPC events are
still firing. Added early isDestroyed() check in `tabs/manager.ts`
`openTab()`. Also fixed `POST /execute-js` to respect the `tabId`
parameter instead or always targeting the active webcontents.

## [v0.44.44] - 2026-03-06

- fix(autofill): patch Kfj() and zj.getShortcuts() via action-polyfill

Two 1Password autofill errors eliminated:
- `Kfj()` called `browser.windows.getCurrent()` which is undefined in
  Electron's Service Worker context, causing `getItemDetails()` to throw.
  Patched to always return `false` (Tandem never opens 1Password in a
  detached popup window).
- `zj.getShortcuts()` called `browser.commands.getAll()` which throws when
  `browser.commands` is undefined in Electron. Guarded with early return
  `{browserAction:"",lock:""}` when `browser.commands` is absent.
Both patches are now applied via the `action-polyfill.ts` patch pipeline
(not by direct edits to background.js) so they survive extension reloads.

## [v0.44.4] - 2026-03-04

- fix: correct newtab.html path in ipc handlers

handlers.js compiles to dist/ipc/, so __dirname is dist/ipc/.
The previous path.join(__dirname, '..', 'shell', 'newtab.html')
resolved to dist/shell/newtab.html which does not exist.

Adding an extra '..' resolves to the correct shell/newtab.html
at the project root, matching the path calculation used in main.ts.

## [v0.44.3] - 2026-03-04

- fix: prevent zombie tabs from renderer/main-process state drift

Root cause: when openTab() fails after createTab() has already added the
webview and tabEl to the renderer's DOM and tabs Folder, the main process
never registers the tab. Subsequent closeTab() calls return early (tab
not in main-process Folder), leaving an uncloseable orphan in the tab strip.

A secondary cause: if the removeTab() IPC call throws during a normal
closeTab(), the main-process tab entry was never deleted, leaving the tab
stuck open from the main-process side.

Changes:
- shell/js/main.js: add 15s timeout to createTab() dom-ready Promise;
  on timeout, clean up webview/tabEl/tabs Folder entry before rejecting.
  Expose getTabIds() and cleanupOrphan() on window.__tandemTabs for
  reconciliation from the main process.
- src/tabs/manager.ts: catch createTab() failures in openTab() and call
  cleanupOrphan() in the renderer before rethrowing, preventing partial
  renderer state from persisting.
  Make removeTab() IPC call in closeTab() best-effort: log the error but
  always delete from this.tabs so the tab cannot become permanently
  uncloseable due to a renderer IPC failure.
  Add reconcileWithRenderer(): queries renderer tab IDs, removes any
  orphans (renderer knows tab, main process does not) via cleanupOrphan().
- src/ipc/handlers.ts: in tab-close IPC handler, only emit tab-closed
  events when the tab was actually tracked. If closeTab() returns false,
  run reconcileWithRenderer() to clean up any renderer orphan.
- src/api/routes/tabs.ts: add POST /tabs/reconcile endpoint for on-demand
  reconciliation via the API.
- src/main.ts: after restoreSessionTabs() completes, run
  reconcileWithRenderer() to remove any orphans left by failed restores.

Tests: 36 new test cases covering openTab() cleanup on failure,
closeTab() robustness against IPC errors, and reconcileWithRenderer()
behaviour (orphan removal, sync state, getTabIds() failure handling).
All 947 tests pass.

## [v0.44.2] - 2026-03-02

- fix: ACTUALLY use sidebar panel for About (was still using BrowserWindow!)

The hamburger menu was still creating a BrowserWindow for About
instead or opening the sidebar panel. Now it properly sends
'show-about' event which triggers renderAboutPanel().

THIS time it's really fixed. Sorry for the confusion!

## [v0.44.1] - 2026-03-02

- fix: About only via hamburger menu, no sidebar icon

Changes:
- Removed 'about' from sidebar config (no icon shown)
- Hamburger menu → About Tandem Browser now calls renderAboutPanel() directly
- Opens sidebar panel with frosted glass effect
- No separate icon in sidebar needed

About is now ONLY accessible via ☰ → Tandem → About Tandem Browser

## [v0.44.0] - 2026-03-02

- feat: About as SIDEBAR PANEL with real frosted glass!

Finally! About now opens in the sidebar panel like
Bookmarks/History/etc instead or as center overlay.

Changes:
- Added 'about' item to sidebar config (order 19)
- Added info-circle icon for About
- renderAboutPanel() function renders content in sidebar-panel-content
- activateItem('about') triggers panel open
- Same frosted glass effect as ALL sidebar panels
- Removed center overlay code completely

Now backdrop-filter WORKS because About is part or main window!

## [v0.43.1] - 2026-03-02

- fix: use EXACT onboarding overlay pattern for About

Copied exact structure from onboarding overlay instead or
inventing my own:

- .about-overlay with .visible class toggle
- background: var(--surface) with backdrop-filter: blur(20px)
- Same CSS variables and styling
- Click outside to close

Now matches existing overlay pattern in codebase!

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
instead or 1 when clicking About links

## [v0.41.8] - 2026-03-02

- fix: remove duplicate onOpenUrlInNewTab handler

TypeScript error: object literal cannot have multiple properties
with the same name

## [v0.41.7] - 2026-03-02

- fix: About window links open in new Tandem tab

Instead or opening in system browser (Chrome), links from the
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

- fix: use _win instead or win in window control handlers

TypeScript error: variable is destructured as 'win: _win'

## [v0.41.1] - 2026-03-02

- fix: pinboard sync not loading on fresh device

When no local boards.json exists, load() creates an empty store with
lastModified set to now. mergeFromSync() then skips the shared file
because sharedTime < localTime (shared was written in the past).

Fix: if local has zero boards, always prefer the shared version
regardless or timestamp. This ensures new devices pick up existing
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

- fix: show full text in quote/text pin cards, auto-height instead or clipping

## [v0.35.0] - 2026-03-01

- feat: realtime pinboard refresh via IPC after pin added from any context menu

## [v0.34.0] - 2026-03-01

- feat: OG metadata auto-fetch for thumbnails + masonry card layout fix (v0.33.1)

## [v0.33.0] - 2026-03-01

- feat: add 'Add to Pinboard' to tab context menu with board submenu + pin-flash animation

## [v0.32.1] - 2026-03-01

- fix: pinboards use showPrompt() instead or prompt(), add auth headers to all fetches

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

- feat: sidebar setup panel with per-item toggles

## [v0.17.2] - 2026-02-28

- fix: sidebar icon sizing — smaller icons, more breathing room

## [v0.17.1] - 2026-02-28

- fix: sidebar polish + lamp icon + config migration

## [v0.17.0] - 2026-02-28

- feat: sidebar 3-section layout + Google Calendar + Gmail

Aangepaste files:
- shell/index.html: ocSidebar updated
  - ICONS uitgebreid with Google Calendar (blauw) and Gmail (rood)
  - WEBVIEW_URLS folder added for alle webview items
  - render() shows nu 3 sections: Workspaces / Communicatie / Utilities
  - Separators between the 3 sections
  - calendar + gmail krijgen brand-icon stijl (zoals messengers)
- src/sidebar/manager.ts: DEFAULT_CONFIG has 14 items in 3 sections

Getest:
- npx tsc: zero errors
- npm start: 3 sections visible with separators
- npx vitest run: alle tests slagen

## [v0.16.1] - 2026-02-28

- feat: sidebar 3-section layout + Google Calendar + Gmail

Aangepaste files:
- shell/index.html: ocSidebar updated
  - ICONS uitgebreid with Google Calendar (blauw) and Gmail (rood)
  - WEBVIEW_URLS folder added for alle webview items
  - render() shows nu 3 sections: Workspaces / Communicatie / Utilities
  - Separators between the 3 sections
  - calendar + gmail krijgen brand-icon stijl (zoals messengers)
- src/sidebar/manager.ts: DEFAULT_CONFIG has 14 items in 3 sections

Getest:
- npx tsc: zero errors
- npm start: 3 sections visible with separators
- npx vitest run: alle tests slagen (pre-existing supertest failures ongewijzigd)

## [v0.16.0] - 2026-02-28

- feat: sidebar shell UI — icon strip, panel, narrow/wide/hidden, brand icons, Cmd+Shift+B

New files: no
Aangepaste files:
- shell/index.html: sidebar HTML added if first kind or .main-layout
  - .sidebar container with .sidebar-strip (icon strip) and .sidebar-panel
  - ocSidebar JS object: render, activateItem, toggleState, toggleVisibility, init
  - Keyboard shortcut Cmd+Shift+B toggle hidden/narrow
- shell/css/main.css: sidebar CSS added
  - 3 standen: hidden (0px) / narrow (48px) / wide (180px)
  - Utility icons: outline Heroicons grijs
  - Messenger icons: colored brand SVG op colored ronde achtergrond
  - Active indicator: colored rounded square achter actief icon
  - Separator lijn between utility and messenger blok

Getest:
- npx tsc: zero errors
- npm start: sidebar visible, panel opens/closes, shortcuts werken
- npx vitest run: alle tests slagen

## [v0.15.3] - 2026-02-28

- fix: sidebar config uses individuele messenger items + commit default

New files: no
Aangepaste files:
- src/sidebar/manager.ts: DEFAULT_CONFIG updated or 7 items (with 1 'messengers' group)
  to 12 items (6 utility + 6 individuele messengers: whatsapp/telegram/discord/slack/instagram/x)
- git-hooks/post-commit: emoji-stripping added zodat emoji-prefixed commits
  (bijv '🗂️ feat:') correct if 'feat:' herkend be door auto-versioning
- CHANGELOG.md: v0.15.2 entry uitgebreid with full details (files, endpoints, architectuur)
- AGENTS.md: commit message default added with format, types, versie-rules and CHANGELOG format
- package.json: versie gecorrigeerd to 0.15.2 (was blijven stand op 0.15.1 door emoji-bug in hook)

Getest:
- npx tsc: zero errors
- Manager geeft nu 12 items terug via GET /sidebar/config

## [v0.15.2] - 2026-02-28

### Added
- **Sidebar Infrastructuur** (`src/sidebar/`) — foundation for alle sidebar features
  - `src/sidebar/types.ts` — SidebarState ('hidden'|'narrow'|'wide'), SidebarItem, SidebarConfig types
  - `src/sidebar/manager.ts` — SidebarManager class with load/save/getConfig/updateConfig/toggleItem/reorderItems/setState/setActiveItem
  - `src/api/routes/sidebar.ts` — 6 REST endpoints:
    - `GET  /sidebar/config` — full config ophalen
    - `POST /sidebar/config` — config update (state, activeItemId)
    - `POST /sidebar/items/:id/toggle` — item enable/disable
    - `POST /sidebar/items/:id/activate` — panel openen or sluiten
    - `POST /sidebar/reorder` — drag-to-reorder (orderedIds array)
    - `POST /sidebar/state` — sidebar state change (hidden/narrow/wide)
  - 12 default sidebar items: workspaces, personal news, pinboards, bookmarks, history, downloads + whatsapp, telegram, discord, slack, instagram, x
  - Config persistent in `~/.tandem/sidebar-config.json`

### Gewijzigd
- `src/registry.ts` — `sidebarManager: SidebarManager` added about ManagerRegistry interface
- `src/main.ts` — SidebarManager instantiatie in `startAPI()` + cleanup in `app.on('will-quit')`
- `src/api/server.ts` — `registerSidebarRoutes(router, ctx)` added
- `src/api/tests/helpers.ts` — test helper updated for new manager
- `git-hooks/post-commit` — emoji-prefix stripping zodat `🗂️ feat:` correct if `feat:` herkend is

### Architecture
- Elke messenger (WhatsApp/Telegram/Discord/Slack/Instagram/X) gets own slot in sidebar — not grouped
- Twee visual stijlen in UI (phase 2): outline Heroicons for utility, brand colored SVGs for messengers
- Active indicator: colored rounded square achter actief icon (Opera-stijl)

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
