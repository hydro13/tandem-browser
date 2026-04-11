import { describe, it, expect, vi, beforeEach } from 'vitest';
import type fs from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(false),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn().mockReturnValue('{"boards":[],"lastModified":"2024-01-01T00:00:00.000Z"}'),
    },
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{"boards":[],"lastModified":"2024-01-01T00:00:00.000Z"}'),
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

// Mock global fetch for OG metadata enrichment
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { PinboardManager } from '../manager';

describe('PinboardManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockRejectedValue(new Error('no fetch in tests'));
  });

  function createManager(): PinboardManager {
    return new PinboardManager();
  }

  describe('createBoard', () => {
    it('creates a board with default emoji', () => {
      const pm = createManager();
      const board = pm.createBoard('Research');
      expect(board.name).toBe('Research');
      expect(board.emoji).toBe('\uD83D\uDCCC'); // pin emoji
      expect(board.items).toEqual([]);
      expect(board.id).toBeTruthy();
    });

    it('creates a board with custom emoji', () => {
      const pm = createManager();
      const board = pm.createBoard('Work', '\uD83D\uDCBC');
      expect(board.emoji).toBe('\uD83D\uDCBC');
    });
  });

  describe('listBoards', () => {
    it('returns empty array on fresh state', () => {
      const pm = createManager();
      expect(pm.listBoards()).toEqual([]);
    });

    it('returns summary info without items', () => {
      const pm = createManager();
      pm.createBoard('Board A');
      const list = pm.listBoards();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('Board A');
      expect(list[0].itemCount).toBe(0);
      expect((list[0] as any).items).toBeUndefined();
    });
  });

  describe('getBoard', () => {
    it('returns full board with items', () => {
      const pm = createManager();
      const created = pm.createBoard('Test');
      const board = pm.getBoard(created.id);
      expect(board).not.toBeNull();
      expect(board!.name).toBe('Test');
      expect(board!.items).toEqual([]);
    });

    it('returns null for nonexistent board', () => {
      const pm = createManager();
      expect(pm.getBoard('nonexistent')).toBeNull();
    });
  });

  describe('updateBoard', () => {
    it('updates name and emoji', () => {
      const pm = createManager();
      const board = pm.createBoard('Old Name');
      const updated = pm.updateBoard(board.id, { name: 'New Name', emoji: '\uD83C\uDF1F' });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('New Name');
      expect(updated!.emoji).toBe('\uD83C\uDF1F');
    });

    it('updates only name when emoji not provided', () => {
      const pm = createManager();
      const board = pm.createBoard('Test', '\uD83D\uDE80');
      const updated = pm.updateBoard(board.id, { name: 'Updated' });
      expect(updated!.name).toBe('Updated');
      expect(updated!.emoji).toBe('\uD83D\uDE80');
    });

    it('returns null for nonexistent board', () => {
      const pm = createManager();
      expect(pm.updateBoard('fake', { name: 'x' })).toBeNull();
    });
  });

  describe('deleteBoard', () => {
    it('deletes an existing board', () => {
      const pm = createManager();
      const board = pm.createBoard('Deleteme');
      expect(pm.deleteBoard(board.id)).toBe(true);
      expect(pm.listBoards()).toHaveLength(0);
    });

    it('returns false for nonexistent board', () => {
      const pm = createManager();
      expect(pm.deleteBoard('nonexistent')).toBe(false);
    });
  });

  describe('updateBoardSettings', () => {
    it('updates layout and background', () => {
      const pm = createManager();
      const board = pm.createBoard('Test');
      const updated = pm.updateBoardSettings(board.id, { layout: 'spacious', background: 'dark' });
      expect(updated!.layout).toBe('spacious');
      expect(updated!.background).toBe('dark');
    });

    it('returns null for nonexistent board', () => {
      const pm = createManager();
      expect(pm.updateBoardSettings('fake', { layout: 'dense' })).toBeNull();
    });
  });

  describe('addItem', () => {
    it('adds a text item to a board', async () => {
      const pm = createManager();
      const board = pm.createBoard('Test');
      const item = await pm.addItem(board.id, { type: 'text', content: 'Hello' });
      expect(item).not.toBeNull();
      expect(item!.type).toBe('text');
      expect(item!.content).toBe('Hello');
      expect(item!.position).toBe(0);
      expect(item!.id).toBeTruthy();
    });

    it('auto-assigns incrementing positions', async () => {
      const pm = createManager();
      const board = pm.createBoard('Test');
      const item1 = await pm.addItem(board.id, { type: 'text', content: 'A' });
      const item2 = await pm.addItem(board.id, { type: 'text', content: 'B' });
      expect(item1!.position).toBe(0);
      expect(item2!.position).toBe(1);
    });

    it('returns null for nonexistent board', async () => {
      const pm = createManager();
      expect(await pm.addItem('fake', { type: 'text', content: 'x' })).toBeNull();
    });

    it('enriches link items with OG metadata', async () => {
      mockFetch.mockResolvedValueOnce({
        text: () => Promise.resolve(
          '<html><head><meta property="og:title" content="Example"><meta property="og:description" content="A site"><meta property="og:image" content="https://img.example.com/og.png"></head></html>'
        ),
      });
      const pm = createManager();
      const board = pm.createBoard('Test');
      const item = await pm.addItem(board.id, { type: 'link', url: 'https://example.com' });
      expect(item!.title).toBe('Example');
      expect(item!.description).toBe('A site');
      expect(item!.thumbnail).toBe('https://img.example.com/og.png');
    });

    it('handles fetch failure gracefully for link enrichment', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const pm = createManager();
      const board = pm.createBoard('Test');
      const item = await pm.addItem(board.id, { type: 'link', url: 'https://fail.com' });
      expect(item).not.toBeNull();
      expect(item!.url).toBe('https://fail.com');
    });
  });

  describe('updateItem', () => {
    it('updates item fields', async () => {
      const pm = createManager();
      const board = pm.createBoard('Test');
      const item = await pm.addItem(board.id, { type: 'text', content: 'Original' });
      const updated = pm.updateItem(board.id, item!.id, { content: 'Updated', note: 'A note' });
      expect(updated!.content).toBe('Updated');
      expect(updated!.note).toBe('A note');
    });

    it('returns null for nonexistent board', () => {
      const pm = createManager();
      expect(pm.updateItem('fake', 'fake', { title: 'x' })).toBeNull();
    });

    it('returns null for nonexistent item', () => {
      const pm = createManager();
      const board = pm.createBoard('Test');
      expect(pm.updateItem(board.id, 'fake', { title: 'x' })).toBeNull();
    });
  });

  describe('deleteItem', () => {
    it('removes an item and recalculates positions', async () => {
      const pm = createManager();
      const board = pm.createBoard('Test');
      const item1 = await pm.addItem(board.id, { type: 'text', content: 'A' });
      await pm.addItem(board.id, { type: 'text', content: 'B' });
      await pm.addItem(board.id, { type: 'text', content: 'C' });
      expect(pm.deleteItem(board.id, item1!.id)).toBe(true);
      const items = pm.getItems(board.id)!;
      expect(items).toHaveLength(2);
      expect(items[0].position).toBe(0);
      expect(items[1].position).toBe(1);
    });

    it('returns false for nonexistent board', () => {
      const pm = createManager();
      expect(pm.deleteItem('fake', 'fake')).toBe(false);
    });

    it('returns false for nonexistent item', () => {
      const pm = createManager();
      const board = pm.createBoard('Test');
      expect(pm.deleteItem(board.id, 'fake')).toBe(false);
    });
  });

  describe('getItems', () => {
    it('returns items sorted by position', async () => {
      const pm = createManager();
      const board = pm.createBoard('Test');
      await pm.addItem(board.id, { type: 'text', content: 'A' });
      await pm.addItem(board.id, { type: 'text', content: 'B' });
      const items = pm.getItems(board.id);
      expect(items).toHaveLength(2);
      expect(items![0].content).toBe('A');
      expect(items![1].content).toBe('B');
    });

    it('returns null for nonexistent board', () => {
      const pm = createManager();
      expect(pm.getItems('fake')).toBeNull();
    });
  });

  describe('reorderItems', () => {
    it('reorders items by new ID sequence', async () => {
      const pm = createManager();
      const board = pm.createBoard('Test');
      const item1 = await pm.addItem(board.id, { type: 'text', content: 'A' });
      const item2 = await pm.addItem(board.id, { type: 'text', content: 'B' });
      const item3 = await pm.addItem(board.id, { type: 'text', content: 'C' });
      expect(pm.reorderItems(board.id, [item3!.id, item1!.id, item2!.id])).toBe(true);
      const items = pm.getItems(board.id)!;
      expect(items[0].id).toBe(item3!.id);
      expect(items[1].id).toBe(item1!.id);
      expect(items[2].id).toBe(item2!.id);
    });

    it('returns false for nonexistent board', () => {
      const pm = createManager();
      expect(pm.reorderItems('fake', [])).toBe(false);
    });
  });
});
