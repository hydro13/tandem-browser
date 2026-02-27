import type { Router, Request, Response } from 'express';
import type { RouteContext} from '../context';
import { getActiveWC, getSessionWC } from '../context';
import { handleRouteError } from '../../utils/errors';

export function registerContentRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // CONTENT EXTRACTION
  // ═══════════════════════════════════════════════

  router.post('/content/extract', async (_req: Request, res: Response) => {
    try {
      const wc = await getActiveWC(ctx);
      if (!wc) {
        res.status(500).json({ error: 'No active tab' });
        return;
      }

      const content = await ctx.contentExtractor.extractCurrentPage(ctx.win);
      res.json(content);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/content/extract/url', async (req: Request, res: Response) => {
    try {
      const { url } = req.body;
      if (!url) {
        res.status(400).json({ error: 'url required' });
        return;
      }

      const content = await ctx.contentExtractor.extractFromURL(url, ctx.headlessManager);
      res.json(content);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // CONTEXT BRIDGE
  // ═══════════════════════════════════════════════

  router.get('/context/recent', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const pages = ctx.contextBridge.getRecent(limit);
      res.json({ pages });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/context/search', (req: Request, res: Response) => {
    try {
      const q = req.query.q as string;
      if (!q) { res.status(400).json({ error: 'q parameter required' }); return; }
      const results = ctx.contextBridge.search(q);
      res.json({ results });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/context/page', (req: Request, res: Response) => {
    try {
      const url = req.query.url as string;
      if (!url) { res.status(400).json({ error: 'url parameter required' }); return; }
      const page = ctx.contextBridge.getPage(url);
      if (!page) { res.status(404).json({ error: 'Page not found in context' }); return; }
      res.json(page);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/context/summary', (_req: Request, res: Response) => {
    try {
      const summary = ctx.contextBridge.getContextSummary();
      res.json(summary);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/context/note', (req: Request, res: Response) => {
    try {
      const { url, note } = req.body;
      if (!url || !note) { res.status(400).json({ error: 'url and note required' }); return; }
      const page = ctx.contextBridge.addNote(url, note);
      res.json({ ok: true, page });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // PERSISTENT SCRIPT INJECTION — Agent Tools Phase 1
  // ═══════════════════════════════════════════════

  router.get('/scripts', (_req: Request, res: Response) => {
    try {
      const scripts = ctx.scriptInjector.listScripts().map(s => ({
        name: s.name,
        enabled: s.enabled,
        preview: s.code.substring(0, 80),
        addedAt: s.addedAt,
      }));
      res.json({ scripts });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/scripts/add', (req: Request, res: Response) => {
    const { name, code } = req.body;
    if (!name || !code) { res.status(400).json({ error: 'name and code required' }); return; }
    try {
      const entry = ctx.scriptInjector.addScript(name, code);
      res.json({ ok: true, name: entry.name, active: entry.enabled });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.delete('/scripts/remove', (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    try {
      const removed = ctx.scriptInjector.removeScript(name);
      res.json({ ok: true, removed });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/scripts/enable', (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    try {
      const ok = ctx.scriptInjector.enableScript(name);
      if (!ok) { res.status(404).json({ error: `script "${name}" not found` }); return; }
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/scripts/disable', (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    try {
      const ok = ctx.scriptInjector.disableScript(name);
      if (!ok) { res.status(404).json({ error: `script "${name}" not found` }); return; }
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // PERSISTENT STYLE INJECTION — Agent Tools Phase 1
  // ═══════════════════════════════════════════════

  router.get('/styles', (_req: Request, res: Response) => {
    try {
      const styles = ctx.scriptInjector.listStyles().map(s => ({
        name: s.name,
        enabled: s.enabled,
        preview: s.css.substring(0, 80),
        addedAt: s.addedAt,
      }));
      res.json({ styles });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/styles/add', async (req: Request, res: Response) => {
    const { name, css } = req.body;
    if (!name || !css) { res.status(400).json({ error: 'name and css required' }); return; }
    try {
      ctx.scriptInjector.addStyle(name, css);
      // Inject immediately into active tab
      const wc = await getSessionWC(ctx, req);
      if (wc && !wc.isDestroyed()) await wc.insertCSS(css);
      res.json({ ok: true, name });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.delete('/styles/remove', async (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    try {
      const removed = ctx.scriptInjector.removeStyle(name);
      res.json({ ok: true, removed });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/styles/enable', (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    try {
      const ok = ctx.scriptInjector.enableStyle(name);
      if (!ok) { res.status(404).json({ error: `style "${name}" not found` }); return; }
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/styles/disable', (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    try {
      const ok = ctx.scriptInjector.disableStyle(name);
      if (!ok) { res.status(404).json({ error: `style "${name}" not found` }); return; }
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
