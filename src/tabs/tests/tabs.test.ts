import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron before importing TabManager
vi.mock('electron', () => {
  const mockWebContents = new Map<number, any>();
  let nextWcId = 100;

  return {
    BrowserWindow: vi.fn(),
    session: {},
    webContents: {
      fromId: (id: number) => mockWebContents.get(id) || null,
    },
    WebContents: {},
    // Expose for test helpers
    __mockWebContents: mockWebContents,
    __nextWcId: () => nextWcId++,
  };
});

import { TabManager } from '../manager';

function createMockWindow() {
  let wcIdCounter = 100;
  // Simulate the renderer's tabs Map for reconcile/orphan tests.
  const rendererTabs = new Map<string, boolean>();

  const mockExecuteJavaScript = vi.fn().mockImplementation((code: string) => {
    // Route calls to the right mock behaviour based on the JS expression.
    if (code.includes('createTab(')) {
      const tabIdMatch = code.match(/createTab\("(tab-\d+)"/);
      if (tabIdMatch) rendererTabs.set(tabIdMatch[1], true);
      return Promise.resolve(wcIdCounter++);
    }
    if (code.includes('removeTab(')) {
      const tabIdMatch = code.match(/removeTab\("(tab-\d+)"/);
      if (tabIdMatch) rendererTabs.delete(tabIdMatch[1]);
      return Promise.resolve(undefined);
    }
    if (code.includes('cleanupOrphan(')) {
      const tabIdMatch = code.match(/cleanupOrphan\("(tab-\d+)"/);
      if (tabIdMatch) rendererTabs.delete(tabIdMatch[1]);
      return Promise.resolve(rendererTabs.has(tabIdMatch?.[1] ?? ''));
    }
    if (code.includes('getTabIds()')) {
      return Promise.resolve(Array.from(rendererTabs.keys()));
    }
    if (code.includes('focusTab(')) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(wcIdCounter++);
  });

  return {
    webContents: {
      executeJavaScript: mockExecuteJavaScript,
      send: vi.fn(),
    },
    _rendererTabs: rendererTabs,
  } as any;
}

describe('TabManager', () => {
  let tm: TabManager;
  let win: ReturnType<typeof createMockWindow>;

  beforeEach(() => {
    win = createMockWindow();
    tm = new TabManager(win);
  });

  describe('registerInitialTab()', () => {
    it('registers a tab and sets it as active', () => {
      const tab = tm.registerInitialTab(1, 'https://example.com');
      expect(tab.id).toBe('tab-1');
      expect(tab.webContentsId).toBe(1);
      expect(tab.url).toBe('https://example.com');
      expect(tab.active).toBe(true);
      expect(tm.getActiveTab()).toBe(tab);
    });

    it('increments tab IDs', () => {
      const t1 = tm.registerInitialTab(1, 'about:blank');
      const t2 = tm.registerInitialTab(2, 'about:blank');
      expect(t1.id).toBe('tab-1');
      expect(t2.id).toBe('tab-2');
    });
  });

  describe('openTab()', () => {
    it('creates a new tab with default values', async () => {
      const tab = await tm.openTab('https://test.com');
      expect(tab.url).toBe('https://test.com');
      expect(tab.source).toBe('robin');
      expect(tab.pinned).toBe(false);
      expect(tab.partition).toBe('persist:tandem');
      expect(tm.count).toBe(1);
    });

    it('assigns the tab to a group when groupId is provided', async () => {
      tm.setGroup('g1', 'Work', '#ff0000', []);
      const tab = await tm.openTab('https://test.com', 'g1');
      expect(tab.groupId).toBe('g1');
      const groups = tm.listGroups();
      expect(groups[0].tabIds).toContain(tab.id);
    });

    it('focuses the tab by default', async () => {
      await tm.openTab('https://one.com');
      const t2 = await tm.openTab('https://two.com');
      expect(tm.getActiveTab()?.id).toBe(t2.id);
    });

    it('does not focus when focus=false', async () => {
      const t1 = await tm.openTab('https://one.com');
      await tm.openTab('https://two.com', undefined, 'robin', 'persist:tandem', false);
      expect(tm.getActiveTab()?.id).toBe(t1.id);
    });

    it('sends tab-source-changed IPC', async () => {
      await tm.openTab('https://test.com', undefined, 'kees');
      expect(win.webContents.send).toHaveBeenCalledWith(
        'tab-source-changed',
        expect.objectContaining({ source: 'kees' })
      );
    });
  });

  describe('closeTab()', () => {
    it('removes the tab', async () => {
      const tab = await tm.openTab('https://test.com');
      expect(tm.count).toBe(1);
      const result = await tm.closeTab(tab.id);
      expect(result).toBe(true);
      expect(tm.count).toBe(0);
    });

    it('returns false for unknown tab ID', async () => {
      const result = await tm.closeTab('nonexistent');
      expect(result).toBe(false);
    });

    it('saves closed tab for reopen', async () => {
      const tab = await tm.openTab('https://important.com');
      tm.updateTab(tab.id, { title: 'Important' });
      await tm.closeTab(tab.id);
      expect(tm.hasClosedTabs()).toBe(true);
    });

    it('does not save about:blank to closed tabs', async () => {
      const tab = await tm.openTab('about:blank');
      await tm.closeTab(tab.id);
      expect(tm.hasClosedTabs()).toBe(false);
    });

    it('focuses another tab when closing the active tab', async () => {
      const t1 = await tm.openTab('https://one.com');
      const t2 = await tm.openTab('https://two.com');
      await tm.closeTab(t2.id);
      expect(tm.getActiveTab()?.id).toBe(t1.id);
    });

    it('caps closed tabs history at 10', async () => {
      for (let i = 0; i < 12; i++) {
        const tab = await tm.openTab(`https://site${i}.com`);
        await tm.closeTab(tab.id);
      }
      // Can't check internal array directly, but reopening 10 should work
      let count = 0;
      while (tm.hasClosedTabs()) {
        await tm.reopenClosedTab();
        count++;
      }
      expect(count).toBe(10);
    });
  });

  describe('focusTab()', () => {
    it('activates the target tab and deactivates the previous', async () => {
      const t1 = await tm.openTab('https://one.com');
      const t2 = await tm.openTab('https://two.com', undefined, 'robin', 'persist:tandem', false);
      await tm.focusTab(t2.id);
      expect(tm.getActiveTab()?.id).toBe(t2.id);
      expect(tm.getTab(t1.id)?.active).toBe(false);
    });

    it('returns false for unknown tab ID', async () => {
      const result = await tm.focusTab('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('updateTab()', () => {
    it('updates title, url, favicon', async () => {
      const tab = await tm.openTab('about:blank');
      tm.updateTab(tab.id, { title: 'Hello', url: 'https://hello.com', favicon: 'icon.png' });
      const updated = tm.getTab(tab.id)!;
      expect(updated.title).toBe('Hello');
      expect(updated.url).toBe('https://hello.com');
      expect(updated.favicon).toBe('icon.png');
    });

    it('ignores unknown tab IDs silently', () => {
      tm.updateTab('nonexistent', { title: 'test' });
      // No error thrown
    });
  });

  describe('listTabs()', () => {
    it('returns pinned tabs first', async () => {
      const t1 = await tm.openTab('https://one.com');
      const t2 = await tm.openTab('https://two.com');
      tm.pinTab(t2.id);
      const tabs = tm.listTabs();
      expect(tabs[0].id).toBe(t2.id);
      expect(tabs[1].id).toBe(t1.id);
    });
  });

  describe('pinTab() / unpinTab()', () => {
    it('pins and unpins a tab', async () => {
      const tab = await tm.openTab('https://test.com');
      expect(tab.pinned).toBe(false);
      tm.pinTab(tab.id);
      expect(tm.getTab(tab.id)?.pinned).toBe(true);
      tm.unpinTab(tab.id);
      expect(tm.getTab(tab.id)?.pinned).toBe(false);
    });

    it('sends IPC notification on pin change', async () => {
      const tab = await tm.openTab('https://test.com');
      tm.pinTab(tab.id);
      expect(win.webContents.send).toHaveBeenCalledWith(
        'tab-pin-changed',
        { tabId: tab.id, pinned: true }
      );
    });
  });

  describe('setTabSource()', () => {
    it('changes the tab source', async () => {
      const tab = await tm.openTab('https://test.com');
      tm.setTabSource(tab.id, 'kees');
      expect(tm.getTabSource(tab.id)).toBe('kees');
    });

    it('returns false for unknown tab', () => {
      expect(tm.setTabSource('nope', 'kees')).toBe(false);
    });
  });

  describe('groups', () => {
    it('creates a group and assigns tabs', async () => {
      const t1 = await tm.openTab('https://one.com');
      const t2 = await tm.openTab('https://two.com');
      const group = tm.setGroup('g1', 'Work', '#0000ff', [t1.id, t2.id]);
      expect(group.name).toBe('Work');
      expect(group.tabIds).toEqual([t1.id, t2.id]);
      expect(tm.getTab(t1.id)?.groupId).toBe('g1');
    });

    it('moves tab from old group to new group', async () => {
      const t1 = await tm.openTab('https://one.com');
      tm.setGroup('g1', 'Old', '#ff0000', [t1.id]);
      tm.setGroup('g2', 'New', '#00ff00', [t1.id]);
      expect(tm.getTab(t1.id)?.groupId).toBe('g2');
      const groups = tm.listGroups();
      const g1 = groups.find(g => g.id === 'g1');
      expect(g1?.tabIds).not.toContain(t1.id);
    });
  });

  describe('focusByIndex()', () => {
    it('focuses tab at the given index', async () => {
      const t1 = await tm.openTab('https://one.com');
      const t2 = await tm.openTab('https://two.com');
      await tm.focusByIndex(0);
      expect(tm.getActiveTab()?.id).toBe(t1.id);
      await tm.focusByIndex(1);
      expect(tm.getActiveTab()?.id).toBe(t2.id);
    });

    it('returns false for out-of-range index', async () => {
      await tm.openTab('https://test.com');
      expect(await tm.focusByIndex(99)).toBe(false);
      expect(await tm.focusByIndex(-1)).toBe(false);
    });
  });

  describe('hasWebContents()', () => {
    it('returns true for tracked webContentsId', async () => {
      const tab = await tm.openTab('https://test.com');
      expect(tm.hasWebContents(tab.webContentsId)).toBe(true);
    });

    it('returns false for unknown webContentsId', () => {
      expect(tm.hasWebContents(99999)).toBe(false);
    });
  });

  describe('reopenClosedTab()', () => {
    it('reopens the most recently closed tab', async () => {
      const tab = await tm.openTab('https://important.com');
      tm.updateTab(tab.id, { title: 'Important Page' });
      await tm.closeTab(tab.id);
      const reopened = await tm.reopenClosedTab();
      expect(reopened?.url).toBe('https://important.com');
      expect(reopened?.title).toBe('Important Page');
    });

    it('returns null when no closed tabs', async () => {
      const result = await tm.reopenClosedTab();
      expect(result).toBe(null);
    });
  });

  describe('zombie tab prevention', () => {
    describe('openTab() — renderer cleanup on failure', () => {
      it('calls cleanupOrphan when createTab throws', async () => {
        // Make createTab fail on next call
        win.webContents.executeJavaScript
          .mockImplementationOnce((code: string) => {
            if (code.includes('createTab(')) return Promise.reject(new Error('dom-ready timeout'));
            return Promise.resolve(undefined);
          })
          .mockImplementationOnce((code: string) => {
            // cleanupOrphan call — should be invoked after failure
            expect(code).toContain('cleanupOrphan(');
            return Promise.resolve(false);
          });

        await expect(tm.openTab('https://broken.com')).rejects.toThrow('dom-ready timeout');
        // Tab must NOT be registered in main process after failure
        expect(tm.count).toBe(0);
      });

      it('does not add the tab to main-process state when createTab fails', async () => {
        win.webContents.executeJavaScript
          .mockImplementationOnce(() => Promise.reject(new Error('timeout')))
          .mockImplementationOnce(() => Promise.resolve(false)); // cleanupOrphan

        await expect(tm.openTab('https://broken.com')).rejects.toThrow();
        expect(tm.listTabs()).toHaveLength(0);
      });
    });

    describe('closeTab() — robust against IPC failure', () => {
      it('still removes the tab from main-process state when removeTab IPC throws', async () => {
        const tab = await tm.openTab('https://test.com');
        expect(tm.count).toBe(1);

        // Make the removeTab IPC call fail
        win.webContents.executeJavaScript.mockImplementationOnce((code: string) => {
          if (code.includes('removeTab(')) return Promise.reject(new Error('renderer busy'));
          return Promise.resolve(undefined);
        });

        // closeTab should still succeed from the caller's perspective
        const result = await tm.closeTab(tab.id);
        expect(result).toBe(true);
        // Main-process state cleaned up even though IPC failed
        expect(tm.count).toBe(0);
        expect(tm.getTab(tab.id)).toBeNull();
      });
    });

    describe('reconcileWithRenderer()', () => {
      it('removes renderer orphans not known to main process', async () => {
        // Open two tabs normally
        const t1 = await tm.openTab('https://one.com');
        const t2 = await tm.openTab('https://two.com');

        // Simulate renderer having an extra orphan tab that main process lost track of.
        // Inject directly into the mock renderer state.
        win._rendererTabs.set('tab-orphan', true);

        const { removed } = await tm.reconcileWithRenderer();
        expect(removed).toContain('tab-orphan');
        // Known tabs must not be touched
        expect(removed).not.toContain(t1.id);
        expect(removed).not.toContain(t2.id);
        // Main-process Map still intact
        expect(tm.count).toBe(2);
      });

      it('returns empty array when renderer and main process are in sync', async () => {
        await tm.openTab('https://one.com');
        await tm.openTab('https://two.com');

        const { removed } = await tm.reconcileWithRenderer();
        expect(removed).toHaveLength(0);
      });

      it('returns empty array when getTabIds() fails', async () => {
        win.webContents.executeJavaScript.mockImplementationOnce((code: string) => {
          if (code.includes('getTabIds()')) return Promise.reject(new Error('renderer crash'));
          return Promise.resolve([]);
        });

        const { removed } = await tm.reconcileWithRenderer();
        expect(removed).toHaveLength(0);
      });
    });
  });
});
