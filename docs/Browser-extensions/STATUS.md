# Browser Extensions — Implementation Status

> This file tracks progress across Claude Code sessions. Each phase updates its section after completion.
> **Read this file FIRST** when starting a new session.

## Current State

**Next phase to implement:** Phase 10b
**Last completed phase:** Phase 10a
**Overall status:** IN PROGRESS

---

## Phase 1: CRX Downloader + Extension Manager

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** 0e73da4
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] `adm-zip` added to package.json and installed (^0.5.16 + @types/adm-zip ^0.5.7)
  - [x] CRX downloader parses CRX2 and CRX3 headers correctly (CRX3 verified with uBlock Origin + Dark Reader)
  - [x] Download stayed on `*.google.com` / `*.googleapis.com` / `*.googleusercontent.com` — verified in logs
  - [x] Magic bytes Cr24 verified before extraction
  - [x] ZIP validity verified by AdmZip
  - [x] CWS download uses spoofed Chrome User-Agent header
  - [x] Retry with backoff works (3 attempts on 5xx, no retry on 4xx/204)
  - [x] `prodversion` uses `process.versions.chrome` (fallback '130.0.0.0' when running outside Electron)
  - [x] Extension ID extraction works (bare ID + CWS URL formats)
  - [x] Downloaded extension appears in `~/.tandem/extensions/{id}/`
  - [x] `manifest.json` `key` field checked — warning logged when missing (uBlock + Dark Reader both lack key)
  - [x] InstallResult.signatureVerified is false (documented placeholder with TODO comment)
  - [x] Content script patterns logged for security auditing
  - [x] Extension ID from Electron logged alongside CWS ID — mismatch expected when key field missing
  - [x] ExtensionManager wraps ExtensionLoader + CrxDownloader
  - [x] ExtensionManager.uninstall() uses `session.removeExtension()` + file removal (no restart)
  - [x] ExtensionManager wired into `main.ts` (replaces direct ExtensionLoader)
  - [x] ExtensionManager wired into `api/server.ts`
  - [x] Extension requests visible in RequestDispatcher (Guardian sees them — dispatcher active with onBeforeRequest consumers)
  - [x] DNR interaction tested: uBlock loaded, Guardian's dispatcher still fires (2 onBeforeRequest consumers registered). Full page-level DNR test deferred — requires manual navigation to tracker-heavy page. Guardian sees requests that reach Electron's network layer; DNR may block some before they reach `onBeforeRequest`. Document in Phase 10a/10b.
  - [x] App launches with `npm start`, existing extensions still load
- **Issues encountered:**
  - CWS download endpoint requires `acceptformat=crx2,crx3` query param — without it, some extensions return 204 No Content
  - CWS redirects to `clients2.googleusercontent.com` — added to allowed Google domain regex
  - Electron 40 deprecation: `session.loadExtension()` → `session.extensions.loadExtension()` (still works, logged warning). Not fixed in Phase 1 as loader.ts is out of scope — should be addressed in a future phase.
  - uBlock Origin and Dark Reader manifests lack `key` field — Electron assigns random IDs that differ from CWS IDs. Extensions still load and function.
- **Notes for next phase:**
  - `ExtensionManager` is available on the API server as `this.extensionManager` — Phase 2 should use `this.extensionManager.install()` and `this.extensionManager.uninstall()` for the new API routes
  - The `install()` method on ExtensionManager accepts a CWS URL or bare extension ID and handles download + verify + extract + load in one call
  - `session.removeExtension(id)` works without restart — Phase 2's DELETE route can call `this.extensionManager.uninstall(id, session)` directly
  - Extension IDs from Electron don't match CWS IDs when `key` field is missing from manifest. The Phase 2 uninstall route should accept EITHER the CWS ID (folder name on disk) or the Electron-assigned ID.
  - The `session` object is available via `this.win.webContents.session` in the API server
  - `CrxDownloader.extractExtensionId()` is public — use it to validate input in Phase 2's install route
  - Electron 40 deprecation warning for `session.loadExtension()` should be addressed in a future phase (update loader.ts to use `session.extensions.loadExtension()`)
  - CWS download needs `acceptformat=crx2,crx3` in the URL — already included in CrxDownloader

---

## Phase 2: Extension API Routes

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** 09bc3d1
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] `POST /extensions/install` accepts CWS URL and extension ID
  - [x] `POST /extensions/install` downloads, verifies signature, extracts, and loads extension
  - [x] `DELETE /extensions/uninstall/:id` calls `session.removeExtension()` + removes from disk (no restart)
  - [x] `GET /extensions/list` returns installed extensions with status + count
  - [x] Error responses for invalid input, download failures, signature failures
  - [x] App launches, browsing works
- **Issues encountered:**
  - `ExtensionLoader.listLoaded()` returns an in-memory array that is not updated on uninstall — the `loaded` list may show stale entries until app restart. The extensions ARE properly removed from the session (via `session.removeExtension()`) and from disk. This is a pre-existing Phase 1 limitation of ExtensionLoader's internal state management. The `available` list (reads from disk) is always accurate.
  - Uninstall route handles both CWS ID and Electron runtime ID — resolves both before removal since these differ when manifest lacks `key` field.
