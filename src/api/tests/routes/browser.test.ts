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
  humanizedClick: vi.fn().mockResolvedValue({
    ok: true,
    target: { selector: '#btn', found: true, tagName: 'BUTTON', text: 'Submit' },
    completion: { dispatchCompleted: true, effectConfirmed: true, mode: 'confirmed' },
    postAction: {
      page: {
        url: 'https://example.com',
        title: 'Example',
        loading: false,
        activeElement: { tagName: 'BUTTON', id: 'submit', name: null, type: null, value: null },
      },
      element: {
        found: true,
        tagName: 'BUTTON',
        text: 'Submit',
        value: null,
        focused: true,
        connected: true,
        checked: null,
        disabled: false,
      },
      navigation: {
        urlBefore: 'https://example.com',
        urlAfter: 'https://example.com',
        changed: false,
        loading: false,
        waitApplied: false,
        completed: true,
        timeout: false,
      },
    },
  }),
  humanizedType: vi.fn().mockResolvedValue({
    ok: true,
    target: { selector: '#input', found: true, tagName: 'INPUT', text: null },
    completion: { dispatchCompleted: true, effectConfirmed: true, mode: 'confirmed' },
    postAction: {
      page: {
        url: 'https://example.com',
        title: 'Example',
        loading: false,
        activeElement: { tagName: 'INPUT', id: 'search', name: 'search', type: 'text', value: 'hello world' },
      },
      element: {
        found: true,
        tagName: 'INPUT',
        text: null,
        value: 'hello world',
        focused: true,
        connected: true,
        checked: null,
        disabled: false,
      },
      observedAfterMs: 25,
    },
  }),
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

    it('uses X-Tab-Id to evaluate page content in a background tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([
        {
          id: 'tab-2',
          webContentsId: 202,
          url: 'https://example.com/background',
          title: 'Background',
          active: false,
          source: 'wingman',
          partition: 'persist:tandem',
        } as any,
      ]);
      vi.mocked(ctx.devToolsManager.evaluateInTab).mockResolvedValueOnce({
        title: 'Background',
        url: 'https://example.com/background',
        description: 'Background tab',
        text: 'Background content',
        length: 18,
      });

      const res = await request(app)
        .get('/page-content')
        .set('X-Tab-Id', 'tab-2');

      expect(res.status).toBe(200);
      expect(ctx.devToolsManager.evaluateInTab).toHaveBeenCalledWith(
        202,
        expect.stringContaining('new Promise((resolve) => {'),
      );
    });

    it('returns 404 when X-Tab-Id does not match a tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app)
        .get('/page-content')
        .set('X-Tab-Id', 'tab-missing');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-missing not found');
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

    it('uses X-Tab-Id to read HTML from a background tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([
        {
          id: 'tab-2',
          webContentsId: 202,
          url: 'https://example.com/background',
          title: 'Background',
          active: false,
          source: 'wingman',
          partition: 'persist:tandem',
        } as any,
      ]);
      vi.mocked(ctx.devToolsManager.evaluateInTab).mockResolvedValueOnce('<html><body>Background</body></html>');

      const res = await request(app)
        .get('/page-html')
        .set('X-Tab-Id', 'tab-2');

      expect(res.status).toBe(200);
      expect(res.text).toBe('<html><body>Background</body></html>');
      expect(ctx.devToolsManager.evaluateInTab).toHaveBeenCalledWith(
        202,
        'document.documentElement.outerHTML',
      );
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
      expect(res.body).toEqual(expect.objectContaining({
        ok: true,
        action: 'click',
        scope: expect.objectContaining({
          kind: 'tab',
          tabId: 'tab-1',
          wcId: 100,
          source: 'active',
        }),
        target: expect.objectContaining({
          kind: 'selector',
          selector: '#submit-btn',
          resolved: true,
          tagName: 'BUTTON',
        }),
        completion: expect.objectContaining({
          dispatchCompleted: true,
          effectConfirmed: true,
          mode: 'confirmed',
        }),
      }));
      expect(humanizedClick).toHaveBeenCalled();
      expect(ctx.panelManager.logActivity).toHaveBeenCalledWith('click', {
        selector: '#submit-btn',
      });
    });

    it('uses X-Tab-Id to target a background tab and reports scoped metadata', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([
        {
          id: 'tab-2',
          webContentsId: 202,
          url: 'https://example.com/background',
          title: 'Background',
          active: false,
          source: 'wingman',
          partition: 'persist:tandem',
        } as any,
      ]);

      const res = await request(app)
        .post('/click')
        .set('X-Tab-Id', 'tab-2')
        .send({ selector: '#submit-btn' });

      expect(res.status).toBe(200);
      expect(res.body.scope).toEqual(expect.objectContaining({
        tabId: 'tab-2',
        wcId: 202,
        source: 'header',
      }));
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValueOnce(null as any);

      const res = await request(app)
        .post('/click')
        .send({ selector: '#btn' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('No active tab');
    });

    it('returns 404 with scope and completion when humanizedClick reports selector not found', async () => {
      vi.mocked(humanizedClick).mockResolvedValueOnce({
        ok: false,
        completion: { dispatchCompleted: false, effectConfirmed: false, mode: 'dispatched' },
        error: 'Element not found: #ghost',
      } as any);

      const res = await request(app)
        .post('/click')
        .send({ selector: '#ghost' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual(expect.objectContaining({
        ok: false,
        action: 'click',
        scope: expect.objectContaining({ kind: 'tab' }),
        target: expect.objectContaining({
          kind: 'selector',
          selector: '#ghost',
          resolved: false,
        }),
        error: 'Element not found: #ghost',
      }));
    });

    it('passes confirm and waitForNavigation options to humanizedClick', async () => {
      const res = await request(app)
        .post('/click')
        .send({
          selector: '#btn',
          confirm: true,
          waitForNavigation: true,
          navigationTimeoutMs: 5000,
          confirmTimeoutMs: 1000,
        });

      expect(res.status).toBe(200);
      expect(humanizedClick).toHaveBeenCalledWith(
        expect.anything(),
        '#btn',
        {
          confirm: true,
          waitForNavigation: true,
          timeoutMs: 5000,
          confirmTimeoutMs: 1000,
        },
      );
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
      expect(res.body).toEqual(expect.objectContaining({
        ok: true,
        action: 'type',
        requestedValue: 'hello world',
        scope: expect.objectContaining({
          kind: 'tab',
          tabId: 'tab-1',
          wcId: 100,
          source: 'active',
        }),
        target: expect.objectContaining({
          kind: 'selector',
          selector: '#search',
          resolved: true,
          tagName: 'INPUT',
        }),
        completion: expect.objectContaining({
          dispatchCompleted: true,
          effectConfirmed: true,
          mode: 'confirmed',
        }),
      }));
      expect(humanizedType).toHaveBeenCalled();
      expect(ctx.panelManager.logActivity).toHaveBeenCalledWith('input', {
        selector: '#search',
        textLength: 11,
      });
    });

    it('returns 404 when the selector action targets a missing tab via X-Tab-Id', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app)
        .post('/type')
        .set('X-Tab-Id', 'tab-missing')
        .send({ selector: '#input', text: 'hello' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-missing not found');
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
        { confirm: undefined, confirmTimeoutMs: undefined },
      );
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValueOnce(null as any);

      const res = await request(app)
        .post('/type')
        .send({ selector: '#input', text: 'hello' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('No active tab');
    });

    it('returns 404 with scope and completion when humanizedType reports selector not found', async () => {
      vi.mocked(humanizedType).mockResolvedValueOnce({
        ok: false,
        completion: { dispatchCompleted: false, effectConfirmed: false, mode: 'dispatched' },
        error: 'Element not found: #ghost-input',
      } as any);

      const res = await request(app)
        .post('/type')
        .send({ selector: '#ghost-input', text: 'hello' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual(expect.objectContaining({
        ok: false,
        action: 'type',
        scope: expect.objectContaining({ kind: 'tab' }),
        target: expect.objectContaining({
          kind: 'selector',
          selector: '#ghost-input',
          resolved: false,
        }),
        error: 'Element not found: #ghost-input',
      }));
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

    it('prefers X-Tab-Id over body.tabId for background execution', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([
        {
          id: 'tab-header',
          webContentsId: 202,
          url: 'https://example.com/background',
          title: 'Background',
          active: false,
          source: 'wingman',
          partition: 'persist:tandem',
        } as any,
        {
          id: 'tab-body',
          webContentsId: 303,
          url: 'https://example.com/other',
          title: 'Other',
          active: false,
          source: 'wingman',
          partition: 'persist:tandem',
        } as any,
      ]);
      vi.mocked(ctx.devToolsManager.evaluateInTab).mockResolvedValueOnce(42);

      const res = await request(app)
        .post('/execute-js')
        .set('X-Tab-Id', 'tab-header')
        .send({ code: '21 + 21', tabId: 'tab-body' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, result: 42 });
      expect(ctx.devToolsManager.evaluateInTab).toHaveBeenCalledWith(202, '21 + 21');
    });

    it('returns 404 when requested tab id does not exist', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app)
        .post('/execute-js')
        .set('X-Tab-Id', 'tab-missing')
        .send({ code: '1 + 1' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-missing not found');
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
  // POST /press-key + /press-key-combo
  // ═══════════════════════════════════════════════

  describe('POST /press-key', () => {
    it('returns scoped completion metadata for a key press', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      vi.mocked(mockWC!.executeJavaScript)
        .mockResolvedValueOnce({
          title: 'Example',
          activeElement: { tagName: 'INPUT', id: 'email', name: 'email', type: 'text', value: 'a' },
        })
        .mockResolvedValueOnce({
          title: 'Example',
          activeElement: { tagName: 'INPUT', id: 'email', name: 'email', type: 'text', value: 'ab' },
        });

      const res = await request(app)
        .post('/press-key')
        .send({ key: 'b' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(expect.objectContaining({
        ok: true,
        action: 'press-key',
        scope: expect.objectContaining({
          tabId: 'tab-1',
          wcId: 100,
        }),
        target: expect.objectContaining({
          kind: 'keyboard',
          key: 'b',
          resolved: true,
        }),
        completion: expect.objectContaining({
          dispatchCompleted: true,
          effectConfirmed: true,
          mode: 'confirmed',
        }),
      }));
    });

    it('returns 400 when key is missing', async () => {
      const res = await request(app).post('/press-key').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('key required');
    });

    it('returns 404 when X-Tab-Id does not match a tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app)
        .post('/press-key')
        .set('X-Tab-Id', 'tab-missing')
        .send({ key: 'Enter' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-missing not found');
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValueOnce(null as any);

      const res = await request(app)
        .post('/press-key')
        .send({ key: 'Enter' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('No active tab');
    });

    it('reports dispatched mode when no observable effect', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      const sameState = {
        title: 'Example',
        activeElement: { tagName: 'BODY', id: null, name: null, type: null, value: null },
      };
      vi.mocked(mockWC!.executeJavaScript)
        .mockResolvedValueOnce(sameState)
        .mockResolvedValueOnce(sameState);

      const res = await request(app)
        .post('/press-key')
        .send({ key: 'PageDown' });

      expect(res.status).toBe(200);
      expect(res.body.completion.effectConfirmed).toBe(false);
      expect(res.body.completion.mode).toBe('dispatched');
      expect(res.body.completion.caveat).toContain('no immediate');
    });

    it('confirms focus movement when the active element changes within the same tag type', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      vi.mocked(mockWC!.executeJavaScript)
        .mockResolvedValueOnce({
          title: 'Example',
          activeElement: { tagName: 'BUTTON', id: 'previous', name: null, type: null, value: null },
        })
        .mockResolvedValueOnce({
          title: 'Example',
          activeElement: { tagName: 'BUTTON', id: 'next', name: null, type: null, value: null },
        });

      const res = await request(app)
        .post('/press-key')
        .send({ key: 'Tab' });

      expect(res.status).toBe(200);
      expect(res.body.completion.effectConfirmed).toBe(true);
      expect(res.body.completion.mode).toBe('confirmed');
      expect(res.body.completion.caveat).toBeUndefined();
      expect(res.body.postAction.page.activeElement.id).toBe('next');
    });

    it('includes modifiers in target and calls sendInputEvent', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      const state = {
        title: 'Example',
        activeElement: { tagName: 'BODY', id: null, name: null, type: null, value: null },
      };
      vi.mocked(mockWC!.executeJavaScript)
        .mockResolvedValueOnce(state)
        .mockResolvedValueOnce(state);

      const res = await request(app)
        .post('/press-key')
        .send({ key: 'c', modifiers: ['control'] });

      expect(res.status).toBe(200);
      expect(res.body.target.modifiers).toEqual(['control']);
      expect(mockWC!.sendInputEvent).toHaveBeenCalled();
    });
  });

  describe('POST /press-key-combo', () => {
    it('returns scoped completion metadata for a key sequence', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      vi.mocked(mockWC!.executeJavaScript)
        .mockResolvedValueOnce({
          title: 'Example',
          activeElement: { tagName: 'BODY', id: null, name: null, type: null, value: null },
        })
        .mockResolvedValueOnce({
          title: 'Example',
          activeElement: { tagName: 'BUTTON', id: 'save', name: null, type: null, value: null },
        });

      const res = await request(app)
        .post('/press-key-combo')
        .send({ keys: ['Tab', 'Enter'] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(expect.objectContaining({
        ok: true,
        action: 'press-key-combo',
        scope: expect.objectContaining({
          tabId: 'tab-1',
          wcId: 100,
        }),
        target: expect.objectContaining({
          kind: 'keyboard-sequence',
          keys: ['Tab', 'Return'],
          resolved: true,
        }),
        completion: expect.objectContaining({
          dispatchCompleted: true,
          effectConfirmed: true,
          mode: 'confirmed',
        }),
      }));
    });

    it('returns 400 when keys array is missing', async () => {
      const res = await request(app).post('/press-key-combo').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('keys array required');
    });

    it('returns 400 when keys array is empty', async () => {
      const res = await request(app).post('/press-key-combo').send({ keys: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('keys array required');
    });

    it('returns 404 when X-Tab-Id does not match a tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app)
        .post('/press-key-combo')
        .set('X-Tab-Id', 'tab-missing')
        .send({ keys: ['Tab', 'Enter'] });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-missing not found');
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValueOnce(null as any);

      const res = await request(app)
        .post('/press-key-combo')
        .send({ keys: ['Tab'] });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('No active tab');
    });

    it('confirms same-tag active-element changes for key sequences', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      vi.mocked(mockWC!.executeJavaScript)
        .mockResolvedValueOnce({
          title: 'Example',
          activeElement: { tagName: 'BUTTON', id: 'save', name: null, type: null, value: null },
        })
        .mockResolvedValueOnce({
          title: 'Example',
          activeElement: { tagName: 'BUTTON', id: 'cancel', name: null, type: null, value: null },
        });

      const res = await request(app)
        .post('/press-key-combo')
        .send({ keys: ['Tab', 'Tab'] });

      expect(res.status).toBe(200);
      expect(res.body.completion.effectConfirmed).toBe(true);
      expect(res.body.completion.mode).toBe('confirmed');
      expect(res.body.postAction.page.activeElement.id).toBe('cancel');
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
      expect(ctx.handoffManager.create).toHaveBeenCalledWith(expect.objectContaining({
        status: 'needs_human',
        title: 'Attention',
        body: 'Something happened',
      }));
      expect(wingmanAlert).toHaveBeenCalledWith('Attention', 'Something happened');
    });

    it('uses default title and empty body when not provided', async () => {
      const res = await request(app).post('/wingman-alert').send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, sent: true });
      expect(ctx.handoffManager.create).toHaveBeenCalledWith(expect.objectContaining({
        status: 'needs_human',
        title: 'Need help',
        body: '',
      }));
      expect(wingmanAlert).toHaveBeenCalledWith('Need help', '');
    });

    it('activates the requested workspace before sending the alert', async () => {
      const res = await request(app)
        .post('/wingman-alert')
        .send({ title: 'Captcha', body: 'Please take over', workspaceId: 'ws-ai' });

      expect(res.status).toBe(200);
      expect(ctx.workspaceManager.switch).toHaveBeenCalledWith('ws-ai');
      expect(ctx.handoffManager.create).toHaveBeenCalledWith(expect.objectContaining({
        workspaceId: 'ws-ai',
      }));
      expect(wingmanAlert).toHaveBeenCalledWith('Captcha', 'Please take over');
    });

    it('returns 400 when workspaceId is not a string', async () => {
      const res = await request(app)
        .post('/wingman-alert')
        .send({ workspaceId: 42 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('workspaceId must be a workspace ID string');
      expect(ctx.workspaceManager.switch).not.toHaveBeenCalled();
      expect(wingmanAlert).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════
  // POST /wait
  // ═══════════════════════════════════════════════

  describe('POST /wait', () => {
    it('waits for a selector and returns result', async () => {
      vi.mocked(ctx.devToolsManager.evaluateInTab).mockResolvedValueOnce({
        ok: true,
        found: true,
      });

      const res = await request(app)
        .post('/wait')
        .send({ selector: '#loaded' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(expect.objectContaining({
        ok: true,
        found: true,
        scope: expect.objectContaining({
          kind: 'tab',
          tabId: 'tab-1',
          wcId: 100,
        }),
      }));
    });

    it('waits for load event when no selector', async () => {
      vi.mocked(ctx.devToolsManager.evaluateInTab).mockResolvedValueOnce({
        ok: true,
        ready: true,
      });

      const res = await request(app).post('/wait').send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual(expect.objectContaining({
        ok: true,
        ready: true,
        scope: expect.objectContaining({
          kind: 'tab',
          tabId: 'tab-1',
          wcId: 100,
        }),
      }));
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValueOnce(null as any);
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
