import type { BrowserWindow, WebContents} from 'electron';
import { webContents } from 'electron';
import type { SyncManager } from '../sync/manager';
import type { SessionRestoreManager } from '../session/restore';
import { createLogger } from '../utils/logger';
import { IpcChannels } from '../shared/ipc-channels';
import type { TabSource } from './context';

const log = createLogger('TabManager');

// ─── Types ──────────────────────────────────────────────────────────

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
  emoji: string | null;
  emojiFlash: boolean;
}

export interface TabGroup {
  id: string;
  name: string;
  color: string;
  tabIds: string[];
}

export interface OpenTabOptions {
  inheritSessionFrom?: string;
}

// ─── Manager ────────────────────────────────────────────────────────

/**
 * TabManager — manages multiple webview tabs in Tandem Browser.
 *
 * Each tab is a <webview> element in the shell, managed from the main process.
 * Only one tab is visible at a time; the rest are hidden.
 * In-memory only — session state is delegated to SessionRestoreManager.
 *
 * Persistence: none (in-memory, session restore via src/session/restore.ts)
 * API routes:  src/api/routes/tabs.ts
 * MCP tools:   src/mcp/tools/tabs.ts
 */
export class TabManager {

  // === 1. Private state ===

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
  private workspaceIdResolver: ((webContentsId: number) => string | null) | null = null;
  private activeTabChangedHandler: ((tab: Tab | null) => void | Promise<void>) | null = null;
  private workspaceEmptiedHandler: ((workspaceId: string) => Promise<Tab | null>) | null = null;

  // === 2. Constructor (BrowserWindow variant) ===

  constructor(win: BrowserWindow) {
    this.win = win;
  }

  // === 3. Dependency setters ===

  /** Wire up the sync manager for cross-device tab publishing. */
  setSyncManager(sm: SyncManager): void {
    this.syncManager = sm;
  }

  /** Wire up the session restore manager for crash-safe tab persistence. */
  setSessionRestore(sr: SessionRestoreManager): void {
    this.sessionRestore = sr;
  }

  /**
   * Set the callback used to look up which workspace a tab belongs to.
   * @param resolver - maps a webContentsId to its workspace ID, or null to clear
   */
  setWorkspaceIdResolver(resolver: ((webContentsId: number) => string | null) | null): void {
    this.workspaceIdResolver = resolver;
  }

  /**
   * Set the callback invoked when closing a tab would leave its workspace
   * with zero tabs. The handler is expected to open a fresh tab (typically
   * Tandem's newtab page) and assign it to the given workspace, then
   * return the created Tab. If it returns null, `closeTab` falls back to
   * picking any remaining tab from another workspace, preserving prior
   * behavior.
   *
   * Without this handler, closing the last tab in a non-default workspace
   * silently transports the user to whichever workspace owns the fallback
   * tab — the Bug-2 pattern observed during live dogfooding on 2026-04-18.
   *
   * @param handler - async function that creates and assigns a replacement
   * tab to the emptied workspace, or returns null to defer to the default
   * fallback
   */
  setWorkspaceEmptiedHandler(handler: ((workspaceId: string) => Promise<Tab | null>) | null): void {
    this.workspaceEmptiedHandler = handler;
  }

  /** Wire a callback that runs after the active tab changes. */
  setActiveTabChangedHandler(handler: ((tab: Tab | null) => void | Promise<void>) | null): void {
    this.activeTabChangedHandler = handler;
  }

  // === 4. Public methods ===

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

  /** Get the active tab's webContents ID, or null when no tab is focused. */
  getActiveWebContentsId(): number | null {
    return this.getActiveTab()?.webContentsId ?? null;
  }

  /** List tracked webContents IDs for all tabs. */
  listWebContentsIds(): number[] {
    return this.listTabs().map(tab => tab.webContentsId);
  }

  /** Get a tab by ID */
  getTab(tabId: string): Tab | null {
    return this.tabs.get(tabId) || null;
  }

  /** List all tabs — pinned tabs first */
  listTabs(): Tab[] {
    const all = Array.from(this.tabs.values());
    return all.sort((a, b) => {
      if (a.pinned === b.pinned) return 0;
      return a.pinned ? -1 : 1;
    });
  }

  /** Get tab count */
  get count(): number {
    return this.tabs.size;
  }

