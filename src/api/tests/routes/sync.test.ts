import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {},
}));

import { registerSyncRoutes } from '../../routes/sync';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

describe('Sync Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerSyncRoutes, ctx);
  });

  // ─── GET /sync/status ────────────────────────────

  describe('GET /sync/status', () => {
    it('returns unconfigured status by default', async () => {
      const res = await request(app).get('/sync/status');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.enabled).toBe(false);
      expect(res.body.devicesFound).toEqual([]);
    });

    it('returns configured status with devices', async () => {
      vi.mocked(ctx.syncManager.getConfig).mockReturnValue({
        enabled: true, syncRoot: '/shared', deviceName: 'MacBook',
      } as any);
      vi.mocked(ctx.syncManager.isConfigured).mockReturnValue(true);
      vi.mocked(ctx.syncManager.getRemoteDevices).mockReturnValue([
        { name: 'iPad' }, { name: 'iMac' },
      ] as any);

      const res = await request(app).get('/sync/status');

      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(true);
      expect(res.body.syncRoot).toBe('/shared');
      expect(res.body.devicesFound).toEqual(['iPad', 'iMac']);
    });

    it('returns 500 when syncManager throws', async () => {
      vi.mocked(ctx.syncManager.getConfig).mockImplementation(() => { throw new Error('fail'); });

      const res = await request(app).get('/sync/status');

      expect(res.status).toBe(500);
    });
  });

  // ─── GET /sync/devices ───────────────────────────

  describe('GET /sync/devices', () => {
    it('returns remote devices', async () => {
      vi.mocked(ctx.syncManager.getRemoteDevices).mockReturnValue([
        { name: 'iPad', lastSeen: Date.now() },
      ] as any);

      const res = await request(app).get('/sync/devices');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.devices.length).toBe(1);
    });
  });

  // ─── POST /sync/config ───────────────────────────

  describe('POST /sync/config', () => {
    it('updates sync configuration', async () => {
      vi.mocked(ctx.configManager.updateConfig).mockReturnValue({
        deviceSync: { enabled: true, syncRoot: '/shared', deviceName: 'MacBook' },
      } as any);

      const res = await request(app)
        .post('/sync/config')
        .send({ enabled: true, deviceName: 'MacBook' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.configManager.updateConfig).toHaveBeenCalled();
    });

    it('returns 400 when syncRoot is not a string', async () => {
      const res = await request(app)
        .post('/sync/config')
        .send({ syncRoot: 42 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('syncRoot must be a string');
    });

    it('re-inits sync manager when enabled with syncRoot', async () => {
      vi.mocked(ctx.configManager.updateConfig).mockReturnValue({
        deviceSync: { enabled: true, syncRoot: '/shared', deviceName: 'Mac' },
      } as any);

      // Only send enabled + deviceName — syncRoot goes through
      // normalizeExistingDirectoryPath which validates the path on disk.
      // The configManager mock returns a config with syncRoot set,
      // so the re-init branch is reached.
      await request(app)
        .post('/sync/config')
        .send({ enabled: true, deviceName: 'Mac' });

      expect(ctx.syncManager.init).toHaveBeenCalled();
    });
  });

  // ─── POST /sync/trigger ──────────────────────────

  describe('POST /sync/trigger', () => {
    it('publishes tabs and history', async () => {
      vi.mocked(ctx.syncManager.isConfigured).mockReturnValue(true);
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([
        { id: 'tab-1', url: 'https://example.com', title: 'Example', favicon: '' },
      ] as any);
      vi.mocked(ctx.historyManager.getHistory).mockReturnValue([
        { url: 'https://example.com', title: 'Example' },
      ] as any);

      const res = await request(app).post('/sync/trigger');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.tabsPublished).toBe(1);
      expect(res.body.historyPublished).toBe(1);
      expect(ctx.syncManager.publishTabs).toHaveBeenCalled();
      expect(ctx.syncManager.publishHistory).toHaveBeenCalled();
    });

    it('returns 400 when sync is not configured', async () => {
      const res = await request(app).post('/sync/trigger');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Sync is not configured or disabled');
    });
  });
});
