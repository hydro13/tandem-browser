import { BrowserWindow, session, WebContents, webContents } from 'electron';

export type TabSource = 'robin' | 'kees' | 'copilot';

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

  constructor(win: BrowserWindow) {
    this.win = win;
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

    // Tell renderer to create a webview and return its webContentsId
    const webContentsId: number = await this.win.webContents.executeJavaScript(`
      window.__tandemTabs.createTab(${JSON.stringify(id)}, ${JSON.stringify(url)}, ${JSON.stringify(partition)})
    `);

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

    // Remove from renderer
    await this.win.webContents.executeJavaScript(`
      window.__tandemTabs.removeTab(${JSON.stringify(tabId)})
    `);

    this.tabs.delete(tabId);

    // If we closed the active tab, focus another
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
      const remaining = Array.from(this.tabs.keys());
      if (remaining.length > 0) {
        await this.focusTab(remaining[remaining.length - 1]);
      }
    }

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
    return true;
  }

  /** Unpin a tab */
  unpinTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    tab.pinned = false;
    this.win.webContents.send('tab-pin-changed', { tabId, pinned: false });
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
    const tabs = Array.from(this.tabs.values());
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