  /** Check if a webContentsId is tracked by any tab */
  hasWebContents(wcId: number): boolean {
    for (const tab of this.tabs.values()) {
      if (tab.webContentsId === wcId) return true;
    }
    return false;
  }

  /** Open a new tab */
  async openTab(
    url: string = 'about:blank',
    groupId?: string,
    source: TabSource = 'user',
    partition: string = 'persist:tandem',
    focus: boolean = true,
    options?: OpenTabOptions,
  ): Promise<Tab> {
    const id = this.nextId();
    const inheritedTab = this.resolveInheritedTab(options);
    const resolvedPartition = inheritedTab?.partition ?? partition;
    const resolvedUrl = url === 'about:blank' && inheritedTab?.url
      ? inheritedTab.url
      : url;

    // Tell renderer to create a webview and return its webContentsId.
    // If createTab() fails (e.g. dom-ready timeout), the renderer may have already
    // added a partial entry (webview + tabEl + tabs Map entry). We clean it up here
    // to prevent it from becoming an uncloseable zombie in the renderer's tab strip.
    if (!this.win || this.win.isDestroyed() || this.win.webContents.isDestroyed()) {
      throw new Error('TabManager: main window has been destroyed, cannot open tab');
    }
    let webContentsId: number;
    try {
      webContentsId = await this.win.webContents.executeJavaScript(`
        window.__tandemTabs.createTab(${JSON.stringify(id)}, ${JSON.stringify(resolvedUrl)}, ${JSON.stringify(resolvedPartition)})
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
      url: resolvedUrl,
      favicon: '',
      groupId: groupId || null,
      active: false,
      createdAt: Date.now(),
      source,
      pinned: false,
      partition: resolvedPartition,
      emoji: null,
      emojiFlash: false,
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
    this.win.webContents.send(IpcChannels.TAB_SOURCE_CHANGED, { tabId: id, source });

    if (inheritedTab) {
      await this.restoreIndexedDbFromSource(inheritedTab.id, id, resolvedUrl);
    }

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
      log.warn(`removeTab IPC failed for ${tabId}:`, e instanceof Error ? e.message : String(e));
    }

    // Capture the closed tab's workspace BEFORE deleting it from the map so
    // the successor-picking below can prefer a tab in the same workspace.
    // Without this, closing the last new tab in the current workspace would
    // pick whichever tab happens to sit at the end of insertion order —
    // often from a different workspace — and the activeTabChanged reconcile
    // would then drag activeId along with it (see reconcileTabState's
    // followFocusedTab path in WorkspaceManager).
    const closedWorkspaceId = this.workspaceIdResolver?.(tab.webContentsId) ?? null;

    this.tabs.delete(tabId);

    // If we closed the active tab, focus another.
    //
    // Successor selection rules (in order):
    //   1. Prefer a tab in the SAME workspace as the closed tab. Prevents
    //      silent cross-workspace focus swings during close.
    //   2. If the closed workspace has no remaining tabs, delegate to the
    //      workspace-emptied handler. The handler is expected to open a
    //      fresh newtab.html in that workspace so the workspace itself
    //      stays selected. This is the fix for Bug 2 (empty workspace
    //      silently falls through to another workspace).
    //   3. If no handler is wired, or it returns null, fall back to any
    //      remaining tab anywhere. Preserves prior behavior for tests
    //      and for edge cases where the closed workspace is unknown.
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
      let successor: Tab | null = null;

      if (closedWorkspaceId) {
        successor = this.pickSameWorkspaceSuccessor(closedWorkspaceId);
      }

      if (!successor && closedWorkspaceId && this.workspaceEmptiedHandler) {
        try {
          successor = await this.workspaceEmptiedHandler(closedWorkspaceId);
        } catch (e) {
          log.warn(
            `workspaceEmptiedHandler failed for ${closedWorkspaceId}:`,
            e instanceof Error ? e.message : String(e),
          );
        }
      }

      if (!successor) {
        successor = this.pickAnyRemainingSuccessor();
      }

      if (successor) {
        await this.focusTab(successor.id);
      } else {
        await this.notifyActiveTabChanged(null);
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

    await this.notifyActiveTabChanged(tab);

    return true;
  }

  /** Focus tab by index (0-based, for Cmd+1-9) */
  async focusByIndex(index: number): Promise<boolean> {
    const tabs = this.listTabs();
    if (index >= 0 && index < tabs.length) {
      return this.focusTab(tabs[index].id);
    }
    return false;
  }

  /** Change the source/controller of a tab */
  setTabSource(tabId: string, source: TabSource): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    tab.source = source;
    this.win.webContents.send(IpcChannels.TAB_SOURCE_CHANGED, { tabId, source });
    return true;
  }

  /** Get a tab's source */
  getTabSource(tabId: string): TabSource | null {
    const tab = this.tabs.get(tabId);
    return tab ? tab.source : null;
  }

  /** Set an emoji badge on a tab */
  setEmoji(tabId: string, emoji: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    tab.emoji = emoji;
    tab.emojiFlash = false;
    this.win.webContents.send(IpcChannels.TAB_EMOJI_CHANGED, { tabId, emoji, flash: false });
    this.onTabsChanged();
    return true;
  }

  /** Remove emoji badge from a tab */
  clearEmoji(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    tab.emoji = null;
    tab.emojiFlash = false;
    this.win.webContents.send(IpcChannels.TAB_EMOJI_CHANGED, { tabId, emoji: null, flash: false });
    this.onTabsChanged();
    return true;
  }

  /** Flash an emoji on a tab (AI signals user to look at this tab) */
  flashEmoji(tabId: string, emoji: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    tab.emoji = emoji;
    tab.emojiFlash = true;
    this.win.webContents.send(IpcChannels.TAB_EMOJI_CHANGED, { tabId, emoji, flash: true });
    this.onTabsChanged();
    return true;
  }

  /** Get a tab's emoji */
  getEmoji(tabId: string): string | null {
    const tab = this.tabs.get(tabId);
    return tab ? tab.emoji : null;
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

  /** Pin a tab */
  pinTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    tab.pinned = true;
    this.win.webContents.send(IpcChannels.TAB_PIN_CHANGED, { tabId, pinned: true });
    this.onTabsChanged();
    return true;
  }

  /** Unpin a tab */
  unpinTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    tab.pinned = false;
    this.win.webContents.send(IpcChannels.TAB_PIN_CHANGED, { tabId, pinned: false });
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
      source: 'user',
      pinned: false,
      partition: 'persist:tandem',
      emoji: null,
      emojiFlash: false,
    };
    this.tabs.set(id, tab);
    this.activeTabId = id;
    void this.notifyActiveTabChanged(tab);
    return tab;
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

  // === 5. Sync integration ===

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
        workspaceId: this.workspaceIdResolver?.(t.webContentsId) ?? null,
      }));
      this.sessionRestore.save(tabs, this.activeTabId);
    }, 500);
  }

  // === 6. Cleanup ===
  // (none — timers are cleared naturally; no explicit destroy needed)

  // === 7. Private I/O ===
  // (no file persistence — session state delegated to SessionRestoreManager)

  /** Generate unique tab ID */
  private nextId(): string {
    return `tab-${++this.counter}`;
  }

  /**
   * Pick the most-recently-inserted remaining tab in the same workspace
   * as the closed tab, or null if that workspace has no other tabs.
   *
   * Same-workspace preference prevents silent cross-workspace focus
   * swings: closing a new tab in workspace X should keep focus in X
   * rather than reconciling activeId to whichever workspace owns the
   * alphabetically-last remaining tab.
   */
  private pickSameWorkspaceSuccessor(closedWorkspaceId: string): Tab | null {
    if (!this.workspaceIdResolver) return null;
    const remaining = Array.from(this.tabs.values());
    const sameWorkspace = remaining.filter(
      (t) => this.workspaceIdResolver?.(t.webContentsId) === closedWorkspaceId,
    );
    if (sameWorkspace.length === 0) return null;
    return sameWorkspace[sameWorkspace.length - 1];
  }

  /**
   * Fallback successor picker used when neither the same-workspace
   * preference nor the workspace-emptied handler produces a tab.
   * Returns the most-recently-inserted remaining tab from any workspace,
   * or null if no tabs remain anywhere.
   */
  private pickAnyRemainingSuccessor(): Tab | null {
    const remaining = Array.from(this.tabs.values());
    if (remaining.length === 0) return null;
    return remaining[remaining.length - 1];
  }

  private resolveInheritedTab(options?: OpenTabOptions): Tab | null {
    if (!options?.inheritSessionFrom) {
      return null;
    }

    const inheritedTab = this.tabs.get(options.inheritSessionFrom) || null;
    if (!inheritedTab) {
      log.warn(`inheritSessionFrom ignored: source tab '${options.inheritSessionFrom}' not found`);
      return null;
    }

    return inheritedTab;
  }

  private buildIndexedDbDumpScript(): string {
    return `(() => {
      const openDatabase = (name, version) => new Promise((resolve, reject) => {
        const request = typeof version === 'number' ? indexedDB.open(name, version) : indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB database'));
      });

      const readStoreEntries = (store) => new Promise((resolve, reject) => {
        const entries = [];
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            entries.push([cursor.key, cursor.value]);
            cursor.continue();
            return;
          }
          resolve(entries);
        };
        request.onerror = () => reject(request.error || new Error('Failed to read IndexedDB cursor'));
      });

      return (async () => {
        if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
          return '{}';
        }

        const databases = await indexedDB.databases();
        const dump = {};

        for (const info of databases) {
          if (!info || !info.name) continue;

          const db = await openDatabase(info.name, typeof info.version === 'number' ? info.version : undefined);
          try {
            dump[info.name] = { version: db.version, stores: {} };
            for (const storeName of Array.from(db.objectStoreNames)) {
              const tx = db.transaction(storeName, 'readonly');
              const store = tx.objectStore(storeName);
              dump[info.name].stores[storeName] = await readStoreEntries(store);
            }
          } finally {
            db.close();
          }
        }

        return JSON.stringify(dump);
      })();
    })()`;
  }

  private buildIndexedDbRestoreScript(dumpJson: string): string {
    return `((rawDump) => {
      const openDatabase = (name, version, stores) => new Promise((resolve, reject) => {
        const request = indexedDB.open(name, version);
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const storeName of Object.keys(stores)) {
            if (!db.objectStoreNames.contains(storeName)) {
              db.createObjectStore(storeName);
            }
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB database for restore'));
      });

      const waitForTransaction = (tx) => new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
      });

