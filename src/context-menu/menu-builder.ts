import { Menu, MenuItem, clipboard, shell, dialog, WebContents } from 'electron';
import { ContextMenuParams, ContextMenuDeps } from './types';

/**
 * Builds Electron Menu instances based on the right-click context.
 * Each add*Items method handles a specific context type (link, image, etc.).
 * Methods are added incrementally per implementation phase.
 */
export class ContextMenuBuilder {
  private deps: ContextMenuDeps;

  constructor(deps: ContextMenuDeps) {
    this.deps = deps;
  }

  /**
   * Build the full context menu for the given params.
   * Dispatches to context-specific builders in order: specific → general.
   */
  build(params: ContextMenuParams, webContents: WebContents): Menu {
    const menu = new Menu();

    if (params.isEditable) {
      // Phase 3: Input/textarea/contenteditable — edit items first
      this.addEditableItems(menu, params, webContents);
      // Also allow "Search Google" if text is selected inside the field
      if (params.selectionText) {
        this.addSeparator(menu);
        this.addSearchItem(menu, params);
      }
    } else {
      // Phase 2: Context-specific items (link, image, selection)
      this.addLinkItems(menu, params, webContents);
      this.addImageItems(menu, params, webContents);
      this.addSelectionItems(menu, params, webContents);
    }

    // Phase 1: Navigation + tool items (always present)
    this.addSeparator(menu);
    this.addNavigationItems(menu, params, webContents);
    this.addSeparator(menu);
    this.addToolItems(menu, params, webContents);

    return menu;
  }

  // ═══ Phase 2: Link Items ═══

  /** Open in New Tab, Copy Link Address/Text, Save Link, Bookmark Link */
  private addLinkItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
    if (!params.linkURL) return;

    menu.append(new MenuItem({
      label: 'Open Link in New Tab',
      click: () => this.deps.tabManager.openTab(params.linkURL),
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
        this.deps.bookmarkManager.add(params.linkText || params.linkURL, params.linkURL);
      },
    }));
  }

  // ═══ Phase 2: Image Items ═══

  /** Open Image in New Tab, Save/Copy Image, Copy Image Address */
  private addImageItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
    if (params.mediaType !== 'image') return;

    this.addSeparator(menu);

    menu.append(new MenuItem({
      label: 'Open Image in New Tab',
      click: () => this.deps.tabManager.openTab(params.srcURL),
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

  // ═══ Phase 2: Selection Items ═══

  /** Copy selection, Search Google for selection */
  private addSelectionItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
    if (!params.selectionText) return;

    this.addSeparator(menu);

    menu.append(new MenuItem({
      label: 'Copy',
      accelerator: 'CmdOrCtrl+C',
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

  // ═══ Phase 3: Editable Field Items ═══

  /** Undo, Redo, Cut, Copy, Paste, Paste Plain Text, Delete, Select All */
  private addEditableItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
    menu.append(new MenuItem({
      label: 'Undo',
      accelerator: 'CmdOrCtrl+Z',
      enabled: params.editFlags.canUndo,
      click: () => wc.undo(),
    }));
    menu.append(new MenuItem({
      label: 'Redo',
      accelerator: 'CmdOrCtrl+Shift+Z',
      enabled: params.editFlags.canRedo,
      click: () => wc.redo(),
    }));

    this.addSeparator(menu);

    menu.append(new MenuItem({
      label: 'Cut',
      accelerator: 'CmdOrCtrl+X',
      enabled: params.editFlags.canCut,
      click: () => wc.cut(),
    }));
    menu.append(new MenuItem({
      label: 'Copy',
      accelerator: 'CmdOrCtrl+C',
      enabled: params.editFlags.canCopy,
      click: () => wc.copy(),
    }));
    menu.append(new MenuItem({
      label: 'Paste',
      accelerator: 'CmdOrCtrl+V',
      enabled: params.editFlags.canPaste,
      click: () => wc.paste(),
    }));
    menu.append(new MenuItem({
      label: 'Paste as Plain Text',
      accelerator: 'CmdOrCtrl+Shift+V',
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
      accelerator: 'CmdOrCtrl+A',
      enabled: params.editFlags.canSelectAll,
      click: () => wc.selectAll(),
    }));
  }

  /** Search Google item — used standalone for editable fields with selection */
  private addSearchItem(menu: Menu, params: ContextMenuParams): void {
    if (!params.selectionText) return;

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

  // ═══ Phase 1: Navigation Items ═══

  /** Back, Forward, Reload — always visible */
  private addNavigationItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
    menu.append(new MenuItem({
      label: 'Back',
      accelerator: 'Alt+Left',
      enabled: wc.canGoBack(),
      click: () => wc.goBack(),
    }));
    menu.append(new MenuItem({
      label: 'Forward',
      accelerator: 'Alt+Right',
      enabled: wc.canGoForward(),
      click: () => wc.goForward(),
    }));
    menu.append(new MenuItem({
      label: 'Reload',
      accelerator: 'CmdOrCtrl+R',
      click: () => wc.reload(),
    }));
  }

  // ═══ Phase 1: Tool Items ═══

  /** Save As, Print, View Page Source, Inspect Element */
  private addToolItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
    menu.append(new MenuItem({
      label: 'Save As...',
      accelerator: 'CmdOrCtrl+S',
      click: () => this.handleSaveAs(wc),
    }));
    menu.append(new MenuItem({
      label: 'Print...',
      accelerator: 'CmdOrCtrl+P',
      click: () => wc.print(),
    }));

    this.addSeparator(menu);

    menu.append(new MenuItem({
      label: 'View Page Source',
      accelerator: 'CmdOrCtrl+U',
      click: () => {
        const url = wc.getURL();
        this.deps.tabManager.openTab(`view-source:${url}`);
      },
    }));
    menu.append(new MenuItem({
      label: 'Inspect Element',
      accelerator: 'CmdOrCtrl+Shift+I',
      click: () => wc.inspectElement(params.x, params.y),
    }));
  }

  /** Handle Save As via system dialog + savePage */
  private async handleSaveAs(wc: WebContents): Promise<void> {
    const title = wc.getTitle() || 'page';
    const safeName = title.replace(/[^a-z0-9_\- ]/gi, '').substring(0, 60) || 'page';

    const result = await dialog.showSaveDialog(this.deps.win, {
      defaultPath: `${safeName}.html`,
      filters: [
        { name: 'Web Page, Complete', extensions: ['html'] },
        { name: 'Web Page, HTML Only', extensions: ['html'] },
      ],
    });

    if (!result.canceled && result.filePath) {
      const saveType = result.filePath.endsWith('.html') ? 'HTMLComplete' : 'HTMLOnly';
      wc.savePage(result.filePath, saveType as 'HTMLComplete' | 'HTMLOnly').catch((err) => {
        console.warn('Save page failed:', err.message);
      });
    }
  }

  /** Append a separator only if the menu already has items (avoids leading separators) */
  private addSeparator(menu: Menu): void {
    if (menu.items.length > 0 && menu.items[menu.items.length - 1].type !== 'separator') {
      menu.append(new MenuItem({ type: 'separator' }));
    }
  }
}
