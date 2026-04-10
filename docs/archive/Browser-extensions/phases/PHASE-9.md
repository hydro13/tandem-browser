# Phase 9: Extension Auto-Updates

> **Priority:** MEDIUM | **Effort:** ~1 day | **Dependencies:** Phase 1, 2

## Goal

Automatically keep installed extensions up to date. Without this, extensions are frozen at the version installed — security fixes, API compatibility updates, and bug fixes never reach the user. Chrome checks for updates every few hours; Tandem must do the same.

## Why This Matters

- **Security vulnerabilities stay open** — if uBlock Origin or Bitwarden release a security fix, Tandem keeps running the old vulnerable version
- **Functionality degrades** — extensions that depend on external APIs (Grammarly, Honey, Wappalyzer) stop working when those APIs change
- **Compatibility breaks** — websites change their structure; content scripts that rely on specific selectors stop matching

## Files to Read

- `src/extensions/crx-downloader.ts` — CRX download + verification logic (reuse for updates)
- `src/extensions/manager.ts` — ExtensionManager install/uninstall flow
- `src/extensions/loader.ts` — `session.loadExtension()` and `session.removeExtension()`

## Files to Create

- `src/extensions/update-checker.ts` — version comparison + update orchestration

## Files to Modify

- `src/extensions/manager.ts` — integrate update checker, expose update methods
- `src/api/server.ts` — add update API endpoints
- `src/main.ts` — schedule periodic update checks

## Tasks

### 9.1 Version Check via Google Update Protocol

**Critical improvement:** Do NOT download the full CRX just to check versions. The CWS CRX download can be 50MB+ per extension. For 10+ extensions this wastes bandwidth.

Instead, use Google's **Update Protocol** to check versions without downloading:

```
https://update.googleapis.com/service/update2/json?acceptformat=crx3&prodversion={CHROME_VERSION}&x=id%3D{ID}%26uc
```

This endpoint returns a JSON response with version metadata:

```json
{
  "response": {
    "app": [{
      "appid": "cjpalhdlnbpafiamejdnhcphjbkeiagm",
      "updatecheck": {
        "status": "ok",
        "version": "1.58.0",
        "codebase": "https://..."
      }
    }]
  }
}
```

**Batch checking:** The update protocol supports checking multiple extensions in one request by appending multiple `x=` parameters:

```
&x=id%3D{ID1}%26uc&x=id%3D{ID2}%26uc&x=id%3D{ID3}%26uc
```

This means checking 30 extensions is a single HTTP request, not 30 separate CRX downloads.

**Implementation:**

```typescript
export class UpdateChecker {
  constructor(private downloader: CrxDownloader)

  /** Check a single extension for available update */
  async checkOne(extensionId: string, currentVersion: string): Promise<UpdateCheckResult>

  /** Check all installed extensions in one batch request */
  async checkAll(installed: InstalledExtension[]): Promise<UpdateCheckResult[]>

  /** Download and apply update for a single extension */
  async updateOne(extensionId: string, session: Session): Promise<UpdateResult>

  /** Update all extensions with available updates */
  async updateAll(session: Session): Promise<UpdateResult[]>
}
```

**Version comparison:** Split version strings on `.`, compare numerically left to right. `1.58.0 > 1.57.2`, `2.0.0 > 1.99.99`.

**Fallback:** If the update protocol endpoint fails (4xx/5xx), fall back to the CRX download approach — download CRX to temp, read manifest.json version, compare. This is bandwidth-heavy but ensures updates still work if Google changes the protocol endpoint.

### 9.2 Include Chrome-Imported Extensions

Extensions imported from Chrome (Phase 3) store a `.tandem-meta.json` with `cwsId`. The update checker must:

1. Scan all extensions in `~/.tandem/extensions/` for `.tandem-meta.json`
2. For extensions with `source: "chrome-import"`, use the `cwsId` for update checks
3. Treat them identically to CWS-installed extensions for update purposes
4. After updating an imported extension, update `.tandem-meta.json` with the new version

This ensures imported extensions don't become permanently stale.

### 9.3 Implement Atomic Update

The update process must be atomic — if anything fails, the old version stays intact.

**Update flow:**

1. Download new CRX to temp directory (`~/.tandem/extensions/.tmp/{id}/`)
2. **Verify CRX3 signature** (reuse `CrxDownloader.verifyCrx3Signature()`)
3. Extract to temp directory
4. **Verify integrity:**
   - `manifest.json` exists and is valid JSON
   - `manifest.json` contains `key` field
   - `manifest.version` is actually newer than installed version
5. **Unload old version:** `session.removeExtension(extensionId)`
6. **Swap directories:**
   - Rename current `~/.tandem/extensions/{id}/` to `~/.tandem/extensions/{id}.old/`
   - Move temp extraction to `~/.tandem/extensions/{id}/`
   - Delete `{id}.old/` on success
7. **Load new version:** `session.loadExtension(newPath, { allowFileAccess: true })`
8. **Verify ID:** confirm the loaded extension ID matches the expected ID
9. **Rollback on failure:** if load fails, restore from `{id}.old/`

**Clean up temp directory** after all updates complete (success or failure).

### 9.4 Update State Persistence

Store update state in `~/.tandem/extensions/update-state.json`:

