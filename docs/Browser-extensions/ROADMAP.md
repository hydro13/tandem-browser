# Browser Extensions Roadmap

> Track progress or all phases and sub-tasks.
> Update this file when a task is completed.

---

## Phase 1: CRX Downloader + Extension Manager
**Priority:** HIGH | **Effort:** ~1 day | **Dependencies:** None

- [x] **1.1** Create `src/extensions/crx-downloader.ts`
  - CRX download from Chrome Web Store (public endpoint, no auth)
  - CRX2 and CRX3 header parsing
  - ZIP extraction to `~/.tandem/extensions/{id}/`
  - Extension ID extraction from CWS URL or bare ID
  - Redirect-following HTTP client with Chrome User-Agent spoofing
  - Retry with exponential backoff (3 attempts)
- [x] **1.2** CRX3 format validation (NOT full signature verification — deferred)
  - Magic bytes Cr24 check, version 2/3 check
  - Google-only redirect domain check
  - ZIP validity check via AdmZip
  - manifest.json validity check (name, version, key fields)
  - `signatureVerified: false` placeholder with TODO for future phase
- [x] **1.3** CWS download resilience
  - Chrome User-Agent header on CWS requests
  - Response validation (Cr24 magic bytes check)
  - 30-second timeout per attempt
  - `acceptformat=crx2,crx3` required for reliable downloads
- [x] **1.4** Post-extraction verification
  - Verify `manifest.json` has `key` field (warn if missing)
  - Compare Electron extension ID with CWS ID (log both)
  - Log content script URL patterns for security auditing
- [x] **1.5** Add `adm-zip` dependency
  - `npm install adm-zip @types/adm-zip`
- [x] **1.6** Create `src/extensions/manager.ts`
  - Wraps ExtensionLoader + CrxDownloader
  - `init(session)` — load all extensions on startup
  - `install(input, session)` — download + verify signature + load
  - `list()` — list available extensions
  - `uninstall(extensionId, session)` — `session.removeExtension()` + file removal
  - `getExtensionMetadata(id)` — parsed manifest info
- [x] **1.7** Wire ExtensionManager into `main.ts`
  - Replace direct ExtensionLoader usage with ExtensionManager
  - Pass session through init chain
- [x] **1.8** Wire ExtensionManager into `api/server.ts`
  - Replace ExtensionLoader with ExtensionManager in server options
  - Update existing routes to use ExtensionManager

---

## Phase 2: Extension API Routes
**Priority:** HIGH | **Effort:** ~half day | **Dependencies:** Phase 1

- [ ] **2.1** Add `POST /extensions/install` endpoint
  - Body: `{ input: string }` — CWS URL or extension ID
  - Downloads CRX, verifies signature, extracts, loads into session
  - Returns: `InstallResult` (success, extensionId, name, version, signatureVerified, error)
- [ ] **2.2** Add `DELETE /extensions/uninstall/:id` endpoint
  - Calls `session.removeExtension()` + removes from disk (no restart)
  - Returns: `{ success: boolean }`
- [ ] **2.3** Update `GET /extensions/list` endpoint
  - Include install source, loaded status, version
  - Merge loaded + available info
- [ ] **2.4** Add error handling for all extension endpoints
  - Invalid extension IDs
  - Download failures (network, invalid CRX, signature verification failure)
  - Already installed / not found for uninstall

---

## Phase 3: Chrome Profile Importer
**Priority:** MEDIUM | **Effort:** ~half day | **Dependencies:** Phase 1

- [ ] **3.1** Create `src/extensions/chrome-importer.ts`
  - Platform-specific Chrome profile path detection (macOS, Windows, Linux)
  - List Chrome extensions (read `manifest.json` from version subfolders)
  - Filter out Chrome internal extensions (`__MSG_` names)
  - Import single extension (copy to `~/.tandem/extensions/`)
  - Import all extensions (batch copy)
  - Write `.tandem-meta.json` with CWS ID for auto-update registration
  - Verify `key` field in copied manifest
