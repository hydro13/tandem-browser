import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  app: { getVersion: () => '0.73.0' },
  session: {},
  webContents: {
    fromId: vi.fn(),
    getAllWebContents: vi.fn().mockReturnValue([]),
  },
}));

import { registerBootstrapRoutes } from '../../routes/bootstrap';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

describe('Bootstrap Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerBootstrapRoutes, ctx);
  });

  describe('GET /agent', () => {
    it('returns markdown bootstrap page', async () => {
      const res = await request(app).get('/agent');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.text).toContain('Tandem Browser');
      expect(res.text).toContain('TDM-XXXX-XXXX');
    });

    it('includes version in bootstrap page', async () => {
      const res = await request(app).get('/agent');
      expect(res.text).toContain('0.73.0');
    });

    it('uses Host header for base URL', async () => {
      const res = await request(app).get('/agent').set('Host', '100.64.0.1:8765');
      expect(res.text).toContain('http://100.64.0.1:8765');
    });

    it('mentions Tailscale-only for remote', async () => {
      const res = await request(app).get('/agent');
      expect(res.text).toContain('Tailscale');
      expect(res.text).toContain('never exposed to the public internet');
    });
  });

  describe('GET /agent/version', () => {
    it('returns version and capability info', async () => {
      const res = await request(app).get('/agent/version');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('tandem-browser');
      expect(res.body.version).toBe('0.73.0');
      expect(res.body.capabilityFamilies).toContain('browser');
      expect(res.body.transports.http.available).toBe(true);
      expect(res.body.transports.http.remote).toBe(true);
      expect(res.body.transports.mcp.available).toBe(true);
      expect(res.body.transports.mcp.remote).toBe(false);
      expect(res.body.pairingSupported).toBe(true);
    });
  });

  describe('GET /agent/manifest', () => {
    it('returns full manifest', async () => {
      const res = await request(app).get('/agent/manifest');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('tandem-browser');
      expect(res.body.pairing.setupCodeFormat).toBe('TDM-XXXX-XXXX');
      expect(res.body.pairing.exchangeEndpoint).toBe('/pairing/exchange');
      expect(res.body.endpoints.bootstrap).toBeDefined();
      expect(res.body.endpoints.pairing).toBeDefined();
    });

    it('uses Host header for baseUrl', async () => {
      const res = await request(app).get('/agent/manifest').set('Host', '100.64.0.1:8765');
      expect(res.body.baseUrl).toBe('http://100.64.0.1:8765');
    });

    it('includes major endpoint families for remote discovery', async () => {
      const res = await request(app).get('/agent/manifest');
      const families = Object.keys(res.body.endpoints);
      expect(families).toContain('browser');
      expect(families).toContain('tabs');
      expect(families).toContain('snapshots');
      expect(families).toContain('devtools');
      expect(families).toContain('network');
      expect(families).toContain('sessions');
      expect(families).toContain('content');
      expect(families).toContain('agents');
      expect(families).toContain('handoffs');
      expect(families).toContain('awareness');
      expect(families).toContain('clipboard');
      expect(families).toContain('previews');
      expect(families).toContain('workspaces');
      expect(families).toContain('pinboards');
      expect(families).toContain('watch');
      expect(families).toContain('config');
      expect(families).toContain('localOnly');
    });

    it('includes skill endpoint in bootstrap section', async () => {
      const res = await request(app).get('/agent/manifest');
      expect(res.body.endpoints.bootstrap.skill).toBeDefined();
      expect(res.body.endpoints.bootstrap.skill.path).toBe('/skill');
    });

    it('marks local-only endpoints explicitly', async () => {
      const res = await request(app).get('/agent/manifest');
      expect(res.body.endpoints.localOnly._note).toContain('not available to remote agents');
      expect(res.body.endpoints.localOnly.pickFolder.path).toBe('/dialog/pick-folder');
    });
  });

  describe('GET /skill', () => {
    it('returns markdown skill page', async () => {
      const res = await request(app).get('/skill');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.text).toContain('Tandem Browser Skill');
      expect(res.text).toContain('snapshot');
    });

    it('distinguishes local MCP from remote HTTP', async () => {
      const res = await request(app).get('/skill');
      expect(res.text).toContain('Remote agents should use the HTTP API');
      expect(res.text).toContain('MCP');
      expect(res.text).not.toContain('127.0.0.1');
    });

    it('uses Host header for URLs', async () => {
      const res = await request(app).get('/skill').set('Host', '100.64.0.1:8765');
      expect(res.text).toContain('http://100.64.0.1:8765');
    });
  });
});
