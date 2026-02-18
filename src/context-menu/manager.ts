import { WebContents } from 'electron';
import { ContextMenuBuilder } from './menu-builder';
import { ContextMenuParams, ContextMenuDeps } from './types';

/**
 * ContextMenuManager — registers context-menu handlers on webview webContents.
 *
 * Initialized once in main.ts, then registerWebContents() is called for each
 * new webview as it's created via the 'web-contents-created' app event.
 */
export class ContextMenuManager {
  private builder: ContextMenuBuilder;
  private deps: ContextMenuDeps;
  private registeredWebContents: Set<number> = new Set();

  constructor(deps: ContextMenuDeps) {
    this.deps = deps;
    this.builder = new ContextMenuBuilder(deps);
  }

  /**
   * Register context-menu handling for a webview's webContents.
   * Call this once per webview on dom-ready or web-contents-created.
   */
  registerWebContents(webContents: WebContents, tabId?: string): void {
    const id = webContents.id;
    if (this.registeredWebContents.has(id)) return;
    this.registeredWebContents.add(id);

    webContents.on('context-menu', (_event, params) => {
      // Resolve tabId: use provided one, or try to find it from TabManager
      const resolvedTabId = tabId || this.findTabIdForWebContents(webContents);

      const menuParams: ContextMenuParams = {
        x: params.x,
        y: params.y,
        linkURL: params.linkURL,
        linkText: params.linkText,
        srcURL: params.srcURL,
        mediaType: params.mediaType,
        hasImageContents: params.hasImageContents,
        pageURL: params.pageURL,
        frameURL: params.frameURL,
        selectionText: params.selectionText,
        isEditable: params.isEditable,
        editFlags: params.editFlags,
        tabId: resolvedTabId,
        tabSource: resolvedTabId
          ? this.deps.tabManager.getTabSource(resolvedTabId) ?? undefined
          : undefined,
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

  /**
   * Find the tab ID that owns the given webContents by scanning TabManager.
   */
  private findTabIdForWebContents(wc: WebContents): string | undefined {
    const tabs = this.deps.tabManager.listTabs();
    const tab = tabs.find(t => t.webContentsId === wc.id);
    return tab?.id;
  }

  /**
   * Cleanup on app quit.
   */
  destroy(): void {
    this.registeredWebContents.clear();
  }
}
