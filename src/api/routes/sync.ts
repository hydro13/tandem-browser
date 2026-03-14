import type { Router, Request, Response } from 'express';
import type { RouteContext } from '../context';
import * as fs from 'fs';
import { createRateLimitMiddleware } from '../rate-limit';

export function registerSyncRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // SYNC — Cross-device sync via shared folder
  // ═══════════════════════════════════════════════

  router.get('/sync/status', (_req: Request, res: Response) => {
    try {
      const config = ctx.syncManager.getConfig();
      const devices = ctx.syncManager.isConfigured()
        ? ctx.syncManager.getRemoteDevices().map(d => d.name)
        : [];
      res.json({
        ok: true,
        enabled: config?.enabled ?? false,
        syncRoot: config?.syncRoot ?? '',
        deviceName: config?.deviceName ?? '',
        devicesFound: devices,
      });
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.get('/sync/devices', (_req: Request, res: Response) => {
    try {
      const devices = ctx.syncManager.getRemoteDevices();
      res.json({ ok: true, devices });
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post('/sync/config', createRateLimitMiddleware({
    bucket: 'sync-config',
    windowMs: 60_000,
    max: 10,
    message: 'Too many sync configuration requests. Retry shortly.',
  }), (req: Request, res: Response) => {
    try {
      const { enabled, syncRoot, deviceName } = req.body;
      const patch: Record<string, unknown> = { deviceSync: {} };
      const ds = patch.deviceSync as Record<string, unknown>;
      if (enabled !== undefined) ds.enabled = !!enabled;
      if (syncRoot !== undefined) {
        // Validate syncRoot exists if enabling
        if (enabled && syncRoot && !fs.existsSync(syncRoot)) {
          res.status(400).json({ error: `syncRoot path does not exist: ${syncRoot}` });
          return;
        }
        ds.syncRoot = syncRoot;
      }
      if (deviceName !== undefined) ds.deviceName = deviceName;

      const updated = ctx.configManager.updateConfig(patch);
      const newSyncConfig = updated.deviceSync;

      // Re-init SyncManager with new config
      if (newSyncConfig.enabled && newSyncConfig.syncRoot) {
        ctx.syncManager.init(newSyncConfig);
      }

      res.json({ ok: true, deviceSync: newSyncConfig });
    } catch (e: unknown) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post('/sync/trigger', (_req: Request, res: Response) => {
    try {
      if (!ctx.syncManager.isConfigured()) {
        res.status(400).json({ error: 'Sync is not configured or disabled' });
        return;
      }

      // Publish tabs
      const tabs = ctx.tabManager.listTabs().map(t => ({
        tabId: t.id,
        url: t.url,
        title: t.title,
        favicon: t.favicon,
      }));
      ctx.syncManager.publishTabs(tabs);

      // Publish history
      const history = ctx.historyManager.getHistory(10000);
      ctx.syncManager.publishHistory(history);

      res.json({ ok: true, tabsPublished: tabs.length, historyPublished: history.length });
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
}
