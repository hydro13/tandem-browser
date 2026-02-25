# Browser Extensions Roadmap

> Track progress of all phases and sub-tasks.
> Update this file when a task is completed.

---

## Phase 1: CRX Downloader + Extension Manager
**Priority:** HIGH | **Effort:** ~1 day | **Dependencies:** None

- [ ] **1.1** Create `src/extensions/crx-downloader.ts`
  - CRX download from Chrome Web Store (public endpoint, no auth)
  - CRX2 and CRX3 header parsing
  - ZIP extraction to `~/.tandem/extensions/{id}/`
  - Extension ID extraction from CWS URL or bare ID
  - Redirect-following HTTP client
- [ ] **1.2** Add `adm-zip` dependency
  - `npm install adm-zip @types/adm-zip`
- [ ] **1.3** Create `src/extensions/manager.ts`
  - Wraps ExtensionLoader + CrxDownloader
  - `init(session)` — load all extensions on startup
  - `install(input, session)` — download from CWS + load
  - `list()` — list available extensions
  - `uninstall(extensionId)` — remove from disk
- [ ] **1.4** Wire ExtensionManager into `main.ts`
  - Replace direct ExtensionLoader usage with ExtensionManager
  - Pass session through init chain
- [ ] **1.5** Wire ExtensionManager into `api/server.ts`
  - Replace ExtensionLoader with ExtensionManager in server options
  - Update existing routes to use ExtensionManager

---

## Phase 2: Extension API Routes
**Priority:** HIGH | **Effort:** ~half day | **Dependencies:** Phase 1

- [ ] **2.1** Add `POST /extensions/install` endpoint
  - Body: `{ input: string }` — CWS URL or extension ID
  - Downloads CRX, extracts, loads into session
  - Returns: `InstallResult` (success, extensionId, name, version, installPath, error)
- [ ] **2.2** Add `DELETE /extensions/uninstall/:id` endpoint
  - Removes extension from disk
  - Returns: `{ success: boolean }`
- [ ] **2.3** Update `GET /extensions/list` endpoint
  - Include install source, loaded status, version
  - Merge loaded + available info
- [ ] **2.4** Add error handling for all extension endpoints
  - Invalid extension IDs
  - Download failures (network, invalid CRX)
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
- [ ] **3.2** Add `GET /extensions/chrome/list` endpoint
  - Returns list of Chrome extensions available for import
  - Includes name, ID, version, already-imported status
- [ ] **3.3** Add `POST /extensions/chrome/import` endpoint
  - Body: `{ extensionId: string }` or `{ all: true }`
  - Returns import result with counts (imported, skipped, failed)

---

## Phase 4: Curated Extension Gallery
**Priority:** MEDIUM | **Effort:** ~half day | **Dependencies:** Phase 1

- [ ] **4.1** Create `src/extensions/gallery.ts`
  - Curated list of verified-compatible extensions
  - Include all 10 recommended from TOP30-EXTENSIONS.md analysis:
    1. uBlock Origin, 2. Bitwarden, 3. Dark Reader, 4. React DevTools,
    5. Video Speed Controller, 6. MetaMask, 7. Wappalyzer, 8. Momentum,
    9. Pocket, 10. StayFocusd
  - Include all 30 from TOP30-EXTENSIONS.md with compatibility status
  - Each entry: id, name, description, category, compatibility, mechanism
- [ ] **4.2** Implement `GET /extensions/gallery` endpoint
  - Returns gallery entries with installed status per entry
  - Merge with `ExtensionManager.list()` to show installed flag
- [ ] **4.3** Add category filtering support
  - Categories: privacy, password, productivity, appearance, developer, media, shopping, language, web3

---

## Phase 5: Settings Panel UI — Extensions
**Priority:** MEDIUM | **Effort:** ~1 day | **Dependencies:** Phase 2, 3, 4

- [ ] **5.1** Add "Extensions" section to settings panel
  - Tab navigation: Installed | From Chrome | Gallery
- [ ] **5.2** Implement "Installed" tab
  - List of loaded extensions with name, version, ID
  - Status indicator: loaded, not loaded (needs restart), error
  - Remove button per extension