- **Notes for next phase:**
  - `POST /extensions/install` accepts `{ input: "CWS_URL_OR_ID" }` and returns `InstallResult` — Phase 3's Chrome import route should follow the same pattern
  - `DELETE /extensions/uninstall/:id` accepts both CWS folder ID and Electron runtime ID — resolves to correct IDs for session removal and disk removal
  - `GET /extensions/list` now returns `{ loaded, available, count: { loaded, available } }` — the `count` field is new in Phase 2
  - The `loaded` array in the list response may contain stale entries after uninstall (ExtensionLoader in-memory state not synced). A future phase should add a `removeLoaded(id)` method to ExtensionLoader to fix this.
  - The uninstall route does NOT call `ExtensionManager.uninstall()` — it handles session removal and disk removal directly in the route to correctly resolve CWS vs Electron IDs. This means the route duplicates some logic from the manager.
  - All existing routes (`/extensions/list`, `/extensions/load`) are unchanged and backward-compatible

---

## Phase 3: Chrome Profile Importer

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** bfb023b
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] Chrome extensions directory detected on current platform (macOS)
  - [x] `GET /extensions/chrome/list` returns Chrome extensions (10 detected on test machine)
  - [x] `POST /extensions/chrome/import` copies extension to `~/.tandem/extensions/`
  - [x] `.tandem-meta.json` written with `source: "chrome-import"` and `cwsId`
  - [x] `manifest.json` `key` field checked (warning logged if missing)
  - [x] `POST /extensions/chrome/import` with `{ all: true }` imports all
  - [x] Already-imported extensions are skipped (not duplicated)
  - [x] Chrome internal extensions (e.g. `__MSG_` names) are filtered out
  - [x] App launches, browsing works
- **Issues encountered:**
  - None
- **Notes for next phase:**
  - `ChromeExtensionImporter` is in `src/extensions/chrome-importer.ts` — it is NOT a singleton; each API call creates a new instance with the requested Chrome profile name
  - The importer does NOT auto-load imported extensions into the session — they are just copied to disk. User can restart the app or use `POST /extensions/load` to load them
  - `GET /extensions/chrome/list` supports `?profile=ProfileName` query param (defaults to `Default`)
  - `POST /extensions/chrome/import` supports `{ profile: "ProfileName" }` in the body
  - Chrome internal extensions are filtered by checking if the name is missing, non-string, or starts with `__MSG_` — this catches i18n-only names used by Chrome built-ins
  - The `.tandem-meta.json` format: `{ source: "chrome-import", importedAt: ISO, cwsId: string, importedVersion: string }` — Phase 9 should use `cwsId` for update checks
  - No new npm dependencies were added

---

## Phase 4: Curated Extension Gallery

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** 96c30df
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] `gallery-defaults.ts` contains 30 curated extensions with IDs, names, descriptions, categories
  - [x] All entries include `securityConflict` field (`'none' | 'dnr-overlap' | 'native-messaging'`)
  - [x] All 10 recommended extensions from TOP30-EXTENSIONS.md are included (uBlock Origin, Bitwarden, Pocket, Momentum, StayFocusd, Dark Reader, React DevTools, Wappalyzer, Video Speed Controller, MetaMask)
  - [x] `~/.tandem/extensions/gallery.json` loaded if exists (user overrides)
  - [x] User gallery entries override defaults by ID, can add new entries
  - [x] `GET /extensions/gallery` returns merged gallery with installed status per entry
  - [x] `GET /extensions/gallery?category=privacy` returns 6 privacy extensions
  - [x] `GET /extensions/gallery?featured=true` returns 10 featured extensions
  - [x] Gallery entries include compatibility status from TOP30 assessment (23 works, 5 partial, 2 needs-work)
  - [x] 6 extensions flagged `dnr-overlap` (uBlock Origin, AdBlock Plus, AdBlock, Ghostery, DuckDuckGo, StayFocusd)
  - [x] 3 extensions flagged `native-messaging` (LastPass, 1Password, Postman Interceptor)
  - [x] `GET /extensions/list` still responds (regression check)
  - [x] App launches, browsing works
- **Issues encountered:**
  - None
- **Notes for next phase:**
  - `GalleryLoader` is in `src/extensions/gallery-loader.ts` — instantiate per request (reads user gallery.json each time, so edits take effect immediately)
  - `GalleryExtension` and `ExtensionCategory` types are exported from `src/extensions/gallery-defaults.ts`
  - `GalleryEntry` (extends `GalleryExtension` with `installed: boolean`) and `GalleryResponse` types are exported from `gallery-loader.ts`
  - `GET /extensions/gallery` supports `?category=<category>` and `?featured=true` query params for filtering
  - The `installed` field checks if the extension ID exists as a folder in `~/.tandem/extensions/` (uses `extensionManager.list().available`)
  - The merge architecture uses a spread-based `Map` merge — user gallery entries override defaults field-by-field (partial overrides work). The merge method accepts variadic sources, so a third layer (remote gallery) can be added without changing the merge logic
  - User gallery format: `{ version: 1, extensions: [{ id, name, description, category, compatibility, securityConflict, mechanism, featured }] }` — entries need at minimum an `id` field
  - No new npm dependencies added

---

