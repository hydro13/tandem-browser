import { Router, Request, Response } from 'express';
import { RouteContext } from '../context';
import { LocatorQuery } from '../../locators/finder';
import { handleRouteError } from '../../utils/errors';

export function registerSnapshotRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // SNAPSHOTS — Accessibility-tree based interaction
  // ═══════════════════════════════════════════════

  router.get('/snapshot', async (req: Request, res: Response) => {
    try {
      const interactive = req.query.interactive === 'true';
      const compact = req.query.compact === 'true';
      const selector = req.query.selector as string | undefined;
      const depthStr = req.query.depth as string | undefined;
      const depth = depthStr ? parseInt(depthStr, 10) : undefined;
      const result = await ctx.snapshotManager.getSnapshot({ interactive, compact, selector, depth });
      res.json({ ok: true, snapshot: result.text, count: result.count, url: result.url });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/snapshot/click', async (req: Request, res: Response) => {
    const { ref } = req.body;
    if (!ref) { res.status(400).json({ error: 'ref required (e.g. "@e1")' }); return; }
    try {
      await ctx.snapshotManager.clickRef(ref);
      res.json({ ok: true, ref });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/snapshot/fill', async (req: Request, res: Response) => {
    const { ref, value } = req.body;
    if (!ref || value === undefined) { res.status(400).json({ error: 'ref and value required' }); return; }
    try {
      await ctx.snapshotManager.fillRef(ref, value);
      res.json({ ok: true, ref });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/snapshot/text', async (req: Request, res: Response) => {
    const ref = req.query.ref as string;
    if (!ref) { res.status(400).json({ error: 'ref query parameter required (e.g. "?ref=@e1")' }); return; }
    try {
      const text = await ctx.snapshotManager.getTextRef(ref);
      res.json({ ok: true, ref, text });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // LOCATORS — Semantic Element Finding (Playwright-style)
  // ═══════════════════════════════════════════════

  router.post('/find', async (req: Request, res: Response) => {
    const query: LocatorQuery = req.body;
    if (!query.by || !query.value) {
      res.status(400).json({ error: '"by" and "value" required' }); return;
    }
    try {
      const result = await ctx.locatorFinder.find(query);
      res.json(result);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/find/click', async (req: Request, res: Response) => {
    const { fillValue, ...query } = req.body;
    if (!query.by || !query.value) {
      res.status(400).json({ error: '"by" and "value" required' }); return;
    }
    try {
      const result = await ctx.locatorFinder.find(query);
      if (!result.found || !result.ref) {
        res.status(404).json({ found: false, error: 'Element not found' }); return;
      }
      await ctx.snapshotManager.clickRef(result.ref);
      res.json({ ok: true, ref: result.ref, clicked: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/find/fill', async (req: Request, res: Response) => {
    const { fillValue, ...query } = req.body;
    if (!query.by || !query.value) {
      res.status(400).json({ error: '"by" and "value" required' }); return;
    }
    if (!fillValue) { res.status(400).json({ error: 'fillValue required' }); return; }
    try {
      const result = await ctx.locatorFinder.find(query);
      if (!result.found || !result.ref) {
        res.status(404).json({ found: false, error: 'Element not found' }); return;
      }
      await ctx.snapshotManager.fillRef(result.ref, fillValue);
      res.json({ ok: true, ref: result.ref, filled: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/find/all', async (req: Request, res: Response) => {
    const query: LocatorQuery = req.body;
    if (!query.by || !query.value) {
      res.status(400).json({ error: '"by" and "value" required' }); return;
    }
    try {
      const results = await ctx.locatorFinder.findAll(query);
      res.json({ found: results.length > 0, count: results.length, results });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