- [ ] **3.2** Add `GET /extensions/chrome/list` endpoint
  - Returns list or Chrome extensions available for import
  - Includes name, ID, version, already-imported status
- [ ] **3.3** Add `POST /extensions/chrome/import` endpoint
  - Body: `{ extensionId: string }` or `{ all: true }`
  - Returns import result with counts (imported, skipped, failed)

---

## Phase 4: Curated Extension Gallery
**Priority:** MEDIUM | **Effort:** ~half day | **Dependencies:** Phase 1

- [x] **4.1** Create `src/extensions/gallery-defaults.ts` + `gallery-loader.ts`
  - Curated list or verified-compatible extensions
  - Include all 10 recommended from TOP30-EXTENSIONS.md analysis
  - Include all 30 from TOP30-EXTENSIONS.md with compatibility + API status
  - Each entry: id, name, description, category, compatibility, mechanism, securityConflict
- [x] **4.2** Implement `GET /extensions/gallery` endpoint
  - Returns gallery entries with installed status per entry
  - Merge with `ExtensionManager.list()` to show installed flag
- [x] **4.3** Add category filtering support
  - Categories: privacy, password, productivity, appearance, developer, media, shopping, language, web3

---

## Phase 5a: Settings Panel UI — Extensions
**Priority:** MEDIUM | **Effort:** ~1 day | **Dependencies:** Phase 2, 3, 4

- [ ] **5a.1** Add "Extensions" section to settings panel
  - Tab navigation: Installed | From Chrome | Gallery
- [ ] **5a.2** Implement "Installed" tab
  - List or loaded extensions with name, version, ID, status
  - Status indicator: loaded, not loaded, error
  - Conflict warnings if applicable
  - Remove button per extension
- [ ] **5a.3** Implement "From Chrome" tab
  - Auto-detect Chrome extensions via `GET /extensions/chrome/list`
  - Import button per extension, "Import All" bulk button
  - Show already-imported status
- [ ] **5a.4** Implement "Gallery" tab
  - Grid/list or curated extensions with descriptions
  - Category filter badges
  - One-click install button (calls `POST /extensions/install`)
  - Compatibility + security conflict badges
- [ ] **5a.5** Wire up install/uninstall actions
  - Loading state during install (download → verify → extract → load)
  - Success/error feedback
  - Refresh list after install/uninstall

---

## Phase 5b: Extension Toolbar + Action Popup UI
**Priority:** HIGH | **Effort:** ~1 day | **Dependencies:** Phase 1, 2, 5a

- [ ] **5b.1** Create `src/extensions/toolbar.ts`
  - Read toolbar data from extension manifests (action/browser_action/page_action)
  - Provide icon, popup URL, badge text, title per extension
  - Icon reading as base64 data URI
- [ ] **5b.2** Extension popup rendering
  - Open popup as BrowserWindow at chrome-extension:// URL
  - Popup sizing based on content
  - Close on click-outside or Escape
  - Full chrome.* API access in popup context
- [ ] **5b.3** Toolbar UI in shell
  - Extension icons right or URL bar area
  - Badge overlay (text + color) per icon
  - Tooltip on hover
  - Overflow dropdown for >6 extensions
- [ ] **5b.4** Badge update system
  - Listen for extension badge changes
  - Forward updates to shell via IPC
- [ ] **5b.5** Extension context menu
  - Right-click: name, Options page, Remove, Pin/Unpin
  - Pin state persisted in `~/.tandem/extensions/toolbar-state.json`
- [ ] **5b.6** Preload + IPC wiring
  - `tandem.getToolbarExtensions()`, `tandem.openExtensionPopup(id)`
  - Badge update, install/uninstall event listeners in shell

---

## Phase 6: Native Messaging Support
**Priority:** LOW | **Effort:** ~half day | **Dependencies:** Phase 1

