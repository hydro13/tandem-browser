# Context Menu Implementatie Plan — Tandem Browser

> **Status:** IN PROGRESS
> **Laatste update:** 2026-02-18
> **Totaal fases:** 7

---

## Fase Voortgang

| Fase | Naam | Status | Datum voltooid |
|------|------|--------|----------------|
| 0 | Infrastructuur & Foundation | ✅ DONE | 2026-02-18 |
| 1 | Webpagina Basis Context Menu | ✅ DONE | 2026-02-18 |
| 2 | Link, Afbeelding & Selectie Menu | ⬜ TODO | - |
| 3 | Input/Tekstveld Context Menu | ⬜ TODO | - |
| 4 | Tab Context Menu | ⬜ TODO | - |
| 5 | Tandem-specifieke Items (Kees AI) | ⬜ TODO | - |
| 6 | Polish, Edge Cases & Integratie Tests | ⬜ TODO | - |

---

## Architectuur Overzicht

### Hoe het werkt

Electron `<webview>` tags ondersteunen **geen** direct `contextmenu` event in de renderer.
De juiste aanpak is:

1. **Main process** luistert naar `context-menu` event op elke webview's `webContents`
2. Main process bouwt een `Menu` op basis van de context (link, image, selectie, input, etc.)
3. Main process toont het menu via `menu.popup()`
4. Menu item clicks sturen IPC berichten of voeren `webContents` methodes uit

### Bestands Structuur

```
src/
  context-menu/
    manager.ts          ← Fase 0: ContextMenuManager class
    menu-builder.ts     ← Fase 0: Bouwt Menu items per context type
    types.ts            ← Fase 0: TypeScript interfaces
shell/
  index.html            ← Fase 4: Tab context menu (renderer-side)
```

### Key Referenties in Bestaande Code

| Wat | Waar | Regel |
|-----|------|-------|
| Webview creatie & `dom-ready` | `src/main.ts` | ~115-170 |
| IPC handlers registratie | `src/main.ts` | ~271-560 |
| `buildAppMenu()` | `src/main.ts` | ~586-704 |
| Manager init pattern | `src/main.ts` | ~76-109 |
| TabManager | `src/tabs/manager.ts` | Heel bestand |
| BookmarkManager | `src/bookmarks/manager.ts` | Heel bestand |
| HistoryManager | `src/history/manager.ts` | Heel bestand |
| Preload / contextBridge | `src/preload.ts` | Heel bestand |
| Tab UI & webview events | `shell/index.html` | ~1700-1950 |
| Cleanup pattern | `src/main.ts` | ~1080-1096 |

### IPC Kanalen (bestaand, relevant)

- `navigate` — navigeer actieve tab
- `tab-new` — open nieuwe tab
- `tab-close` — sluit tab
- `tab-focus` — focus tab
- `go-back` / `go-forward` / `reload` — navigatie
- `bookmark-page` / `unbookmark-page` / `is-bookmarked` — bookmarks
- `get-page-content` — pagina HTML ophalen

---

## Fase 0: Infrastructuur & Foundation

### Doel
Creëer de basisstructuur voor het context menu systeem zodat volgende fases er op voort kunnen bouwen.

### Bestanden aan te maken

#### `src/context-menu/types.ts`
```typescript
export interface ContextMenuParams {
  // Electron's built-in params van context-menu event
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
  panelManager: any;        // PanelManager (voor "Ask Kees")
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

    // Fase 1: Basis items (back, forward, reload, etc.)
    // Fase 2: Link items, Image items, Selection items
    // Fase 3: Input/editable items
    // Fase 5: Tandem-specifieke items

    return menu;
  }

  // Helper: voeg separator toe alleen als menu niet leeg is
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

  // Registreer context-menu voor een webview's webContents
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

1. Import en initialiseer `ContextMenuManager` bij de andere managers (~regel 76-109)
2. In de webview `dom-ready` handler (~regel 115-170): roep `contextMenuManager.registerWebContents()` aan
3. In `will-quit` cleanup (~regel 1080): roep `contextMenuManager.destroy()` aan

### Verificatie Checks (Fase 0)

```bash
# 1. TypeScript compileert zonder errors
npm run compile

# 2. App start zonder crashes
npm start
# → Rechtsklik op een webpagina moet een leeg/geen menu tonen (nog geen items)
# → Console mag geen errors loggen

