# Context Menu Fixes — Claude Code Prompts

> **Bron:** Kees' audit rapport (`memory/tandem-context-menu-audit.md`)  
> **Aanpak:** 4 runs, van critical → low. Elke run is een zelfstandige prompt.  
> **Na elke run:** `npm run compile` + handmatig testen + commit

---

## Run 1 — Critical Fixes (C1, C2, C3)

### Prompt voor Claude Code:

```
Read these files first:
- src/context-menu/menu-builder.ts
- src/context-menu/manager.ts  
- src/tabs/manager.ts
- src/preload.ts

Fix these 3 critical bugs:

**BUG C1: Stale URL in "Duplicate Tab" (menu-builder.ts, buildTabContextMenu)**
The "Duplicate Tab" menu item reads `tab.url` at menu-build time, not at click time. If the user navigates between opening the menu and clicking "Duplicate Tab", it duplicates the old URL.
Fix: Inside the click handler, re-read the current URL from webContents:
```typescript
click: () => {
  const wc = webContents.fromId(tab.webContentsId);
  const currentUrl = (wc && !wc.isDestroyed()) ? wc.getURL() : tab.url;
  this.deps.tabManager.openTab(currentUrl);
},
```

**BUG C2: Unhandled promise rejection in batch tab close (menu-builder.ts, buildTabContextMenu)**
"Close Other Tabs" and "Close Tabs to Right" use `await this.deps.tabManager.closeTab(t.id)` in a for-of loop. If any closeTab call rejects (renderer crash, tab already removed), the loop aborts and remaining tabs stay open.
Fix: Wrap each closeTab in try/catch:
```typescript
click: async () => {
  for (const t of allTabs.filter(t => t.id !== tabId)) {
    try { await this.deps.tabManager.closeTab(t.id); } catch {}
  }
},
```
Apply the same pattern to "Close Tabs to Right".

**BUG C3: IPC listener memory leak in preload.ts**
Every `on*` function in preload.ts adds a listener via `ipcRenderer.on()` but never provides a way to remove it. If the renderer reinitializes (macOS reactivation, window recreation), listeners accumulate.
Fix: Change each `on*` function to return a cleanup function. Example:
```typescript
onKeesChatInject: (callback: (text: string) => void) => {
  const handler = (_event: any, text: string) => callback(text);
  ipcRenderer.on('kees-chat-inject', handler);
  return () => ipcRenderer.removeListener('kees-chat-inject', handler);
},
```
Apply this pattern to ALL `on*` functions in preload.ts (onCopilotAlert, onNavigated, onShortcut, onTabRegistered, onPanelToggle, onActivityEvent, onChatMessage, onDrawMode, onDrawClear, onScreenshotTaken, onVoiceToggle, onVoiceTranscript, onAutoSnapshotRequest, onKeesTyping, onApprovalRequest, onTabSourceChanged, onDownloadComplete, onOpenUrlInNewTab, onKeesChatInject, onBookmarkStatusChanged).

After all fixes: run `npm run compile` and fix any TypeScript errors.
Do NOT run `npm start` or `npm run dev`.
```

---

## Run 2 — High Priority + Dead Code (H1, H3, H4, K3, M1, M6)

### Prompt voor Claude Code:

