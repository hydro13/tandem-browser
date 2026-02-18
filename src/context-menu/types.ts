import { BrowserWindow } from 'electron';
import { TabManager } from '../tabs/manager';
import { BookmarkManager } from '../bookmarks/manager';
import { HistoryManager } from '../history/manager';
import { PanelManager } from '../panel/manager';
import { DownloadManager } from '../downloads/manager';

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
  tabSource?: 'robin' | 'kees';
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
}
