import { Router, Request, Response } from 'express';
import { RouteContext } from '../context';
import { handleRouteError } from '../../utils/errors';

export function registerNetworkRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // NETWORK INSPECTOR — Phase 3.8
  // ═══════════════════════════════════════════════

  router.get('/network/log', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const domain = req.query.domain as string | undefined;
      const entries = ctx.networkInspector.getLog(limit, domain);
      res.json({ entries, count: entries.length });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/network/apis', (_req: Request, res: Response) => {
    try {
      const apis = ctx.networkInspector.getApis();
      res.json({ apis });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/network/domains', (_req: Request, res: Response) => {
    try {
      const domains = ctx.networkInspector.getDomains();
      res.json({ domains });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.delete('/network/clear', (_req: Request, res: Response) => {
    try {
      ctx.networkInspector.clear();
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // NETWORK MOCK — Request Interceptie & Mocking
  // ═══════════════════════════════════════════════

  router.post('/network/mock', async (req: Request, res: Response) => {
    try {
      const { pattern, abort, status, body, headers, delay } = req.body;
      if (!pattern) { res.status(400).json({ error: 'pattern required' }); return; }
      const rule = await ctx.networkMocker.addRule({ pattern, abort, status, body, headers, delay });
      res.json({ ok: true, id: rule.id, pattern: rule.pattern });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // Alias: agent-browser compatible
  router.post('/network/route', async (req: Request, res: Response) => {
    try {
      const { pattern, abort, status, body, headers, delay } = req.body;
      if (!pattern) { res.status(400).json({ error: 'pattern required' }); return; }
      const rule = await ctx.networkMocker.addRule({ pattern, abort, status, body, headers, delay });
      res.json({ ok: true, id: rule.id, pattern: rule.pattern });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/network/mocks', (_req: Request, res: Response) => {
    try {
      const mocks = ctx.networkMocker.getRules().map(r => ({
        id: r.id,
        pattern: r.pattern,
        status: r.status,
        abort: r.abort || false,
        delay: r.delay,
        createdAt: r.createdAt,
      }));
      res.json({ ok: true, mocks, count: mocks.length });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/network/unmock', async (req: Request, res: Response) => {
    try {
      const { pattern, id } = req.body;
      if (!pattern && !id) { res.status(400).json({ error: 'pattern or id required' }); return; }
      let removed = 0;
      if (id) {
        removed = await ctx.networkMocker.removeRuleById(id);
      } else {
        removed = await ctx.networkMocker.removeRule(pattern);
      }
      res.json({ ok: true, removed });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // Alias: agent-browser compatible
  router.post('/network/unroute', async (req: Request, res: Response) => {
    try {
      const { pattern, id } = req.body;
      if (!pattern && !id) { res.status(400).json({ error: 'pattern or id required' }); return; }
      let removed = 0;
      if (id) {
        removed = await ctx.networkMocker.removeRuleById(id);
      } else {
        removed = await ctx.networkMocker.removeRule(pattern);
      }
      res.json({ ok: true, removed });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/network/mock-clear', async (_req: Request, res: Response) => {
    try {
      const removed = await ctx.networkMocker.clearRules();
      res.json({ ok: true, removed });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
