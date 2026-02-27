import type { Session} from 'electron';
import { BrowserWindow, ipcMain, Menu, MenuItem } from 'electron';
import path from 'path';
import fs from 'fs';
import type { ExtensionManager } from './manager';
import { tandemDir } from '../utils/paths';
import { createLogger } from '../utils/logger';

const log = createLogger('ExtensionToolbar');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ToolbarExtension {
  id: string;             // Electron runtime ID
  name: string;
  icon: string;           // base64 data URI
  popupUrl: string | null;
  badgeText: string;
  badgeColor: string;
  title: string;          // Tooltip
  enabled: boolean;
  hasOptionsPage: boolean;
  optionsUrl: string | null;
  diskId: string;         // CWS/folder ID (may differ from runtime id)
}

interface ToolbarState {
  pinned: string[];       // Extension IDs that are pinned to main toolbar
  order: string[];        // Extension display order
}

/**
 * ExtensionToolbar — Manages the extension toolbar state in the main process.
 *
 * Reads loaded extensions from the session, parses their manifests for
 * action/browser_action/page_action, provides icon data URIs, and manages
 * pin state persistence.
 */
export class ExtensionToolbar {
  private extensionManager: ExtensionManager;
  private mainWindow: BrowserWindow | null = null;
  private popupWindow: BrowserWindow | null = null;
  private badgeState: Map<string, { text: string; color: string }> = new Map();
  private toolbarState: ToolbarState = { pinned: [], order: [] };
  private stateFilePath: string;
  private badgePollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(extensionManager: ExtensionManager) {
    this.extensionManager = extensionManager;
    this.stateFilePath = tandemDir('extensions', 'toolbar-state.json');
    this.loadState();
  }

  /** Set the main window reference for IPC sends and popup positioning */
  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  /** Get all extensions that should appear in the toolbar */
  getToolbarExtensions(session: Session): ToolbarExtension[] {
    const allExtensions = ((session as any).extensions?.getAllExtensions?.() || (session as any).getAllExtensions?.() || []);
    const results: ToolbarExtension[] = [];

    for (const ext of allExtensions) {
      const manifest = ext.manifest as Record<string, unknown>;
      const action = (manifest.action || manifest.browser_action || manifest.page_action) as
        { default_popup?: string; default_icon?: string | Record<string, string>; default_title?: string } | undefined;

      // Build popup URL
      let popupUrl: string | null = null;
      if (action?.default_popup) {
        popupUrl = `chrome-extension://${ext.id}/${action.default_popup}`;
      }

      // Build icon data URI
      const iconDataUri = this.getIconDataUri(ext.id, ext.path, manifest, action);

      // Build title
      const title = action?.default_title || ext.name || ext.id;

      // Options page
      let hasOptionsPage = false;
      let optionsUrl: string | null = null;
      const optionsPage = manifest.options_page as string | undefined;
      const optionsUi = manifest.options_ui as { page?: string } | undefined;
      if (optionsUi?.page) {
        hasOptionsPage = true;
        optionsUrl = `chrome-extension://${ext.id}/${optionsUi.page}`;
      } else if (optionsPage) {
        hasOptionsPage = true;
        optionsUrl = `chrome-extension://${ext.id}/${optionsPage}`;
      }

      // Badge state
      const badge = this.badgeState.get(ext.id) || { text: '', color: '#4688F1' };

      // Resolve disk ID (folder name, may differ from Electron runtime ID)
      const diskId = path.basename(ext.path);

      results.push({
        id: ext.id,
        name: ext.name || ext.id,
        icon: iconDataUri,
        popupUrl,
        badgeText: badge.text,
        badgeColor: badge.color,
        title,
        enabled: true,
        hasOptionsPage,
        optionsUrl,
        diskId,
      });
    }

    // Sort by pin order, then alphabetically
    return this.sortExtensions(results);
  }