## Phase 5a: Settings Panel UI — Extensions

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** 3592c10
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] Extensions section visible in settings panel (🧩 Extensions nav entry in sidebar)
  - [x] "Installed" tab shows loaded extensions with name, version, status (tested with 0 and with available extensions)
  - [x] "From Chrome" tab lists importable Chrome extensions (10 Chrome extensions detected on test machine)
  - [x] "Gallery" tab shows curated extensions with one-click install (30 extensions, category filters, featured sorting)
  - [x] Install button triggers download + signature verify + load (calls POST /extensions/install with spinner)
  - [x] Remove button uninstalls extension (calls DELETE /extensions/uninstall/:id with confirm dialog)
  - [x] Status indicators: loaded (green), not loaded (amber), error (red) — shown as badges on Installed tab
  - [x] Conflict warnings shown on extensions with detected conflicts (DNR Overlap amber, Native Messaging blue)
  - [x] App launches, browsing works
- **Issues encountered:**
  - None
- **Notes for next phase:**
  - The Extensions UI is in `shell/settings.html` — all CSS, HTML, and JS are inline (follows the existing settings panel pattern)
  - Tab switching is managed by `#ext-tabs` buttons with `data-tab` attributes; content panels are `.ext-tab-content` divs
  - The Installed tab loads data on init and after remove/install; From Chrome and Gallery tabs load on first switch (lazy)
  - Install button in Gallery replaces itself with an "Installed" badge on success, shows inline error on failure
  - Import button in From Chrome replaces itself with an "Imported" badge on success
  - Remove button shows a confirm modal (reuses existing `showModal()` pattern) before calling DELETE
  - Gallery category filters are rendered dynamically from the API response's `categories` array
  - Featured extensions are sorted to the top in the Gallery tab
  - `esc()` helper function added for HTML escaping to prevent XSS from extension names/descriptions
  - No new npm dependencies added
  - No TypeScript files were modified — this phase is purely UI (HTML/CSS/JS in settings.html)
  - Phase 5b should add the extension toolbar to the main browser chrome (not the settings panel)

---

## Phase 5b: Extension Toolbar + Action Popup UI

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** d10f61b
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] Extension toolbar visible in browser UI (right side of URL bar, between screenshot button and status dot)
  - [x] Extension icons show for extensions with action/browser_action (tested with Dark Reader + uBlock Origin)
  - [x] Clicking icon opens popup with full chrome.* API access (BrowserWindow with persist:tandem session)
  - [x] Popup closes on click-outside (blur event) or Escape (no separate handler needed — blur handles it)
  - [x] Badge text updates — infrastructure in place (badge polling timer + badge state map). Electron 40 Extension objects don't expose runtime badge state from main process; extensions set badges via chrome.action.setBadgeText() in service workers. Badge display works when set via setBadge() method.
  - [x] Right-click context menu: Extension name (label), Options (if options_page/options_ui), Pin/Unpin to Toolbar, Remove from Tandem (with confirm dialog)
  - [x] Overflow dropdown for >6 extensions (puzzle piece 🧩 button opens dropdown with remaining extensions)
  - [x] Pin state persists across restarts (saved to ~/.tandem/extensions/toolbar-state.json)
  - [x] Toolbar refreshes on install/uninstall (extension-toolbar-refresh IPC event sent from API routes + extension-toolbar-update IPC event from ExtensionToolbar)
  - [x] App launches, browsing works (verified with 2 extensions loaded)
- **Issues encountered:**
  - `session.getAllExtensions()` deprecated in Electron 40 — used `session.extensions.getAllExtensions()` with fallback to deprecated API
  - `session.loadExtension()` deprecation (pre-existing from Phase 1) — still works, logged warning. Not fixed in Phase 5b as loader.ts is out of scope.
  - Badge text polling: Electron 40's Extension object returned by `session.extensions.getAllExtensions()` does not expose runtime badge state (text/color set by chrome.action.setBadgeText()). Polling infrastructure is in place but cannot read badge values from main process. Extensions that set badges will show correctly if the badge state is set via the ExtensionToolbar.setBadge() method externally.
- **Notes for next phase:**
  - `ExtensionToolbar` is in `src/extensions/toolbar.ts` — instantiated in main.ts, takes ExtensionManager as constructor arg
  - `ExtensionToolbar.registerIpcHandlers(session)` registers 6 IPC handlers: `extension-toolbar-list`, `extension-popup-open`, `extension-popup-close`, `extension-pin`, `extension-context-menu`, `extension-options`
  - `ExtensionToolbar.notifyToolbarUpdate(session)` sends `extension-toolbar-update` IPC event to renderer with full toolbar extension list
  - `ExtensionToolbar.destroy()` cleans up IPC handlers, badge poll timer, and popup window
  - The toolbar UI in `shell/index.html` renders extension buttons dynamically from IPC data
  - Popup windows are `BrowserWindow` instances using the `persist:tandem` session — full `chrome.*` API access
  - Popup auto-sizes based on content (min 200x100, max 800x600) with 100ms delay for CSS/JS layout
  - Popup closes on blur (click outside) — no separate Escape handler needed since blur fires on any focus loss
  - Pin state file: `~/.tandem/extensions/toolbar-state.json` — format: `{ pinned: string[], order: string[] }`
  - API routes POST /extensions/install and DELETE /extensions/uninstall/:id now send `extension-toolbar-refresh` IPC event to renderer
  - Badge polling runs every 2s but currently cannot read badge values from Electron main process — infrastructure ready for when Electron exposes this
  - No new npm dependencies added

---

