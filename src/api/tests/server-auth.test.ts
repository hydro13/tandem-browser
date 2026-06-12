import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from 'express';
import type { PathLike } from 'fs';
import type * as FsModule from 'fs';
import request from 'supertest';

const { logInfo, logWarn, logError } = vi.hoisted(() => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {},
  webContents: {
    fromId: vi.fn().mockReturnValue(null),
    getAllWebContents: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: logInfo,
    warn: logWarn,
    error: logError,
  }),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof FsModule>();
  const token = 'a'.repeat(64);
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn((target: PathLike) => String(target).endsWith('api-token')),
      mkdirSync: vi.fn(),
      readFileSync: vi.fn((target: PathLike) => String(target).endsWith('api-token') ? token : ''),
      writeFileSync: vi.fn(),
    },
  };
});

import { TandemAPI } from '../server';
import { createMockContext } from './helpers';

describe('TandemAPI extension auth', () => {
  const runtimeId = 'abcdefghijklmnopabcdefghijklmnop';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function buildApi() {
    const ctx = createMockContext();
    vi.mocked(ctx.extensionManager.list).mockReturnValue({
      loaded: [{ id: runtimeId, name: 'Helper', path: '/tmp/extensions/helper-ext' }],
      available: [{ name: 'Helper', path: '/tmp/extensions/helper-ext', hasManifest: true, loaded: true }],
    } as any);
    const api = new TandemAPI({
      win: ctx.win as any,
      registry: ctx as any,
    });
    const app = (api as unknown as { app: Application }).app;
    return { api, app, ctx };
  }

  it('allows extension helper routes only when the scoped access decision passes', async () => {
    const { app, ctx } = buildApi();
    vi.mocked(ctx.extensionManager.evaluateApiRouteAccess).mockReturnValue({
      allowed: true,
      level: 'limited',
      routePath: '/extensions/active-tab',
      scope: 'active-tab-read',
      reason: 'Allowed active-tab-read for Helper [limited; runtime=abcdefghijklmnopabcdefghijklmnop, storage=helper-ext]',
      extensionId: runtimeId,
      runtimeId,
      storageId: 'helper-ext',
      extensionName: 'Helper',
      permissions: ['tabs'],
      auditLabel: 'Helper [limited; runtime=abcdefghijklmnopabcdefghijklmnop, storage=helper-ext]',
    });

    const res = await request(app)
      .get('/extensions/active-tab')
      .set('Origin', `chrome-extension://${runtimeId}`);

    expect(res.status).toBe(200);
    expect(ctx.extensionManager.evaluateApiRouteAccess).toHaveBeenCalledWith(runtimeId, '/extensions/active-tab', null);
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Extension API allow GET /extensions/active-tab'));
  });

  it('blocks native messaging when the extension trust decision denies the route', async () => {
    const { app, ctx } = buildApi();
    vi.mocked(ctx.extensionManager.evaluateApiRouteAccess).mockReturnValue({
      allowed: false,
      level: 'limited',
      routePath: '/extensions/native-message',
      scope: 'native-messaging',
      reason: 'Denied native-messaging for Helper [limited; runtime=abcdefghijklmnopabcdefghijklmnop, storage=helper-ext] because this route requires a trusted extension',
      extensionId: runtimeId,
      runtimeId,
      storageId: 'helper-ext',
      extensionName: 'Helper',
      permissions: ['tabs'],
      auditLabel: 'Helper [limited; runtime=abcdefghijklmnopabcdefghijklmnop, storage=helper-ext]',
    });

    const res = await request(app)
      .post('/extensions/native-message')
      .set('Origin', `chrome-extension://${runtimeId}`)
      .send({ host: 'com.example.host', message: { ping: true }, extensionId: runtimeId });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('requires a trusted extension');
    expect(ctx.extensionManager.evaluateApiRouteAccess).toHaveBeenCalledWith(
      runtimeId,
      '/extensions/native-message',
      'com.example.host',
    );
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Extension API block POST /extensions/native-message'));
  });

  it('rejects native messaging bridge requests whose query extensionId does not match the origin', () => {
    const { api } = buildApi();

    const decision = api.authorizeExtensionBridgeRequest({
      originHeader: `chrome-extension://${runtimeId}`,
      requestedExtensionId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      requestedHost: 'com.example.host',
      routePath: '/extensions/native-message/ws',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('does not match requested extension');
  });
});

// ─────────────────────────────────────────────────────────────────────
// CORS origin policy — audit #34 Medium #1
// ─────────────────────────────────────────────────────────────────────

describe('TandemAPI paired-agent startup gate', () => {
  function buildApi() {
    const ctx = createMockContext();
    const api = new TandemAPI({ win: ctx.win as any, registry: ctx as any });
    const app = (api as unknown as { app: Application }).app;
    return { app, ctx };
  }

  function startupStatus(overrides: Partial<{
    required: boolean;
    complete: boolean;
    missingEndpoints: string[];
    nextRequiredEndpoint: string | null;
  }> = {}) {
    return {
      binding: {
        id: 'binding-1',
        machineId: 'machine-1',
        machineName: 'TestMachine',
        agentLabel: 'Codex',
        agentType: 'codex',
        bindingKind: 'local',
        transportModes: ['http'],
        state: 'paired',
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        pausedAt: null,
        revokedAt: null,
        tokenPrefix: 'tdm_ast_12345678',
      },
      required: true,
      complete: false,
      missingEndpoints: ['/skill', '/agent/manifest', '/agent/bootstrap'],
      nextRequiredEndpoint: '/skill',
      ...overrides,
    };
  }

  it('blocks normal API use for new paired agents until startup reads complete', async () => {
    const { app, ctx } = buildApi();
    vi.mocked(ctx.pairingManager.recordStartupRead).mockReturnValue(startupStatus());

    const res = await request(app)
      .get('/tabs/list')
      .set('Authorization', 'Bearer tdm_ast_testtoken');

    expect(res.status).toBe(428);
    expect(res.body.code).toBe('agent_startup_required');
    expect(res.body.nextRequiredRead).toContain('/skill');
    expect(res.body.requiredStartupSequence.map((step: { endpoint: string }) => step.endpoint)).toContain('/agent/bootstrap');
  });

  it('allows the authenticated bootstrap route during paired-agent startup', async () => {
    const { app, ctx } = buildApi();
    vi.mocked(ctx.pairingManager.recordStartupRead).mockReturnValue(startupStatus({
      missingEndpoints: ['/skill', '/agent/manifest'],
      nextRequiredEndpoint: '/skill',
    }));

    const res = await request(app)
      .get('/agent/bootstrap')
      .set('Authorization', 'Bearer tdm_ast_testtoken');

    expect(res.status).toBe(200);
    expect(res.body.docs.llmSkill).toContain('/skill');
  });

  it('allows normal API use once paired-agent startup is complete', async () => {
    const { app, ctx } = buildApi();
    vi.mocked(ctx.pairingManager.recordStartupRead).mockReturnValue(startupStatus({
      complete: true,
      missingEndpoints: [],
      nextRequiredEndpoint: null,
    }));

    const res = await request(app)
      .get('/tabs/list')
      .set('Authorization', 'Bearer tdm_ast_testtoken');

    expect(res.status).toBe(200);
  });

  it('does not gate the legacy local api-token', async () => {
    const { app, ctx } = buildApi();

    const res = await request(app)
      .get('/tabs/list')
      .set('Authorization', `Bearer ${'a'.repeat(64)}`);

    expect(res.status).toBe(200);
    expect(ctx.pairingManager.recordStartupRead).not.toHaveBeenCalled();
  });
});

describe('TandemAPI /watch/live upgrade auth', () => {
  const validToken = 'a'.repeat(64);

  function buildApi() {
    const ctx = createMockContext();
    const api = new TandemAPI({ win: ctx.win as any, registry: ctx as any });
    return { api, ctx };
  }

  function buildUpgradeRequest(opts: {
    headers?: Record<string, string>;
    url?: string;
    remoteAddress?: string;
  } = {}) {
    return {
      url: opts.url ?? '/watch/live',
      headers: opts.headers ?? {},
      socket: { remoteAddress: opts.remoteAddress ?? '127.0.0.1' },
    };
  }

  function authorize(api: TandemAPI, req: unknown): boolean {
    return (api as unknown as { authorizeWatchLiveRequest(req: unknown): boolean }).authorizeWatchLiveRequest(req);
  }

  it('accepts the local api-token via Authorization: Bearer', () => {
    const { api } = buildApi();
    const req = buildUpgradeRequest({ headers: { authorization: `Bearer ${validToken}` } });
    expect(authorize(api, req)).toBe(true);
  });

  it('accepts the local api-token via X-Tandem-Token', () => {
    const { api } = buildApi();
    const req = buildUpgradeRequest({ headers: { 'x-tandem-token': validToken } });
    expect(authorize(api, req)).toBe(true);
  });

  it('rejects a correct token sent as a query parameter', () => {
    const { api } = buildApi();
    const req = buildUpgradeRequest({ url: `/watch/live?token=${validToken}` });
    expect(authorize(api, req)).toBe(false);
  });

  it('rejects missing and invalid tokens', () => {
    const { api } = buildApi();
    expect(authorize(api, buildUpgradeRequest())).toBe(false);
    expect(authorize(api, buildUpgradeRequest({ headers: { authorization: `Bearer ${'b'.repeat(64)}` } }))).toBe(false);
  });

  it('locks out a remote address after repeated failures, even with a valid token', () => {
    const { api } = buildApi();
    for (let i = 0; i < 5; i++) {
      expect(authorize(api, buildUpgradeRequest({
        headers: { authorization: 'Bearer wrong-token' },
        remoteAddress: '10.0.0.9',
      }))).toBe(false);
    }

    expect(authorize(api, buildUpgradeRequest({
      headers: { authorization: `Bearer ${validToken}` },
      remoteAddress: '10.0.0.9',
    }))).toBe(false);

    // Other callers are unaffected.
    expect(authorize(api, buildUpgradeRequest({
      headers: { authorization: `Bearer ${validToken}` },
      remoteAddress: '10.0.0.10',
    }))).toBe(true);
  });
});

describe('TandemAPI CORS policy', () => {
  function buildApi() {
    const ctx = createMockContext();
    const api = new TandemAPI({ win: ctx.win as any, registry: ctx as any });
    const app = (api as unknown as { app: Application }).app;
    return { app, ctx };
  }

  it('allows requests with no Origin header (shell, MCP, curl)', async () => {
    const { app } = buildApi();
    // /status is public so we don't need a token.
    const res = await request(app).get('/status');
    // CORS error would surface as 500 with "CORS not allowed"; we just need
    // to see the request got past the CORS middleware and hit the route.
    expect(res.status).not.toBe(500);
  });

  it('allows file:// origins (Electron shell)', async () => {
    const { app } = buildApi();
    const res = await request(app).get('/status').set('Origin', 'file:///Users/x/shell/index.html');
    expect(res.status).not.toBe(500);
  });

  it('rejects Origin: null (sandboxed iframes, data: URIs — audit #34 Medium #1)', async () => {
    const { app } = buildApi();
    const res = await request(app).get('/status').set('Origin', 'null');
    // cors middleware turns the error into a 500. The body varies by express
    // version; the important contract is "did not get the public /status
    // payload".
    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty('ready');
  });

  it('rejects arbitrary http:// origins from random web pages', async () => {
    const { app } = buildApi();
    const res = await request(app).get('/status').set('Origin', 'https://evil.example');
    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty('ready');
  });

  it('allows the X-Tandem-Shell-Initiated header in CORS preflight', async () => {
    const { app } = buildApi();
    const res = await request(app)
      .options('/security/injection-override')
      .set('Origin', 'file:///')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'X-Tandem-Shell-Initiated, Authorization, Content-Type');
    expect(res.status).toBeLessThan(400);
    const allowed = String(res.headers['access-control-allow-headers'] || '').toLowerCase();
    expect(allowed).toContain('x-tandem-shell-initiated');
  });
});
