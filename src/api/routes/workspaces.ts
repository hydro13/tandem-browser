import type { Router, Request, Response } from 'express';
import type { RouteContext } from '../context';

interface IdParams { id: string }

export function registerWorkspaceRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // WORKSPACES — Visual workspace management
  // ═══════════════════════════════════════════════

  router.get('/workspaces', (_req: Request, res: Response) => {
    try {
      const workspaces = ctx.workspaceManager.list();
      const activeId = ctx.workspaceManager.getActiveId();
      res.json({ ok: true, workspaces, activeId });
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post('/workspaces', (req: Request, res: Response) => {
    try {
      const { name, emoji, color } = req.body;
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      const workspace = ctx.workspaceManager.create({ name, emoji, color });
      res.json({ ok: true, workspace });
    } catch (e: unknown) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.delete('/workspaces/:id', (req: Request<IdParams>, res: Response) => {
    try {
      ctx.workspaceManager.remove(req.params.id);
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post('/workspaces/:id/switch', (req: Request<IdParams>, res: Response) => {
    try {
      const workspace = ctx.workspaceManager.switch(req.params.id);
      res.json({ ok: true, workspace });
    } catch (e: unknown) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.put('/workspaces/:id', (req: Request<IdParams>, res: Response) => {
    try {
      const { name, emoji, color } = req.body;
      const workspace = ctx.workspaceManager.update(req.params.id, { name, emoji, color });
      res.json({ ok: true, workspace });
    } catch (e: unknown) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post('/workspaces/:id/move-tab', (req: Request<IdParams>, res: Response) => {
    try {
      const { tabId } = req.body;
      if (tabId === undefined) { res.status(400).json({ error: 'tabId is required' }); return; }
      ctx.workspaceManager.moveTab(Number(tabId), req.params.id);
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
}
