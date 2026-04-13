import type { Router, Request, Response } from 'express';
import type { RouteContext } from '../context';
import { handleRouteError } from '../../utils/errors';

interface IdParams { id: string }

function parseWorkspaceTabId(rawTabId: unknown): number | null {
  if (typeof rawTabId === 'number' && Number.isFinite(rawTabId)) {
    return rawTabId;
  }
  if (typeof rawTabId === 'string' && rawTabId.trim()) {
    const parsed = Number(rawTabId);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * Register workspace CRUD, activation, and tab-move routes.
 * @param router - Express router to attach routes to
 * @param ctx - shared manager registry and main BrowserWindow
 */
export function registerWorkspaceRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // WORKSPACES — Visual workspace management
  // ═══════════════════════════════════════════════

  router.get('/workspaces', (_req: Request, res: Response) => {
    try {
      const tabs = ctx.tabManager.listTabs();
      const activeTab = ctx.tabManager.getActiveTab();
      ctx.workspaceManager.reconcileTabState(
        tabs.map(tab => tab.webContentsId),
        activeTab?.webContentsId ?? null,
      );
      const workspaces = ctx.workspaceManager.list();
      const activeId = ctx.workspaceManager.getActiveId();
      res.json({
        ok: true,
        scope: 'global',
        workspaces,
        activeId,
        activeTabId: activeTab?.id ?? null,
        activeTabWorkspaceId: activeTab
          ? ctx.workspaceManager.getWorkspaceIdForTab(activeTab.webContentsId)
          : null,
        activeWorkspaceSource: ctx.workspaceManager.getActiveSource(),
      });
    } catch (e: unknown) {
      handleRouteError(res, e);
    }
  });

  router.post('/workspaces', (req: Request, res: Response) => {
    try {
      const { name, icon, color } = req.body;
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      const workspace = ctx.workspaceManager.create({ name, icon, color });
      res.json({ ok: true, workspace });
    } catch (e: unknown) {
      handleRouteError(res, e);
    }
  });

  router.delete('/workspaces/:id', (req: Request<IdParams>, res: Response) => {
    try {
      ctx.workspaceManager.remove(req.params.id);
      res.json({ ok: true });
    } catch (e: unknown) {
      handleRouteError(res, e);
    }
  });

  const activateWorkspace = async (req: Request<IdParams>, res: Response) => {
    try {
      const tabs = ctx.tabManager.listTabs();
      const tabByWebContentsId = new Map(tabs.map(tab => [tab.webContentsId, tab]));
      const activeTabBeforeSwitch = ctx.tabManager.getActiveTab();
      ctx.workspaceManager.reconcileTabState(
        tabs.map(tab => tab.webContentsId),
        activeTabBeforeSwitch?.webContentsId ?? null,
      );

      const workspace = ctx.workspaceManager.get(req.params.id);
      if (!workspace) {
        throw new Error(`Workspace ${req.params.id} not found`);
      }

      let focusedTabId: string | null = null;

      if (workspace.tabIds.length > 0) {
        const targetTab = workspace.tabIds
          .map(tabId => tabByWebContentsId.get(tabId))
          .find((tab): tab is NonNullable<typeof tab> => Boolean(tab));
        if (targetTab) {
          await ctx.tabManager.focusTab(targetTab.id);
          focusedTabId = targetTab.id;
        } else {
          ctx.workspaceManager.switch(req.params.id);
        }
      } else {
        ctx.workspaceManager.switch(req.params.id);
      }

      const activeTab = ctx.tabManager.getActiveTab();
      ctx.workspaceManager.reconcileTabState(
        tabs.map(tab => tab.webContentsId),
        activeTab?.webContentsId ?? null,
      );

      res.json({
        ok: true,
        scope: 'global',
        workspace: ctx.workspaceManager.get(workspace.id) ?? workspace,
        focusedTabId,
        activeId: ctx.workspaceManager.getActiveId(),
      });
    } catch (e: unknown) {
      handleRouteError(res, e);
    }
  };

  router.post('/workspaces/:id/activate', activateWorkspace);
  router.post('/workspaces/:id/switch', activateWorkspace);

  router.put('/workspaces/:id', (req: Request<IdParams>, res: Response) => {
    try {
      const { name, icon, color } = req.body;
      const workspace = ctx.workspaceManager.update(req.params.id, { name, icon, color });
      res.json({ ok: true, workspace });
    } catch (e: unknown) {
      handleRouteError(res, e);
    }
  });

  const moveTabToWorkspace = (req: Request<IdParams>, res: Response) => {
    try {
      const { tabId } = req.body;
      if (tabId === undefined) { res.status(400).json({ error: 'tabId is required' }); return; }
      const parsedTabId = parseWorkspaceTabId(tabId);
      if (parsedTabId === null) { res.status(400).json({ error: 'tabId must be a numeric webContents ID' }); return; }
      ctx.workspaceManager.moveTab(parsedTabId, req.params.id);
      res.json({ ok: true });
    } catch (e: unknown) {
      handleRouteError(res, e);
    }
  };

  router.post('/workspaces/:id/tabs', moveTabToWorkspace);
  router.post('/workspaces/:id/move-tab', moveTabToWorkspace);
}
