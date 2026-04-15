import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {},
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    unlinkSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  unlinkSync: vi.fn(),
}));

vi.mock('../../utils/paths', () => ({
  tandemDir: () => '/tmp/tandem-test',
}));

import { registerPreviewRoutes } from '../../routes/previews';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

const samplePreview = {
  id: 'my-preview',
  title: 'My Preview',
  html: '<h1>Hello</h1>',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  version: 1,
};

describe('Preview Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerPreviewRoutes, ctx);

    // Default: no files on disk
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([] as any);
  });

  // ─── GET /previews ───────────────────────────────

  describe('GET /previews', () => {
    it('returns empty list when no previews', async () => {
      const res = await request(app).get('/previews');

      expect(res.status).toBe(200);
      expect(res.body.previews).toEqual([]);
    });

    it('returns list of previews', async () => {
      vi.mocked(fs.readdirSync).mockReturnValue(['my-preview.json'] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(samplePreview));

      const res = await request(app).get('/previews');

      expect(res.status).toBe(200);
      expect(res.body.previews.length).toBe(1);
      expect(res.body.previews[0].id).toBe('my-preview');
      // Should not include html in the list
      expect(res.body.previews[0].html).toBeUndefined();
    });
  });

  // ─── POST /preview ───────────────────────────────

  describe('POST /preview', () => {
    it('creates a new preview', async () => {
      // First existsSync for previewsDir, second for uniqueSlug check
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)   // previewsDir exists
        .mockReturnValueOnce(false); // slug not taken

      const res = await request(app)
        .post('/preview')
        .send({ html: '<h1>Test</h1>', title: 'Test Preview' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.id).toBeDefined();
      expect(res.body.url).toContain('/preview/');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('returns 400 when html is missing', async () => {
      const res = await request(app)
        .post('/preview')
        .send({ title: 'No HTML' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('html is required');
    });

    it('opens tab by default', async () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      await request(app)
        .post('/preview')
        .send({ html: '<h1>Test</h1>' });

      expect(ctx.tabManager.openTab).toHaveBeenCalled();
    });

    it('skips opening tab when openTab is false', async () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      await request(app)
        .post('/preview')
        .send({ html: '<h1>Test</h1>', openTab: false });

      expect(ctx.tabManager.openTab).not.toHaveBeenCalled();
    });
  });

  // ─── PUT /preview/:id ────────────────────────────

  describe('PUT /preview/:id', () => {
    it('updates an existing preview', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(samplePreview));

      const res = await request(app)
        .put('/preview/my-preview')
        .send({ html: '<h1>Updated</h1>' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.version).toBe(2);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('returns 404 when preview not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const res = await request(app)
        .put('/preview/nonexistent')
        .send({ html: '<h1>Test</h1>' });

      expect(res.status).toBe(404);
    });
  });

  // ─── GET /preview/:id/meta ───────────────────────

  describe('GET /preview/:id/meta', () => {
    it('returns preview metadata', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(samplePreview));

      const res = await request(app).get('/preview/my-preview/meta');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('my-preview');
      expect(res.body.version).toBe(1);
      expect(res.body.html).toBeUndefined();
    });

    it('returns 404 when not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const res = await request(app).get('/preview/missing/meta');

      expect(res.status).toBe(404);
    });
  });

  // ─── GET /preview/:id ────────────────────────────

  describe('GET /preview/:id', () => {
    it('serves preview HTML with live-reload script', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(samplePreview));

      const res = await request(app).get('/preview/my-preview');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('html');
      expect(res.text).toContain('<h1>Hello</h1>');
      expect(res.text).toContain('setInterval'); // live-reload script
    });

    it('returns 404 HTML when not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const res = await request(app).get('/preview/missing');

      expect(res.status).toBe(404);
      expect(res.text).toContain('Preview not found');
    });
  });

  // ─── DELETE /preview/:id ─────────────────────────

  describe('DELETE /preview/:id', () => {
    it('deletes a preview', async () => {
      const res = await request(app).delete('/preview/my-preview');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('returns 404 when preview not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const res = await request(app).delete('/preview/missing');

      expect(res.status).toBe(404);
    });
  });

  // ─── Remote-aware URL generation ────────────────

  describe('Remote-aware URLs', () => {
    it('POST /preview uses Host header for URL in response', async () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const res = await request(app)
        .post('/preview')
        .set('Host', '100.64.0.1:8765')
        .send({ html: '<h1>Remote</h1>', title: 'Remote Preview' });

      expect(res.status).toBe(200);
      expect(res.body.url).toContain('http://100.64.0.1:8765/preview/');
      expect(res.body.url).not.toContain('127.0.0.1');
    });

    it('PUT /preview/:id uses Host header for URL in response', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(samplePreview));

      const res = await request(app)
        .put('/preview/my-preview')
        .set('Host', '100.64.0.1:8765')
        .send({ html: '<h1>Updated</h1>' });

      expect(res.status).toBe(200);
      expect(res.body.url).toContain('http://100.64.0.1:8765/preview/');
      expect(res.body.url).not.toContain('127.0.0.1');
    });

    it('GET /preview/:id 404 page does not contain hardcoded localhost', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const res = await request(app).get('/preview/missing');

      expect(res.status).toBe(404);
      expect(res.text).not.toContain('127.0.0.1');
    });
  });
});
