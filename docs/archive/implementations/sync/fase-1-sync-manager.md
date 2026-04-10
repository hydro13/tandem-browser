# SyncManager — Phase 1: Cross-Device Sync Foundation

| Phase | Title | Status | Commit |
|-------|-------|--------|--------|
| 1 | SyncManager + API + UI | ✅ done | — |

## Overview

SyncManager enables cross-device sync for Tandem Browser by writing and reading
data to/from a shared folder (Google Drive, iCloud, Dropbox, or any local path).

## Architecture

### Sync folder structure

```
{syncRoot}/
├── devices/
│   ├── {hostname}/
│   │   ├── tabs.json      (open tabs, updated live with 2s debounce)
│   │   └── history.json   (last 90 days)
│   └── other-device/
│       ├── tabs.json
│       └── history.json
└── shared/
    ├── workspaces.json
    ├── bookmarks.json     (future)
    ├── settings.json      (future)
    └── pinboards/         (future)
```

### Config

Added `deviceSync` field to `TandemConfig` (in `src/config/manager.ts`):

```typescript
deviceSync: {
  enabled: boolean;      // default: false
  syncRoot: string;      // path to sync folder
  deviceName: string;    // default: os.hostname()
}
```

Note: The existing `sync` config key is for Chrome bookmark import.
`deviceSync` is the new cross-device sync config.

### Files created/modified

| File | Change |
|------|--------|
| `src/sync/manager.ts` | **New** — SyncManager class |
| `src/api/routes/sync.ts` | **New** — API endpoints |
| `src/config/manager.ts` | Added `deviceSync` to TandemConfig |
| `src/tabs/manager.ts` | Added `setSyncManager()` + debounced publish |
| `src/history/manager.ts` | Added `setSyncManager()` + publish after save |
| `src/workspaces/manager.ts` | Added `setSyncManager()` + publish after save |
| `src/registry.ts` | Added `syncManager` to ManagerRegistry |
| `src/main.ts` | SyncManager creation + wiring |
| `src/api/server.ts` | Registered sync routes |
| `src/api/tests/helpers.ts` | Added syncManager mock |
| `shell/index.html` | History panel + "Your Devices" section |
| `shell/css/main.css` | History panel + sync device styles |

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sync/status` | Sync status + discovered devices |
| GET | `/sync/devices` | Remote devices with their open tabs |
| POST | `/sync/config` | Update sync config (enable/disable, set path) |
| POST | `/sync/trigger` | Force publish tabs + history now |

### Key design decisions

1. **Atomic writes** — All sync file writes use temp + rename to prevent corruption
2. **Debounced tab publish** — 2 second debounce prevents excessive writes
3. **90-day history cap** — Only recent history is synced to keep files small
4. **Config key naming** — Used `deviceSync` to avoid conflict with existing `sync` (Chrome bookmarks)
5. **Graceful degradation** — All sync calls are guarded by `isConfigured()` checks

### How to enable

Via API:
```bash
curl -X POST http://localhost:8765/sync/config \
  -H "Authorization: Bearer $(cat ~/.tandem/api-token)" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "syncRoot": "/Users/you/Google Drive/My Drive/Tandem"}'
```

### Future work (Phase 2+)

- Settings UI for configuring sync folder
- Bidirectional workspace/bookmark sync (read shared data on startup)
- Conflict resolution for shared data
- Sync status indicator in the UI