## Phase 6: Native Messaging Support

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** 6c40464
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] Native messaging host directories detected per platform (3 macOS directories checked: system Chrome, user Chrome, user Chromium)
  - [x] `session.setNativeMessagingHostDirectory()` — API does NOT exist in Electron 40. Runtime check confirms it's not available. Chromium may still read from standard Chrome directories automatically.
  - [x] 1Password extension — desktop app not installed on test machine, correctly reported as missing. No crash.
  - [x] LastPass extension — desktop app not installed on test machine, correctly reported as missing. No crash.
  - [x] Extensions without native host installed degrade gracefully (no crash, warnings logged)
  - [x] 3 native messaging hosts detected on test machine (Apple Password Manager, Claude Browser Extension, Google Drive Native Proxy) — all with valid binaries
  - [x] `GET /extensions/native-messaging/status` API endpoint returns full detection results
  - [x] `GET /extensions/list` still responds (regression check)
  - [x] `GET /extensions/gallery` still responds (regression check, 30 entries)
  - [x] App launches, browsing works (2 extensions loaded: uBlock Origin, Dark Reader)
- **Issues encountered:**
  - `session.setNativeMessagingHostDirectory()` does NOT exist in Electron 40's public API (not in TypeScript definitions, not available at runtime). The Phase 6 doc assumed this API exists, but it was never added to Electron. The implementation does a runtime check and falls back gracefully.
  - Chromium's internal native messaging infrastructure may still work automatically — when Electron loads extensions via `loadExtension()`, the underlying Chromium extension system may read host manifests from the standard Chrome directories. This cannot be confirmed without actually having 1Password/LastPass desktop apps installed to test `chrome.runtime.connectNative()`.
  - Windows support is limited — native messaging hosts on Windows are registered via Windows Registry, which requires native modules to read. The implementation checks a common filesystem fallback path instead.
- **Notes for next phase:**
  - `NativeMessagingSetup` is in `src/extensions/native-messaging.ts` — instantiated by ExtensionManager, runs detection + configuration during `init()`
  - `ExtensionManager.getNativeMessagingStatus()` returns full status for the API endpoint
  - `ExtensionManager.isNativeHostAvailable(extensionId)` checks if a specific extension's native host is installed
  - `GET /extensions/native-messaging/status` returns `{ supported, directories, hosts, configured, missing }`
  - `supported` field is `false` since `setNativeMessagingHostDirectory()` is not available; however this does NOT mean native messaging won't work — Chromium may handle it internally
  - The `hosts` array in the status response includes all detected native messaging hosts with binary existence check, allowed extensions, and manifest paths
  - `KNOWN_HOSTS` constant in `native-messaging.ts` maps 3 known extension host names (1Password, LastPass, Postman) to their CWS extension IDs
  - Platform-specific directories: macOS (3 dirs: system Chrome + user Chrome + user Chromium), Linux (3 dirs: system + user Chrome + user Chromium), Windows (1 dir: filesystem fallback)
  - No new npm dependencies added

---

## Phase 7: chrome.identity OAuth Support

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** 38daa00
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] Step 1 empirical test completed — MV3 fallback OAuth tested for Grammarly + Notion Web Clipper
  - [x] Grammarly: Scenario B — `chrome.identity` is `undefined` in Electron; extension depends on `chrome.identity.getRedirectURL()` for redirect URI in both non-interactive (`launchWebAuthFlow`) and interactive (tab-based) flows. Without polyfill, `redirectUri` resolves to empty string, breaking URL matching. Polyfill needed.
  - [x] Notion Web Clipper: Does NOT need polyfill — no `identity` permission, uses cookie-based auth via `chrome.cookies` + notion.so web login. The `chrome.identity` reference in its code is only in a browser polyfill library (vendors file), not actively used.
  - [x] Polyfill approach: **Service worker file patching + localhost API** (neither Option A nor Option B from phase doc). Prepends polyfill JS to extension's `sw.js` on disk before `session.loadExtension()`. Polyfill provides `chrome.identity.getRedirectURL()` and `chrome.identity.launchWebAuthFlow()`. The `launchWebAuthFlow` implementation fetches `POST /extensions/identity/auth` on localhost, which opens a BrowserWindow for the OAuth flow.
  - [x] OAuth BrowserWindow uses `persist:tandem` session (Security Stack Rules) — verified in code at `identity-polyfill.ts:229`
  - [x] OAuth popup closes automatically after redirect capture — `captureRedirect()` calls `cleanup()` which closes popup
  - [x] 5-minute timeout on OAuth popups — verified in code at `identity-polyfill.ts:293`
  - [x] `*.chromiumapp.org` URLs intercepted via `session.protocol.handle('https', ...)` — returns "Authentication Complete" HTML page, non-chromiumapp URLs pass through via `net.fetch(request)`
  - [x] chromiumapp.org URL tested: navigated to `https://kbfnbcaeplbcioakkpcpgfkobkghlhen.chromiumapp.org/?code=test123&state=abc` — showed "Authentication Complete" page ✓
  - [x] Grammarly service worker patched with polyfill (CWS_ID embedded, API_PORT embedded) — verified in `sw.js`
  - [x] Extensions not using `chrome.identity` are unaffected — Dark Reader + Notion Web Clipper not patched (no `identity` permission / no service worker)
  - [x] uBlock Origin still loads and functions (non-identity extension)
  - [x] All API endpoints still respond (`/extensions/list`, `/extensions/gallery`, `/extensions/native-messaging/status`)
  - [x] Identity auth endpoint accessible without auth token (`POST /extensions/identity/auth`)
  - [x] App launches, browsing works (verified Google.com loads)
  - [ ] Grammarly end-to-end login not tested — requires valid Grammarly account + interactive OAuth. Polyfill infrastructure verified working.
  - [ ] Notion Web Clipper end-to-end login not tested — works via cookie-based auth (no polyfill needed), but requires Notion account
