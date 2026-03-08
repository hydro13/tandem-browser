import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {},
  webContents: { fromId: vi.fn(), getAllWebContents: vi.fn().mockReturnValue([]) },
}));

import { registerSessionRoutes } from '../../routes/sessions';
import { createMockContext, createMockWebContents, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

describe('Session Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    ctx = createMockContext();
    app = createTestApp(registerSessionRoutes, ctx);
  });

  // ═══════════════════════════════════════════════
  // DEVICE EMULATION
  // ═══════════════════════════════════════════════

  // ─── GET /device/profiles ──────────────────────

  describe('GET /device/profiles', () => {
    it('returns device profiles', async () => {
      const fakeProfiles = [{ name: 'iPhone 14', width: 390, height: 844 }];
      vi.mocked(ctx.deviceEmulator.getProfiles).mockReturnValue(fakeProfiles as any);

      const res = await request(app).get('/device/profiles');

      expect(res.status).toBe(200);
      expect(res.body.profiles).toEqual(fakeProfiles);
    });

    it('returns empty profiles list', async () => {
      vi.mocked(ctx.deviceEmulator.getProfiles).mockReturnValue([]);

      const res = await request(app).get('/device/profiles');

      expect(res.status).toBe(200);
      expect(res.body.profiles).toEqual([]);
    });
  });

  // ─── GET /device/status ────────────────────────

  describe('GET /device/status', () => {
    it('returns emulation status', async () => {
      const fakeStatus = { emulating: true, device: 'iPhone 14' };
      vi.mocked(ctx.deviceEmulator.getStatus).mockReturnValue(fakeStatus as any);

      const res = await request(app).get('/device/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(fakeStatus);
    });

    it('returns default status when not emulating', async () => {
      vi.mocked(ctx.deviceEmulator.getStatus).mockReturnValue({} as any);

      const res = await request(app).get('/device/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
    });
  });

  // ─── POST /device/emulate ─────────────────────

  describe('POST /device/emulate', () => {
    it('emulates by device name', async () => {
      const fakeProfile = { name: 'iPhone 14', width: 390, height: 844 };
      vi.mocked(ctx.deviceEmulator.emulateDevice).mockResolvedValue(fakeProfile as any);

      const res = await request(app)
        .post('/device/emulate')
        .send({ device: 'iPhone 14' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.profile).toEqual(fakeProfile);
      expect(ctx.deviceEmulator.emulateDevice).toHaveBeenCalled();
    });

    it('emulates with custom width and height', async () => {
      const res = await request(app)
        .post('/device/emulate')
        .send({ width: 1024, height: 768 });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.deviceEmulator.emulateCustom).toHaveBeenCalled();
      const callArgs = vi.mocked(ctx.deviceEmulator.emulateCustom).mock.calls[0];
      expect(callArgs[1]).toEqual({
        width: 1024,
        height: 768,
        deviceScaleFactor: undefined,
        mobile: false,
        userAgent: undefined,
      });
    });

    it('emulates with all custom parameters', async () => {
      const res = await request(app)
        .post('/device/emulate')
        .send({
          width: 375,
          height: 812,
          deviceScaleFactor: 3,
          mobile: true,
          userAgent: 'CustomAgent/1.0',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      const callArgs = vi.mocked(ctx.deviceEmulator.emulateCustom).mock.calls[0];
      expect(callArgs[1]).toEqual({
        width: 375,
        height: 812,
        deviceScaleFactor: 3,
        mobile: true,
        userAgent: 'CustomAgent/1.0',
      });
    });

    it('returns 400 when neither device nor width+height provided', async () => {
      const res = await request(app)
        .post('/device/emulate')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('"device" or "width"+"height" required');
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValueOnce(null as any);

      const res = await request(app)
        .post('/device/emulate')
        .send({ device: 'iPhone 14' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('No active tab');
    });

    it('handles emulateDevice errors', async () => {
      vi.mocked(ctx.deviceEmulator.emulateDevice).mockRejectedValueOnce(new Error('Unknown device'));

      const res = await request(app)
        .post('/device/emulate')
        .send({ device: 'NonexistentDevice' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Unknown device');
    });
  });

  // ─── POST /device/reset ───────────────────────

  describe('POST /device/reset', () => {
    it('resets emulation', async () => {
      const res = await request(app)
        .post('/device/reset')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.deviceEmulator.reset).toHaveBeenCalled();
    });

    it('returns 500 when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValueOnce(null as any);

      const res = await request(app)
        .post('/device/reset')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('No active tab');
    });

    it('handles reset errors', async () => {
      vi.mocked(ctx.deviceEmulator.reset).mockRejectedValueOnce(new Error('reset failed'));

      const res = await request(app)
        .post('/device/reset')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('reset failed');
    });
  });

  // ═══════════════════════════════════════════════
  // SESSIONS
  // ═══════════════════════════════════════════════

  // ─── GET /sessions/list ────────────────────────

  describe('GET /sessions/list', () => {
    it('returns sessions with tab counts', async () => {
      const fakeSessions = [
        { name: 'work', partition: 'persist:work' },
        { name: 'personal', partition: 'persist:personal' },
      ];
      const fakeTabs = [
        { id: 'tab-1', partition: 'persist:work' },
        { id: 'tab-2', partition: 'persist:work' },
        { id: 'tab-3', partition: 'persist:personal' },
      ];
      vi.mocked(ctx.sessionManager.list).mockReturnValue(fakeSessions as any);
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue(fakeTabs as any);
      vi.mocked(ctx.sessionManager.getActive).mockReturnValue('work');

      const res = await request(app).get('/sessions/list');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.active).toBe('work');
      expect(res.body.sessions).toEqual([
        { name: 'work', partition: 'persist:work', tabs: 2 },
        { name: 'personal', partition: 'persist:personal', tabs: 1 },
      ]);
    });

    it('returns empty sessions list', async () => {
      vi.mocked(ctx.sessionManager.list).mockReturnValue([]);
      vi.mocked(ctx.sessionManager.getActive).mockReturnValue('default');

      const res = await request(app).get('/sessions/list');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.sessions).toEqual([]);
      expect(res.body.active).toBe('default');
    });
  });

  // ─── POST /sessions/create ─────────────────────

  describe('POST /sessions/create', () => {
    it('creates a session by name', async () => {
      vi.mocked(ctx.sessionManager.create).mockReturnValue({
        name: 'work',
        partition: 'persist:work',
      } as any);

      const res = await request(app)
        .post('/sessions/create')
        .send({ name: 'work' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.name).toBe('work');
      expect(res.body.partition).toBe('persist:work');
      expect(res.body.tab).toBeUndefined();
      expect(ctx.sessionManager.create).toHaveBeenCalledWith('work');
    });

    it('creates a session and opens a tab with URL', async () => {
      vi.mocked(ctx.sessionManager.create).mockReturnValue({
        name: 'research',
        partition: 'persist:research',
      } as any);
      const fakeTab = { id: 'tab-new', url: 'https://example.com' };
      vi.mocked(ctx.tabManager.openTab).mockResolvedValueOnce(fakeTab as any);

      const res = await request(app)
        .post('/sessions/create')
        .send({ name: 'research', url: 'https://example.com' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.name).toBe('research');
      expect(res.body.tab).toEqual(fakeTab);
      expect(ctx.tabManager.openTab).toHaveBeenCalledWith(
        'https://example.com',
        undefined,
        'wingman',
        'persist:research',
      );
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/sessions/create')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name required');
    });

    it('returns 400 when sessionManager.create throws', async () => {
      vi.mocked(ctx.sessionManager.create).mockImplementationOnce(() => {
        throw new Error('Session already exists');
      });

      const res = await request(app)
        .post('/sessions/create')
        .send({ name: 'existing' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Session already exists');
    });
  });

  // ─── POST /sessions/switch ─────────────────────

  describe('POST /sessions/switch', () => {
    it('switches to a session by name', async () => {
      const res = await request(app)
        .post('/sessions/switch')
        .send({ name: 'work' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.active).toBe('work');
      expect(ctx.sessionManager.setActive).toHaveBeenCalledWith('work');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/sessions/switch')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name required');
    });

    it('returns 400 when setActive throws', async () => {
      vi.mocked(ctx.sessionManager.setActive).mockImplementationOnce(() => {
        throw new Error('Session not found');
      });

      const res = await request(app)
        .post('/sessions/switch')
        .send({ name: 'nonexistent' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Session not found');
    });
  });

  // ─── POST /sessions/destroy ────────────────────

  describe('POST /sessions/destroy', () => {
    it('destroys a session and closes its tabs', async () => {
      vi.mocked(ctx.sessionManager.get).mockReturnValue({
        name: 'work',
        partition: 'persist:work',
      } as any);
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([
        { id: 'tab-1', partition: 'persist:work' },
        { id: 'tab-2', partition: 'persist:work' },
        { id: 'tab-3', partition: 'persist:other' },
      ] as any);

      const res = await request(app)
        .post('/sessions/destroy')
        .send({ name: 'work' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.name).toBe('work');
      // Only tabs belonging to the session should be closed
      expect(ctx.tabManager.closeTab).toHaveBeenCalledTimes(2);
      expect(ctx.tabManager.closeTab).toHaveBeenCalledWith('tab-1');
      expect(ctx.tabManager.closeTab).toHaveBeenCalledWith('tab-2');
      expect(ctx.sessionManager.destroy).toHaveBeenCalledWith('work');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/sessions/destroy')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name required');
    });

    it('returns 404 when session does not exist', async () => {
      vi.mocked(ctx.sessionManager.get).mockReturnValue(null as any);

      const res = await request(app)
        .post('/sessions/destroy')
        .send({ name: 'ghost' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Session 'ghost' does not exist");
    });

    it('destroys session with no tabs', async () => {
      vi.mocked(ctx.sessionManager.get).mockReturnValue({
        name: 'empty',
        partition: 'persist:empty',
      } as any);
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app)
        .post('/sessions/destroy')
        .send({ name: 'empty' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.tabManager.closeTab).not.toHaveBeenCalled();
      expect(ctx.sessionManager.destroy).toHaveBeenCalledWith('empty');
    });
  });

  // ─── POST /sessions/state/save ─────────────────

  describe('POST /sessions/state/save', () => {
    it('saves session state', async () => {
      vi.mocked(ctx.stateManager.save).mockResolvedValue('/path/to/state.json');

      const res = await request(app)
        .post('/sessions/state/save')
        .send({ name: 'my-state' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.path).toBe('/path/to/state.json');
      // Default session uses DEFAULT_PARTITION
      expect(ctx.stateManager.save).toHaveBeenCalledWith('my-state', 'persist:tandem');
    });

    it('saves state for a named session via X-Session header', async () => {
      vi.mocked(ctx.stateManager.save).mockResolvedValue('/path/to/state.json');
      vi.mocked(ctx.sessionManager.resolvePartition).mockReturnValue('persist:work');

      const res = await request(app)
        .post('/sessions/state/save')
        .set('X-Session', 'work')
        .send({ name: 'my-state' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.stateManager.save).toHaveBeenCalledWith('my-state', 'persist:work');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/sessions/state/save')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name required');
    });

    it('handles save errors', async () => {
      vi.mocked(ctx.stateManager.save).mockRejectedValueOnce(new Error('disk full'));

      const res = await request(app)
        .post('/sessions/state/save')
        .send({ name: 'my-state' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('disk full');
    });
  });

  // ─── POST /sessions/state/load ─────────────────

  describe('POST /sessions/state/load', () => {
    it('loads session state', async () => {
      vi.mocked(ctx.stateManager.load).mockResolvedValue({ cookiesRestored: 42 });

      const res = await request(app)
        .post('/sessions/state/load')
        .send({ name: 'my-state' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.cookiesRestored).toBe(42);
      expect(ctx.stateManager.load).toHaveBeenCalledWith('my-state', 'persist:tandem');
    });

    it('loads state for a named session via X-Session header', async () => {
      vi.mocked(ctx.stateManager.load).mockResolvedValue({ cookiesRestored: 10 });
      vi.mocked(ctx.sessionManager.resolvePartition).mockReturnValue('persist:personal');

      const res = await request(app)
        .post('/sessions/state/load')
        .set('X-Session', 'personal')
        .send({ name: 'my-state' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.cookiesRestored).toBe(10);
      expect(ctx.stateManager.load).toHaveBeenCalledWith('my-state', 'persist:personal');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/sessions/state/load')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name required');
    });

    it('handles load errors', async () => {
      vi.mocked(ctx.stateManager.load).mockRejectedValueOnce(new Error('state not found'));

      const res = await request(app)
        .post('/sessions/state/load')
        .send({ name: 'missing-state' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('state not found');
    });
  });

  // ─── GET /sessions/state/list ──────────────────

  describe('GET /sessions/state/list', () => {
    it('returns saved states', async () => {
      const fakeStates = ['state-a', 'state-b', 'state-c'];
      vi.mocked(ctx.stateManager.list).mockReturnValue(fakeStates as any);

      const res = await request(app).get('/sessions/state/list');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.states).toEqual(fakeStates);
    });

    it('returns empty states list', async () => {
      vi.mocked(ctx.stateManager.list).mockReturnValue([]);

      const res = await request(app).get('/sessions/state/list');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.states).toEqual([]);
    });
  });

  // ─── POST /sessions/fetch ──────────────────────

  describe('POST /sessions/fetch', () => {
    it('executes a same-origin fetch in the active tab', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      vi.mocked(mockWC.executeJavaScript).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://example.com/api/me',
        headers: { 'content-type': 'application/json' },
        body: { id: 'u1' },
        responseType: 'json',
      } as any);

      const res = await request(app)
        .post('/sessions/fetch')
        .send({ url: '/api/me' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.response).toEqual({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://example.com/api/me',
        headers: { 'content-type': 'application/json' },
        body: { id: 'u1' },
        responseType: 'json',
      });
      expect(mockWC.executeJavaScript).toHaveBeenCalledTimes(1);
      expect(vi.mocked(mockWC.executeJavaScript).mock.calls[0]?.[0]).toContain('"url":"https://example.com/api/me"');
      expect(vi.mocked(mockWC.executeJavaScript).mock.calls[0]?.[0]).toContain('"method":"GET"');
    });

    it('uses tabId when provided', async () => {
      const tabWC = createMockWebContents(7);
      vi.mocked(ctx.tabManager.getWebContents).mockReturnValueOnce(tabWC as any);
      vi.mocked(tabWC.executeJavaScript).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        url: 'https://example.com/api/missing',
        headers: { 'content-type': 'text/plain' },
        body: 'missing',
        responseType: 'text',
      } as any);

      const res = await request(app)
        .post('/sessions/fetch?tabId=tab-7')
        .send({ url: '/api/missing' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.tabManager.getWebContents).toHaveBeenCalledWith('tab-7');
      expect(tabWC.executeJavaScript).toHaveBeenCalledTimes(1);
    });

    it('serializes JSON bodies and preserves custom headers', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      vi.mocked(mockWC.executeJavaScript).mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: 'Created',
        url: 'https://example.com/api/items',
        headers: { 'content-type': 'application/json' },
        body: { ok: true },
        responseType: 'json',
      } as any);

      const res = await request(app)
        .post('/sessions/fetch')
        .send({
          url: '/api/items',
          method: 'post',
          headers: { 'x-trace-id': 'trace-1' },
          body: { name: 'Item' },
        });

      expect(res.status).toBe(200);
      const script = vi.mocked(mockWC.executeJavaScript).mock.calls[0]?.[0] ?? '';
      expect(script).toContain('"method":"POST"');
      expect(script).toContain('\\"name\\":\\"Item\\"');
      expect(script).toContain('"x-trace-id":"trace-1"');
      expect(script).toContain('"content-type":"application/json"');
    });

    it('returns 400 when url is missing', async () => {
      const res = await request(app)
        .post('/sessions/fetch')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('url required');
    });

    it('returns 400 for unsupported methods', async () => {
      const res = await request(app)
        .post('/sessions/fetch')
        .send({ url: '/api/me', method: 'TRACE' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Unsupported method: TRACE');
    });

    it('returns 400 for forbidden headers', async () => {
      const res = await request(app)
        .post('/sessions/fetch')
        .send({
          url: '/api/me',
          headers: { Authorization: 'Bearer nope' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Header not allowed: Authorization');
    });

    it('returns 400 for cross-origin targets', async () => {
      const res = await request(app)
        .post('/sessions/fetch')
        .send({ url: 'https://other.example.com/api/me' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cross-origin fetch is not allowed; use the tab origin or a relative URL');
    });

    it('returns 400 when body is sent with GET', async () => {
      const res = await request(app)
        .post('/sessions/fetch')
        .send({ url: '/api/me', body: { invalid: true } });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('body is not allowed for GET requests');
    });

    it('returns 500 when no tab is available', async () => {
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValueOnce(null as any);

      const res = await request(app)
        .post('/sessions/fetch')
        .send({ url: '/api/me' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('No active tab');
    });

    it('returns 408 on fetch timeout', async () => {
      const mockWC = await ctx.tabManager.getActiveWebContents();
      vi.mocked(mockWC.executeJavaScript).mockRejectedValueOnce(new Error('Fetch timed out'));

      const res = await request(app)
        .post('/sessions/fetch')
        .send({ url: '/api/me' });

      expect(res.status).toBe(408);
      expect(res.body.error).toBe('Fetch timed out after 15s');
    });
  });
});
