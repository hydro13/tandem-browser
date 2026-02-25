# Phase 5b: Extension Toolbar + Action Popup UI

> **Priority:** HIGH | **Effort:** ~1 day | **Dependencies:** Phase 1, 2, 5a

## Goal

Add the browser extension toolbar to Tandem's UI so users can interact with their installed extensions. Without this, extensions are installed but **invisible** — users have no way to open extension popups, see badge counts, or access extension actions. This is the difference between "extensions work" and "extensions are usable."

## Background

Chrome extensions define their UI via the `action` (MV3) or `browser_action`/`page_action` (MV2) manifest keys. These provide:
- **Popup:** An HTML page shown when the user clicks the extension icon
- **Icon:** The toolbar icon (16x16, 32x32, 48x48, 128x128)
- **Badge:** A small text overlay on the icon (e.g. uBlock showing blocked count)
- **Title:** Tooltip shown on hover

Electron's `session.loadExtension()` makes this data available via the `Extension` object returned. The popup HTML is accessible at `chrome-extension://{id}/{popup_path}`. Tandem needs to render this in its own UI since there is no native Chrome toolbar.

## Files to Read

- `src/extensions/loader.ts` — ExtensionLoader, understand `session.loadExtension()` return value
- `src/extensions/manager.ts` — ExtensionManager, list of loaded extensions
- `shell/index.html` — main shell UI, understand where toolbar should be placed
- Electron docs: `session.loadExtension()`, `Extension` object, `BrowserWindow.addExtension()`
- `src/main.ts` — understand how the shell BrowserWindow is set up

## Files to Create

- `src/extensions/toolbar.ts` — extension toolbar state management (main process)

## Files to Modify

- `shell/index.html` — add extension toolbar area to the browser UI
- `src/preload.ts` — expose extension toolbar IPC methods
- `src/main.ts` — wire up toolbar IPC handlers
- `src/api/server.ts` — add toolbar-related endpoints

## Tasks

### 5b.1 Extension Toolbar State Manager

Create `src/extensions/toolbar.ts` in the main process:

**`ExtensionToolbar` class:**
```typescript
export interface ToolbarExtension {
  id: string;
  name: string;
  icon: string;           // Path to the best-resolution icon
  popupUrl: string | null; // chrome-extension://{id}/{popup} or null
  badgeText: string;
  badgeColor: string;
  title: string;           // Tooltip
  enabled: boolean;
}

export class ExtensionToolbar {
  constructor(private extensionManager: ExtensionManager)

  /** Get all extensions that have a toolbar action */
  getToolbarExtensions(): ToolbarExtension[]

  /** Get popup URL for a specific extension */
  getPopupUrl(extensionId: string): string | null

  /** Read extension icon as base64 data URI for rendering in the shell */
  getIconDataUri(extensionId: string): string | null
}
```

**Reading extension toolbar data from manifest:**
```typescript
// MV3: manifest.action
// MV2: manifest.browser_action || manifest.page_action
const action = manifest.action || manifest.browser_action || manifest.page_action;
if (action) {
  popupUrl = action.default_popup ? `chrome-extension://${id}/${action.default_popup}` : null;
  icon = action.default_icon; // Can be string or { "16": "...", "32": "...", ... }
  title = action.default_title || manifest.name;
}
```

### 5b.2 Extension Popup Rendering

Extension popups are HTML pages that need to run in the extension's context (with access to `chrome.*` APIs). They must be rendered in a way that preserves this context.

**Approach: BrowserView/webContents for popups**

When the user clicks an extension icon:
1. Create a small popup `BrowserWindow` (or use a `<webview>` in the shell) at a fixed position below the toolbar icon
2. Navigate it to the popup URL: `chrome-extension://{id}/{popup_path}`
3. The popup inherits the extension's session (`persist:tandem`) and has full `chrome.*` API access
4. Size the popup based on the popup HTML's content (Chrome extensions specify popup dimensions via CSS)
5. Close the popup when the user clicks outside it or presses Escape

