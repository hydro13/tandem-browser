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

    // Phase 1-5: menu items will be added here by subsequent phases.
    // Each phase adds its own addXxxItems() method calls.

    return menu;
  }

  /** Append a separator only if the menu already has items (avoids leading separators) */
  private addSeparator(menu: Menu): void {
    if (menu.items.length > 0 && menu.items[menu.items.length - 1].type !== 'separator') {
      menu.append(new MenuItem({ type: 'separator' }));
    }
  }
}
