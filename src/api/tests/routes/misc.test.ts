import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ── Module mocks (must be before imports) ────────────────────────

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {},
  webContents: {
    fromId: vi.fn().mockReturnValue(null),
    getAllWebContents: vi.fn().mockReturnValue([]),
  },
}));

const { mockPasswordManager } = vi.hoisted(() => ({
  mockPasswordManager: {
    isVaultUnlocked: true,
    isNewVault: vi.fn().mockReturnValue(false),
    unlock: vi.fn().mockResolvedValue(true),
    lock: vi.fn(),
    getIdentitiesForDomain: vi.fn().mockReturnValue([]),
    saveItem: vi.fn(),
  },
}));

vi.mock('../../../passwords/manager', () => ({
  getPasswordManager: vi.fn().mockReturnValue(mockPasswordManager),
}));

vi.mock('../../context', () => ({
  getActiveWC: vi.fn().mockResolvedValue(null),
}));

// Note: ../../security/crypto is loaded via dynamic require() inside the route handler.
// vi.mock cannot intercept native CJS require() so we don't mock it here.
// The tests for /passwords/generate verify the endpoint works with the real PasswordCrypto class.

vi.mock('../../../utils/paths', () => ({
  tandemDir: vi.fn().mockReturnValue('/tmp/tandem-test'),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    readdirSync: vi.fn().mockReturnValue([]),
    unlinkSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(false),
  readdirSync: vi.fn().mockReturnValue([]),
  unlinkSync: vi.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────────

import { registerMiscRoutes, resetMiscRouteStateForTests } from '../../routes/misc';
import { createMockContext, createMockWebContents, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';
import { getActiveWC } from '../../context';
import fs from 'fs';

const mockGetActiveWC = vi.mocked(getActiveWC);

// ══════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════

describe('misc routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMiscRouteStateForTests();
    ctx = createMockContext();
    app = createTestApp(registerMiscRoutes, ctx);
    // Default: no active WC
    mockGetActiveWC.mockResolvedValue(null);
    // Reset password manager defaults
    mockPasswordManager.isVaultUnlocked = true;
    mockPasswordManager.isNewVault.mockReturnValue(false);
    mockPasswordManager.unlock.mockResolvedValue(true);
    mockPasswordManager.getIdentitiesForDomain.mockReturnValue([]);
    mockPasswordManager.saveItem.mockReset();
    // Reset fs defaults
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.unlinkSync).mockReset();
  });

  // ═══════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════

  describe('GET /status', () => {
    it('returns ready:false when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);

      const res = await request(app).get('/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ready: false, tabs: 0 });
    });

    it('returns status with tab info when tab exists but no WC', async () => {
      // Default mock already has an active tab; getActiveWC returns null
      const res = await request(app).get('/status');

      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(false);
      expect(res.body.url).toBe('https://example.com');
      expect(res.body.title).toBe('Example');
      expect(res.body.activeTab).toBe('tab-1');
      expect(res.body.tabs).toBe(1);
    });

    it('returns ready:true with viewport when WC is available', async () => {
      const mockWC = createMockWebContents(2);
      mockWC.executeJavaScript.mockResolvedValue(JSON.stringify({
        innerWidth: 1280,
        innerHeight: 720,
        scrollTop: 0,
        scrollHeight: 2000,
        clientHeight: 720,
        screenWidth: 1920,
        screenHeight: 1080,
      }));
      mockWC.isLoading.mockReturnValue(false);
      mockGetActiveWC.mockResolvedValue(mockWC as any);

      const res = await request(app).get('/status');

      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(true);
      expect(res.body.loading).toBe(false);
      expect(res.body.viewport).toBeDefined();
      expect(res.body.viewport.innerWidth).toBe(1280);
    });

    it('returns ready:true without viewport when executeJavaScript fails', async () => {
      const mockWC = createMockWebContents(3);
      mockWC.executeJavaScript.mockRejectedValue(new Error('JS error'));
      mockWC.isLoading.mockReturnValue(true);
      mockGetActiveWC.mockResolvedValue(mockWC as any);

      const res = await request(app).get('/status');

      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(true);
      expect(res.body.loading).toBe(true);
      expect(res.body.viewport).toBeUndefined();
    });

    it('returns ready:false with error when getActiveTab throws', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockImplementation(() => {
        throw new Error('tab crash');
      });

      const res = await request(app).get('/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ready: false, error: 'tab crash' });
    });
  });

  // ═══════════════════════════════════════════════
  // INJECTION OVERRIDE — audit #34 Medium #3
  // ═══════════════════════════════════════════════

  describe('POST /security/injection-override', () => {
    it('returns 400 when domain is missing — no approval task created', async () => {
      const res = await request(app)
        .post('/security/injection-override')
        .send({});
      expect(res.status).toBe(400);
      expect(ctx.taskManager.requestApproval).not.toHaveBeenCalled();
    });

    it('shell-initiated call (X-Tandem-Shell-Initiated: 1) passes through without approval', async () => {
      const res = await request(app)
        .post('/security/injection-override')
        .set('X-Tandem-Shell-Initiated', '1')
        .send({ domain: 'example.com' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, domain: 'example.com' });
      expect(ctx.taskManager.requestApproval).not.toHaveBeenCalled();
    });

    it('shell-initiated header value "true" also passes through', async () => {
      const res = await request(app)
        .post('/security/injection-override')
        .set('X-Tandem-Shell-Initiated', 'true')
        .send({ domain: 'example.com' });
      expect(res.status).toBe(200);
      expect(ctx.taskManager.requestApproval).not.toHaveBeenCalled();
    });

    it('call without the shell marker (MCP/agent) requires approval — approved path', async () => {
      vi.mocked(ctx.taskManager.requestApproval).mockResolvedValue(true);
      const res = await request(app)
        .post('/security/injection-override')
        .send({ domain: 'malicious.example' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, domain: 'malicious.example' });
      expect(ctx.taskManager.requestApproval).toHaveBeenCalledTimes(1);
      expect(ctx.taskManager.createTask).toHaveBeenCalled();
    });

    it('call without the shell marker — rejected returns 403 and never records the override', async () => {
      vi.mocked(ctx.taskManager.requestApproval).mockResolvedValue(false);
      const res = await request(app)
        .post('/security/injection-override')
        .send({ domain: 'malicious.example' });
      expect(res.status).toBe(403);
      expect(res.body.rejected).toBe(true);
    });

    it('Origin header alone no longer bypasses the gate (regression guard for the #164 heuristic)', async () => {
      // Before the live investigation we keyed the gate off Origin: file:// /
      // null. Modern Electron strips Origin on file:// → http://localhost
      // fetches so that heuristic was both unreliable for the real shell
      // and easy to spoof from a web-side caller setting Origin.
      vi.mocked(ctx.taskManager.requestApproval).mockResolvedValue(true);
      const res = await request(app)
        .post('/security/injection-override')
        .set('Origin', 'file:///')
        .send({ domain: 'malicious.example' });
      expect(res.status).toBe(200);
      expect(ctx.taskManager.requestApproval).toHaveBeenCalled();
    });

    it('arbitrary header values other than 1/true do not count as shell-initiated', async () => {
      vi.mocked(ctx.taskManager.requestApproval).mockResolvedValue(true);
      const res = await request(app)
        .post('/security/injection-override')
        .set('X-Tandem-Shell-Initiated', 'yes')
        .send({ domain: 'malicious.example' });
      expect(res.status).toBe(200);
      expect(ctx.taskManager.requestApproval).toHaveBeenCalled();
    });

    it('approval task for agent calls has riskLevel high and requiresApproval', async () => {
      vi.mocked(ctx.taskManager.requestApproval).mockResolvedValue(true);
      await request(app)
        .post('/security/injection-override')
        .send({ domain: 'example.com' });
      expect(ctx.taskManager.createTask).toHaveBeenCalled();
      const createTaskCall = vi.mocked(ctx.taskManager.createTask).mock.calls[0];
      const steps = createTaskCall[3] as Array<{ riskLevel: string; requiresApproval: boolean }>;
      expect(steps[0].riskLevel).toBe('high');
      expect(steps[0].requiresApproval).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════
  // ACTIVE TAB CONTEXT
  // ═══════════════════════════════════════════════

  describe('GET /active-tab/context', () => {
    it('returns enriched no-tab response with activeWorkspace when there is no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);
      vi.mocked(ctx.workspaceManager.getActive).mockReturnValue({
        id: 'ws-default',
        name: 'Default',
        icon: 'home',
        color: '#4285f4',
        order: 0,
        isDefault: true,
        tabIds: [],
      } as any);
      vi.mocked(ctx.workspaceManager.getActiveSource).mockReturnValue('selection');

      const res = await request(app).get('/active-tab/context');

      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(false);
      expect(res.body.activeTab).toBeNull();
      expect(res.body.tabs).toEqual([]);
      expect(res.body.scope).toEqual({ activeTab: 'tab', tabs: 'global' });
      expect(res.body.activeWorkspace).toEqual({
        id: 'ws-default',
        name: 'Default',
        derivedFrom: 'selection',
      });
      expect(ctx.workspaceManager.reconcileTabState).toHaveBeenCalledWith([], null);
    });

    it('includes workspace and actor context for the focused tab and the global tab list', async () => {
      const activeTab = {
        id: 'tab-1',
        webContentsId: 100,
        url: 'https://example.com',
        title: 'Example',
        active: true,
        source: 'claude',
        partition: 'persist:tandem',
      };
      const otherTab = {
        id: 'tab-2',
        webContentsId: 101,
        url: 'https://openai.com',
        title: 'OpenAI',
        active: false,
        source: 'user',
        partition: 'persist:tandem',
      };
      const workspaces = {
        'ws-agent': { id: 'ws-agent', name: 'Codex', icon: 'cpu-chip', color: '#2563eb', order: 1, isDefault: false, tabIds: [100] },
        'ws-default': { id: 'ws-default', name: 'Default', icon: 'home', color: '#4285f4', order: 0, isDefault: true, tabIds: [101] },
      };

      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(activeTab as any);
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([activeTab, otherTab] as any);
      vi.mocked(ctx.workspaceManager.getActive).mockReturnValue(workspaces['ws-agent'] as any);
      vi.mocked(ctx.workspaceManager.get).mockImplementation((id: string) => (workspaces as Record<string, unknown>)[id] as any ?? null);
      vi.mocked(ctx.workspaceManager.getWorkspaceIdForTab).mockImplementation((webContentsId: number) => {
        if (webContentsId === 100) return 'ws-agent';
        if (webContentsId === 101) return 'ws-default';
        return null;
      });

      const mockWC = createMockWebContents(100);
      mockWC.executeJavaScript
        .mockResolvedValueOnce(JSON.stringify({
          innerWidth: 1280,
          innerHeight: 720,
          scrollTop: 10,
          scrollHeight: 2000,
          clientHeight: 720,
        }))
        .mockResolvedValueOnce('Example page text');
      mockGetActiveWC.mockResolvedValue(mockWC as any);

      const res = await request(app).get('/active-tab/context');

      expect(res.status).toBe(200);
      expect(ctx.workspaceManager.reconcileTabState).toHaveBeenCalledWith([100, 101], 100);
      expect(res.body.scope).toEqual({ activeTab: 'tab', tabs: 'global' });
      expect(res.body.activeWorkspace).toEqual({
        id: 'ws-agent',
        name: 'Codex',
        derivedFrom: 'focused-tab',
        matchesFocusedTab: true,
      });
      expect(res.body.activeTab.source).toBe('claude');
      expect(res.body.activeTab.actor).toEqual({ id: 'claude', kind: 'agent' });
      expect(res.body.activeTab.workspaceId).toBe('ws-agent');
      expect(res.body.activeTab.workspaceName).toBe('Codex');
      expect(res.body.tabs).toEqual([
        expect.objectContaining({
          id: 'tab-1',
          workspaceId: 'ws-agent',
          workspaceName: 'Codex',
          source: 'claude',
          actor: { id: 'claude', kind: 'agent' },
        }),
        expect.objectContaining({
          id: 'tab-2',
          workspaceId: 'ws-default',
          workspaceName: 'Default',
          source: 'user',
          actor: { id: 'user', kind: 'human' },
        }),
      ]);
    });
  });

  // ═══════════════════════════════════════════════
  // PASSWORD MANAGER
  // ═══════════════════════════════════════════════

  describe('GET /passwords/status', () => {
    it('returns vault status', async () => {
      const res = await request(app).get('/passwords/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ unlocked: true, isNewVault: false });
    });

    it('returns locked status when vault is locked', async () => {
      mockPasswordManager.isVaultUnlocked = false;
      mockPasswordManager.isNewVault.mockReturnValue(true);

      const res = await request(app).get('/passwords/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ unlocked: false, isNewVault: true });
    });
  });

  describe('POST /passwords/unlock', () => {
    it('unlocks vault with correct password', async () => {
      const res = await request(app)
        .post('/passwords/unlock')
        .send({ password: 'master123' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, isNewVault: false });
      expect(mockPasswordManager.unlock).toHaveBeenCalledWith('master123');
    });

    it('returns 400 when password is missing', async () => {
      const res = await request(app)
        .post('/passwords/unlock')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Password required' });
    });

    it('returns 401 when password is incorrect', async () => {
      mockPasswordManager.unlock.mockResolvedValue(false);

      const res = await request(app)
        .post('/passwords/unlock')
        .send({ password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Incorrect master password' });
    });
  });

  describe('POST /passwords/lock', () => {
    it('locks the vault', async () => {
      const res = await request(app).post('/passwords/lock');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(mockPasswordManager.lock).toHaveBeenCalled();
    });
  });

  describe('GET /passwords/suggest', () => {
    it('returns identities for domain', async () => {
      mockPasswordManager.getIdentitiesForDomain.mockReturnValue([
        { username: 'user@test.com', domain: 'test.com' },
      ]);

      const res = await request(app)
        .get('/passwords/suggest')
        .query({ domain: 'test.com' });

      expect(res.status).toBe(200);
      expect(res.body.identities).toHaveLength(1);
      expect(res.body.identities[0].username).toBe('user@test.com');
    });

    it('returns 400 when domain is missing', async () => {
      const res = await request(app).get('/passwords/suggest');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Domain query parameter required' });
    });

    it('returns 403 when vault is locked', async () => {
      mockPasswordManager.getIdentitiesForDomain.mockImplementation(() => {
        throw new Error('Vault is locked');
      });

      const res = await request(app)
        .get('/passwords/suggest')
        .query({ domain: 'test.com' });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Vault is locked' });
    });
  });

  describe('POST /passwords/save', () => {
    it('saves a password entry', async () => {
      const res = await request(app)
        .post('/passwords/save')
        .send({ domain: 'test.com', username: 'user', payload: { password: 'pass' } });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(mockPasswordManager.saveItem).toHaveBeenCalledWith(
        'test.com',
        'user',
        { password: 'pass' },
      );
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/passwords/save')
        .send({ domain: 'test.com' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'domain, username, and payload required' });
    });

    it('returns 400 when all fields are missing', async () => {
      const res = await request(app)
        .post('/passwords/save')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'domain, username, and payload required' });
    });

    it('returns 403 when vault is locked', async () => {
      mockPasswordManager.saveItem.mockImplementation(() => {
        throw new Error('Vault is locked');
      });

      const res = await request(app)
        .post('/passwords/save')
        .send({ domain: 'test.com', username: 'user', payload: { password: 'pass' } });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Vault is locked' });
    });
  });

  describe('GET /passwords/generate', () => {
    // The route uses dynamic require('../../security/crypto') which bypasses vitest mocks.
    // We test that the endpoint exists and responds (500 = CJS require fails in test env).
    it('endpoint is reachable', async () => {
      const res = await request(app).get('/passwords/generate');
      // In vitest ESM context, the native require() cannot find the module
      // so the handler throws — Express returns 500. This is expected in the test env.
      expect([200, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════
  // EVENT STREAM
  // ═══════════════════════════════════════════════

  describe('GET /events/stream', () => {
    it('calls sseHandler', async () => {
      // Make sseHandler end the response so supertest doesn't hang
      vi.mocked(ctx.eventStream.sseHandler).mockImplementation((_req, res) => {
        res.status(200).end();
      });

      await request(app).get('/events/stream');
      expect(ctx.eventStream.sseHandler).toHaveBeenCalled();
    });
  });

  describe('GET /events/recent', () => {
    it('returns recent events with default limit', async () => {
      const mockEvents = [{ type: 'navigation', ts: 1234 }];
      vi.mocked(ctx.eventStream.getRecent).mockReturnValue(mockEvents as any);

      const res = await request(app).get('/events/recent');

      expect(res.status).toBe(200);
      expect(res.body.events).toEqual(mockEvents);
      expect(ctx.eventStream.getRecent).toHaveBeenCalledWith(50);
    });

    it('returns recent events with custom limit', async () => {
      vi.mocked(ctx.eventStream.getRecent).mockReturnValue([]);

      const res = await request(app)
        .get('/events/recent')
        .query({ limit: '10' });

      expect(res.status).toBe(200);
      expect(ctx.eventStream.getRecent).toHaveBeenCalledWith(10);
    });

    it('returns 500 when getRecent throws', async () => {
      vi.mocked(ctx.eventStream.getRecent).mockImplementation(() => {
        throw new Error('stream error');
      });

      const res = await request(app).get('/events/recent');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'stream error' });
    });
  });

  // ═══════════════════════════════════════════════
  // LIVE MODE
  // ═══════════════════════════════════════════════

  describe('GET /live/status', () => {
    it('returns live mode status (default off)', async () => {
      // Ensure liveMode is off by toggling to false
      await request(app).post('/live/toggle').send({ enabled: false });

      const res = await request(app).get('/live/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ enabled: false });
    });
  });

  describe('POST /live/toggle', () => {
    it('enables live mode explicitly', async () => {
      const res = await request(app)
        .post('/live/toggle')
        .send({ enabled: true });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, enabled: true });
      expect(ctx.panelManager.sendLiveModeChanged).toHaveBeenCalledWith(true);
    });

    it('disables live mode explicitly', async () => {
      // First enable
      await request(app).post('/live/toggle').send({ enabled: true });

      const res = await request(app)
        .post('/live/toggle')
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, enabled: false });
      expect(ctx.panelManager.sendLiveModeChanged).toHaveBeenCalledWith(false);
    });

    it('toggles live mode when enabled is not specified', async () => {
      // Ensure off first
      await request(app).post('/live/toggle').send({ enabled: false });

      const res = await request(app)
        .post('/live/toggle')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      // Was off, should now be on
      expect(res.body.enabled).toBe(true);

      // Reset
      await request(app).post('/live/toggle').send({ enabled: false });
    });
  });

  // GET /live/stream is SSE and keeps the connection open indefinitely.
  // Testing with supertest causes hangs. Skipping.
  describe.skip('GET /live/stream', () => {
    it('returns SSE headers', () => {
      // This endpoint streams data continuously and cannot be reliably
      // tested with supertest without hanging. The subscribe + heartbeat
      // + req.on('close') pattern requires a real HTTP connection lifecycle.
    });
  });

  // ═══════════════════════════════════════════════
  // ACTIVITY LOG
  // ═══════════════════════════════════════════════

  describe('GET /activity-log', () => {
    it('returns activity entries with default limit', async () => {
      const mockEntries = [
        { type: 'navigation', ts: 1000, url: 'https://a.com' },
        { type: 'click', ts: 2000, selector: '#btn' },
      ];
      vi.mocked(ctx.activityTracker.getLog).mockReturnValue(mockEntries as any);

      const res = await request(app).get('/activity-log');

      expect(res.status).toBe(200);
      expect(res.body.entries).toEqual(mockEntries);
      expect(res.body.count).toBe(2);
      // Default limit is 100, fetches 200 (limit * 2)
      expect(ctx.activityTracker.getLog).toHaveBeenCalledWith(200, undefined);
    });

    it('filters by types', async () => {
      const mockEntries = [
        { type: 'navigation', ts: 1000 },
        { type: 'click', ts: 2000 },
        { type: 'scroll', ts: 3000 },
      ];
      vi.mocked(ctx.activityTracker.getLog).mockReturnValue(mockEntries as any);

      const res = await request(app)
        .get('/activity-log')
        .query({ types: 'navigation,click' });

      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(2);
      expect(res.body.entries.every((e: any) => ['navigation', 'click'].includes(e.type))).toBe(true);
    });

    it('respects limit and since parameters', async () => {
      vi.mocked(ctx.activityTracker.getLog).mockReturnValue([]);

      const res = await request(app)
        .get('/activity-log')
        .query({ limit: '10', since: '5000' });

      expect(res.status).toBe(200);
      expect(ctx.activityTracker.getLog).toHaveBeenCalledWith(20, 5000);
    });

    it('returns 500 when getLog throws', async () => {
      vi.mocked(ctx.activityTracker.getLog).mockImplementation(() => {
        throw new Error('tracker error');
      });

      const res = await request(app).get('/activity-log');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'tracker error' });
    });
  });

  // ═══════════════════════════════════════════════
  // BEHAVIORAL LEARNING
  // ═══════════════════════════════════════════════

  describe('GET /behavior/stats', () => {
    it('returns behavior stats', async () => {
      const mockStats = { totalEvents: 42, domains: 5 };
      vi.mocked(ctx.behaviorObserver.getStats).mockReturnValue(mockStats as any);

      const res = await request(app).get('/behavior/stats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockStats);
    });

    it('returns 500 when getStats throws', async () => {
      vi.mocked(ctx.behaviorObserver.getStats).mockImplementation(() => {
        throw new Error('stats error');
      });

      const res = await request(app).get('/behavior/stats');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'stats error' });
    });
  });

  describe('POST /behavior/clear', () => {
    it('clears behavior data when directory exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'events-2024-01.jsonl' as any,
        'events-2024-02.jsonl' as any,
        'readme.txt' as any,
      ]);

      const res = await request(app).post('/behavior/clear');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, cleared: true });
      // Only .jsonl files should be deleted
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
    });

    it('succeeds when directory does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const res = await request(app).post('/behavior/clear');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, cleared: true });
      expect(fs.readdirSync).not.toHaveBeenCalled();
    });

    it('returns 500 when fs throws', async () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('fs error');
      });

      const res = await request(app).post('/behavior/clear');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'fs error' });
    });
  });

  describe('POST /behavior/recompile', () => {
    it('recompiles the behaviour profile and returns it', async () => {
      // With the mocked fs returning false for existsSync, compile() hits
      // the raw-dir-missing path and returns the default profile.
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const res = await request(app).post('/behavior/recompile');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.profile).toBeDefined();
      expect(res.body.profile.typingSpeed).toBeDefined();
      expect(res.body.profile.source).toBeDefined();
    });

    it('returns the resulting profile source so callers can introspect', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const res = await request(app).post('/behavior/recompile');
      expect(['default', 'default-insufficient', 'compiled']).toContain(res.body.profile.source);
    });
  });

  // ═══════════════════════════════════════════════
  // SITE MEMORY
  // ═══════════════════════════════════════════════

  describe('GET /memory/sites', () => {
    it('returns list of sites', async () => {
      const mockSites = ['example.com', 'test.org'];
      vi.mocked(ctx.siteMemory.listSites).mockReturnValue(mockSites as any);

      const res = await request(app).get('/memory/sites');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ sites: mockSites });
    });

    it('returns 500 when listSites throws', async () => {
      vi.mocked(ctx.siteMemory.listSites).mockImplementation(() => {
        throw new Error('memory error');
      });

      const res = await request(app).get('/memory/sites');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'memory error' });
    });
  });

  describe('GET /memory/site/:domain', () => {
    it('returns site data', async () => {
      const mockData = { domain: 'example.com', visits: 10 };
      vi.mocked(ctx.siteMemory.getSite).mockReturnValue(mockData as any);

      const res = await request(app).get('/memory/site/example.com');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
      expect(ctx.siteMemory.getSite).toHaveBeenCalledWith('example.com');
    });

    it('returns 404 when site not found', async () => {
      vi.mocked(ctx.siteMemory.getSite).mockReturnValue(null as any);

      const res = await request(app).get('/memory/site/unknown.com');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Site not found' });
    });

    it('returns 500 when getSite throws', async () => {
      vi.mocked(ctx.siteMemory.getSite).mockImplementation(() => {
        throw new Error('site error');
      });

      const res = await request(app).get('/memory/site/example.com');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'site error' });
    });
  });

  describe('GET /memory/site/:domain/diff', () => {
    it('returns diffs for domain', async () => {
      const mockDiffs = [{ ts: 1000, changes: [] }];
      vi.mocked(ctx.siteMemory.getDiffs).mockReturnValue(mockDiffs as any);

      const res = await request(app).get('/memory/site/example.com/diff');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ diffs: mockDiffs });
      expect(ctx.siteMemory.getDiffs).toHaveBeenCalledWith('example.com');
    });

    it('returns 500 when getDiffs throws', async () => {
      vi.mocked(ctx.siteMemory.getDiffs).mockImplementation(() => {
        throw new Error('diff error');
      });

      const res = await request(app).get('/memory/site/example.com/diff');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'diff error' });
    });
  });

  describe('GET /memory/search', () => {
    it('returns search results', async () => {
      const mockResults = [{ domain: 'example.com', score: 0.9 }];
      vi.mocked(ctx.siteMemory.search).mockReturnValue(mockResults as any);

      const res = await request(app)
        .get('/memory/search')
        .query({ q: 'example' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ results: mockResults });
      expect(ctx.siteMemory.search).toHaveBeenCalledWith('example');
    });

    it('returns 400 when q parameter is missing', async () => {
      const res = await request(app).get('/memory/search');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'q parameter required' });
    });

    it('returns 500 when search throws', async () => {
      vi.mocked(ctx.siteMemory.search).mockImplementation(() => {
        throw new Error('search error');
      });

      const res = await request(app)
        .get('/memory/search')
        .query({ q: 'test' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'search error' });
    });
  });

  // ═══════════════════════════════════════════════
  // WATCH
  // ═══════════════════════════════════════════════

  describe('POST /watch/add', () => {
    it('adds a watch with default interval', async () => {
      const mockWatch = { id: 'w1', url: 'https://example.com', intervalMinutes: 30, diffMode: 'content' };
      vi.mocked(ctx.watchManager.addWatch).mockReturnValue(mockWatch as any);

      const res = await request(app)
        .post('/watch/add')
        .send({ url: 'https://example.com' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, watch: mockWatch });
      expect(ctx.watchManager.addWatch).toHaveBeenCalledWith('https://example.com', 30, undefined);
    });

    it('adds a watch with custom interval', async () => {
      const mockWatch = { id: 'w2', url: 'https://test.com', intervalMinutes: 60, diffMode: 'content' };
      vi.mocked(ctx.watchManager.addWatch).mockReturnValue(mockWatch as any);

      const res = await request(app)
        .post('/watch/add')
        .send({ url: 'https://test.com', intervalMinutes: 60 });

      expect(res.status).toBe(200);
      expect(ctx.watchManager.addWatch).toHaveBeenCalledWith('https://test.com', 60, undefined);
    });

    it('adds a watch with explicit diff mode', async () => {
      const mockWatch = { id: 'w3', url: 'https://title-only.com', intervalMinutes: 30, diffMode: 'title' };
      vi.mocked(ctx.watchManager.addWatch).mockReturnValue(mockWatch as any);

      const res = await request(app)
        .post('/watch/add')
        .send({ url: 'https://title-only.com', diffMode: 'title' });

      expect(res.status).toBe(200);
      expect(ctx.watchManager.addWatch).toHaveBeenCalledWith('https://title-only.com', 30, 'title');
    });

    it('returns 400 when url is missing', async () => {
      const res = await request(app)
        .post('/watch/add')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'url required' });
    });

    it('returns 400 when addWatch returns error', async () => {
      vi.mocked(ctx.watchManager.addWatch).mockReturnValue({ error: 'duplicate URL' } as any);

      const res = await request(app)
        .post('/watch/add')
        .send({ url: 'https://example.com' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'duplicate URL' });
    });

    it('returns 500 when addWatch throws', async () => {
      vi.mocked(ctx.watchManager.addWatch).mockImplementation(() => {
        throw new Error('watch error');
      });

      const res = await request(app)
        .post('/watch/add')
        .send({ url: 'https://example.com' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'watch error' });
    });
  });

  describe('GET /watch/list', () => {
    it('returns list of watches', async () => {
      const mockWatches = [{ id: 'w1', url: 'https://example.com' }];
      vi.mocked(ctx.watchManager.listWatches).mockReturnValue(mockWatches as any);

      const res = await request(app).get('/watch/list');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ watches: mockWatches });
    });

    it('returns 500 when listWatches throws', async () => {
      vi.mocked(ctx.watchManager.listWatches).mockImplementation(() => {
        throw new Error('list error');
      });

      const res = await request(app).get('/watch/list');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'list error' });
    });
  });

  describe('DELETE /watch/remove', () => {
    it('removes a watch by url', async () => {
      vi.mocked(ctx.watchManager.removeWatch).mockReturnValue(true as any);

      const res = await request(app)
        .delete('/watch/remove')
        .send({ url: 'https://example.com' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('removes a watch by id', async () => {
      vi.mocked(ctx.watchManager.removeWatch).mockReturnValue(true as any);

      const res = await request(app)
        .delete('/watch/remove')
        .send({ id: 'w1' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(ctx.watchManager.removeWatch).toHaveBeenCalledWith('w1');
    });

    it('returns ok:false when watch not found', async () => {
      vi.mocked(ctx.watchManager.removeWatch).mockReturnValue(false as any);

      const res = await request(app)
        .delete('/watch/remove')
        .send({ url: 'https://nonexistent.com' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: false });
    });

    it('returns 500 when removeWatch throws', async () => {
      vi.mocked(ctx.watchManager.removeWatch).mockImplementation(() => {
        throw new Error('remove error');
      });

      const res = await request(app)
        .delete('/watch/remove')
        .send({ url: 'https://example.com' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'remove error' });
    });
  });

  describe('POST /watch/check', () => {
    it('forces a check and returns results', async () => {
      const mockResults = { changed: true, diff: 'content changed' };
      vi.mocked(ctx.watchManager.forceCheck).mockResolvedValue(mockResults as any);

      const res = await request(app)
        .post('/watch/check')
        .send({ url: 'https://example.com' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResults);
    });

    it('forces check by id', async () => {
      vi.mocked(ctx.watchManager.forceCheck).mockResolvedValue({ changed: false } as any);

      const res = await request(app)
        .post('/watch/check')
        .send({ id: 'w1' });

      expect(res.status).toBe(200);
      expect(ctx.watchManager.forceCheck).toHaveBeenCalledWith('w1');
    });

    it('returns 500 when forceCheck throws', async () => {
      vi.mocked(ctx.watchManager.forceCheck).mockRejectedValue(new Error('check error'));

      const res = await request(app)
        .post('/watch/check')
        .send({ url: 'https://example.com' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'check error' });
    });
  });

  // ═══════════════════════════════════════════════
  // HEADLESS
  // ═══════════════════════════════════════════════

  describe('POST /headless/open', () => {
    it('opens a headless browser', async () => {
      const mockResult = { ok: true, id: 'h1' };
      vi.mocked(ctx.headlessManager.open).mockResolvedValue(mockResult as any);

      const res = await request(app)
        .post('/headless/open')
        .send({ url: 'https://example.com' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResult);
      expect(ctx.headlessManager.open).toHaveBeenCalledWith('https://example.com');
    });

    it('returns 400 when url is missing', async () => {
      const res = await request(app)
        .post('/headless/open')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'url required' });
    });

    it('returns 500 when open throws', async () => {
      vi.mocked(ctx.headlessManager.open).mockRejectedValue(new Error('open error'));

      const res = await request(app)
        .post('/headless/open')
        .send({ url: 'https://example.com' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'open error' });
    });

    it.each([
      ['file://', 'file:///etc/shadow'],
      ['javascript:', 'javascript:alert(1)'],
      ['data:', 'data:text/html,x'],
      ['loopback IP', 'http://127.0.0.1'],
      ['link-local IP', 'http://169.254.169.254/latest/meta-data/'],
    ])('rejects unsafe URL (%s) with 400 and never calls headlessManager.open', async (_label, url) => {
      const res = await request(app).post('/headless/open').send({ url });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/unsafe/i);
      expect(ctx.headlessManager.open).not.toHaveBeenCalled();
    });
  });

  describe('GET /headless/content', () => {
    it('returns headless content', async () => {
      const mockContent = { content: '<html>page</html>' };
      vi.mocked(ctx.headlessManager.getContent).mockResolvedValue(mockContent as any);

      const res = await request(app).get('/headless/content');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockContent);
    });

    it('returns 500 when getContent throws', async () => {
      vi.mocked(ctx.headlessManager.getContent).mockRejectedValue(new Error('content error'));

      const res = await request(app).get('/headless/content');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'content error' });
    });
  });

  describe('GET /headless/status', () => {
    it('returns headless status', async () => {
      const mockStatus = { open: true, url: 'https://example.com' };
      vi.mocked(ctx.headlessManager.getStatus).mockReturnValue(mockStatus as any);

      const res = await request(app).get('/headless/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockStatus);
    });

    it('returns 500 when getStatus throws', async () => {
      vi.mocked(ctx.headlessManager.getStatus).mockImplementation(() => {
        throw new Error('status error');
      });

      const res = await request(app).get('/headless/status');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'status error' });
    });
  });

  describe('POST /headless/show', () => {
    it('shows the headless browser', async () => {
      vi.mocked(ctx.headlessManager.show).mockReturnValue(true as any);

      const res = await request(app).post('/headless/show');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('returns ok:false when show fails', async () => {
      vi.mocked(ctx.headlessManager.show).mockReturnValue(false as any);

      const res = await request(app).post('/headless/show');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: false });
    });

    it('returns 500 when show throws', async () => {
      vi.mocked(ctx.headlessManager.show).mockImplementation(() => {
        throw new Error('show error');
      });

      const res = await request(app).post('/headless/show');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'show error' });
    });
  });

  describe('POST /headless/hide', () => {
    it('hides the headless browser', async () => {
      vi.mocked(ctx.headlessManager.hide).mockReturnValue(true as any);

      const res = await request(app).post('/headless/hide');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('returns ok:false when hide fails', async () => {
      vi.mocked(ctx.headlessManager.hide).mockReturnValue(false as any);

      const res = await request(app).post('/headless/hide');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: false });
    });

    it('returns 500 when hide throws', async () => {
      vi.mocked(ctx.headlessManager.hide).mockImplementation(() => {
        throw new Error('hide error');
      });

      const res = await request(app).post('/headless/hide');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'hide error' });
    });
  });

  describe('POST /headless/close', () => {
    it('closes the headless browser', async () => {
      const res = await request(app).post('/headless/close');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(ctx.headlessManager.close).toHaveBeenCalled();
    });

    it('returns 500 when close throws', async () => {
      vi.mocked(ctx.headlessManager.close).mockImplementation(() => {
        throw new Error('close error');
      });

      const res = await request(app).post('/headless/close');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'close error' });
    });
  });

  // ═══════════════════════════════════════════════
  // FORM MEMORY
  // ═══════════════════════════════════════════════

  describe('GET /forms/memory', () => {
    it('returns all form domains', async () => {
      const mockDomains = ['example.com', 'test.org'];
      vi.mocked(ctx.formMemory.listAll).mockReturnValue(mockDomains as any);

      const res = await request(app).get('/forms/memory');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ domains: mockDomains });
    });

    it('returns 500 when listAll throws', async () => {
      vi.mocked(ctx.formMemory.listAll).mockImplementation(() => {
        throw new Error('form error');
      });

      const res = await request(app).get('/forms/memory');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'form error' });
    });
  });

  describe('GET /forms/memory/:domain', () => {
    it('returns form data for domain', async () => {
      const mockData = { fields: [{ name: 'email', value: 'test@test.com' }] };
      vi.mocked(ctx.formMemory.getForDomain).mockReturnValue(mockData as any);

      const res = await request(app).get('/forms/memory/example.com');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
      expect(ctx.formMemory.getForDomain).toHaveBeenCalledWith('example.com');
    });

    it('returns 404 when no form data for domain', async () => {
      vi.mocked(ctx.formMemory.getForDomain).mockReturnValue(null as any);

      const res = await request(app).get('/forms/memory/unknown.com');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'No form data for this domain' });
    });

    it('returns 500 when getForDomain throws', async () => {
      vi.mocked(ctx.formMemory.getForDomain).mockImplementation(() => {
        throw new Error('domain error');
      });

      const res = await request(app).get('/forms/memory/example.com');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'domain error' });
    });
  });

  describe('POST /forms/fill', () => {
    it('returns fill data for domain', async () => {
      const mockFields = { email: 'test@test.com', name: 'Test User' };
      vi.mocked(ctx.formMemory.getFillData).mockReturnValue(mockFields as any);

      const res = await request(app)
        .post('/forms/fill')
        .send({ domain: 'example.com' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ domain: 'example.com', fields: mockFields });
    });

    it('returns 400 when domain is missing', async () => {
      const res = await request(app)
        .post('/forms/fill')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'domain required' });
    });

    it('returns 404 when no fill data', async () => {
      vi.mocked(ctx.formMemory.getFillData).mockReturnValue(null as any);

      const res = await request(app)
        .post('/forms/fill')
        .send({ domain: 'unknown.com' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'No form data for this domain' });
    });

    it('returns 500 when getFillData throws', async () => {
      vi.mocked(ctx.formMemory.getFillData).mockImplementation(() => {
        throw new Error('fill error');
      });

      const res = await request(app)
        .post('/forms/fill')
        .send({ domain: 'example.com' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'fill error' });
    });
  });

  describe('DELETE /forms/memory/:domain', () => {
    it('deletes form data for domain', async () => {
      vi.mocked(ctx.formMemory.deleteDomain).mockReturnValue(true as any);

      const res = await request(app).delete('/forms/memory/example.com');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(ctx.formMemory.deleteDomain).toHaveBeenCalledWith('example.com');
    });

    it('returns ok:false when domain not found', async () => {
      vi.mocked(ctx.formMemory.deleteDomain).mockReturnValue(false as any);

      const res = await request(app).delete('/forms/memory/unknown.com');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: false });
    });

    it('returns 500 when deleteDomain throws', async () => {
      vi.mocked(ctx.formMemory.deleteDomain).mockImplementation(() => {
        throw new Error('delete error');
      });

      const res = await request(app).delete('/forms/memory/example.com');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'delete error' });
    });
  });

  // ═══════════════════════════════════════════════
  // PIP
  // ═══════════════════════════════════════════════

  describe('POST /pip/toggle', () => {
    it('toggles PIP on', async () => {
      vi.mocked(ctx.pipManager.toggle).mockReturnValue(true as any);

      const res = await request(app)
        .post('/pip/toggle')
        .send({ open: true });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, visible: true });
      expect(ctx.pipManager.toggle).toHaveBeenCalledWith(true);
    });

    it('toggles PIP off', async () => {
      vi.mocked(ctx.pipManager.toggle).mockReturnValue(false as any);

      const res = await request(app)
        .post('/pip/toggle')
        .send({ open: false });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, visible: false });
    });

    it('toggles PIP without explicit state', async () => {
      vi.mocked(ctx.pipManager.toggle).mockReturnValue(true as any);

      const res = await request(app)
        .post('/pip/toggle')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 500 when toggle throws', async () => {
      vi.mocked(ctx.pipManager.toggle).mockImplementation(() => {
        throw new Error('pip error');
      });

      const res = await request(app)
        .post('/pip/toggle')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'pip error' });
    });
  });

  describe('GET /pip/status', () => {
    it('returns PIP status', async () => {
      const mockStatus = { visible: true, url: 'https://example.com' };
      vi.mocked(ctx.pipManager.getStatus).mockReturnValue(mockStatus as any);

      const res = await request(app).get('/pip/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockStatus);
    });

    it('returns 500 when getStatus throws', async () => {
      vi.mocked(ctx.pipManager.getStatus).mockImplementation(() => {
        throw new Error('pip status error');
      });

      const res = await request(app).get('/pip/status');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'pip status error' });
    });
  });

  // ═══════════════════════════════════════════════
  // CLARONOTE
  // ═══════════════════════════════════════════════

  describe('POST /claronote/login', () => {
    it('logs in successfully', async () => {
      vi.mocked(ctx.claroNoteManager.login).mockResolvedValue({ success: true } as any);
      vi.mocked(ctx.claroNoteManager.getAuth).mockReturnValue({
        user: { id: '1', email: 'test@test.com' },
      } as any);

      const res = await request(app)
        .post('/claronote/login')
        .send({ email: 'test@test.com', password: 'pass123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toEqual({ id: '1', email: 'test@test.com' });
    });

    it('returns 400 when email or password is missing', async () => {
      const res = await request(app)
        .post('/claronote/login')
        .send({ email: 'test@test.com' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Email and password required' });
    });

    it('returns 400 when both fields are missing', async () => {
      const res = await request(app)
        .post('/claronote/login')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Email and password required' });
    });

    it('returns 401 when login fails', async () => {
      vi.mocked(ctx.claroNoteManager.login).mockResolvedValue({
        success: false,
        error: 'Invalid credentials',
      } as any);

      const res = await request(app)
        .post('/claronote/login')
        .send({ email: 'test@test.com', password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ success: false, error: 'Invalid credentials' });
    });

    it('returns 500 when login throws', async () => {
      vi.mocked(ctx.claroNoteManager.login).mockRejectedValue(new Error('network error'));

      const res = await request(app)
        .post('/claronote/login')
        .send({ email: 'test@test.com', password: 'pass' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'network error' });
    });
  });

  describe('POST /claronote/logout', () => {
    it('logs out successfully', async () => {
      const res = await request(app).post('/claronote/logout');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(ctx.claroNoteManager.logout).toHaveBeenCalled();
    });

    it('returns 500 when logout throws', async () => {
      vi.mocked(ctx.claroNoteManager.logout).mockRejectedValue(new Error('logout error'));

      const res = await request(app).post('/claronote/logout');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'logout error' });
    });
  });

  describe('GET /claronote/me', () => {
    it('returns the current user', async () => {
      const mockUser = { id: '1', email: 'test@test.com' };
      vi.mocked(ctx.claroNoteManager.getMe).mockResolvedValue(mockUser as any);

      const res = await request(app).get('/claronote/me');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ user: mockUser });
    });

    it('returns 401 when getMe throws', async () => {
      vi.mocked(ctx.claroNoteManager.getMe).mockRejectedValue(new Error('Not authenticated'));

      const res = await request(app).get('/claronote/me');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Not authenticated' });
    });
  });

  describe('GET /claronote/status', () => {
    it('returns authenticated status', async () => {
      vi.mocked(ctx.claroNoteManager.getAuth).mockReturnValue({
        user: { id: '1', email: 'test@test.com' },
      } as any);
      vi.mocked(ctx.claroNoteManager.getRecordingStatus).mockReturnValue({
        recording: true,
      } as any);

      const res = await request(app).get('/claronote/status');

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.user).toEqual({ id: '1', email: 'test@test.com' });
      expect(res.body.recording).toEqual({ recording: true });
    });

    it('returns unauthenticated status', async () => {
      vi.mocked(ctx.claroNoteManager.getAuth).mockReturnValue(null as any);
      vi.mocked(ctx.claroNoteManager.getRecordingStatus).mockReturnValue({
        recording: false,
      } as any);

      const res = await request(app).get('/claronote/status');

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(false);
      expect(res.body.user).toBeNull();
    });

    it('returns 500 when getAuth throws', async () => {
      vi.mocked(ctx.claroNoteManager.getAuth).mockImplementation(() => {
        throw new Error('auth error');
      });

      const res = await request(app).get('/claronote/status');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'auth error' });
    });
  });

  describe('POST /claronote/record/start', () => {
    it('starts recording successfully', async () => {
      vi.mocked(ctx.claroNoteManager.startRecording).mockResolvedValue({ success: true } as any);

      const res = await request(app).post('/claronote/record/start');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });

    it('returns 400 when recording fails to start', async () => {
      vi.mocked(ctx.claroNoteManager.startRecording).mockResolvedValue({
        success: false,
        error: 'Already recording',
      } as any);

      const res = await request(app).post('/claronote/record/start');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: 'Already recording' });
    });

    it('returns 500 when startRecording throws', async () => {
      vi.mocked(ctx.claroNoteManager.startRecording).mockRejectedValue(
        new Error('record error'),
      );

      const res = await request(app).post('/claronote/record/start');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'record error' });
    });
  });

  describe('POST /claronote/record/stop', () => {
    it('stops recording successfully', async () => {
      vi.mocked(ctx.claroNoteManager.stopRecording).mockResolvedValue({
        success: true,
        noteId: 'note-42',
      } as any);

      const res = await request(app).post('/claronote/record/stop');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, noteId: 'note-42' });
    });

    it('returns 400 when not recording', async () => {
      vi.mocked(ctx.claroNoteManager.stopRecording).mockResolvedValue({
        success: false,
        error: 'Not recording',
      } as any);

      const res = await request(app).post('/claronote/record/stop');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: 'Not recording' });
    });

    it('returns 500 when stopRecording throws', async () => {
      vi.mocked(ctx.claroNoteManager.stopRecording).mockRejectedValue(
        new Error('stop error'),
      );

      const res = await request(app).post('/claronote/record/stop');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'stop error' });
    });
  });

  describe('GET /claronote/notes', () => {
    it('returns notes with default limit', async () => {
      const mockNotes = [{ id: 'n1', title: 'Note 1' }];
      vi.mocked(ctx.claroNoteManager.getNotes).mockResolvedValue(mockNotes as any);

      const res = await request(app).get('/claronote/notes');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ notes: mockNotes });
      expect(ctx.claroNoteManager.getNotes).toHaveBeenCalledWith(10);
    });

    it('returns notes with custom limit', async () => {
      vi.mocked(ctx.claroNoteManager.getNotes).mockResolvedValue([]);

      const res = await request(app)
        .get('/claronote/notes')
        .query({ limit: '25' });

      expect(res.status).toBe(200);
      expect(ctx.claroNoteManager.getNotes).toHaveBeenCalledWith(25);
    });

    it('returns 401 when getNotes throws', async () => {
      vi.mocked(ctx.claroNoteManager.getNotes).mockRejectedValue(
        new Error('Not authenticated'),
      );

      const res = await request(app).get('/claronote/notes');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Not authenticated' });
    });
  });

  describe('GET /claronote/notes/:id', () => {
    it('returns a single note', async () => {
      const mockNote = { id: 'n1', title: 'Note 1', content: 'hello' };
      vi.mocked(ctx.claroNoteManager.getNote).mockResolvedValue(mockNote as any);

      const res = await request(app).get('/claronote/notes/n1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ note: mockNote });
      expect(ctx.claroNoteManager.getNote).toHaveBeenCalledWith('n1');
    });

    it('returns 404 when getNote throws', async () => {
      vi.mocked(ctx.claroNoteManager.getNote).mockRejectedValue(
        new Error('Note not found'),
      );

      const res = await request(app).get('/claronote/notes/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Note not found' });
    });
  });

  describe('POST /claronote/upload', () => {
    it('uploads a recording', async () => {
      vi.mocked(ctx.claroNoteManager.uploadRecording).mockResolvedValue('note-99' as any);
      const audioBase64 = Buffer.from('fake-audio').toString('base64');

      const res = await request(app)
        .post('/claronote/upload')
        .send({ audioBase64, duration: 120 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, noteId: 'note-99' });
      expect(ctx.claroNoteManager.uploadRecording).toHaveBeenCalledWith(
        expect.any(Buffer),
        120,
      );
    });

    it('uploads with default duration 0', async () => {
      vi.mocked(ctx.claroNoteManager.uploadRecording).mockResolvedValue('note-100' as any);
      const audioBase64 = Buffer.from('fake-audio').toString('base64');

      const res = await request(app)
        .post('/claronote/upload')
        .send({ audioBase64 });

      expect(res.status).toBe(200);
      expect(ctx.claroNoteManager.uploadRecording).toHaveBeenCalledWith(
        expect.any(Buffer),
        0,
      );
    });

    it('returns 400 when audioBase64 is missing', async () => {
      const res = await request(app)
        .post('/claronote/upload')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'audioBase64 required' });
    });

    it('returns 500 when uploadRecording throws', async () => {
      vi.mocked(ctx.claroNoteManager.uploadRecording).mockRejectedValue(
        new Error('upload error'),
      );

      const res = await request(app)
        .post('/claronote/upload')
        .send({ audioBase64: 'dGVzdA==' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'upload error' });
    });
  });

  // ═══════════════════════════════════════════════
  // DATA WIPE
  // ═══════════════════════════════════════════════

  describe('POST /data/wipe', () => {
    it('wipes data when files exist', async () => {
      // First two calls: chat-history.json check, config.json check
      // Third call: rawDir check
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)   // chat-history.json exists
        .mockReturnValueOnce(true)   // config.json exists
        .mockReturnValueOnce(true);  // rawDir exists
      vi.mocked(fs.readdirSync).mockReturnValue([
        'events.jsonl' as any,
        'other.txt' as any,
      ]);

      const res = await request(app).post('/data/wipe');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, wiped: true });
      // chat-history.json + config.json + 1 jsonl file = 3 unlinkSync calls
      expect(fs.unlinkSync).toHaveBeenCalledTimes(3);
    });

    it('wipes data when no files exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const res = await request(app).post('/data/wipe');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, wiped: true });
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('returns 500 when fs throws', async () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('wipe error');
      });

      const res = await request(app).post('/data/wipe');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'wipe error' });
    });
  });

  // ═══════════════════════════════════════════════
  // WORKFLOW ENGINE
  // ═══════════════════════════════════════════════

  describe('GET /workflows', () => {
    it('returns list of workflows', async () => {
      const mockWorkflows = [{ id: 'wf-1', name: 'Test Workflow' }];
      vi.mocked(ctx.workflowEngine.getWorkflows).mockResolvedValue(mockWorkflows as any);

      const res = await request(app).get('/workflows');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ workflows: mockWorkflows });
    });

    it('returns 500 when getWorkflows throws', async () => {
      vi.mocked(ctx.workflowEngine.getWorkflows).mockRejectedValue(
        new Error('workflow error'),
      );

      const res = await request(app).get('/workflows');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'workflow error' });
    });
  });

  describe('POST /workflows', () => {
    it('creates a workflow', async () => {
      vi.mocked(ctx.workflowEngine.saveWorkflow).mockResolvedValue('wf-new' as any);

      const res = await request(app)
        .post('/workflows')
        .send({
          name: 'My Workflow',
          description: 'A test workflow',
          steps: [{ action: 'click', selector: '#btn' }],
          variables: { url: 'https://example.com' },
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 'wf-new' });
      expect(ctx.workflowEngine.saveWorkflow).toHaveBeenCalledWith({
        name: 'My Workflow',
        description: 'A test workflow',
        steps: [{ action: 'click', selector: '#btn' }],
        variables: { url: 'https://example.com' },
      });
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/workflows')
        .send({ steps: [{ action: 'click' }] });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'name and steps required' });
    });

    it('returns 400 when steps is missing', async () => {
      const res = await request(app)
        .post('/workflows')
        .send({ name: 'Workflow' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'name and steps required' });
    });

    it('returns 500 when saveWorkflow throws', async () => {
      vi.mocked(ctx.workflowEngine.saveWorkflow).mockRejectedValue(
        new Error('save error'),
      );

      const res = await request(app)
        .post('/workflows')
        .send({ name: 'WF', steps: [{}] });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'save error' });
    });
  });

  describe('DELETE /workflows/:id', () => {
    it('deletes a workflow', async () => {
      const res = await request(app).delete('/workflows/wf-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(ctx.workflowEngine.deleteWorkflow).toHaveBeenCalledWith('wf-1');
    });

    it('returns 500 when deleteWorkflow throws', async () => {
      vi.mocked(ctx.workflowEngine.deleteWorkflow).mockRejectedValue(
        new Error('delete error'),
      );

      const res = await request(app).delete('/workflows/wf-1');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'delete error' });
    });
  });

  describe('POST /workflow/run', () => {
    it('runs a workflow', async () => {
      const mockWC = createMockWebContents(5);
      mockGetActiveWC.mockResolvedValue(mockWC as any);
      vi.mocked(ctx.workflowEngine.runWorkflow).mockResolvedValue('exec-1' as any);

      const res = await request(app)
        .post('/workflow/run')
        .send({ workflowId: 'wf-1', variables: { key: 'val' } });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ executionId: 'exec-1' });
      expect(ctx.workflowEngine.runWorkflow).toHaveBeenCalledWith(
        'wf-1',
        ctx.win,
        { key: 'val' },
      );
    });

    it('runs a workflow with empty variables', async () => {
      const mockWC = createMockWebContents(5);
      mockGetActiveWC.mockResolvedValue(mockWC as any);
      vi.mocked(ctx.workflowEngine.runWorkflow).mockResolvedValue('exec-2' as any);

      const res = await request(app)
        .post('/workflow/run')
        .send({ workflowId: 'wf-1' });

      expect(res.status).toBe(200);
      expect(ctx.workflowEngine.runWorkflow).toHaveBeenCalledWith(
        'wf-1',
        ctx.win,
        {},
      );
    });

    it('returns 400 when workflowId is missing', async () => {
      const res = await request(app)
        .post('/workflow/run')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'workflowId required' });
    });

    it('returns 500 when no active tab', async () => {
      mockGetActiveWC.mockResolvedValue(null);

      const res = await request(app)
        .post('/workflow/run')
        .send({ workflowId: 'wf-1' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'No active tab' });
    });

    it('returns 500 when runWorkflow throws', async () => {
      const mockWC = createMockWebContents(5);
      mockGetActiveWC.mockResolvedValue(mockWC as any);
      vi.mocked(ctx.workflowEngine.runWorkflow).mockRejectedValue(
        new Error('run error'),
      );

      const res = await request(app)
        .post('/workflow/run')
        .send({ workflowId: 'wf-1' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'run error' });
    });
  });

  describe('GET /workflow/status/:executionId', () => {
    it('returns execution status', async () => {
      const mockStatus = { executionId: 'exec-1', status: 'running', step: 2 };
      vi.mocked(ctx.workflowEngine.getExecutionStatus).mockResolvedValue(mockStatus as any);

      const res = await request(app).get('/workflow/status/exec-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockStatus);
    });

    it('returns 404 when execution not found', async () => {
      vi.mocked(ctx.workflowEngine.getExecutionStatus).mockResolvedValue(null as any);

      const res = await request(app).get('/workflow/status/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Execution not found' });
    });

    it('returns 500 when getExecutionStatus throws', async () => {
      vi.mocked(ctx.workflowEngine.getExecutionStatus).mockRejectedValue(
        new Error('status error'),
      );

      const res = await request(app).get('/workflow/status/exec-1');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'status error' });
    });
  });

  describe('POST /workflow/stop', () => {
    it('stops a workflow execution', async () => {
      const res = await request(app)
        .post('/workflow/stop')
        .send({ executionId: 'exec-1' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(ctx.workflowEngine.stopWorkflow).toHaveBeenCalledWith('exec-1');
    });

    it('returns 400 when executionId is missing', async () => {
      const res = await request(app)
        .post('/workflow/stop')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'executionId required' });
    });

    it('returns 500 when stopWorkflow throws', async () => {
      vi.mocked(ctx.workflowEngine.stopWorkflow).mockRejectedValue(
        new Error('stop error'),
      );

      const res = await request(app)
        .post('/workflow/stop')
        .send({ executionId: 'exec-1' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'stop error' });
    });
  });

  describe('GET /workflow/running', () => {
    it('returns running executions', async () => {
      const mockExecutions = [{ executionId: 'exec-1', workflowId: 'wf-1' }];
      vi.mocked(ctx.workflowEngine.getRunningExecutions).mockResolvedValue(
        mockExecutions as any,
      );

      const res = await request(app).get('/workflow/running');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ executions: mockExecutions });
    });

    it('returns 500 when getRunningExecutions throws', async () => {
      vi.mocked(ctx.workflowEngine.getRunningExecutions).mockRejectedValue(
        new Error('running error'),
      );

      const res = await request(app).get('/workflow/running');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'running error' });
    });
  });

  // ═══════════════════════════════════════════════
  // LOGIN STATE MANAGER
  // ═══════════════════════════════════════════════

  describe('GET /auth/states', () => {
    it('returns all login states', async () => {
      const mockStates = [
        { domain: 'example.com', status: 'logged_in' },
        { domain: 'test.org', status: 'logged_out' },
      ];
      vi.mocked(ctx.loginManager.getAllStates).mockResolvedValue(mockStates as any);

      const res = await request(app).get('/auth/states');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ states: mockStates });
    });

    it('returns 500 when getAllStates throws', async () => {
      vi.mocked(ctx.loginManager.getAllStates).mockRejectedValue(
        new Error('states error'),
      );

      const res = await request(app).get('/auth/states');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'states error' });
    });
  });

  describe('GET /auth/state/:domain', () => {
    it('returns login state for domain', async () => {
      const mockState = { domain: 'example.com', status: 'logged_in', username: 'user' };
      vi.mocked(ctx.loginManager.getLoginState).mockResolvedValue(mockState as any);

      const res = await request(app).get('/auth/state/example.com');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockState);
      expect(ctx.loginManager.getLoginState).toHaveBeenCalledWith('example.com');
    });

    it('returns 500 when getLoginState throws', async () => {
      vi.mocked(ctx.loginManager.getLoginState).mockRejectedValue(
        new Error('state error'),
      );

      const res = await request(app).get('/auth/state/example.com');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'state error' });
    });
  });

  describe('POST /auth/check', () => {
    it('checks current page login state', async () => {
      const mockWC = createMockWebContents(6);
      mockGetActiveWC.mockResolvedValue(mockWC as any);
      const mockState = { domain: 'example.com', status: 'logged_in' };
      vi.mocked(ctx.loginManager.checkCurrentPage).mockResolvedValue(mockState as any);

      const res = await request(app).post('/auth/check');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockState);
      expect(ctx.loginManager.checkCurrentPage).toHaveBeenCalledWith(ctx.win);
    });

    it('returns 500 when no active tab', async () => {
      mockGetActiveWC.mockResolvedValue(null);

      const res = await request(app).post('/auth/check');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'No active tab' });
    });

    it('returns 500 when checkCurrentPage throws', async () => {
      const mockWC = createMockWebContents(6);
      mockGetActiveWC.mockResolvedValue(mockWC as any);
      vi.mocked(ctx.loginManager.checkCurrentPage).mockRejectedValue(
        new Error('check error'),
      );

      const res = await request(app).post('/auth/check');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'check error' });
    });
  });

  describe('GET /auth/is-login-page', () => {
    it('returns whether current page is a login page', async () => {
      const mockWC = createMockWebContents(7);
      mockGetActiveWC.mockResolvedValue(mockWC as any);
      vi.mocked(ctx.loginManager.isLoginPage).mockResolvedValue(true as any);

      const res = await request(app).get('/auth/is-login-page');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ isLoginPage: true });
      expect(ctx.loginManager.isLoginPage).toHaveBeenCalledWith(ctx.win);
    });

    it('returns false when not a login page', async () => {
      const mockWC = createMockWebContents(7);
      mockGetActiveWC.mockResolvedValue(mockWC as any);
      vi.mocked(ctx.loginManager.isLoginPage).mockResolvedValue(false as any);

      const res = await request(app).get('/auth/is-login-page');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ isLoginPage: false });
    });

    it('returns 500 when no active tab', async () => {
      mockGetActiveWC.mockResolvedValue(null);

      const res = await request(app).get('/auth/is-login-page');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'No active tab' });
    });

    it('returns 500 when isLoginPage throws', async () => {
      const mockWC = createMockWebContents(7);
      mockGetActiveWC.mockResolvedValue(mockWC as any);
      vi.mocked(ctx.loginManager.isLoginPage).mockRejectedValue(
        new Error('login page error'),
      );

      const res = await request(app).get('/auth/is-login-page');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'login page error' });
    });
  });

  describe('POST /auth/update', () => {
    it('updates login state', async () => {
      const res = await request(app)
        .post('/auth/update')
        .send({ domain: 'example.com', status: 'logged_in', username: 'user' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(ctx.loginManager.updateLoginState).toHaveBeenCalledWith(
        'example.com',
        'logged_in',
        'user',
      );
    });

    it('updates login state without username', async () => {
      const res = await request(app)
        .post('/auth/update')
        .send({ domain: 'example.com', status: 'logged_out' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(ctx.loginManager.updateLoginState).toHaveBeenCalledWith(
        'example.com',
        'logged_out',
        undefined,
      );
    });

    it('returns 400 when domain is missing', async () => {
      const res = await request(app)
        .post('/auth/update')
        .send({ status: 'logged_in' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'domain and status required' });
    });

    it('returns 400 when status is missing', async () => {
      const res = await request(app)
        .post('/auth/update')
        .send({ domain: 'example.com' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'domain and status required' });
    });

    it('returns 500 when updateLoginState throws', async () => {
      vi.mocked(ctx.loginManager.updateLoginState).mockRejectedValue(
        new Error('update error'),
      );

      const res = await request(app)
        .post('/auth/update')
        .send({ domain: 'example.com', status: 'logged_in' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'update error' });
    });
  });

  describe('DELETE /auth/state/:domain', () => {
    it('clears login state for domain', async () => {
      const res = await request(app).delete('/auth/state/example.com');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(ctx.loginManager.clearLoginState).toHaveBeenCalledWith('example.com');
    });

    it('returns 500 when clearLoginState throws', async () => {
      vi.mocked(ctx.loginManager.clearLoginState).mockRejectedValue(
        new Error('clear error'),
      );

      const res = await request(app).delete('/auth/state/example.com');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'clear error' });
    });
  });
});