- [ ] **6.1** Create native messaging host detection
  - Detect 1Password, LastPass, Postman native hosts per platform
  - Platform paths: macOS, Windows, Linux
- [ ] **6.2** Configure `session.setNativeMessagingHostDirectory()`
  - Call during session init for detected hosts
  - Log which native messaging hosts were found
- [ ] **6.3** Graceful degradation
  - Extensions needing missing native hosts show clear message
  - No crashes on missing hosts

---

## Phase 7: chrome.identity OAuth Support
**Priority:** LOW | **Effort:** ~half day | **Dependencies:** Phase 1

- [x] **7.1** Empirical test — do MV3 extensions have a working OAuth fallback?
  - Grammarly: No — `chrome.identity` is `undefined`, needs polyfill
  - Notion Web Clipper: No `identity` permission — uses cookie-based auth, no polyfill needed
- [x] **7.2** MV3-compatible polyfill (service worker file patching approach)
  - Prepends polyfill JS to extension's `sw.js` before `session.loadExtension()`
  - Polyfill provides `chrome.identity.getRedirectURL()` + `launchWebAuthFlow()`
  - `launchWebAuthFlow` uses localhost API → BrowserWindow OAuth popup
  - `*.chromiumapp.org` URLs intercepted via `session.protocol.handle('https', ...)`
- [x] **7.3** OAuth BrowserWindow uses `persist:tandem` session
  - `webPreferences: { session: ses }` — Security Stack Rules
  - Monitors `will-navigate`/`will-redirect`/`did-navigate` for `*.chromiumapp.org` redirect
  - 5-minute timeout for abandoned flows
- [x] **7.4** Test with known extensions
  - Grammarly loads with polyfill, non-identity extensions unaffected
  - End-to-end OAuth login deferred (requires account credentials)

---

## Phase 8: Testing & Verification
**Priority:** HIGH | **Effort:** ~half day | **Dependencies:** All phases

- [x] **8.1** Unit tests for CRX parsing
  - CRX2 header parsing
  - CRX3 header parsing
  - Invalid magic bytes rejection
  - ZIP extraction to correct path
- [x] **8.2** Unit tests for extension ID extraction
  - Bare ID (32 char a-p)
  - Full CWS URL
  - Short CWS URL
  - Invalid input
- [x] **8.3** Integration tests (network-gated)
  - Install uBlock Origin by ID end-to-end
  - Install from full CWS URL
  - Chrome importer finds extensions at correct path
- [x] **8.4** Verify extension IDs from TOP30
  - All 30 IDs verified against Chrome Web Store
  - 5 wrong IDs corrected (DuckDuckGo, JSON Formatter, Return YouTube Dislike, ColorZilla, Postman)
  - 2 delisted extensions identified (Pocket, EditThisCookie)
- [x] **8.5** Manual verification checklist
  - uBlock Origin loads and blocks ads
  - Dark Reader applies dark mode
  - Extensions survive app restart
  - API returns correct installed/loaded status
  - `npx tsc --noEmit` passes with 0 errors

---

## Phase 9: Extension Auto-Updates
**Priority:** MEDIUM | **Effort:** ~1 day | **Dependencies:** Phase 1, 2

- [ ] **9.1** Version check via Google Update Protocol
  - Batch check all extensions in single HTTP request
  - Parse version metadata response
  - Fallback to CRX download if protocol endpoint fails
- [ ] **9.2** Include Chrome-imported extensions
  - Read `.tandem-meta.json` for cwsId
  - Register imported extensions for update checks
- [ ] **9.3** Atomic update with CRX3 signature verification
  - Download new CRX → verify signature → extract to temp
  - Unload old → swap directories → load new → rollback on failure
- [ ] **9.4** Update state persistence
  - Store in `~/.tandem/extensions/update-state.json`
  - Track per-extension version, last check, last result
- [ ] **9.5** Disk space management
  - Track per-extension disk usage
  - Clean up stale `.old/` and `.tmp/` directories
  - Warn on >500MB total usage
  - `GET /extensions/disk-usage` endpoint