  /** Read extension icon as base64 data URI */
  private getIconDataUri(
    _id: string,
    extPath: string,
    manifest: Record<string, unknown>,
    action?: { default_popup?: string; default_icon?: string | Record<string, string>; default_title?: string } | null
  ): string {
    // Try action icons first (best for toolbar), then manifest icons
    const iconSources = [
      action?.default_icon,
      manifest.icons as string | Record<string, string> | undefined,
    ];

    for (const iconSource of iconSources) {
      if (!iconSource) continue;

      let iconPath: string | null = null;

      if (typeof iconSource === 'string') {
        iconPath = path.join(extPath, iconSource);
      } else if (typeof iconSource === 'object') {
        // Pick best resolution for toolbar (18-38px display): prefer 32/38, then 48/19, then 128/16, then any
        const sizes = Object.keys(iconSource);
        const preferred = ['32', '38', '48', '19', '128', '16'];
        for (const size of preferred) {
          if (sizes.includes(size)) {
            iconPath = path.join(extPath, iconSource[size]);
            break;
          }
        }
        if (!iconPath && sizes.length > 0) {
          iconPath = path.join(extPath, iconSource[sizes[0]]);
        }
      }

      if (iconPath && fs.existsSync(iconPath)) {
        try {
          const data = fs.readFileSync(iconPath);
          const ext = path.extname(iconPath).toLowerCase();
          const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : 'image/png';
          return `data:${mime};base64,${data.toString('base64')}`;
        } catch {
          // Fall through to default
        }
      }
    }

    // Default puzzle piece icon as SVG data URI
    return 'data:image/svg+xml;base64,' + Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2">' +
      '<path d="M20 16V4a2 2 0 00-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2z"/>' +
      '<path d="M12 2v4m-2-2h4"/></svg>'
    ).toString('base64');
  }

  /** Sort extensions: pinned first (in pin order), then unpinned alphabetically */
  private sortExtensions(extensions: ToolbarExtension[]): ToolbarExtension[] {
    const pinSet = new Set(this.toolbarState.pinned);

    const pinned = extensions
      .filter(e => pinSet.has(e.id) || pinSet.has(e.diskId))
      .sort((a, b) => {
        const aIdx = this.toolbarState.pinned.indexOf(a.id) >= 0
          ? this.toolbarState.pinned.indexOf(a.id)
          : this.toolbarState.pinned.indexOf(a.diskId);
        const bIdx = this.toolbarState.pinned.indexOf(b.id) >= 0
          ? this.toolbarState.pinned.indexOf(b.id)
          : this.toolbarState.pinned.indexOf(b.diskId);
        return aIdx - bIdx;
      });

    const unpinned = extensions
      .filter(e => !pinSet.has(e.id) && !pinSet.has(e.diskId))
      .sort((a, b) => a.name.localeCompare(b.name));

    return [...pinned, ...unpinned];
  }

  /** Check if an extension is pinned */
  isPinned(extensionId: string): boolean {
    return this.toolbarState.pinned.includes(extensionId);
  }

  /** Pin or unpin an extension */
  setPin(extensionId: string, pinned: boolean): void {
    const idx = this.toolbarState.pinned.indexOf(extensionId);
    if (pinned && idx === -1) {
      this.toolbarState.pinned.push(extensionId);
    } else if (!pinned && idx >= 0) {
      this.toolbarState.pinned.splice(idx, 1);
    }
    this.saveState();
  }

  /** Update badge text for an extension */
  setBadge(extensionId: string, text: string, color?: string): void {
    const existing = this.badgeState.get(extensionId) || { text: '', color: '#4688F1' };
    this.badgeState.set(extensionId, { text, color: color || existing.color });
  }

  /** Open the popup for an extension */
  openPopup(extensionId: string, session: Session, anchorBounds?: { x: number; y: number }): void {
    // Close any existing popup
    this.closePopup();

    const extensions = this.getToolbarExtensions(session);
    const ext = extensions.find(e => e.id === extensionId || e.diskId === extensionId);

    if (!ext?.popupUrl) {
      return;
    }

    // Calculate position: below the toolbar icon
    let x = 100;
    let y = 80;
    if (anchorBounds) {
      x = anchorBounds.x;
      y = anchorBounds.y;
    }
    if (this.mainWindow) {
      const [winX, winY] = this.mainWindow.getPosition();
      x += winX;
      y += winY;
    }

    this.popupWindow = new BrowserWindow({
      width: 400,
      height: 500,
      x,
      y,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      transparent: false,
      hasShadow: true,
      show: false,
      webPreferences: {
        session,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    void this.popupWindow.loadURL(ext.popupUrl);

    this.popupWindow.webContents.once('did-finish-load', () => {
      if (!this.popupWindow) return;

      // Auto-size based on content (small delay for CSS/JS layout)
      setTimeout(() => {
        if (!this.popupWindow || this.popupWindow.isDestroyed()) return;
        this.popupWindow.webContents.executeJavaScript(`
        (() => {
          const body = document.body;
          const html = document.documentElement;
          const w = Math.max(body.scrollWidth, html.scrollWidth, 200);
          const h = Math.max(body.scrollHeight, html.scrollHeight, 100);
          return { w: Math.min(w, 800), h: Math.min(h, 600) };
        })()
      `).then(({ w, h }: { w: number; h: number }) => {
        if (this.popupWindow && !this.popupWindow.isDestroyed()) {
          this.popupWindow.setSize(
            Math.max(200, Math.min(w, 800)),
            Math.max(100, Math.min(h, 600))
          );
          this.popupWindow.show();
        }
        }).catch(() => {
          // Show with default size if sizing fails
          if (this.popupWindow && !this.popupWindow.isDestroyed()) {
            this.popupWindow.show();
          }
        });
      }, 100);
    });

    // Close on blur (click outside)
    this.popupWindow.on('blur', () => {
      this.closePopup();
    });

    this.popupWindow.on('closed', () => {
      this.popupWindow = null;
    });
  }

  /** Close any open popup */
  closePopup(): void {
    if (this.popupWindow && !this.popupWindow.isDestroyed()) {
      this.popupWindow.close();
    }
    this.popupWindow = null;
  }

  /** Show right-click context menu for an extension */
  showContextMenu(extensionId: string, session: Session): void {
    const extensions = this.getToolbarExtensions(session);
    const ext = extensions.find(e => e.id === extensionId || e.diskId === extensionId);
    if (!ext || !this.mainWindow) return;

    const isPinned = this.isPinned(extensionId);

    const menu = new Menu();

    // Extension name (disabled label)
    menu.append(new MenuItem({
      label: ext.name,
      enabled: false,
    }));

    menu.append(new MenuItem({ type: 'separator' }));

    // Options (if available)
    if (ext.hasOptionsPage && ext.optionsUrl) {
      menu.append(new MenuItem({
        label: 'Options',
        click: () => {
          // Open options page in a new Tandem tab
          if (this.mainWindow && ext.optionsUrl) {
            this.mainWindow.webContents.send('open-url-in-new-tab', ext.optionsUrl);
          }
        },
      }));
    }

    // Pin/Unpin
    menu.append(new MenuItem({
      label: isPinned ? 'Unpin from Toolbar' : 'Pin to Toolbar',
      click: () => {
        this.setPin(extensionId, !isPinned);
        this.notifyToolbarUpdate(session);
      },
    }));

    menu.append(new MenuItem({ type: 'separator' }));

    // Remove from Tandem
    menu.append(new MenuItem({
      label: 'Remove from Tandem',
      click: () => {
        // Send removal request to the renderer to handle with confirmation
        if (this.mainWindow) {
          this.mainWindow.webContents.send('extension-remove-request', {
            id: ext.id,
            diskId: ext.diskId,
            name: ext.name,
          });
        }
      },
    }));

    menu.popup({ window: this.mainWindow });
  }

  /** Start polling for badge updates (fallback since Electron doesn't reliably fire events) */
  startBadgePolling(session: Session): void {
    if (this.badgePollTimer) return;

    this.badgePollTimer = setInterval(() => {
      this.pollBadgeUpdates(session);
    }, 2000);
  }

  /** Stop badge polling */
  stopBadgePolling(): void {
    if (this.badgePollTimer) {
      clearInterval(this.badgePollTimer);
      this.badgePollTimer = null;
    }
  }

  /** Poll all loaded extensions for badge text changes */
  private pollBadgeUpdates(session: Session): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const allExtensions = ((session as any).extensions?.getAllExtensions?.() || (session as any).getAllExtensions?.() || []);

    for (const ext of allExtensions) {
      // Ensure all extensions have a badge state entry.
      // Electron's Extension object doesn't expose runtime badge state directly.
      // Badge text is set by extensions via chrome.action.setBadgeText() in their
      // service worker. A future Electron version may expose an API for reading it.
      if (!this.badgeState.has(ext.id)) {
        this.badgeState.set(ext.id, { text: '', color: '#4688F1' });
      }
    }
  }

  /** Send toolbar update to the renderer */
  notifyToolbarUpdate(session: Session): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    const extensions = this.getToolbarExtensions(session);
    this.mainWindow.webContents.send('extension-toolbar-update', extensions);
  }

  /** Register IPC handlers for toolbar operations */
  registerIpcHandlers(session: Session): void {
    ipcMain.handle('extension-toolbar-list', () => {
      return this.getToolbarExtensions(session);
    });

    ipcMain.handle('extension-popup-open', (_event, extensionId: string, anchorBounds?: { x: number; y: number }) => {
      this.openPopup(extensionId, session, anchorBounds);
      return { ok: true };
    });

    ipcMain.handle('extension-popup-close', () => {
      this.closePopup();
      return { ok: true };
    });

    ipcMain.handle('extension-pin', (_event, extensionId: string, pinned: boolean) => {
      this.setPin(extensionId, pinned);
      this.notifyToolbarUpdate(session);
      return { ok: true };
    });

    ipcMain.handle('extension-context-menu', (_event, extensionId: string) => {
      this.showContextMenu(extensionId, session);
      return { ok: true };
    });

    ipcMain.handle('extension-options', (_event, extensionId: string) => {
      const extensions = this.getToolbarExtensions(session);
      const ext = extensions.find(e => e.id === extensionId || e.diskId === extensionId);
      if (ext?.optionsUrl && this.mainWindow) {
        this.mainWindow.webContents.send('open-url-in-new-tab', ext.optionsUrl);
      }
      return { ok: true };
    });

    // Listen for extension-action-updated if available in Electron 40
    try {
      (session as any).on('extension-loaded', () => {
        this.notifyToolbarUpdate(session);
      });
      (session as any).on('extension-unloaded', () => {
        this.notifyToolbarUpdate(session);
      });
    } catch {
      // Events may not exist in this Electron version
    }

    // Start badge polling
    this.startBadgePolling(session);
  }

  /** Cleanup resources */
  destroy(): void {
    this.stopBadgePolling();
    this.closePopup();

    // Remove IPC handlers
    const handlers = [
      'extension-toolbar-list',
      'extension-popup-open',
      'extension-popup-close',
      'extension-pin',
      'extension-context-menu',
      'extension-options',
    ];
    for (const h of handlers) {
      try { ipcMain.removeHandler(h); } catch { /* may not exist */ }
    }
  }

  // ─── State Persistence ──────────────────────────────────────────────────────

  private loadState(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.stateFilePath, 'utf-8'));
        this.toolbarState = {
          pinned: Array.isArray(data.pinned) ? data.pinned : [],
          order: Array.isArray(data.order) ? data.order : [],
        };
      }
    } catch {
      this.toolbarState = { pinned: [], order: [] };
    }
  }

  private saveState(): void {
    try {
      const dir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.stateFilePath, JSON.stringify(this.toolbarState, null, 2));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`⚠️ Failed to save toolbar state: ${msg}`);
    }
  }
}
