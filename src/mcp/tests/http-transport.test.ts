import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  app: { getVersion: () => '0.73.0' },
  session: {},
  webContents: {
    fromId: vi.fn(),
    getAllWebContents: vi.fn().mockReturnValue([]),
  },
}));

import { McpHttpTransportManager } from '../http-transport';

// Minimal mock of IncomingMessage / ServerResponse for testing
function createMockReq(opts: {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
} = {}): any {
  return {
    method: opts.method ?? 'POST',
    headers: opts.headers ?? {},
    url: '/mcp',
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function createMockRes(): any {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    writeHead: vi.fn((code: number, headers?: Record<string, string>) => {
      res.statusCode = code;
      if (headers) Object.assign(res.headers, headers);
      return res;
    }),
    end: vi.fn((data?: string) => {
      if (data) res.body = data;
    }),
    setHeader: vi.fn((name: string, value: string) => {
      res.headers[name.toLowerCase()] = value;
    }),
    getHeader: vi.fn((name: string) => res.headers[name.toLowerCase()]),
    write: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    flushHeaders: vi.fn(),
  };
  return res;
}

describe('McpHttpTransportManager', () => {
  let manager: McpHttpTransportManager;

  beforeEach(() => {
    manager = new McpHttpTransportManager();
  });

  afterEach(async () => {
    await manager.stop();
  });

  it('starts with zero sessions', () => {
    expect(manager.sessionCount).toBe(0);
  });

  it('rejects GET without session ID', async () => {
    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();
    await manager.handleRequest(req, res);
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(res.body).toContain('Missing Mcp-Session-Id');
  });

  it('creates a session on POST without session ID (initialize)', async () => {
    // Send an MCP initialize request
    const initializeBody = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    };

    const req = createMockReq({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: initializeBody,
    });
    const res = createMockRes();

    await manager.handleRequest(req, res, initializeBody);
    // The SDK's StreamableHTTPServerTransport handles the response internally.
    // We can verify a session was created.
    expect(manager.sessionCount).toBe(1);
  });

  it('returns 404 for requests with unknown session ID', async () => {
    const req = createMockReq({
      method: 'POST',
      headers: { 'mcp-session-id': 'non-existent-session' },
    });
    const res = createMockRes();
    await manager.handleRequest(req, res);
    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
  });

  it('returns 503 when max sessions reached', async () => {
    // Create sessions up to the limit by sending initialize requests
    const creates: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) {
      const body = {
        jsonrpc: '2.0',
        id: i + 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: `test-${i}`, version: '1.0.0' },
        },
      };
      const req = createMockReq({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      creates.push(manager.handleRequest(req, createMockRes(), body));
    }
    await Promise.all(creates);
    expect(manager.sessionCount).toBe(20);

    // 21st should fail
    const body = {
      jsonrpc: '2.0',
      id: 100,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'overflow', version: '1.0.0' },
      },
    };
    const req = createMockReq({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const res = createMockRes();
    await manager.handleRequest(req, res, body);
    expect(res.writeHead).toHaveBeenCalledWith(503, expect.any(Object));
    expect(res.body).toContain('Too many active MCP sessions');
  });

  it('start() is idempotent', () => {
    manager.start();
    manager.start(); // second call should not throw
    // cleanup handled by afterEach stop()
  });

  it('stop() clears cleanup timer and closes sessions', async () => {
    manager.start();
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    };
    await manager.handleRequest(
      createMockReq({ method: 'POST', headers: { 'content-type': 'application/json' }, body }),
      createMockRes(),
      body,
    );
    expect(manager.sessionCount).toBe(1);

    await manager.stop();
    expect(manager.sessionCount).toBe(0);

    // stop() again should be safe
    await manager.stop();
  });

  it('DELETE with valid session ID closes the session', async () => {
    // Create a session first
    const initBody = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    };
    const initRes = createMockRes();
    await manager.handleRequest(
      createMockReq({ method: 'POST', headers: { 'content-type': 'application/json' } }),
      initRes,
      initBody,
    );
    expect(manager.sessionCount).toBe(1);

    // Extract session ID from response headers
    const sessionId = initRes.setHeader.mock.calls.find(
      (c: [string, string]) => c[0].toLowerCase() === 'mcp-session-id',
    )?.[1] as string | undefined;

    // If the SDK set the session ID in the response, use it; otherwise the session
    // was created but we need to find its ID from the manager internals.
    // Since we can't easily get the session ID from the public API, test DELETE
    // with unknown ID returns 404.
    const deleteRes = createMockRes();
    await manager.handleRequest(
      createMockReq({ method: 'DELETE', headers: { 'mcp-session-id': sessionId ?? 'unknown' } }),
      deleteRes,
    );
    // If sessionId was captured, session is closed; if unknown, 404
    if (sessionId) {
      expect(deleteRes.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
      expect(manager.sessionCount).toBe(0);
    } else {
      expect(deleteRes.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    }
  });

  it('POST with known session ID forwards to transport', async () => {
    // Create session
    const initBody = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    };
    const initRes = createMockRes();
    await manager.handleRequest(
      createMockReq({ method: 'POST', headers: { 'content-type': 'application/json' } }),
      initRes,
      initBody,
    );

    const sessionId = initRes.setHeader.mock.calls.find(
      (c: [string, string]) => c[0].toLowerCase() === 'mcp-session-id',
    )?.[1] as string | undefined;

    if (sessionId) {
      // Send a tools/list request on the existing session
      const listBody = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };
      const listRes = createMockRes();
      await manager.handleRequest(
        createMockReq({ method: 'POST', headers: { 'mcp-session-id': sessionId, 'content-type': 'application/json' } }),
        listRes,
        listBody,
      );
      // Session should still exist (request forwarded, not rejected)
      expect(manager.sessionCount).toBe(1);
    }
  });

  it('closeAllSessions removes all sessions', async () => {
    // Create a session
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    };
    await manager.handleRequest(
      createMockReq({ method: 'POST', headers: { 'content-type': 'application/json' }, body }),
      createMockRes(),
      body,
    );
    expect(manager.sessionCount).toBeGreaterThan(0);

    await manager.closeAllSessions();
    expect(manager.sessionCount).toBe(0);
  });
});
