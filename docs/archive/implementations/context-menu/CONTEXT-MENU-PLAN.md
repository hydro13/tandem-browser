# Context Menu Implementatie Plan — Tandem Browser

> **Status:** COMPLETE
> **Last update:** 2026-02-18
> **Totaal fases:** 7

---

## Phase Voortgang

| Phase | Name | Status | Date completed |
|------|------|--------|----------------|
| 0 | Infrastructuur & Foundation | ✅ DONE | 2026-02-18 |
| 1 | Webpagina Basis Context Menu | ✅ DONE | 2026-02-18 |
| 2 | Link, Image & Selectie Menu | ✅ DONE | 2026-02-18 |
| 3 | Input/Tekstveld Context Menu | ✅ DONE | 2026-02-18 |
| 4 | Tab Context Menu | ✅ DONE | 2026-02-18 |
| 5 | Tandem-specific Items (Kees AI) | ✅ DONE | 2026-02-18 |
| 6 | Polish, Edge Cases & Integratie Tests | ✅ DONE | 2026-02-18 |

---

## Architecture Overview

### Hoe the works

Electron `<webview>` tags ondersteunen **no** direct `contextmenu` event in the renderer.
The juiste approach is:

1. **Main process** luistert to `context-menu` event op elke webview's `webContents`
2. Main process bouwt a `Menu` op basis or the context (link, image, selectie, input, etc.)
3. Main process shows the menu via `menu.popup()`
4. Menu item clicks sturen IPC berichten or voeren `webContents` methodes out

### Bestands Structuur

```
src/
  context-menu/
    manager.ts          ← Phase 0: ContextMenuManager class
    menu-builder.ts     ← Phase 0: Bouwt Menu items per context type
    types.ts            ← Phase 0: TypeScript interfaces
shell/
  index.html            ← Phase 4: Tab context menu (renderer-side)
```

### Key Referenties in Existing Code

| Wat | Waar | Regel |
|-----|------|-------|
| Webview creatie & `dom-ready` | `src/main.ts` | ~115-170 |
| IPC handlers registratie | `src/main.ts` | ~271-560 |
| `buildAppMenu()` | `src/main.ts` | ~586-704 |
| Manager init pattern | `src/main.ts` | ~76-109 |
| TabManager | `src/tabs/manager.ts` | Heel file |
| BookmarkManager | `src/bookmarks/manager.ts` | Heel file |
| HistoryManager | `src/history/manager.ts` | Heel file |
| Preload / contextBridge | `src/preload.ts` | Heel file |
| Tab UI & webview events | `shell/index.html` | ~1700-1950 |
| Cleanup pattern | `src/main.ts` | ~1080-1096 |

### IPC Kanalen (bestaand, relevant)

- `navigate` — navigeer actieve tab
- `tab-new` — open new tab
- `tab-close` — closes tab
- `tab-focus` — focus tab
- `go-back` / `go-forward` / `reload` — navigatie
- `bookmark-page` / `unbookmark-page` / `is-bookmarked` — bookmarks
- `get-page-content` — page HTML ophalen

---

## Phase 0: Infrastructuur & Foundation

### Goal
Creëer the basisstructuur for the context menu system zodat next fases er op voort can bouwen.

### Files about te maken

#### `src/context-menu/types.ts`
```typescript
export interface ContextMenuParams {
  // Electron's built-in params or context-menu event
  x: number;
  y: number;
  linkURL: string;
  linkText: string;
  srcURL: string;           // image/video/audio src
  mediaType: 'none' | 'image' | 'video' | 'audio' | 'canvas' | 'file' | 'plugin';
  hasImageContents: boolean;
  pageURL: string;
  frameURL: string;
  selectionText: string;
  isEditable: boolean;      // true = input/textarea/contenteditable
  editFlags: {
    canUndo: boolean;
    canRedo: boolean;
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canDelete: boolean;
    canSelectAll: boolean;
  };
  // Tandem-specifiek
  tabId?: string;
  tabSource?: 'robin' | 'kees';
}

export interface ContextMenuDeps {
  win: Electron.BrowserWindow;
  tabManager: any;          // TabManager instance
  bookmarkManager: any;     // BookmarkManager instance
  historyManager: any;      // HistoryManager instance
  panelManager: any;        // PanelManager (for "Ask Kees")
  downloadManager: any;     // DownloadManager instance
}
```

#### `src/context-menu/menu-builder.ts`
```typescript
import { Menu, MenuItem, clipboard, shell, BrowserWindow } from 'electron';
import { ContextMenuParams, ContextMenuDeps } from './types';

export class ContextMenuBuilder {
  private deps: ContextMenuDeps;

  constructor(deps: ContextMenuDeps) {
    this.deps = deps;
  }

  build(params: ContextMenuParams, webContents: Electron.WebContents): Menu {
    const menu = new Menu();

    // Phase 1: Basis items (back, forward, reload, etc.)
    // Phase 2: Link items, Image items, Selection items
    // Phase 3: Input/editable items
    // Phase 5: Tandem-specific items

    return menu;
  }

  // Helper: voeg separator toe only if menu not leeg is
  private addSeparator(menu: Menu): void {
    if (menu.items.length > 0) {
      menu.append(new MenuItem({ type: 'separator' }));
    }
  }
}
```