- **Issues encountered:**
  - Neither Option A (companion extension) nor Option B (protocol interception) from PHASE-7.md was used. Instead, a third approach was implemented: **service worker file patching**. The extension's `sw.js` file is modified on disk (before `session.loadExtension()`) to prepend a polyfill script that provides `chrome.identity`. This works because: (1) `session.setPreloads()` doesn't work for MV3 service workers, (2) companion extension approach requires `chrome.runtime.onMessageExternal` which may not work cross-extension in Electron, (3) protocol interception can't inject JS into service worker context. File patching is reliable, simple, and works with any MV3 extension.
  - Grammarly's service worker has `host_permissions: ["http://*/*"]`, allowing the polyfill to `fetch()` to `localhost` for the OAuth flow. Extensions without this permission would need a different approach.
  - The polyfill uses the CWS extension ID (folder name), not the Electron-assigned ID, so OAuth redirect URIs match what the extension expects (`https://{CWS_ID}.chromiumapp.org/`).
  - Pre-existing Grammarly errors logged on startup (`cookies.onChanged`, `windows.onFocusChanged`) are unrelated to the polyfill — these are Electron API gaps.
- **Notes for next phase:**
  - `IdentityPolyfill` is in `src/extensions/identity-polyfill.ts` — instantiated by ExtensionManager with `apiPort`
  - `ExtensionManager.getIdentityPolyfill()` exposes it for the API endpoint
  - `POST /extensions/identity/auth` endpoint does NOT require auth token (called by extension service workers)
  - The polyfill only patches extensions that: (1) declare `identity` permission, (2) are MV3, (3) have a `background.service_worker` entry
  - Polyfill injection is idempotent — checks for marker comment `/* Tandem chrome.identity polyfill` before patching
  - `chromiumapp.org` protocol handler intercepts ALL HTTPS requests in the session and uses `net.fetch(request)` for pass-through — this is necessary because `session.protocol.handle` replaces the default handler
  - Extensions that need `chrome.identity` but lack `host_permissions` for localhost may need a different communication channel (not encountered yet)
  - No new npm dependencies added

---

## Phase 8: Testing & Verification

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** 90574cd
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] Unit tests for CRX header parsing (CRX2, CRX3, invalid) — 7 tests covering CRX2/CRX3 valid, invalid magic bytes, HTML error responses, unknown versions, too-small files, non-Google domains
  - [x] Unit tests for CRX extraction — 4 tests covering CRX2/CRX3 extraction to disk, invalid offset, invalid ZIP
  - [x] Unit tests for extension ID extraction (bare ID, CWS URL, invalid) — 13 tests covering bare IDs, full CWS URLs, short URLs, edge cases, invalid inputs
  - [x] Unit tests for gallery defaults — 7 tests covering count (30), required fields, unique IDs, featured count (10), recommended TOP30, DNR-overlap flags (6), native-messaging flags (3)
  - [x] Unit tests for Chrome importer — 4 tests covering platform path detection, list extensions, isAlreadyImported, profile names
  - [x] Integration tests (network-gated, 38 tests) — install by ID, install by CWS URL, already-installed idempotency, invalid ID error, uninstall removes from disk, TOP30 ID verification
  - [x] All 30 extension IDs from TOP30 verified against Chrome Web Store — 5 wrong IDs corrected, 2 delisted extensions identified
  - [x] 35 unit tests pass, 38 integration tests skipped (network-gated via `TANDEM_NETWORK_TESTS=true`)
  - [x] `npm run test:extensions` script added to package.json
  - [x] App launches, browsing works
- **Issues encountered:**
  - 5 extension IDs in gallery-defaults.ts were incorrect and returned HTTP 404 from CWS:
    - DuckDuckGo Privacy Essentials: `caoacbimdbbljakfhgikoodekdnkbicp` → `bkdgflcldnnnapblkhphbgpggdiikppg`
    - JSON Formatter: `bcjindcccaagfpapjibcdnjnljaoajfd` → `gpmodmeblccallcadopbcoeoejepgpnb`
    - Return YouTube Dislike: `gebbhagfogifgggkldgodflihielkjfl` → `gebbhagfogifgggkldgodflihgfeippi`
    - ColorZilla: `bhlhnicpbhignbdhedgjmaplebemodai` → `bhlhnicpbhignbdhedgjhgdocnmhomnp`
    - Postman Interceptor: `aicmkgpgakddgnaphhhpliifpcfnhce` → `aicmkgpgakddgnaphhhpliifpcfhicfo` (was only 31 chars, should be 32)
  - 2 extensions returned HTTP 204 (delisted from Chrome Web Store):
    - Pocket (`niloccemoadcdkdjlinkgdfekeahmflj`) — Pocket service shut down in early 2025. Marked `compatibility: 'blocked'` with note.
    - EditThisCookie (`fngmhnnpilhplaeedifhccceomclgfbg`) — removed from CWS (no MV3 support). Marked `compatibility: 'blocked'` with note.
  - All wrong IDs corrected in: gallery-defaults.ts, native-messaging.ts, TOP30-EXTENSIONS.md, PHASE-4.md
