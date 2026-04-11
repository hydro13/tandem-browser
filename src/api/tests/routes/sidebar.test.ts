import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {},
}));

import { registerSidebarRoutes } from '../../routes/sidebar';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

describe('Sidebar Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerSidebarRoutes, ctx);
  });

  // ─── GET /sidebar/config ─────────────────────────

  describe('GET /sidebar/config', () => {
    it('returns sidebar config', async () => {
      const res = await request(app).get('/sidebar/config');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.config).toBeDefined();
      expect(ctx.sidebarManager.getConfig).toHaveBeenCalled();
    });
  });

  // ─── POST /sidebar/config ────────────────────────

  describe('POST /sidebar/config', () => {
    it('updates sidebar config', async () => {
      const res = await request(app)
        .post('/sidebar/config')
        .send({ state: 'wide' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.sidebarManager.updateConfig).toHaveBeenCalledWith({ state: 'wide' });
    });
  });

  // ─── POST /sidebar/items/:id/toggle ──────────────

  describe('POST /sidebar/items/:id/toggle', () => {
    it('toggles an item', async () => {
      const res = await request(app)
        .post('/sidebar/items/bookmarks/toggle');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.sidebarManager.toggleItem).toHaveBeenCalledWith('bookmarks');
    });

    it('returns 404 when item not found', async () => {
      vi.mocked(ctx.sidebarManager.toggleItem).mockReturnValue(null);

      const res = await request(app)
        .post('/sidebar/items/nonexistent/toggle');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Item not found');
    });
  });

  // ─── POST /sidebar/items/:id/activate ────────────

  describe('POST /sidebar/items/:id/activate', () => {
    it('activates an item when not already active', async () => {
      vi.mocked(ctx.sidebarManager.getConfig).mockReturnValue({
        state: 'narrow', activeItemId: null, items: [],
      } as any);

      const res = await request(app)
        .post('/sidebar/items/bookmarks/activate');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.activeItemId).toBe('bookmarks');
      expect(ctx.sidebarManager.setActiveItem).toHaveBeenCalledWith('bookmarks');
    });

    it('deactivates an item when already active', async () => {
      vi.mocked(ctx.sidebarManager.getConfig).mockReturnValue({
        state: 'narrow', activeItemId: 'bookmarks', items: [],
      } as any);

      const res = await request(app)
        .post('/sidebar/items/bookmarks/activate');

      expect(res.status).toBe(200);
      expect(res.body.activeItemId).toBeNull();
      expect(ctx.sidebarManager.setActiveItem).toHaveBeenCalledWith(null);
    });
  });

  // ─── POST /sidebar/reorder ───────────────────────

  describe('POST /sidebar/reorder', () => {
    it('reorders items', async () => {
      const res = await request(app)
        .post('/sidebar/reorder')
        .send({ orderedIds: ['history', 'bookmarks'] });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.sidebarManager.reorderItems).toHaveBeenCalledWith(['history', 'bookmarks']);
    });

    it('returns 400 when orderedIds is not an array', async () => {
      const res = await request(app)
        .post('/sidebar/reorder')
        .send({ orderedIds: 'bookmarks' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('orderedIds must be array');
    });
  });

  // ─── POST /sidebar/state ─────────────────────────

  describe('POST /sidebar/state', () => {
    it('sets state to wide', async () => {
      const res = await request(app)
        .post('/sidebar/state')
        .send({ state: 'wide' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.state).toBe('wide');
      expect(ctx.sidebarManager.setState).toHaveBeenCalledWith('wide');
    });

    it('returns 400 for invalid state', async () => {
      const res = await request(app)
        .post('/sidebar/state')
        .send({ state: 'huge' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('state must be hidden|narrow|wide');
    });
  });
});