```json
{
  "lastCheckTimestamp": "2026-02-25T14:30:00Z",
  "checkIntervalMs": 86400000,
  "extensions": {
    "cjpalhdlnbpafiamejdnhcphjbkeiagm": {
      "lastChecked": "2026-02-25T14:30:00Z",
      "installedVersion": "1.57.0",
      "latestKnownVersion": "1.58.0",
      "lastUpdateAttempt": "2026-02-25T14:31:00Z",
      "lastUpdateResult": "success"
    }
  }
}
```

- Load on startup
- Save after each check or update
- Use for skipping recently-checked extensions

### 9.5 Disk Space Management

Extensions vary from 100KB to 50MB+. With updates, temp directories, and `.old` rollback folders, `~/.tandem/extensions/` can grow significantly.

**Implementation:**

1. **Track disk usage:** Add a method `ExtensionManager.getDiskUsage(): { total: number, perExtension: Record<string, number> }`
2. **Clean up stale artifacts:**
   - Remove any `{id}.old/` directories left over from failed updates
   - Remove any `.tmp/` directories older than 1 hour
   - Run cleanup on startup and after each update cycle
3. **Warn on high usage:** If total extension storage exceeds 500MB, log a warning and include it in the update status endpoint
4. **API endpoint:** `GET /extensions/disk-usage` returns per-extension sizes and total

### 9.6 Scheduled Update Checks

Wire into `main.ts`:

- After `extensionManager.init()`, start a periodic timer
- Default interval: 24 hours (configurable via update-state.json `checkIntervalMs`)
- First check: 5 minutes after app launch (don't block startup)
- Check runs in background — does NOT block the UI or browsing
- Log results to console: `[UpdateChecker] 3 extensions checked, 1 update available (uBlock Origin 1.57.0 → 1.58.0)`

### 9.7 API Endpoints

Add to `src/api/server.ts`:

**`GET /extensions/updates/check`**

```typescript
// Triggers a manual update check for all installed extensions (uses batch protocol)
// Returns: {
//   checked: number,
//   updatesAvailable: UpdateCheckResult[],
//   lastCheck: string (ISO timestamp)
// }
```

**`GET /extensions/updates/status`**

```typescript
// Returns current update status without triggering a check
// Returns: {
//   lastCheck: string (ISO timestamp),
//   nextScheduledCheck: string (ISO timestamp),
//   checkIntervalMs: number,
//   extensions: Record<string, { installedVersion, latestKnownVersion, updateAvailable }>
// }
```

**`POST /extensions/updates/apply`**

```typescript
// Body: { extensionId?: string }  — specific extension, or omit for all
// Applies available updates (download + verify signature + atomic swap)
// Returns: UpdateResult[]
```

**`GET /extensions/disk-usage`**

```typescript
// Returns: {
//   totalBytes: number,
//   extensions: Array<{ id, name, sizeBytes }>
// }
```

### 9.8 UI Integration (coordinates with Phase 5a)

If Phase 5a is already completed, add to the Extensions settings panel:

- **Update indicator** on the "Installed" tab header: badge with count or available updates
- **Per-extension update badge:** "Update available: v1.57.0 → v1.58.0" with "Update" button
- **"Check for Updates" button** at the top or the Installed tab
- **"Update All" button** when multiple updates are available
- Loading states during update (download → verify → swap → reload)
- Success/error feedback per extension

If Phase 5a is not yet completed, skip the UI work — the API endpoints are sufficient for programmatic access. Document in STATUS.md that UI integration is deferred.

## Verification

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] **Version check uses batch update protocol** — single HTTP request for all extensions
- [ ] Version check detects that a newer version is available on CWS
- [ ] Version check correctly identifies when no update is available
- [ ] Fallback to CRX download works when update protocol fails
- [ ] Chrome-imported extensions (with `.tandem-meta.json`) included in update checks
- [ ] Update downloads, verifies CRX3 signature, extracts, and replaces old version atomically
- [ ] Extension is immediately active after update (no app restart)
- [ ] `manifest.json` `key` field preserved after update
- [ ] Extension ID unchanged after update (verified via log)
- [ ] Corrupt/invalid downloads are detected and not installed
- [ ] Failed update rolls back to the previous version
- [ ] Update state persisted to `~/.tandem/extensions/update-state.json`
- [ ] Scheduled check runs after configured interval
- [ ] Disk cleanup removes stale `.old/` and `.tmp/` directories
- [ ] `GET /extensions/updates/check` triggers batch check and returns results
- [ ] `GET /extensions/updates/status` returns last check time + available updates
- [ ] `POST /extensions/updates/apply` downloads and applies updates
- [ ] `POST /extensions/updates/apply` with specific extensionId updates only that one
- [ ] `GET /extensions/disk-usage` returns per-extension sizes
- [ ] Temp directory cleaned up after updates
- [ ] App launches, browsing works

## Scope

- ONLY implement update checking, downloading, and applying
- Do NOT modify the gallery or install flow — reuse existing CrxDownloader
- Do NOT add a remote update feed — use Google's update protocol + CWS CRX endpoint
- Do NOT add notification/push mechanisms — polling only
- Do NOT add auto-update without user awareness — always log what was updated

## After Completion

1. Update `docs/Browser-extensions/STATUS.md`
2. Update `docs/Browser-extensions/ROADMAP.md` — check off completed tasks
3. **Commit and push** — follow the commit format in CLAUDE.md "After You Finish" section