#### `src/context-menu/manager.ts`
```typescript
import { BrowserWindow, WebContents, app } from 'electron';
import { ContextMenuBuilder } from './menu-builder';
import { ContextMenuParams, ContextMenuDeps } from './types';

export class ContextMenuManager {
  private builder: ContextMenuBuilder;
  private deps: ContextMenuDeps;
  private registeredWebContents: Set<number> = new Set();

  constructor(deps: ContextMenuDeps) {
    this.deps = deps;
    this.builder = new ContextMenuBuilder(deps);
  }

  // Registreer context-menu for a webview's webContents
  registerWebContents(webContents: WebContents, tabId: string): void {
    const id = webContents.id;
    if (this.registeredWebContents.has(id)) return;
    this.registeredWebContents.add(id);

    webContents.on('context-menu', (_event, params) => {
      const menuParams: ContextMenuParams = {
        ...params,
        tabId,
        tabSource: this.deps.tabManager?.getTab(tabId)?.source,
      };
      const menu = this.builder.build(menuParams, webContents);
      if (menu.items.length > 0) {
        menu.popup({ window: this.deps.win });
      }
    });

    webContents.once('destroyed', () => {
      this.registeredWebContents.delete(id);
    });
  }

  destroy(): void {
    this.registeredWebContents.clear();
  }
}
```

### Integratie in `src/main.ts`

1. Import and initialiseer `ContextMenuManager` bij the andere managers (~regel 76-109)
2. In the webview `dom-ready` handler (~regel 115-170): roep `contextMenuManager.registerWebContents()` about
3. In `will-quit` cleanup (~regel 1080): roep `contextMenuManager.destroy()` about

### Verificatie Checks (Phase 0)

```bash
# 1. TypeScript compileert without errors
npm run compile

# 2. App start without crashes
npm start
# → Right-click op a webpagina must a leeg/no menu tonen (still no items)
# → Console mag no errors loggen

# 3. Bestandsstructuur correct
ls src/context-menu/
# Verwacht: manager.ts  menu-builder.ts  types.ts
```

### Wat te updaten na voltooiing
- Dit document: Phase 0 status → ✅ DONE + date
- `CONTEXT-MENU-PLAN.md` voortgangstabel at the top

---

## Phase 1: Webpagina Basis Context Menu

### Goal
The default rechtermuisklik-opties for a lege plek op a webpagina.

### Vereiste: Phase 0 must DONE are

### Items te implementeren

| # | Menu Item | Actie | Electron API |
|---|-----------|-------|-------------|
| 1 | ← Back | Navigeer terug | `webContents.goBack()` |
| 2 | → Forward | Navigeer vooruit | `webContents.goForward()` |
| 3 | ↻ Reload | Herlaad page | `webContents.reload()` |
| 4 | — | Separator | — |
| 5 | Save As... | Page save | `webContents.savePage()` or `dialog.showSaveDialog()` + download |
| 6 | Print... | Print page | `webContents.print()` |
| 7 | — | Separator | — |
| 8 | View Page Source | Bron bekijken | Open `view-source:${url}` in new tab |
| 9 | Inspect Element | DevTools openen | `webContents.inspectElement(x, y)` |

### Implementatie in `menu-builder.ts`

Voeg a `addPageItems()` methode toe:

```typescript
private addPageItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
  // Only show if there is NO link, NO image, NO selection, and NO editable field
  if (params.linkURL || params.mediaType !== 'none' || params.selectionText || params.isEditable) {
    return; // andere handlers nemen over
  }

  menu.append(new MenuItem({
    label: 'Back',
    enabled: wc.canGoBack(),
    click: () => wc.goBack(),
  }));
  menu.append(new MenuItem({
    label: 'Forward',
    enabled: wc.canGoForward(),
    click: () => wc.goForward(),
  }));
  menu.append(new MenuItem({
    label: 'Reload',
    click: () => wc.reload(),
  }));

  this.addSeparator(menu);

  menu.append(new MenuItem({
    label: 'Save As...',
    click: () => this.handleSaveAs(wc),
  }));
  menu.append(new MenuItem({
    label: 'Print...',
    click: () => wc.print(),
  }));

  this.addSeparator(menu);

  menu.append(new MenuItem({
    label: 'View Page Source',
    click: () => {
      const url = wc.getURL();
      this.deps.win.webContents.send('open-url-in-new-tab', `view-source:${url}`);
    },
  }));
  menu.append(new MenuItem({
    label: 'Inspect Element',
    click: () => wc.inspectElement(params.x, params.y),
  }));
}
```

### Belangrijk: `canGoBack()` / `canGoForward()` toegang

This methodes zitten op `webContents`. In the `context-menu` event handler heb you directe toegang tot the `webContents` or the webview — this works dus direct.

