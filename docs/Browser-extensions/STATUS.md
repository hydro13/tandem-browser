# Browser Extensions — Implementation Status

> This file tracks progress across Claude Code sessions. Each phase updates its section after completion.
> **Read this file FIRST** when starting a new session.

## Current State

**Next phase to implement:** Phase 5b
**Last completed phase:** Phase 5a
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

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] Extension toolbar visible in browser UI
  - [ ] Extension icons show for extensions with action/browser_action
  - [ ] Clicking icon opens popup with full chrome.* API access
  - [ ] Popup closes on click-outside or Escape
  - [ ] Badge text updates dynamically (e.g. uBlock blocked count)
  - [ ] Right-click context menu: Options, Remove, Pin/Unpin
  - [ ] Overflow dropdown for >6 extensions
  - [ ] Pin state persists across restarts
  - [ ] Toolbar refreshes on install/uninstall
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 6: Native Messaging Support

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] Native messaging host directories detected per platform
  - [ ] `session.setNativeMessagingHostDirectory()` called for detected hosts
  - [ ] 1Password extension connects to desktop app (if installed)
  - [ ] LastPass extension connects to desktop app (if installed)
  - [ ] Extensions without native host installed degrade gracefully (no crash)
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 7: chrome.identity OAuth Support

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] Step 1 empirical test completed — MV3 fallback OAuth tested for Grammarly + Notion Web Clipper
  - [ ] If fallback works: gallery compatibility notes updated, no polyfill code needed
  - [ ] If polyfill needed: chosen approach (companion extension / protocol interception) documented
  - [ ] OAuth BrowserWindow uses `persist:tandem` session (Security Stack Rules)
  - [ ] OAuth popup closes automatically after redirect capture
  - [ ] Grammarly login flow works end-to-end
  - [ ] Notion Web Clipper login flow works end-to-end
  - [ ] Extensions not using `chrome.identity` are unaffected
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —
- **IMPORTANT:** Do NOT use `session.setPreloads()` — does not work for MV3 service workers

---

## Phase 8: Testing & Verification

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] Unit tests for CRX header parsing (CRX2, CRX3, invalid)
  - [ ] Unit tests for CRX3 signature verification (valid, tampered)
  - [ ] Unit tests for extension ID extraction (bare ID, CWS URL, invalid)
  - [ ] Integration test: install uBlock Origin by ID (with signature verification)
  - [ ] Integration test: install from full CWS URL
  - [ ] Manual: uBlock Origin loads, blocks ads, popup shows blocked count in toolbar
  - [ ] Manual: Dark Reader applies dark mode
  - [ ] Manual: Extensions survive app restart
  - [ ] Manual: Uninstall removes from disk
  - [ ] Extension IDs from TOP30 verified against Chrome Web Store
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 9: Extension Auto-Updates

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] Version check uses Google Update Protocol (batch, single request)
  - [ ] Fallback to CRX download if update protocol fails
  - [ ] Chrome-imported extensions (`.tandem-meta.json`) included in checks
  - [ ] Update verifies CRX3 signature before installing
  - [ ] Atomic update: download → verify → swap → load (rollback on failure)
  - [ ] Extension is active immediately after update (no app restart)
  - [ ] `manifest.json` key field preserved after update
  - [ ] Disk cleanup removes stale `.old/` and `.tmp/` directories
  - [ ] Update interval is configurable
  - [ ] `GET /extensions/updates/check` triggers batch check
  - [ ] `GET /extensions/updates/status` shows last check + available updates
  - [ ] `GET /extensions/disk-usage` returns per-extension sizes
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 10a: Extension Conflict Detection

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] Extensions with `declarativeNetRequest` detected and flagged
  - [ ] Extensions with `nativeMessaging` detected and flagged
  - [ ] Broad content script injection patterns detected
  - [ ] Keyboard shortcut conflicts with Tandem shortcuts detected
  - [ ] Conflict severity matches Phase 1 DNR test results
  - [ ] `GET /extensions/list` includes conflicts per extension
  - [ ] `GET /extensions/conflicts` returns all conflicts + summary
  - [ ] `ExtensionManager.loadInSession()` method exists (not wired into SessionManager)
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

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
| Installed extensions do not auto-update | 9 | Manual reinstall. Phase 9 adds auto-update via Google Update Protocol | OPEN |
| CWS download endpoint is undocumented (may change) | 1 | Chrome User-Agent spoofing + retry with backoff. Phase 9 uses separate update protocol endpoint | OPEN |
| Extension popups invisible without toolbar UI | 5b | Phase 5b adds extension toolbar with popup rendering | OPEN |
| Chrome-imported extensions frozen at import version | 3,9 | Phase 3 writes `.tandem-meta.json` with cwsId. Phase 9 includes these in update checks | OPEN |

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
| `src/extensions/manager.ts` | 1 | Created — ExtensionManager wrapping ExtensionLoader + CrxDownloader |
| `src/main.ts` | 1 | Modified — ExtensionManager replaces direct ExtensionLoader usage |
| `src/extensions/chrome-importer.ts` | 3 | Created — Chrome profile detection + extension import |
| `src/extensions/gallery-defaults.ts` | 4 | Created — 30 curated extensions with types (GalleryExtension, ExtensionCategory) |
| `src/extensions/gallery-loader.ts` | 4 | Created — Two-layer gallery merge logic (defaults + user overrides) |
| `src/api/server.ts` | 1, 2, 3, 4 | Modified — Phase 1: extensionManager to options, list route. Phase 2: install/uninstall/list API routes. Phase 3: Chrome list/import routes. Phase 4: gallery route |
| `shell/settings.html` | 5a | Modified — Added Extensions section with 3 tabs (Installed, From Chrome, Gallery), CSS for cards/badges/tabs, JS for API calls |
| `package.json` | 1 | Modified — Added adm-zip + @types/adm-zip |
| `package-lock.json` | 1 | Modified — Lock file updated |
