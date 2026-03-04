import type { BrowserWindow, WebContents} from 'electron';
import { webContents } from 'electron';
import type { SyncManager } from '../sync/manager';
import type { SessionRestoreManager } from '../session/restore';

export type TabSource = 'robin' | 'kees' | 'wingman';

export interface Tab {
  id: string;
  webContentsId: number;
  title: string;
  url: string;
  favicon: string;
  groupId: string | null;
  active: boolean;
  createdAt: number;
  source: TabSource;
  pinned: boolean;
  partition: string;
}

export interface TabGroup {
  id: string;
  name: string;
  color: string;
  tabIds: string[];
}

/**
 * TabManager — Manages multiple webview tabs in Tandem Browser.
 * 
 * Each tab is a <webview> element in the shell, managed from the main process.
 * Only one tab is visible at a time; the rest are hidden.
 */
export class TabManager {
  private win: BrowserWindow;
  private tabs: Map<string, Tab> = new Map();
  private groups: Map<string, TabGroup> = new Map();
  private activeTabId: string | null = null;
  private counter = 0;
  private closedTabs: { url: string; title: string }[] = [];
  private syncManager: SyncManager | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionRestore: SessionRestoreManager | null = null;
  private sessionTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(win: BrowserWindow) {
    this.win = win;
  }

  setSyncManager(sm: SyncManager): void {
    this.syncManager = sm;
  }

  setSessionRestore(sr: SessionRestoreManager): void {
    this.sessionRestore = sr;
  }

  /** Debounced save of session state (500ms delay) */
  private onTabsChanged(): void {
    if (!this.sessionRestore) return;
    if (this.sessionTimer) clearTimeout(this.sessionTimer);
    this.sessionTimer = setTimeout(() => {
      this.sessionTimer = null;
      if (!this.sessionRestore) return;
      const tabs = this.listTabs().map(t => ({
        id: t.id,
        url: t.url,
        title: t.title,
        groupId: t.groupId,
        pinned: t.pinned,
      }));
      this.sessionRestore.save(tabs, this.activeTabId);
    }, 500);
  }

