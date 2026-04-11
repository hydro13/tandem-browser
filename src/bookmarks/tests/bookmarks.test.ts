import { describe, it, expect, vi, beforeEach } from 'vitest';
import type fsType from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fsType>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(false),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn().mockReturnValue('{"bookmarks":[],"lastModified":"2024-01-01T00:00:00.000Z"}'),
    },
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{"bookmarks":[],"lastModified":"2024-01-01T00:00:00.000Z"}'),
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

import fs from 'fs';
import { BookmarkManager } from '../manager';

describe('BookmarkManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  // Use a helper to get a fresh manager for each test
  function createManager(): BookmarkManager {
    return new BookmarkManager();
  }

  describe('list', () => {
    it('returns empty array on fresh state', () => {
      const bm = createManager();
      expect(bm.list()).toEqual([]);
    });
  });

  describe('add', () => {
    it('adds a bookmark to top level', () => {
      const bm = createManager();
      const result = bm.add('Google', 'https://google.com');
      expect(result.name).toBe('Google');
      expect(result.url).toBe('https://google.com');
      expect(result.type).toBe('url');
      expect(result.id).toBeTruthy();
      expect(bm.list()).toHaveLength(1);
    });

    it('adds a bookmark to a folder', () => {
      const bm = createManager();
      const folder = bm.addFolder('Work');
      const bookmark = bm.add('Jira', 'https://jira.com', folder.id);
      expect(bookmark.parentId).toBe(folder.id);
      // Should be in the folder's children, not top-level
      expect(bm.list()).toHaveLength(1); // Only folder at top level
      expect(bm.listFlat()).toHaveLength(2); // folder + bookmark
    });

    it('falls back to top level if parent not found', () => {
      const bm = createManager();
      const bookmark = bm.add('Test', 'https://test.com', 'nonexistent');
      expect(bm.list()).toHaveLength(1);
      expect(bm.list()[0].id).toBe(bookmark.id);
    });

    it('falls back to top level if parent is not a folder', () => {
      const bm = createManager();
      const url = bm.add('Parent', 'https://parent.com');
      const child = bm.add('Child', 'https://child.com', url.id);
      expect(bm.list()).toHaveLength(2); // Both at top level
      expect(child.parentId).toBe(url.id);
    });
  });

  describe('addFolder', () => {
    it('creates a folder with children array', () => {
      const bm = createManager();
      const folder = bm.addFolder('Work');
      expect(folder.type).toBe('folder');
      expect(folder.children).toEqual([]);
      expect(folder.name).toBe('Work');
    });

    it('creates a nested folder', () => {
      const bm = createManager();
      const parent = bm.addFolder('Work');
      const child = bm.addFolder('Projects', parent.id);
      expect(child.parentId).toBe(parent.id);
      expect(bm.list()).toHaveLength(1);
      expect(bm.listFlat()).toHaveLength(2);
    });
  });

  describe('remove', () => {
    it('removes a top-level bookmark', () => {
      const bm = createManager();
      const b = bm.add('Test', 'https://test.com');
      expect(bm.remove(b.id)).toBe(true);
      expect(bm.list()).toHaveLength(0);
    });

    it('removes a nested bookmark', () => {
      const bm = createManager();
      const folder = bm.addFolder('Work');
      const b = bm.add('Jira', 'https://jira.com', folder.id);
      expect(bm.remove(b.id)).toBe(true);
      expect(bm.listFlat()).toHaveLength(1); // Only folder remains
    });

    it('returns false for nonexistent id', () => {
      const bm = createManager();
      expect(bm.remove('nonexistent')).toBe(false);
    });
  });

  describe('update', () => {
    it('updates name and url', () => {
      const bm = createManager();
      const b = bm.add('Old', 'https://old.com');
      const updated = bm.update(b.id, { name: 'New', url: 'https://new.com' });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('New');
      expect(updated!.url).toBe('https://new.com');
    });

    it('updates only name when url not provided', () => {
      const bm = createManager();
      const b = bm.add('Test', 'https://test.com');
      const updated = bm.update(b.id, { name: 'Updated' });
      expect(updated!.name).toBe('Updated');
      expect(updated!.url).toBe('https://test.com');
    });

    it('returns null for nonexistent id', () => {
      const bm = createManager();
      expect(bm.update('nonexistent', { name: 'x' })).toBeNull();
    });
  });

  describe('search', () => {
    it('finds bookmarks by name (case-insensitive)', () => {
      const bm = createManager();
      bm.add('Google Search', 'https://google.com');
      bm.add('GitHub', 'https://github.com');
      const results = bm.search('google');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Google Search');
    });

    it('finds bookmarks by url', () => {
      const bm = createManager();
      bm.add('My Site', 'https://example.com/page');
      const results = bm.search('example.com');
      expect(results).toHaveLength(1);
    });

    it('does not return folders in search results', () => {
      const bm = createManager();
      bm.addFolder('Google Folder');
      bm.add('Google', 'https://google.com');
      const results = bm.search('google');
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('url');
    });

    it('returns empty array when no match', () => {
      const bm = createManager();
      bm.add('Test', 'https://test.com');
      expect(bm.search('zzzzz')).toEqual([]);
    });
  });

  describe('isBookmarked', () => {
    it('returns true for bookmarked URL', () => {
      const bm = createManager();
      bm.add('Test', 'https://test.com');
      expect(bm.isBookmarked('https://test.com')).toBe(true);
    });

    it('returns false for non-bookmarked URL', () => {
      const bm = createManager();
      expect(bm.isBookmarked('https://unknown.com')).toBe(false);
    });
  });

  describe('findByUrl', () => {
    it('returns bookmark for matching URL', () => {
      const bm = createManager();
      bm.add('Test', 'https://test.com');
      const found = bm.findByUrl('https://test.com');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Test');
    });

    it('returns null when not found', () => {
      const bm = createManager();
      expect(bm.findByUrl('https://nope.com')).toBeNull();
    });
  });

  describe('move', () => {
    it('moves a bookmark into a folder', () => {
      const bm = createManager();
      const b = bm.add('Test', 'https://test.com');
      const folder = bm.addFolder('Work');
      expect(bm.move(b.id, folder.id)).toBe(true);
      // Should now be inside the folder
      expect(bm.list()).toHaveLength(1); // Only folder at top level
      const flat = bm.listFlat();
      expect(flat).toHaveLength(2);
    });

    it('moves a bookmark to top level when no parent specified', () => {
      const bm = createManager();
      const folder = bm.addFolder('Work');
      const b = bm.add('Test', 'https://test.com', folder.id);
      expect(bm.move(b.id)).toBe(true);
      expect(bm.list()).toHaveLength(2); // folder + bookmark at top level
    });

    it('returns false for nonexistent bookmark', () => {
      const bm = createManager();
      expect(bm.move('nonexistent', 'also-nonexistent')).toBe(false);
    });
  });

  describe('getBarItems', () => {
    it('returns top-level url bookmarks when no bar folder exists', () => {
      const bm = createManager();
      bm.add('A', 'https://a.com');
      bm.add('B', 'https://b.com');
      bm.addFolder('Folder');
      const bar = bm.getBarItems();
      expect(bar).toHaveLength(2); // Only urls, not the folder
    });

    it('returns children of Bookmarks Bar folder', () => {
      const bm = createManager();
      const bar = bm.addFolder('Bookmarks Bar');
      bm.add('In Bar', 'https://bar.com', bar.id);
      bm.add('Outside', 'https://outside.com');
      const items = bm.getBarItems();
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('In Bar');
    });
  });

  describe('listFlat', () => {
    it('flattens nested bookmarks', () => {
      const bm = createManager();
      const folder = bm.addFolder('Work');
      bm.add('A', 'https://a.com', folder.id);
      bm.add('B', 'https://b.com');
      const flat = bm.listFlat();
      expect(flat).toHaveLength(3); // folder + A + B
    });
  });

  describe('reload', () => {
    it('reloads bookmarks from disk', () => {
      const bm = createManager();
      bm.add('Before', 'https://before.com');
      // Simulate file changed on disk
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ bookmarks: [], lastModified: new Date().toISOString() })
      );
      bm.reload();
      expect(bm.list()).toEqual([]);
    });
  });
});
