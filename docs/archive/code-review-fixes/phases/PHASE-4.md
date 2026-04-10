# Phase 4: Init & Lifecycle Fixes

> **Risk:** Medium | **Effort:** ~1-2 hours | **Dependencies:** Phase 1, 2, 3

## Goal

Fix the macOS `activate` race condition, the `tab-register` IPC race, the RequestDispatcher `reattach` mid-flight problem, and the double-destroy or BehaviorObserver.

## Important Context

- These fixes touch the app initialization and lifecycle — test thoroughly on each fix
- The `activate` event only fires on macOS (dock icon click with no windows open)
- The IPC cleanup list in `startAPI()` (lines 424-431) is meant to prevent duplicate handlers on macOS reactivation — it must be kept in sync with all registered IPC channels
- The RequestDispatcher is the backbone or the network stack — all security, stealth, and network inspection hooks go through it

## Fixes

### 4.1 Fix macOS `activate` handler — await startAPI

**Review issue:** #12
**File:** `src/main.ts`, lines 939-946

**Current code:**
```ts
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().then(w => {
      startAPI(w);
      buildAppMenu();
    });
  }
});
```

**Fix:** Make the callback async and await startAPI:
```ts
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().then(async (w) => {
      await startAPI(w);
      buildAppMenu();
    });
  }
});
```

---

### 4.2 Complete the IPC cleanup list in startAPI

**Review issue:** #12 (related)
**File:** `src/main.ts`, lines 424-431

The `ipcHandlers` list at line 428 must include ALL channels registered with `ipcMain.handle()` in `startAPI()`. Read through the entire `startAPI` function and find every `ipcMain.handle(...)` call. Add any missing channel names to the `ipcHandlers` array.

Similarly, the `ipcChannels` list at line 424 must include ALL channels registered with `ipcMain.on(...)` in `startAPI()`. Read through and add any missing ones.

**How to verify:** Search `startAPI` for `ipcMain.handle('` and `ipcMain.on('` and cross-reference with the cleanup arrays.

---

### 4.3 Fix `tab-register` IPC race condition

**Review issue:** #13
**File:** `src/main.ts`, lines 448-462

The `tab-register` message may arrive before `tabManager` is initialized in `startAPI`.

**Fix:** Add a queue for early tab-register messages. Before `startAPI`, add:

```ts
let pendingTabRegister: { webContentsId: number; url: string } | null = null;
```

Then modify the `tab-register` handler to queue if tabManager is not ready:

```ts
ipcMain.on('tab-register', (_event, data: { webContentsId: number; url: string }) => {
  if (!tabManager) {
    pendingTabRegister = data;
    return;
  }
  if (tabManager.count === 0) {
    // ... existing registration logic ...
  }
});
```

And after `tabManager` is created in `startAPI`, process the pending message:

```ts
// After tabManager initialization:
if (pendingTabRegister && tabManager.count === 0) {
  const tab = tabManager.registerInitialTab(pendingTabRegister.webContentsId, pendingTabRegister.url);
  win.webContents.send('tab-registered', { tabId: tab.id });
  // ... same logic as the original handler ...
  pendingTabRegister = null;
}
```

**Important:** The `tab-register` IPC handler registration should be MOVED to before `createWindow()` in the `app.whenReady()` block, so it's always registered before the window loads. The handler body already guards with `if (!tabManager)`.

---

### 4.4 Fix RequestDispatcher reattach mid-flight

**Review issue:** #11
**File:** `src/network/dispatcher.ts`, lines 53-81, 88+

Currently, every `register*()` call triggers `reattach()` which replaces the Electron webRequest handler. In-flight requests lose their callback.

**Fix:** Change the approach so `reattach()` is NOT called on registration after initial `attach()`. The handler should read from the consumer arrays dynamically.

Option A (simplest — recommended): Remove the `if (this.attached) this.reattach();` lines from all `register*()` methods. The arrays are already read by reference in the handler closures set up by `attach()`. Since JavaScript arrays are passed by reference and `.sort()` mutates in place, the handlers installed by `reattach()` during `attach()` will automatically see newly added consumers.

But wait — the sort order matters. The consumers must be sorted by priority. Fix: sort the arrays at the START or each handler execution (in `reattach`'s closures), not at registration time. This way new consumers are picked up automatically AND sorted correctly.

Actually, the simplest correct fix:

1. In each `register*()` method, remove the `if (this.attached) this.reattach();` line
2. In `reattach()`, move the `.sort()` calls from the top into each handler callback (sort before iterating)

This means the handler closure always reads the latest consumer list and sorts it fresh on each request. Sorting a 3-5 element array is negligible cost.

**Modified `reattach()`:**
```ts
private reattach(): void {
  this.session.webRequest.onBeforeRequest((details, callback) => {
    this.beforeRequestConsumers.sort((a, b) => a.priority - b.priority);
    // ... rest or handler unchanged ...
  });
  // Same for onBeforeSendHeaders and onHeadersReceived
}
```

**Modified `register*()` methods:**
```ts
registerBeforeRequest(consumer: BeforeRequestConsumer): void {
  this.beforeRequestConsumers.push(consumer);
  // Removed: if (this.attached) this.reattach();
}
```

---

### 4.5 Fix BehaviorObserver double-destroy

**Review issue:** #8 (architecture review)
**File:** `src/main.ts`, around lines 258-261 and 952

`behaviorObserver.destroy()` is called in both `mainWindow.on('closed')` and `app.on('will-quit')`.

**Fix:** Set `behaviorObserver = null` after calling `destroy()` in the `closed` handler. The `will-quit` handler already guards with `if (behaviorObserver)`.

```ts
mainWindow.on('closed', () => {
  mainWindow = null;
  // ... other cleanup ...
  if (behaviorObserver) {
    behaviorObserver.destroy();
    behaviorObserver = null;
  }
  // ...
});
```

---

## Verification Checklist

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] App launches with `npm start`
- [ ] Browse to Google, GitHub — pages load, security and stealth still work
- [ ] Close all windows, click dock icon (macOS) — app recovers without crash
- [ ] Check console for "Attempted to register a second handler" errors — should be none
- [ ] Rapid page navigation — no hung requests (dispatcher fix)
- [ ] Tab Cmd+1 focuses correct tab (tab-register fix)
- [ ] All Phase 1+2+3 fixes still work

## Commit Message

```bash
git commit -m "$(cat <<'EOF'
fix(review): Phase 4 — init & lifecycle fixes

- macOS activate: await startAPI before buildAppMenu
- Complete IPC cleanup list to prevent duplicate handler crashes
- Queue tab-register IPC when tabManager not yet initialized
- RequestDispatcher: stop reattaching on registration (sort dynamically)
- BehaviorObserver: null after destroy to prevent double-destroy

Ref: docs/CODE-REVIEW-2026-02-26.md

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
git push origin main
```
