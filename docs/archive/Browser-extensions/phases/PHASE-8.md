# Phase 8: Testing & Verification

> **Priority:** HIGH | **Effort:** ~half day | **Dependencies:** All phases (1-7)

## Goal
Comprehensive testing or all extension functionality: unit tests for core parsing logic, integration tests for the install flow, manual verification or popular extensions, and validation or all extension IDs from the TOP30 list.

## Files to Read
- `src/extensions/crx-downloader.ts` — CRX parsing logic to test
- `src/extensions/manager.ts` — install flow to test
- `src/extensions/chrome-importer.ts` — import logic to test
- `src/extensions/gallery.ts` — gallery data to validate
- `docs/Browser-extensions/TOP30-EXTENSIONS.md` — extension IDs to verify
- `vitest.config.ts` — existing test configuration (if vitest is set up from security project)

## Files to Create
- `src/extensions/tests/extensions.test.ts` — unit + integration tests

## Tasks

### 8.1 Unit tests for CRX parsing

```typescript
describe('CRX Header Parsing', () => {
  // test: parse CRX2 header — correct ZIP start offset
  // test: parse CRX3 header — correct ZIP start offset
  // test: reject files without 'Cr24' magic bytes
  // test: reject files with unknown CRX version
  // test: extract ZIP contents to correct path
  // test: manifest.json readable after extraction
})
```

Create test CRX buffers manually (minimal valid headers + small ZIP payload) to avoid network calls in tests.

### 8.2 Unit tests for extension ID extraction

```typescript
describe('Extension ID Extraction', () => {
  // test: bare ID — 'cjpalhdlnbpafiamejdnhcphjbkeiagm' → same
  // test: full CWS URL — 'https://chromewebstore.google.com/detail/ublock-origin/cjpalhdlnbpafiamejdnhcphjbkeiagm' → ID
  // test: short CWS URL — 'https://chromewebstore.google.com/detail/cjpalhdlnbpafiamejdnhcphjbkeiagm' → ID
  // test: URL with query params — still extracts ID
  // test: invalid input — returns null
  // test: wrong length ID — returns null
  // test: ID with invalid chars (outside a-p) — returns null
})
```

### 8.3 Integration tests

These tests require network access (downloading from CWS):

```typescript
describe('Extension Install Flow', () => {
  // test: install uBlock Origin by bare ID — downloads, extracts, manifest readable
  // test: install by CWS URL — same result
  // test: already-installed extension — returns success immediately (idempotent)
  // test: invalid extension ID — returns error
  // test: uninstall — removes directory from disk
})

describe('Chrome Importer', () => {
  // test: correct Chrome extensions path for current platform
  // test: list returns extensions (or empty array if Chrome not installed)
  // test: import skips already-imported extensions
})
```

**Note:** Integration tests that download from CWS should be skippable (behind a flag or in a separate test suite) since they require network access and take time.

### 8.4 Verify extension IDs from TOP30

Verify all 30 extension IDs from `TOP30-EXTENSIONS.md` resolve on the Chrome Web Store.

**Verification method:** For each ID, check that the CWS download URL returns a valid redirect (HTTP 302) rather than an error:
```
https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0.0.0&x=id%3D{ID}%26uc
```

**Special attention to flagged IDs:**
- `#6` DuckDuckGo Privacy Essentials — ID `caoacbimdbbljakfhgikoodekdnkbicp`
- `#21` JSON Formatter — ID `bcjindcccaagfpapjibcdnjnljaoajfd`
- `#26` Return YouTube Dislike — ID `gebbhagfogifgggkldgodflihielkjfl`

If any ID is invalid, update `gallery.ts` and `TOP30-EXTENSIONS.md` with the correct ID.

### 8.5 Manual verification checklist

Run through these checks manually with the app running:

- [ ] **uBlock Origin** — install via API, verify it loads, browse to a site with ads, confirm ads are blocked
- [ ] **Dark Reader** — install, enable, verify dark mode applies to pages
- [ ] **App restart** — quit and relaunch, verify extensions are loaded fresh on boot
- [ ] **Uninstall** — remove an extension via API, verify directory deleted, extension no longer active after restart
- [ ] **Chrome import** — if Chrome is installed, list extensions, import one, verify it loads
- [ ] **Gallery** — verify `GET /extensions/gallery` returns correct data with installed status
- [ ] **Error handling** — try installing with an invalid ID, verify clean error response
- [ ] **Multiple extensions** — install 3+ extensions, verify they coexist without conflicts

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] All unit tests pass (`npm run test:extensions` or similar)
- [ ] CRX header tests cover both CRX2 and CRX3
- [ ] Extension ID extraction handles all URL formats
- [ ] Integration tests pass (with network access)
- [ ] All 30 extension IDs from TOP30 verified (or corrected)
- [ ] Manual checklist completed (all items checked)
- [ ] No regressions — existing browser functionality works
- [ ] App launches with `npm start`, browsing works

## Scope
- ONLY create test files and fix any issues found during testing
- If ID verification reveals wrong IDs, update `gallery.ts` and `TOP30-EXTENSIONS.md`
- Do NOT add new features — this phase is testing only
- Do NOT refactor working code unless tests reveal actual bugs

## After Completion
1. Update `docs/Browser-extensions/STATUS.md` — mark Phase 8 as DONE
2. Update `docs/Browser-extensions/ROADMAP.md` — check off all Phase 8 tasks
3. Update overall project status in STATUS.md to COMPLETE (if all phases done)
4. **Commit and push** — follow the commit format in CLAUDE.md "After You Finish" section
