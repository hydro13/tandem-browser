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
  - [ ] Extension ID extraction works (bare ID + CWS URL formats)
  - [ ] Downloaded extension appears in `~/.tandem/extensions/{id}/`
  - [ ] `manifest.json` is readable after extraction
  - [ ] ExtensionManager wraps ExtensionLoader + CrxDownloader
  - [ ] ExtensionManager wired into `main.ts` (replaces direct ExtensionLoader)
  - [ ] ExtensionManager wired into `api/server.ts`
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
  - [ ] `DELETE /extensions/uninstall/:id` removes from disk
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
  - [ ] `gallery.ts` contains curated extensions with IDs, names, descriptions, categories
  - [ ] All 10 recommended extensions from TOP30-EXTENSIONS.md are included
  - [ ] `GET /extensions/gallery` returns gallery with installed status per entry
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

## Phase 7: chrome.identity OAuth Polyfill

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] `chrome.identity.launchWebAuthFlow()` polyfill implemented
  - [ ] OAuth popup opens in a new window for auth flows
  - [ ] Redirect URL captured and returned to extension
  - [ ] Grammarly login flow works end-to-end
  - [ ] Notion Web Clipper login flow works end-to-end
  - [ ] Extensions not using `chrome.identity` are unaffected
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

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

## Known Issues & Workarounds

| Issue | Phase | Workaround | Status |
|-------|-------|------------|--------|
| — | — | — | — |

## Dependency Changes

| Phase | Dependency | Version | Reason |
|-------|-----------|---------|--------|
| 1 | adm-zip | ^0.5.10 | ZIP extraction for CRX files |
| 1 | @types/adm-zip (dev) | ^0.5.5 | TypeScript types for adm-zip |

## File Inventory

> Updated after each phase. Lists all files created or modified.

(Will be filled in as phases are completed)
