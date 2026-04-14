import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock electron
vi.mock('electron', () => ({
  BrowserWindow: vi.fn().mockImplementation(() => ({
    show: false,
    webContents: {
      on: vi.fn(),
      once: vi.fn().mockImplementation((event: string, cb: () => void) => {
        if (event === 'did-finish-load') {
          setTimeout(cb, 0);
        }
      }),
      loadURL: vi.fn().mockResolvedValue(undefined),
      executeJavaScript: vi.fn().mockImplementation((code: string) => {
        if (code === 'document.title') {
          return Promise.resolve('Example Title');
        }
        return Promise.resolve('page text content');
      }),
    },
    isDestroyed: vi.fn().mockReturnValue(false),
    close: vi.fn(),
  })),
  session: {
    fromPartition: vi.fn().mockReturnValue({}),
  },
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs') as Record<string, unknown>;
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(false),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn().mockReturnValue('{"watches":[]}'),
    },
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{"watches":[]}'),
  };
});

vi.mock('../../utils/paths', () => ({
  tandemDir: vi.fn((...args: string[]) => {
    if (args.length === 0) return '/tmp/tandem-test';
    return '/tmp/tandem-test/' + args.join('/');
  }),
}));

vi.mock('../../utils/constants', () => ({
  DEFAULT_TIMEOUT_MS: 30000,
}));

vi.mock('../../stealth/manager', () => ({
  StealthManager: {
    getStealthScript: vi.fn().mockReturnValue('// stealth'),
  },
}));

