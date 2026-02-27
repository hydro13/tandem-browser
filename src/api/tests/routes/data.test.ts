import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(false),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      readdirSync: vi.fn().mockReturnValue([]),
      unlinkSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {},
  webContents: {
    fromId: vi.fn(),
    getAllWebContents: vi.fn().mockReturnValue([]),
  },
}));

import fs from 'fs';
import { registerDataRoutes } from '../../routes/data';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

describe('Data Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerDataRoutes, ctx);
  });

  // ═══════════════════════════════════════════════
  // BOOKMARKS
  // ═══════════════════════════════════════════════

  describe('GET /bookmarks', () => {
    it('returns bookmarks and bar items', async () => {
      const fakeBookmarks = [{ id: 'bk1', name: 'Test', url: 'https://example.com' }];
      const fakeBar = [{ id: 'bk2', name: 'Bar Item', url: 'https://bar.com' }];
      vi.mocked(ctx.bookmarkManager.list).mockReturnValue(fakeBookmarks as any);
      vi.mocked(ctx.bookmarkManager.getBarItems).mockReturnValue(fakeBar as any);

      const res = await request(app).get('/bookmarks');

      expect(res.status).toBe(200);
      expect(res.body.bookmarks).toEqual(fakeBookmarks);
      expect(res.body.bar).toEqual(fakeBar);
    });

    it('returns 500 when bookmarkManager throws', async () => {
      vi.mocked(ctx.bookmarkManager.list).mockImplementation(() => { throw new Error('db error'); });

      const res = await request(app).get('/bookmarks');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('db error');
    });
  });

  describe('POST /bookmarks/add', () => {
    it('adds a bookmark with name and url', async () => {
      const res = await request(app)
        .post('/bookmarks/add')
        .send({ name: 'Example', url: 'https://example.com' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.bookmark).toBeDefined();
      expect(ctx.bookmarkManager.add).toHaveBeenCalledWith('Example', 'https://example.com', undefined);
    });

    it('adds a bookmark with parentId', async () => {
      const res = await request(app)
        .post('/bookmarks/add')
        .send({ name: 'Child', url: 'https://child.com', parentId: 'f1' });

      expect(res.status).toBe(200);
      expect(ctx.bookmarkManager.add).toHaveBeenCalledWith('Child', 'https://child.com', 'f1');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/bookmarks/add')
        .send({ url: 'https://example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name and url required');
    });

    it('returns 400 when url is missing', async () => {
      const res = await request(app)
        .post('/bookmarks/add')
        .send({ name: 'Example' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name and url required');
    });

    it('returns 400 when body is empty', async () => {
      const res = await request(app)
        .post('/bookmarks/add')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name and url required');
    });
  });

  describe('DELETE /bookmarks/remove', () => {
    it('removes a bookmark by id', async () => {
      const res = await request(app)
        .delete('/bookmarks/remove')
        .send({ id: 'bk1' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.bookmarkManager.remove).toHaveBeenCalledWith('bk1');
    });

    it('returns 400 when id is missing', async () => {
      const res = await request(app)
        .delete('/bookmarks/remove')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('id required');
    });
  });

  describe('PUT /bookmarks/update', () => {
    it('updates a bookmark', async () => {
      const res = await request(app)
        .put('/bookmarks/update')
        .send({ id: 'bk1', name: 'Updated', url: 'https://updated.com' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.bookmark).toBeDefined();
      expect(ctx.bookmarkManager.update).toHaveBeenCalledWith('bk1', { name: 'Updated', url: 'https://updated.com' });
    });

    it('returns 404 when bookmark not found', async () => {
      vi.mocked(ctx.bookmarkManager.update).mockReturnValue(null as any);

      const res = await request(app)
        .put('/bookmarks/update')
        .send({ id: 'nonexistent', name: 'Nope' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Bookmark not found');
    });

    it('returns 400 when id is missing', async () => {
      const res = await request(app)
        .put('/bookmarks/update')
        .send({ name: 'Updated' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('id required');
    });
  });

  describe('POST /bookmarks/add-folder', () => {
    it('adds a folder', async () => {
      const res = await request(app)
        .post('/bookmarks/add-folder')
        .send({ name: 'My Folder' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.folder).toBeDefined();
      expect(ctx.bookmarkManager.addFolder).toHaveBeenCalledWith('My Folder', undefined);
    });

    it('adds a folder with parentId', async () => {
      const res = await request(app)
        .post('/bookmarks/add-folder')
        .send({ name: 'Sub Folder', parentId: 'f1' });

      expect(res.status).toBe(200);
      expect(ctx.bookmarkManager.addFolder).toHaveBeenCalledWith('Sub Folder', 'f1');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/bookmarks/add-folder')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name required');
    });
  });

  describe('POST /bookmarks/move', () => {
    it('moves a bookmark', async () => {
      const res = await request(app)
        .post('/bookmarks/move')
        .send({ id: 'bk1', parentId: 'f2' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.bookmarkManager.move).toHaveBeenCalledWith('bk1', 'f2');
    });

    it('returns 400 when id is missing', async () => {
      const res = await request(app)
        .post('/bookmarks/move')
        .send({ parentId: 'f2' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('id required');
    });
  });

  describe('GET /bookmarks/search', () => {
    it('searches bookmarks by query', async () => {
      const fakeResults = [{ id: 'bk1', name: 'Match', url: 'https://match.com' }];
      vi.mocked(ctx.bookmarkManager.search).mockReturnValue(fakeResults as any);

      const res = await request(app).get('/bookmarks/search?q=match');

      expect(res.status).toBe(200);
      expect(res.body.results).toEqual(fakeResults);
      expect(ctx.bookmarkManager.search).toHaveBeenCalledWith('match');
    });

    it('returns 400 when q param is missing', async () => {
      const res = await request(app).get('/bookmarks/search');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('q parameter required');
    });
  });

  describe('GET /bookmarks/check', () => {
    it('checks if a url is bookmarked', async () => {
      vi.mocked(ctx.bookmarkManager.isBookmarked).mockReturnValue(true);
      vi.mocked(ctx.bookmarkManager.findByUrl).mockReturnValue({ id: 'bk1', name: 'Found', url: 'https://found.com' } as any);

      const res = await request(app).get('/bookmarks/check?url=https://found.com');

      expect(res.status).toBe(200);
      expect(res.body.bookmarked).toBe(true);
      expect(res.body.bookmark).toEqual({ id: 'bk1', name: 'Found', url: 'https://found.com' });
    });

    it('returns false when url is not bookmarked', async () => {
      const res = await request(app).get('/bookmarks/check?url=https://notfound.com');

      expect(res.status).toBe(200);
      expect(res.body.bookmarked).toBe(false);
      expect(res.body.bookmark).toBeNull();
    });

    it('returns 400 when url param is missing', async () => {
      const res = await request(app).get('/bookmarks/check');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('url parameter required');
    });
  });

  // ═══════════════════════════════════════════════
  // HISTORY
  // ═══════════════════════════════════════════════

  describe('GET /history', () => {
    it('returns history entries with defaults', async () => {
      const fakeEntries = [{ url: 'https://example.com', title: 'Example', visitedAt: Date.now() }];
      vi.mocked(ctx.historyManager.getHistory).mockReturnValue(fakeEntries as any);

      const res = await request(app).get('/history');

      expect(res.status).toBe(200);
      expect(res.body.entries).toEqual(fakeEntries);
      expect(res.body.total).toBe(0);
      expect(ctx.historyManager.getHistory).toHaveBeenCalledWith(100, 0);
    });

    it('respects limit and offset query params', async () => {
      const res = await request(app).get('/history?limit=50&offset=10');

      expect(res.status).toBe(200);
      expect(ctx.historyManager.getHistory).toHaveBeenCalledWith(50, 10);
    });
  });

  describe('GET /history/search', () => {
    it('searches history by query', async () => {
      const fakeResults = [{ url: 'https://example.com', title: 'Example' }];
      vi.mocked(ctx.historyManager.search).mockReturnValue(fakeResults as any);

      const res = await request(app).get('/history/search?q=example');

      expect(res.status).toBe(200);
      expect(res.body.results).toEqual(fakeResults);
      expect(ctx.historyManager.search).toHaveBeenCalledWith('example');
    });

    it('returns 400 when q param is missing', async () => {
      const res = await request(app).get('/history/search');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('q parameter required');
    });
  });

  describe('DELETE /history/clear', () => {
    it('clears history', async () => {
      const res = await request(app).delete('/history/clear');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.historyManager.clear).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════
  // DOWNLOADS
  // ═══════════════════════════════════════════════

  describe('GET /downloads', () => {
    it('returns all downloads', async () => {
      const fakeDownloads = [{ id: 'd1', filename: 'file.zip', progress: 100 }];
      vi.mocked(ctx.downloadManager.list).mockReturnValue(fakeDownloads as any);

      const res = await request(app).get('/downloads');

      expect(res.status).toBe(200);
      expect(res.body.downloads).toEqual(fakeDownloads);
    });
  });

  describe('GET /downloads/active', () => {
    it('returns active downloads', async () => {
      const fakeActive = [{ id: 'd2', filename: 'big.zip', progress: 50 }];
      vi.mocked(ctx.downloadManager.listActive).mockReturnValue(fakeActive as any);

      const res = await request(app).get('/downloads/active');

      expect(res.status).toBe(200);
      expect(res.body.downloads).toEqual(fakeActive);
    });
  });

  // ═══════════════════════════════════════════════
  // CONFIG
  // ═══════════════════════════════════════════════

  describe('GET /config', () => {
    it('returns the current config', async () => {
      const fakeConfig = { theme: 'dark', searchEngine: 'google' };
      vi.mocked(ctx.configManager.getConfig).mockReturnValue(fakeConfig as any);

      const res = await request(app).get('/config');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(fakeConfig);
    });
  });

  describe('PATCH /config', () => {
    it('updates config with provided fields', async () => {
      const updatedConfig = { theme: 'light' };
      vi.mocked(ctx.configManager.updateConfig).mockReturnValue(updatedConfig as any);

      const res = await request(app)
        .patch('/config')
        .send({ theme: 'light' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updatedConfig);
      expect(ctx.configManager.updateConfig).toHaveBeenCalledWith({ theme: 'light' });
    });
  });

  describe('GET /config/openclaw-token', () => {
    it('returns 404 when openclaw config file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const res = await request(app).get('/config/openclaw-token');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('OpenClaw config not found');
    });

    it('returns the token from openclaw.json', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ token: 'my-secret-token' }));

      const res = await request(app).get('/config/openclaw-token');

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('my-secret-token');
    });

    it('returns the token from nested gateway.auth.token path', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ gateway: { auth: { token: 'nested-token' } } }));

      const res = await request(app).get('/config/openclaw-token');

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('nested-token');
    });

    it('returns 404 when no token field exists in config', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ someOtherField: 'value' }));

      const res = await request(app).get('/config/openclaw-token');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('No token field');
    });
  });

  // ═══════════════════════════════════════════════
  // DATA EXPORT / IMPORT
  // ═══════════════════════════════════════════════

  describe('GET /data/export', () => {
    it('aggregates config, chat history, and behavior stats', async () => {
      const fakeConfig = { theme: 'dark' };
      const fakeChatHistory = [{ id: 1, text: 'hello' }];
      const fakeStats = { pagesVisited: 42 };

      vi.mocked(ctx.configManager.getConfig).mockReturnValue(fakeConfig as any);
      vi.mocked(ctx.behaviorObserver.getStats).mockReturnValue(fakeStats as any);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fakeChatHistory));

      const res = await request(app).get('/data/export');

      expect(res.status).toBe(200);
      expect(res.body.version).toBe('0.1.0');
      expect(res.body.exportDate).toBeDefined();
      expect(res.body.config).toEqual(fakeConfig);
      expect(res.body.chatHistory).toEqual(fakeChatHistory);
      expect(res.body.behaviorStats).toEqual(fakeStats);
    });

    it('exports without chat history when file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const res = await request(app).get('/data/export');

      expect(res.status).toBe(200);
      expect(res.body.chatHistory).toBeUndefined();
      expect(res.body.config).toBeDefined();
      expect(res.body.behaviorStats).toBeDefined();
    });
  });

  describe('POST /data/import', () => {
    it('imports config and chat history', async () => {
      const importData = {
        config: { theme: 'light' },
        chatHistory: [{ id: 1, text: 'imported' }],
      };

      const res = await request(app)
        .post('/data/import')
        .send(importData);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.imported).toBe(true);
      expect(ctx.configManager.updateConfig).toHaveBeenCalledWith({ theme: 'light' });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('imports only config when chatHistory is absent', async () => {
      const res = await request(app)
        .post('/data/import')
        .send({ config: { theme: 'dark' } });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.configManager.updateConfig).toHaveBeenCalledWith({ theme: 'dark' });
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('imports only chatHistory when config is absent', async () => {
      const res = await request(app)
        .post('/data/import')
        .send({ chatHistory: [{ id: 1 }] });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.configManager.updateConfig).not.toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════
  // CHROME IMPORT
  // ═══════════════════════════════════════════════

  describe('GET /import/chrome/status', () => {
    it('returns chrome import status', async () => {
      const fakeStatus = { profilePath: '/path/to/chrome', available: true };
      vi.mocked(ctx.chromeImporter.getStatus).mockReturnValue(fakeStatus as any);

      const res = await request(app).get('/import/chrome/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(fakeStatus);
    });
  });

  describe('POST /import/chrome/bookmarks', () => {
    it('imports chrome bookmarks and reloads bookmark manager', async () => {
      const fakeResult = { imported: 15 };
      vi.mocked(ctx.chromeImporter.importBookmarks).mockReturnValue(fakeResult as any);

      const res = await request(app).post('/import/chrome/bookmarks');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(fakeResult);
      expect(ctx.chromeImporter.importBookmarks).toHaveBeenCalled();
      expect(ctx.bookmarkManager.reload).toHaveBeenCalled();
    });
  });

  describe('POST /import/chrome/history', () => {
    it('imports chrome history', async () => {
      const fakeResult = { imported: 200 };
      vi.mocked(ctx.chromeImporter.importHistory).mockReturnValue(fakeResult as any);

      const res = await request(app).post('/import/chrome/history');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(fakeResult);
      expect(ctx.chromeImporter.importHistory).toHaveBeenCalled();
    });
  });

  describe('POST /import/chrome/cookies', () => {
    it('imports chrome cookies using session', async () => {
      const fakeResult = { imported: 50 };
      vi.mocked(ctx.chromeImporter.importCookies).mockResolvedValue(fakeResult as any);

      const res = await request(app).post('/import/chrome/cookies');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(fakeResult);
      expect(ctx.chromeImporter.importCookies).toHaveBeenCalledWith(ctx.win.webContents.session);
    });
  });

  describe('GET /import/chrome/profiles', () => {
    it('returns available chrome profiles', async () => {
      const fakeProfiles = ['Default', 'Profile 1'];
      vi.mocked(ctx.chromeImporter.listProfiles).mockReturnValue(fakeProfiles as any);

      const res = await request(app).get('/import/chrome/profiles');

      expect(res.status).toBe(200);
      expect(res.body.profiles).toEqual(fakeProfiles);
    });
  });

  describe('POST /import/chrome/sync/start', () => {
    it('starts chrome sync', async () => {
      vi.mocked(ctx.chromeImporter.startSync).mockReturnValue(true);
      vi.mocked(ctx.chromeImporter.isSyncing).mockReturnValue(true);

      const res = await request(app)
        .post('/import/chrome/sync/start')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.syncing).toBe(true);
    });

    it('sets profile before starting sync when provided', async () => {
      vi.mocked(ctx.chromeImporter.startSync).mockReturnValue(true);
      vi.mocked(ctx.chromeImporter.isSyncing).mockReturnValue(true);

      const res = await request(app)
        .post('/import/chrome/sync/start')
        .send({ profile: 'Profile 1' });

      expect(res.status).toBe(200);
      expect(ctx.chromeImporter.setProfile).toHaveBeenCalledWith('Profile 1');
      expect(ctx.chromeImporter.startSync).toHaveBeenCalled();
    });
  });

  describe('POST /import/chrome/sync/stop', () => {
    it('stops chrome sync', async () => {
      const res = await request(app).post('/import/chrome/sync/stop');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.syncing).toBe(false);
      expect(ctx.chromeImporter.stopSync).toHaveBeenCalled();
    });
  });

  describe('GET /import/chrome/sync/status', () => {
    it('returns sync status when not syncing', async () => {
      vi.mocked(ctx.chromeImporter.isSyncing).mockReturnValue(false);

      const res = await request(app).get('/import/chrome/sync/status');

      expect(res.status).toBe(200);
      expect(res.body.syncing).toBe(false);
    });

    it('returns sync status when syncing', async () => {
      vi.mocked(ctx.chromeImporter.isSyncing).mockReturnValue(true);

      const res = await request(app).get('/import/chrome/sync/status');

      expect(res.status).toBe(200);
      expect(res.body.syncing).toBe(true);
    });
  });
});
