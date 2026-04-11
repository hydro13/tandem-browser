import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {},
}));

import { registerPinboardRoutes } from '../../routes/pinboards';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

describe('Pinboard Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerPinboardRoutes, ctx);
  });

  // ─── GET /pinboards ──────────────────────────────

  describe('GET /pinboards', () => {
    it('lists all boards', async () => {
      const res = await request(app).get('/pinboards');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.boards).toEqual([]);
    });
  });

  // ─── POST /pinboards ─────────────────────────────

  describe('POST /pinboards', () => {
    it('creates a board', async () => {
      const res = await request(app)
        .post('/pinboards')
        .send({ name: 'Research', emoji: '🔬' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.pinboardManager.createBoard).toHaveBeenCalledWith('Research', '🔬');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/pinboards')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name required');
    });
  });

  // ─── GET /pinboards/:id ──────────────────────────

  describe('GET /pinboards/:id', () => {
    it('returns board with items', async () => {
      vi.mocked(ctx.pinboardManager.getBoard).mockReturnValue({
        id: 'pb-1', name: 'Test', items: [],
      } as any);

      const res = await request(app).get('/pinboards/pb-1');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.board.id).toBe('pb-1');
    });

    it('returns 404 when board not found', async () => {
      const res = await request(app).get('/pinboards/missing');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Board not found');
    });
  });

  // ─── PUT /pinboards/:id ──────────────────────────

  describe('PUT /pinboards/:id', () => {
    it('updates a board', async () => {
      const res = await request(app)
        .put('/pinboards/pb-1')
        .send({ name: 'Renamed' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.pinboardManager.updateBoard).toHaveBeenCalledWith('pb-1', { name: 'Renamed', emoji: undefined });
    });

    it('returns 404 when board not found', async () => {
      vi.mocked(ctx.pinboardManager.updateBoard).mockReturnValue(null);

      const res = await request(app)
        .put('/pinboards/pb-1')
        .send({ name: 'Renamed' });

      expect(res.status).toBe(404);
    });
  });

  // ─── PUT /pinboards/:id/settings ─────────────────

  describe('PUT /pinboards/:id/settings', () => {
    it('updates board settings', async () => {
      const res = await request(app)
        .put('/pinboards/pb-1/settings')
        .send({ layout: 'grid', background: '#000' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.pinboardManager.updateBoardSettings).toHaveBeenCalledWith('pb-1', { layout: 'grid', background: '#000' });
    });

    it('returns 404 when board not found', async () => {
      vi.mocked(ctx.pinboardManager.updateBoardSettings).mockReturnValue(null);

      const res = await request(app)
        .put('/pinboards/pb-1/settings')
        .send({ layout: 'grid' });

      expect(res.status).toBe(404);
    });
  });

  // ─── DELETE /pinboards/:id ───────────────────────

  describe('DELETE /pinboards/:id', () => {
    it('deletes a board', async () => {
      const res = await request(app).delete('/pinboards/pb-1');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 404 when board not found', async () => {
      vi.mocked(ctx.pinboardManager.deleteBoard).mockReturnValue(false);

      const res = await request(app).delete('/pinboards/missing');

      expect(res.status).toBe(404);
    });
  });

  // ─── GET /pinboards/:id/items ────────────────────

  describe('GET /pinboards/:id/items', () => {
    it('returns items for a board', async () => {
      const res = await request(app).get('/pinboards/pb-1/items');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.items).toEqual([]);
    });

    it('returns 404 when board not found', async () => {
      vi.mocked(ctx.pinboardManager.getItems).mockReturnValue(null as any);

      const res = await request(app).get('/pinboards/missing/items');

      expect(res.status).toBe(404);
    });
  });

  // ─── POST /pinboards/:id/items ───────────────────

  describe('POST /pinboards/:id/items', () => {
    it('adds an item to a board', async () => {
      const res = await request(app)
        .post('/pinboards/pb-1/items')
        .send({ type: 'link', url: 'https://example.com', title: 'Example' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.item).toBeDefined();
    });

    it('returns 400 when type is missing', async () => {
      const res = await request(app)
        .post('/pinboards/pb-1/items')
        .send({ url: 'https://example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('type required');
    });

    it('returns 400 for invalid type', async () => {
      const res = await request(app)
        .post('/pinboards/pb-1/items')
        .send({ type: 'video' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('type must be link, image, text, or quote');
    });

    it('returns 404 when board not found', async () => {
      vi.mocked(ctx.pinboardManager.addItem).mockResolvedValue(null as any);

      const res = await request(app)
        .post('/pinboards/missing/items')
        .send({ type: 'link', url: 'https://example.com' });

      expect(res.status).toBe(404);
    });
  });

  // ─── PUT /pinboards/:id/items/:itemId ────────────

  describe('PUT /pinboards/:id/items/:itemId', () => {
    it('updates an item', async () => {
      const res = await request(app)
        .put('/pinboards/pb-1/items/item-1')
        .send({ title: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 404 when item not found', async () => {
      vi.mocked(ctx.pinboardManager.updateItem).mockReturnValue(null);

      const res = await request(app)
        .put('/pinboards/pb-1/items/missing')
        .send({ title: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  // ─── DELETE /pinboards/:id/items/:itemId ─────────

  describe('DELETE /pinboards/:id/items/:itemId', () => {
    it('deletes an item', async () => {
      const res = await request(app).delete('/pinboards/pb-1/items/item-1');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 404 when item not found', async () => {
      vi.mocked(ctx.pinboardManager.deleteItem).mockReturnValue(false);

      const res = await request(app).delete('/pinboards/pb-1/items/missing');

      expect(res.status).toBe(404);
    });
  });

  // ─── POST /pinboards/:id/items/reorder ───────────

  describe('POST /pinboards/:id/items/reorder', () => {
    it('reorders items', async () => {
      const res = await request(app)
        .post('/pinboards/pb-1/items/reorder')
        .send({ itemIds: ['item-2', 'item-1'] });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.pinboardManager.reorderItems).toHaveBeenCalledWith('pb-1', ['item-2', 'item-1']);
    });

    it('returns 400 when itemIds is missing', async () => {
      const res = await request(app)
        .post('/pinboards/pb-1/items/reorder')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('itemIds array required');
    });

    it('returns 404 when board not found', async () => {
      vi.mocked(ctx.pinboardManager.reorderItems).mockReturnValue(false);

      const res = await request(app)
        .post('/pinboards/missing/items/reorder')
        .send({ itemIds: ['item-1'] });

      expect(res.status).toBe(404);
    });
  });
});