**Let op:** `webContents.canGoBack()` and `canGoForward()` bestaan op Electron's WebContents. Controleer or ze werken op webview webContents (ze zouden must in Electron 28).

### View Page Source: IPC to renderer

The renderer (`shell/index.html`) must a IPC listener hebben for `open-url-in-new-tab`. Dit exists already in the codebase — controleer that the works with `view-source:` prefix URL's.

### Verificatie Checks (Phase 1)

```bash
# 1. Compileer
npm run compile

# 2. Start app
npm start

# 3. Handmatige test checklist:
# □ Right-click op lege plek or a webpagina → menu appears
# □ "Back" is disabled if er no history is
# □ "Forward" is disabled if er no forward history is
# □ "Reload" herlaadt the page
# □ "Save As..." opens a save-dialoog
# □ "Print..." opens print dialoog
# □ "View Page Source" opens source in new tab
# □ "Inspect Element" opens DevTools op the juiste element
# □ Menu appears NIET if you op a link/image/selectie clicks (that komen in phase 2)
```

### Wat te updaten na voltooiing
- Dit document: Phase 1 status → ✅ DONE + date

---

## Phase 2: Link, Image & Selectie Context Menu

### Goal
Context-afhankelijke menu items for links, images, and geselecteerde text.

### Vereiste: Phase 1 must DONE are

### 2A: Link Items

| # | Menu Item | Conditie | Actie |
|---|-----------|----------|-------|
| 1 | Open Link in New Tab | `params.linkURL` aanwezig | IPC `tab-new` with URL |
| 2 | Copy Link Address | `params.linkURL` aanwezig | `clipboard.writeText(params.linkURL)` |
| 3 | Copy Link Text | `params.linkText` aanwezig | `clipboard.writeText(params.linkText)` |
| 4 | Save Link As... | `params.linkURL` aanwezig | `webContents.downloadURL(params.linkURL)` |
| 5 | Bookmark Link | `params.linkURL` aanwezig | `bookmarkManager.add(linkText, linkURL)` |

### 2B: Image Items

| # | Menu Item | Conditie | Actie |
|---|-----------|----------|-------|
| 1 | Open Image in New Tab | `mediaType === 'image'` | Open `params.srcURL` in new tab |
| 2 | Save Image As... | `mediaType === 'image'` | `webContents.downloadURL(params.srcURL)` |
| 3 | Copy Image | `mediaType === 'image'` | `webContents.copyImageAt(x, y)` |
| 4 | Copy Image Address | `mediaType === 'image'` | `clipboard.writeText(params.srcURL)` |

### 2C: Selectie Items

| # | Menu Item | Conditie | Actie |
|---|-----------|----------|-------|
| 1 | Copy | `params.selectionText` | `webContents.copy()` |
| 2 | Search Google for "..." | `params.selectionText` | Open Google search in new tab |
| 3 | — | Separator | — |
| 4 | (Phase 1 items) | Altijd | Back, Forward, Reload, etc. |

### Implementatie in `menu-builder.ts`

```typescript
private addLinkItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
  if (!params.linkURL) return;

  menu.append(new MenuItem({
    label: 'Open Link in New Tab',
    click: () => {
      this.deps.tabManager.openTab(params.linkURL);
    },
  }));
  menu.append(new MenuItem({
    label: 'Copy Link Address',
    click: () => clipboard.writeText(params.linkURL),
  }));
  menu.append(new MenuItem({
    label: 'Copy Link Text',
    enabled: !!params.linkText,
    click: () => clipboard.writeText(params.linkText),
  }));

  this.addSeparator(menu);

  menu.append(new MenuItem({
    label: 'Save Link As...',
    click: () => wc.downloadURL(params.linkURL),
  }));
  menu.append(new MenuItem({
    label: 'Bookmark Link',
    click: () => {
      this.deps.bookmarkManager?.add(params.linkText || params.linkURL, params.linkURL);
    },
  }));
}

private addImageItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
  if (params.mediaType !== 'image') return;

  menu.append(new MenuItem({
    label: 'Open Image in New Tab',
    click: () => {
      this.deps.tabManager.openTab(params.srcURL);
    },
  }));
  menu.append(new MenuItem({
    label: 'Save Image As...',
    click: () => wc.downloadURL(params.srcURL),
  }));
  menu.append(new MenuItem({
    label: 'Copy Image',
    click: () => wc.copyImageAt(params.x, params.y),
  }));
  menu.append(new MenuItem({
    label: 'Copy Image Address',
    click: () => clipboard.writeText(params.srcURL),
  }));
}

private addSelectionItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
  if (!params.selectionText) return;

  menu.append(new MenuItem({
    label: 'Copy',
    click: () => wc.copy(),
  }));

  const truncated = params.selectionText.length > 30
    ? params.selectionText.substring(0, 30) + '...'
    : params.selectionText;
  menu.append(new MenuItem({
    label: `Search Google for "${truncated}"`,
    click: () => {
      const query = encodeURIComponent(params.selectionText);
      this.deps.tabManager.openTab(`https://www.google.com/search?q=${query}`);
    },
  }));
}
```

### Build-order in `build()` methode

```typescript
build(params: ContextMenuParams, webContents: WebContents): Menu {
  const menu = new Menu();

  // Order is belangrijk: specifiek → algemeen
  this.addLinkItems(menu, params, webContents);
  this.addImageItems(menu, params, webContents);
  this.addSelectionItems(menu, params, webContents);

  // Separator for navigatie items if er already context items are
  if (menu.items.length > 0) {
    this.addSeparator(menu);
  }

  // Altijd navigatie items tonen (but if addPageItems checkt op
  // no link/image/selectie, must we that check aanpassen)
  this.addNavigationItems(menu, params, webContents); // Back/Forward/Reload
  this.addSeparator(menu);
  this.addToolItems(menu, params, webContents);        // Save/Print/Source/Inspect

  return menu;
}
```

**Belangrijk:** Refactor `addPageItems()` out Phase 1 to twee methodes:
- `addNavigationItems()` — Back, Forward, Reload (always visible)
- `addToolItems()` — Save, Print, View Source, Inspect (always visible)

### Combinatie-scenario's

Chrome shows multiple sections if a click op multiple contexten matcht:
- **Link with image:** Toon link items + image items + navigatie
- **Link with selectie:** Toon selectie items + link items + navigatie
- **Image with link:** `srcURL` + `linkURL` beide gevuld → toon beide sections

### Verificatie Checks (Phase 2)

```bash
npm run compile && npm start

