# CDP Auto-Attach Fix

## Problem
CDP only attaches when Kees makes an API call (lazy). It should auto-attach:
1. On startup after the first page loads
2. On every tab switch

Without this, Copilot Vision bindings (scroll, selection, form) don't work until Kees manually triggers a DevTools API call.

## Current State
- `main.ts` has `devToolsManager?.ensureAttached().catch(() => {})` in the tab-focus handler (line ~539)
- But it's not working — after tab switch, `devtools/status` still shows the OLD tab

## Root Cause
The `ensureAttached()` method gets the active tab from `TabManager.getActiveWebContents()`. But when called from the tab-focus IPC handler, the active tab may not have updated yet in TabManager. There's a race condition.

## Fix

### Step 1: Auto-attach on startup

File: `src/main.ts`

After the app is ready and the first page has loaded, trigger CDP attach. Find the `did-finish-load` or `ready-to-show` event for the main window/webview and add:

```typescript
// After first page load — auto-attach CDP for Copilot Vision
setTimeout(() => {
  devToolsManager?.ensureAttached().catch(() => {});
}, 2000); // Small delay to ensure webview is fully ready
```

Place this after the window is created and the first webview is set up. The 2 second delay ensures the webview has finished initializing.

### Step 2: Fix tab-switch re-attach timing

File: `src/main.ts`

In the `tab-focus` IPC handler, the `ensureAttached()` call fires before TabManager has updated its internal active tab. Add a small delay:

Find the existing code (around line 539):
```typescript
// Ensure CDP is attached to the new active tab for Copilot Vision
devToolsManager?.ensureAttached().catch(() => {});
```

Replace with:
```typescript
// Ensure CDP is attached to the new active tab for Copilot Vision
// Small delay to let TabManager update its active tab first
setTimeout(() => {
  devToolsManager?.ensureAttached().catch(() => {});
}, 500);
```

### Step 3: Alternative — pass webContents directly

If the timing fix above is flaky, a more robust approach: pass the tab's webContents ID directly to DevToolsManager instead of relying on "get active tab".

File: `src/devtools/manager.ts`

Add a method:
```typescript
async attachToTab(wcId: number): Promise<WebContents | null> {
  const wc = webContents.fromId(wcId);
  if (!wc || wc.isDestroyed()) return null;

  // Already attached to this one
  if (this.attached && this.attachedWcId === wcId) return wc;

  // Detach from old
  if (this.attached) this.detach();

  // Attach to new
  try {
    wc.debugger.attach('1.3');
  } catch (e: any) {
    if (!e.message?.includes('Already attached')) {
      console.warn('⚠️ CDP attach failed:', e.message);
      return null;
    }
  }

  this.attached = true;
  this.attachedWcId = wc.id;

  // Set up event listener
  wc.debugger.on('message', (_event: Electron.Event, method: string, params: any) => {
    this.handleCDPEvent(method, params);
  });

  wc.debugger.on('detach', (_event: Electron.Event, reason: string) => {
    console.log(`🔌 CDP detached: ${reason}`);
    this.attached = false;
    this.attachedWcId = null;
    this.consoleCapture.reset();
  });

  // Enable domains + install bindings
  try {
    await this.consoleCapture.enable(wc, this.findTabId(wc));
    await wc.debugger.sendCommand('Network.enable', {
      maxPostDataSize: 65536,
      maxResourceBufferSize: 10000000,
      maxTotalBufferSize: 50000000,
    });
    await wc.debugger.sendCommand('DOM.enable');
    await wc.debugger.sendCommand('Page.enable');
  } catch (e: any) {
    console.warn('⚠️ CDP domain enable partially failed:', e.message);
  }

  await this.installCopilotBindings(wc);
  return wc;
}
```

**IMPORTANT:** This duplicates some logic from `ensureAttached()`. To keep it DRY, refactor the shared attach logic into a private `doAttach(wc: WebContents)` method that both `ensureAttached()` and `attachToTab()` call. Don't duplicate the event listener setup — that causes memory leaks.

Then in `main.ts`, the tab-focus handler becomes:

```typescript
ipcMain.handle('tab-focus', async (_event, tabId: string) => {
  // ... existing tab focus logic ...
  
  // Get the webContents ID for this tab from TabManager
  const tab = tabManager.getTab(tabId);
  if (tab?.webContentsId) {
    devToolsManager?.attachToTab(tab.webContentsId).catch(() => {});
  }
});
```

And for startup:
```typescript
// After first webview is created:
mainWebview.addEventListener('did-finish-load', () => {
  const wcId = mainWebview.getWebContentsId();
  if (wcId) {
    devToolsManager?.attachToTab(wcId).catch(() => {});
  }
}, { once: true });
```

## Preferred Approach

Use Step 3 (pass webContents directly). It's more robust than timing hacks with setTimeout. The refactor into a shared `doAttach()` keeps it DRY.

## Files to Modify

| File | Change |
|------|--------|
| `src/devtools/manager.ts` | Add `attachToTab(wcId)` method. Refactor shared attach logic into private `doAttach(wc)`. |
| `src/main.ts` | Tab-focus handler: call `attachToTab(wcId)` with the focused tab's webContentsId. Startup: call `attachToTab()` after first page load. |

## Testing

1. Start Tandem — CDP should auto-attach (check `curl http://127.0.0.1:8765/devtools/status`)
2. Select text on the first page — should appear in activity-log
3. Open new tab, navigate somewhere — CDP should re-attach
4. Select text on the new tab — should appear in activity-log
5. Switch back to first tab — CDP should re-attach again
6. `devtools/status` should always show the currently active tab
