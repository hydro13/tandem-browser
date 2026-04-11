import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {},
}));

import { registerAwarenessRoutes } from '../../routes/awareness';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

describe('Awareness Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerAwarenessRoutes, ctx);
  });

  // ─── GET /awareness/digest ───────────────────────

  describe('GET /awareness/digest', () => {
    it('returns a digest with default 5 minutes', async () => {
      const res = await request(app).get('/awareness/digest');

      expect(res.status).toBe(200);
      expect(res.body.period).toBeDefined();
      expect(res.body.navigation).toBeDefined();
      expect(res.body.interactions).toBeDefined();
      expect(res.body.errors).toBeDefined();
      expect(res.body.tabs).toBeDefined();
      expect(res.body.downloads).toBeDefined();
      expect(res.body.watches).toBeDefined();
      expect(res.body.summary).toBeDefined();
      expect(ctx.activityTracker.getLog).toHaveBeenCalled();
      expect(ctx.eventStream.getRecent).toHaveBeenCalled();
    });

    it('respects minutes query param', async () => {
      const res = await request(app).get('/awareness/digest?minutes=10');

      expect(res.status).toBe(200);
      expect(res.body.period).toBeDefined();
    });

    it('caps minutes at 60', async () => {
      const res = await request(app).get('/awareness/digest?minutes=120');

      expect(res.status).toBe(200);
      // The period should be at most 60 minutes
      const duration = res.body.period.to - res.body.period.from;
      expect(duration).toBeLessThanOrEqual(60 * 60_000 + 1000); // 60 min + small tolerance
    });

    it('respects since query param', async () => {
      const since = Date.now() - 30_000;
      const res = await request(app).get(`/awareness/digest?since=${since}`);

      expect(res.status).toBe(200);
      expect(res.body.period.from).toBe(since);
    });

    it('includes navigation data from activity entries', async () => {
      const now = Date.now();
      vi.mocked(ctx.activityTracker.getLog).mockReturnValue([
        { type: 'navigate', timestamp: now - 5000, data: { url: 'https://example.com', title: 'Example' } },
        { type: 'navigate', timestamp: now - 2000, data: { url: 'https://test.com', title: 'Test' } },
      ] as any);

      const res = await request(app).get('/awareness/digest');

      expect(res.status).toBe(200);
      expect(res.body.navigation.total_navigations).toBe(2);
      expect(res.body.navigation.sites_visited).toContain('example.com');
    });

    it('includes click count in interactions', async () => {
      const now = Date.now();
      vi.mocked(ctx.activityTracker.getLog).mockReturnValue([
        { type: 'click', timestamp: now - 1000, data: {} },
        { type: 'click', timestamp: now - 500, data: {} },
      ] as any);

      const res = await request(app).get('/awareness/digest');

      expect(res.status).toBe(200);
      expect(res.body.interactions.clicks).toBe(2);
    });

    it('includes console errors when available', async () => {
      const now = Date.now();
      vi.mocked(ctx.devToolsManager.getConsoleErrors).mockReturnValue([
        { level: 'error', text: 'Uncaught TypeError', url: 'https://example.com/app.js', timestamp: now - 1000 },
      ] as any);

      const res = await request(app).get('/awareness/digest');

      expect(res.status).toBe(200);
      expect(res.body.errors.console_errors.length).toBe(1);
      expect(res.body.errors.console_errors[0].message).toBe('Uncaught TypeError');
    });

    it('handles devtools not attached gracefully', async () => {
      vi.mocked(ctx.devToolsManager.getConsoleErrors).mockImplementation(() => { throw new Error('CDP not attached'); });
      vi.mocked(ctx.devToolsManager.getNetworkEntries).mockImplementation(() => { throw new Error('CDP not attached'); });

      const res = await request(app).get('/awareness/digest');

      expect(res.status).toBe(200);
      expect(res.body.errors.console_errors).toEqual([]);
      expect(res.body.errors.network_failures).toEqual([]);
    });

    it('includes completed downloads', async () => {
      vi.mocked(ctx.downloadManager.list).mockReturnValue([
        { status: 'completed', endTime: new Date().toISOString(), filename: 'file.pdf', savePath: '/tmp/file.pdf' },
      ] as any);

      const res = await request(app).get('/awareness/digest');

      expect(res.status).toBe(200);
      expect(res.body.downloads.completed.length).toBe(1);
    });

    it('includes watch changes', async () => {
      const now = Date.now();
      vi.mocked(ctx.watchManager.listWatches).mockReturnValue([
        { id: 'w1', url: 'https://example.com', lastCheck: now - 1000, changeCount: 2 },
      ] as any);

      const res = await request(app).get('/awareness/digest');

      expect(res.status).toBe(200);
      expect(res.body.watches.changes_detected.length).toBe(1);
    });
  });

  // ─── GET /awareness/focus ────────────────────────

  describe('GET /awareness/focus', () => {
    it('returns focus context with active tab', async () => {
      const res = await request(app).get('/awareness/focus');

      expect(res.status).toBe(200);
      expect(res.body.tab).toBeDefined();
      expect(res.body.tab.url).toBe('https://example.com');
      expect(res.body.activity).toBeDefined();
      expect(res.body.idle_seconds).toBeDefined();
    });

    it('returns idle when no recent activity', async () => {
      const res = await request(app).get('/awareness/focus');

      expect(res.status).toBe(200);
      // No activity entries → idle_seconds will be large
      expect(res.body.activity).toBe('idle');
    });

    it('detects typing activity', async () => {
      const now = Date.now();
      vi.mocked(ctx.activityTracker.getLog).mockReturnValue([
        { type: 'input', timestamp: now - 2000, data: {} },
      ] as any);

      const res = await request(app).get('/awareness/focus');

      expect(res.status).toBe(200);
      expect(res.body.activity).toBe('typing');
    });

    it('detects navigating activity', async () => {
      const now = Date.now();
      vi.mocked(ctx.activityTracker.getLog).mockReturnValue([
        { type: 'navigate', timestamp: now - 2000, data: {} },
      ] as any);

      const res = await request(app).get('/awareness/focus');

      expect(res.status).toBe(200);
      expect(res.body.activity).toBe('navigating');
    });

    it('returns null tab when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null);

      const res = await request(app).get('/awareness/focus');

      expect(res.status).toBe(200);
      expect(res.body.tab).toBeNull();
    });

    it('checks for console and network errors', async () => {
      const now = Date.now();
      vi.mocked(ctx.devToolsManager.getConsoleErrors).mockReturnValue([
        { level: 'error', text: 'err', url: '', timestamp: now - 1000 },
      ] as any);

      const res = await request(app).get('/awareness/focus');

      expect(res.status).toBe(200);
      expect(res.body.has_console_errors).toBe(true);
    });

    it('handles devtools errors gracefully', async () => {
      vi.mocked(ctx.devToolsManager.getConsoleErrors).mockImplementation(() => { throw new Error('no CDP'); });
      vi.mocked(ctx.devToolsManager.getNetworkEntries).mockImplementation(() => { throw new Error('no CDP'); });

      const res = await request(app).get('/awareness/focus');

      expect(res.status).toBe(200);
      expect(res.body.has_console_errors).toBe(false);
      expect(res.body.has_network_errors).toBe(false);
    });
  });
});