# Test checklist:
# □ Right-click op a link → "Open Link in New Tab", "Copy Link Address", etc.
# □ "Open Link in New Tab" opens daadwerkelijk a new tab
# □ "Copy Link Address" kopieert URL to clipboard
# □ Right-click op image → "Save Image As...", "Copy Image", etc.
# □ "Open Image in New Tab" shows image in new tab
# □ "Copy Image" works (plak in a ander programma)
# □ Selecteer text → Right-click → "Copy" and "Search Google for ..."
# □ "Search Google" opens Google zoekresultaten in new tab
# □ Link + Image combo → beide sections visible
# □ Navigatie items (Back/Forward/Reload) still steeds visible onderaan
```

### Wat te updaten na voltooiing
- Dit document: Phase 2 status → ✅ DONE + date

---

## Phase 3: Input/Tekstveld Context Menu

### Goal
Volledige edit-functionaliteit for input velden, textareas, and contenteditable elementen.

### Vereiste: Phase 2 must DONE are

### Items te implementeren

| # | Menu Item | Conditie | Actie |
|---|-----------|----------|-------|
| 1 | Undo | `isEditable && editFlags.canUndo` | `webContents.undo()` |
| 2 | Redo | `isEditable && editFlags.canRedo` | `webContents.redo()` |
| 3 | — | Separator | — |
| 4 | Cut | `isEditable && editFlags.canCut` | `webContents.cut()` |
| 5 | Copy | `editFlags.canCopy` | `webContents.copy()` |
| 6 | Paste | `isEditable && editFlags.canPaste` | `webContents.paste()` |
| 7 | Paste as Plain Text | `isEditable && editFlags.canPaste` | `webContents.pasteAndMatchStyle()` |
| 8 | Delete | `isEditable && editFlags.canDelete` | `webContents.delete()` |
| 9 | — | Separator | — |
| 10 | Select All | `isEditable && editFlags.canSelectAll` | `webContents.selectAll()` |

### Implementatie

```typescript
private addEditableItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
  if (!params.isEditable) return;

  menu.append(new MenuItem({
    label: 'Undo',
    enabled: params.editFlags.canUndo,
    click: () => wc.undo(),
  }));
  menu.append(new MenuItem({
    label: 'Redo',
    enabled: params.editFlags.canRedo,
    click: () => wc.redo(),
  }));

  this.addSeparator(menu);

  menu.append(new MenuItem({
    label: 'Cut',
    enabled: params.editFlags.canCut,
    click: () => wc.cut(),
  }));
  menu.append(new MenuItem({
    label: 'Copy',
    enabled: params.editFlags.canCopy,
    click: () => wc.copy(),
  }));
  menu.append(new MenuItem({
    label: 'Paste',
    enabled: params.editFlags.canPaste,
    click: () => wc.paste(),
  }));
  menu.append(new MenuItem({
    label: 'Paste as Plain Text',
    enabled: params.editFlags.canPaste,
    click: () => wc.pasteAndMatchStyle(),
  }));
  menu.append(new MenuItem({
    label: 'Delete',
    enabled: params.editFlags.canDelete,
    click: () => wc.delete(),
  }));

  this.addSeparator(menu);

  menu.append(new MenuItem({
    label: 'Select All',
    enabled: params.editFlags.canSelectAll,
    click: () => wc.selectAll(),
  }));
}
```

### Build-order update

```typescript
build(params: ContextMenuParams, webContents: WebContents): Menu {
  const menu = new Menu();

  if (params.isEditable) {
    // Input context: edit items eerst, then optional selectie
    this.addEditableItems(menu, params, webContents);
    // If er also text geselecteerd is in the field:
    if (params.selectionText) {
      this.addSeparator(menu);
      this.addSearchItem(menu, params); // Only "Search Google" (copy zit already in editable)
    }
  } else {
    // Not-editable context
    this.addLinkItems(menu, params, webContents);
    this.addImageItems(menu, params, webContents);
    this.addSelectionItems(menu, params, webContents);
  }

  this.addSeparator(menu);
  this.addNavigationItems(menu, params, webContents);
  this.addSeparator(menu);
  this.addToolItems(menu, params, webContents);

  return menu;
}
```

### Verificatie Checks (Phase 3)

```bash
npm run compile && npm start

