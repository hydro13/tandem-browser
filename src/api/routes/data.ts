import type { Router, Request, Response } from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import type { RouteContext } from '../context';
import { tandemDir } from '../../utils/paths';
import { handleRouteError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';

const log = createLogger('DataRoutes');

export function registerDataRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // BOOKMARKS — Phase 4.2
  // ═══════════════════════════════════════════════

  router.get('/bookmarks', (_req: Request, res: Response) => {
    try {
      const bookmarks = ctx.bookmarkManager.list();
      const bar = ctx.bookmarkManager.getBarItems();
      res.json({ bookmarks, bar });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/bookmarks/add', (req: Request, res: Response) => {
    try {
      const { name, url, parentId } = req.body;
      if (!name || !url) { res.status(400).json({ error: 'name and url required' }); return; }
      const bookmark = ctx.bookmarkManager.add(name, url, parentId);
      res.json({ ok: true, bookmark });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.delete('/bookmarks/remove', (req: Request, res: Response) => {
    try {
      const { id } = req.body;
      if (!id) { res.status(400).json({ error: 'id required' }); return; }
      const removed = ctx.bookmarkManager.remove(id);
      res.json({ ok: removed });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.put('/bookmarks/update', (req: Request, res: Response) => {
    try {
      const { id, name, url } = req.body;
      if (!id) { res.status(400).json({ error: 'id required' }); return; }
      const updated = ctx.bookmarkManager.update(id, { name, url });
      if (!updated) { res.status(404).json({ error: 'Bookmark not found' }); return; }
      res.json({ ok: true, bookmark: updated });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/bookmarks/add-folder', (req: Request, res: Response) => {
    try {
      const { name, parentId } = req.body;
      if (!name) { res.status(400).json({ error: 'name required' }); return; }
      const folder = ctx.bookmarkManager.addFolder(name, parentId);
      res.json({ ok: true, folder });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/bookmarks/move', (req: Request, res: Response) => {
    try {
      const { id, parentId } = req.body;
      if (!id) { res.status(400).json({ error: 'id required' }); return; }
      const moved = ctx.bookmarkManager.move(id, parentId);
      res.json({ ok: moved });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/bookmarks/search', (req: Request, res: Response) => {
    try {
      const q = req.query.q as string;
      if (!q) { res.status(400).json({ error: 'q parameter required' }); return; }
      const results = ctx.bookmarkManager.search(q);
      res.json({ results });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/bookmarks/check', (req: Request, res: Response) => {
    try {
      const url = req.query.url as string;
      if (!url) { res.status(400).json({ error: 'url parameter required' }); return; }
      const bookmarked = ctx.bookmarkManager.isBookmarked(url);
      const bookmark = ctx.bookmarkManager.findByUrl(url);
      res.json({ bookmarked, bookmark });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // HISTORY — Phase 4.3
  // ═══════════════════════════════════════════════

  router.get('/history', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const entries = ctx.historyManager.getHistory(limit, offset);
      res.json({ entries, total: ctx.historyManager.count });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/history/search', (req: Request, res: Response) => {
    try {
      const q = req.query.q as string;
      if (!q) { res.status(400).json({ error: 'q parameter required' }); return; }
      const results = ctx.historyManager.search(q);
      res.json({ results });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.delete('/history/clear', (_req: Request, res: Response) => {
    try {
      ctx.historyManager.clear();
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // DOWNLOADS — Phase 4.4
  // ═══════════════════════════════════════════════

  router.get('/downloads', (_req: Request, res: Response) => {
    try {
      const downloads = ctx.downloadManager.list();
      res.json({ downloads });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/downloads/active', (_req: Request, res: Response) => {
    try {
      const downloads = ctx.downloadManager.listActive();
      res.json({ downloads });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // CONFIG
  // ═══════════════════════════════════════════════

  router.get('/config', (_req: Request, res: Response) => {
    try {
      res.json(ctx.configManager.getConfig());
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.patch('/config', (req: Request, res: Response) => {
    try {
      const updated = ctx.configManager.updateConfig(req.body);
      res.json(updated);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/config/openclaw-token', (_req: Request, res: Response) => {
    try {
      const openclawPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      if (!fs.existsSync(openclawPath)) {
        res.status(404).json({ error: 'OpenClaw config not found at ~/.openclaw/openclaw.json' });
        return;
      }
      const data = JSON.parse(fs.readFileSync(openclawPath, 'utf-8'));
      const token = data.token || data.gateway?.auth?.token;
      if (!token) {
        res.status(404).json({ error: 'No token field in openclaw.json' });
        return;
      }
      res.json({ token });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // DATA EXPORT / IMPORT
  // ═══════════════════════════════════════════════

  router.get('/data/export', (_req: Request, res: Response) => {
    try {
      const baseDir = tandemDir();
      const data: Record<string, unknown> = {
        exportDate: new Date().toISOString(),
        version: '0.1.0',
      };

      // Config
      data.config = ctx.configManager.getConfig();

      // Chat history
      const chatPath = path.join(baseDir, 'chat-history.json');
      if (fs.existsSync(chatPath)) {
        try { data.chatHistory = JSON.parse(fs.readFileSync(chatPath, 'utf-8')); } catch (e) { log.warn('Chat history load failed:', e instanceof Error ? e.message : String(e)); }
      }

      // Behavior stats
      data.behaviorStats = ctx.behaviorObserver.getStats();

      res.json(data);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/data/import', (req: Request, res: Response) => {
    try {
      const data = req.body;
      if (data.config) {
        ctx.configManager.updateConfig(data.config);
      }
      if (data.chatHistory) {
        const chatPath = tandemDir('chat-history.json');
        fs.writeFileSync(chatPath, JSON.stringify(data.chatHistory, null, 2));
      }
      res.json({ ok: true, imported: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // CHROME IMPORT
  // ═══════════════════════════════════════════════

  router.get('/import/chrome/status', (_req: Request, res: Response) => {
    try {
      res.json(ctx.chromeImporter.getStatus());
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/import/chrome/bookmarks', (_req: Request, res: Response) => {
    try {
      const result = ctx.chromeImporter.importBookmarks();
      // Reload BookmarkManager so it picks up the imported data
      ctx.bookmarkManager.reload();
      res.json(result);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/import/chrome/history', (_req: Request, res: Response) => {
    try {
      const result = ctx.chromeImporter.importHistory();
      res.json(result);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/import/chrome/cookies', async (_req: Request, res: Response) => {
    try {
      const result = await ctx.chromeImporter.importCookies(ctx.win.webContents.session);
      res.json(result);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/import/chrome/profiles', (_req: Request, res: Response) => {
    try {
      const profiles = ctx.chromeImporter.listProfiles();
      res.json({ profiles });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/import/chrome/sync/start', (req: Request, res: Response) => {
    try {
      if (req.body.profile) {
        ctx.chromeImporter.setProfile(req.body.profile);
      }
      const started = ctx.chromeImporter.startSync();
      res.json({ ok: started, syncing: ctx.chromeImporter.isSyncing() });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/import/chrome/sync/stop', (_req: Request, res: Response) => {
    try {
      ctx.chromeImporter.stopSync();
      res.json({ ok: true, syncing: false });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/import/chrome/sync/status', (_req: Request, res: Response) => {
    try {
      res.json({ syncing: ctx.chromeImporter.isSyncing() });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