# 3. Bestandsstructuur correct
ls src/context-menu/
# Verwacht: manager.ts  menu-builder.ts  types.ts
```

### Wat te updaten na voltooiing
- Dit document: Fase 0 status → ✅ DONE + datum
- `CONTEXT-MENU-PLAN.md` voortgangstabel bovenaan

---

## Fase 1: Webpagina Basis Context Menu

### Doel
De standaard rechtermuisklik-opties voor een lege plek op een webpagina.

### Vereiste: Fase 0 moet DONE zijn

### Items te implementeren

| # | Menu Item | Actie | Electron API |
|---|-----------|-------|-------------|
| 1 | ← Back | Navigeer terug | `webContents.goBack()` |
| 2 | → Forward | Navigeer vooruit | `webContents.goForward()` |
| 3 | ↻ Reload | Herlaad pagina | `webContents.reload()` |
| 4 | — | Separator | — |
| 5 | Save As... | Pagina opslaan | `webContents.savePage()` of `dialog.showSaveDialog()` + download |
| 6 | Print... | Print pagina | `webContents.print()` |
| 7 | — | Separator | — |
| 8 | View Page Source | Bron bekijken | Open `view-source:${url}` in nieuwe tab |
| 9 | Inspect Element | DevTools openen | `webContents.inspectElement(x, y)` |

### Implementatie in `menu-builder.ts`

Voeg een `addPageItems()` methode toe:

```typescript
private addPageItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
  // Alleen tonen als GEEN link, GEEN image, GEEN selectie, GEEN editable
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

Deze methodes zitten op `webContents`. In de `context-menu` event handler heb je directe toegang tot de `webContents` van de webview — dit werkt dus direct.

**Let op:** `webContents.canGoBack()` en `canGoForward()` bestaan op Electron's WebContents. Controleer of ze werken op webview webContents (ze zouden moeten in Electron 28).

### View Page Source: IPC naar renderer

De renderer (`shell/index.html`) moet een IPC listener hebben voor `open-url-in-new-tab`. Dit bestaat al in de codebase — controleer dat het werkt met `view-source:` prefix URL's.

### Verificatie Checks (Fase 1)

```bash
# 1. Compileer
npm run compile

# 2. Start app
npm start

# 3. Handmatige test checklist:
# □ Rechtsklik op lege plek van een webpagina → menu verschijnt
# □ "Back" is disabled als er geen history is
# □ "Forward" is disabled als er geen forward history is
# □ "Reload" herlaadt de pagina
# □ "Save As..." opent een opslaan-dialoog
# □ "Print..." opent print dialoog
# □ "View Page Source" opent source in nieuwe tab
# □ "Inspect Element" opent DevTools op het juiste element
# □ Menu verschijnt NIET als je op een link/afbeelding/selectie klikt (die komen in fase 2)
```

### Wat te updaten na voltooiing
- Dit document: Fase 1 status → ✅ DONE + datum

---

## Fase 2: Link, Afbeelding & Selectie Context Menu

### Doel
Context-afhankelijke menu items voor links, afbeeldingen, en geselecteerde tekst.

### Vereiste: Fase 1 moet DONE zijn

### 2A: Link Items

| # | Menu Item | Conditie | Actie |
|---|-----------|----------|-------|
| 1 | Open Link in New Tab | `params.linkURL` aanwezig | IPC `tab-new` met URL |
| 2 | Copy Link Address | `params.linkURL` aanwezig | `clipboard.writeText(params.linkURL)` |
| 3 | Copy Link Text | `params.linkText` aanwezig | `clipboard.writeText(params.linkText)` |
| 4 | Save Link As... | `params.linkURL` aanwezig | `webContents.downloadURL(params.linkURL)` |
| 5 | Bookmark Link | `params.linkURL` aanwezig | `bookmarkManager.add(linkText, linkURL)` |

### 2B: Afbeelding Items

| # | Menu Item | Conditie | Actie |
|---|-----------|----------|-------|
| 1 | Open Image in New Tab | `mediaType === 'image'` | Open `params.srcURL` in nieuwe tab |
| 2 | Save Image As... | `mediaType === 'image'` | `webContents.downloadURL(params.srcURL)` |
| 3 | Copy Image | `mediaType === 'image'` | `webContents.copyImageAt(x, y)` |
| 4 | Copy Image Address | `mediaType === 'image'` | `clipboard.writeText(params.srcURL)` |

