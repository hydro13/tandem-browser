import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type * as OsModule from 'os';

// ── External mocks (must precede imports that reference them) ───

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {},
  webContents: {
    fromId: vi.fn().mockReturnValue(null),
    getAllWebContents: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('../../../input/humanized', () => ({
  humanizedClick: vi.fn().mockResolvedValue({ ok: true, clicked: true }),
  humanizedType: vi.fn().mockResolvedValue({ ok: true, typed: true }),
}));

vi.mock('../../../notifications/alert', () => ({
  wingmanAlert: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    writeFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
  },
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
}));

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof OsModule>('os');
  return {
    ...actual,
    default: {
      ...actual,
      homedir: () => '/mock-home',
    },
    homedir: () => '/mock-home',
  };
});

vi.mock('../../../utils/paths', () => ({
  tandemDir: vi.fn((...sub: string[]) => {
    const parts = ['/mock-home/.tandem', ...sub];
    return parts.join('/');
  }),
}));

import { registerBrowserRoutes } from '../../routes/browser';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';
import { humanizedClick, humanizedType } from '../../../input/humanized';
import { wingmanAlert } from '../../../notifications/alert';
import fs from 'fs';

describe('Browser Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerBrowserRoutes, ctx);
  });

  // ═══════════════════════════════════════════════
  // POST /navigate
  // ═══════════════════════════════════════════════

  describe('POST /navigate', () => {
    it('returns 400 when url is missing', async () => {
      const res = await request(app).post('/navigate').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('url required');
    });

    it('navigates the active tab', async () => {
      const mockWC = ctx.tabManager.getActiveWebContents();
      const res = await request(app)
        .post('/navigate')
        .send({ url: 'https://example.com' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, url: 'https://example.com' });
      const wc = await mockWC;
      expect(wc!.loadURL).toHaveBeenCalledWith('https://example.com');
      expect(ctx.tabManager.setTabSource).toHaveBeenCalledWith('tab-1', 'wingman');
      expect(ctx.panelManager.logActivity).toHaveBeenCalledWith('navigate', {
        url: 'https://example.com',
        source: 'wingman',
      });
    });

    it('focuses tabId before navigating when provided', async () => {
      const res = await request(app)
        .post('/navigate')
        .send({ url: 'https://example.com', tabId: 'tab-5' });

      expect(res.status).toBe(200);
      expect(ctx.tabManager.focusTab).toHaveBeenCalledWith('tab-5');
    });

    it('creates a new tab for non-default session with no existing tabs', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);
      vi.mocked(ctx.sessionManager.resolvePartition).mockReturnValue('persist:my-session');

      const res = await request(app)
        .post('/navigate')
        .set('x-session', 'my-session')
        .send({ url: 'https://session.example.com' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.tab).toBe('tab-1');
      expect(ctx.tabManager.openTab).toHaveBeenCalledWith(
        'https://session.example.com',
        undefined,
        'wingman',
        'persist:my-session',
      );
    });

    it('focuses existing session tab when one exists', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([
        { id: 'tab-s1', partition: 'persist:my-session', webContentsId: 200 } as any,
      ]);
      vi.mocked(ctx.sessionManager.resolvePartition).mockReturnValue('persist:my-session');

      const res = await request(app)
        .post('/navigate')
        .set('x-session', 'my-session')
        .send({ url: 'https://session.example.com' });

      expect(res.status).toBe(200);
      expect(ctx.tabManager.focusTab).toHaveBeenCalledWith('tab-s1');
    });

    it('returns 500 when no active tab is available', async () => {
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValueOnce(null as any);

      const res = await request(app)
        .post('/navigate')
        .send({ url: 'https://example.com' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('No active tab');
    });
  });

  // ═══════════════════════════════════════════════
  // GET /page-content
  // ═══════════════════════════════════════════════

  describe('GET /page-content', () => {
    it('returns page content extracted via JS execution', async () => {
      const mockContent = {
        title: 'Test Page',
        url: 'https://example.com',
        description: 'A test page',
        text: 'Hello world',
        length: 11,
      };
      const mockWC = await ctx.tabManager.getActiveWebContents();
      vi.mocked(mockWC!.executeJavaScript).mockResolvedValueOnce(mockContent);

      const res = await request(app).get('/page-content');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockContent);
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValueOnce(null as any);

      const res = await request(app).get('/page-content');

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/No active tab/);
    });
  });

  // ═══════════════════════════════════════════════
  // GET /page-html
  // ═══════════════════════════════════════════════

  describe('GET /page-html', () => {
    it('returns HTML from the active tab', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      vi.mocked(mockWC!.executeJavaScript).mockResolvedValueOnce(
        '<html><body>Hello</body></html>',
      );

      const res = await request(app).get('/page-html');

      expect(res.status).toBe(200);
      expect(res.type).toBe('text/html');
      expect(res.text).toBe('<html><body>Hello</body></html>');
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValueOnce(null as any);

      const res = await request(app).get('/page-html');

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/No active tab/);
    });
  });

  // ═══════════════════════════════════════════════
  // POST /click
  // ═══════════════════════════════════════════════

  describe('POST /click', () => {
    it('returns 400 when selector is missing', async () => {
      const res = await request(app).post('/click').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('selector required');
    });

    it('performs a humanized click on the selector', async () => {
      const res = await request(app)
        .post('/click')
        .send({ selector: '#submit-btn' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, clicked: true });
      expect(humanizedClick).toHaveBeenCalled();
      expect(ctx.panelManager.logActivity).toHaveBeenCalledWith('click', {
        selector: '#submit-btn',
      });
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValueOnce(null as any);

      const res = await request(app)
        .post('/click')
        .send({ selector: '#btn' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('No active tab');
    });
  });

  // ═══════════════════════════════════════════════
  // POST /type
  // ═══════════════════════════════════════════════

  describe('POST /type', () => {
    it('returns 400 when selector is missing', async () => {
      const res = await request(app).post('/type').send({ text: 'hello' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('selector and text required');
    });

    it('returns 400 when text is missing', async () => {
      const res = await request(app)
        .post('/type')
        .send({ selector: '#input' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('selector and text required');
    });

    it('performs a humanized type on the selector', async () => {
      const res = await request(app)
        .post('/type')
        .send({ selector: '#search', text: 'hello world' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, typed: true });
      expect(humanizedType).toHaveBeenCalled();
      expect(ctx.panelManager.logActivity).toHaveBeenCalledWith('input', {
        selector: '#search',
        textLength: 11,
      });
    });

    it('passes clear flag when provided', async () => {
      await request(app)
        .post('/type')
        .send({ selector: '#input', text: 'test', clear: true });

      expect(humanizedType).toHaveBeenCalledWith(
        expect.anything(),
        '#input',
        'test',
        true,
      );
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValueOnce(null as any);

      const res = await request(app)
        .post('/type')
        .send({ selector: '#input', text: 'hello' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('No active tab');
    });
  });

  // ═══════════════════════════════════════════════
  // POST /execute-js
  // ═══════════════════════════════════════════════

  describe('POST /execute-js', () => {
    it('returns 400 when neither code nor script is provided', async () => {
      const res = await request(app).post('/execute-js').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('code or script required');
    });

    it('executes JavaScript via code param and returns result', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      vi.mocked(mockWC!.executeJavaScript).mockResolvedValueOnce(42);

      const res = await request(app)
        .post('/execute-js')
        .send({ code: '21 + 21' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, result: 42 });
    });

    it('executes JavaScript via script param', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      vi.mocked(mockWC!.executeJavaScript).mockResolvedValueOnce('hello');

      const res = await request(app)
        .post('/execute-js')
        .send({ script: '"hello"' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, result: 'hello' });
    });

    it('returns 413 when code exceeds 1MB', async () => {
      // Create a custom app with a higher body limit so express.json()
      // doesn't reject the payload before our route handler runs.
      const bigApp = express();
      bigApp.use(express.json({ limit: '2mb' }));
      const bigRouter = express.Router();
      registerBrowserRoutes(bigRouter, ctx);
      bigApp.use(bigRouter);

      const largeCode = 'x'.repeat(1_048_577);

      const res = await request(bigApp)
        .post('/execute-js')
        .send({ code: largeCode });

      expect(res.status).toBe(413);
      expect(res.body.error).toBe('Code too large (max 1MB)');
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValueOnce(null as any);

      const res = await request(app)
        .post('/execute-js')
        .send({ code: '1+1' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('No active tab');
    });

    it('returns 500 when JS execution throws', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      vi.mocked(mockWC!.executeJavaScript).mockRejectedValueOnce(
        new Error('Syntax error'),
      );

      const res = await request(app)
        .post('/execute-js')
        .send({ code: 'bad{' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Syntax error');
    });
  });

  // ═══════════════════════════════════════════════
  // GET /screenshot
  // ═══════════════════════════════════════════════

  describe('GET /screenshot', () => {
    it('returns PNG when no save path provided', async () => {
      const res = await request(app).get('/screenshot');

      expect(res.status).toBe(200);
      expect(res.type).toBe('image/png');
      expect(res.body).toBeInstanceOf(Buffer);
    });

    it('saves screenshot to allowed Desktop path', async () => {
      const savePath = '/mock-home/Desktop/shot.png';
      const res = await request(app)
        .get('/screenshot')
        .query({ save: savePath });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.path).toBe(savePath);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('saves screenshot to allowed Downloads path', async () => {
      const savePath = '/mock-home/Downloads/shot.png';
      const res = await request(app)
        .get('/screenshot')
        .query({ save: savePath });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.path).toBe(savePath);
    });

    it('saves screenshot to allowed .tandem path', async () => {
      const savePath = '/mock-home/.tandem/screenshots/shot.png';
      const res = await request(app)
        .get('/screenshot')
        .query({ save: savePath });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.path).toBe(savePath);
    });

    it('rejects save to disallowed path', async () => {
      const savePath = '/tmp/malicious/shot.png';
      const res = await request(app)
        .get('/screenshot')
        .query({ save: savePath });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Save path must be/);
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValueOnce(null as any);

      const res = await request(app).get('/screenshot');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('No active tab');
    });
  });

  // ═══════════════════════════════════════════════
  // GET /cookies
  // ═══════════════════════════════════════════════

  describe('GET /cookies', () => {
    it('returns cookies from the session', async () => {
      const fakeCookies = [
        { name: 'sid', value: 'abc123', domain: '.example.com' },
      ];
      vi.mocked(ctx.win.webContents.session.cookies.get).mockResolvedValueOnce(
        fakeCookies as any,
      );

      const res = await request(app).get('/cookies');

      expect(res.status).toBe(200);
      expect(res.body.cookies).toEqual(fakeCookies);
      expect(ctx.win.webContents.session.cookies.get).toHaveBeenCalledWith({});
    });

    it('filters cookies by url when provided', async () => {
      vi.mocked(ctx.win.webContents.session.cookies.get).mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/cookies')
        .query({ url: 'https://example.com' });

      expect(res.status).toBe(200);
      expect(ctx.win.webContents.session.cookies.get).toHaveBeenCalledWith({
        url: 'https://example.com',
      });
    });
  });

  // ═══════════════════════════════════════════════
  // POST /cookies/clear
  // ═══════════════════════════════════════════════

  describe('POST /cookies/clear', () => {
    it('returns 400 when domain is missing', async () => {
      const res = await request(app).post('/cookies/clear').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('domain required');
    });

    it('clears matching cookies for a domain', async () => {
      const fakeCookies = [
        { name: 'sid', domain: '.example.com', path: '/', secure: true },
        { name: 'pref', domain: '.example.com', path: '/', secure: false },
        { name: 'other', domain: '.other.com', path: '/', secure: true },
      ];
      vi.mocked(ctx.win.webContents.session.cookies.get).mockResolvedValueOnce(
        fakeCookies as any,
      );

      const res = await request(app)
        .post('/cookies/clear')
        .send({ domain: 'example.com' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, removed: 2, domain: 'example.com' });
      expect(ctx.win.webContents.session.cookies.remove).toHaveBeenCalledTimes(2);
      expect(ctx.win.webContents.session.cookies.remove).toHaveBeenCalledWith(
        'https://example.com/',
        'sid',
      );
      expect(ctx.win.webContents.session.cookies.remove).toHaveBeenCalledWith(
        'http://example.com/',
        'pref',
      );
    });
  });

  // ═══════════════════════════════════════════════
  // POST /scroll
  // ═══════════════════════════════════════════════

  describe('POST /scroll', () => {
    const scrollInfo = JSON.stringify({
      scrollTop: 500,
      scrollHeight: 2000,
      clientHeight: 800,
      atTop: false,
      atBottom: false,
    });

    beforeEach(async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      // Default: all executeJavaScript calls return scrollInfo
      vi.mocked(mockWC!.executeJavaScript).mockResolvedValue(scrollInfo);
    });

    it('scrolls down with default direction and amount', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();

      const res = await request(app).post('/scroll').send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.scroll).toEqual({
        scrollTop: 500,
        scrollHeight: 2000,
        clientHeight: 800,
        atTop: false,
        atBottom: false,
      });
      expect(mockWC!.sendInputEvent).toHaveBeenCalledWith({
        type: 'mouseWheel',
        x: 400,
        y: 400,
        deltaX: 0,
        deltaY: 500,
      });
      expect(ctx.behaviorObserver.recordScroll).toHaveBeenCalled();
    });

    it('scrolls up when direction is up', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();

      const res = await request(app)
        .post('/scroll')
        .send({ direction: 'up', amount: 300 });

      expect(res.status).toBe(200);
      expect(mockWC!.sendInputEvent).toHaveBeenCalledWith(
        expect.objectContaining({ deltaY: -300 }),
      );
    });

    it('scrolls to top when target is top', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();

      const res = await request(app)
        .post('/scroll')
        .send({ target: 'top' });

      expect(res.status).toBe(200);
      expect(mockWC!.executeJavaScript).toHaveBeenCalledWith(
        expect.stringContaining('scrollTo'),
      );
    });

    it('scrolls to bottom when target is bottom', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();

      const res = await request(app)
        .post('/scroll')
        .send({ target: 'bottom' });

      expect(res.status).toBe(200);
      expect(mockWC!.executeJavaScript).toHaveBeenCalledWith(
        expect.stringContaining('scrollHeight'),
      );
    });

    it('scrolls element into view via selector', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      // First call: scrollIntoView returns true, second call: scrollInfo
      vi.mocked(mockWC!.executeJavaScript)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(scrollInfo);

      const res = await request(app)
        .post('/scroll')
        .send({ selector: '#target-el' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 404 when selector is not found', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      vi.mocked(mockWC!.executeJavaScript).mockResolvedValueOnce(false);

      const res = await request(app)
        .post('/scroll')
        .send({ selector: '#missing' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Selector not found');
      expect(res.body.selector).toBe('#missing');
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValueOnce(null as any);

      const res = await request(app).post('/scroll').send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('No active tab');
    });
  });

  // ═══════════════════════════════════════════════
  // POST /wingman-alert
  // ═══════════════════════════════════════════════

  describe('POST /wingman-alert', () => {
    it('sends an alert with provided title and body', async () => {
      const res = await request(app)
        .post('/wingman-alert')
        .send({ title: 'Attention', body: 'Something happened' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, sent: true });
      expect(wingmanAlert).toHaveBeenCalledWith('Attention', 'Something happened');
    });

    it('uses default title and empty body when not provided', async () => {
      const res = await request(app).post('/wingman-alert').send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, sent: true });
      expect(wingmanAlert).toHaveBeenCalledWith('Need help', '');
    });
  });

  // ═══════════════════════════════════════════════
  // POST /wait
  // ═══════════════════════════════════════════════

  describe('POST /wait', () => {
    it('waits for a selector and returns result', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      vi.mocked(mockWC!.executeJavaScript).mockResolvedValueOnce({
        ok: true,
        found: true,
      });

      const res = await request(app)
        .post('/wait')
        .send({ selector: '#loaded' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, found: true });
    });

    it('waits for load event when no selector', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      vi.mocked(mockWC!.executeJavaScript).mockResolvedValueOnce({
        ok: true,
        ready: true,
      });

      const res = await request(app).post('/wait').send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, ready: true });
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValueOnce(null as any);

      const res = await request(app)
        .post('/wait')
        .send({ selector: '#el' });

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/No active tab/);
    });
  });

  // ═══════════════════════════════════════════════
  // GET /links
  // ═══════════════════════════════════════════════

  describe('GET /links', () => {
    it('returns extracted links from the page', async () => {
      const fakeLinks = [
        { text: 'Google', href: 'https://google.com', visible: true },
        { text: 'About', href: 'https://example.com/about', visible: false },
      ];
      const mockWC = await ctx.tabManager.getActiveWebContents();
      vi.mocked(mockWC!.executeJavaScript).mockResolvedValueOnce(fakeLinks);

      const res = await request(app).get('/links');

      expect(res.status).toBe(200);
      expect(res.body.links).toEqual(fakeLinks);
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValueOnce(null as any);

      const res = await request(app).get('/links');

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/No active tab/);
    });
  });

  // ═══════════════════════════════════════════════
  // GET /forms
  // ═══════════════════════════════════════════════

  describe('GET /forms', () => {
    it('returns extracted forms from the page', async () => {
      const fakeForms = [
        {
          index: 0,
          action: 'https://example.com/search',
          method: 'get',
          fields: [
            {
              tag: 'input',
              type: 'text',
              name: 'q',
              id: 'search',
              placeholder: 'Search...',
              value: '',
            },
          ],
        },
      ];
      const mockWC = await ctx.tabManager.getActiveWebContents();
      vi.mocked(mockWC!.executeJavaScript).mockResolvedValueOnce(fakeForms);

      const res = await request(app).get('/forms');

      expect(res.status).toBe(200);
      expect(res.body.forms).toEqual(fakeForms);
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValueOnce(null as any);

      const res = await request(app).get('/forms');

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/No active tab/);
    });
  });
});
