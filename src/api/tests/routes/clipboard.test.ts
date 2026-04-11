import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {},
}));

import { registerClipboardRoutes } from '../../routes/clipboard';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

describe('Clipboard Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerClipboardRoutes, ctx);
  });

  // ─── GET /clipboard ──────────────────────────────

  describe('GET /clipboard', () => {
    it('returns clipboard content', async () => {
      vi.mocked(ctx.clipboardManager.read).mockReturnValue({
        hasText: true, hasImage: false, hasHTML: false,
        text: 'hello', formats: ['text/plain'],
      } as any);

      const res = await request(app).get('/clipboard');

      expect(res.status).toBe(200);
      expect(res.body.hasText).toBe(true);
      expect(res.body.text).toBe('hello');
    });

    it('returns 500 when read throws', async () => {
      vi.mocked(ctx.clipboardManager.read).mockImplementation(() => { throw new Error('fail'); });

      const res = await request(app).get('/clipboard');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('fail');
    });
  });

  // ─── POST /clipboard/text ────────────────────────

  describe('POST /clipboard/text', () => {
    it('writes text to clipboard', async () => {
      const res = await request(app)
        .post('/clipboard/text')
        .send({ text: 'copied' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.clipboardManager.writeText).toHaveBeenCalledWith('copied');
    });

    it('returns 400 when text is missing', async () => {
      const res = await request(app)
        .post('/clipboard/text')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('text is required (string)');
    });

    it('returns 400 when text is not a string', async () => {
      const res = await request(app)
        .post('/clipboard/text')
        .send({ text: 42 });

      expect(res.status).toBe(400);
    });
  });

  // ─── POST /clipboard/image ───────────────────────

  describe('POST /clipboard/image', () => {
    it('writes image to clipboard', async () => {
      const res = await request(app)
        .post('/clipboard/image')
        .send({ base64: 'iVBORw0KGgo=' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.clipboardManager.writeImage).toHaveBeenCalledWith('iVBORw0KGgo=');
    });

    it('returns 400 when base64 is missing', async () => {
      const res = await request(app)
        .post('/clipboard/image')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('base64 is required (string)');
    });
  });

  // ─── POST /clipboard/save ────────────────────────

  describe('POST /clipboard/save', () => {
    it('saves clipboard to file', async () => {
      const res = await request(app)
        .post('/clipboard/save')
        .send({ filename: 'clip.png' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.path).toBeDefined();
      expect(ctx.clipboardManager.saveAs).toHaveBeenCalledWith({
        filename: 'clip.png', format: undefined, quality: undefined,
      });
    });

    it('passes valid format and quality', async () => {
      const res = await request(app)
        .post('/clipboard/save')
        .send({ filename: 'clip.jpg', format: 'jpg', quality: 80 });

      expect(res.status).toBe(200);
      expect(ctx.clipboardManager.saveAs).toHaveBeenCalledWith({
        filename: 'clip.jpg', format: 'jpg', quality: 80,
      });
    });

    it('ignores invalid format', async () => {
      await request(app)
        .post('/clipboard/save')
        .send({ filename: 'clip.bmp', format: 'bmp' });

      expect(ctx.clipboardManager.saveAs).toHaveBeenCalledWith({
        filename: 'clip.bmp', format: undefined, quality: undefined,
      });
    });

    it('returns 400 when filename is missing', async () => {
      const res = await request(app)
        .post('/clipboard/save')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('filename is required (string)');
    });

    it('returns 500 when saveAs throws', async () => {
      vi.mocked(ctx.clipboardManager.saveAs).mockImplementation(() => { throw new Error('disk full'); });

      const res = await request(app)
        .post('/clipboard/save')
        .send({ filename: 'clip.png' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('disk full');
    });
  });
});