      return (async () => {
        const dump = JSON.parse(rawDump || '{}');
        for (const [dbName, dbInfo] of Object.entries(dump)) {
          const version = typeof dbInfo.version === 'number' ? dbInfo.version : 1;
          const stores = dbInfo && typeof dbInfo === 'object' && dbInfo.stores && typeof dbInfo.stores === 'object'
            ? dbInfo.stores
            : {};
          const db = await openDatabase(dbName, version, stores);
          try {
            for (const [storeName, entries] of Object.entries(stores)) {
              const tx = db.transaction(storeName, 'readwrite');
              const store = tx.objectStore(storeName);
              for (const entry of entries) {
                if (!Array.isArray(entry) || entry.length !== 2) continue;
                store.put(entry[1], entry[0]);
              }
              await waitForTransaction(tx);
            }
          } finally {
            db.close();
          }
        }
        return true;
      })();
    })(${JSON.stringify(dumpJson)})`;
  }

  private async restoreIndexedDbFromSource(sourceTabId: string, targetTabId: string, targetUrl: string): Promise<boolean> {
    const sourceWc = this.getWebContents(sourceTabId);
    const targetWc = this.getWebContents(targetTabId);
    if (!sourceWc || sourceWc.isDestroyed() || !targetWc || targetWc.isDestroyed()) {
      log.warn(`IndexedDB inherit skipped: source or target webContents missing (${sourceTabId} -> ${targetTabId})`);
      return false;
    }

    try {
      const dumpJson = await sourceWc.executeJavaScript(this.buildIndexedDbDumpScript()) as string;
      if (!dumpJson || dumpJson === '{}') {
        log.info(`IndexedDB inherit: no databases found in source tab ${sourceTabId}`);
        return false;
      }

      await targetWc.executeJavaScript(this.buildIndexedDbRestoreScript(dumpJson));
      if (targetUrl !== 'about:blank') {
        await targetWc.loadURL(targetUrl);
      }
      return true;
    } catch (error) {
      log.warn(
        `IndexedDB inherit failed for ${sourceTabId} -> ${targetTabId}:`,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }

  private async notifyActiveTabChanged(tab: Tab | null): Promise<void> {
    if (!this.activeTabChangedHandler) {
      return;
    }

    try {
      await this.activeTabChangedHandler(tab);
    } catch (error) {
      log.warn(
        'Active tab changed handler failed:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
