/**
 * Route tests for `/security/agent-trust/*`.
 *
 * Full happy-path + validation + rate-limit coverage for the 9 routes
 * registered by `registerAgentTrustRoutes`. The underlying
 * `AgentTrustStore` is already exhaustively unit-tested (41 cases in
 * `src/security/tests/agent-trust.test.ts`); this file focuses on the
 * HTTP surface: input validation, domain normalization, rate limiting,
 * and the agent-initiated approval-flow integration.
 */

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

import { registerAgentTrustRoutes } from '../../routes/agent-trust';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

describe('Agent Trust Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerAgentTrustRoutes, ctx);
  });

  describe('GET /security/agent-trust', () => {
    it('returns empty snapshot for unknown agents', async () => {
      const res = await request(app).get('/security/agent-trust');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('agents');
      expect(Array.isArray(res.body.agents)).toBe(true);
    });

    it('includes the requesting agent even when it has no state', async () => {
      const res = await request(app)
        .get('/security/agent-trust')
        .set('Authorization', 'Bearer abc');
      expect(res.status).toBe(200);
      expect(res.body.agents).toEqual(expect.arrayContaining([
        expect.objectContaining({ agentId: 'local', trustedDomains: [] }),
      ]));
    });

    it('shows granted trusted domains for an agent', async () => {
      ctx.agentTrust.grantTrustedDomain('claude', 'funda.nl');
      ctx.agentTrust.grantTrustedDomain('claude', 'linkedin.com');
      const res = await request(app).get('/security/agent-trust');
      const claude = res.body.agents.find((a: { agentId: string }) => a.agentId === 'claude');
      expect(claude).toBeDefined();
      expect(claude.trustedDomains).toEqual(['funda.nl', 'linkedin.com']);
    });
  });

  describe('POST /security/agent-trust/grant-domain-window', () => {
    it('grants a 15min window and returns a fresh snapshot', async () => {
      const res = await request(app)
        .post('/security/agent-trust/grant-domain-window')
        .send({ agentId: 'claude', domain: 'funda.nl', durationLabel: '15min' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.snapshot.perDomainWindows).toHaveLength(1);
      expect(res.body.snapshot.perDomainWindows[0].domain).toBe('funda.nl');
      expect(ctx.agentTrust.isApproved('claude', 'funda.nl')).toBe(true);
    });

    it('normalizes full URLs to the bare hostname', async () => {
      const res = await request(app)
        .post('/security/agent-trust/grant-domain-window')
        .send({ agentId: 'claude', domain: 'https://www.funda.nl/zoeken', durationLabel: '1hour' });
      expect(res.status).toBe(200);
      expect(res.body.snapshot.perDomainWindows[0].domain).toBe('www.funda.nl');
    });

    it('returns 400 for missing agentId', async () => {
      const res = await request(app)
        .post('/security/agent-trust/grant-domain-window')
        .send({ domain: 'funda.nl', durationLabel: '15min' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid domain schemes', async () => {
      const res = await request(app)
        .post('/security/agent-trust/grant-domain-window')
        .send({ agentId: 'claude', domain: 'file:///etc/passwd', durationLabel: '15min' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for unknown durationLabel', async () => {
      const res = await request(app)
        .post('/security/agent-trust/grant-domain-window')
        .send({ agentId: 'claude', domain: 'funda.nl', durationLabel: '5min' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /security/agent-trust/grant-trusted-domain', () => {
    it('adds a persistent trusted domain', async () => {
      const res = await request(app)
        .post('/security/agent-trust/grant-trusted-domain')
        .send({ agentId: 'claude', domain: 'linkedin.com' });
      expect(res.status).toBe(200);
      expect(ctx.agentTrust.isApproved('claude', 'linkedin.com')).toBe(true);
      expect(res.body.snapshot.trustedDomains).toContain('linkedin.com');
    });

    it('rejects invalid domains', async () => {
      const res = await request(app)
        .post('/security/agent-trust/grant-trusted-domain')
        .send({ agentId: 'claude', domain: 'not a domain' });
      expect(res.status).toBe(400);
    });

    it('requires agentId', async () => {
      const res = await request(app)
        .post('/security/agent-trust/grant-trusted-domain')
        .send({ domain: 'linkedin.com' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /security/agent-trust/grant-global-window', () => {
    it('grants a 30-minute global window', async () => {
      const res = await request(app)
        .post('/security/agent-trust/grant-global-window')
        .send({ agentId: 'claude', minutes: 30 });
      expect(res.status).toBe(200);
      expect(res.body.snapshot.globalWindow).not.toBeNull();
      expect(res.body.snapshot.globalWindow.minutes).toBe(30);
      expect(ctx.agentTrust.isApproved('claude', 'any-domain.com')).toBe(true);
    });

    it('grants a 60-minute global window', async () => {
      const res = await request(app)
        .post('/security/agent-trust/grant-global-window')
        .send({ agentId: 'claude', minutes: 60 });
      expect(res.status).toBe(200);
      expect(res.body.snapshot.globalWindow.minutes).toBe(60);
    });

    it('rejects invalid durations', async () => {
      for (const bad of [15, 45, 90, 120, 0, -1]) {
        const res = await request(app)
          .post('/security/agent-trust/grant-global-window')
          .send({ agentId: 'claude', minutes: bad });
        expect(res.status).toBe(400);
      }
    });

    it('requires agentId', async () => {
      const res = await request(app)
        .post('/security/agent-trust/grant-global-window')
        .send({ minutes: 30 });
      expect(res.status).toBe(400);
    });
  });

  describe('revoke routes', () => {
    it('revoke-domain-window removes the window', async () => {
      ctx.agentTrust.grantDomainWindow('claude', 'funda.nl', '15min');
      const res = await request(app)
        .post('/security/agent-trust/revoke-domain-window')
        .send({ agentId: 'claude', domain: 'funda.nl' });
      expect(res.status).toBe(200);
      expect(ctx.agentTrust.isApproved('claude', 'funda.nl')).toBe(false);
    });

    it('revoke-trusted-domain removes the domain', async () => {
      ctx.agentTrust.grantTrustedDomain('claude', 'linkedin.com');
      const res = await request(app)
        .post('/security/agent-trust/revoke-trusted-domain')
        .send({ agentId: 'claude', domain: 'linkedin.com' });
      expect(res.status).toBe(200);
      expect(ctx.agentTrust.isApproved('claude', 'linkedin.com')).toBe(false);
    });

    it('revoke-global-window clears it', async () => {
      ctx.agentTrust.grantGlobalWindow('claude', 30);
      const res = await request(app)
        .post('/security/agent-trust/revoke-global-window')
        .send({ agentId: 'claude' });
      expect(res.status).toBe(200);
      expect(ctx.agentTrust.isApproved('claude', 'any.com')).toBe(false);
    });

    it('revoke-all clears T2/T3/T4 for an agent', async () => {
      ctx.agentTrust.grantDomainWindow('claude', 'a.com', '15min');
      ctx.agentTrust.grantTrustedDomain('claude', 'b.com');
      ctx.agentTrust.grantGlobalWindow('claude', 60);
      const res = await request(app)
        .post('/security/agent-trust/revoke-all')
        .send({ agentId: 'claude' });
      expect(res.status).toBe(200);
      expect(ctx.agentTrust.isApproved('claude', 'a.com')).toBe(false);
      expect(ctx.agentTrust.isApproved('claude', 'b.com')).toBe(false);
      expect(ctx.agentTrust.isApproved('claude', 'c.com')).toBe(false);
    });

    it('all revoke routes require agentId', async () => {
      for (const route of [
        'revoke-domain-window',
        'revoke-trusted-domain',
        'revoke-global-window',
        'revoke-all',
      ]) {
        const res = await request(app).post(`/security/agent-trust/${route}`).send({});
        expect(res.status).toBe(400);
      }
    });
  });

  describe('POST /security/agent-trust/request-trusted-domain', () => {
    it('grants on user approval', async () => {
      vi.mocked(ctx.taskManager.requestApproval).mockResolvedValue(true);
      const res = await request(app)
        .post('/security/agent-trust/request-trusted-domain')
        .send({ domain: 'funda.nl', rationale: 'Iterative overlay work' });
      expect(res.status).toBe(200);
      expect(res.body.domain).toBe('funda.nl');
      expect(ctx.agentTrust.isApproved('shell', 'funda.nl')).toBe(true);
      expect(ctx.taskManager.createTask).toHaveBeenCalled();
    });

    it('returns 403 when user rejects', async () => {
      vi.mocked(ctx.taskManager.requestApproval).mockResolvedValue(false);
      const res = await request(app)
        .post('/security/agent-trust/request-trusted-domain')
        .send({ domain: 'funda.nl', rationale: 'Iterative overlay work' });
      expect(res.status).toBe(403);
      expect(res.body.rejected).toBe(true);
      expect(ctx.agentTrust.isApproved('shell', 'funda.nl')).toBe(false);
    });

    it('validates rationale minimum length', async () => {
      const res = await request(app)
        .post('/security/agent-trust/request-trusted-domain')
        .send({ domain: 'funda.nl', rationale: 'short' });
      expect(res.status).toBe(400);
    });

    it('validates domain format', async () => {
      const res = await request(app)
        .post('/security/agent-trust/request-trusted-domain')
        .send({ domain: '', rationale: 'long enough rationale' });
      expect(res.status).toBe(400);
    });

    it('rate-limits repeat requests from the same agent', async () => {
      vi.mocked(ctx.taskManager.requestApproval).mockResolvedValue(true);
      const first = await request(app)
        .post('/security/agent-trust/request-trusted-domain')
        .send({ domain: 'a.com', rationale: 'first request ever happens now' });
      expect(first.status).toBe(200);

      const second = await request(app)
        .post('/security/agent-trust/request-trusted-domain')
        .send({ domain: 'b.com', rationale: 'immediate second request which should 429' });
      expect(second.status).toBe(429);
      expect(second.body.retryAfterMs).toBeGreaterThan(0);
    });
  });

  describe('POST /security/agent-trust/request-global-window', () => {
    it('grants on user approval (30 min)', async () => {
      vi.mocked(ctx.taskManager.requestApproval).mockResolvedValue(true);
      const res = await request(app)
        .post('/security/agent-trust/request-global-window')
        .send({ minutes: 30, rationale: 'Cross-site research sweep' });
      expect(res.status).toBe(200);
      expect(res.body.minutes).toBe(30);
      expect(ctx.agentTrust.isApproved('shell', 'any.com')).toBe(true);
    });

    it('rejects 15 or 120 minutes', async () => {
      for (const bad of [15, 120]) {
        const res = await request(app)
          .post('/security/agent-trust/request-global-window')
          .send({ minutes: bad, rationale: 'Valid rationale string' });
        expect(res.status).toBe(400);
      }
    });

    it('returns 403 when user rejects', async () => {
      vi.mocked(ctx.taskManager.requestApproval).mockResolvedValue(false);
      const res = await request(app)
        .post('/security/agent-trust/request-global-window')
        .send({ minutes: 30, rationale: 'Valid rationale string' });
      expect(res.status).toBe(403);
    });

    it('requires rationale', async () => {
      const res = await request(app)
        .post('/security/agent-trust/request-global-window')
        .send({ minutes: 30 });
      expect(res.status).toBe(400);
    });
  });
});