```
Read these files first:
- src/context-menu/menu-builder.ts
- src/main.ts (only lines 580-720, the buildAppMenu function)
- CONTEXT-MENU-FIXES.md (for context on what we're fixing)

Fix these 6 issues:

**H1: Selection text not sanitized in "Ask Kees" items (menu-builder.ts, addTandemItems)**
The selectionText is injected directly into a template string:
`What can you tell me about this: "${text}"`
If the selection contains quotes, backticks, or special chars, this breaks the chat input.
Fix: Escape/strip the text before injection:
```typescript
const safeText = text.replace(/[\u0000-\u001f]/g, ' ').trim();
const truncatedForPrompt = safeText.length > 500 ? safeText.substring(0, 500) + '...' : safeText;
```
Apply to both "Ask Kees about Selection" and "Ask Kees about this Image".

**H3: Trailing/extra separators when sections are empty (menu-builder.ts, build method)**
When no link/image/media/selection items are added (plain right-click on empty space), the build() method calls addSeparator() before navigation items, producing a leading separator. The addSeparator helper prevents consecutive separators, but the first call on an empty menu adds nothing — however the SECOND addSeparator (between navigation and tools) can produce awkward spacing.
Fix: After building the full menu (before return), strip any trailing separator:
```typescript
// At end of build(), before return menu:
while (menu.items.length > 0 && menu.items[menu.items.length - 1].type === 'separator') {
  // Electron Menu doesn't have a pop method, so rebuild without trailing sep
  // Alternative: just accept it — Electron hides trailing separators automatically
}
```
Actually, Electron auto-hides trailing separators. The real issue is LEADING separators. Fix: change the first addSeparator call in build() to only fire if menu has non-separator items:
```typescript
if (menu.items.length > 0 && menu.items.some(i => i.type !== 'separator')) {
  this.addSeparator(menu);
}
```

**H4: "Duplicate Tab" on about:blank tabs (menu-builder.ts, buildTabContextMenu)**
`tab.url` can be empty or `about:blank` for unnavigated tabs. Duplicating these creates useless empty tabs.
Fix: Disable the "Duplicate Tab" item when url is empty or about:blank:
```typescript
menu.append(new MenuItem({
  label: 'Duplicate Tab',
  enabled: !!(currentUrl && currentUrl !== 'about:blank'),
  click: () => { ... },
}));
```

**K3: "Screenshot this Area" is dead code (menu-builder.ts, addTandemItems)**
The menu item sends 'start-screenshot-mode' to the renderer, but this IPC channel does not exist in preload.ts and has no listener in shell/index.html. The item does nothing when clicked.
Fix: Replace with the existing quickScreenshot functionality:
```typescript
menu.append(new MenuItem({
  label: 'Screenshot this Page',
  click: () => {
    this.deps.win.webContents.send('shortcut', 'quick-screenshot');
  },
}));
```
This uses the existing shortcut handler that triggers `window.tandem.quickScreenshot()`.

**M1: handleSaveAs saveType is always HTMLComplete (menu-builder.ts)**
Both save dialog filters use extension `.html`, so the condition `filePath.endsWith('.html')` is always true.
Fix: Change the second filter to use `.htm`:
```typescript
filters: [
  { name: 'Web Page, Complete', extensions: ['html'] },
  { name: 'Web Page, HTML Only', extensions: ['htm'] },
],
```
And update the saveType check:
```typescript
const saveType = result.filePath.endsWith('.htm') ? 'HTMLOnly' : 'HTMLComplete';
```

**M6: Cmd+Shift+T (Reopen Closed Tab) not registered in app menu (main.ts, buildAppMenu)**
The accelerator `CmdOrCtrl+Shift+T` appears in the tab context menu as a hint, but is not bound in the app menu — so the keyboard shortcut doesn't actually work.
Fix: Add it to the File menu in buildAppMenu(), after "Close Tab":
```typescript
{ label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: () => send('reopen-closed-tab') },
```
Then add a handler in shell/index.html's shortcut listener that calls the appropriate tab reopen logic, OR handle it in main.ts by calling tabManager.reopenClosedTab() directly. The simpler approach:
```typescript
{ label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: () => {
  tabManager?.reopenClosedTab();
}},
```

After all fixes: run `npm run compile` and fix any TypeScript errors.
Do NOT run `npm start` or `npm run dev`.
```

---

## Run 3 — Kees Integration Fixes (K1, K2, K4)

### Prompt voor Claude Code:

```
Read these files first:
- src/context-menu/menu-builder.ts (addTandemItems method)
- src/panel/manager.ts
- src/api/server.ts (search for "/chat" route and "page-content" route)
- shell/index.html (search for "onKeesChatInject" and "chat-send")

This run improves the Kees AI integration in the context menu. Kees is an AI copilot that communicates via the Tandem API at localhost:8765.

**K2: "Summarize Page with Kees" sends no page content**
Currently, clicking "Summarize Page with Kees" injects the text "Please summarize the current page for me." into the chat. But Kees (the AI on the other end of the /chat API) has no way to know what page the user is viewing unless he separately calls /page-content.

Fix: When "Summarize Page with Kees" is clicked, extract a content excerpt from the webContents and include it in the chat message:
```typescript
menu.append(new MenuItem({
  label: 'Summarize Page with Kees',
  click: async () => {
    if (wc.isDestroyed()) return;
    this.deps.panelManager.togglePanel(true);
    
    // Extract page excerpt for context
    let excerpt = '';
    try {
      excerpt = await wc.executeJavaScript(`
        (() => {
          const title = document.title || '';
          const body = document.body?.innerText || '';
          const trimmed = body.substring(0, 2000);
          return title + '\\n\\n' + trimmed;
        })()
      `);
    } catch {}
    
    const prompt = excerpt 
      ? 'Please summarize this page:\\n\\n' + excerpt
      : 'Please summarize the current page for me.';
    
    this.deps.win.webContents.send('kees-chat-inject', prompt);
  },
}));
```

**K4: Add "Let Kees handle this tab" to tab context menu**
In buildTabContextMenu(), add a new item that marks a tab as kees-controlled. This tells the UI to show a 🧀 indicator and lets Kees know he should monitor this tab.

Add after the "Mute Tab" item, before the separator:
```typescript
const currentSource = this.deps.tabManager.getTabSource(tabId);
menu.append(new MenuItem({
  label: currentSource === 'kees' ? 'Take back from Kees' : 'Let Kees handle this tab',
  click: () => {
    const newSource = this.deps.tabManager.getTabSource(tabId) === 'kees' ? 'robin' : 'kees';
    this.deps.tabManager.setTabSource(tabId, newSource);
  },
}));
```

**K1: Verify and improve chat flow from context menu to API**
Check if the chat flow works end-to-end:
1. Context menu → kees-chat-inject IPC → renderer fills chat input → user presses Enter
2. Renderer sends 'chat-send' IPC → panelManager.addChatMessage('robin', text)
3. The message is saved in panelManager's chat history
4. Kees reads it via GET /chat API endpoint

Check the API server's /chat GET route. Make sure it calls panelManager.getMessages() or similar. If the route only returns messages but there's no way for Kees to know a NEW message arrived (no polling indicator, no webhook), add a simple field:
- In the GET /chat response, include a `hasNew` boolean or `lastMessageId` field so Kees can efficiently poll.

If the /chat GET endpoint already returns messages with IDs (which it likely does based on panelManager), this is already working and no code change is needed — just confirm it works.

After all fixes: run `npm run compile` and fix any TypeScript errors.
Do NOT run `npm start` or `npm run dev`.
```