### 2C: Selectie Items

| # | Menu Item | Conditie | Actie |
|---|-----------|----------|-------|
| 1 | Copy | `params.selectionText` | `webContents.copy()` |
| 2 | Search Google for "..." | `params.selectionText` | Open Google search in nieuwe tab |
| 3 | — | Separator | — |
| 4 | (Fase 1 items) | Altijd | Back, Forward, Reload, etc. |

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

### Build-volgorde in `build()` methode

```typescript
build(params: ContextMenuParams, webContents: WebContents): Menu {
  const menu = new Menu();

  // Volgorde is belangrijk: specifiek → algemeen
  this.addLinkItems(menu, params, webContents);
  this.addImageItems(menu, params, webContents);
  this.addSelectionItems(menu, params, webContents);

  // Separator voor navigatie items als er al context items zijn
  if (menu.items.length > 0) {
    this.addSeparator(menu);
  }

  // Altijd navigatie items tonen (maar als addPageItems checkt op
  // geen link/image/selectie, moeten we die check aanpassen)
  this.addNavigationItems(menu, params, webContents); // Back/Forward/Reload
  this.addSeparator(menu);
  this.addToolItems(menu, params, webContents);        // Save/Print/Source/Inspect

  return menu;
}
```

**Belangrijk:** Refactor `addPageItems()` uit Fase 1 naar twee methodes:
- `addNavigationItems()` — Back, Forward, Reload (altijd zichtbaar)
- `addToolItems()` — Save, Print, View Source, Inspect (altijd zichtbaar)

### Combinatie-scenario's

Chrome toont meerdere secties als een klik op meerdere contexten matcht:
- **Link met afbeelding:** Toon link items + image items + navigatie
- **Link met selectie:** Toon selectie items + link items + navigatie
- **Image met link:** `srcURL` + `linkURL` beide gevuld → toon beide secties

### Verificatie Checks (Fase 2)

```bash
npm run compile && npm start

# Test checklist:
# □ Rechtsklik op een link → "Open Link in New Tab", "Copy Link Address", etc.
# □ "Open Link in New Tab" opent daadwerkelijk een nieuwe tab
# □ "Copy Link Address" kopieert URL naar clipboard
# □ Rechtsklik op afbeelding → "Save Image As...", "Copy Image", etc.
# □ "Open Image in New Tab" toont afbeelding in nieuwe tab
# □ "Copy Image" werkt (plak in een ander programma)
# □ Selecteer tekst → Rechtsklik → "Copy" en "Search Google for ..."
# □ "Search Google" opent Google zoekresultaten in nieuwe tab
# □ Link + Afbeelding combo → beide secties zichtbaar
# □ Navigatie items (Back/Forward/Reload) nog steeds zichtbaar onderaan
```

### Wat te updaten na voltooiing
- Dit document: Fase 2 status → ✅ DONE + datum

---

## Fase 3: Input/Tekstveld Context Menu

### Doel
Volledige edit-functionaliteit voor input velden, textareas, en contenteditable elementen.

### Vereiste: Fase 2 moet DONE zijn

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

### Build-volgorde update

```typescript
build(params: ContextMenuParams, webContents: WebContents): Menu {
  const menu = new Menu();

  if (params.isEditable) {
    // Input context: edit items eerst, dan optioneel selectie
    this.addEditableItems(menu, params, webContents);
    // Als er ook tekst geselecteerd is in het veld:
    if (params.selectionText) {
      this.addSeparator(menu);
      this.addSearchItem(menu, params); // Alleen "Search Google" (copy zit al in editable)
    }
  } else {
    // Niet-editable context
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

### Verificatie Checks (Fase 3)

```bash
npm run compile && npm start

