import { describe, it, expect, vi, beforeEach } from 'vitest';
import type fs from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{}'),
  };
});

vi.mock('../../utils/paths', () => ({
  tandemDir: vi.fn((...parts: string[]) => `/tmp/tandem/${parts.join('/')}`),
  ensureDir: vi.fn((value: string) => value),
}));

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

import * as fsModule from 'fs';
import { SidebarManager } from '../manager';

describe('SidebarManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fsModule.existsSync).mockReturnValue(false);
  });

  function createManager(): SidebarManager {
    return new SidebarManager();
  }

  describe('getConfig', () => {
    it('returns default config on fresh state', () => {
      const sm = createManager();
      const config = sm.getConfig();
      expect(config.state).toBe('wide');
      expect(config.activeItemId).toBeNull();
      expect(config.panelPinned).toBe(false);
      expect(config.items.length).toBeGreaterThan(0);
    });

    it('includes expected default items', () => {
      const sm = createManager();
      const config = sm.getConfig();
      const ids = config.items.map(i => i.id);
      expect(ids).toContain('workspaces');
      expect(ids).toContain('bookmarks');
      expect(ids).toContain('history');
      expect(ids).toContain('downloads');
      expect(ids).toContain('gmail');
    });

    it('has downloads disabled by default', () => {
      const sm = createManager();
      const downloads = sm.getConfig().items.find(i => i.id === 'downloads');
      expect(downloads?.enabled).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('updates state', () => {
      const sm = createManager();
      const updated = sm.updateConfig({ state: 'hidden' });
      expect(updated.state).toBe('hidden');
    });

    it('updates activeItemId', () => {
      const sm = createManager();
      const updated = sm.updateConfig({ activeItemId: 'bookmarks' });
      expect(updated.activeItemId).toBe('bookmarks');
    });

    it('updates panelPinned', () => {
      const sm = createManager();
      const updated = sm.updateConfig({ panelPinned: true });
      expect(updated.panelPinned).toBe(true);
    });

    it('preserves unmodified fields', () => {
      const sm = createManager();
      sm.updateConfig({ state: 'narrow' });
      const config = sm.getConfig();
      expect(config.state).toBe('narrow');
      expect(config.activeItemId).toBeNull(); // unchanged
    });

    it('persists to disk', () => {
      const sm = createManager();
      sm.updateConfig({ state: 'hidden' });
      expect(fsModule.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('toggleItem', () => {
    it('toggles an enabled item to disabled', () => {
      const sm = createManager();
      const result = sm.toggleItem('bookmarks');
      expect(result).toBeDefined();
      expect(result!.enabled).toBe(false);
    });

    it('toggles a disabled item to enabled', () => {
      const sm = createManager();
      const result = sm.toggleItem('downloads'); // disabled by default
      expect(result).toBeDefined();
      expect(result!.enabled).toBe(true);
    });

    it('returns undefined for nonexistent item', () => {
      const sm = createManager();
      expect(sm.toggleItem('nonexistent')).toBeUndefined();
    });

    it('persists the toggle', () => {
      const sm = createManager();
      vi.mocked(fsModule.writeFileSync).mockClear();
      sm.toggleItem('bookmarks');
      expect(fsModule.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('reorderItems', () => {
    it('reorders items by given ID sequence', () => {
      const sm = createManager();
      const originalIds = sm.getConfig().items.map(i => i.id);
      const reversed = [...originalIds].reverse();
      sm.reorderItems(reversed);
      const config = sm.getConfig();
      expect(config.items[0].id).toBe(reversed[0]);
      expect(config.items[config.items.length - 1].id).toBe(reversed[reversed.length - 1]);
    });

    it('handles partial ID list (only reorders specified items)', () => {
      const sm = createManager();
      sm.reorderItems(['history', 'bookmarks']);
      const config = sm.getConfig();
      const historyItem = config.items.find(i => i.id === 'history')!;
      const bookmarksItem = config.items.find(i => i.id === 'bookmarks')!;
      expect(historyItem.order).toBe(0);
      expect(bookmarksItem.order).toBe(1);
    });
  });

  describe('setState', () => {
    it('sets state to hidden', () => {
      const sm = createManager();
      sm.setState('hidden');
      expect(sm.getConfig().state).toBe('hidden');
    });

    it('sets state to narrow', () => {
      const sm = createManager();
      sm.setState('narrow');
      expect(sm.getConfig().state).toBe('narrow');
    });

    it('sets state to wide', () => {
      const sm = createManager();
      sm.setState('narrow');
      sm.setState('wide');
      expect(sm.getConfig().state).toBe('wide');
    });
  });

  describe('setActiveItem', () => {
    it('sets active item by id', () => {
      const sm = createManager();
      sm.setActiveItem('bookmarks');
      expect(sm.getConfig().activeItemId).toBe('bookmarks');
    });

    it('clears active item with null', () => {
      const sm = createManager();
      sm.setActiveItem('bookmarks');
      sm.setActiveItem(null);
      expect(sm.getConfig().activeItemId).toBeNull();
    });
  });

  describe('loading from disk', () => {
    it('merges saved config with defaults', () => {
      vi.mocked(fsModule.existsSync).mockReturnValue(true);
      vi.mocked(fsModule.readFileSync).mockReturnValue(JSON.stringify({
        state: 'narrow',
        activeItemId: 'history',
        panelPinned: true,
        panelWidths: { history: 350 },
        items: [
          { id: 'workspaces', label: 'Workspaces', icon: '', type: 'panel', enabled: true, order: 0 },
        ],
      }));
      const sm = createManager();
      const config = sm.getConfig();
      expect(config.state).toBe('narrow');
      expect(config.panelPinned).toBe(true);
      // Should merge missing default items
      expect(config.items.length).toBeGreaterThan(1);
      const ids = config.items.map(i => i.id);
      expect(ids).toContain('workspaces');
      expect(ids).toContain('bookmarks'); // merged from defaults
    });

    it('handles corrupted file gracefully', () => {
      vi.mocked(fsModule.existsSync).mockReturnValue(true);
      vi.mocked(fsModule.readFileSync).mockReturnValue('not json');
      const sm = createManager();
      const config = sm.getConfig();
      expect(config.state).toBe('wide'); // falls back to default
    });
  });

  describe('destroy', () => {
    it('does not throw', () => {
      const sm = createManager();
      expect(() => sm.destroy()).not.toThrow();
    });
  });
});