---

## Run 4 — Polish & Remaining (H2, H5, M2, L4)

### Prompt voor Claude Code:

```
Read these files first:
- src/context-menu/menu-builder.ts
- src/config/manager.ts (check if there's a searchEngine or privacy config option)

Fix these remaining issues:

**H5: No rate limiting on context menu popup (menu-builder.ts or manager.ts)**
Rapid right-clicking builds a new Menu object each time, including BookmarkManager queries.
Fix: Add a simple debounce in ContextMenuManager.registerWebContents():
```typescript
// In the handler function, add at the top:
private lastPopupTime = 0;

// In the handler:
const now = Date.now();
if (now - this.lastPopupTime < 200) return; // debounce 200ms
this.lastPopupTime = now;
```
Add `lastPopupTime` as a class property on ContextMenuManager.

**M2: Search engine hardcoded to Google (menu-builder.ts)**
"Search Google for ..." always uses google.com. Add a configurable search engine.
Check if ConfigManager already has a searchEngine config field. If not, don't add one — just change the implementation to use a simple constant at the top of menu-builder.ts that can be easily changed later:
```typescript
const SEARCH_ENGINE = {
  name: 'Google',
  url: 'https://www.google.com/search?q=',
};
```
Use `SEARCH_ENGINE.name` in the label and `SEARCH_ENGINE.url` in the click handler.
Apply to both addSelectionItems() and addSearchItem().

**L4: "Pin Tab" missing from tab context menu**
The original plan (CONTEXT-MENU-PLAN.md) included "Pin Tab" but it was never implemented. Add it to buildTabContextMenu() after "Duplicate Tab".

This requires adding pin support to TabManager (src/tabs/manager.ts):
1. Add `pinned: boolean` to the Tab interface
2. Add `pinTab(tabId: string)` and `unpinTab(tabId: string)` methods
3. Pinned tabs should be listed first in listTabs()
4. Add the menu item:
```typescript
menu.append(new MenuItem({
  label: tab.pinned ? 'Unpin Tab' : 'Pin Tab',
  click: () => {
    const currentTab = this.deps.tabManager.getTab(tabId);
    if (currentTab?.pinned) {
      this.deps.tabManager.unpinTab(tabId);
    } else {
      this.deps.tabManager.pinTab(tabId);
    }
  },
}));
```
5. Notify renderer of pin state change via IPC so it can update the tab UI (smaller tab, no close button).

After all fixes: run `npm run compile` and fix any TypeScript errors.
Do NOT run `npm start` or `npm run dev`.
```

---

## Samenvatting

| Run | Fixes | Geschatte tijd | Risico |
|-----|-------|---------------|--------|
| **1** | C1, C2, C3 | 10-15 min | Laag — surgical fixes |
| **2** | H1, H3, H4, K3, M1, M6 | 15-20 min | Laag — isolated changes |
| **3** | K1, K2, K4 | 20-30 min | Medium — touches API flow |
| **4** | H5, M2, L4 | 20-25 min | Medium — Pin Tab is new feature |

**Na elke run:**
1. `npm run compile` — moet 0 errors geven
2. Handmatig testen (rechtermuisklik scenarios)
3. `git add -A && git commit -m "context-menu: fix [run nummer beschrijving]"`
4. `git push`

**Volgorde is belangrijk** — Run 1 eerst (critical safety), dan 2 (high + dead code), dan 3 (Kees integratie), dan 4 (polish).
