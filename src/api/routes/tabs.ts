import { Router, Request, Response } from 'express';
import path from 'path';
import { webContents } from 'electron';
import { RouteContext } from '../context';

export function registerTabRoutes(router: Router, ctx: RouteContext): void {
  router.post('/tabs/open', async (req: Request, res: Response) => {
    const { url = 'about:blank', groupId, source = 'robin', focus = true } = req.body;
    try {
      const tabSource = source === 'kees' || source === 'copilot' ? 'copilot' as const : 'robin' as const;
      const tab = await ctx.tabManager.openTab(url, groupId, tabSource, 'persist:tandem', focus);
      ctx.panelManager.logActivity('tab-open', { url, source: tabSource });
      res.json({ ok: true, tab });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/tabs/close', async (req: Request, res: Response) => {
    const { tabId } = req.body;
    if (!tabId) { res.status(400).json({ error: 'tabId required' }); return; }
    try {
      const closed = await ctx.tabManager.closeTab(tabId);
      res.json({ ok: closed });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/tabs/list', async (_req: Request, res: Response) => {
    try {
      const tabs = ctx.tabManager.listTabs();
      const groups = ctx.tabManager.listGroups();
      res.json({ tabs, groups });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/tabs/focus', async (req: Request, res: Response) => {
    const { tabId } = req.body;
    if (!tabId) { res.status(400).json({ error: 'tabId required' }); return; }
    try {
      const focused = await ctx.tabManager.focusTab(tabId);
      res.json({ ok: focused });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
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
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Set tab source (robin/copilot)
  router.post('/tabs/source', (req: Request, res: Response) => {
    try {
      const { tabId, source } = req.body;
      if (!tabId || !source) {
        return res.status(400).json({ error: 'tabId and source required' });
      }
      const ok = ctx.tabManager.setTabSource(tabId, source);
      res.json({ ok });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
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
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
