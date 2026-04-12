import type { Router, Request, Response } from 'express';
import { webContents } from 'electron';
import type { RouteContext } from '../context';
import { handleRouteError } from '../../utils/errors';

/**
 * Register all tab-related API routes (open, close, list, focus, group, source, reconcile, cleanup).
 * @param router - Express router to attach routes to
 * @param ctx - shared manager registry and main BrowserWindow
 */
export function registerTabRoutes(router: Router, ctx: RouteContext): void {
  router.post('/tabs/open', async (req: Request, res: Response) => {
    const {
      url = 'about:blank',
      groupId,
      source = 'user',
      focus = true,
      inheritSessionFrom,
      workspaceId,
    } = req.body;
    if (inheritSessionFrom !== undefined && typeof inheritSessionFrom !== 'string') {
      res.status(400).json({ error: 'inheritSessionFrom must be a tab ID string' });
      return;
    }
    if (workspaceId !== undefined && typeof workspaceId !== 'string') {
      res.status(400).json({ error: 'workspaceId must be a workspace ID string' });
      return;
    }
    if (workspaceId && !ctx.workspaceManager.get(workspaceId)) {
      res.status(400).json({ error: `Workspace ${workspaceId} not found` });
      return;
    }
    try {
      const tabSource = source === 'wingman' ? 'wingman' as const : 'user' as const;
      const tab = await ctx.tabManager.openTab(
        url,
        groupId,
        tabSource,
        'persist:tandem',
        focus,
        inheritSessionFrom ? { inheritSessionFrom } : undefined,
      );
      if (workspaceId) {
        ctx.workspaceManager.moveTab(tab.webContentsId, workspaceId);
      }
      ctx.panelManager.logActivity('tab-open', {
        url,
        source: tabSource,
        inheritSessionFrom: inheritSessionFrom || null,
        workspaceId: workspaceId || null,
      });
      res.json({ ok: true, tab });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/tabs/close', async (req: Request, res: Response) => {
    const { tabId } = req.body;
    if (!tabId) { res.status(400).json({ error: 'tabId required' }); return; }
    try {
      const closed = await ctx.tabManager.closeTab(tabId);
      res.json({ ok: closed });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/tabs/list', async (_req: Request, res: Response) => {
    try {
      const tabs = ctx.tabManager.listTabs();
      const groups = ctx.tabManager.listGroups();
      res.json({ tabs, groups });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/tabs/focus', async (req: Request, res: Response) => {
    const { tabId } = req.body;
    if (!tabId) { res.status(400).json({ error: 'tabId required' }); return; }
    try {
      const focused = await ctx.tabManager.focusTab(tabId);
      res.json({ ok: focused });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/tabs/group', async (req: Request, res: Response) => {
    const { groupId, name, color = '#4285f4', tabIds } = req.body;
    if (!groupId || !name || !tabIds) {
      res.status(400).json({ error: 'groupId, name, and tabIds required' });
      return;
    }
    try {
      const group = ctx.tabManager.setGroup(groupId, name, color, tabIds);
      res.json({ ok: true, group });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // Set tab source (robin/wingman)
  router.post('/tabs/source', (req: Request, res: Response) => {
    try {
      const { tabId, source } = req.body;
      if (!tabId || !source) {
        return res.status(400).json({ error: 'tabId and source required' });
      }
      const ok = ctx.tabManager.setTabSource(tabId, source);
      res.json({ ok });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // Reconcile renderer tab strip with main-process state.
  // Removes renderer-side orphans (tabs visible in UI but unknown to main process).
  router.post('/tabs/reconcile', async (_req: Request, res: Response) => {
    try {
      const result = await ctx.tabManager.reconcileWithRenderer();
      res.json({ ok: true, ...result });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // Set or flash emoji on a tab
  router.post('/tabs/:id/emoji', (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { emoji, flash } = req.body;
      if (!emoji) {
        res.status(400).json({ error: 'emoji required' });
        return;
      }
      const ok = flash
        ? ctx.tabManager.flashEmoji(id, emoji)
        : ctx.tabManager.setEmoji(id, emoji);
      if (!ok) {
        res.status(404).json({ error: 'Tab not found' });
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // Remove emoji from a tab
  router.delete('/tabs/:id/emoji', (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const ok = ctx.tabManager.clearEmoji(id);
      if (!ok) {
        res.status(404).json({ error: 'Tab not found' });
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // Cleanup zombie tabs (unmanaged webContents)
  router.post('/tabs/cleanup', (_req: Request, res: Response) => {
    try {
      const trackedIds = new Set(
        ctx.tabManager.listTabs().map(t => t.webContentsId)
      );
      // Also include the main window's webContents
      const mainWcId = ctx.win.webContents.id;
      trackedIds.add(mainWcId);

      let destroyed = 0;
      for (const wc of webContents.getAllWebContents()) {
        if (wc.isDestroyed()) continue;
        if (trackedIds.has(wc.id)) continue;
        const wcUrl = wc.getURL();
        if (wcUrl.startsWith('file://') || wcUrl.startsWith('devtools://') || wcUrl.startsWith('chrome://')) continue;
        wc.close();
        destroyed++;
      }
      res.json({ ok: true, destroyed });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
