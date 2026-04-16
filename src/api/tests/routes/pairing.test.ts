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

import { registerPairingRoutes, detectAddresses } from '../../routes/pairing';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

describe('Pairing Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerPairingRoutes, ctx);
  });

  // ─── POST /pairing/setup-code ─────────────────

  describe('POST /pairing/setup-code', () => {
    it('generates a setup code', async () => {
      vi.mocked(ctx.pairingManager.generateSetupCode).mockReturnValue({
        code: 'TDM-AAAA-BBBB',
        createdAt: Date.now(),
        expiresAt: Date.now() + 300_000,
        consumed: false,
      });

      const res = await request(app).post('/pairing/setup-code');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('TDM-AAAA-BBBB');
      expect(res.body.ttlSeconds).toBeGreaterThan(0);
      expect(res.body.expiresAt).toBeDefined();
    });

    it('returns 429 when rate limited', async () => {
      vi.mocked(ctx.pairingManager.generateSetupCode).mockImplementation(() => {
        throw new Error('Too many setup codes generated');
      });

      const res = await request(app).post('/pairing/setup-code');
      expect(res.status).toBe(429);
    });
  });

  // ─── GET /pairing/setup-code/active ───────────

  describe('GET /pairing/setup-code/active', () => {
    it('returns null when no active code', async () => {
      vi.mocked(ctx.pairingManager.getActiveSetupCode).mockReturnValue(null);

      const res = await request(app).get('/pairing/setup-code/active');
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    it('returns active code', async () => {
      vi.mocked(ctx.pairingManager.getActiveSetupCode).mockReturnValue({
        code: 'TDM-CCCC-DDDD',
        createdAt: Date.now(),
        expiresAt: Date.now() + 200_000,
        consumed: false,
      });

      const res = await request(app).get('/pairing/setup-code/active');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('TDM-CCCC-DDDD');
    });
  });

  // ─── POST /pairing/exchange ───────────────────

  describe('POST /pairing/exchange', () => {
    it('exchanges valid code for token', async () => {
      vi.mocked(ctx.pairingManager.exchangeSetupCode).mockReturnValue({
        token: 'tdm_ast_testtoken',
        binding: {
          id: 'binding-1',
          machineId: 'machine-1',
          machineName: 'TestMachine',
          agentLabel: 'Claude Code',
          agentType: 'claude-code',
          bindingKind: 'local',
          transportModes: ['http'],
          tokenHash: 'hash',
          tokenPrefix: 'tdm_ast_12345678',
          state: 'paired',
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
          pausedAt: null,
          revokedAt: null,
        },
      });

      const res = await request(app)
        .post('/pairing/exchange')
        .send({
          code: 'TDM-AAAA-BBBB',
          machineId: 'machine-1',
          machineName: 'TestMachine',
          agentLabel: 'Claude Code',
          agentType: 'claude-code',
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('tdm_ast_testtoken');
      expect(res.body.binding.id).toBe('binding-1');
      expect(res.body.binding.state).toBe('paired');
      // No mcp field when transport doesn't include 'mcp'
      expect(res.body.mcp).toBeUndefined();
    });

    it('includes MCP endpoint when transport includes mcp', async () => {
      vi.mocked(ctx.pairingManager.exchangeSetupCode).mockReturnValue({
        token: 'tdm_ast_mcptoken',
        binding: {
          id: 'binding-2',
          machineId: 'machine-2',
          machineName: 'RemoteMachine',
          agentLabel: 'Remote Claude',
          agentType: 'claude-code',
          bindingKind: 'remote',
          transportModes: ['http', 'mcp'],
          tokenHash: 'hash2',
          tokenPrefix: 'tdm_ast_mcp12345',
          state: 'paired',
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
          pausedAt: null,
          revokedAt: null,
        },
      });

      const res = await request(app)
        .post('/pairing/exchange')
        .send({
          code: 'TDM-AAAA-CCCC',
          machineId: 'machine-2',
          machineName: 'RemoteMachine',
          agentLabel: 'Remote Claude',
          agentType: 'claude-code',
          bindingKind: 'remote',
          transport: ['http', 'mcp'],
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('tdm_ast_mcptoken');
      expect(res.body.mcp).toBeDefined();
      expect(res.body.mcp.endpoint).toBe('/mcp');
      expect(res.body.mcp.transport).toBe('streamable-http');
    });

    it('rejects missing required fields', async () => {
      const res = await request(app)
        .post('/pairing/exchange')
        .send({ code: 'TDM-AAAA-BBBB' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('machineId');
    });

    it('rejects invalid code format', async () => {
      const res = await request(app)
        .post('/pairing/exchange')
        .send({
          code: 'INVALID',
          machineId: 'machine-1',
          machineName: 'Test',
          agentLabel: 'Agent',
          agentType: 'test',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid setup code format');
    });

    it('returns 400 for expired code', async () => {
      vi.mocked(ctx.pairingManager.exchangeSetupCode).mockImplementation(() => {
        throw new Error('This setup code has expired');
      });

      const res = await request(app)
        .post('/pairing/exchange')
        .send({
          code: 'TDM-AAAA-BBBB',
          machineId: 'machine-1',
          machineName: 'Test',
          agentLabel: 'Agent',
          agentType: 'test',
        });

      expect(res.status).toBe(400);
    });

    it('passes bindingKind and transport to manager', async () => {
      vi.mocked(ctx.pairingManager.exchangeSetupCode).mockReturnValue({
        token: 'tdm_ast_testtoken',
        binding: {
          id: 'binding-1',
          machineId: 'machine-1',
          machineName: 'RemoteMachine',
          agentLabel: 'Claude Code',
          agentType: 'claude-code',
          bindingKind: 'remote',
          transportModes: ['http'],
          tokenHash: 'hash',
          tokenPrefix: 'tdm_ast_12345678',
          state: 'paired',
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
          pausedAt: null,
          revokedAt: null,
        },
      });

      await request(app)
        .post('/pairing/exchange')
        .send({
          code: 'TDM-AAAA-BBBB',
          machineId: 'machine-1',
          machineName: 'RemoteMachine',
          agentLabel: 'Claude Code',
          agentType: 'claude-code',
          bindingKind: 'remote',
          transport: ['http'],
        });

      expect(ctx.pairingManager.exchangeSetupCode).toHaveBeenCalledWith(
        expect.objectContaining({
          bindingKind: 'remote',
          transport: ['http'],
        }),
        expect.anything(),
      );
    });

    it('defaults bindingKind to local when not specified', async () => {
      vi.mocked(ctx.pairingManager.exchangeSetupCode).mockReturnValue({
        token: 'tdm_ast_testtoken',
        binding: { id: 'b1', state: 'paired' } as any,
      });

      await request(app)
        .post('/pairing/exchange')
        .send({
          code: 'TDM-AAAA-BBBB',
          machineId: 'machine-1',
          machineName: 'Test',
          agentLabel: 'Agent',
          agentType: 'test',
        });

      expect(ctx.pairingManager.exchangeSetupCode).toHaveBeenCalledWith(
        expect.objectContaining({
          bindingKind: 'local',
          transport: ['http'],
        }),
        expect.anything(),
      );
    });

    it('returns 500 for unexpected errors', async () => {
      vi.mocked(ctx.pairingManager.exchangeSetupCode).mockImplementation(() => {
        throw new Error('Unexpected database failure');
      });

      const res = await request(app)
        .post('/pairing/exchange')
        .send({
          code: 'TDM-AAAA-BBBB',
          machineId: 'machine-1',
          machineName: 'Test',
          agentLabel: 'Agent',
          agentType: 'test',
        });

      expect(res.status).toBe(500);
    });
  });

  // ─── GET /pairing/whoami ──────────────────────

  describe('GET /pairing/whoami', () => {
    it('returns binding info for valid token', async () => {
      vi.mocked(ctx.pairingManager.whoami).mockReturnValue({
        id: 'binding-1',
        machineId: 'machine-1',
        machineName: 'TestMachine',
        agentLabel: 'Claude Code',
        agentType: 'claude-code',
        bindingKind: 'local',
        transportModes: ['http'],
        state: 'paired',
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        pausedAt: null,
        revokedAt: null,
        tokenPrefix: 'tdm_ast_12345678',
      });

      const res = await request(app)
        .get('/pairing/whoami')
        .set('Authorization', 'Bearer tdm_ast_testtoken');

      expect(res.status).toBe(200);
      expect(res.body.agentLabel).toBe('Claude Code');
    });

    it('returns 401 without auth header', async () => {
      const res = await request(app).get('/pairing/whoami');
      expect(res.status).toBe(401);
    });

    it('returns 401 for invalid token', async () => {
      vi.mocked(ctx.pairingManager.whoami).mockReturnValue(null);

      const res = await request(app)
        .get('/pairing/whoami')
        .set('Authorization', 'Bearer tdm_ast_invalid');

      expect(res.status).toBe(401);
    });
  });

  // ─── GET /pairing/bindings ────────────────────

  describe('GET /pairing/bindings', () => {
    it('returns bindings list', async () => {
      vi.mocked(ctx.pairingManager.listBindings).mockReturnValue([
        {
          id: 'binding-1',
          machineId: 'machine-1',
          machineName: 'TestMachine',
          agentLabel: 'Claude Code',
          agentType: 'claude-code',
          bindingKind: 'local',
          transportModes: ['http'],
          state: 'paired',
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
          pausedAt: null,
          revokedAt: null,
          tokenPrefix: 'tdm_ast_12345678',
        },
      ]);

      const res = await request(app).get('/pairing/bindings');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].agentLabel).toBe('Claude Code');
    });
  });

  // ─── Binding state transitions ────────────────

  describe('POST /pairing/bindings/:id/pause', () => {
    it('pauses a binding', async () => {
      vi.mocked(ctx.pairingManager.pauseBinding).mockReturnValue({ state: 'paused' } as any);

      const res = await request(app).post('/pairing/bindings/binding-1/pause');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.state).toBe('paused');
    });

    it('returns 404 for non-pausable binding', async () => {
      vi.mocked(ctx.pairingManager.pauseBinding).mockReturnValue(null);

      const res = await request(app).post('/pairing/bindings/non-existent/pause');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /pairing/bindings/:id/resume', () => {
    it('resumes a paused binding', async () => {
      vi.mocked(ctx.pairingManager.resumeBinding).mockReturnValue({ state: 'paired' } as any);

      const res = await request(app).post('/pairing/bindings/binding-1/resume');
      expect(res.status).toBe(200);
      expect(res.body.state).toBe('paired');
    });

    it('returns 404 for non-resumable binding', async () => {
      vi.mocked(ctx.pairingManager.resumeBinding).mockReturnValue(null);

      const res = await request(app).post('/pairing/bindings/binding-1/resume');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /pairing/bindings/:id/revoke', () => {
    it('revokes a binding', async () => {
      vi.mocked(ctx.pairingManager.revokeBinding).mockReturnValue({ state: 'revoked' } as any);

      const res = await request(app).post('/pairing/bindings/binding-1/revoke');
      expect(res.status).toBe(200);
      expect(res.body.state).toBe('revoked');
    });
  });

  describe('DELETE /pairing/bindings/:id', () => {
    it('removes a binding', async () => {
      vi.mocked(ctx.pairingManager.removeBinding).mockReturnValue(true);

      const res = await request(app).delete('/pairing/bindings/binding-1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 404 for non-existent binding', async () => {
      vi.mocked(ctx.pairingManager.removeBinding).mockReturnValue(false);

      const res = await request(app).delete('/pairing/bindings/non-existent');
      expect(res.status).toBe(404);
    });
  });

  // ─── GET /pairing/addresses ───────────────────

  describe('GET /pairing/addresses', () => {
    it('returns local and tailscale address info', async () => {
      const res = await request(app).get('/pairing/addresses');
      expect(res.status).toBe(200);
      expect(res.body.local).toBeDefined();
      expect(res.body.local.address).toContain('127.0.0.1');
      expect(res.body.local.hostname).toBeDefined();
      expect(res.body.tailscale).toBeDefined();
      expect(typeof res.body.tailscale.available).toBe('boolean');
    });
  });
});

// ─── detectAddresses unit tests ─────────────────

describe('detectAddresses', () => {
  it('always returns local address', () => {
    const result = detectAddresses();
    expect(result.local.address).toContain('127.0.0.1');
    expect(result.local.address).toContain('8765');
    expect(result.local.hostname).toBeTruthy();
  });

  it('returns tailscale.available as boolean', () => {
    const result = detectAddresses();
    expect(typeof result.tailscale.available).toBe('boolean');
  });

  it('tailscale address is null when not available', () => {
    const result = detectAddresses();
    if (!result.tailscale.available) {
      expect(result.tailscale.address).toBeNull();
      expect(result.tailscale.hostname).toBeNull();
    }
  });

  it('tailscale address contains 100.x when available', () => {
    const result = detectAddresses();
    if (result.tailscale.available) {
      expect(result.tailscale.address).toContain('100.');
      expect(result.tailscale.address).toContain('8765');
    }
  });
});