# Test checklist:
# □ Rechtsklik in een tekstveld → Undo, Redo, Cut, Copy, Paste, etc. zichtbaar
# □ "Undo" is grayed out als er niets te undo-en is
# □ "Cut" werkt — tekst verdwijnt en staat op clipboard
# □ "Paste" plakt clipboard content in het veld
# □ "Paste as Plain Text" plakt zonder opmaak
# □ "Select All" selecteert alle tekst in het veld
# □ In een contenteditable div (bijv. Gmail composer): zelfde gedrag
# □ Tekst selecteren in input → "Search Google" is ook beschikbaar
# □ Lege input (geen selectie) → "Copy" en "Cut" zijn grayed out
```

### Wat te updaten na voltooiing
- Dit document: Fase 3 status → ✅ DONE + datum

---

## Fase 4: Tab Context Menu

### Doel
Rechtermuisklik op een tab in de tab bar toont een context menu met tab-acties.

### Vereiste: Fase 3 moet DONE zijn

### Verschil met Fase 0-3
Dit menu wordt **in de renderer** (shell/index.html) afgehandeld, niet via webview `context-menu` event. De tab bar is onderdeel van de shell UI, niet een webview.

**Aanpak:** Gebruik IPC om het menu in de main process te bouwen en te tonen. Dit is de Electron best-practice.

### Items te implementeren

| # | Menu Item | Actie |
|---|-----------|-------|
| 1 | New Tab | Open nieuwe tab |
| 2 | — | Separator |
| 3 | Reload Tab | Herlaad deze tab |
| 4 | Duplicate Tab | Open dezelfde URL in nieuwe tab |
| 5 | Pin Tab | Toggle pin status |
| 6 | Mute Tab | Toggle audio mute |
| 7 | — | Separator |
| 8 | Close Tab | Sluit deze tab |
| 9 | Close Other Tabs | Sluit alle behalve deze |
| 10 | Close Tabs to Right | Sluit alle tabs rechts van deze |
| 11 | — | Separator |
| 12 | Reopen Closed Tab | Herstel laatste gesloten tab |

### Implementatie

#### Stap 1: Nieuw IPC kanaal `show-tab-context-menu`

In `src/main.ts` of in `ContextMenuManager`:

```typescript
ipcMain.handle('show-tab-context-menu', async (_event, tabId: string) => {
  const menu = this.buildTabContextMenu(tabId);
  menu.popup({ window: this.deps.win });
});
```

#### Stap 2: `buildTabContextMenu()` in `menu-builder.ts`

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
      // Vind webContents van deze tab en reload
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

#### Stap 3: Recently Closed Tabs — TabManager uitbreiden

In `src/tabs/manager.ts`, voeg een `closedTabs` stack toe:

```typescript
private closedTabs: { url: string; title: string }[] = [];

