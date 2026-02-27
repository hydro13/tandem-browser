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

import { registerNetworkRoutes } from '../../routes/network';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

describe('Network Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    ctx = createMockContext();
    app = createTestApp(registerNetworkRoutes, ctx);
  });

  // ─── GET /network/log ──────────────────────────────

  describe('GET /network/log', () => {
    it('returns log entries with default limit', async () => {
      const fakeEntries = [{ url: 'https://example.com', method: 'GET', status: 200 }];
      vi.mocked(ctx.networkInspector.getLog).mockReturnValue(fakeEntries as any);

      const res = await request(app).get('/network/log');

      expect(res.status).toBe(200);
      expect(res.body.entries).toEqual(fakeEntries);
      expect(res.body.count).toBe(1);
      expect(ctx.networkInspector.getLog).toHaveBeenCalledWith(100, undefined);
    });

    it('parses limit and domain query params', async () => {
      vi.mocked(ctx.networkInspector.getLog).mockReturnValue([]);

      const res = await request(app).get('/network/log?limit=50&domain=example.com');

      expect(res.status).toBe(200);
      expect(ctx.networkInspector.getLog).toHaveBeenCalledWith(50, 'example.com');
    });

    it('defaults limit to 100 when invalid', async () => {
      vi.mocked(ctx.networkInspector.getLog).mockReturnValue([]);

      const res = await request(app).get('/network/log?limit=abc');

      expect(res.status).toBe(200);
      expect(ctx.networkInspector.getLog).toHaveBeenCalledWith(100, undefined);
    });

    it('returns 500 when getLog throws', async () => {
      vi.mocked(ctx.networkInspector.getLog).mockImplementation(() => { throw new Error('log error'); });

      const res = await request(app).get('/network/log');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('log error');
    });
  });

  // ─── GET /network/apis ─────────────────────────────

  describe('GET /network/apis', () => {
    it('returns detected APIs', async () => {
      const fakeApis = [{ domain: 'api.example.com', endpoints: ['/v1/users'] }];
      vi.mocked(ctx.networkInspector.getApis).mockReturnValue(fakeApis as any);

      const res = await request(app).get('/network/apis');

      expect(res.status).toBe(200);
      expect(res.body.apis).toEqual(fakeApis);
    });

    it('returns 500 when getApis throws', async () => {
      vi.mocked(ctx.networkInspector.getApis).mockImplementation(() => { throw new Error('apis error'); });

      const res = await request(app).get('/network/apis');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('apis error');
    });
  });

  // ─── GET /network/domains ──────────────────────────

  describe('GET /network/domains', () => {
    it('returns domains', async () => {
      const fakeDomains = ['example.com', 'api.example.com'];
      vi.mocked(ctx.networkInspector.getDomains).mockReturnValue(fakeDomains as any);

      const res = await request(app).get('/network/domains');

      expect(res.status).toBe(200);
      expect(res.body.domains).toEqual(fakeDomains);
    });

    it('returns 500 when getDomains throws', async () => {
      vi.mocked(ctx.networkInspector.getDomains).mockImplementation(() => { throw new Error('domains error'); });

      const res = await request(app).get('/network/domains');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('domains error');
    });
  });

  // ─── DELETE /network/clear ─────────────────────────

  describe('DELETE /network/clear', () => {
    it('clears the network log', async () => {
      const res = await request(app).delete('/network/clear');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.networkInspector.clear).toHaveBeenCalled();
    });

    it('returns 500 when clear throws', async () => {
      vi.mocked(ctx.networkInspector.clear).mockImplementation(() => { throw new Error('clear error'); });

      const res = await request(app).delete('/network/clear');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('clear error');
    });
  });

  // ─── POST /network/mock ────────────────────────────

  describe('POST /network/mock', () => {
    it('adds a mock rule with pattern', async () => {
      vi.mocked(ctx.networkMocker.addRule).mockResolvedValue({ id: 'rule-1', pattern: '**/*.png' } as any);

      const res = await request(app)
        .post('/network/mock')
        .send({ pattern: '**/*.png', status: 404 });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.id).toBe('rule-1');
      expect(res.body.pattern).toBe('**/*.png');
      expect(ctx.networkMocker.addRule).toHaveBeenCalledWith({
        pattern: '**/*.png',
        abort: undefined,
        status: 404,
        body: undefined,
        headers: undefined,
        delay: undefined,
      });
    });

    it('adds a mock rule with all options', async () => {
      vi.mocked(ctx.networkMocker.addRule).mockResolvedValue({ id: 'rule-2', pattern: '**/api/*' } as any);

      const res = await request(app)
        .post('/network/mock')
        .send({
          pattern: '**/api/*',
          abort: true,
          status: 503,
          body: '{"error": "mocked"}',
          headers: { 'X-Mock': 'true' },
          delay: 500,
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.networkMocker.addRule).toHaveBeenCalledWith({
        pattern: '**/api/*',
        abort: true,
        status: 503,
        body: '{"error": "mocked"}',
        headers: { 'X-Mock': 'true' },
        delay: 500,
      });
    });

    it('returns 400 when pattern is missing', async () => {
      const res = await request(app)
        .post('/network/mock')
        .send({ status: 404 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('pattern required');
    });

    it('returns 500 when addRule throws', async () => {
      vi.mocked(ctx.networkMocker.addRule).mockRejectedValueOnce(new Error('mock error'));

      const res = await request(app)
        .post('/network/mock')
        .send({ pattern: '**/*.js' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('mock error');
    });
  });

  // ─── POST /network/route (alias for mock) ─────────

  describe('POST /network/route', () => {
    it('adds a mock rule (alias)', async () => {
      vi.mocked(ctx.networkMocker.addRule).mockResolvedValue({ id: 'rule-3', pattern: '**/*.css' } as any);

      const res = await request(app)
        .post('/network/route')
        .send({ pattern: '**/*.css', abort: true });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.id).toBe('rule-3');
      expect(res.body.pattern).toBe('**/*.css');
      expect(ctx.networkMocker.addRule).toHaveBeenCalledWith({
        pattern: '**/*.css',
        abort: true,
        status: undefined,
        body: undefined,
        headers: undefined,
        delay: undefined,
      });
    });

    it('returns 400 when pattern is missing', async () => {
      const res = await request(app)
        .post('/network/route')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('pattern required');
    });

    it('returns 500 when addRule throws', async () => {
      vi.mocked(ctx.networkMocker.addRule).mockRejectedValueOnce(new Error('route error'));

      const res = await request(app)
        .post('/network/route')
        .send({ pattern: '**/*.js' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('route error');
    });
  });

  // ─── GET /network/mocks ────────────────────────────

  describe('GET /network/mocks', () => {
    it('returns mock rules list', async () => {
      const fakeRules = [
        { id: 'rule-1', pattern: '**/*.png', status: 404, abort: false, delay: undefined, createdAt: 1000 },
        { id: 'rule-2', pattern: '**/api/*', status: undefined, abort: true, delay: 200, createdAt: 2000 },
      ];
      vi.mocked(ctx.networkMocker.getRules).mockReturnValue(fakeRules as any);

      const res = await request(app).get('/network/mocks');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.count).toBe(2);
      expect(res.body.mocks).toEqual([
        { id: 'rule-1', pattern: '**/*.png', status: 404, abort: false, delay: undefined, createdAt: 1000 },
        { id: 'rule-2', pattern: '**/api/*', status: undefined, abort: true, delay: 200, createdAt: 2000 },
      ]);
    });

    it('returns empty list when no rules exist', async () => {
      vi.mocked(ctx.networkMocker.getRules).mockReturnValue([]);

      const res = await request(app).get('/network/mocks');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.count).toBe(0);
      expect(res.body.mocks).toEqual([]);
    });

    it('returns 500 when getRules throws', async () => {
      vi.mocked(ctx.networkMocker.getRules).mockImplementation(() => { throw new Error('mocks error'); });

      const res = await request(app).get('/network/mocks');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('mocks error');
    });
  });

  // ─── POST /network/unmock ──────────────────────────

  describe('POST /network/unmock', () => {
    it('removes a mock rule by pattern', async () => {
      vi.mocked(ctx.networkMocker.removeRule).mockResolvedValue(1);

      const res = await request(app)
        .post('/network/unmock')
        .send({ pattern: '**/*.png' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.removed).toBe(1);
      expect(ctx.networkMocker.removeRule).toHaveBeenCalledWith('**/*.png');
    });

    it('removes a mock rule by id', async () => {
      vi.mocked(ctx.networkMocker.removeRuleById).mockResolvedValue(1);

      const res = await request(app)
        .post('/network/unmock')
        .send({ id: 'rule-1' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.removed).toBe(1);
      expect(ctx.networkMocker.removeRuleById).toHaveBeenCalledWith('rule-1');
    });

    it('prefers id over pattern when both provided', async () => {
      vi.mocked(ctx.networkMocker.removeRuleById).mockResolvedValue(1);

      const res = await request(app)
        .post('/network/unmock')
        .send({ id: 'rule-1', pattern: '**/*.png' });

      expect(res.status).toBe(200);
      expect(ctx.networkMocker.removeRuleById).toHaveBeenCalledWith('rule-1');
      expect(ctx.networkMocker.removeRule).not.toHaveBeenCalled();
    });

    it('returns 400 when neither pattern nor id is provided', async () => {
      const res = await request(app)
        .post('/network/unmock')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('pattern or id required');
    });

    it('returns 500 when removeRule throws', async () => {
      vi.mocked(ctx.networkMocker.removeRule).mockRejectedValueOnce(new Error('unmock error'));

      const res = await request(app)
        .post('/network/unmock')
        .send({ pattern: '**/*.js' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('unmock error');
    });
  });

  // ─── POST /network/unroute (alias for unmock) ─────

  describe('POST /network/unroute', () => {
    it('removes a mock rule by pattern (alias)', async () => {
      vi.mocked(ctx.networkMocker.removeRule).mockResolvedValue(1);

      const res = await request(app)
        .post('/network/unroute')
        .send({ pattern: '**/*.css' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.removed).toBe(1);
      expect(ctx.networkMocker.removeRule).toHaveBeenCalledWith('**/*.css');
    });

    it('removes a mock rule by id (alias)', async () => {
      vi.mocked(ctx.networkMocker.removeRuleById).mockResolvedValue(1);

      const res = await request(app)
        .post('/network/unroute')
        .send({ id: 'rule-2' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.removed).toBe(1);
      expect(ctx.networkMocker.removeRuleById).toHaveBeenCalledWith('rule-2');
    });

    it('returns 400 when neither pattern nor id is provided', async () => {
      const res = await request(app)
        .post('/network/unroute')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('pattern or id required');
    });

    it('returns 500 when removeRuleById throws', async () => {
      vi.mocked(ctx.networkMocker.removeRuleById).mockRejectedValueOnce(new Error('unroute error'));

      const res = await request(app)
        .post('/network/unroute')
        .send({ id: 'rule-x' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('unroute error');
    });
  });

  // ─── POST /network/mock-clear ──────────────────────

  describe('POST /network/mock-clear', () => {
    it('clears all mock rules', async () => {
      vi.mocked(ctx.networkMocker.clearRules).mockResolvedValue(3);

      const res = await request(app)
        .post('/network/mock-clear')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.removed).toBe(3);
      expect(ctx.networkMocker.clearRules).toHaveBeenCalled();
    });

    it('returns removed count of 0 when no rules exist', async () => {
      vi.mocked(ctx.networkMocker.clearRules).mockResolvedValue(0);

      const res = await request(app)
        .post('/network/mock-clear')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.removed).toBe(0);
    });

    it('returns 500 when clearRules throws', async () => {
      vi.mocked(ctx.networkMocker.clearRules).mockRejectedValueOnce(new Error('clear-rules error'));

      const res = await request(app)
        .post('/network/mock-clear')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('clear-rules error');
    });
  });
});