**Popup sizing:**
- Default: 400px wide x 500px tall (Chrome's default max)
- Constrain to reasonable bounds: min 200x100, max 800x600
- Let the popup content determine the actual size via `did-finish-load` + `executeJavaScript('document.body.scrollHeight')`

**IPC flow:**
```
Shell clicks extension icon → IPC 'extension-popup-open' → main creates popup window/view → popup loads chrome-extension:// URL → popup renders → user interacts → shell clicks elsewhere → IPC 'extension-popup-close' → main closes popup
```

### 5b.3 Toolbar UI in Shell

Add the extension toolbar to `shell/index.html`:

**Placement:** Right side of the URL bar / navigation area, before the settings button. This matches Chrome's toolbar layout.

**Per-extension button:**
- Extension icon (16x16 or 32x32, read from manifest)
- Badge overlay (small text, colored background) — positioned bottom-right of the icon
- Tooltip on hover showing extension name
- Click → open popup (or send action click if no popup)
- Right-click → context menu: "Options" (if extension has options page), "Remove extension"

**Overflow:** If more than ~6 extensions are loaded, show a "puzzle piece" overflow icon that opens a dropdown with all extensions (matching Chrome's behavior).

**Dynamic updates:** The toolbar must react to:
- Extensions being installed/uninstalled (refresh toolbar)
- Badge text/color changes (extensions update badges at runtime via `chrome.action.setBadgeText()`)

### 5b.4 Badge Update System

Extensions update their badge text dynamically (e.g., uBlock shows blocked request count per page). Electron fires events when extensions change their badge:

**Listen for badge updates in main process:**
```typescript
// Electron exposes extension action updates
session.on('extension-action-updated', (event, extensionId) => {
  // Get updated badge info
  const ext = session.getExtension(extensionId);
  // Send to shell via IPC
  mainWindow.webContents.send('extension-badge-update', {
    extensionId,
    badgeText: '...',
    badgeColor: '...',
  });
});
```

**Note:** The exact Electron API for badge updates may vary. Check the Electron 40 docs for `session` extension events. If no direct event exists, poll loaded extensions periodically (every 2s) to check for badge changes — not ideal but functional.

### 5b.5 Extension Context Menu

Right-clicking an extension icon in the toolbar should show:
- **Extension name** (disabled, just a label)
- **Options** → opens the extension's options page (if `manifest.options_page` or `manifest.options_ui` exists) in a new Tandem tab
- **Remove from Tandem** → calls `DELETE /extensions/uninstall/:id` with confirmation dialog
- **Pin/Unpin** → toggles whether the extension shows in the main toolbar or only in the overflow dropdown

Pin state should be persisted in `~/.tandem/extensions/toolbar-state.json`:
```json
{
  "pinned": ["cjpalhdlnbpafiamejdnhcphjbkeiagm", "eimadpbcbfnmbkopoojfekhnkhdbieeh"],
  "order": ["cjpalhdlnbpafiamejdnhcphjbkeiagm", "nngceckbapebfimnlniiiahkandclblb", "eimadpbcbfnmbkopoojfekhnkhdbieeh"]
}
```

### 5b.6 Preload + IPC Wiring

Add to `src/preload.ts`:
```typescript
// Extension toolbar
tandem.getToolbarExtensions: () => ipcRenderer.invoke('extension-toolbar-list'),
tandem.openExtensionPopup: (extensionId: string) => ipcRenderer.invoke('extension-popup-open', extensionId),
tandem.closeExtensionPopup: () => ipcRenderer.invoke('extension-popup-close'),
tandem.pinExtension: (extensionId: string, pinned: boolean) => ipcRenderer.invoke('extension-pin', extensionId, pinned),
tandem.showExtensionOptions: (extensionId: string) => ipcRenderer.invoke('extension-options', extensionId),
```

Add listeners in shell:
```typescript
tandem.onExtensionBadgeUpdate((data) => { /* update badge in toolbar */ })
tandem.onExtensionInstalled((data) => { /* refresh toolbar */ })
tandem.onExtensionUninstalled((data) => { /* refresh toolbar */ })
```

## Verification

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] Extension toolbar visible in browser UI (right side of URL bar area)
- [ ] Loaded extensions with `action`/`browser_action` show icons in toolbar
- [ ] Clicking extension icon opens popup HTML correctly
- [ ] Popup has full `chrome.*` API access (test: uBlock popup shows stats)
- [ ] Popup closes when clicking outside or pressing Escape
- [ ] Badge text updates dynamically (test: uBlock shows blocked count on page load)
- [ ] Right-click context menu shows Options and Remove
- [ ] Options page opens in new Tandem tab
- [ ] Remove from context menu triggers uninstall flow
- [ ] Pin/unpin works and state persists across restarts
- [ ] Overflow dropdown shows when >6 extensions installed
- [ ] Extensions without a popup (pure background) show icon but click has no popup
- [ ] Toolbar refreshes when extensions are installed/uninstalled via settings panel
- [ ] App launches, browsing works

## Scope

- ONLY implement the toolbar UI and popup rendering
- Do NOT modify the settings panel — that was Phase 5a
- Do NOT change extension loading behavior
- Do NOT implement new Chrome API polyfills
- The toolbar is purely a rendering layer on top of already-loaded extensions

## After Completion

1. Update `docs/Browser-extensions/STATUS.md`
2. Update `docs/Browser-extensions/ROADMAP.md` — check off completed tasks
3. **Commit and push** — follow the commit format in CLAUDE.md "After You Finish" section