# Test checklist:
# □ Right-click in a tekstveld → Undo, Redo, Cut, Copy, Paste, etc. visible
# □ "Undo" is grayed out if er nothing te undo-and is
# □ "Cut" works — text disappears and staat op clipboard
# □ "Paste" plakt clipboard content in the field
# □ "Paste as Plain Text" plakt without opmaak
# □ "Select All" selecteert alle text in the field
# □ In a contenteditable div (bijv. Gmail composer): same behavior
# □ Text selecteren in input → "Search Google" is also beschikbaar
# □ Lege input (no selectie) → "Copy" and "Cut" are grayed out
```

### Wat te updaten na voltooiing
- Dit document: Phase 3 status → ✅ DONE + date

---

## Phase 4: Tab Context Menu

### Goal
Rechtermuisklik op a tab in the tab bar shows a context menu with tab-acties.

### Vereiste: Phase 3 must DONE are

### Verschil with Phase 0-3
Dit menu is **in the renderer** (shell/index.html) afgehandeld, not via webview `context-menu` event. The tab bar is onderdeel or the shell UI, not a webview.

**Approach:** Usage IPC to the menu in the main process te bouwen and te tonen. Dit is the Electron best-practice.

### Items te implementeren

| # | Menu Item | Actie |
|---|-----------|-------|
| 1 | New Tab | Open new tab |
| 2 | — | Separator |
| 3 | Reload Tab | Herlaad this tab |
| 4 | Duplicate Tab | Open the same URL in new tab |
| 5 | Pin Tab | Toggle pin status |
| 6 | Mute Tab | Toggle audio mute |
| 7 | — | Separator |
| 8 | Close Tab | Closes this tab |
| 9 | Close Other Tabs | Closes alle behalve this |
| 10 | Close Tabs to Right | Closes alle tabs rechts or this |
| 11 | — | Separator |
| 12 | Reopen Closed Tab | Herstel last closed tab |

### Implementatie

#### Step 1: New IPC kanaal `show-tab-context-menu`

In `src/main.ts` or in `ContextMenuManager`:

```typescript
ipcMain.handle('show-tab-context-menu', async (_event, tabId: string) => {
  const menu = this.buildTabContextMenu(tabId);
  menu.popup({ window: this.deps.win });
});
```

#### Step 2: `buildTabContextMenu()` in `menu-builder.ts`

```typescript
buildTabContextMenu(tabId: string, allTabs: Tab[]): Menu {
  const menu = new Menu();
  const tab = allTabs.find(t => t.id === tabId);
  if (!tab) return menu;

  const tabIndex = allTabs.indexOf(tab);

  menu.append(new MenuItem({
    label: 'New Tab',
    click: () => this.deps.tabManager.openTab(),
  }));

  this.addSeparator(menu);

  menu.append(new MenuItem({
    label: 'Reload Tab',
    click: () => {
      // Vind webContents or this tab and reload
      const wc = webContents.fromId(tab.webContentsId);
      if (wc) wc.reload();
    },
  }));
  menu.append(new MenuItem({
    label: 'Duplicate Tab',
    click: () => this.deps.tabManager.openTab(tab.url),
  }));
  menu.append(new MenuItem({
    label: 'Mute Tab',
    click: () => {
      const wc = webContents.fromId(tab.webContentsId);
      if (wc) wc.setAudioMuted(!wc.isAudioMuted());
    },
  }));

  this.addSeparator(menu);

  menu.append(new MenuItem({
    label: 'Close Tab',
    click: () => this.deps.tabManager.closeTab(tabId),
  }));
  menu.append(new MenuItem({
    label: 'Close Other Tabs',
    enabled: allTabs.length > 1,
    click: () => {
      allTabs.filter(t => t.id !== tabId).forEach(t => {
        this.deps.tabManager.closeTab(t.id);
      });
    },
  }));
  menu.append(new MenuItem({
    label: 'Close Tabs to Right',
    enabled: tabIndex < allTabs.length - 1,
    click: () => {
      allTabs.slice(tabIndex + 1).forEach(t => {
        this.deps.tabManager.closeTab(t.id);
      });
    },
  }));

  this.addSeparator(menu);

  menu.append(new MenuItem({
    label: 'Reopen Closed Tab',
    enabled: this.deps.tabManager.hasClosedTabs(),
    click: () => this.deps.tabManager.reopenClosedTab(),
  }));

  return menu;
}
```

#### Step 3: Recently Closed Tabs — TabManager uitbreiden

In `src/tabs/manager.ts`, voeg a `closedTabs` stack toe:

```typescript
private closedTabs: { url: string; title: string }[] = [];

