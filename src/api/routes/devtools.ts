import { Router, Request, Response } from 'express';
import { RouteContext } from '../context';

export function registerDevtoolsRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // DEVTOOLS — CDP Bridge for Copilot
  // ═══════════════════════════════════════════════

  /** DevTools status */
  router.get('/devtools/status', async (_req: Request, res: Response) => {
    try {
      const status = ctx.devToolsManager.getStatus();
      res.json(status);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Console log entries */
  router.get('/devtools/console', (req: Request, res: Response) => {
    try {
      const level = req.query.level as string | undefined;
      const sinceId = req.query.since_id ? parseInt(req.query.since_id as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const search = req.query.search as string | undefined;
      const entries = ctx.devToolsManager.getConsoleEntries({ level, sinceId, limit, search });
      const counts = ctx.devToolsManager.getConsoleCounts();
      res.json({ entries, counts, total: entries.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Console errors only (convenience) */
  router.get('/devtools/console/errors', (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const errors = ctx.devToolsManager.getConsoleErrors(limit);
      res.json({ errors, total: errors.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Clear console log buffer */
  router.post('/devtools/console/clear', (_req: Request, res: Response) => {
    ctx.devToolsManager.clearConsole();
    res.json({ ok: true });
  });

  /** Network entries (CDP-level, with headers and POST bodies) */
  router.get('/devtools/network', (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const domain = req.query.domain as string | undefined;
      const type = req.query.type as string | undefined;
      const failed = req.query.failed === 'true' ? true : req.query.failed === 'false' ? false : undefined;
      const search = req.query.search as string | undefined;
      const statusMin = req.query.status_min ? parseInt(req.query.status_min as string) : undefined;
      const statusMax = req.query.status_max ? parseInt(req.query.status_max as string) : undefined;
      const entries = ctx.devToolsManager.getNetworkEntries({ limit, domain, type, failed, search, statusMin, statusMax });
      res.json({ entries, total: entries.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Get response body for a specific network request */
  router.get('/devtools/network/:requestId/body', async (req: Request, res: Response) => {
    try {
      const body = await ctx.devToolsManager.getResponseBody(req.params.requestId as string);
      if (!body) {
        res.status(404).json({ error: 'Response body not available (evicted or streamed)' });
        return;
      }
      res.json(body);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Clear network log */
  router.post('/devtools/network/clear', (_req: Request, res: Response) => {
    ctx.devToolsManager.clearNetwork();
    res.json({ ok: true });
  });

  /** Query DOM by CSS selector */
  router.post('/devtools/dom/query', async (req: Request, res: Response) => {
    try {
      const { selector, maxResults = 10 } = req.body;
      if (!selector) { res.status(400).json({ error: 'selector required' }); return; }
      const nodes = await ctx.devToolsManager.queryDOM(selector, maxResults);
      res.json({ nodes, total: nodes.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Query DOM by XPath */
  router.post('/devtools/dom/xpath', async (req: Request, res: Response) => {
    try {
      const { expression, maxResults = 10 } = req.body;
      if (!expression) { res.status(400).json({ error: 'expression required' }); return; }
      const nodes = await ctx.devToolsManager.queryXPath(expression, maxResults);
      res.json({ nodes, total: nodes.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Get storage (cookies, localStorage, sessionStorage) */
  router.get('/devtools/storage', async (_req: Request, res: Response) => {
    try {
      const data = await ctx.devToolsManager.getStorage();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Get performance metrics */
  router.get('/devtools/performance', async (_req: Request, res: Response) => {
    try {
      const metrics = await ctx.devToolsManager.getPerformanceMetrics();
      if (!metrics) {
        res.status(503).json({ error: 'No active tab or CDP not attached' });
        return;
      }
      res.json(metrics);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Evaluate JavaScript via CDP Runtime */
  router.post('/devtools/evaluate', async (req: Request, res: Response) => {
    try {
      const { expression, returnByValue = true, awaitPromise = true } = req.body;
      if (!expression) { res.status(400).json({ error: 'expression required' }); return; }
      const result = await ctx.devToolsManager.evaluate(expression, { returnByValue, awaitPromise });
      res.json({ ok: true, result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Raw CDP command (advanced — send any CDP method) */
  router.post('/devtools/cdp', async (req: Request, res: Response) => {
    try {
      const { method, params } = req.body;
      if (!method) { res.status(400).json({ error: 'method required' }); return; }
      const result = await ctx.devToolsManager.sendCommand(method, params);
      res.json({ ok: true, result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Screenshot a specific element by CSS selector */
  router.post('/devtools/screenshot/element', async (req: Request, res: Response) => {
    try {
      const { selector } = req.body;
      if (!selector) { res.status(400).json({ error: 'selector required' }); return; }
      const png = await ctx.devToolsManager.screenshotElement(selector);
      if (!png) {
        res.status(404).json({ error: 'Element not found or screenshot failed' });
        return;
      }
      res.set('Content-Type', 'image/png');
      res.send(png);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Toggle DevTools window for active tab (for debugging).
   *  NOTE: After closing DevTools, CDP connection is lost.
   *  The next API call to any /devtools/* endpoint will re-attach automatically. */
  router.post('/devtools/toggle', async (_req: Request, res: Response) => {
    try {
      const wc = await ctx.tabManager.getActiveWebContents();
      if (wc) {
        if (wc.isDevToolsOpened()) {
          wc.closeDevTools();
        } else {
          wc.openDevTools({ mode: 'detach' });
        }
        res.json({ ok: true, open: wc.isDevToolsOpened() });
      } else {
        res.status(404).json({ error: 'No active tab' });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