  /** Debounced publish of tabs to sync folder (2 second delay) */
  private scheduleSyncPublish(): void {
    if (!this.syncManager || !this.syncManager.isConfigured()) return;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      if (!this.syncManager?.isConfigured()) return;
      this.syncManager.publishTabs(this.listTabs().map(t => ({
        tabId: t.id,
        url: t.url,
        title: t.title,
        favicon: t.favicon,
      })));
    }, 2000);
  }

  /** Generate unique tab ID */
  private nextId(): string {
    return `tab-${++this.counter}`;
  }

  /** Get the active tab */
  getActiveTab(): Tab | null {
    if (!this.activeTabId) return null;
    return this.tabs.get(this.activeTabId) || null;
  }

  /** Get active tab's WebContents */
  async getActiveWebContents(): Promise<WebContents | null> {
    const tab = this.getActiveTab();
    if (!tab) return null;
    return webContents.fromId(tab.webContentsId) || null;
  }

  /** Get WebContents for a specific tab */
  getWebContents(tabId: string): WebContents | null {
    const tab = this.tabs.get(tabId);
    if (!tab) return null;
    return webContents.fromId(tab.webContentsId) || null;
  }

  /** Open a new tab */
  async openTab(url: string = 'about:blank', groupId?: string, source: TabSource = 'robin', partition: string = 'persist:tandem', focus: boolean = true): Promise<Tab> {
    const id = this.nextId();

    // Tell renderer to create a webview and return its webContentsId.
    // If createTab() fails (e.g. dom-ready timeout), the renderer may have already
    // added a partial entry (webview + tabEl + tabs Map entry). We clean it up here
    // to prevent it from becoming an uncloseable zombie in the renderer's tab strip.
    let webContentsId: number;
    try {
      webContentsId = await this.win.webContents.executeJavaScript(`
        window.__tandemTabs.createTab(${JSON.stringify(id)}, ${JSON.stringify(url)}, ${JSON.stringify(partition)})
      `);
    } catch (e) {
      // Best-effort renderer cleanup — ignore secondary errors.
      try {
        await this.win.webContents.executeJavaScript(
          `window.__tandemTabs.cleanupOrphan(${JSON.stringify(id)})`
        );
      } catch { /* renderer may be in bad state; nothing more we can do */ }
      throw e;
    }

    const tab: Tab = {
      id,
      webContentsId,
      title: 'New Tab',
      url,
      favicon: '',
      groupId: groupId || null,
      active: false,
      createdAt: Date.now(),
      source,
      pinned: false,
      partition,
    };

    this.tabs.set(id, tab);

    if (groupId && this.groups.has(groupId)) {
      this.groups.get(groupId)!.tabIds.push(id);
    }

    // Focus the new tab BEFORE sending source indicator,
    // because focusTab's renderer patch (origTabClickHandler) checks
    // the source indicator and resets AI tabs back to robin.
    // When focus=false, the tab is created in the background — useful when
    // an existing tab (e.g. Discord) must stay active and retain its JS memory state.
    if (focus) {
      await this.focusTab(id);
    }

    // Now notify renderer of source indicator (after focus is done)
    this.win.webContents.send('tab-source-changed', { tabId: id, source });

    this.scheduleSyncPublish();
    this.onTabsChanged();
    return tab;
  }

  /** Close a tab */
  async closeTab(tabId: string): Promise<boolean> {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    // Save for "Reopen Closed Tab" (capped at 10)
    if (tab.url && tab.url !== 'about:blank') {
      this.closedTabs.push({ url: tab.url, title: tab.title });
      if (this.closedTabs.length > 10) {
        this.closedTabs.shift();
      }
    }

    // Remove from group
    if (tab.groupId) {
      const group = this.groups.get(tab.groupId);
      if (group) {
        group.tabIds = group.tabIds.filter(id => id !== tabId);
        if (group.tabIds.length === 0) {
          this.groups.delete(tab.groupId);
        }
      }
    }

    // Remove from renderer. If the IPC call fails for any reason (e.g. renderer
    // is busy or the webview entry is already gone), we still proceed with
    // main-process cleanup so the tab doesn't become permanently uncloseable.
    try {
      await this.win.webContents.executeJavaScript(`
        window.__tandemTabs.removeTab(${JSON.stringify(tabId)})
      `);
    } catch (e) {
      // Log but don't abort — main-process state must still be cleaned up.
      console.warn(`[TabManager] removeTab IPC failed for ${tabId}:`, e instanceof Error ? e.message : String(e));
    }

    this.tabs.delete(tabId);

    // If we closed the active tab, focus another
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
      const remaining = Array.from(this.tabs.keys());
      if (remaining.length > 0) {
        await this.focusTab(remaining[remaining.length - 1]);
      }
    }

    this.scheduleSyncPublish();
    this.onTabsChanged();
    return true;
  }

  /** Focus/activate a tab */
  async focusTab(tabId: string): Promise<boolean> {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    // Deactivate current
    if (this.activeTabId && this.activeTabId !== tabId) {
      const prev = this.tabs.get(this.activeTabId);
      if (prev) prev.active = false;
    }

    tab.active = true;
    this.activeTabId = tabId;

    // Tell renderer to show this tab
    await this.win.webContents.executeJavaScript(`
      window.__tandemTabs.focusTab(${JSON.stringify(tabId)})
    `);

    return true;
  }

  /** Change the source/controller of a tab */
  setTabSource(tabId: string, source: TabSource): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    tab.source = source;
    this.win.webContents.send('tab-source-changed', { tabId, source });
    return true;
  }

  /** Get a tab's source */
  getTabSource(tabId: string): TabSource | null {
    const tab = this.tabs.get(tabId);
    return tab ? tab.source : null;
  }

  /** Update tab metadata (called from renderer events) */
  updateTab(tabId: string, updates: Partial<Pick<Tab, 'title' | 'url' | 'favicon'>>): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    if (updates.title !== undefined) tab.title = updates.title;
    if (updates.url !== undefined) tab.url = updates.url;
    if (updates.favicon !== undefined) tab.favicon = updates.favicon;
    this.scheduleSyncPublish();
    this.onTabsChanged();
  }

  /** List all tabs — pinned tabs first */
  listTabs(): Tab[] {
    const all = Array.from(this.tabs.values());
    return all.sort((a, b) => {
      if (a.pinned === b.pinned) return 0;
      return a.pinned ? -1 : 1;
    });
  }

  /** Pin a tab */
  pinTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    tab.pinned = true;
    this.win.webContents.send('tab-pin-changed', { tabId, pinned: true });
    this.onTabsChanged();
    return true;
  }

  /** Unpin a tab */
  unpinTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    tab.pinned = false;
    this.win.webContents.send('tab-pin-changed', { tabId, pinned: false });
    this.onTabsChanged();
    return true;
  }

  /** Create or update a tab group */
  setGroup(groupId: string, name: string, color: string, tabIds: string[]): TabGroup {
    const group: TabGroup = { id: groupId, name, color, tabIds: [] };

    // Update tabs' groupId
    for (const tabId of tabIds) {
      const tab = this.tabs.get(tabId);
      if (tab) {
        // Remove from old group
        if (tab.groupId && tab.groupId !== groupId) {
          const oldGroup = this.groups.get(tab.groupId);
          if (oldGroup) {
            oldGroup.tabIds = oldGroup.tabIds.filter(id => id !== tabId);
          }
        }
        tab.groupId = groupId;
        group.tabIds.push(tabId);
      }
    }

    this.groups.set(groupId, group);
    this.onTabsChanged();
    return group;
  }

  /** List all groups */
  listGroups(): TabGroup[] {
    return Array.from(this.groups.values());
  }

  /** Check if a webContentsId is tracked by any tab */
  hasWebContents(wcId: number): boolean {
    for (const tab of this.tabs.values()) {
      if (tab.webContentsId === wcId) return true;
    }
    return false;
  }

  /** Get tab count */
  get count(): number {
    return this.tabs.size;
  }

  /** Focus tab by index (0-based, for Cmd+1-9) */
  async focusByIndex(index: number): Promise<boolean> {
    const tabs = this.listTabs();
    if (index >= 0 && index < tabs.length) {
      return this.focusTab(tabs[index].id);
    }
    return false;
  }

  /** Check if there are recently closed tabs to reopen */
  hasClosedTabs(): boolean {
    return this.closedTabs.length > 0;
  }

  /** Reopen the most recently closed tab */
  async reopenClosedTab(): Promise<Tab | null> {
    const last = this.closedTabs.pop();
    if (!last) return null;
    const tab = await this.openTab(last.url);
    if (last.title) tab.title = last.title;
    return tab;
  }

  /** Get a tab by ID */
  getTab(tabId: string): Tab | null {
    return this.tabs.get(tabId) || null;
  }

  /**
   * Reconcile main-process tab state with the renderer's tab strip.
   *
   * The renderer maintains its own `tabs` Map that can drift out of sync with the
   * main-process `this.tabs` Map when `openTab()` fails after the renderer has
   * already created the DOM elements.  Any tab ID known to the renderer but
   * unknown to the main process is an orphan — it shows in the UI but cannot be
   * interacted with or closed through normal means.
   *
   * This method queries the renderer for its current tab IDs and removes any
   * orphans it finds, eliminating the zombie-tab problem at its root.
   *
   * Call after session restore (to catch failed restores) or on-demand via the
   * `/tabs/reconcile` API endpoint.
   */
  async reconcileWithRenderer(): Promise<{ removed: string[] }> {
    let rendererTabIds: string[];
    try {
      rendererTabIds = await this.win.webContents.executeJavaScript(
        `window.__tandemTabs.getTabIds()`
      ) as string[];
    } catch {
      // Renderer not ready or getTabIds not yet exposed — nothing to reconcile.
      return { removed: [] };
    }

    const mainTabIds = new Set(this.tabs.keys());
    const removed: string[] = [];

    for (const rtabId of rendererTabIds) {
      if (!mainTabIds.has(rtabId)) {
        // Renderer has this tab but main process doesn't → orphan → clean up.
        try {
          await this.win.webContents.executeJavaScript(
            `window.__tandemTabs.cleanupOrphan(${JSON.stringify(rtabId)})`
          );
          removed.push(rtabId);
        } catch { /* best-effort */ }
      }
    }

    return { removed };
  }

  /** Register an existing webview (for the initial tab) */
  registerInitialTab(webContentsId: number, url: string): Tab {
    const id = this.nextId();
    const tab: Tab = {
      id,
      webContentsId,
      title: 'New Tab',
      url,
      favicon: '',
      groupId: null,
      active: true,
      createdAt: Date.now(),
      source: 'robin',
      pinned: false,
      partition: 'persist:tandem',
    };
    this.tabs.set(id, tab);
    this.activeTabId = id;
    return tab;
  }
}
