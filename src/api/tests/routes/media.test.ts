import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {},
  webContents: {
    fromId: vi.fn().mockReturnValue(null),
    getAllWebContents: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
  },
  existsSync: vi.fn().mockReturnValue(false),
}));

import fs from 'fs';
import { registerMediaRoutes } from '../../routes/media';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

describe('Media Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerMediaRoutes, ctx);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ═══════════════════════════════════════════════
  // PANEL — Wingman side panel
  // ═══════════════════════════════════════════════

  describe('POST /panel/toggle', () => {
    it('toggles panel and returns open state', async () => {
      vi.mocked(ctx.panelManager.togglePanel).mockReturnValue(true);

      const res = await request(app)
        .post('/panel/toggle')
        .send({ open: true });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, open: true });
      expect(ctx.panelManager.togglePanel).toHaveBeenCalledWith(true);
    });

    it('toggles panel closed', async () => {
      vi.mocked(ctx.panelManager.togglePanel).mockReturnValue(false);

      const res = await request(app)
        .post('/panel/toggle')
        .send({ open: false });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, open: false });
      expect(ctx.panelManager.togglePanel).toHaveBeenCalledWith(false);
    });

    it('returns 500 when togglePanel throws', async () => {
      vi.mocked(ctx.panelManager.togglePanel).mockImplementation(() => {
        throw new Error('panel error');
      });

      const res = await request(app)
        .post('/panel/toggle')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('panel error');
    });
  });

  // ═══════════════════════════════════════════════
  // CHAT — Wingman chat messages
  // ═══════════════════════════════════════════════

  describe('GET /chat', () => {
    it('returns messages with default limit', async () => {
      const fakeMessages = [{ id: 1, from: 'wingman', text: 'hello', ts: 1000 }];
      vi.mocked(ctx.panelManager.getChatMessages).mockReturnValue(fakeMessages as any);

      const res = await request(app).get('/chat');

      expect(res.status).toBe(200);
      expect(res.body.messages).toEqual(fakeMessages);
      expect(ctx.panelManager.getChatMessages).toHaveBeenCalledWith(50);
    });

    it('supports ?limit= query parameter', async () => {
      vi.mocked(ctx.panelManager.getChatMessages).mockReturnValue([]);

      const res = await request(app).get('/chat?limit=10');

      expect(res.status).toBe(200);
      expect(ctx.panelManager.getChatMessages).toHaveBeenCalledWith(10);
    });

    it('supports ?since_id= for polling', async () => {
      const newMessages = [{ id: 3, from: 'user', text: 'new', ts: 2000 }];
      vi.mocked(ctx.panelManager.getChatMessagesSince).mockReturnValue(newMessages as any);

      const res = await request(app).get('/chat?since_id=2');

      expect(res.status).toBe(200);
      expect(res.body.messages).toEqual(newMessages);
      expect(ctx.panelManager.getChatMessagesSince).toHaveBeenCalledWith(2);
    });

    it('ignores invalid since_id and falls back to limit', async () => {
      vi.mocked(ctx.panelManager.getChatMessages).mockReturnValue([]);

      const res = await request(app).get('/chat?since_id=notanumber');

      expect(res.status).toBe(200);
      expect(ctx.panelManager.getChatMessages).toHaveBeenCalledWith(50);
    });

    it('returns 500 when getChatMessages throws', async () => {
      vi.mocked(ctx.panelManager.getChatMessages).mockImplementation(() => {
        throw new Error('chat error');
      });

      const res = await request(app).get('/chat');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('chat error');
    });
  });

  describe('POST /chat', () => {
    it('sends a message as wingman by default', async () => {
      const fakeMsg = { id: 1, from: 'wingman', text: 'hello', ts: Date.now() };
      vi.mocked(ctx.panelManager.addChatMessage).mockReturnValue(fakeMsg as any);

      const res = await request(app)
        .post('/chat')
        .send({ text: 'hello' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.message).toEqual(fakeMsg);
      expect(ctx.panelManager.addChatMessage).toHaveBeenCalledWith('wingman', 'hello', undefined);
    });

    it('maps from=user to sender user', async () => {
      await request(app)
        .post('/chat')
        .send({ text: 'hi', from: 'user' });

      expect(ctx.panelManager.addChatMessage).toHaveBeenCalledWith('user', 'hi', undefined);
    });

    it('maps from=claude to sender claude', async () => {
      await request(app)
        .post('/chat')
        .send({ text: 'hi', from: 'claude' });

      expect(ctx.panelManager.addChatMessage).toHaveBeenCalledWith('claude', 'hi', undefined);
    });

    it('maps unknown from value to wingman', async () => {
      await request(app)
        .post('/chat')
        .send({ text: 'hi', from: 'unknown' });

      expect(ctx.panelManager.addChatMessage).toHaveBeenCalledWith('wingman', 'hi', undefined);
    });

    it('sends a message with an image', async () => {
      vi.mocked(ctx.panelManager.saveImage).mockReturnValue('saved.png');

      await request(app)
        .post('/chat')
        .send({ text: 'look at this', image: 'data:image/png;base64,abc' });

      expect(ctx.panelManager.saveImage).toHaveBeenCalledWith('data:image/png;base64,abc');
      expect(ctx.panelManager.addChatMessage).toHaveBeenCalledWith('wingman', 'look at this', 'saved.png');
    });

    it('sends a message with image only (no text)', async () => {
      vi.mocked(ctx.panelManager.saveImage).mockReturnValue('saved.png');

      await request(app)
        .post('/chat')
        .send({ image: 'data:image/png;base64,abc' });

      expect(ctx.panelManager.addChatMessage).toHaveBeenCalledWith('wingman', '', 'saved.png');
    });

    it('returns 400 when neither text nor image is provided', async () => {
      const res = await request(app)
        .post('/chat')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('text or image required');
    });

    it('returns 500 when addChatMessage throws', async () => {
      vi.mocked(ctx.panelManager.addChatMessage).mockImplementation(() => {
        throw new Error('chat send error');
      });

      const res = await request(app)
        .post('/chat')
        .send({ text: 'hello' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('chat send error');
    });
  });

  describe('GET /chat/image/:filename', () => {
    it('rejects path traversal with .. in filename', async () => {
      const res = await request(app).get('/chat/image/..passwd');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid filename');
    });

    it('rejects path traversal with backslash in filename', async () => {
      // %5C = backslash; Express keeps this in the param since it's not a path separator
      const res = await request(app).get('/chat/image/test%5Cpasswd');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid filename');
    });

    it('returns 404 when image file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const res = await request(app).get('/chat/image/missing.png');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Image not found');
    });

    it('serves the image file when it exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(ctx.panelManager.getImagePath).mockReturnValue('/tmp/test-images/valid.png');

      const _res = await request(app).get('/chat/image/valid.png');

      // sendFile will try to serve the file; since /tmp/test-images/valid.png
      // doesn't actually exist on disk the response won't be 400 or 404 from our guards
      // The important thing is that our route guards passed (no 400/404 from our code)
      expect(ctx.panelManager.getImagePath).toHaveBeenCalledWith('valid.png');
    });
  });

  describe('POST /chat/typing', () => {
    it('sets typing indicator to true by default', async () => {
      const res = await request(app)
        .post('/chat/typing')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, typing: true });
      expect(ctx.panelManager.setWingmanTyping).toHaveBeenCalledWith(true);
    });

    it('sets typing indicator to false', async () => {
      const res = await request(app)
        .post('/chat/typing')
        .send({ typing: false });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, typing: false });
      expect(ctx.panelManager.setWingmanTyping).toHaveBeenCalledWith(false);
    });

    it('returns 500 when setWingmanTyping throws', async () => {
      vi.mocked(ctx.panelManager.setWingmanTyping).mockImplementation(() => {
        throw new Error('typing error');
      });

      const res = await request(app)
        .post('/chat/typing')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('typing error');
    });
  });

  describe('POST /chat/webhook/test', () => {
    it('returns error when webhook is not configured', async () => {
      vi.mocked(ctx.configManager.getConfig).mockReturnValue({} as any);

      const res = await request(app)
        .post('/chat/webhook/test')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: false, error: 'Webhook not configured or disabled' });
    });

    it('returns error when webhook is disabled', async () => {
      vi.mocked(ctx.configManager.getConfig).mockReturnValue({
        webhook: { enabled: false, url: 'http://example.com' },
      } as any);

      const res = await request(app)
        .post('/chat/webhook/test')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: false, error: 'Webhook not configured or disabled' });
    });

    it('makes fetch request and returns result on success', async () => {
      vi.mocked(ctx.configManager.getConfig).mockReturnValue({
        webhook: { enabled: true, url: 'http://localhost:3000/' },
      } as any);

      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

      const res = await request(app)
        .post('/chat/webhook/test')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        status: 200,
        url: 'http://localhost:3000/',
      });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/health',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('strips trailing slash from webhook url before appending path', async () => {
      vi.mocked(ctx.configManager.getConfig).mockReturnValue({
        webhook: { enabled: true, url: 'http://localhost:3000/' },
      } as any);

      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

      await request(app)
        .post('/chat/webhook/test')
        .send({});

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/health',
        expect.anything(),
      );
    });

    it('returns error when fetch throws', async () => {
      vi.mocked(ctx.configManager.getConfig).mockReturnValue({
        webhook: { enabled: true, url: 'http://localhost:3000' },
      } as any);

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const res = await request(app)
        .post('/chat/webhook/test')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: false, error: 'Connection refused' });
    });
  });

  // ═══════════════════════════════════════════════
  // VOICE — Speech recognition control
  // ═══════════════════════════════════════════════

  describe('POST /voice/start', () => {
    it('starts voice recognition', async () => {
      const res = await request(app).post('/voice/start').send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, listening: true });
      expect(ctx.voiceManager.start).toHaveBeenCalled();
    });

    it('returns 500 when start throws', async () => {
      vi.mocked(ctx.voiceManager.start).mockImplementation(() => {
        throw new Error('mic error');
      });

      const res = await request(app).post('/voice/start').send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('mic error');
    });
  });

  describe('POST /voice/stop', () => {
    it('stops voice recognition', async () => {
      const res = await request(app).post('/voice/stop').send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, listening: false });
      expect(ctx.voiceManager.stop).toHaveBeenCalled();
    });

    it('returns 500 when stop throws', async () => {
      vi.mocked(ctx.voiceManager.stop).mockImplementation(() => {
        throw new Error('stop error');
      });

      const res = await request(app).post('/voice/stop').send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('stop error');
    });
  });

  describe('GET /voice/status', () => {
    it('returns voice status', async () => {
      vi.mocked(ctx.voiceManager.getStatus).mockReturnValue({ listening: true } as any);

      const res = await request(app).get('/voice/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ listening: true });
    });

    it('returns 500 when getStatus throws', async () => {
      vi.mocked(ctx.voiceManager.getStatus).mockImplementation(() => {
        throw new Error('status error');
      });

      const res = await request(app).get('/voice/status');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('status error');
    });
  });

  // ═══════════════════════════════════════════════
  // AUDIO CAPTURE
  // ═══════════════════════════════════════════════

  describe('POST /audio/start', () => {
    it('starts audio recording in application mode', async () => {
      const res = await request(app).post('/audio/start').send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(ctx.videoRecorderManager.startRecording).toHaveBeenCalledWith('application');
    });

    it('returns 500 when startRecording throws', async () => {
      vi.mocked(ctx.videoRecorderManager.startRecording).mockRejectedValue(new Error('audio error'));

      const res = await request(app).post('/audio/start').send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('audio error');
    });
  });

  describe('POST /audio/stop', () => {
    it('stops audio recording', async () => {
      vi.mocked(ctx.videoRecorderManager.stopRecording).mockResolvedValue({ ok: true } as any);

      const res = await request(app).post('/audio/stop').send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(ctx.videoRecorderManager.stopRecording).toHaveBeenCalled();
    });

    it('returns 500 when stopRecording throws', async () => {
      vi.mocked(ctx.videoRecorderManager.stopRecording).mockRejectedValue(new Error('stop error'));

      const res = await request(app).post('/audio/stop').send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('stop error');
    });
  });

  describe('GET /audio/status', () => {
    it('returns audio capture status', async () => {
      vi.mocked(ctx.videoRecorderManager.getStatus).mockReturnValue({ recording: true } as any);

      const res = await request(app).get('/audio/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ recording: true });
    });

    it('returns 500 when getStatus throws', async () => {
      vi.mocked(ctx.videoRecorderManager.getStatus).mockImplementation(() => {
        throw new Error('status error');
      });

      const res = await request(app).get('/audio/status');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('status error');
    });
  });

  describe('GET /audio/recordings', () => {
    it('returns recordings with default limit', async () => {
      const fakeRecordings = [{ id: 'r1', duration: 10 }];
      vi.mocked(ctx.videoRecorderManager.listRecordings).mockReturnValue(fakeRecordings as any);

      const res = await request(app).get('/audio/recordings');

      expect(res.status).toBe(200);
      expect(res.body.recordings).toEqual(fakeRecordings);
      expect(ctx.videoRecorderManager.listRecordings).toHaveBeenCalledWith(50);
    });

    it('supports ?limit= query parameter', async () => {
      vi.mocked(ctx.videoRecorderManager.listRecordings).mockReturnValue([]);

      const res = await request(app).get('/audio/recordings?limit=5');

      expect(res.status).toBe(200);
      expect(ctx.videoRecorderManager.listRecordings).toHaveBeenCalledWith(5);
    });

    it('returns 500 when listRecordings throws', async () => {
      vi.mocked(ctx.videoRecorderManager.listRecordings).mockImplementation(() => {
        throw new Error('recordings error');
      });

      const res = await request(app).get('/audio/recordings');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('recordings error');
    });
  });

  // ═══════════════════════════════════════════════
  // DRAW — Annotated screenshots
  // ═══════════════════════════════════════════════

  describe('GET /screenshot/annotated', () => {
    it('returns 404 when no screenshot available', async () => {
      vi.mocked(ctx.drawManager.getLastScreenshot).mockReturnValue(null as any);

      const res = await request(app).get('/screenshot/annotated');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('No annotated screenshot available');
    });

    it('returns PNG when screenshot is available', async () => {
      const fakePng = Buffer.from('fake-png-data');
      vi.mocked(ctx.drawManager.getLastScreenshot).mockReturnValue(fakePng as any);

      const res = await request(app).get('/screenshot/annotated');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/image\/png/);
      expect(Buffer.from(res.body).toString()).toBe('fake-png-data');
    });

    it('returns 500 when getLastScreenshot throws', async () => {
      vi.mocked(ctx.drawManager.getLastScreenshot).mockImplementation(() => {
        throw new Error('screenshot error');
      });

      const res = await request(app).get('/screenshot/annotated');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('screenshot error');
    });
  });

  describe('POST /screenshot/annotated', () => {
    it('captures annotated screenshot with active tab', async () => {
      vi.mocked(ctx.drawManager.captureAnnotated).mockResolvedValue({ ok: true } as any);

      const res = await request(app).post('/screenshot/annotated').send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(ctx.drawManager.captureAnnotated).toHaveBeenCalledWith(100);
    });

    it('passes null when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);
      vi.mocked(ctx.drawManager.captureAnnotated).mockResolvedValue({ ok: true } as any);

      const res = await request(app).post('/screenshot/annotated').send({});

      expect(res.status).toBe(200);
      expect(ctx.drawManager.captureAnnotated).toHaveBeenCalledWith(null);
    });

    it('returns 500 when captureAnnotated returns not ok', async () => {
      vi.mocked(ctx.drawManager.captureAnnotated).mockResolvedValue({ ok: false, error: 'capture failed' } as any);

      const res = await request(app).post('/screenshot/annotated').send({});

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ ok: false, error: 'capture failed' });
    });

    it('returns 500 when captureAnnotated throws', async () => {
      vi.mocked(ctx.drawManager.captureAnnotated).mockRejectedValue(new Error('capture error'));

      const res = await request(app).post('/screenshot/annotated').send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('capture error');
    });
  });

  describe('POST /screenshot/application', () => {
    it('captures an application screenshot using the active tab url', async () => {
      vi.mocked(ctx.drawManager.captureApplicationScreenshot).mockResolvedValue({
        ok: true,
        path: '/tmp/application.png',
      } as any);

      const res = await request(app).post('/screenshot/application').send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, path: '/tmp/application.png' });
      expect(ctx.drawManager.captureApplicationScreenshot).toHaveBeenCalledWith('https://example.com');
    });

    it('falls back to tandem window url when no active tab exists', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);
      vi.mocked(ctx.drawManager.captureApplicationScreenshot).mockResolvedValue({
        ok: true,
        path: '/tmp/application.png',
      } as any);

      const res = await request(app).post('/screenshot/application').send({});

      expect(res.status).toBe(200);
      expect(ctx.drawManager.captureApplicationScreenshot).toHaveBeenCalledWith('tandem://window');
    });

    it('returns 500 when captureApplicationScreenshot reports failure', async () => {
      vi.mocked(ctx.drawManager.captureApplicationScreenshot).mockResolvedValue({
        ok: false,
        error: 'capture failed',
      } as any);

      const res = await request(app).post('/screenshot/application').send({});

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ ok: false, error: 'capture failed' });
    });

    it('returns 500 when captureApplicationScreenshot throws', async () => {
      vi.mocked(ctx.drawManager.captureApplicationScreenshot).mockRejectedValue(new Error('application error'));

      const res = await request(app).post('/screenshot/application').send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('application error');
    });
  });

  describe('POST /screenshot/region', () => {
    it('captures a region screenshot with the active tab url', async () => {
      vi.mocked(ctx.drawManager.captureRegionScreenshot).mockResolvedValue({
        ok: true,
        path: '/tmp/region.png',
      } as any);

      const res = await request(app)
        .post('/screenshot/region')
        .send({ x: 12, y: 34, width: 320, height: 180 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, path: '/tmp/region.png' });
      expect(ctx.drawManager.captureRegionScreenshot).toHaveBeenCalledWith(
        { x: 12, y: 34, width: 320, height: 180 },
        'https://example.com',
      );
    });

    it('returns 400 when region coordinates are missing or invalid', async () => {
      const res = await request(app)
        .post('/screenshot/region')
        .send({ x: 12, y: 34, width: '320' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('x, y, width, and height are required numbers');
      expect(ctx.drawManager.captureRegionScreenshot).not.toHaveBeenCalled();
    });

    it('returns 400 when the selected region is too small', async () => {
      vi.mocked(ctx.drawManager.captureRegionScreenshot).mockResolvedValue({
        ok: false,
        error: 'Selected region is too small',
      } as any);

      const res = await request(app)
        .post('/screenshot/region')
        .send({ x: 1, y: 2, width: 1, height: 3 });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ ok: false, error: 'Selected region is too small' });
    });

    it('returns 500 when captureRegionScreenshot reports a runtime failure', async () => {
      vi.mocked(ctx.drawManager.captureRegionScreenshot).mockResolvedValue({
        ok: false,
        error: 'capture failed',
      } as any);

      const res = await request(app)
        .post('/screenshot/region')
        .send({ x: 12, y: 34, width: 320, height: 180 });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ ok: false, error: 'capture failed' });
    });

    it('returns 500 when captureRegionScreenshot throws', async () => {
      vi.mocked(ctx.drawManager.captureRegionScreenshot).mockRejectedValue(new Error('region error'));

      const res = await request(app)
        .post('/screenshot/region')
        .send({ x: 12, y: 34, width: 320, height: 180 });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('region error');
    });
  });

  describe('POST /draw/toggle', () => {
    it('toggles draw mode on', async () => {
      vi.mocked(ctx.drawManager.toggleDrawMode).mockReturnValue(true);

      const res = await request(app)
        .post('/draw/toggle')
        .send({ enabled: true });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, drawMode: true });
      expect(ctx.drawManager.toggleDrawMode).toHaveBeenCalledWith(true);
    });

    it('toggles draw mode off', async () => {
      vi.mocked(ctx.drawManager.toggleDrawMode).mockReturnValue(false);

      const res = await request(app)
        .post('/draw/toggle')
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, drawMode: false });
      expect(ctx.drawManager.toggleDrawMode).toHaveBeenCalledWith(false);
    });

    it('returns 500 when toggleDrawMode throws', async () => {
      vi.mocked(ctx.drawManager.toggleDrawMode).mockImplementation(() => {
        throw new Error('draw error');
      });

      const res = await request(app)
        .post('/draw/toggle')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('draw error');
    });
  });

  describe('GET /screenshots', () => {
    it('returns screenshots with default limit', async () => {
      const fakeScreenshots = [{ id: 's1', timestamp: 1000 }];
      vi.mocked(ctx.drawManager.listScreenshots).mockReturnValue(fakeScreenshots as any);

      const res = await request(app).get('/screenshots');

      expect(res.status).toBe(200);
      expect(res.body.screenshots).toEqual(fakeScreenshots);
      expect(ctx.drawManager.listScreenshots).toHaveBeenCalledWith(10);
    });

    it('supports ?limit= query parameter', async () => {
      vi.mocked(ctx.drawManager.listScreenshots).mockReturnValue([]);

      const res = await request(app).get('/screenshots?limit=25');

      expect(res.status).toBe(200);
      expect(ctx.drawManager.listScreenshots).toHaveBeenCalledWith(25);
    });

    it('returns 500 when listScreenshots throws', async () => {
      vi.mocked(ctx.drawManager.listScreenshots).mockImplementation(() => {
        throw new Error('screenshots error');
      });

      const res = await request(app).get('/screenshots');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('screenshots error');
    });
  });

  describe('Google Photos integration', () => {
    it('returns Google Photos status', async () => {
      vi.mocked(ctx.googlePhotosManager.getStatus).mockReturnValue({
        enabled: true,
        clientIdConfigured: true,
        connected: true,
        expiresAt: 123,
        lastUploadAt: '2026-03-08T00:00:00.000Z',
      } as any);
      vi.mocked(ctx.googlePhotosManager.getClientId).mockReturnValue('client-id.apps.googleusercontent.com');

      const res = await request(app).get('/integrations/google-photos/status');

      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(true);
      expect(res.body.clientId).toBe('client-id.apps.googleusercontent.com');
    });

    it('stores a Google Photos client id', async () => {
      const res = await request(app)
        .post('/integrations/google-photos/config')
        .send({ clientId: 'client-id.apps.googleusercontent.com' });

      expect(res.status).toBe(200);
      expect(ctx.googlePhotosManager.setClientId).toHaveBeenCalledWith('client-id.apps.googleusercontent.com');
    });

    it('starts Google Photos auth', async () => {
      vi.mocked(ctx.googlePhotosManager.beginAuth).mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?client_id=test');

      const res = await request(app)
        .post('/integrations/google-photos/connect')
        .send({ clientId: 'client-id.apps.googleusercontent.com' });

      expect(res.status).toBe(200);
      expect(ctx.googlePhotosManager.setClientId).toHaveBeenCalledWith('client-id.apps.googleusercontent.com');
      expect(res.body.authUrl).toContain('accounts.google.com');
    });

    it('disconnects Google Photos auth', async () => {
      const res = await request(app).post('/integrations/google-photos/disconnect').send({});

      expect(res.status).toBe(200);
      expect(ctx.googlePhotosManager.disconnect).toHaveBeenCalled();
    });

    it('handles Google Photos oauth callback success', async () => {
      const res = await request(app).get('/google-photos/oauth/callback?code=abc&state=xyz');

      expect(res.status).toBe(200);
      expect(ctx.googlePhotosManager.completeAuth).toHaveBeenCalledWith({ code: 'abc', state: 'xyz', error: undefined });
      expect(res.text).toContain('Google Photos connected');
    });

    it('returns callback error html when auth fails', async () => {
      vi.mocked(ctx.googlePhotosManager.completeAuth).mockRejectedValue(new Error('oauth failed'));

      const res = await request(app).get('/google-photos/oauth/callback?code=abc&state=xyz');

      expect(res.status).toBe(400);
      expect(res.text).toContain('Google Photos connection failed');
      expect(res.text).toContain('oauth failed');
    });
  });

  // ═══════════════════════════════════════════════
  // WINGMAN STREAM (Activity Streaming to OpenClaw)
  // ═══════════════════════════════════════════════

  describe('POST /wingman-stream/toggle', () => {
    it('enables wingman stream', async () => {
      const res = await request(app)
        .post('/wingman-stream/toggle')
        .send({ enabled: true });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, enabled: true });
      expect(ctx.wingmanStream.setEnabled).toHaveBeenCalledWith(true);
    });

    it('disables wingman stream', async () => {
      const res = await request(app)
        .post('/wingman-stream/toggle')
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, enabled: false });
      expect(ctx.wingmanStream.setEnabled).toHaveBeenCalledWith(false);
    });

    it('coerces falsy enabled to false', async () => {
      const res = await request(app)
        .post('/wingman-stream/toggle')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, enabled: false });
      expect(ctx.wingmanStream.setEnabled).toHaveBeenCalledWith(false);
    });
  });

  describe('GET /wingman-stream/status', () => {
    it('returns wingman stream status when disabled', async () => {
      vi.mocked(ctx.wingmanStream.isEnabled).mockReturnValue(false);

      const res = await request(app).get('/wingman-stream/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, enabled: false });
    });

    it('returns wingman stream status when enabled', async () => {
      vi.mocked(ctx.wingmanStream.isEnabled).mockReturnValue(true);

      const res = await request(app).get('/wingman-stream/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, enabled: true });
    });
  });
});
