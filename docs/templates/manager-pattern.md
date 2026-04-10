# Manager Pattern — Standard Template

> Every manager in Tandem should follow this pattern. When creating a new
> manager or refactoring an existing one, use this as the reference.
>
> Existing managers may deviate slightly. That is OK for now, but new managers
> must follow this pattern, and existing managers should be aligned over time.

## Why This Matters

AI developers (Claude Code, Cursor, or any MCP-compatible agent) need to
predict how a manager works without reading every line. A consistent pattern
means the agent can reason about any manager after seeing one.

## The Pattern

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { tandemDir, ensureDir } from '../utils/paths';
import { createLogger } from '../utils/logger';
import type { BrowserWindow } from 'electron';
import type { SyncManager } from '../sync/manager';

const log = createLogger('YourFeatureManager');

// ─── Types ──────────────────────────────────────────────────────────

/** Exported so route files and MCP tools can use these types. */
export interface YourItem {
  id: string;
  name: string;
  createdAt: string;
  // ...
}

/** Internal storage shape. Not exported. */
interface YourStore {
  items: YourItem[];
  lastModified?: string;
}

// ─── Storage path ───────────────────────────────────────────────────

const STORAGE_PATH = tandemDir('your-feature.json');

// ─── Manager ────────────────────────────────────────────────────────

/**
 * YourFeatureManager — one sentence explaining what it does.
 *
 * Persistence: ~/.tandem/your-feature.json
 * API routes: src/api/routes/yourfeature.ts
 * MCP tools: src/mcp/tools/yourfeature.ts
 */
export class YourFeatureManager {

  // === 1. Private state ===

  private store: YourStore;
  private mainWindow: BrowserWindow | null = null;
  private syncManager: SyncManager | null = null;

  // === 2. Constructor — minimal, synchronous ===
  //
  // Do: store dependencies, load from disk.
  // Do NOT: do async work, set up timers, or call external services.

  constructor() {
    this.store = this.load();
  }

  // === 3. Dependency setters ===
  //
  // Called after construction when other managers are ready.
  // Always check for null before using injected dependencies.

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  setSyncManager(sm: SyncManager): void {
    this.syncManager = sm;
    this.mergeFromSync();
  }

  // === 4. Public methods — the API surface ===
  //
  // These are called by route handlers and MCP tools via ctx.yourManager.
  // Rules:
  // - Always return typed results, never `any`
  // - Call this.save() after mutations
  // - Log significant actions with log.info()
  // - Log errors with log.warn() or log.error()

  getAll(): YourItem[] {
    return this.store.items;
  }

  getById(id: string): YourItem | undefined {
    return this.store.items.find(i => i.id === id);
  }

  create(name: string): YourItem {
    const item: YourItem = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
    };
    this.store.items.push(item);
    this.save();
    log.info(`Created item: ${item.id}`);
    return item;
  }

  delete(id: string): boolean {
    const before = this.store.items.length;
    this.store.items = this.store.items.filter(i => i.id !== id);
    if (this.store.items.length < before) {
      this.save();
      return true;
    }
    return false;
  }

  // === 5. Sync integration (optional) ===
  //
  // Only implement if this manager's data should sync across devices.
  // Pattern: read shared file → compare timestamps → merge if newer.

  private mergeFromSync(): void {
    if (!this.syncManager?.isConfigured()) return;
    try {
      const shared = this.syncManager.readShared<YourStore>('your-feature.json');
      if (!shared) return;

      const localTime = this.store.lastModified
        ? new Date(this.store.lastModified).getTime() : 0;
      const sharedTime = shared.lastModified
        ? new Date(shared.lastModified).getTime() : 0;

      if (sharedTime > localTime) {
        this.store = shared;
        this.save();
        log.info('Merged from sync (newer version found)');
      }
    } catch (e) {
      log.warn('Sync merge failed:', e instanceof Error ? e.message : String(e));
    }
  }

  // === 6. Cleanup — called on app quit ===
  //
  // Optional. Only needed if the manager holds timers, file handles,
  // or other resources that need explicit teardown.

  destroy(): void {
    // Clear timers, close file handles, etc.
  }

  // === 7. Private I/O — file persistence ===
  //
  // Always use tandemDir() for paths. Always wrap in try/catch.
  // Save updates lastModified and writes sync if available.

  private load(): YourStore {
    try {
      if (fs.existsSync(STORAGE_PATH)) {
        return JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf-8'));
      }
    } catch (e) {
      log.warn('Failed to load store:', e instanceof Error ? e.message : String(e));
    }
    return { items: [] };
  }

  private save(): void {
    try {
      this.store.lastModified = new Date().toISOString();
      ensureDir(path.dirname(STORAGE_PATH));
      fs.writeFileSync(STORAGE_PATH, JSON.stringify(this.store, null, 2));

      // Write to sync if available
      if (this.syncManager?.isConfigured()) {
        this.syncManager.writeShared('your-feature.json', this.store);
      }
    } catch (e) {
      log.warn('Failed to save store:', e instanceof Error ? e.message : String(e));
    }
  }
}
```

## Section Order — Always Follow This

1. **Private state** — fields and maps
2. **Constructor** — minimal, synchronous, calls `this.load()`
3. **Dependency setters** — `setMainWindow()`, `setSyncManager()`, etc.
4. **Public methods** — the API surface (getAll, getById, create, update, delete)
5. **Sync integration** — `mergeFromSync()` (if applicable)
6. **Cleanup** — `destroy()` (if applicable)
7. **Private I/O** — `load()` and `save()`

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| File | `src/yourfeature/manager.ts` | `src/pinboards/manager.ts` |
| Class | `YourFeatureManager` | `PinboardManager` |
| Logger | `createLogger('YourFeatureManager')` | `createLogger('PinboardManager')` |
| Storage | `tandemDir('your-feature.json')` | `tandemDir('pinboards/')` |
| Types | Exported interfaces above the class | `export interface Pinboard {}` |

## Variations

### Manager that needs BrowserWindow in constructor

Some managers need the window reference immediately (e.g., TabManager for
webview management). In that case:

```typescript
constructor(win: BrowserWindow) {
  this.win = win;
  // ... load
}
```

### Manager with debounced saves

For high-frequency updates (tabs, history), debounce the save to avoid
writing to disk on every change:

```typescript
private saveTimer: ReturnType<typeof setTimeout> | null = null;

private scheduleSave(): void {
  if (this.saveTimer) clearTimeout(this.saveTimer);
  this.saveTimer = setTimeout(() => this.save(), 500);
}
```

Call `scheduleSave()` instead of `save()` in public methods. Always call
`save()` directly in `destroy()` to flush pending changes.

### Manager without persistence

Some managers are purely in-memory (e.g., DevToolsManager, SnapshotManager).
Skip the load/save section and the sync integration.

## Error Handling — Standard Pattern

Always use this pattern in both load and save:

```typescript
catch (e) {
  log.warn('Description:', e instanceof Error ? e.message : String(e));
}
```

Never let file I/O errors crash the application. Log and continue with
defaults.

## Checklist for New Managers

- [ ] Types exported above the class
- [ ] JSDoc on the class with one-line description
- [ ] Constructor is synchronous, calls load()
- [ ] Public methods return typed results (no `any`)
- [ ] Mutations call save()
- [ ] Error handling uses the standard pattern
- [ ] Added to `src/registry.ts` with JSDoc comment
- [ ] Instantiated in `src/main.ts` or `src/bootstrap/`
- [ ] Cleanup registered in will-quit handler (if needed)
- [ ] Route file created in `src/api/routes/`
- [ ] MCP tool file created in `src/mcp/tools/`