closeTab(tabId: string): void {
  const tab = this.getTab(tabId);
  if (tab) {
    this.closedTabs.push({ url: tab.url, title: tab.title });
    // existing close logica...
  }
}

hasClosedTabs(): boolean {
  return this.closedTabs.length > 0;
}

reopenClosedTab(): void {
  const last = this.closedTabs.pop();
  if (last) this.openTab(last.url);
}
```

#### Step 4: Preload uitbreiden

In `src/preload.ts`, voeg toe:

```typescript
showTabContextMenu: (tabId: string) => ipcRenderer.invoke('show-tab-context-menu', tabId),
```

#### Stap 5: Renderer event listener

In `shell/index.html`, in the tab creatie code (~regel 1264-1270):

```javascript
tabEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.tandem.showTabContextMenu(tabId);
});
```

### Verificatie Checks (Phase 4)

```bash
npm run compile && npm start

# Test checklist:
# □ Right-click op a tab → context menu appears
# □ "New Tab" opens a new tab
# □ "Reload Tab" herlaadt the geklikte tab (not per se the actieve tab!)
# □ "Duplicate Tab" opens same URL in new tab
# □ "Mute Tab" mute the audio or that tab
# □ "Close Tab" closes the geklikte tab
# □ "Close Other Tabs" closes alle andere tabs
# □ "Close Tabs to Right" closes only tabs rechts or the geklikte
# □ "Reopen Closed Tab" heropent the laatst closed tab
# □ "Reopen Closed Tab" is grayed out if er no closed tabs are
# □ With but 1 tab open: "Close Other Tabs" is grayed out
# □ Op the meest rechtse tab: "Close Tabs to Right" is grayed out
```

### Wat te updaten na voltooiing
- Dit document: Phase 4 status → ✅ DONE + date

---

## Phase 5: Tandem-specific Items (Kees AI Integratie)

### Goal
Unieke context menu items that Tandem onderscheiden or Chrome: AI-integratie with Kees.

### Vereiste: Phase 4 must DONE are

### Items te implementeren

| # | Menu Item | Conditie | Actie |
|---|-----------|----------|-------|
| 1 | Ask Kees about this | Altijd | Stuur page-context to Kees panel |
| 2 | Ask Kees about selection | `selectionText` aanwezig | Stuur selectie to Kees chat |
| 3 | Ask Kees about this image | `mediaType === 'image'` | Screenshot + stuur to Kees |
| 4 | Summarize Page with Kees | Altijd | Question Kees to samenvatting |
| 5 | — | Separator | — |
| 6 | Screenshot Element | Altijd | Quick screenshot or element |
| 7 | Bookmark Page | Altijd (if not already bookmarked) | Bookmark huidige page |

### Implementatie

```typescript
private addTandemItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
  this.addSeparator(menu);

  // AI items — only if panel/chat beschikbaar is
  if (this.deps.panelManager) {
    if (params.selectionText) {
      menu.append(new MenuItem({
        label: 'Ask Kees about Selection',
        click: () => {
          const text = params.selectionText;
          // Open panel + stuur chat bericht
          this.deps.panelManager.openPanel();
          this.deps.win.webContents.send('kees-chat-inject',
            `What can you tell me about this: "${text}"`
          );
        },
      }));
    }

    if (params.mediaType === 'image') {
      menu.append(new MenuItem({
        label: 'Ask Kees about this Image',
        click: () => {
          this.deps.panelManager.openPanel();
          this.deps.win.webContents.send('kees-chat-inject',
            `Analyze this image: ${params.srcURL}`
          );
        },
      }));
    }

    menu.append(new MenuItem({
      label: 'Summarize Page with Kees',
      click: async () => {
        this.deps.panelManager.openPanel();
        this.deps.win.webContents.send('kees-chat-inject',
          'Please summarize the current page for me.'
        );
      },
    }));
  }

  this.addSeparator(menu);

  // Screenshot
  menu.append(new MenuItem({
    label: 'Screenshot this Area',
    click: () => {
      this.deps.win.webContents.send('start-screenshot-mode');
    },
  }));

  // Quick Bookmark
  const pageUrl = wc.getURL();
  const pageTitle = wc.getTitle();
  const isBookmarked = this.deps.bookmarkManager?.isBookmarked(pageUrl);
  menu.append(new MenuItem({
    label: isBookmarked ? 'Remove Bookmark' : 'Bookmark this Page',
    click: () => {
      if (isBookmarked) {
        this.deps.bookmarkManager?.removeByUrl(pageUrl);
      } else {
        this.deps.bookmarkManager?.add(pageTitle || pageUrl, pageUrl);
      }
      // Update bookmark star in toolbar
      this.deps.win.webContents.send('bookmark-status-changed', { url: pageUrl, bookmarked: !isBookmarked });
    },
  }));
}
```

### Benodigde IPC kanalen (new)

| Kanaal | Richting | Goal |
|--------|----------|------|
| `kees-chat-inject` | main → renderer | Inject a chat bericht in Kees panel |
| `start-screenshot-mode` | main → renderer | Activeer screenshot selectie modus |
| `bookmark-status-changed` | main → renderer | Update bookmark ster na toggle |

### Renderer Aanpassingen (`shell/index.html`)

Voeg listener toe for `kees-chat-inject`:

```javascript
window.tandem.on('kees-chat-inject', (text) => {
  // Open chat tab in panel
  // Vul chat input with text
  // Optioneel: auto-submit
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.value = text;
    chatInput.dispatchEvent(new Event('input'));
    // Auto submit
    document.getElementById('chat-send-btn')?.click();
  }
});
```

### Verificatie Checks (Phase 5)

```bash
npm run compile && npm start