closeTab(tabId: string): void {
  const tab = this.getTab(tabId);
  if (tab) {
    this.closedTabs.push({ url: tab.url, title: tab.title });
    // bestaande close logica...
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

#### Stap 4: Preload uitbreiden

In `src/preload.ts`, voeg toe:

```typescript
showTabContextMenu: (tabId: string) => ipcRenderer.invoke('show-tab-context-menu', tabId),
```

#### Stap 5: Renderer event listener

In `shell/index.html`, in de tab creatie code (~regel 1264-1270):

```javascript
tabEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.tandem.showTabContextMenu(tabId);
});
```

### Verificatie Checks (Fase 4)

```bash
npm run compile && npm start

# Test checklist:
# □ Rechtsklik op een tab → context menu verschijnt
# □ "New Tab" opent een nieuwe tab
# □ "Reload Tab" herlaadt de geklikte tab (niet per se de actieve tab!)
# □ "Duplicate Tab" opent zelfde URL in nieuwe tab
# □ "Mute Tab" mute de audio van die tab
# □ "Close Tab" sluit de geklikte tab
# □ "Close Other Tabs" sluit alle andere tabs
# □ "Close Tabs to Right" sluit alleen tabs rechts van de geklikte
# □ "Reopen Closed Tab" heropent de laatst gesloten tab
# □ "Reopen Closed Tab" is grayed out als er geen gesloten tabs zijn
# □ Met maar 1 tab open: "Close Other Tabs" is grayed out
# □ Op de meest rechtse tab: "Close Tabs to Right" is grayed out
```

### Wat te updaten na voltooiing
- Dit document: Fase 4 status → ✅ DONE + datum

---

## Fase 5: Tandem-specifieke Items (Kees AI Integratie)

### Doel
Unieke context menu items die Tandem onderscheiden van Chrome: AI-integratie met Kees.

### Vereiste: Fase 4 moet DONE zijn

### Items te implementeren

| # | Menu Item | Conditie | Actie |
|---|-----------|----------|-------|
| 1 | Ask Kees about this | Altijd | Stuur pagina-context naar Kees panel |
| 2 | Ask Kees about selection | `selectionText` aanwezig | Stuur selectie naar Kees chat |
| 3 | Ask Kees about this image | `mediaType === 'image'` | Screenshot + stuur naar Kees |
| 4 | Summarize Page with Kees | Altijd | Vraag Kees om samenvatting |
| 5 | — | Separator | — |
| 6 | Screenshot Element | Altijd | Quick screenshot van element |
| 7 | Bookmark Page | Altijd (als niet al bookmarked) | Bookmark huidige pagina |

### Implementatie

```typescript
private addTandemItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
  this.addSeparator(menu);

  // AI items — alleen als panel/chat beschikbaar is
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

### Benodigde IPC kanalen (nieuw)

| Kanaal | Richting | Doel |
|--------|----------|------|
| `kees-chat-inject` | main → renderer | Inject een chat bericht in Kees panel |
| `start-screenshot-mode` | main → renderer | Activeer screenshot selectie modus |
| `bookmark-status-changed` | main → renderer | Update bookmark ster na toggle |

### Renderer Aanpassingen (`shell/index.html`)

Voeg listener toe voor `kees-chat-inject`:

```javascript
window.tandem.on('kees-chat-inject', (text) => {
  // Open chat tab in panel
  // Vul chat input met text
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

### Verificatie Checks (Fase 5)

```bash
npm run compile && npm start

# Test checklist:
# □ Rechtsklik op pagina → "Summarize Page with Kees" zichtbaar
# □ Klikken opent Kees panel en stuurt samenvatting-vraag
# □ Selecteer tekst → Rechtsklik → "Ask Kees about Selection" zichtbaar
# □ Klikken stuurt geselecteerde tekst naar Kees chat
# □ Rechtsklik op afbeelding → "Ask Kees about this Image" zichtbaar
# □ "Screenshot this Area" activeert screenshot modus
# □ "Bookmark this Page" toggelt bookmark status
# □ Als pagina al bookmarked is: label toont "Remove Bookmark"
# □ Alle items werken samen met de standaard menu items (geen conflicten)
# □ Kees panel opent automatisch als het gesloten was
```

### Wat te updaten na voltooiing
- Dit document: Fase 5 status → ✅ DONE + datum

---

## Fase 6: Polish, Edge Cases & Integratie Tests

### Doel
Alles netjes afwerken, edge cases afvangen, keyboard shortcuts toevoegen, en een volledig testscript draaien.

### Vereiste: Fase 5 moet DONE zijn

### 6A: Edge Cases & Polish

| # | Item | Beschrijving |
|---|------|-------------|
| 1 | Lege/error pagina's | Context menu op about:blank, tandem:// interne pagina's |
| 2 | PDF viewer | Context menu op PDF content (beperkte opties) |
| 3 | Meerdere selecties | Meerdere woorden, hele alinea's |
| 4 | Video/Audio elementen | Aanvullende media controls |
| 5 | Disabled items styling | Grayed-out items consistent |
| 6 | Menu positie | Menu verschijnt niet buiten scherm |
| 7 | Snel achter elkaar klikken | Geen dubbele menus |
| 8 | Keyboard shortcut hints | Toon accelerators in menu items |

### 6B: Keyboard Accelerator Hints

Voeg `accelerator` labels toe aan menu items die ook een keyboard shortcut hebben:

```typescript
new MenuItem({
  label: 'Copy',
  accelerator: 'CmdOrCtrl+C',  // Alleen als hint, niet als extra binding
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

### 6D: Interne Pagina's Afhandeling

```typescript
build(params: ContextMenuParams, webContents: WebContents): Menu {
  const menu = new Menu();
  const url = webContents.getURL();

  // Interne pagina's: alleen basisitems
  if (url.startsWith('file://') && url.includes('/shell/')) {
    this.addInternalPageItems(menu, params, webContents);
    return menu;
  }

  // Normale pagina's: volledige menu
  // ... (bestaande logica)
}

private addInternalPageItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
  // Alleen copy/paste voor interne pagina's
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

Maak `scripts/test-context-menu.md` — een handmatig testprotocol:

```markdown
# Context Menu Test Protocol

## Setup
1. Start Tandem: `npm start`
2. Open een testpagina met links, afbeeldingen, input velden
   Aanbevolen: https://www.w3schools.com/html/html_links.asp

## Test Cases

### TC1: Lege pagina-achtergrond
- [ ] Rechtsklik op lege ruimte → menu met Back, Forward, Reload, etc.
- [ ] Back disabled als geen history
- [ ] Forward disabled als geen forward history
- [ ] Reload herlaadt pagina
- [ ] Save As opent dialoog
- [ ] Print opent print dialoog
- [ ] View Page Source opent source in tab
- [ ] Inspect opent DevTools op juiste locatie

### TC2: Links
- [ ] Rechtsklik op link → link items bovenaan
- [ ] Open in New Tab werkt
- [ ] Copy Link Address → clipboard check
- [ ] Copy Link Text → clipboard check
- [ ] Bookmark Link voegt bookmark toe

### TC3: Afbeeldingen
- [ ] Rechtsklik op img → image items
- [ ] Open Image in New Tab werkt
- [ ] Save Image As → download start
- [ ] Copy Image → plakbaar in ander programma
- [ ] Copy Image Address → clipboard check

### TC4: Tekst Selectie
- [ ] Selecteer tekst → rechtsklik → Copy + Search Google
- [ ] Copy werkt
- [ ] Search Google opent zoekresultaten

### TC5: Input Velden
- [ ] Rechtsklik in input → edit items
- [ ] Undo/Redo state correct
- [ ] Cut/Copy/Paste werken
- [ ] Paste as Plain Text werkt
- [ ] Select All werkt

### TC6: Tabs
- [ ] Rechtsklik op tab → tab menu
- [ ] New Tab, Reload, Duplicate, Close werken
- [ ] Close Other Tabs werkt
- [ ] Reopen Closed Tab werkt

### TC7: Tandem/Kees
- [ ] Ask Kees items zichtbaar
- [ ] Panel opent bij klik
- [ ] Chat bericht wordt verzonden
- [ ] Bookmark toggle werkt
- [ ] Screenshot modus activeert

### TC8: Edge Cases
- [ ] Rechtsklik op newtab pagina → beperkt menu
- [ ] Rechtsklik op settings pagina → beperkt menu
- [ ] Snel 3x rechtsklikken → geen crashes
- [ ] Zeer lange selectie → "Search Google for ..." is truncated
- [ ] Link die ook een afbeelding is → beide secties zichtbaar
```

### Verificatie Checks (Fase 6)

```bash
npm run compile && npm start

# Voer ALLE test cases uit van scripts/test-context-menu.md
# Alle checkboxes moeten ✓ zijn
# Geen console errors
# Geen TypeScript warnings bij compilatie
```

### Wat te updaten na voltooiing
- Dit document: Fase 6 status → ✅ DONE + datum
- Dit document: Bovenste tabel: alle fases ✅

---

## Appendix A: Snel-start voor Claude Code Sessie

### Bij het starten van een nieuwe sessie, lees altijd:

1. **Dit document** — `CONTEXT-MENU-PLAN.md` (check welke fase aan de beurt is)
2. **Key bestanden** per fase:

| Fase | Lees eerst |
|------|-----------|
| 0 | `src/main.ts` (regels 76-170, 586-726, 1080-1096) |
| 1 | `src/context-menu/menu-builder.ts`, `src/main.ts` |
| 2 | `src/context-menu/menu-builder.ts`, `src/tabs/manager.ts`, `src/bookmarks/manager.ts` |
| 3 | `src/context-menu/menu-builder.ts` |
| 4 | `src/context-menu/manager.ts`, `src/tabs/manager.ts`, `src/preload.ts`, `shell/index.html` (tab sectie ~1264-1270, ~1700-1850) |
| 5 | `src/context-menu/menu-builder.ts`, `shell/index.html` (kees panel), `shell/chat/router.js` |
| 6 | Alle `src/context-menu/*` bestanden, `shell/index.html` |

### Standaard workflow per fase:

```
1. Lees CONTEXT-MENU-PLAN.md → check welke fase aan de beurt is
2. Lees de key bestanden voor die fase
3. Implementeer de code
4. Compileer: npm run compile
5. Fix eventuele TypeScript errors
6. Start app: npm start (NOOIT npm run dev!)
7. Doorloop de verificatie checks
8. Update CONTEXT-MENU-PLAN.md: markeer fase als DONE
```

---

## Appendix B: Electron API Referentie (Relevant)

```typescript
// WebContents methodes voor context menu
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