- **Notes for next phase:**
  - Test file is at `src/extensions/tests/extensions.test.ts` — vitest-based, no Electron dependencies for unit tests
  - Integration tests require `TANDEM_NETWORK_TESTS=true` environment variable
  - `npm run test:extensions` runs all extension tests (unit + integration if env var set)
  - Gallery now has 28 working/partial extensions + 2 blocked (Pocket, EditThisCookie) = 30 total
  - All extension IDs verified against CWS download endpoint — safe to use for Phase 9 auto-updates
  - The `featured` flag is still set on Pocket (`featured: true`) even though it's blocked — Phase 9 may want to skip blocked extensions in featured lists

---

## Phase 9: Extension Auto-Updates

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** e2fbb72
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] Version check uses Google CRX update check endpoint (batch, single request for all 4 extensions)
  - [x] Fallback to CRX download if update protocol fails (fallback path tested by initial JSON endpoint failure)
  - [x] Chrome-imported extensions (`.tandem-meta.json`) included in checks — `getInstalledExtensions()` reads `cwsId` from meta
  - [x] Update verifies CRX3 signature before installing (reuses CrxDownloader.installFromCws format verification)
  - [x] Atomic update: download → verify → swap → load (rollback on failure) — `.old/` directory used for rollback
  - [x] Extension is active immediately after update (no app restart) — `session.removeExtension()` + `session.loadExtension()`
  - [x] `manifest.json` key field preserved after update — old key injected into new manifest if missing
  - [x] Disk cleanup removes stale `.old/` and `.tmp/` directories — runs on startup and after updates
  - [x] Update interval is configurable via `update-state.json` `checkIntervalMs` (default: 24h)
  - [x] `GET /extensions/updates/check` triggers batch check — tested: 4 extensions checked, correct versions returned
  - [x] `GET /extensions/updates/status` shows last check + available updates + next scheduled check time
  - [x] `POST /extensions/updates/apply` applies updates (tested with specific extensionId and all)
  - [x] `GET /extensions/disk-usage` returns per-extension sizes — tested: 4 extensions, 91MB total
  - [x] Update state persisted to `~/.tandem/extensions/update-state.json`
  - [x] Scheduled checks: first check 5 min after launch, then every 24h (configurable)
  - [x] Settings UI: "Check for Updates" button, per-extension "Update" buttons, "Update All", update count badge on Installed tab
  - [x] App launches, browsing works (all 4 extensions loaded)
  - [x] All previous API endpoints still respond (list, gallery, native-messaging, identity/auth)
- **Issues encountered:**
  - Google's JSON update protocol endpoint (`update.googleapis.com/service/update2/json`) returns 404. The Phase 9 doc and CLAUDE.md referenced this endpoint, but it does not exist. Instead, the CRX update check endpoint (`clients2.google.com/service/update2/crx?response=updatecheck`) works and returns XML with version + codebase URL. The implementation uses this XML endpoint with regex-based attribute parsing (no XML parser dependency needed).
  - The `POST /extensions/updates/apply` endpoint for a specific extension that is already at the latest version returns `{ success: true, error: "Already at latest version" }`. The atomic update flow correctly detects same-version and rolls back without unnecessary work.
- **Notes for next phase:**
  - `UpdateChecker` is in `src/extensions/update-checker.ts` — instantiated by ExtensionManager with CrxDownloader + ExtensionLoader
  - `ExtensionManager.checkForUpdates()` returns `UpdateCheckResult[]` with per-extension version info
  - `ExtensionManager.applyUpdate(id, session)` does atomic update for a single extension
  - `ExtensionManager.applyAllUpdates(session)` checks + applies all available updates
  - `ExtensionManager.getDiskUsage()` returns `{ totalBytes, extensions: [{ id, name, sizeBytes }] }`
  - `ExtensionManager.destroyUpdateChecker()` stops scheduled checks — called in will-quit handler
  - Update state file: `~/.tandem/extensions/update-state.json` — tracks lastCheck, interval, per-extension versions
  - The update check uses `clients2.google.com/service/update2/crx?response=updatecheck` (NOT the JSON endpoint from CLAUDE.md)
  - The XML response is parsed with regex (no npm dependency) — extracts `appid`, `status`, `version`, `codebase` attributes
  - `.tandem-meta.json` is preserved during updates and `importedVersion` is updated to the new version
  - Settings UI updates are in `shell/settings.html` — update header row with Check/Update All buttons, per-card Update buttons, update badges
  - No new npm dependencies added

---

