import { Router, Request, Response } from 'express';
import { RouteContext, getSessionPartition, getSessionWC } from '../context';

export function registerSessionRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // DEVICE EMULATION
  // ═══════════════════════════════════════════════

  router.get('/device/profiles', (_req: Request, res: Response) => {
    res.json({ profiles: ctx.deviceEmulator.getProfiles() });
  });

  router.get('/device/status', (_req: Request, res: Response) => {
    res.json(ctx.deviceEmulator.getStatus());
  });

  router.post('/device/emulate', async (req: Request, res: Response) => {
    try {
      const wc = await getSessionWC(ctx, req);
      if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }

      const { device, width, height, deviceScaleFactor, mobile, userAgent } = req.body;

      if (device) {
        const profile = await ctx.deviceEmulator.emulateDevice(wc, device);
        res.json({ ok: true, profile });
      } else if (width && height) {
        await ctx.deviceEmulator.emulateCustom(wc, {
          width: Number(width),
          height: Number(height),
          deviceScaleFactor: deviceScaleFactor ? Number(deviceScaleFactor) : undefined,
          mobile: Boolean(mobile),
          userAgent,
        });
        res.json({ ok: true });
      } else {
        res.status(400).json({ error: '"device" or "width"+"height" required' });
      }
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post('/device/reset', async (req: Request, res: Response) => {
    try {
      const wc = await getSessionWC(ctx, req);
      if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }
      await ctx.deviceEmulator.reset(wc);
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // ═══════════════════════════════════════════════
  // SESSIONS — Geïsoleerde Browser Sessies
  // ═══════════════════════════════════════════════

  router.get('/sessions/list', async (_req: Request, res: Response) => {
    try {
      const sessions = ctx.sessionManager.list().map(s => ({
        ...s,
        tabs: ctx.tabManager.listTabs().filter(t => t.partition === s.partition).length,
      }));
      res.json({ ok: true, sessions, active: ctx.sessionManager.getActive() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/sessions/create', async (req: Request, res: Response) => {
    const { name, url } = req.body;
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    try {
      const sess = ctx.sessionManager.create(name);
      let tab = null;
      if (url) {
        tab = await ctx.tabManager.openTab(url, undefined, 'copilot', sess.partition);
      }
      res.json({ ok: true, name: sess.name, partition: sess.partition, tab: tab || undefined });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/sessions/switch', async (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    try {
      ctx.sessionManager.setActive(name);
      res.json({ ok: true, active: name });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/sessions/destroy', async (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    try {
      const sess = ctx.sessionManager.get(name);
      if (!sess) { res.status(404).json({ error: `Session '${name}' does not exist` }); return; }
      // Close all tabs belonging to this session
      const tabsToClose = ctx.tabManager.listTabs().filter(t => t.partition === sess.partition);
      for (const tab of tabsToClose) {
        await ctx.tabManager.closeTab(tab.id);
      }
      ctx.sessionManager.destroy(name);
      res.json({ ok: true, name });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/sessions/state/save', async (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    try {
      const partition = getSessionPartition(ctx, req);
      const filePath = await ctx.stateManager.save(name, partition);
      res.json({ ok: true, path: filePath });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/sessions/state/load', async (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    try {
      const partition = getSessionPartition(ctx, req);
      const result = await ctx.stateManager.load(name, partition);
      res.json({ ok: true, cookiesRestored: result.cookiesRestored });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/sessions/state/list', async (_req: Request, res: Response) => {
    try {
      const states = ctx.stateManager.list();
      res.json({ ok: true, states });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
