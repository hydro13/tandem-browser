import type { BrowserWindow } from 'electron';
import type { TabManager } from '../tabs/manager';
import type { BookmarkManager } from '../bookmarks/manager';
import type { HistoryManager } from '../history/manager';
import type { PanelManager } from '../panel/manager';
import type { DownloadManager } from '../downloads/manager';
import type { PinboardManager } from '../pinboards/manager';
import type { ConfigManager } from '../config/manager';
import type { TabSource } from '../tabs/context';

/**
 * Context info passed from Electron's context-menu event on webContents.
 * Extends the native params with Tandem-specific fields.
 */
export interface ContextMenuParams {
  x: number;
  y: number;
  linkURL: string;
  linkText: string;
  srcURL: string;
  mediaType: 'none' | 'image' | 'video' | 'audio' | 'canvas' | 'file' | 'plugin';
  hasImageContents: boolean;
  pageURL: string;
  frameURL: string;
  selectionText: string;
  isEditable: boolean;
  editFlags: {
    canUndo: boolean;
    canRedo: boolean;
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canDelete: boolean;
    canSelectAll: boolean;
  };
  // Tandem-specific
  tabId?: string;
  tabSource?: TabSource;
}

/**
 * Dependencies injected into the context menu system.
 */
export interface ContextMenuDeps {
  win: BrowserWindow;
  tabManager: TabManager;
  bookmarkManager: BookmarkManager;
  historyManager: HistoryManager;
  panelManager: PanelManager;
  downloadManager: DownloadManager;
  pinboardManager: PinboardManager;
  configManager: ConfigManager;
}
