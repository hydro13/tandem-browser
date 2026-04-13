import type { Router, Request, Response } from 'express';
import type { RouteContext } from '../context';
import {
  buildInteractionScope,
  resolveEffectiveTabTarget,
  sendRequestedTabNotFound,
  type InteractionScope,
} from '../interaction';
import type { LocatorQuery } from '../../locators/finder';
import { InteractionTargetNotFoundError } from '../../interaction/errors';
import { handleRouteError } from '../../utils/errors';
import { injectionScannerMiddleware } from '../middleware/injection-scanner';

function buildRefScope(ctx: RouteContext, wcId: number | null): InteractionScope {
  const tab = wcId ? ctx.tabManager.listTabs().find(candidate => candidate.webContentsId === wcId) || null : null;
  return {
    kind: 'tab',
    tabId: tab?.id ?? null,
    wcId,
    source: 'ref',
    url: tab?.url ?? null,
    title: tab?.title ?? null,
    sessionName: null,
  };
}

/**
 * Register accessibility-tree snapshot and locator-based interaction routes.
 * @param router - Express router to attach routes to
 * @param ctx - shared manager registry and main BrowserWindow
 */
export function registerSnapshotRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // SNAPSHOTS — Accessibility-tree based interaction
  // ═══════════════════════════════════════════════

  router.get('/snapshot', injectionScannerMiddleware, async (req: Request, res: Response) => {
    try {
      const interactive = req.query.interactive === 'true';
      const compact = req.query.compact === 'true';
      const selector = req.query.selector as string | undefined;
      const depthStr = req.query.depth as string | undefined;
      const depth = depthStr ? parseInt(depthStr, 10) : undefined;
      const target = resolveEffectiveTabTarget(ctx, req, { allowQuery: true });
      if (target.requestedTabId && !target.tab) {
        sendRequestedTabNotFound(res, target.requestedTabId);
        return;
      }

      const result = await ctx.snapshotManager.getSnapshot({
        interactive,
        compact,
        selector,
        depth,
        wcId: target.tab?.webContentsId,
      });
      res.json({ ok: true, scope: buildInteractionScope(target), snapshot: result.text, count: result.count, url: result.url });
    } catch (e) {
      if (e instanceof InteractionTargetNotFoundError) {
        res.status(404).json({ ok: false, action: 'find.click', error: e.message });
        return;
      }
      handleRouteError(res, e);
    }
  });

  router.post('/snapshot/click', async (req: Request, res: Response) => {
    const { ref, confirm, waitForNavigation, navigationTimeoutMs, confirmTimeoutMs } = req.body ?? {};
    if (!ref) { res.status(400).json({ error: 'ref required (e.g. "@e1")' }); return; }
    try {
      const result = await ctx.snapshotManager.clickRef(ref, {
        confirm,
        waitForNavigation,
        timeoutMs: navigationTimeoutMs,
        confirmTimeoutMs,
      });
      res.json({
        ok: true,
        action: 'snapshot.click',
        scope: buildRefScope(ctx, result.wcId),
        target: result.target,
        completion: result.completion,
        postAction: result.postAction,
      });
    } catch (e) {
      if (e instanceof InteractionTargetNotFoundError) {
        res.status(404).json({
          ok: false,
          action: 'snapshot.click',
          target: { kind: 'ref', ref, resolved: false },
          error: e.message,
        });
        return;
      }
      handleRouteError(res, e);
    }
  });

  router.post('/snapshot/fill', async (req: Request, res: Response) => {
    const { ref, value, confirm, confirmTimeoutMs } = req.body ?? {};
    if (!ref || value === undefined) { res.status(400).json({ error: 'ref and value required' }); return; }
    try {
      const result = await ctx.snapshotManager.fillRef(ref, value, { confirm, confirmTimeoutMs });
      res.json({
        ok: true,
        action: 'snapshot.fill',
        scope: buildRefScope(ctx, result.wcId),
        target: result.target,
        requestedValue: value,
        completion: result.completion,
        postAction: result.postAction,
      });
    } catch (e) {
      if (e instanceof InteractionTargetNotFoundError) {
        res.status(404).json({
          ok: false,
          action: 'snapshot.fill',
          target: { kind: 'ref', ref, resolved: false },
          error: e.message,
        });
        return;
      }
      handleRouteError(res, e);
    }
  });

  router.get('/snapshot/text', injectionScannerMiddleware, async (req: Request, res: Response) => {
    const ref = req.query.ref as string;
    if (!ref) { res.status(400).json({ error: 'ref query parameter required (e.g. "?ref=@e1")' }); return; }
    try {
      const text = await ctx.snapshotManager.getTextRef(ref);
      res.json({ ok: true, ref, text });
    } catch (e) {
      if (e instanceof InteractionTargetNotFoundError) {
        res.status(404).json({ ok: false, action: 'find.fill', error: e.message });
        return;
      }
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
      const target = resolveEffectiveTabTarget(ctx, req);
      if (target.requestedTabId && !target.tab) {
        sendRequestedTabNotFound(res, target.requestedTabId);
        return;
      }
      const result = await ctx.locatorFinder.find(query, { wcId: target.tab?.webContentsId });
      res.json({ scope: buildInteractionScope(target), query, result });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/find/click', async (req: Request, res: Response) => {
    try {
      const {
        fillValue: _fillValue,
        confirm,
        waitForNavigation,
        navigationTimeoutMs,
        confirmTimeoutMs: _confirmTimeoutMs,
        ...query
      } = (req.body ?? {}) as LocatorQuery & {
        fillValue?: unknown;
        confirm?: boolean;
        waitForNavigation?: boolean;
        navigationTimeoutMs?: number;
        confirmTimeoutMs?: number;
      };
      if (!query.by || !query.value) {
        res.status(400).json({ error: '"by" and "value" required' }); return;
      }
      const target = resolveEffectiveTabTarget(ctx, req);
      if (target.requestedTabId && !target.tab) {
        sendRequestedTabNotFound(res, target.requestedTabId);
        return;
      }
      const result = await ctx.locatorFinder.find(query, { wcId: target.tab?.webContentsId });
      if (!result.found || !result.ref) {
        res.status(404).json({
          ok: false,
          action: 'find.click',
          scope: buildInteractionScope(target),
          target: {
            kind: 'locator',
            locator: query,
            resolved: false,
          },
          error: 'Element not found',
        }); return;
      }
      const action = await ctx.snapshotManager.clickRef(result.ref, {
        confirm,
        waitForNavigation,
        timeoutMs: navigationTimeoutMs,
      });
      res.json({
        ok: true,
        action: 'find.click',
        scope: buildRefScope(ctx, action.wcId),
        target: {
          kind: 'locator',
          locator: query,
          resolved: true,
          ref: result.ref,
          role: result.role ?? null,
          text: result.text ?? null,
          tagName: result.tagName ?? action.target.tagName,
        },
        completion: action.completion,
        postAction: action.postAction,
      });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/find/fill', async (req: Request, res: Response) => {
    try {
      const {
        fillValue,
        confirm,
        confirmTimeoutMs,
        ...query
      } = (req.body ?? {}) as LocatorQuery & {
        fillValue?: string;
        confirm?: boolean;
        confirmTimeoutMs?: number;
      };
      if (!query.by || !query.value) {
        res.status(400).json({ error: '"by" and "value" required' }); return;
      }
      if (!fillValue) { res.status(400).json({ error: 'fillValue required' }); return; }
      const target = resolveEffectiveTabTarget(ctx, req);
      if (target.requestedTabId && !target.tab) {
        sendRequestedTabNotFound(res, target.requestedTabId);
        return;
      }
      const result = await ctx.locatorFinder.find(query, { wcId: target.tab?.webContentsId });
      if (!result.found || !result.ref) {
        res.status(404).json({
          ok: false,
          action: 'find.fill',
          scope: buildInteractionScope(target),
          target: {
            kind: 'locator',
            locator: query,
            resolved: false,
          },
          error: 'Element not found',
        }); return;
      }
      const action = await ctx.snapshotManager.fillRef(result.ref, fillValue, { confirm, confirmTimeoutMs });
      res.json({
        ok: true,
        action: 'find.fill',
        scope: buildRefScope(ctx, action.wcId),
        target: {
          kind: 'locator',
          locator: query,
          resolved: true,
          ref: result.ref,
          role: result.role ?? null,
          text: result.text ?? null,
          tagName: result.tagName ?? action.target.tagName,
        },
        requestedValue: fillValue,
        completion: action.completion,
        postAction: action.postAction,
      });
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
      const target = resolveEffectiveTabTarget(ctx, req);
      if (target.requestedTabId && !target.tab) {
        sendRequestedTabNotFound(res, target.requestedTabId);
        return;
      }
      const results = await ctx.locatorFinder.findAll(query, { wcId: target.tab?.webContentsId });
      res.json({ scope: buildInteractionScope(target), found: results.length > 0, count: results.length, results });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
