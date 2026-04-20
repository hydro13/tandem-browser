import type { Router, Request, Response } from 'express';
import type { RouteContext} from '../context';
import { getActiveWC, getSessionWC, agentIdFromRequest } from '../context';
import { handleRouteError } from '../../utils/errors';
import { DEFAULT_TIMEOUT_MS } from '../../utils/constants';
import { domainKeyFromUrl } from '../../security/agent-trust';

/**
 * Shared precheck for agent-initiated script/style persistence.
 *
 * Fix for the asymmetry uncovered in 2026-04-20 review: `/execute-js/confirm`
 * was approval-gated but `/scripts/add` and `/styles/add` were not, even
 * though registering a persistent script is *more* powerful (runs on every
 * matching page, forever). Same agent-trust precheck as execute-js:
 * if the (agent, current-tab-domain) pair is covered by T2/T3/T4 trust,
 * pass through; otherwise fire the approval modal.
 *
 * Returns true if the call may proceed. Returns false iff the user
 * explicitly rejected the modal; in that case the caller must have
 * already sent a 403 response.
 */
async function requireAgentApproval(
  ctx: RouteContext,
  req: Request,
  res: Response,
  description: string,
  riskLevel: 'medium' | 'high',
): Promise<boolean> {
  try {
    const agentId = agentIdFromRequest(req);
    const wc = await getSessionWC(ctx, req);
    const targetUrl = wc && !wc.isDestroyed() && typeof wc.getURL === 'function' ? wc.getURL() : '';
    const domain = domainKeyFromUrl(targetUrl);
    if (domain && ctx.agentTrust.isApproved(agentId, domain)) {
      return true;
    }
  } catch {
    // precheck best-effort — fall through to approval modal
  }

  const task = ctx.taskManager.createTask(
    description,
    'claude',
    'claude',
    [{
      description,
      action: { type: 'script_inject', params: {} },
      riskLevel,
      requiresApproval: true,
    }],
  );
  const approved = await Promise.race([
    ctx.taskManager.requestApproval(task, 0),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), DEFAULT_TIMEOUT_MS)),
  ]);
  if (!approved) {
    res.status(403).json({ error: 'User rejected script/style injection', rejected: true });
    return false;
  }
  return true;
}

/**
 * Register content extraction and URL-fetch routes.
 * @param router - Express router to attach routes to
 * @param ctx - shared manager registry and main BrowserWindow
 */
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

  router.post('/scripts/add', async (req: Request, res: Response) => {
    const { name, code } = req.body;
    if (!name || !code) { res.status(400).json({ error: 'name and code required' }); return; }
    try {
      const preview = String(code).slice(0, 120);
      const ok = await requireAgentApproval(
        ctx, req, res,
        `Register persistent script "${name}": ${preview}`,
        'high',
      );
      if (!ok) return; // response already sent
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
      const preview = String(css).slice(0, 120);
      const ok = await requireAgentApproval(
        ctx, req, res,
        `Register persistent style "${name}": ${preview}`,
        'medium',
      );
      if (!ok) return;
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