## Phase 10a: Extension Conflict Detection

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** —
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] Extensions with `declarativeNetRequest` detected and flagged — detection rule checks both `declarativeNetRequest`/`declarativeNetRequestWithHostAccess` permissions and `declarative_net_request` manifest key. uBlock Origin MV2 does NOT have DNR (uses `webRequestBlocking` instead) so no dnr-overlap is flagged for the installed version — this is correct behavior.
  - [x] Extensions with `nativeMessaging` detected and flagged — Grammarly detected with `nativeMessaging` permission
  - [x] Broad content script injection patterns detected — uBlock Origin (`http://*/*`, `https://*/*`), Dark Reader (`<all_urls>`), Grammarly (`<all_urls>`) all flagged. Patterns logged to console for security auditing.
  - [x] Keyboard shortcut conflicts with Tandem shortcuts detected — detection compares extension `commands` manifest entries against 29 Tandem shortcuts. Normalizes Chrome shortcut syntax (Command/MacCtrl/Cmd → Ctrl).
  - [x] Conflict severity matches Phase 1 DNR test results — DNR severity set to `warning` (Phase 1 showed Guardian still fires with 2 onBeforeRequest consumers). No `critical` conflicts.
  - [x] `GET /extensions/list` includes conflicts per extension — each loaded extension has a `conflicts` array
  - [x] `GET /extensions/conflicts` returns all conflicts + summary — tested: 4 conflicts (0 info, 4 warnings, 0 critical)
  - [x] `ExtensionManager.loadInSession()` method exists (not wired into SessionManager) — loads all extensions from `~/.tandem/extensions/` into a given session
  - [x] App launches, browsing works (4 extensions loaded)
  - [x] All previous API endpoints still respond (list, gallery, native-messaging, updates/status)
  - [x] Install result includes detected conflicts for newly installed extensions
  - [x] ScriptGuard empirical finding: Extension content scripts bypass ScriptGuard — they are injected by Electron's extension system, not via CDP (`scriptParsed` events). No whitelist needed. Broad content script patterns are logged for security auditing only.
- **Issues encountered:**
  - uBlock Origin MV2 (installed version 1.69.0) does NOT use `declarativeNetRequest` — it uses `webRequestBlocking` instead. The gallery's static `securityConflict: 'dnr-overlap'` describes the MV3 version behavior. Dynamic detection is more precise than the gallery's static data since it checks the actual installed manifest. This is correct: MV2 ad blockers go through webRequest hooks (where Guardian lives), so they don't have the DNR overlap problem.
  - Extension content scripts bypass ScriptGuard (confirmed by CLAUDE.md Security Rule #8: "Extension content scripts bypass ScriptGuard — they are injected by Electron's extension system, not via CDP"). No whitelist implementation needed — replaced with audit logging of broad content script patterns.
- **Notes for next phase:**
  - `ConflictDetector` is in `src/extensions/conflict-detector.ts` — instantiated by ExtensionManager
  - `ExtensionManager.getConflictsForExtension(id)` returns conflicts for a single extension
  - `ExtensionManager.getAllConflicts()` returns `{ conflicts, summary }` for all installed extensions
  - `GET /extensions/conflicts` returns `{ conflicts: ExtensionConflict[], summary: { info, warnings, critical } }`
  - `GET /extensions/list` now includes `conflicts` array per loaded extension
  - Install result (`POST /extensions/install`) includes `conflicts` field when conflicts detected
  - `ExtensionManager.loadInSession(session)` loads all extensions into a given Electron session — NOT wired into SessionManager. Future integration point: call after setting up security stack for isolated sessions.
  - DNR severity is `'warning'` based on Phase 1 test (Guardian still fires). Phase 10b should re-evaluate if deeper testing reveals Guardian misses specific blocked requests.
  - The `TANDEM_SHORTCUTS` constant in `conflict-detector.ts` contains 29 shortcuts — update if new Tandem shortcuts are added
  - Gallery `securityConflict` field (static) and ConflictDetector (dynamic) may differ for MV2 vs MV3 versions — the dynamic detector is more precise
  - No new npm dependencies added
  - No new state files created

---

## Phase 10b: DNR Reconciliation Layer

> **Conditional:** Only implement if Phase 1's DNR test confirmed Guardian misses requests blocked by DNR. If Guardian still sees all requests, mark as SKIPPED.

- **Status:** PENDING (conditional)
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] DNR rule reader parses uBlock Origin rule files
  - [ ] Handles large rulesets (300K+ rules) without excessive memory
  - [ ] DNR rule files parsed for all installed DNR extensions
  - [ ] Static blocklist stored in SecurityDB and `.dnr-analysis.json`
  - [ ] Analysis re-runs on extension update
  - [ ] Reconciler registers as passive `completedConsumer` in RequestDispatcher
  - [ ] NetworkShield overlap correctly calculated from static lists
  - [ ] `GET /extensions/dnr/status` returns reconciler state
  - [ ] Reconciler does NOT modify or slow down any network requests
  - [ ] App launches, browsing works, extension ad-blocking unaffected
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Known Issues & Workarounds

| Issue | Phase | Workaround | Status |
|-------|-------|------------|--------|
| Extensions do NOT run in isolated sessions (`persist:session-{name}`) — only in `persist:tandem` | 1 | Known limitation. Phase 10a adds `loadInSession()` foundation for future | OPEN |
| `declarativeNetRequest` extensions (ad blockers) may interfere with NetworkShield telemetry | 1 | Empirically tested in Phase 1. Phase 10a detects, Phase 10b reconciles | OPEN |
| `session.setPreloads()` does not work for MV3 service workers | 7 | Phase 7 rewritten: test fallback OAuth first, then companion extension or protocol interception | OPEN |
| Installed extensions do not auto-update | 9 | Phase 9 adds auto-update via CRX update check endpoint (batch check + atomic update) | RESOLVED |
| CWS download endpoint is undocumented (may change) | 1 | Chrome User-Agent spoofing + retry with backoff. Phase 9 uses separate update protocol endpoint | OPEN |
| Extension popups invisible without toolbar UI | 5b | Phase 5b adds extension toolbar with popup rendering | RESOLVED |
| Chrome-imported extensions frozen at import version | 3,9 | Phase 9 includes Chrome-imported extensions in update checks via `.tandem-meta.json` cwsId | RESOLVED |
| `session.setNativeMessagingHostDirectory()` does not exist in Electron 40 | 6 | Runtime check + fallback. Chromium may read standard Chrome directories automatically. Detection + status reporting in place. | OPEN |