# Test checklist:
# □ Right-click op page → "Summarize Page with Kees" visible
# □ Klikken opens Kees panel and stuurt samenvatting-question
# □ Selecteer text → Right-click → "Ask Kees about Selection" visible
# □ Klikken stuurt geselecteerde text to Kees chat
# □ Right-click op image → "Ask Kees about this Image" visible
# □ "Screenshot this Area" activeert screenshot modus
# □ "Bookmark this Page" toggelt bookmark status
# □ If page already bookmarked is: label shows "Remove Bookmark"
# □ Alle items werken together with the default menu items (no conflicten)
# □ Kees panel opens automatisch if the closed was
```

### Wat te updaten na voltooiing
- Dit document: Phase 5 status → ✅ DONE + date

---

## Phase 6: Polish, Edge Cases & Integratie Tests

### Goal
Alles netjes afwerken, edge cases afvangen, keyboard shortcuts add, and a fully testscript draaien.

### Vereiste: Phase 5 must DONE are

### 6A: Edge Cases & Polish

| # | Item | Description |
|---|------|-------------|
| 1 | Lege/error page's | Context menu op about:blank, tandem:// interne page's |
| 2 | PDF viewer | Context menu op PDF content (beperkte opties) |
| 3 | Multiple selecties | Multiple woorden, hele alinea's |
| 4 | Video/Audio elementen | Additionale media controls |
| 5 | Disabled items styling | Grayed-out items consistent |
| 6 | Menu positie | Menu appears not buiten scherm |
| 7 | Snel achter elkaar clicking | No dubbele menus |
| 8 | Keyboard shortcut hints | Toon accelerators in menu items |

### 6B: Keyboard Accelerator Hints

Voeg `accelerator` labels toe about menu items that also a keyboard shortcut hebben:

```typescript
new MenuItem({
  label: 'Copy',
  accelerator: 'CmdOrCtrl+C',  // Only if hint, not if extra binding
  click: () => wc.copy(),
})
```

### 6C: Media (Video/Audio) Items

```typescript
private addMediaItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
  if (params.mediaType === 'video' || params.mediaType === 'audio') {
    menu.append(new MenuItem({
      label: params.mediaType === 'video' ? 'Open Video in New Tab' : 'Open Audio in New Tab',
      click: () => this.deps.tabManager.openTab(params.srcURL),
    }));
    menu.append(new MenuItem({
      label: `Save ${params.mediaType === 'video' ? 'Video' : 'Audio'} As...`,
      click: () => wc.downloadURL(params.srcURL),
    }));
    menu.append(new MenuItem({
      label: `Copy ${params.mediaType === 'video' ? 'Video' : 'Audio'} Address`,
      click: () => clipboard.writeText(params.srcURL),
    }));
  }
}
```

### 6D: Interne Page's Afhandeling

```typescript
build(params: ContextMenuParams, webContents: WebContents): Menu {
  const menu = new Menu();
  const url = webContents.getURL();

  // Interne page's: only basisitems
  if (url.startsWith('file://') && url.includes('/shell/')) {
    this.addInternalPageItems(menu, params, webContents);
    return menu;
  }

  // Normale page's: full menu
  // ... (existing logica)
}

private addInternalPageItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
  // Only copy/paste for interne page's
  if (params.isEditable) {
    this.addEditableItems(menu, params, wc);
  } else if (params.selectionText) {
    menu.append(new MenuItem({
      label: 'Copy',
      click: () => wc.copy(),
    }));
  }
}
```

### 6E: Volledige Integratie Test Script

Maak `scripts/test-context-menu.md` — a handmatig testprotocol:

```markdown
# Context Menu Test Protocol

## Setup
1. Start Tandem: `npm start`
2. Open a testpagina with links, images, input velden
   Aanbevolen: https://www.w3schools.com/html/html_links.asp

