import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import { once } from 'node:events';

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

/**
 * Spin up a tiny HTTP server that wires each request through the manager,
 * so the SDK's StreamableHTTPServerTransport gets real Node.js req/res objects.
 */
function createTestServer(manager: McpHttpTransportManager) {
  const server = http.createServer(async (req, res) => {
    // Collect body
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const rawBody = Buffer.concat(chunks).toString('utf-8');
    const body = rawBody ? JSON.parse(rawBody) : undefined;
    await manager.handleRequest(req, res, body);
  });
  return server;
}

async function startServer(server: http.Server): Promise<number> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const addr = server.address() as { port: number };
  return addr.port;
}

async function mcpFetch(port: number, opts: {
  method?: string;
  sessionId?: string;
  body?: unknown;
  token?: string;
}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: unknown; raw: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  if (opts.sessionId) headers['mcp-session-id'] = opts.sessionId;

  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: opts.method ?? 'POST',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const raw = await res.text();
  let body: unknown;
  try { body = JSON.parse(raw); } catch {
    // SSE response — parse the event data
    const match = raw.match(/^data: (.+)$/m);
    body = match ? JSON.parse(match[1]) : raw;
  }
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body,
    raw,
  };
}

function initializeBody(id = 1) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    },
  };
}

describe('McpHttpTransportManager', () => {
  let manager: McpHttpTransportManager;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    manager = new McpHttpTransportManager();
    server = createTestServer(manager);
    port = await startServer(server);
  });

  afterEach(async () => {
    await manager.stop();
    server.close();
  });

  it('starts with zero sessions', () => {
    expect(manager.sessionCount).toBe(0);
  });

  it('rejects GET without session ID', async () => {
    const res = await mcpFetch(port, { method: 'GET' });
    expect(res.status).toBe(400);
  });

  it('creates a session on initialize and returns session ID', async () => {
    const res = await mcpFetch(port, { body: initializeBody() });
    expect(res.status).toBe(200);
    expect(res.headers['mcp-session-id']).toBeDefined();
    expect(manager.sessionCount).toBe(1);
  });

  it('handles subsequent requests on existing session', async () => {
    // Initialize
    const initRes = await mcpFetch(port, { body: initializeBody() });
    const sessionId = initRes.headers['mcp-session-id'] as string;
    expect(sessionId).toBeDefined();

    // Send initialized notification (required by protocol before tool calls)
    await mcpFetch(port, {
      sessionId,
      body: { jsonrpc: '2.0', method: 'notifications/initialized' },
    });

    // List tools
    const toolsRes = await mcpFetch(port, {
      sessionId,
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    });
    expect(toolsRes.status).toBe(200);
    // Should contain tandem tools
    const data = toolsRes.body as any;
    expect(data.result?.tools?.length).toBeGreaterThan(200);
    expect(manager.sessionCount).toBe(1);
  });

  it('returns 404 for unknown session ID', async () => {
    const res = await mcpFetch(port, {
      sessionId: 'non-existent',
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    });
    expect(res.status).toBe(404);
  });

  it('DELETE closes a session', async () => {
    const initRes = await mcpFetch(port, { body: initializeBody() });
    const sessionId = initRes.headers['mcp-session-id'] as string;
    expect(manager.sessionCount).toBe(1);

    const delRes = await mcpFetch(port, { method: 'DELETE', sessionId });
    expect(delRes.status).toBe(200);
    expect(manager.sessionCount).toBe(0);
  });

  it('start() and stop() manage cleanup timer', async () => {
    manager.start();
    manager.start(); // idempotent

    const initRes = await mcpFetch(port, { body: initializeBody() });
    expect(initRes.headers['mcp-session-id']).toBeDefined();
    expect(manager.sessionCount).toBe(1);

    await manager.stop();
    expect(manager.sessionCount).toBe(0);

    // safe to call again
    await manager.stop();
  });

  it('closeAllSessions removes all sessions', async () => {
    await mcpFetch(port, { body: initializeBody(1) });
    await mcpFetch(port, { body: initializeBody(2) });
    expect(manager.sessionCount).toBe(2);

    await manager.closeAllSessions();
    expect(manager.sessionCount).toBe(0);
  });

  it('returns 503 when max sessions (20) reached', async () => {
    // Create 20 sessions
    for (let i = 0; i < 20; i++) {
      const res = await mcpFetch(port, { body: initializeBody(i + 1) });
      expect(res.status).toBe(200);
    }
    expect(manager.sessionCount).toBe(20);

    // 21st should fail
    const res = await mcpFetch(port, { body: initializeBody(100) });
    expect(res.status).toBe(503);
  });
});