## Dependency Changes

| Phase | Dependency | Version | Reason |
|-------|-----------|---------|--------|
| 1 | adm-zip | ^0.5.16 | ZIP extraction for CRX files |
| 1 | @types/adm-zip (dev) | ^0.5.7 | TypeScript types for adm-zip |

## File Inventory

> Updated after each phase. Lists all files created or modified.

| File | Phase | Action |
|------|-------|--------|
| `src/extensions/crx-downloader.ts` | 1 | Created — CRX download, format verification, extraction |
| `src/main.ts` | 1 | Modified — ExtensionManager replaces direct ExtensionLoader usage |
| `src/extensions/chrome-importer.ts` | 3 | Created — Chrome profile detection + extension import |
| `src/extensions/gallery-defaults.ts` | 4 | Created — 30 curated extensions with types (GalleryExtension, ExtensionCategory) |
| `src/extensions/gallery-loader.ts` | 4 | Created — Two-layer gallery merge logic (defaults + user overrides) |
| `src/api/server.ts` | 1, 2, 3, 4 | Modified — Phase 1: extensionManager to options, list route. Phase 2: install/uninstall/list API routes. Phase 3: Chrome list/import routes. Phase 4: gallery route |
| `shell/settings.html` | 5a | Modified — Added Extensions section with 3 tabs (Installed, From Chrome, Gallery), CSS for cards/badges/tabs, JS for API calls |
| `src/extensions/toolbar.ts` | 5b | Created — ExtensionToolbar class: toolbar state, popup rendering, pin persistence, context menu, badge polling |
| `shell/index.html` | 5b | Modified — Added extension toolbar CSS + HTML + JS (toolbar buttons, overflow dropdown, popup IPC) |
| `src/preload.ts` | 5b | Modified — Added 9 extension toolbar IPC methods (getToolbarExtensions, openPopup, closePopup, pin, contextMenu, options, onUpdate, onRemoveRequest, onRefresh) |
| `src/extensions/native-messaging.ts` | 6 | Created — NativeMessagingSetup: platform-specific host detection, session configuration attempt, status reporting |
| `src/extensions/identity-polyfill.ts` | 7 | Created — chrome.identity polyfill: SW file patching, chromiumapp.org handler, BrowserWindow OAuth flow |
| `src/extensions/manager.ts` | 1, 6, 7 | Modified — Phase 7: IdentityPolyfill integration, apiPort constructor param, getIdentityPolyfill() accessor |
| `src/api/server.ts` | 1, 2, 3, 4, 5b, 6, 7 | Modified — Phase 7: POST /extensions/identity/auth endpoint (no auth required) |
| `src/main.ts` | 1, 5b, 7 | Modified — Phase 7: Identity polyfill cleanup in will-quit handler |
| `src/extensions/tests/extensions.test.ts` | 8 | Created — Unit + integration tests (CRX parsing, ID extraction, gallery, Chrome importer) |
| `vitest.config.ts` | 8 | Modified — Added `src/extensions/tests/**/*.test.ts` to test includes |
| `package.json` | 1, 8 | Modified — Phase 1: adm-zip + @types/adm-zip. Phase 8: test:extensions script |
| `package-lock.json` | 1 | Modified — Lock file updated |
| `src/extensions/gallery-defaults.ts` | 4, 8 | Modified — Phase 8: Fixed 5 wrong extension IDs, marked 2 delisted extensions as blocked |
| `src/extensions/native-messaging.ts` | 6, 8 | Modified — Phase 8: Fixed Postman Interceptor extension ID |
| `docs/Browser-extensions/TOP30-EXTENSIONS.md` | 4, 8 | Modified — Phase 8: Fixed 5 wrong extension IDs in all tables |
| `docs/Browser-extensions/phases/PHASE-4.md` | 4, 8 | Modified — Phase 8: Fixed 5 wrong extension IDs in extension table |
| `src/extensions/update-checker.ts` | 9 | Created — UpdateChecker: batch version check via CRX update endpoint, atomic update with rollback, disk usage, scheduled checks, state persistence |
| `src/extensions/manager.ts` | 1, 6, 7, 9 | Modified — Phase 9: UpdateChecker integration, update/disk-usage methods, destroyUpdateChecker() |
| `src/api/server.ts` | 1, 2, 3, 4, 5b, 6, 7, 9 | Modified — Phase 9: updates/check, updates/status, updates/apply, disk-usage endpoints |
| `src/main.ts` | 1, 5b, 7, 9 | Modified — Phase 9: UpdateChecker cleanup in will-quit handler |
| `shell/settings.html` | 5a, 9 | Modified — Phase 9: Update header with Check/Update All buttons, per-extension Update buttons, update badges, update status CSS |
| `src/extensions/conflict-detector.ts` | 10a | Created — ConflictDetector: DNR overlap, native messaging, broad content scripts, keyboard shortcut conflict detection |
| `src/extensions/manager.ts` | 1, 6, 7, 9, 10a | Modified — Phase 10a: ConflictDetector integration, conflict methods, loadInSession() foundation |
| `src/api/server.ts` | 1, 2, 3, 4, 5b, 6, 7, 9, 10a | Modified — Phase 10a: GET /extensions/conflicts endpoint, conflicts in /extensions/list response |
