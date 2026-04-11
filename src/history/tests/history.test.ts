import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
      readFileSync: vi.fn().mockReturnValue('{"entries":[]}'),
    },
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{"entries":[]}'),
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
import { HistoryManager } from '../manager';

describe('HistoryManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createManager(): HistoryManager {
    return new HistoryManager();
  }

  describe('recordVisit', () => {
    it('records a new visit', () => {
      const hm = createManager();
      hm.recordVisit('https://example.com', 'Example');
      expect(hm.count).toBe(1);
      const entries = hm.getHistory();
      expect(entries[0].url).toBe('https://example.com');
      expect(entries[0].title).toBe('Example');
      expect(entries[0].visitCount).toBe(1);
    });

    it('increments visit count for duplicate URL', () => {
      const hm = createManager();
      hm.recordVisit('https://example.com', 'Example');
      hm.recordVisit('https://example.com', 'Example Updated');
      expect(hm.count).toBe(1);
      const entries = hm.getHistory();
      expect(entries[0].visitCount).toBe(2);
      expect(entries[0].title).toBe('Example Updated');
    });

    it('ignores about:blank', () => {
      const hm = createManager();
      hm.recordVisit('about:blank', '');
      expect(hm.count).toBe(0);
    });

    it('ignores file:// URLs', () => {
      const hm = createManager();
      hm.recordVisit('file:///tmp/test.html', 'Test');
      expect(hm.count).toBe(0);
    });

    it('ignores empty URL', () => {
      const hm = createManager();
      hm.recordVisit('', 'Empty');
      expect(hm.count).toBe(0);
    });

    it('uses empty string for title when not provided', () => {
      const hm = createManager();
      hm.recordVisit('https://example.com', '');
      const entries = hm.getHistory();
      expect(entries[0].title).toBe('');
    });

    it('triggers debounced save', async () => {
      const fsModule = fs;
      const hm = createManager();
      hm.recordVisit('https://example.com', 'Example');
      // Save is debounced by 2000ms
      expect(fsModule.writeFileSync).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2000);
      expect(fsModule.writeFileSync).toHaveBeenCalled();
    });

    it('moves revisited entry to end (most recent)', () => {
      const hm = createManager();
      hm.recordVisit('https://first.com', 'First');
      hm.recordVisit('https://second.com', 'Second');
      hm.recordVisit('https://first.com', 'First Again');
      // getHistory returns most recent first
      const entries = hm.getHistory();
      expect(entries[0].url).toBe('https://first.com');
      expect(entries[1].url).toBe('https://second.com');
    });
  });

  describe('getHistory', () => {
    it('returns entries in reverse chronological order', () => {
      const hm = createManager();
      hm.recordVisit('https://a.com', 'A');
      hm.recordVisit('https://b.com', 'B');
      hm.recordVisit('https://c.com', 'C');
      const entries = hm.getHistory();
      expect(entries[0].url).toBe('https://c.com');
      expect(entries[2].url).toBe('https://a.com');
    });

    it('respects limit parameter', () => {
      const hm = createManager();
      for (let i = 0; i < 10; i++) {
        hm.recordVisit(`https://site${i}.com`, `Site ${i}`);
      }
      expect(hm.getHistory(3)).toHaveLength(3);
    });

    it('respects offset parameter', () => {
      const hm = createManager();
      hm.recordVisit('https://a.com', 'A');
      hm.recordVisit('https://b.com', 'B');
      hm.recordVisit('https://c.com', 'C');
      const entries = hm.getHistory(10, 1);
      expect(entries).toHaveLength(2);
      expect(entries[0].url).toBe('https://b.com');
    });

    it('returns empty array when no history', () => {
      const hm = createManager();
      expect(hm.getHistory()).toEqual([]);
    });
  });

  describe('search', () => {
    it('finds entries by URL (case-insensitive)', () => {
      const hm = createManager();
      hm.recordVisit('https://GitHub.com', 'GitHub');
      hm.recordVisit('https://google.com', 'Google');
      const results = hm.search('github');
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe('https://GitHub.com');
    });

    it('finds entries by title', () => {
      const hm = createManager();
      hm.recordVisit('https://example.com', 'My Cool Page');
      const results = hm.search('cool');
      expect(results).toHaveLength(1);
    });

    it('returns max 100 results', () => {
      const hm = createManager();
      for (let i = 0; i < 150; i++) {
        hm.recordVisit(`https://test${i}.com`, 'Test');
      }
      const results = hm.search('test');
      expect(results.length).toBeLessThanOrEqual(100);
    });

    it('returns empty array for no matches', () => {
      const hm = createManager();
      hm.recordVisit('https://example.com', 'Example');
      expect(hm.search('zzzzz')).toEqual([]);
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      const hm = createManager();
      hm.recordVisit('https://example.com', 'Example');
      hm.recordVisit('https://test.com', 'Test');
      hm.clear();
      expect(hm.count).toBe(0);
      expect(hm.getHistory()).toEqual([]);
    });
  });

  describe('count', () => {
    it('returns the number of entries', () => {
      const hm = createManager();
      expect(hm.count).toBe(0);
      hm.recordVisit('https://a.com', 'A');
      expect(hm.count).toBe(1);
      hm.recordVisit('https://b.com', 'B');
      expect(hm.count).toBe(2);
    });
  });

  describe('destroy', () => {
    it('flushes pending writes to disk', async () => {
      const fsModule = fs;
      const hm = createManager();
      hm.recordVisit('https://example.com', 'Example');
      // Save timer is pending
      hm.destroy();
      expect(fsModule.writeFileSync).toHaveBeenCalled();
    });

    it('does nothing when no pending writes', async () => {
      const fsModule = fs;
      const hm = createManager();
      hm.destroy();
      // writeFileSync should not be called (no pending save)
      expect(fsModule.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('setSyncManager', () => {
    it('accepts a sync manager without error', () => {
      const hm = createManager();
      const mockSync = { isConfigured: vi.fn().mockReturnValue(false) } as any;
      expect(() => hm.setSyncManager(mockSync)).not.toThrow();
    });
  });
});
