import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {},
  webContents: {
    fromId: vi.fn(),
    getAllWebContents: vi.fn().mockReturnValue([]),
  },
}));

import { registerSnapshotRoutes } from '../../routes/snapshots';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

describe('Snapshot Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    ctx = createMockContext();
    app = createTestApp(registerSnapshotRoutes, ctx);
  });

  // ─── GET /snapshot ──────────────────────────────

  describe('GET /snapshot', () => {
    it('returns snapshot with default params', async () => {
      vi.mocked(ctx.snapshotManager.getSnapshot).mockResolvedValue({
        text: '<snapshot>',
        count: 5,
        url: 'https://example.com',
      });

      const res = await request(app).get('/snapshot');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        snapshot: '<snapshot>',
        count: 5,
        url: 'https://example.com',
      });
      expect(ctx.snapshotManager.getSnapshot).toHaveBeenCalledWith({
        interactive: false,
        compact: false,
        selector: undefined,
        depth: undefined,
      });
    });

    it('parses query params correctly', async () => {
      vi.mocked(ctx.snapshotManager.getSnapshot).mockResolvedValue({
        text: '<interactive>',
        count: 3,
        url: 'https://example.com/page',
      });

      const res = await request(app)
        .get('/snapshot')
        .query({ interactive: 'true', compact: 'true', selector: '#main', depth: '2' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.snapshotManager.getSnapshot).toHaveBeenCalledWith({
        interactive: true,
        compact: true,
        selector: '#main',
        depth: 2,
      });
    });

    it('returns 500 when snapshotManager.getSnapshot throws', async () => {
      vi.mocked(ctx.snapshotManager.getSnapshot).mockRejectedValueOnce(new Error('snapshot failed'));

      const res = await request(app).get('/snapshot');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('snapshot failed');
    });
  });

  // ─── POST /snapshot/click ───────────────────────

  describe('POST /snapshot/click', () => {
    it('clicks a ref successfully', async () => {
      const res = await request(app)
        .post('/snapshot/click')
        .send({ ref: '@e1' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, ref: '@e1' });
      expect(ctx.snapshotManager.clickRef).toHaveBeenCalledWith('@e1');
    });

    it('returns 400 when ref is missing', async () => {
      const res = await request(app)
        .post('/snapshot/click')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ref required (e.g. "@e1")');
    });

    it('returns 500 when clickRef throws', async () => {
      vi.mocked(ctx.snapshotManager.clickRef).mockRejectedValueOnce(new Error('click failed'));

      const res = await request(app)
        .post('/snapshot/click')
        .send({ ref: '@e1' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('click failed');
    });
  });

  // ─── POST /snapshot/fill ────────────────────────

  describe('POST /snapshot/fill', () => {
    it('fills a ref with a value', async () => {
      const res = await request(app)
        .post('/snapshot/fill')
        .send({ ref: '@e2', value: 'hello world' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, ref: '@e2' });
      expect(ctx.snapshotManager.fillRef).toHaveBeenCalledWith('@e2', 'hello world');
    });

    it('returns 400 when ref is missing', async () => {
      const res = await request(app)
        .post('/snapshot/fill')
        .send({ value: 'hello' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ref and value required');
    });

    it('returns 400 when value is missing', async () => {
      const res = await request(app)
        .post('/snapshot/fill')
        .send({ ref: '@e2' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ref and value required');
    });

    it('allows empty string as value', async () => {
      const res = await request(app)
        .post('/snapshot/fill')
        .send({ ref: '@e2', value: '' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, ref: '@e2' });
      expect(ctx.snapshotManager.fillRef).toHaveBeenCalledWith('@e2', '');
    });

    it('returns 500 when fillRef throws', async () => {
      vi.mocked(ctx.snapshotManager.fillRef).mockRejectedValueOnce(new Error('fill failed'));

      const res = await request(app)
        .post('/snapshot/fill')
        .send({ ref: '@e2', value: 'test' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('fill failed');
    });
  });

  // ─── GET /snapshot/text ─────────────────────────

  describe('GET /snapshot/text', () => {
    it('returns text for a ref', async () => {
      vi.mocked(ctx.snapshotManager.getTextRef).mockResolvedValue('Hello World');

      const res = await request(app)
        .get('/snapshot/text')
        .query({ ref: '@e3' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, ref: '@e3', text: 'Hello World' });
      expect(ctx.snapshotManager.getTextRef).toHaveBeenCalledWith('@e3');
    });

    it('returns 400 when ref query param is missing', async () => {
      const res = await request(app).get('/snapshot/text');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ref query parameter required (e.g. "?ref=@e1")');
    });

    it('returns 500 when getTextRef throws', async () => {
      vi.mocked(ctx.snapshotManager.getTextRef).mockRejectedValueOnce(new Error('text failed'));

      const res = await request(app)
        .get('/snapshot/text')
        .query({ ref: '@e3' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('text failed');
    });
  });

  // ─── POST /find ─────────────────────────────────

  describe('POST /find', () => {
    it('finds an element successfully', async () => {
      const findResult = { found: true, ref: '@e5', role: 'button', name: 'Submit' };
      vi.mocked(ctx.locatorFinder.find).mockResolvedValue(findResult);

      const res = await request(app)
        .post('/find')
        .send({ by: 'role', value: 'button' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(findResult);
      expect(ctx.locatorFinder.find).toHaveBeenCalledWith({ by: 'role', value: 'button' });
    });

    it('returns 400 when by is missing', async () => {
      const res = await request(app)
        .post('/find')
        .send({ value: 'button' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('"by" and "value" required');
    });

    it('returns 400 when value is missing', async () => {
      const res = await request(app)
        .post('/find')
        .send({ by: 'role' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('"by" and "value" required');
    });

    it('returns 500 when locatorFinder.find throws', async () => {
      vi.mocked(ctx.locatorFinder.find).mockRejectedValueOnce(new Error('find failed'));

      const res = await request(app)
        .post('/find')
        .send({ by: 'role', value: 'button' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('find failed');
    });
  });

  // ─── POST /find/click ──────────────────────────

  describe('POST /find/click', () => {
    it('finds and clicks an element', async () => {
      vi.mocked(ctx.locatorFinder.find).mockResolvedValue({ found: true, ref: '@e6' });

      const res = await request(app)
        .post('/find/click')
        .send({ by: 'text', value: 'Submit' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, ref: '@e6', clicked: true });
      expect(ctx.locatorFinder.find).toHaveBeenCalledWith({ by: 'text', value: 'Submit' });
      expect(ctx.snapshotManager.clickRef).toHaveBeenCalledWith('@e6');
    });

    it('returns 404 when element not found', async () => {
      vi.mocked(ctx.locatorFinder.find).mockResolvedValue({ found: false });

      const res = await request(app)
        .post('/find/click')
        .send({ by: 'text', value: 'Nonexistent' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ found: false, error: 'Element not found' });
    });

    it('returns 400 when by is missing', async () => {
      const res = await request(app)
        .post('/find/click')
        .send({ value: 'Submit' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('"by" and "value" required');
    });

    it('returns 400 when value is missing', async () => {
      const res = await request(app)
        .post('/find/click')
        .send({ by: 'text' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('"by" and "value" required');
    });

    it('strips fillValue from the query before calling find', async () => {
      vi.mocked(ctx.locatorFinder.find).mockResolvedValue({ found: true, ref: '@e7' });

      const res = await request(app)
        .post('/find/click')
        .send({ by: 'role', value: 'button', fillValue: 'should-be-stripped' });

      expect(res.status).toBe(200);
      expect(ctx.locatorFinder.find).toHaveBeenCalledWith({ by: 'role', value: 'button' });
    });

    it('returns 500 when snapshotManager.clickRef throws', async () => {
      vi.mocked(ctx.locatorFinder.find).mockResolvedValue({ found: true, ref: '@e6' });
      vi.mocked(ctx.snapshotManager.clickRef).mockRejectedValueOnce(new Error('click boom'));

      const res = await request(app)
        .post('/find/click')
        .send({ by: 'text', value: 'Submit' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('click boom');
    });
  });

  // ─── POST /find/fill ───────────────────────────

  describe('POST /find/fill', () => {
    it('finds and fills an element', async () => {
      vi.mocked(ctx.locatorFinder.find).mockResolvedValue({ found: true, ref: '@e8' });

      const res = await request(app)
        .post('/find/fill')
        .send({ by: 'label', value: 'Email', fillValue: 'test@example.com' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, ref: '@e8', filled: true });
      expect(ctx.locatorFinder.find).toHaveBeenCalledWith({ by: 'label', value: 'Email' });
      expect(ctx.snapshotManager.fillRef).toHaveBeenCalledWith('@e8', 'test@example.com');
    });

    it('returns 404 when element not found', async () => {
      vi.mocked(ctx.locatorFinder.find).mockResolvedValue({ found: false });

      const res = await request(app)
        .post('/find/fill')
        .send({ by: 'label', value: 'Missing', fillValue: 'data' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ found: false, error: 'Element not found' });
    });

    it('returns 400 when by is missing', async () => {
      const res = await request(app)
        .post('/find/fill')
        .send({ value: 'Email', fillValue: 'test@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('"by" and "value" required');
    });

    it('returns 400 when value is missing', async () => {
      const res = await request(app)
        .post('/find/fill')
        .send({ by: 'label', fillValue: 'test@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('"by" and "value" required');
    });

    it('returns 400 when fillValue is missing', async () => {
      const res = await request(app)
        .post('/find/fill')
        .send({ by: 'label', value: 'Email' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('fillValue required');
    });

    it('returns 500 when snapshotManager.fillRef throws', async () => {
      vi.mocked(ctx.locatorFinder.find).mockResolvedValue({ found: true, ref: '@e8' });
      vi.mocked(ctx.snapshotManager.fillRef).mockRejectedValueOnce(new Error('fill boom'));

      const res = await request(app)
        .post('/find/fill')
        .send({ by: 'label', value: 'Email', fillValue: 'test@example.com' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('fill boom');
    });
  });

  // ─── POST /find/all ────────────────────────────

  describe('POST /find/all', () => {
    it('returns all matching elements', async () => {
      const results = [
        { ref: '@e10', role: 'button', name: 'Save' },
        { ref: '@e11', role: 'button', name: 'Cancel' },
      ];
      vi.mocked(ctx.locatorFinder.findAll).mockResolvedValue(results as any);

      const res = await request(app)
        .post('/find/all')
        .send({ by: 'role', value: 'button' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ found: true, count: 2, results });
      expect(ctx.locatorFinder.findAll).toHaveBeenCalledWith({ by: 'role', value: 'button' });
    });

    it('returns found:false and count:0 when no elements match', async () => {
      vi.mocked(ctx.locatorFinder.findAll).mockResolvedValue([]);

      const res = await request(app)
        .post('/find/all')
        .send({ by: 'role', value: 'dialog' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ found: false, count: 0, results: [] });
    });

    it('returns 400 when by is missing', async () => {
      const res = await request(app)
        .post('/find/all')
        .send({ value: 'button' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('"by" and "value" required');
    });

    it('returns 400 when value is missing', async () => {
      const res = await request(app)
        .post('/find/all')
        .send({ by: 'role' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('"by" and "value" required');
    });

    it('returns 500 when locatorFinder.findAll throws', async () => {
      vi.mocked(ctx.locatorFinder.findAll).mockRejectedValueOnce(new Error('findAll failed'));

      const res = await request(app)
        .post('/find/all')
        .send({ by: 'role', value: 'button' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('findAll failed');
    });
  });
});
