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

import { registerContentRoutes } from '../../routes/content';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

describe('Content Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    ctx = createMockContext();
    app = createTestApp(registerContentRoutes, ctx);
  });

  // ═══════════════════════════════════════════════
  // CONTENT EXTRACTION
  // ═══════════════════════════════════════════════

  describe('POST /content/extract', () => {
    it('extracts content from the active tab', async () => {
      const fakeContent = { title: 'Test Page', text: 'Hello world', url: 'https://example.com' };
      vi.mocked(ctx.contentExtractor.extractCurrentPage).mockResolvedValue(fakeContent as any);

      const res = await request(app).post('/content/extract');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(fakeContent);
      expect(ctx.contentExtractor.extractCurrentPage).toHaveBeenCalledWith(ctx.win);
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValueOnce(null);

      const res = await request(app).post('/content/extract');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('No active tab');
    });

    it('returns 500 when extractCurrentPage throws', async () => {
      vi.mocked(ctx.contentExtractor.extractCurrentPage).mockRejectedValueOnce(new Error('extraction failed'));

      const res = await request(app).post('/content/extract');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('extraction failed');
    });
  });

  describe('POST /content/extract/url', () => {
    it('extracts content from a given URL', async () => {
      const fakeContent = { title: 'Remote', text: 'Remote content', url: 'https://remote.com' };
      vi.mocked(ctx.contentExtractor.extractFromURL).mockResolvedValue(fakeContent as any);

      const res = await request(app)
        .post('/content/extract/url')
        .send({ url: 'https://remote.com' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(fakeContent);
      expect(ctx.contentExtractor.extractFromURL).toHaveBeenCalledWith('https://remote.com', ctx.headlessManager);
    });

    it('returns 400 when url is missing', async () => {
      const res = await request(app)
        .post('/content/extract/url')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('url required');
    });

    it('returns 500 when extractFromURL throws', async () => {
      vi.mocked(ctx.contentExtractor.extractFromURL).mockRejectedValueOnce(new Error('fetch failed'));

      const res = await request(app)
        .post('/content/extract/url')
        .send({ url: 'https://bad.com' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('fetch failed');
    });
  });

  // ═══════════════════════════════════════════════
  // CONTEXT BRIDGE
  // ═══════════════════════════════════════════════

  describe('GET /context/recent', () => {
    it('returns recent pages with default limit', async () => {
      const fakePages = [{ url: 'https://a.com' }, { url: 'https://b.com' }];
      vi.mocked(ctx.contextBridge.getRecent).mockReturnValue(fakePages as any);

      const res = await request(app).get('/context/recent');

      expect(res.status).toBe(200);
      expect(res.body.pages).toEqual(fakePages);
      expect(ctx.contextBridge.getRecent).toHaveBeenCalledWith(50);
    });

    it('parses limit query param', async () => {
      vi.mocked(ctx.contextBridge.getRecent).mockReturnValue([]);

      const res = await request(app).get('/context/recent?limit=10');

      expect(res.status).toBe(200);
      expect(ctx.contextBridge.getRecent).toHaveBeenCalledWith(10);
    });
  });

  describe('GET /context/search', () => {
    it('searches context with query parameter', async () => {
      const fakeResults = [{ url: 'https://match.com', score: 0.9 }];
      vi.mocked(ctx.contextBridge.search).mockReturnValue(fakeResults as any);

      const res = await request(app).get('/context/search?q=test');

      expect(res.status).toBe(200);
      expect(res.body.results).toEqual(fakeResults);
      expect(ctx.contextBridge.search).toHaveBeenCalledWith('test');
    });

    it('returns 400 when q param is missing', async () => {
      const res = await request(app).get('/context/search');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('q parameter required');
    });
  });

  describe('GET /context/page', () => {
    it('returns page data for a given URL', async () => {
      const fakePage = { url: 'https://example.com', title: 'Example', text: 'content' };
      vi.mocked(ctx.contextBridge.getPage).mockReturnValue(fakePage as any);

      const res = await request(app).get('/context/page?url=https://example.com');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(fakePage);
      expect(ctx.contextBridge.getPage).toHaveBeenCalledWith('https://example.com');
    });

    it('returns 400 when url param is missing', async () => {
      const res = await request(app).get('/context/page');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('url parameter required');
    });

    it('returns 404 when page not found', async () => {
      vi.mocked(ctx.contextBridge.getPage).mockReturnValue(null);

      const res = await request(app).get('/context/page?url=https://unknown.com');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Page not found in context');
    });
  });

  describe('GET /context/summary', () => {
    it('returns context summary', async () => {
      const fakeSummary = { totalPages: 5, recentCount: 3 };
      vi.mocked(ctx.contextBridge.getContextSummary).mockReturnValue(fakeSummary as any);

      const res = await request(app).get('/context/summary');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(fakeSummary);
    });
  });

  describe('POST /context/note', () => {
    it('adds a note to a page', async () => {
      const fakePage = { url: 'https://example.com', notes: ['my note'] };
      vi.mocked(ctx.contextBridge.addNote).mockReturnValue(fakePage as any);

      const res = await request(app)
        .post('/context/note')
        .send({ url: 'https://example.com', note: 'my note' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.page).toEqual(fakePage);
      expect(ctx.contextBridge.addNote).toHaveBeenCalledWith('https://example.com', 'my note');
    });

    it('returns 400 when url is missing', async () => {
      const res = await request(app)
        .post('/context/note')
        .send({ note: 'my note' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('url and note required');
    });

    it('returns 400 when note is missing', async () => {
      const res = await request(app)
        .post('/context/note')
        .send({ url: 'https://example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('url and note required');
    });
  });

  // ═══════════════════════════════════════════════
  // PERSISTENT SCRIPT INJECTION
  // ═══════════════════════════════════════════════

  describe('GET /scripts', () => {
    it('lists scripts with preview', async () => {
      const fakeScripts = [
        { name: 'logger', code: 'console.log("hello world and more text that is longer than 80 characters to test truncation behavior")', enabled: true, addedAt: 1000 },
      ];
      vi.mocked(ctx.scriptInjector.listScripts).mockReturnValue(fakeScripts);

      const res = await request(app).get('/scripts');

      expect(res.status).toBe(200);
      expect(res.body.scripts).toHaveLength(1);
      expect(res.body.scripts[0].name).toBe('logger');
      expect(res.body.scripts[0].enabled).toBe(true);
      expect(res.body.scripts[0].preview.length).toBeLessThanOrEqual(80);
      expect(res.body.scripts[0].addedAt).toBe(1000);
      // Should not include full code
      expect(res.body.scripts[0].code).toBeUndefined();
    });
  });

  describe('POST /scripts/add', () => {
    it('adds a script', async () => {
      const fakeEntry = { name: 'myscript', code: 'alert(1)', enabled: true, addedAt: Date.now() };
      vi.mocked(ctx.scriptInjector.addScript).mockReturnValue(fakeEntry);

      const res = await request(app)
        .post('/scripts/add')
        .send({ name: 'myscript', code: 'alert(1)' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.name).toBe('myscript');
      expect(res.body.active).toBe(true);
      expect(ctx.scriptInjector.addScript).toHaveBeenCalledWith('myscript', 'alert(1)');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/scripts/add')
        .send({ code: 'alert(1)' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name and code required');
    });

    it('returns 400 when code is missing', async () => {
      const res = await request(app)
        .post('/scripts/add')
        .send({ name: 'myscript' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name and code required');
    });
  });

  describe('DELETE /scripts/remove', () => {
    it('removes a script by name', async () => {
      vi.mocked(ctx.scriptInjector.removeScript).mockReturnValue(true);

      const res = await request(app)
        .delete('/scripts/remove')
        .send({ name: 'myscript' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.removed).toBe(true);
      expect(ctx.scriptInjector.removeScript).toHaveBeenCalledWith('myscript');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .delete('/scripts/remove')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name required');
    });
  });

  describe('POST /scripts/enable', () => {
    it('enables a script by name', async () => {
      vi.mocked(ctx.scriptInjector.enableScript).mockReturnValue(true);

      const res = await request(app)
        .post('/scripts/enable')
        .send({ name: 'myscript' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.scriptInjector.enableScript).toHaveBeenCalledWith('myscript');
    });

    it('returns 404 when script not found', async () => {
      vi.mocked(ctx.scriptInjector.enableScript).mockReturnValue(false);

      const res = await request(app)
        .post('/scripts/enable')
        .send({ name: 'nonexistent' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('script "nonexistent" not found');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/scripts/enable')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name required');
    });
  });

  describe('POST /scripts/disable', () => {
    it('disables a script by name', async () => {
      vi.mocked(ctx.scriptInjector.disableScript).mockReturnValue(true);

      const res = await request(app)
        .post('/scripts/disable')
        .send({ name: 'myscript' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.scriptInjector.disableScript).toHaveBeenCalledWith('myscript');
    });

    it('returns 404 when script not found', async () => {
      vi.mocked(ctx.scriptInjector.disableScript).mockReturnValue(false);

      const res = await request(app)
        .post('/scripts/disable')
        .send({ name: 'nonexistent' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('script "nonexistent" not found');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/scripts/disable')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name required');
    });
  });

  // ═══════════════════════════════════════════════
  // PERSISTENT STYLE INJECTION
  // ═══════════════════════════════════════════════

  describe('GET /styles', () => {
    it('lists styles with preview', async () => {
      const fakeStyles = [
        { name: 'dark', css: 'body { background: #000; color: #fff; } /* more css to make it longer than 80 characters for truncation */', enabled: true, addedAt: 2000 },
      ];
      vi.mocked(ctx.scriptInjector.listStyles).mockReturnValue(fakeStyles);

      const res = await request(app).get('/styles');

      expect(res.status).toBe(200);
      expect(res.body.styles).toHaveLength(1);
      expect(res.body.styles[0].name).toBe('dark');
      expect(res.body.styles[0].enabled).toBe(true);
      expect(res.body.styles[0].preview.length).toBeLessThanOrEqual(80);
      expect(res.body.styles[0].addedAt).toBe(2000);
      // Should not include full css
      expect(res.body.styles[0].css).toBeUndefined();
    });
  });

  describe('POST /styles/add', () => {
    it('adds a style and injects into active tab', async () => {
      const res = await request(app)
        .post('/styles/add')
        .send({ name: 'dark', css: 'body { background: #000; }' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.name).toBe('dark');
      expect(ctx.scriptInjector.addStyle).toHaveBeenCalledWith('dark', 'body { background: #000; }');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/styles/add')
        .send({ css: 'body {}' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name and css required');
    });

    it('returns 400 when css is missing', async () => {
      const res = await request(app)
        .post('/styles/add')
        .send({ name: 'dark' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name and css required');
    });
  });

  describe('DELETE /styles/remove', () => {
    it('removes a style by name', async () => {
      vi.mocked(ctx.scriptInjector.removeStyle).mockReturnValue(true);

      const res = await request(app)
        .delete('/styles/remove')
        .send({ name: 'dark' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.removed).toBe(true);
      expect(ctx.scriptInjector.removeStyle).toHaveBeenCalledWith('dark');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .delete('/styles/remove')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name required');
    });
  });

  describe('POST /styles/enable', () => {
    it('enables a style by name', async () => {
      vi.mocked(ctx.scriptInjector.enableStyle).mockReturnValue(true);

      const res = await request(app)
        .post('/styles/enable')
        .send({ name: 'dark' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.scriptInjector.enableStyle).toHaveBeenCalledWith('dark');
    });

    it('returns 404 when style not found', async () => {
      vi.mocked(ctx.scriptInjector.enableStyle).mockReturnValue(false);

      const res = await request(app)
        .post('/styles/enable')
        .send({ name: 'nonexistent' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('style "nonexistent" not found');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/styles/enable')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name required');
    });
  });

  describe('POST /styles/disable', () => {
    it('disables a style by name', async () => {
      vi.mocked(ctx.scriptInjector.disableStyle).mockReturnValue(true);

      const res = await request(app)
        .post('/styles/disable')
        .send({ name: 'dark' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.scriptInjector.disableStyle).toHaveBeenCalledWith('dark');
    });

    it('returns 404 when style not found', async () => {
      vi.mocked(ctx.scriptInjector.disableStyle).mockReturnValue(false);

      const res = await request(app)
        .post('/styles/disable')
        .send({ name: 'nonexistent' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('style "nonexistent" not found');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/styles/disable')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name required');
    });
  });
});
