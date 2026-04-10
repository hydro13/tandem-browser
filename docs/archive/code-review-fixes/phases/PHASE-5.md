# Phase 5: Performance Fixes

> **Risk:** Medium | **Effort:** ~1-2 hours | **Dependencies:** Phase 1, 2, 3, 4

## Goal

Fix the synchronous `writeFileSync` that blocks the main thread on every page navigation, and fix the `getSessionWC()` side-effect that changes the active tab on read operations.

## Important Context

- `HistoryManager.save()` calls `fs.writeFileSync()` on every `recordVisit()` — which is called twice per page load (on `did-navigate` and `did-finish-load`)
- At 10,000 entries the JSON file is several MB — this blocks the Electron event loop
- `getSessionWC()` focuses a tab to make `getActiveWC()` work — this causes concurrent API calls to interfere
- `better-sqlite3` is already a dependency — but migrating history to SQLite is out or scope. A debounced async write is sufficient for now.

## Fixes

### 5.1 Debounce HistoryManager.save()

**Review issue:** #15
**File:** `src/history/manager.ts`, lines 50-52

**Current code:**
```ts
private save(): void {
  fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2));
}
```

**Fix:** Replace with a debounced async write. Add a timer and a dirty flag:

```ts
private saveTimer: ReturnType<typeof setTimeout> | null = null;

private save(): void {
  // Debounce: wait 2 seconds after last change before writing
  if (this.saveTimer) clearTimeout(this.saveTimer);
  this.saveTimer = setTimeout(() => {
    this.saveTimer = null;
    try {
      fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2));
    } catch (e: any) {
      console.warn('[HistoryManager] Failed to save:', e.message);
    }
  }, 2000);
}
```

Also add a `destroy()` method to flush on app quit:

```ts
destroy(): void {
  if (this.saveTimer) {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2));
    } catch (e: any) {
      console.warn('[HistoryManager] Failed to save on destroy:', e.message);
    }
  }
}
```

Then wire the `destroy()` call into `main.ts`'s `will-quit` handler:
```ts
if (historyManager) historyManager.destroy();
```

**Note:** Check if `historyManager` is already in the `will-quit` handler. If not, add it. Also check if it's accessible from the `will-quit` scope — it may be created inside `startAPI()`. If so, hoist the variable declaration to module scope like other managers.

---

### 5.2 Fix getSessionWC() side-effect

**Review issue:** #17
**File:** `src/api/server.ts`, lines 276-288

**Current code:**
```ts
private async getSessionWC(req: Request): Promise<Electron.WebContents | null> {
  const sessionName = req.headers['x-session'] as string;
  if (!sessionName || sessionName === 'default') {
    return this.getActiveWC();
  }
  const partition = this.getSessionPartition(req);
  const tabs = this.tabManager.listTabs().filter(t => t.partition === partition);
  if (tabs.length === 0) return null;
  // Focus the first matching tab so getActiveWC works for subsequent calls
  await this.tabManager.focusTab(tabs[0].id);
  return this.getActiveWC();
}
```

**Fix:** Return the WebContents directly without focusing the tab:

```ts
private async getSessionWC(req: Request): Promise<Electron.WebContents | null> {
  const sessionName = req.headers['x-session'] as string;
  if (!sessionName || sessionName === 'default') {
    return this.getActiveWC();
  }
  const partition = this.getSessionPartition(req);
  const tabs = this.tabManager.listTabs().filter(t => t.partition === partition);
  if (tabs.length === 0) return null;
  // Return the WebContents directly without focusing (avoids concurrent request interference)
  const { webContents } = require('electron');
  return webContents.fromId(tabs[0].webContentsId) || null;
}
```

**Note:** Check how `Tab` objects store their webContentsId. The property name may be different (e.g., `wcId`, `webContentsId`). Read the Tab interface/type in `tabs/manager.ts` to find the correct property name.

If `webContents.fromId()` is not available or the Tab doesn't store a webContentsId, an alternative fix is:

```ts
const tab = tabs[0];
const wc = this.tabManager.getWebContents(tab.id);
return wc || null;
```

Check if `TabManager` has a method to get WebContents by tab ID. If not, the `focusTab` approach may need to stay but with a comment documenting the known concurrency issue. In that case, document the issue in STATUS.md notes.

---

## Verification Checklist

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] App launches with `npm start`
- [ ] Navigate 20+ pages rapidly — no visible UI freezes
- [ ] Wait 3 seconds after last navigation — `~/.tandem/history.json` is updated
- [ ] Close the app — history is saved (check file modification time)
- [ ] History search still returns correct results
- [ ] Session-aware API calls still work (if you have multiple sessions)
- [ ] Quit and relaunch — history is preserved
- [ ] All Phase 1+2+3+4 fixes still work

## Commit Message

```bash
git commit -m "$(cat <<'EOF'
fix(review): Phase 5 — performance fixes

- HistoryManager.save(): debounced (2s) to prevent main thread blocking
- HistoryManager.destroy(): flush on app quit
- getSessionWC(): return WebContents directly without focusing tab

Ref: docs/CODE-REVIEW-2026-02-26.md

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
git push origin main
```
