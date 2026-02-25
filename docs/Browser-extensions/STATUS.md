# Browser Extensions — Implementation Status

> This file tracks progress across Claude Code sessions. Each phase updates its section after completion.
> **Read this file FIRST** when starting a new session.

## Current State

**Next phase to implement:** Phase 1
**Last completed phase:** —
**Overall status:** NOT STARTED

---

## Phase 1: CRX Downloader + Extension Manager

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] `adm-zip` added to package.json and installed
  - [ ] CRX downloader parses CRX2 and CRX3 headers correctly
  - [ ] `prodversion` uses `process.versions.chrome` (not hardcoded)
  - [ ] Extension ID extraction works (bare ID + CWS URL formats)
  - [ ] Downloaded extension appears in `~/.tandem/extensions/{id}/`
  - [ ] `manifest.json` is readable after extraction and contains `key` field (warning if missing)
  - [ ] Extension ID from Electron matches CWS ID (both logged)
  - [ ] ExtensionManager wraps ExtensionLoader + CrxDownloader
  - [ ] ExtensionManager.uninstall() uses `session.removeExtension()` + file removal (no restart)
  - [ ] ExtensionManager wired into `main.ts` (replaces direct ExtensionLoader)
  - [ ] ExtensionManager wired into `api/server.ts`
  - [ ] Extension requests visible in RequestDispatcher (Guardian sees them)
  - [ ] DNR interaction tested: uBlock + tracked page → document if Guardian still fires
  - [ ] App launches with `npm start`, existing extensions still load
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 2: Extension API Routes

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] `POST /extensions/install` accepts CWS URL and extension ID
  - [ ] `POST /extensions/install` downloads, extracts, and loads extension
  - [ ] `DELETE /extensions/uninstall/:id` calls `session.removeExtension()` + removes from disk (no restart)
  - [ ] `GET /extensions/list` returns installed extensions with status
  - [ ] Error responses for invalid input, download failures
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

## Phase 5: Settings Panel UI — Extensions

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] Extensions section visible in settings panel
  - [ ] "Installed" tab shows loaded extensions with name, version, status
  - [ ] "From Chrome" tab lists importable Chrome extensions
  - [ ] "Gallery" tab shows curated extensions with one-click install
  - [ ] Install button triggers download + load
  - [ ] Remove button uninstalls extension
  - [ ] Status indicators: loaded, not loaded, error
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
  - [ ] Unit tests for extension ID extraction (bare ID, CWS URL, invalid)
  - [ ] Integration test: install uBlock Origin by ID
  - [ ] Integration test: install from full CWS URL
  - [ ] Manual: uBlock Origin loads and blocks ads
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
  - [ ] Version-check detects newer version available on CWS
  - [ ] Update downloads, extracts, and replaces old version
  - [ ] Extension is active immediately after update (no app restart)
  - [ ] `manifest.json` key field preserved after update
  - [ ] Corrupt downloads detected and not installed
  - [ ] Update interval is configurable
  - [ ] `GET /extensions/updates/check` triggers manual check
  - [ ] `GET /extensions/updates/status` shows last check + available updates
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 10: Extension Conflict Management

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] Extensions with `declarativeNetRequest` detected and flagged
  - [ ] Conflict warning shown in gallery and installed extensions list
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Known Issues & Workarounds

| Issue | Phase | Workaround | Status |
|-------|-------|------------|--------|
| Extensions do NOT run in isolated sessions (`persist:session-{name}`) — only in `persist:tandem` | 1 | Known limitation. Users in isolated sessions won't have ad-blocker, password manager, etc. Future: load extensions in all sessions (Phase 10) | OPEN |
| `declarativeNetRequest` extensions (ad blockers) may interfere with NetworkShield telemetry | 1 | Must be empirically tested in Phase 1. Mark conflicting extensions in gallery with `securityConflict: 'dnr-overlap'` | OPEN |
| `session.setPreloads()` does not work for MV3 service workers | 7 | Phase 7 rewritten: test fallback OAuth first, then companion extension or protocol interception | OPEN |
| Installed extensions do not auto-update | 9 | Manual reinstall. Phase 9 will add auto-update mechanism | OPEN |

## Dependency Changes

| Phase | Dependency | Version | Reason |
|-------|-----------|---------|--------|
| 1 | adm-zip | ^0.5.10 | ZIP extraction for CRX files |
| 1 | @types/adm-zip (dev) | ^0.5.5 | TypeScript types for adm-zip |

## File Inventory

> Updated after each phase. Lists all files created or modified.

(Will be filled in as phases are completed)
