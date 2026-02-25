# Browser Extensions — Implementation Status

> This file tracks progress across Claude Code sessions. Each phase updates its section after completion.
> **Read this file FIRST** when starting a new session.

## Current State

**Next phase to implement:** Phase 2
**Last completed phase:** Phase 1
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

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] `POST /extensions/install` accepts CWS URL and extension ID
  - [ ] `POST /extensions/install` downloads, verifies signature, extracts, and loads extension
  - [ ] `DELETE /extensions/uninstall/:id` calls `session.removeExtension()` + removes from disk (no restart)
  - [ ] `GET /extensions/list` returns installed extensions with status
  - [ ] Error responses for invalid input, download failures, signature failures
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 3: Chrome Profile Importer

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] Chrome extensions directory detected on current platform
  - [ ] `GET /extensions/chrome/list` returns Chrome extensions
  - [ ] `POST /extensions/chrome/import` copies extension to `~/.tandem/extensions/`
  - [ ] `.tandem-meta.json` written with `source: "chrome-import"` and `cwsId`
  - [ ] `manifest.json` `key` field checked (warning if missing)
  - [ ] `POST /extensions/chrome/import` with `{ all: true }` imports all
  - [ ] Already-imported extensions are skipped (not duplicated)
  - [ ] Chrome internal extensions (e.g. `__MSG_` names) are filtered out
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 4: Curated Extension Gallery

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] `gallery-defaults.ts` contains 30 curated extensions with IDs, names, descriptions, categories
  - [ ] All entries include `securityConflict` field (`'none' | 'dnr-overlap' | 'native-messaging'`)
  - [ ] All 10 recommended extensions from TOP30-EXTENSIONS.md are included
  - [ ] `~/.tandem/extensions/gallery.json` loaded if exists (user overrides)
  - [ ] User gallery entries override defaults by ID, can add new entries
  - [ ] `GET /extensions/gallery` returns merged gallery with installed status per entry
  - [ ] Gallery entries include compatibility status from TOP30 assessment
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 5a: Settings Panel UI — Extensions

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] Extensions section visible in settings panel
  - [ ] "Installed" tab shows loaded extensions with name, version, status
  - [ ] "From Chrome" tab lists importable Chrome extensions
  - [ ] "Gallery" tab shows curated extensions with one-click install
  - [ ] Install button triggers download + signature verify + load
  - [ ] Remove button uninstalls extension
  - [ ] Status indicators: loaded, not loaded, error
  - [ ] Conflict warnings shown on extensions with detected conflicts
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

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
| `src/api/server.ts` | 1 | Modified — Added extensionManager to options, list route uses manager |
| `package.json` | 1 | Modified — Added adm-zip + @types/adm-zip |
| `package-lock.json` | 1 | Modified — Lock file updated |