- [ ] **5.3** Implement "From Chrome" tab
  - Auto-detect Chrome extensions via `GET /extensions/chrome/list`
  - Import button per extension, "Import All" bulk button
  - Show already-imported status
- [ ] **5.4** Implement "Gallery" tab
  - Grid/list of curated extensions with descriptions
  - Category filter badges
  - One-click install button (calls `POST /extensions/install`)
  - Compatibility badge (Works / Partial / Needs work)
- [ ] **5.5** Wire up install/uninstall actions
  - Loading state during install (download → extract → load)
  - Success/error feedback
  - Refresh list after install/uninstall

---

## Phase 6: Native Messaging Support
**Priority:** LOW | **Effort:** ~half day | **Dependencies:** Phase 1

- [ ] **6.1** Create native messaging host detection
  - Detect 1Password native host binary per platform
  - Detect LastPass native host binary per platform
  - Detect Postman Interceptor native host per platform
  - Platform paths:
    - macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
    - Windows: Registry + `%APPDATA%\Google\Chrome\NativeMessagingHosts\`
    - Linux: `~/.config/google-chrome/NativeMessagingHosts/`
- [ ] **6.2** Configure `session.setNativeMessagingHostDirectory()`
  - Call during session init for detected hosts
  - Log which native messaging hosts were found
- [ ] **6.3** Graceful degradation
  - Extensions that need native messaging but don't have the host installed
  - Show clear message in UI about requiring the desktop app

---

## Phase 7: chrome.identity OAuth Polyfill
**Priority:** LOW | **Effort:** ~half day | **Dependencies:** Phase 1

- [ ] **7.1** Implement `chrome.identity.launchWebAuthFlow()` polyfill
  - Preload script that intercepts `chrome.identity` calls
  - Open OAuth URL in a new BrowserWindow (popup)
  - Monitor navigation for redirect URL match
  - Return redirect URL to the extension callback
- [ ] **7.2** Wire polyfill into extension session
  - Inject via `session.setPreloads()` or content script mechanism
  - Only active for extension contexts (not page content)
- [ ] **7.3** Test with known extensions
  - Grammarly login flow
  - Notion Web Clipper login flow
  - Verify other extensions are unaffected

---

## Phase 8: Testing & Verification
**Priority:** HIGH | **Effort:** ~half day | **Dependencies:** All phases

- [ ] **8.1** Unit tests for CRX parsing
  - CRX2 header parsing
  - CRX3 header parsing
  - Invalid magic bytes rejection
  - ZIP extraction to correct path
- [ ] **8.2** Unit tests for extension ID extraction
  - Bare ID (32 char a-p)
  - Full CWS URL
  - Short CWS URL
  - Invalid input
- [ ] **8.3** Integration tests
  - Install uBlock Origin by ID end-to-end
  - Install from full CWS URL
  - Chrome importer finds extensions at correct path
  - Chrome importer skips already-imported extensions
- [ ] **8.4** Verify extension IDs from TOP30
  - Check all 30 IDs resolve on Chrome Web Store
  - Special attention to flagged IDs: DuckDuckGo, JSON Formatter, Return YouTube Dislike
- [ ] **8.5** Manual verification checklist
  - uBlock Origin loads and blocks ads
  - Dark Reader applies dark mode
  - Extensions survive app restart
  - Uninstall removes from disk and unloads from session
  - Chrome import lists correct extensions
  - API returns correct installed/loaded status

---

## Progress Summary

| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 1 | CRX Downloader + Extension Manager | PENDING | 0/5 |
| 2 | Extension API Routes | PENDING | 0/4 |
| 3 | Chrome Profile Importer | PENDING | 0/3 |
| 4 | Curated Extension Gallery | PENDING | 0/3 |
| 5 | Settings Panel UI | PENDING | 0/5 |
| 6 | Native Messaging Support | PENDING | 0/3 |
| 7 | chrome.identity Polyfill | PENDING | 0/3 |
| 8 | Testing & Verification | PENDING | 0/5 |

**Total:** 0/31 tasks completed