- [ ] **9.6** Scheduled update checks
  - Default interval: 24 hours
  - First check: 5 minutes after launch
  - Background, non-blocking
- [ ] **9.7** API endpoints
  - `GET /extensions/updates/check` — batch version check
  - `GET /extensions/updates/status` — current state
  - `POST /extensions/updates/apply` — apply updates
- [ ] **9.8** UI integration (if Phase 5a completed)
  - Update badges, per-extension update button, "Update All"

---

## Phase 10a: Extension Conflict Detection
**Priority:** LOW | **Effort:** ~half day | **Dependencies:** Phase 1, 4

- [x] **10a.1** Create `src/extensions/conflict-detector.ts`
  - DNR overlap detection (declarativeNetRequest vs NetworkShield)
  - Native messaging dependency detection
  - Broad content script injection detection (audit logging, no ScriptGuard whitelist needed — extensions bypass CDP)
  - Keyboard shortcut conflict detection (extension commands vs Tandem shortcuts)
- [x] **10a.2** Integrate with Extension Manager
  - Run conflict detection on install
  - Include conflicts in list response
- [x] **10a.3** Add conflict info to API
  - Conflicts array per extension in `GET /extensions/list`
  - `GET /extensions/conflicts` — all conflicts + summary
  - Consistency with gallery `securityConflict` field
- [x] **10a.4** Isolated session extension loading (foundation)
  - `ExtensionManager.loadInSession(session)` method
  - Do NOT wire into SessionManager yet — document for future

---

## Phase 10b: DNR Reconciliation Layer
**Priority:** MEDIUM | **Effort:** ~1 day | **Dependencies:** Phase 1 (DNR test), Phase 10a

> **Conditional:** Only implement if Phase 1's DNR test confirms Guardian misses requests blocked by DNR rules. If Guardian still sees all requests, skip this phase.

- [ ] **10b.1** DNR rule reader
  - Read extension DNR rule files from manifest
  - Extract blocked domains from `urlFilter` patterns
  - Build domain-level summary (efficient for 300K+ rules)
- [ ] **10b.2** Telemetry gap measurement
  - Register `completedConsumer` in RequestDispatcher (priority 100)
  - Track domains Guardian processed vs DNR block list
  - Infer DNR-blocked requests with confidence scoring
- [ ] **10b.3** Synthetic event logging
  - Log `dnr-extension-block` events to SecurityDB
  - All events marked `confidence: 'inferred'`
  - EvolutionEngine can include in baseline calculations
- [ ] **10b.4** NetworkShield overlap analysis
  - Quantify overlap between extension DNR rules and NetworkShield blocklist
  - Expose via API for transparency
- [ ] **10b.5** Wire into startup
  - Initialize after extensions loaded
  - Register as passive completedConsumer in RequestDispatcher
- [ ] **10b.6** API endpoints
  - `GET /extensions/dnr/status` — reconciler state + overlap analysis
  - `GET /extensions/dnr/events` — inferred block events

---

## Progress Summary

| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 1 | CRX Downloader + Extension Manager | DONE | 8/8 |
| 2 | Extension API Routes | PENDING | 0/4 |
| 3 | Chrome Profile Importer | PENDING | 0/3 |
| 4 | Curated Extension Gallery | DONE | 3/3 |
| 5a | Settings Panel UI | PENDING | 0/5 |
| 5b | Extension Toolbar + Popup UI | PENDING | 0/6 |
| 6 | Native Messaging Support | PENDING | 0/3 |
| 7 | chrome.identity OAuth Support | DONE | 4/4 |
| 8 | Testing & Verification | DONE | 5/5 |
| 9 | Extension Auto-Updates | PENDING | 0/8 |
| 10a | Extension Conflict Detection | DONE | 4/4 |
| 10b | DNR Reconciliation Layer | PENDING (conditional) | 0/6 |

**Total:** 21/54 tasks completed
