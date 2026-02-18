import { WebContents } from 'electron';
import { ContextMenuBuilder } from './menu-builder';
import { ContextMenuParams, ContextMenuDeps } from './types';

type ContextMenuListener = (event: Electron.Event, params: Electron.ContextMenuParams) => void;

/**
 * ContextMenuManager — registers context-menu handlers on webview webContents.
 *
 * Initialized once in main.ts, then registerWebContents() is called for each
 * new webview as it's created via the 'web-contents-created' app event.
 */
export class ContextMenuManager {
  private builder: ContextMenuBuilder;
  private deps: ContextMenuDeps;
  /** Track registered webContents IDs → their context-menu listener for cleanup */
  private listeners: Map<number, { wc: WebContents; handler: ContextMenuListener }> = new Map();
  private lastPopupTime = 0;

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
    if (this.listeners.has(id)) return;

    const handler: ContextMenuListener = (_event, params) => {
      const now = Date.now();
      if (now - this.lastPopupTime < 200) return;
      this.lastPopupTime = now;

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
    };

    webContents.on('context-menu', handler);
    this.listeners.set(id, { wc: webContents, handler });

    webContents.once('destroyed', () => {
      this.listeners.delete(id);
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
   * Show context menu for a tab in the tab bar (called via IPC from renderer).
   */
  showTabContextMenu(tabId: string): void {
    const menu = this.builder.buildTabContextMenu(tabId);
    if (menu.items.length > 0) {
      menu.popup({ window: this.deps.win });
    }
  }

  /**
   * Cleanup on app quit — remove all context-menu listeners.
   */
  destroy(): void {
    for (const [, entry] of this.listeners) {
      if (!entry.wc.isDestroyed()) {
        entry.wc.removeListener('context-menu', entry.handler);
      }
    }
    this.listeners.clear();
  }
}
