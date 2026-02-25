# Phase 9: Extension Auto-Updates

> **Priority:** MEDIUM | **Effort:** ~1 day | **Dependencies:** Phase 1, 2

## Goal

Automatically keep installed extensions up to date. Without this, extensions are frozen at the version installed — security fixes, API compatibility updates, and bug fixes never reach the user. Chrome checks for updates every few hours; Tandem must do the same.

## Why This Matters

- **Security vulnerabilities stay open** — if uBlock Origin or Bitwarden release a security fix, Tandem keeps running the old vulnerable version
- **Functionality degrades** — extensions that depend on external APIs (Grammarly, Honey, Wappalyzer) stop working when those APIs change
- **Compatibility breaks** — websites change their structure; content scripts that rely on specific selectors stop matching

## Files to Read

- `src/extensions/crx-downloader.ts` — CRX download + extraction logic (reuse for updates)
- `src/extensions/manager.ts` — ExtensionManager install/uninstall flow
- `src/extensions/loader.ts` — `session.loadExtension()` and `session.removeExtension()`

## Files to Create

- `src/extensions/update-checker.ts` — version comparison + update orchestration

## Files to Modify

- `src/extensions/manager.ts` — integrate update checker, expose update methods
- `src/api/server.ts` — add update API endpoints
- `src/main.ts` — schedule periodic update checks

## Tasks

### 9.1 Create Update Checker

Create `src/extensions/update-checker.ts`:

**`UpdateChecker` class:**
```typescript
export interface UpdateCheckResult {
  extensionId: string;
  name: string;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

export interface UpdateResult {
  extensionId: string;
  success: boolean;
  previousVersion: string;
  newVersion: string;
  error?: string;
}

export class UpdateChecker {
  constructor(private downloader: CrxDownloader)

  /** Check a single extension for available update */
  async checkOne(extensionId: string, currentVersion: string): Promise<UpdateCheckResult>

  /** Check all installed extensions */
  async checkAll(installed: InstalledExtension[]): Promise<UpdateCheckResult[]>

  /** Download and apply update for a single extension */
  async updateOne(extensionId: string, session: Session): Promise<UpdateResult>

  /** Update all extensions with available updates */
  async updateAll(session: Session): Promise<UpdateResult[]>
}
```

**Version check mechanism:**

To check if a newer version exists without downloading the full CRX:

1. Download the CRX from CWS (same URL as install) to a temp directory
2. Extract only the `manifest.json` from the CRX
3. Compare `manifest.version` with the locally installed version
4. Use semver-style comparison (split on `.`, compare numerically left to right)
5. If newer → flag as update available; if same or older → skip

**Note:** The CWS CRX endpoint does not support HEAD requests or version-only queries. The full CRX must be downloaded to check the version. To minimize bandwidth, keep the downloaded CRX if an update is available (don't re-download for the actual update).

### 9.2 Implement Atomic Update

The update process must be atomic — if anything fails, the old version stays intact.

**Update flow:**

1. Download new CRX to temp directory (`~/.tandem/extensions/.tmp/{id}/`)
2. Extract to temp directory
3. **Verify integrity:**
   - `manifest.json` exists and is valid JSON
   - `manifest.json` contains `key` field
   - `manifest.version` is actually newer than installed version
4. **Unload old version:** `session.removeExtension(extensionId)`
5. **Swap directories:**
   - Rename current `~/.tandem/extensions/{id}/` to `~/.tandem/extensions/{id}.old/`
   - Move temp extraction to `~/.tandem/extensions/{id}/`
   - Delete `{id}.old/` on success
6. **Load new version:** `session.loadExtension(newPath, { allowFileAccess: true })`
7. **Verify ID:** confirm the loaded extension ID matches the expected ID
8. **Rollback on failure:** if load fails, restore from `{id}.old/`

**Clean up temp directory** after all updates complete (success or failure).

### 9.3 Update State Persistence

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

### 9.4 Scheduled Update Checks

Wire into `main.ts`:

- After `extensionManager.init()`, start a periodic timer
- Default interval: 24 hours (configurable via update-state.json `checkIntervalMs`)
- First check: 5 minutes after app launch (don't block startup)
- Check runs in background — does NOT block the UI or browsing
- Log results to console: `[UpdateChecker] 3 extensions checked, 1 update available (uBlock Origin 1.57.0 → 1.58.0)`

### 9.5 API Endpoints

Add to `src/api/server.ts`:

**`GET /extensions/updates/check`**
```typescript
// Triggers a manual update check for all installed extensions
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
// Applies available updates
// Returns: UpdateResult[]
```

### 9.6 UI Integration (coordinates with Phase 5)

If Phase 5 is already completed, add to the Extensions settings panel:

- **Update indicator** on the "Installed" tab header: badge with count of available updates
- **Per-extension update badge:** "Update available: v1.57.0 → v1.58.0" with "Update" button
- **"Check for Updates" button** at the top of the Installed tab
- **"Update All" button** when multiple updates are available
- Loading states during update (download → verify → swap → reload)
- Success/error feedback per extension

If Phase 5 is not yet completed, skip the UI work — the API endpoints are sufficient for programmatic access. Document in STATUS.md that UI integration is deferred.

## Verification

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] Version check detects that a newer version is available on CWS
- [ ] Version check correctly identifies when no update is available
- [ ] Update downloads, extracts, and replaces the old version atomically
- [ ] Extension is immediately active after update (no app restart)
- [ ] `manifest.json` `key` field preserved after update
- [ ] Extension ID unchanged after update (verified via log)
- [ ] Corrupt/invalid downloads are detected and not installed
- [ ] Failed update rolls back to the previous version
- [ ] Update state persisted to `~/.tandem/extensions/update-state.json`
- [ ] Scheduled check runs after configured interval
- [ ] `GET /extensions/updates/check` triggers manual check and returns results
- [ ] `GET /extensions/updates/status` returns last check time + available updates
- [ ] `POST /extensions/updates/apply` downloads and applies updates
- [ ] `POST /extensions/updates/apply` with specific extensionId updates only that one
- [ ] Temp directory cleaned up after updates
- [ ] App launches, browsing works

## Scope

- ONLY implement update checking, downloading, and applying
- Do NOT modify the gallery or install flow — reuse existing CrxDownloader
- Do NOT add a remote update feed — use the same CWS CRX endpoint as the installer
- Do NOT add notification/push mechanisms — polling only
- Do NOT add auto-update without user awareness — always log what was updated

## After Completion

1. Update `docs/Browser-extensions/STATUS.md`
2. Update `docs/Browser-extensions/ROADMAP.md` — check off completed tasks
