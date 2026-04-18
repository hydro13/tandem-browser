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