vi.mock('../../notifications/alert', () => ({
  wingmanAlert: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import fs from 'fs';
import { WatchManager } from '../watcher';

describe('WatchManager', () => {
  let wm: WatchManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('{"watches":[]}');
    wm = new WatchManager();
  });

  afterEach(() => {
    wm.destroy();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('loads empty watch state when no file exists', () => {
      expect(wm.listWatches()).toEqual([]);
    });

    it('loads existing watches from disk', () => {
      const savedState = {
        watches: [{
          id: 'watch-1', url: 'https://example.com', intervalMs: 300000,
          lastCheck: null, lastHash: null, lastTitle: null, lastError: null,
          changeCount: 0, createdAt: 1000,
        }],
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedState));

      const wm2 = new WatchManager();
      expect(wm2.listWatches()).toHaveLength(1);
      expect(wm2.listWatches()[0].diffMode).toBe('content');
      wm2.destroy();
    });

    it('migrates legacy watches to a default diff mode', () => {
      const savedState = {
        watches: [{
          id: 'watch-legacy', url: 'https://legacy.com', intervalMs: 300000,
          lastCheck: 123, lastHash: 'abc123', lastTitle: 'Legacy', lastError: null,
          changeCount: 2, createdAt: 1000,
        }],
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedState));

      const wm2 = new WatchManager();
      expect(wm2.listWatches()).toEqual([
        expect.objectContaining({
          id: 'watch-legacy',
          diffMode: 'content',
          lastHash: 'abc123',
          lastFingerprint: 'abc123',
        }),
      ]);
      wm2.destroy();
    });
  });

  describe('addWatch()', () => {
    it('adds a new watch and returns entry', () => {
      const result = wm.addWatch('https://example.com', 5);
      expect('id' in result).toBe(true);
      const entry = result as { id: string; url: string; intervalMs: number; diffMode: string; lastFingerprint: string | null };
      expect(entry.url).toBe('https://example.com');
      expect(entry.intervalMs).toBe(5 * 60 * 1000);
      expect(entry.diffMode).toBe('content');
      expect(entry.lastFingerprint).toBeNull();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('rejects duplicate URLs', () => {
      wm.addWatch('https://example.com', 5);
      const result = wm.addWatch('https://example.com', 10);
      expect('error' in result).toBe(true);
      expect((result as { error: string }).error).toContain('already being watched');
    });

    it('enforces maximum 20 watches', () => {
      for (let i = 0; i < 20; i++) {
        wm.addWatch(`https://site-${i}.com`, 5);
      }
      const result = wm.addWatch('https://site-21.com', 5);
      expect('error' in result).toBe(true);
      expect((result as { error: string }).error).toContain('Maximum');
    });

    it('enforces minimum 1 minute interval', () => {
      const result = wm.addWatch('https://fast.com', 0);
      const entry = result as { id: string; intervalMs: number };
      expect(entry.intervalMs).toBe(60000); // 1 minute minimum
    });

    it('stores explicit diff mode', () => {
      const result = wm.addWatch('https://title-only.com', 5, 'title');
      expect((result as { diffMode: string }).diffMode).toBe('title');
    });

    it('rejects unsupported diff modes', () => {
      const result = wm.addWatch('https://bad-mode.com', 5, 'bogus' as never);
      expect('error' in result).toBe(true);
      expect((result as { error: string }).error).toContain('Unsupported diff mode');
    });

    it('emits a watch-added event', () => {
      const events: string[] = [];
      const unsubscribe = wm.subscribe((event) => {
        events.push(event.type);
      });

      wm.addWatch('https://events.com', 5);

      expect(events).toContain('watch-added');
      unsubscribe();
    });
  });

  describe('removeWatch()', () => {
    it('removes by id', () => {
      const entry = wm.addWatch('https://remove-me.com', 5) as { id: string };
      expect(wm.removeWatch(entry.id)).toBe(true);
      expect(wm.listWatches()).toHaveLength(0);
    });

    it('removes by url', () => {
      wm.addWatch('https://remove-by-url.com', 5);
      expect(wm.removeWatch('https://remove-by-url.com')).toBe(true);
      expect(wm.listWatches()).toHaveLength(0);
    });

    it('returns false for nonexistent watch', () => {
      expect(wm.removeWatch('nonexistent')).toBe(false);
    });
  });

  describe('listWatches()', () => {
    it('returns all watch entries', () => {
      wm.addWatch('https://a.com', 5);
      wm.addWatch('https://b.com', 10);
      const watches = wm.listWatches();
      expect(watches).toHaveLength(2);
    });

    it('returns cloned entries', () => {
      wm.addWatch('https://clone.com', 5);
      const watches = wm.listWatches();
      watches[0].url = 'https://mutated.example';

      expect(wm.listWatches()[0].url).toBe('https://clone.com');
    });
  });

  describe('getSnapshot()', () => {
    it('returns a live snapshot event', () => {
      wm.addWatch('https://snapshot.com', 5);

      const snapshot = wm.getSnapshot();

      expect(snapshot.type).toBe('snapshot');
      expect(snapshot.watches).toHaveLength(1);
      snapshot.watches[0].url = 'https://mutated.example';
      expect(wm.getSnapshot().watches[0].url).toBe('https://snapshot.com');
    });
  });

  describe('destroy()', () => {
    it('cleans up timers without errors', () => {
      wm.addWatch('https://cleanup.com', 5);
      expect(() => wm.destroy()).not.toThrow();
    });
  });

  describe('hashContent (via checkUrl)', () => {
    it('checkUrl returns error for unknown watch', async () => {
      vi.useRealTimers();
      const result = await wm.checkUrl('nonexistent');
      expect(result.changed).toBe(false);
      expect(result.error).toBe('Watch not found');
    });
  });

  describe('forceCheck()', () => {
    it('returns empty results when no watches exist', async () => {
      vi.useRealTimers();
      const { results } = await wm.forceCheck();
      expect(results).toEqual([]);
    });

    it('checks specific watch by id', async () => {
      vi.useRealTimers();
      const entry = wm.addWatch('https://force-check.com', 5) as { id: string };
      // checkUrl will fail due to mocked BrowserWindow but that's expected
      const { results } = await wm.forceCheck(entry.id);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(entry.id);
    });
  });

  describe('diff modes', () => {
    async function runCheckWithPage(id: string, text: string, title: string) {
      vi.spyOn(wm as never, 'getHiddenWindow').mockResolvedValue({
        webContents: {
          once: vi.fn().mockImplementation((event: string, cb: () => void) => {
            if (event === 'did-finish-load') {
              setTimeout(cb, 0);
            }
          }),
          loadURL: vi.fn().mockResolvedValue(undefined),
          executeJavaScript: vi.fn().mockImplementation((code: string) => {
            if (code === 'document.title') {
              return Promise.resolve(title);
            }
            return Promise.resolve(text);
          }),
        },
      } as never);

      const pending = wm.checkUrl(id);
      await vi.advanceTimersByTimeAsync(2000);
      return pending;
    }

    it('title mode ignores body-only changes', async () => {
      const initialSpy = vi.spyOn(wm, 'checkUrl').mockResolvedValue({ changed: false });
      const watch = wm.addWatch('https://title-mode.com', 5, 'title') as { id: string };
      initialSpy.mockRestore();

      await runCheckWithPage(watch.id, 'first body', 'Same Title');
      const result = await runCheckWithPage(watch.id, 'second body', 'Same Title');

      expect(result).toEqual({ changed: false });
    });

    it('title-or-content mode detects title changes', async () => {
      const initialSpy = vi.spyOn(wm, 'checkUrl').mockResolvedValue({ changed: false });
      const watch = wm.addWatch('https://title-or-content.com', 5, 'title-or-content') as { id: string };
      initialSpy.mockRestore();

      await runCheckWithPage(watch.id, 'same body', 'Title A');
      const result = await runCheckWithPage(watch.id, 'same body', 'Title B');

      expect(result).toEqual({ changed: true });
    });

    it('text-length mode ignores equal-length content churn', async () => {
      const initialSpy = vi.spyOn(wm, 'checkUrl').mockResolvedValue({ changed: false });
      const watch = wm.addWatch('https://length-mode.com', 5, 'text-length') as { id: string };
      initialSpy.mockRestore();

      await runCheckWithPage(watch.id, 'abc', 'Length Title');
      const result = await runCheckWithPage(watch.id, 'xyz', 'Length Title');

      expect(result).toEqual({ changed: false });
    });
  });

  describe('load() error handling', () => {
    it('handles corrupt JSON gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not json');

      const wm2 = new WatchManager();
      expect(wm2.listWatches()).toEqual([]);
      wm2.destroy();
    });
  });
});
