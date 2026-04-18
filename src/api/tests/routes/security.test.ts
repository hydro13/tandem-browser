import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ── External mocks (must precede imports that reference them) ───

vi.mock('../../../utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { registerSecurityRoutes } from '../../../security/routes';

// ── Mock factory ────────────────────────────────────────────────

function createMockSecurityManager() {
  const guardian = {
    getStatus: vi.fn().mockReturnValue({ mode: 'balanced', blocks: 0, passes: 0 }),
    setMode: vi.fn(),
  };

  const shield = {
    getStats: vi.fn().mockReturnValue({ total: 0, blocked: 0 }),
    checkDomain: vi.fn().mockReturnValue({ blocked: false, reason: null }),
    checkUrl: vi.fn().mockReturnValue({ blocked: false, reason: null }),
  };

  const outboundGuard = {
    getStats: vi.fn().mockReturnValue({ blocked: 0, allowed: 0, flagged: 0 }),
  };

  const db = {
    getEventCount: vi.fn().mockReturnValue(0),
    getDomainCount: vi.fn().mockReturnValue(0),
    getScriptFingerprintCount: vi.fn().mockReturnValue(0),
    getRecentEvents: vi.fn().mockReturnValue([]),
    getDomains: vi.fn().mockReturnValue([]),
    getDomainInfo: vi.fn().mockReturnValue(null),
    upsertDomain: vi.fn(),
    getBlocklistStats: vi.fn().mockReturnValue({}),
    addWhitelistPair: vi.fn(),
    getBaselinesByDomain: vi.fn().mockReturnValue([]),
    getRecentAnomalies: vi.fn().mockReturnValue([]),
    getOpenZeroDayCandidates: vi.fn().mockReturnValue([]),
    resolveZeroDayCandidate: vi.fn().mockReturnValue(true),
    getWidespreadScripts: vi.fn().mockReturnValue([]),
    getDomainsForHash: vi.fn().mockReturnValue([]),
    getWidespreadAstScripts: vi.fn().mockReturnValue([]),
    getAstMatches: vi.fn().mockReturnValue([]),
    getCrossDomainScriptCount: vi.fn().mockReturnValue(0),
    getScriptsByDomain: vi.fn().mockReturnValue([]),
    getTrustChanges: vi.fn().mockReturnValue([]),
    pruneOldEvents: vi.fn().mockReturnValue(5),
  };

  const scriptGuard = {
    getScriptsParsed: vi.fn().mockReturnValue(new Map()),
    getRecentWasmCount: vi.fn().mockReturnValue(0),
  };

  const contentAnalyzer = {
    analyzePage: vi.fn().mockResolvedValue({
      forms: [],
      trackers: [],
      security: { hasPasswordOnHttp: false },
      riskScore: 0,
    }),
  };

  const behaviorMonitor = {
    getResourceSnapshots: vi.fn().mockReturnValue([]),
    getPermissionLog: vi.fn().mockReturnValue([]),
    killScript: vi.fn().mockResolvedValue(true),
  };

  const gatekeeperWs = {
    getStatus: vi.fn().mockReturnValue({ connected: true, pendingDecisions: 0, totalDecisions: 0 }),
    getQueue: vi.fn().mockReturnValue([]),
    submitRestDecision: vi.fn().mockReturnValue(true),
    getHistory: vi.fn().mockReturnValue([]),
    getSecret: vi.fn().mockReturnValue('test-secret'),
  };

  const threatIntel = {
    generateReport: vi.fn().mockReturnValue({ period: 'day', events: 0 }),
  };

  const blocklistUpdater = {
    update: vi.fn().mockResolvedValue({ updated: true }),
    getSourceStatuses: vi.fn().mockReturnValue([
      {
        name: 'urlhaus',
        category: 'malware',
        refreshTier: 'hourly',
        refreshIntervalMs: 3_600_000,
        lastUpdated: null,
        lastAttempted: null,
        lastError: null,
        consecutiveFailures: 0,
        nextDueAt: null,
        due: true,
      },
    ]),
  };

  const analyzerManager = {
    getStatus: vi.fn().mockReturnValue([]),
  };

  const devToolsManager = {
    getAttachedWebContents: vi.fn().mockReturnValue(null),
  };

  return {
    sm: {
      getGuardian: vi.fn().mockReturnValue(guardian),
      getShield: vi.fn().mockReturnValue(shield),
      getOutboundGuard: vi.fn().mockReturnValue(outboundGuard),
      getDb: vi.fn().mockReturnValue(db),
      getScriptGuard: vi.fn().mockReturnValue(scriptGuard),
      getContentAnalyzer: vi.fn().mockReturnValue(contentAnalyzer),
      getBehaviorMonitor: vi.fn().mockReturnValue(behaviorMonitor),
      getGatekeeperWs: vi.fn().mockReturnValue(gatekeeperWs),
      getThreatIntel: vi.fn().mockReturnValue(threatIntel),
      getBlocklistUpdater: vi.fn().mockReturnValue(blocklistUpdater),
      getAnalyzerManager: vi.fn().mockReturnValue(analyzerManager),
      getDevToolsManager: vi.fn().mockReturnValue(devToolsManager),
    } as any,
    // Expose sub-managers for test assertions
    guardian,
    shield,
    outboundGuard,
    db,
    scriptGuard,
    contentAnalyzer,
    behaviorMonitor,
    gatekeeperWs,
    threatIntel,
    blocklistUpdater,
    analyzerManager,
    devToolsManager,
  };
}

function createMockTaskManager() {
  return {
    createTask: vi.fn().mockReturnValue({ id: 'task-1', steps: [{ id: 'step-0' }] }),
    requestApproval: vi.fn().mockResolvedValue(true), // default: approve
  };
}

function createSecurityTestApp(sm: any, taskManager: any = createMockTaskManager()) {
  const app = express();
  app.use(express.json());
  registerSecurityRoutes(app, sm, taskManager);
  return app;
}

// ── Tests ───────────────────────────────────────────────────────

describe('security routes', () => {
  let mocks: ReturnType<typeof createMockSecurityManager>;
  let taskManager: ReturnType<typeof createMockTaskManager>;
  let app: ReturnType<typeof createSecurityTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = createMockSecurityManager();
    taskManager = createMockTaskManager();
    app = createSecurityTestApp(mocks.sm, taskManager);
  });

  // ── Phase 1 (1-9) ──────────────────────────────────────────

  // 1. GET /security/status
  describe('GET /security/status', () => {
    it('returns overall security status with all subsystems', async () => {
      const res = await request(app).get('/security/status');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('guardian');
      expect(res.body).toHaveProperty('blocklist');
      expect(res.body).toHaveProperty('blocklistSources');
      expect(res.body.blocklistSources).toEqual([
        {
          name: 'urlhaus',
          category: 'malware',
          refreshTier: 'hourly',
          refreshIntervalMs: 3_600_000,
          lastUpdated: null,
          lastAttempted: null,
          lastError: null,
          consecutiveFailures: 0,
          nextDueAt: null,
          due: true,
        },
      ]);
      expect(res.body).toHaveProperty('outbound');
      expect(res.body).toHaveProperty('database');
      expect(res.body.database).toEqual({
        events: 0,
        domains: 0,
        scriptFingerprints: 0,
      });
      expect(res.body).toHaveProperty('phase3');
      expect(res.body.phase3).toEqual({
        scriptGuard: true,
        contentAnalyzer: true,
        behaviorMonitor: true,
      });
    });

    it('returns 500 when an error is thrown', async () => {
      mocks.sm.getGuardian.mockImplementation(() => { throw new Error('guardian down'); });
      app = createSecurityTestApp(mocks.sm);
      const res = await request(app).get('/security/status');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'guardian down' });
    });
  });

  // 2. GET /security/guardian/status
  describe('GET /security/guardian/status', () => {
    it('returns guardian status', async () => {
      const res = await request(app).get('/security/guardian/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ mode: 'balanced', blocks: 0, passes: 0 });
    });

    it('returns 500 on error', async () => {
      mocks.guardian.getStatus.mockImplementation(() => { throw new Error('guardian error'); });
      const res = await request(app).get('/security/guardian/status');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'guardian error' });
    });
  });

  // 3. POST /security/guardian/mode
  describe('POST /security/guardian/mode', () => {
    it('tightening (balanced → strict) passes through without user approval', async () => {
      mocks.db.getDomainInfo.mockReturnValue({ domain: 'example.com', guardianMode: 'balanced' });
      const res = await request(app)
        .post('/security/guardian/mode')
        .send({ domain: 'example.com', mode: 'strict' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, domain: 'example.com', mode: 'strict' });
      expect(mocks.guardian.setMode).toHaveBeenCalledWith('example.com', 'strict');
      expect(taskManager.requestApproval).not.toHaveBeenCalled();
    });

    it('same mode (no change) passes through without user approval', async () => {
      mocks.db.getDomainInfo.mockReturnValue({ domain: 'example.com', guardianMode: 'balanced' });
      const res = await request(app)
        .post('/security/guardian/mode')
        .send({ domain: 'example.com', mode: 'balanced' });
      expect(res.status).toBe(200);
      expect(taskManager.requestApproval).not.toHaveBeenCalled();
    });

    it('weakening (balanced → permissive) requires user approval — approved', async () => {
      mocks.db.getDomainInfo.mockReturnValue({ domain: 'example.com', guardianMode: 'balanced' });
      taskManager.requestApproval.mockResolvedValue(true);

      const res = await request(app)
        .post('/security/guardian/mode')
        .send({ domain: 'example.com', mode: 'permissive' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, domain: 'example.com', mode: 'permissive' });
      expect(taskManager.requestApproval).toHaveBeenCalled();
      expect(mocks.guardian.setMode).toHaveBeenCalledWith('example.com', 'permissive');
    });

    it('weakening (strict → permissive) requires user approval — rejected', async () => {
      mocks.db.getDomainInfo.mockReturnValue({ domain: 'example.com', guardianMode: 'strict' });
      taskManager.requestApproval.mockResolvedValue(false);

      const res = await request(app)
        .post('/security/guardian/mode')
        .send({ domain: 'example.com', mode: 'permissive' });

      expect(res.status).toBe(403);
      expect(res.body.rejected).toBe(true);
      expect(mocks.guardian.setMode).not.toHaveBeenCalled();
    });

    it('weakening request creates a task with riskLevel high and requiresApproval', async () => {
      mocks.db.getDomainInfo.mockReturnValue({ domain: 'example.com', guardianMode: 'strict' });
      taskManager.requestApproval.mockResolvedValue(true);

      await request(app)
        .post('/security/guardian/mode')
        .send({ domain: 'example.com', mode: 'balanced' });

      expect(taskManager.createTask).toHaveBeenCalled();
      const taskArgs = taskManager.createTask.mock.calls[0];
      const steps = taskArgs[3];
      expect(steps[0].riskLevel).toBe('high');
      expect(steps[0].requiresApproval).toBe(true);
    });

    it('unknown domain (no record) treats new mode as weakening when lower than default "balanced"', async () => {
      // No domain info → current effective mode is the default 'balanced'
      mocks.db.getDomainInfo.mockReturnValue(null);
      taskManager.requestApproval.mockResolvedValue(true);

      const res = await request(app)
        .post('/security/guardian/mode')
        .send({ domain: 'unseen.example', mode: 'permissive' });

      expect(res.status).toBe(200);
      expect(taskManager.requestApproval).toHaveBeenCalled();
    });

    it('returns 400 when domain or mode is missing', async () => {
      const res = await request(app)
        .post('/security/guardian/mode')
        .send({ domain: 'example.com' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'domain and mode required' });
    });

    it('returns 400 for invalid mode', async () => {
      const res = await request(app)
        .post('/security/guardian/mode')
        .send({ domain: 'example.com', mode: 'chaos' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid mode');
    });

    it('returns 500 on error during tightening', async () => {
      mocks.db.getDomainInfo.mockReturnValue({ domain: 'example.com', guardianMode: 'permissive' });
      mocks.guardian.setMode.mockImplementation(() => { throw new Error('setMode failed'); });
      const res = await request(app)
        .post('/security/guardian/mode')
        .send({ domain: 'example.com', mode: 'strict' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'setMode failed' });
    });
  });

  // 4. GET /security/events
  describe('GET /security/events', () => {
    it('returns events with default limit', async () => {
      const fakeEvents = [{ id: 1, type: 'block' }];
      mocks.db.getRecentEvents.mockReturnValue(fakeEvents);
      const res = await request(app).get('/security/events');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ events: fakeEvents, total: 1 });
      expect(mocks.db.getRecentEvents).toHaveBeenCalledWith(50, undefined, undefined);
    });

    it('passes query parameters through', async () => {
      mocks.db.getRecentEvents.mockReturnValue([]);
      const res = await request(app).get('/security/events?limit=10&severity=high&category=outbound');
      expect(res.status).toBe(200);
      expect(mocks.db.getRecentEvents).toHaveBeenCalledWith(10, 'high', 'outbound');
    });

    it('returns 500 on error', async () => {
      mocks.db.getRecentEvents.mockImplementation(() => { throw new Error('db failure'); });
      const res = await request(app).get('/security/events');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'db failure' });
    });
  });

  // 5. GET /security/domains
  describe('GET /security/domains', () => {
    it('returns domains with default limit', async () => {
      const fakeDomains = [{ domain: 'example.com', trust: 50 }];
      mocks.db.getDomains.mockReturnValue(fakeDomains);
      const res = await request(app).get('/security/domains');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ domains: fakeDomains, total: 1 });
      expect(mocks.db.getDomains).toHaveBeenCalledWith(100);
    });

    it('respects custom limit', async () => {
      mocks.db.getDomains.mockReturnValue([]);
      const res = await request(app).get('/security/domains?limit=5');
      expect(res.status).toBe(200);
      expect(mocks.db.getDomains).toHaveBeenCalledWith(5);
    });

    it('returns 500 on error', async () => {
      mocks.db.getDomains.mockImplementation(() => { throw new Error('db error'); });
      const res = await request(app).get('/security/domains');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'db error' });
    });
  });

  // 6. GET /security/domains/:domain
  describe('GET /security/domains/:domain', () => {
    it('returns domain info with block status', async () => {
      mocks.db.getDomainInfo.mockReturnValue({ domain: 'example.com', trust: 80 });
      mocks.shield.checkDomain.mockReturnValue({ blocked: false, reason: null });
      const res = await request(app).get('/security/domains/example.com');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        domain: 'example.com',
        trust: 80,
        blocked: false,
        blockReason: null,
      });
    });

    it('returns 404 when domain is not found', async () => {
      mocks.db.getDomainInfo.mockReturnValue(null);
      const res = await request(app).get('/security/domains/unknown.com');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Domain not found' });
    });

    it('returns 500 on error', async () => {
      mocks.db.getDomainInfo.mockImplementation(() => { throw new Error('lookup failed'); });
      const res = await request(app).get('/security/domains/example.com');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'lookup failed' });
    });
  });

  // 7. POST /security/domains/:domain/trust
  describe('POST /security/domains/:domain/trust', () => {
    it('lowering trust (tightening) passes through without approval', async () => {
      mocks.db.getDomainInfo.mockReturnValue({ domain: 'example.com', trustLevel: 80 });
      const res = await request(app)
        .post('/security/domains/example.com/trust')
        .send({ trust: 30 });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, domain: 'example.com', trust: 30 });
      expect(mocks.db.upsertDomain).toHaveBeenCalledWith('example.com', { trustLevel: 30 });
      expect(taskManager.requestApproval).not.toHaveBeenCalled();
    });

    it('same trust (no change) passes through without approval', async () => {
      mocks.db.getDomainInfo.mockReturnValue({ domain: 'example.com', trustLevel: 50 });
      const res = await request(app)
        .post('/security/domains/example.com/trust')
        .send({ trust: 50 });
      expect(res.status).toBe(200);
      expect(taskManager.requestApproval).not.toHaveBeenCalled();
    });

    it('raising trust (weakening) requires approval — approved', async () => {
      mocks.db.getDomainInfo.mockReturnValue({ domain: 'example.com', trustLevel: 50 });
      taskManager.requestApproval.mockResolvedValue(true);

      const res = await request(app)
        .post('/security/domains/example.com/trust')
        .send({ trust: 90 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, domain: 'example.com', trust: 90 });
      expect(taskManager.requestApproval).toHaveBeenCalled();
    });

    it('raising trust (weakening) requires approval — rejected', async () => {
      mocks.db.getDomainInfo.mockReturnValue({ domain: 'example.com', trustLevel: 50 });
      taskManager.requestApproval.mockResolvedValue(false);

      const res = await request(app)
        .post('/security/domains/example.com/trust')
        .send({ trust: 90 });

      expect(res.status).toBe(403);
      expect(res.body.rejected).toBe(true);
      expect(mocks.db.upsertDomain).not.toHaveBeenCalled();
    });

    it('unknown domain (no record) treats any new trust as weakening', async () => {
      mocks.db.getDomainInfo.mockReturnValue(null);
      taskManager.requestApproval.mockResolvedValue(true);
      const res = await request(app)
        .post('/security/domains/unseen.example/trust')
        .send({ trust: 50 });
      expect(res.status).toBe(200);
      expect(taskManager.requestApproval).toHaveBeenCalled();
    });

    it('unknown domain with trust 0 is not weakening — no approval needed', async () => {
      mocks.db.getDomainInfo.mockReturnValue(null);
      const res = await request(app)
        .post('/security/domains/unseen.example/trust')
        .send({ trust: 0 });
      expect(res.status).toBe(200);
      expect(taskManager.requestApproval).not.toHaveBeenCalled();
    });

    it('returns 400 when trust is missing', async () => {
      const res = await request(app)
        .post('/security/domains/example.com/trust')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('trust must be a number');
    });

    it('returns 400 when trust is not a number', async () => {
      const res = await request(app)
        .post('/security/domains/example.com/trust')
        .send({ trust: 'high' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('trust must be a number');
    });

    it('returns 400 when trust is out of range', async () => {
      const res = await request(app)
        .post('/security/domains/example.com/trust')
        .send({ trust: 150 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('trust must be a number');
    });

    it('returns 500 on error during tightening', async () => {
      mocks.db.getDomainInfo.mockReturnValue({ domain: 'example.com', trustLevel: 80 });
      mocks.db.upsertDomain.mockImplementation(() => { throw new Error('upsert failed'); });
      const res = await request(app)
        .post('/security/domains/example.com/trust')
        .send({ trust: 50 });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'upsert failed' });
    });
  });

  // 8. GET /security/blocklist/stats
  describe('GET /security/blocklist/stats', () => {
    it('returns memory and database blocklist stats', async () => {
      mocks.shield.getStats.mockReturnValue({ total: 100, blocked: 5 });
      mocks.db.getBlocklistStats.mockReturnValue({ lists: 3, entries: 1000 });
      const res = await request(app).get('/security/blocklist/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        memory: { total: 100, blocked: 5 },
        database: { lists: 3, entries: 1000 },
        sources: [
          {
            name: 'urlhaus',
            category: 'malware',
            refreshTier: 'hourly',
            refreshIntervalMs: 3_600_000,
            lastUpdated: null,
            lastAttempted: null,
            lastError: null,
            consecutiveFailures: 0,
            nextDueAt: null,
            due: true,
          },
        ],
      });
    });

    it('returns 500 on error', async () => {
      mocks.shield.getStats.mockImplementation(() => { throw new Error('shield down'); });
      const res = await request(app).get('/security/blocklist/stats');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'shield down' });
    });
  });

  // 9. POST /security/blocklist/check
  describe('POST /security/blocklist/check', () => {
    it('checks a URL against the blocklist', async () => {
      mocks.shield.checkUrl.mockReturnValue({ blocked: true, reason: 'malware' });
      const res = await request(app)
        .post('/security/blocklist/check')
        .send({ url: 'https://evil.com/malware' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        url: 'https://evil.com/malware',
        blocked: true,
        reason: 'malware',
      });
    });

    it('returns 400 when url is missing', async () => {
      const res = await request(app)
        .post('/security/blocklist/check')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'url required' });
    });

    it('returns 500 on error', async () => {
      mocks.shield.checkUrl.mockImplementation(() => { throw new Error('check failed'); });
      const res = await request(app)
        .post('/security/blocklist/check')
        .send({ url: 'https://example.com' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'check failed' });
    });
  });

  // ── Phase 2: Outbound Data Guard (10-12) ───────────────────

  // 10. GET /security/outbound/stats
  describe('GET /security/outbound/stats', () => {
    it('returns outbound guard stats', async () => {
      const res = await request(app).get('/security/outbound/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ blocked: 0, allowed: 0, flagged: 0 });
    });

    it('returns 500 on error', async () => {
      mocks.sm.getOutboundGuard.mockImplementation(() => { throw new Error('outbound error'); });
      app = createSecurityTestApp(mocks.sm);
      const res = await request(app).get('/security/outbound/stats');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'outbound error' });
    });
  });

  // 11. GET /security/outbound/recent
  describe('GET /security/outbound/recent', () => {
    it('returns recent outbound events with default limit', async () => {
      const fakeEvents = [{ id: 1, category: 'outbound' }];
      mocks.db.getRecentEvents.mockReturnValue(fakeEvents);
      const res = await request(app).get('/security/outbound/recent');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ events: fakeEvents, total: 1 });
      expect(mocks.db.getRecentEvents).toHaveBeenCalledWith(50, undefined, 'outbound');
    });

    it('respects custom limit', async () => {
      mocks.db.getRecentEvents.mockReturnValue([]);
      const res = await request(app).get('/security/outbound/recent?limit=10');
      expect(res.status).toBe(200);
      expect(mocks.db.getRecentEvents).toHaveBeenCalledWith(10, undefined, 'outbound');
    });

    it('returns 500 on error', async () => {
      mocks.db.getRecentEvents.mockImplementation(() => { throw new Error('db error'); });
      const res = await request(app).get('/security/outbound/recent');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'db error' });
    });
  });

  // 12. POST /security/outbound/whitelist
  describe('POST /security/outbound/whitelist', () => {
    it('adding a whitelist pair always requires user approval — approved', async () => {
      taskManager.requestApproval.mockResolvedValue(true);
      const res = await request(app)
        .post('/security/outbound/whitelist')
        .send({ origin: 'Example.COM', destination: 'Api.Service.IO' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, origin: 'example.com', destination: 'api.service.io' });
      expect(taskManager.requestApproval).toHaveBeenCalled();
      expect(mocks.db.addWhitelistPair).toHaveBeenCalledWith('example.com', 'api.service.io');
    });

    it('adding a whitelist pair — rejected returns 403 and never calls the DB', async () => {
      taskManager.requestApproval.mockResolvedValue(false);
      const res = await request(app)
        .post('/security/outbound/whitelist')
        .send({ origin: 'example.com', destination: 'attacker.example' });
      expect(res.status).toBe(403);
      expect(res.body.rejected).toBe(true);
      expect(mocks.db.addWhitelistPair).not.toHaveBeenCalled();
    });

    it('whitelist request creates a high-risk approval task', async () => {
      taskManager.requestApproval.mockResolvedValue(true);
      await request(app)
        .post('/security/outbound/whitelist')
        .send({ origin: 'a.com', destination: 'b.com' });
      const steps = taskManager.createTask.mock.calls[0][3];
      expect(steps[0].riskLevel).toBe('high');
      expect(steps[0].requiresApproval).toBe(true);
    });

    it('returns 400 when origin is missing — no approval task created', async () => {
      const res = await request(app)
        .post('/security/outbound/whitelist')
        .send({ destination: 'api.com' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'origin and destination domains required' });
      expect(taskManager.requestApproval).not.toHaveBeenCalled();
    });

    it('returns 400 when destination is missing — no approval task created', async () => {
      const res = await request(app)
        .post('/security/outbound/whitelist')
        .send({ origin: 'example.com' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'origin and destination domains required' });
      expect(taskManager.requestApproval).not.toHaveBeenCalled();
    });

    it('returns 500 on DB error after approval', async () => {
      taskManager.requestApproval.mockResolvedValue(true);
      mocks.db.addWhitelistPair.mockImplementation(() => { throw new Error('whitelist error'); });
      const res = await request(app)
        .post('/security/outbound/whitelist')
        .send({ origin: 'a.com', destination: 'b.com' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'whitelist error' });
    });
  });

  // ── Phase 3: Script & Content Guard (13-19) ───────────────

  // 13. GET /security/page/analysis
  describe('GET /security/page/analysis', () => {
    it('returns page analysis results', async () => {
      const analysis = { forms: [], trackers: [], security: { hasPasswordOnHttp: false }, riskScore: 0 };
      mocks.contentAnalyzer.analyzePage.mockResolvedValue(analysis);
      const res = await request(app).get('/security/page/analysis');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(analysis);
    });

    it('returns 503 when contentAnalyzer is null', async () => {
      mocks.sm.getContentAnalyzer.mockReturnValue(null);
      app = createSecurityTestApp(mocks.sm);
      const res = await request(app).get('/security/page/analysis');
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('ContentAnalyzer not initialized');
    });

    it('returns 500 on error', async () => {
      mocks.contentAnalyzer.analyzePage.mockRejectedValue(new Error('analysis failed'));
      const res = await request(app).get('/security/page/analysis');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'analysis failed' });
    });
  });

  // 14. GET /security/page/scripts
  describe('GET /security/page/scripts', () => {
    it('returns session scripts and fingerprinted scripts', async () => {
      const scriptsMap = new Map([
        ['s1', { url: 'https://example.com/a.js', risk: 'low' }],
      ]);
      mocks.scriptGuard.getScriptsParsed.mockReturnValue(scriptsMap);
      mocks.db.getScriptFingerprintCount.mockReturnValue(42);
      const res = await request(app).get('/security/page/scripts');
      expect(res.status).toBe(200);
      expect(res.body.sessionScripts).toEqual([
        { scriptId: 's1', url: 'https://example.com/a.js', risk: 'low' },
      ]);
      expect(res.body.fingerprintedScripts).toEqual([]);
      expect(res.body.totalFingerprints).toBe(42);
    });

    it('fetches fingerprinted scripts for current domain when webContents is available', async () => {
      mocks.scriptGuard.getScriptsParsed.mockReturnValue(new Map());
      const fakeWc = { getURL: vi.fn().mockReturnValue('https://example.com/page') };
      mocks.devToolsManager.getAttachedWebContents.mockReturnValue(fakeWc);
      mocks.db.getScriptsByDomain.mockReturnValue([{ hash: 'abc', domain: 'example.com' }]);
      const res = await request(app).get('/security/page/scripts');
      expect(res.status).toBe(200);
      expect(mocks.db.getScriptsByDomain).toHaveBeenCalledWith('example.com');
      expect(res.body.fingerprintedScripts).toEqual([{ hash: 'abc', domain: 'example.com' }]);
    });

    it('returns 503 when scriptGuard is null', async () => {
      mocks.sm.getScriptGuard.mockReturnValue(null);
      app = createSecurityTestApp(mocks.sm);
      const res = await request(app).get('/security/page/scripts');
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('ScriptGuard not initialized');
    });

    it('returns 500 on error', async () => {
      mocks.scriptGuard.getScriptsParsed.mockImplementation(() => { throw new Error('script error'); });
      const res = await request(app).get('/security/page/scripts');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'script error' });
    });
  });

  // 15. GET /security/page/forms
  describe('GET /security/page/forms', () => {
    it('returns forms, password-on-http flag, and risk score', async () => {
      const analysis = {
        forms: [{ id: 'f1', action: '/login' }],
        trackers: [],
        security: { hasPasswordOnHttp: true },
        riskScore: 80,
      };
      mocks.contentAnalyzer.analyzePage.mockResolvedValue(analysis);
      const res = await request(app).get('/security/page/forms');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        forms: [{ id: 'f1', action: '/login' }],
        hasPasswordOnHttp: true,
        riskScore: 80,
      });
    });

    it('returns 503 when contentAnalyzer is null', async () => {
      mocks.sm.getContentAnalyzer.mockReturnValue(null);
      app = createSecurityTestApp(mocks.sm);
      const res = await request(app).get('/security/page/forms');
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('ContentAnalyzer not initialized');
    });

    it('returns 500 on error', async () => {
      mocks.contentAnalyzer.analyzePage.mockRejectedValue(new Error('form analysis failed'));
      const res = await request(app).get('/security/page/forms');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'form analysis failed' });
    });
  });

  // 16. GET /security/page/trackers
  describe('GET /security/page/trackers', () => {
    it('returns trackers and total count', async () => {
      const analysis = {
        forms: [],
        trackers: [{ name: 'google-analytics', category: 'analytics' }],
        security: { hasPasswordOnHttp: false },
        riskScore: 20,
      };
      mocks.contentAnalyzer.analyzePage.mockResolvedValue(analysis);
      const res = await request(app).get('/security/page/trackers');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        trackers: [{ name: 'google-analytics', category: 'analytics' }],
        total: 1,
      });
    });

    it('returns 503 when contentAnalyzer is null', async () => {
      mocks.sm.getContentAnalyzer.mockReturnValue(null);
      app = createSecurityTestApp(mocks.sm);
      const res = await request(app).get('/security/page/trackers');
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('ContentAnalyzer not initialized');
    });

    it('returns 500 on error', async () => {
      mocks.contentAnalyzer.analyzePage.mockRejectedValue(new Error('tracker analysis failed'));
      const res = await request(app).get('/security/page/trackers');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'tracker analysis failed' });
    });
  });

  // 17. GET /security/monitor/resources
  describe('GET /security/monitor/resources', () => {
    it('returns resource snapshots and wasm count', async () => {
      const snapshots = [{ tabId: 1, cpu: 30, memory: 100 }];
      mocks.behaviorMonitor.getResourceSnapshots.mockReturnValue(snapshots);
      mocks.scriptGuard.getRecentWasmCount.mockReturnValue(2);
      const res = await request(app).get('/security/monitor/resources');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        snapshots,
        currentWasmActivity: 2,
        snapshotCount: 1,
      });
    });

    it('returns 503 when behaviorMonitor is null', async () => {
      mocks.sm.getBehaviorMonitor.mockReturnValue(null);
      app = createSecurityTestApp(mocks.sm);
      const res = await request(app).get('/security/monitor/resources');
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('BehaviorMonitor not initialized');
    });

    it('returns 0 wasm count when scriptGuard is null', async () => {
      mocks.sm.getScriptGuard.mockReturnValue(null);
      app = createSecurityTestApp(mocks.sm);
      const res = await request(app).get('/security/monitor/resources');
      expect(res.status).toBe(200);
      expect(res.body.currentWasmActivity).toBe(0);
    });

    it('returns 500 on error', async () => {
      mocks.behaviorMonitor.getResourceSnapshots.mockImplementation(() => { throw new Error('resource error'); });
      const res = await request(app).get('/security/monitor/resources');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'resource error' });
    });
  });

  // 18. GET /security/monitor/permissions
  describe('GET /security/monitor/permissions', () => {
    it('returns permission log with blocked/allowed counts', async () => {
      const log = [
        { permission: 'camera', action: 'blocked' },
        { permission: 'location', action: 'allowed' },
        { permission: 'mic', action: 'blocked' },
      ];
      mocks.behaviorMonitor.getPermissionLog.mockReturnValue(log);
      const res = await request(app).get('/security/monitor/permissions');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        permissions: log,
        total: 3,
        blocked: 2,
        allowed: 1,
      });
    });

    it('returns 503 when behaviorMonitor is null', async () => {
      mocks.sm.getBehaviorMonitor.mockReturnValue(null);
      app = createSecurityTestApp(mocks.sm);
      const res = await request(app).get('/security/monitor/permissions');
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('BehaviorMonitor not initialized');
    });

    it('returns 500 on error', async () => {
      mocks.behaviorMonitor.getPermissionLog.mockImplementation(() => { throw new Error('permission error'); });
      const res = await request(app).get('/security/monitor/permissions');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'permission error' });
    });
  });

  // 19. POST /security/monitor/kill
  describe('POST /security/monitor/kill', () => {
    it('kills a script by id and returns ok', async () => {
      mocks.behaviorMonitor.killScript.mockResolvedValue(true);
      const res = await request(app)
        .post('/security/monitor/kill')
        .send({ scriptId: 'abc123' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, scriptId: 'abc123' });
      expect(mocks.behaviorMonitor.killScript).toHaveBeenCalledWith('abc123');
    });

    it('defaults to "current" when scriptId is not provided', async () => {
      mocks.behaviorMonitor.killScript.mockResolvedValue(true);
      const res = await request(app)
        .post('/security/monitor/kill')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, scriptId: 'current' });
      expect(mocks.behaviorMonitor.killScript).toHaveBeenCalledWith('current');
    });

    it('returns 503 when behaviorMonitor is null', async () => {
      mocks.sm.getBehaviorMonitor.mockReturnValue(null);
      app = createSecurityTestApp(mocks.sm);
      const res = await request(app)
        .post('/security/monitor/kill')
        .send({ scriptId: 'abc' });
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('BehaviorMonitor not initialized');
    });

    it('returns 500 on error', async () => {
      mocks.behaviorMonitor.killScript.mockRejectedValue(new Error('kill failed'));
      const res = await request(app)
        .post('/security/monitor/kill')
        .send({ scriptId: 'abc' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'kill failed' });
    });
  });

  // ── Phase 4: AI Gatekeeper Agent (20-24) ───────────────────

  // 20. GET /security/gatekeeper/status
  describe('GET /security/gatekeeper/status', () => {
    it('returns gatekeeper status', async () => {
      const res = await request(app).get('/security/gatekeeper/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ connected: true, pendingDecisions: 0, totalDecisions: 0 });
    });

    it('returns default status when gatekeeperWs is null', async () => {
      mocks.sm.getGatekeeperWs.mockReturnValue(null);
      app = createSecurityTestApp(mocks.sm);
      const res = await request(app).get('/security/gatekeeper/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        connected: false,
        pendingDecisions: 0,
        totalDecisions: 0,
        lastAgentSeen: null,
        note: 'Gatekeeper not initialized',
      });
    });

    it('returns 500 on error', async () => {
      mocks.gatekeeperWs.getStatus.mockImplementation(() => { throw new Error('gatekeeper error'); });
      const res = await request(app).get('/security/gatekeeper/status');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'gatekeeper error' });
    });
  });

  // 21. GET /security/gatekeeper/queue
  describe('GET /security/gatekeeper/queue', () => {
    it('returns pending decisions queue', async () => {
      const queue = [{ id: 'd1', action: 'pending' }];
      mocks.gatekeeperWs.getQueue.mockReturnValue(queue);
      const res = await request(app).get('/security/gatekeeper/queue');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ queue, total: 1 });
    });

    it('returns empty queue when gatekeeperWs is null', async () => {
      mocks.sm.getGatekeeperWs.mockReturnValue(null);
      app = createSecurityTestApp(mocks.sm);
      const res = await request(app).get('/security/gatekeeper/queue');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ queue: [], total: 0 });
    });

    it('returns 500 on error', async () => {
      mocks.gatekeeperWs.getQueue.mockImplementation(() => { throw new Error('queue error'); });
      const res = await request(app).get('/security/gatekeeper/queue');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'queue error' });
    });
  });

  // 22. POST /security/gatekeeper/decide
  describe('POST /security/gatekeeper/decide', () => {
    it('submits a decision and returns ok', async () => {
      mocks.gatekeeperWs.submitRestDecision.mockReturnValue(true);
      const res = await request(app)
        .post('/security/gatekeeper/decide')
        .send({ id: 'd1', action: 'block', reason: 'suspicious', confidence: 95 });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, id: 'd1', action: 'block' });
      expect(mocks.gatekeeperWs.submitRestDecision).toHaveBeenCalledWith('d1', 'block', 'suspicious', 95);
    });

    it('uses defaults for reason and confidence', async () => {
      mocks.gatekeeperWs.submitRestDecision.mockReturnValue(true);
      const res = await request(app)
        .post('/security/gatekeeper/decide')
        .send({ id: 'd1', action: 'allow' });
      expect(res.status).toBe(200);
      expect(mocks.gatekeeperWs.submitRestDecision).toHaveBeenCalledWith('d1', 'allow', '', 0);
    });

    it('returns 503 when gatekeeperWs is null', async () => {
      mocks.sm.getGatekeeperWs.mockReturnValue(null);
      app = createSecurityTestApp(mocks.sm);
      const res = await request(app)
        .post('/security/gatekeeper/decide')
        .send({ id: 'd1', action: 'allow' });
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('Gatekeeper not initialized');
    });

    it('returns 400 when id or action is missing', async () => {
      const res = await request(app)
        .post('/security/gatekeeper/decide')
        .send({ id: 'd1' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'id and action required' });
    });

    it('returns 400 for invalid action', async () => {
      const res = await request(app)
        .post('/security/gatekeeper/decide')
        .send({ id: 'd1', action: 'destroy' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid action');
    });

    it('returns 404 when decision is not found in queue', async () => {
      mocks.gatekeeperWs.submitRestDecision.mockReturnValue(false);
      const res = await request(app)
        .post('/security/gatekeeper/decide')
        .send({ id: 'missing-id', action: 'monitor' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Decision not found in pending queue' });
    });

    it('returns 500 on error', async () => {
      mocks.gatekeeperWs.submitRestDecision.mockImplementation(() => { throw new Error('decide error'); });
      const res = await request(app)
        .post('/security/gatekeeper/decide')
        .send({ id: 'd1', action: 'block' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'decide error' });
    });
  });

  // 23. GET /security/gatekeeper/history
  describe('GET /security/gatekeeper/history', () => {
    it('returns decision history with default limit', async () => {
      const history = [{ id: 'd1', action: 'block', timestamp: 1234567890 }];
      mocks.gatekeeperWs.getHistory.mockReturnValue(history);
      const res = await request(app).get('/security/gatekeeper/history');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ history, total: 1 });
      expect(mocks.gatekeeperWs.getHistory).toHaveBeenCalledWith(50);
    });

    it('respects custom limit', async () => {
      mocks.gatekeeperWs.getHistory.mockReturnValue([]);
      const res = await request(app).get('/security/gatekeeper/history?limit=5');
      expect(res.status).toBe(200);
      expect(mocks.gatekeeperWs.getHistory).toHaveBeenCalledWith(5);
    });

    it('returns empty history when gatekeeperWs is null', async () => {
      mocks.sm.getGatekeeperWs.mockReturnValue(null);
      app = createSecurityTestApp(mocks.sm);
      const res = await request(app).get('/security/gatekeeper/history');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ history: [], total: 0 });
    });

    it('returns 500 on error', async () => {
      mocks.gatekeeperWs.getHistory.mockImplementation(() => { throw new Error('history error'); });
      const res = await request(app).get('/security/gatekeeper/history');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'history error' });
    });
  });

  // 24. GET /security/gatekeeper/secret
  describe('GET /security/gatekeeper/secret', () => {
    it('returns the auth secret and path', async () => {
      const res = await request(app).get('/security/gatekeeper/secret');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        secret: 'test-secret',
        path: '~/.tandem/security/gatekeeper.secret',
      });
    });

    it('returns 503 when gatekeeperWs is null', async () => {
      mocks.sm.getGatekeeperWs.mockReturnValue(null);
      app = createSecurityTestApp(mocks.sm);
      const res = await request(app).get('/security/gatekeeper/secret');
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('Gatekeeper not initialized');
    });

    it('returns 500 on error', async () => {
      mocks.gatekeeperWs.getSecret.mockImplementation(() => { throw new Error('secret error'); });
      const res = await request(app).get('/security/gatekeeper/secret');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'secret error' });
    });
  });

  // ── Phase 5: Evolution Engine + Agent Fleet (25-32) ────────

  // 25. GET /security/baselines/:domain
  describe('GET /security/baselines/:domain', () => {
    it('returns baselines for a domain', async () => {
      const baselines = [{ metric: 'scriptCount', value: 12 }];
      mocks.db.getBaselinesByDomain.mockReturnValue(baselines);
      const res = await request(app).get('/security/baselines/example.com');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ domain: 'example.com', baselines, total: 1 });
      expect(mocks.db.getBaselinesByDomain).toHaveBeenCalledWith('example.com');
    });

    it('returns empty baselines when none exist', async () => {
      mocks.db.getBaselinesByDomain.mockReturnValue([]);
      const res = await request(app).get('/security/baselines/unknown.com');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ domain: 'unknown.com', baselines: [], total: 0 });
    });

    it('returns 500 on error', async () => {
      mocks.db.getBaselinesByDomain.mockImplementation(() => { throw new Error('baseline error'); });
      const res = await request(app).get('/security/baselines/example.com');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'baseline error' });
    });
  });

  // 26. GET /security/anomalies
  describe('GET /security/anomalies', () => {
    it('returns recent anomalies with default limit', async () => {
      const anomalies = [{ id: 1, type: 'scriptChange', severity: 'high' }];
      mocks.db.getRecentAnomalies.mockReturnValue(anomalies);
      const res = await request(app).get('/security/anomalies');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ anomalies, total: 1 });
      expect(mocks.db.getRecentAnomalies).toHaveBeenCalledWith(50);
    });

    it('respects custom limit', async () => {
      mocks.db.getRecentAnomalies.mockReturnValue([]);
      const res = await request(app).get('/security/anomalies?limit=5');
      expect(res.status).toBe(200);
      expect(mocks.db.getRecentAnomalies).toHaveBeenCalledWith(5);
    });

    it('returns 500 on error', async () => {
      mocks.db.getRecentAnomalies.mockImplementation(() => { throw new Error('anomaly error'); });
      const res = await request(app).get('/security/anomalies');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'anomaly error' });
    });
  });

  // 27. GET /security/zero-days
  describe('GET /security/zero-days', () => {
    it('returns open zero-day candidates', async () => {
      const candidates = [{ id: 1, type: 'suspicious-obfuscation' }];
      mocks.db.getOpenZeroDayCandidates.mockReturnValue(candidates);
      const res = await request(app).get('/security/zero-days');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ candidates, total: 1 });
    });

    it('returns empty list when no candidates', async () => {
      mocks.db.getOpenZeroDayCandidates.mockReturnValue([]);
      const res = await request(app).get('/security/zero-days');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ candidates: [], total: 0 });
    });

    it('returns 500 on error', async () => {
      mocks.db.getOpenZeroDayCandidates.mockImplementation(() => { throw new Error('zero-day error'); });
      const res = await request(app).get('/security/zero-days');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'zero-day error' });
    });
  });

  // 28. POST /security/zero-days/:id/resolve
  describe('POST /security/zero-days/:id/resolve', () => {
    it('resolves a zero-day candidate', async () => {
      mocks.db.resolveZeroDayCandidate.mockReturnValue(true);
      const res = await request(app)
        .post('/security/zero-days/42/resolve')
        .send({ resolution: 'False positive' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, id: 42 });
      expect(mocks.db.resolveZeroDayCandidate).toHaveBeenCalledWith(42, 'False positive');
    });

    it('uses default resolution when not provided', async () => {
      mocks.db.resolveZeroDayCandidate.mockReturnValue(true);
      const res = await request(app)
        .post('/security/zero-days/1/resolve')
        .send({});
      expect(res.status).toBe(200);
      expect(mocks.db.resolveZeroDayCandidate).toHaveBeenCalledWith(1, 'Resolved');
    });

    it('returns 400 for invalid id', async () => {
      const res = await request(app)
        .post('/security/zero-days/abc/resolve')
        .send({ resolution: 'Fixed' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid id' });
    });

    it('returns 404 when candidate is not found', async () => {
      mocks.db.resolveZeroDayCandidate.mockReturnValue(false);
      const res = await request(app)
        .post('/security/zero-days/999/resolve')
        .send({ resolution: 'Fixed' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Zero-day candidate not found' });
    });

    it('returns 500 on error', async () => {
      mocks.db.resolveZeroDayCandidate.mockImplementation(() => { throw new Error('resolve error'); });
      const res = await request(app)
        .post('/security/zero-days/1/resolve')
        .send({ resolution: 'Fixed' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'resolve error' });
    });
  });

  // 29. GET /security/report
  describe('GET /security/report', () => {
    it('returns a security report with default period', async () => {
      const report = { period: 'day', events: 0, threats: 0 };
      mocks.threatIntel.generateReport.mockReturnValue(report);
      const res = await request(app).get('/security/report');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(report);
      expect(mocks.threatIntel.generateReport).toHaveBeenCalledWith('day');
    });

    it('respects period query parameter', async () => {
      mocks.threatIntel.generateReport.mockReturnValue({ period: 'week', events: 10 });
      const res = await request(app).get('/security/report?period=week');
      expect(res.status).toBe(200);
      expect(mocks.threatIntel.generateReport).toHaveBeenCalledWith('week');
    });

    it('returns 400 for invalid period', async () => {
      const res = await request(app).get('/security/report?period=year');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid period');
    });

    it('returns 500 on error', async () => {
      mocks.threatIntel.generateReport.mockImplementation(() => { throw new Error('report error'); });
      const res = await request(app).get('/security/report');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'report error' });
    });
  });

  // 30. POST /security/blocklist/update
  describe('POST /security/blocklist/update', () => {
    it('triggers a blocklist update and returns result', async () => {
      mocks.blocklistUpdater.update.mockResolvedValue({ updated: true, newEntries: 50 });
      const res = await request(app).post('/security/blocklist/update');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: true, newEntries: 50 });
    });

    it('returns 500 on error', async () => {
      mocks.blocklistUpdater.update.mockRejectedValue(new Error('update failed'));
      const res = await request(app).post('/security/blocklist/update');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'update failed' });
    });
  });

  // 31. GET /security/trust/changes
  describe('GET /security/trust/changes', () => {
    it('returns trust changes with default period', async () => {
      const changes = [{ domain: 'example.com', from: 50, to: 30 }];
      mocks.db.getTrustChanges.mockReturnValue(changes);
      const res = await request(app).get('/security/trust/changes');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ changes, total: 1, period: 'day' });
      expect(mocks.db.getTrustChanges).toHaveBeenCalled();
    });

    it('respects period query parameter', async () => {
      mocks.db.getTrustChanges.mockReturnValue([]);
      const res = await request(app).get('/security/trust/changes?period=month');
      expect(res.status).toBe(200);
      expect(res.body.period).toBe('month');
    });

    it('returns 400 for invalid period', async () => {
      const res = await request(app).get('/security/trust/changes?period=century');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid period');
    });

    it('returns 500 on error', async () => {
      mocks.db.getTrustChanges.mockImplementation(() => { throw new Error('trust error'); });
      const res = await request(app).get('/security/trust/changes');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'trust error' });
    });
  });

  // 32. POST /security/maintenance/prune
  describe('POST /security/maintenance/prune', () => {
    it('prunes old events and returns count', async () => {
      mocks.db.pruneOldEvents.mockReturnValue(42);
      const res = await request(app).post('/security/maintenance/prune');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, pruned: 42, cutoffDays: 90 });
    });

    it('passes 90-day cutoff to db', async () => {
      mocks.db.pruneOldEvents.mockReturnValue(0);
      await request(app).post('/security/maintenance/prune');
      const expectedMs = 90 * 86400_000;
      expect(mocks.db.pruneOldEvents).toHaveBeenCalledWith(expectedMs);
    });

    it('returns 500 on error', async () => {
      mocks.db.pruneOldEvents.mockImplementation(() => { throw new Error('prune error'); });
      const res = await request(app).post('/security/maintenance/prune');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'prune error' });
    });
  });

  // ── Phase 3-B: Script correlations (33) ────────────────────

  // 33. GET /security/scripts/correlations
  describe('GET /security/scripts/correlations', () => {
    it('returns empty correlations when no widespread scripts exist', async () => {
      const res = await request(app).get('/security/scripts/correlations');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        widespread: [],
        astMatches: [],
        totalTrackedScripts: 0,
        crossDomainScripts: 0,
        astCorrelations: 0,
      });
    });

    it('returns hash-based widespread scripts with blocked domains', async () => {
      const now = Date.now();
      mocks.db.getWidespreadScripts.mockReturnValue([
        { scriptHash: 'hash1', normalizedHash: 'norm1', domainCount: 3, firstSeen: now },
      ]);
      mocks.db.getDomainsForHash.mockReturnValue(['a.com', 'b.com', 'evil.com']);
      mocks.shield.checkDomain
        .mockReturnValueOnce({ blocked: false, reason: null })
        .mockReturnValueOnce({ blocked: false, reason: null })
        .mockReturnValueOnce({ blocked: true, reason: 'malware' });
      mocks.db.getScriptFingerprintCount.mockReturnValue(100);
      mocks.db.getCrossDomainScriptCount.mockReturnValue(5);

      const res = await request(app).get('/security/scripts/correlations');
      expect(res.status).toBe(200);
      expect(res.body.widespread).toHaveLength(1);
      expect(res.body.widespread[0].hash).toBe('hash1');
      expect(res.body.widespread[0].domains).toEqual(['a.com', 'b.com', 'evil.com']);
      expect(res.body.widespread[0].blockedDomains).toEqual(['evil.com']);
      expect(res.body.totalTrackedScripts).toBe(100);
      expect(res.body.crossDomainScripts).toBe(5);
    });

    it('returns AST-based correlations with obfuscation variant detection', async () => {
      const now = Date.now();
      mocks.db.getWidespreadAstScripts.mockReturnValue([
        { astHash: 'ast1', domainCount: 2, hashVariantCount: 3, firstSeen: now },
      ]);
      mocks.db.getAstMatches.mockReturnValue([
        { domain: 'a.com', scriptHash: 'hash1', scriptUrl: 'https://a.com/s.js' },
        { domain: 'b.com', scriptHash: 'hash2', scriptUrl: 'https://b.com/s.js' },
      ]);
      mocks.shield.checkDomain
        .mockReturnValue({ blocked: false, reason: null });

      const res = await request(app).get('/security/scripts/correlations');
      expect(res.status).toBe(200);
      expect(res.body.astMatches).toHaveLength(1);
      expect(res.body.astMatches[0].astHash).toBe('ast1');
      expect(res.body.astMatches[0].isObfuscationVariant).toBe(true);
      expect(res.body.astMatches[0].variants).toHaveLength(2);
      expect(res.body.astCorrelations).toBe(1);
    });

    it('detects blocked AST variants', async () => {
      const now = Date.now();
      mocks.db.getWidespreadAstScripts.mockReturnValue([
        { astHash: 'ast1', domainCount: 1, hashVariantCount: 1, firstSeen: now },
      ]);
      mocks.db.getAstMatches.mockReturnValue([
        { domain: 'evil.com', scriptHash: 'h1', scriptUrl: 'https://evil.com/s.js' },
      ]);
      mocks.shield.checkDomain.mockReturnValue({ blocked: true, reason: 'malware' });

      const res = await request(app).get('/security/scripts/correlations');
      expect(res.status).toBe(200);
      expect(res.body.astMatches[0].hasBlockedDomain).toBe(true);
    });

    it('returns 500 on error', async () => {
      mocks.db.getWidespreadScripts.mockImplementation(() => { throw new Error('correlation error'); });
      const res = await request(app).get('/security/scripts/correlations');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'correlation error' });
    });
  });

  // ── Phase 7-A: Analyzer plugins (34) ──────────────────────

  // 34. GET /security/analyzers/status
  describe('GET /security/analyzers/status', () => {
    it('returns analyzer status list', async () => {
      const analyzers = [
        { name: 'phishing-detector', version: '1.0', active: true },
        { name: 'crypto-miner-detector', version: '2.1', active: false },
      ];
      mocks.analyzerManager.getStatus.mockReturnValue(analyzers);
      const res = await request(app).get('/security/analyzers/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ analyzers, total: 2 });
    });

    it('returns empty list when no analyzers loaded', async () => {
      mocks.analyzerManager.getStatus.mockReturnValue([]);
      const res = await request(app).get('/security/analyzers/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ analyzers: [], total: 0 });
    });

    it('returns 500 on error', async () => {
      mocks.sm.getAnalyzerManager.mockImplementation(() => { throw new Error('analyzer error'); });
      app = createSecurityTestApp(mocks.sm);
      const res = await request(app).get('/security/analyzers/status');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'analyzer error' });
    });
  });
});