## Test Cases

### TC1: Lege page-achtergrond
- [ ] Right-click op lege ruimte → menu with Back, Forward, Reload, etc.
- [ ] Back disabled if no history
- [ ] Forward disabled if no forward history
- [ ] Reload herlaadt page
- [ ] Save As opens dialoog
- [ ] Print opens print dialoog
- [ ] View Page Source opens source in tab
- [ ] Inspect opens DevTools op juiste locatie

### TC2: Links
- [ ] Right-click op link → link items at the top
- [ ] Open in New Tab works
- [ ] Copy Link Address → clipboard check
- [ ] Copy Link Text → clipboard check
- [ ] Bookmark Link voegt bookmark toe

### TC3: Images
- [ ] Right-click op img → image items
- [ ] Open Image in New Tab works
- [ ] Save Image As → download start
- [ ] Copy Image → plakbaar in ander programma
- [ ] Copy Image Address → clipboard check

### TC4: Text Selectie
- [ ] Selecteer text → right-click → Copy + Search Google
- [ ] Copy works
- [ ] Search Google opens zoekresultaten

### TC5: Input Velden
- [ ] Right-click in input → edit items
- [ ] Undo/Redo state correct
- [ ] Cut/Copy/Paste werken
- [ ] Paste as Plain Text works
- [ ] Select All works

### TC6: Tabs
- [ ] Right-click op tab → tab menu
- [ ] New Tab, Reload, Duplicate, Close werken
- [ ] Close Other Tabs works
- [ ] Reopen Closed Tab works

### TC7: Tandem/Kees
- [ ] Ask Kees items visible
- [ ] Panel opens bij click
- [ ] Chat bericht is verzonden
- [ ] Bookmark toggle works
- [ ] Screenshot modus activeert

### TC8: Edge Cases
- [ ] Right-click op newtab page → beperkt menu
- [ ] Right-click op settings page → beperkt menu
- [ ] Snel 3x rechtsklikken → no crashes
- [ ] Zeer lange selectie → "Search Google for ..." is truncated
- [ ] Link that also a image is → beide sections visible
```

### Verificatie Checks (Phase 6)

```bash
npm run compile && npm start

# Voer ALLE test cases out or scripts/test-context-menu.md
# Alle checkboxes must ✓ are
# No console errors
# No TypeScript warnings bij compilatie
```

### Wat te updaten na voltooiing
- Dit document: Phase 6 status → ✅ DONE + date
- Dit document: Bovenste tabel: alle fases ✅

---

## Appendix A: Snel-start for Claude Code Sessie

### Bij the starten or a new session, read always:

1. **Dit document** — `CONTEXT-MENU-PLAN.md` (check welke phase about the beurt is)
2. **Key files** per fase:

| Phase | Read eerst |
|------|-----------|
| 0 | `src/main.ts` (rules 76-170, 586-726, 1080-1096) |
| 1 | `src/context-menu/menu-builder.ts`, `src/main.ts` |
| 2 | `src/context-menu/menu-builder.ts`, `src/tabs/manager.ts`, `src/bookmarks/manager.ts` |
| 3 | `src/context-menu/menu-builder.ts` |
| 4 | `src/context-menu/manager.ts`, `src/tabs/manager.ts`, `src/preload.ts`, `shell/index.html` (tab section ~1264-1270, ~1700-1850) |
| 5 | `src/context-menu/menu-builder.ts`, `shell/index.html` (kees panel), `shell/chat/router.js` |
| 6 | Alle `src/context-menu/*` files, `shell/index.html` |

### Default workflow per fase:

```
1. Read CONTEXT-MENU-PLAN.md → check welke phase about the beurt is
2. Read the key files for that fase
3. Implementeer the code
4. Compileer: npm run compile
5. Fix eventuele TypeScript errors
6. Start app: npm start (NOOIT npm run dev!)
7. Doorloop the verificatie checks
8. Update CONTEXT-MENU-PLAN.md: markeer phase if DONE
```

---

## Appendix B: Electron API Referentie (Relevant)

```typescript
// WebContents methodes for context menu
webContents.goBack()
webContents.goForward()
webContents.canGoBack(): boolean
webContents.canGoForward(): boolean
webContents.reload()
webContents.print()
webContents.savePage(fullPath, saveType)
webContents.inspectElement(x, y)
webContents.downloadURL(url)
webContents.copyImageAt(x, y)
webContents.copy()
webContents.cut()
webContents.paste()
webContents.pasteAndMatchStyle()
webContents.undo()
webContents.redo()
webContents.delete()
webContents.selectAll()
webContents.getURL()
webContents.getTitle()
webContents.setAudioMuted(muted)
webContents.isAudioMuted()

// Menu API
const menu = new Menu()
menu.append(new MenuItem({ label, click, enabled, accelerator, type }))
menu.popup({ window })

// Clipboard
clipboard.writeText(text)
clipboard.readText()

// Dialog
dialog.showSaveDialog(window, options)
```
