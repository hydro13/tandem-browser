import { createServer, type Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { GatekeeperWebSocket } from '../gatekeeper-ws';

const TEST_SECRET = 'a'.repeat(64);

function createGatekeeperHarness(server: Server): GatekeeperWebSocket {
  const guardian = {
    submitDecision: vi.fn(),
    setMode: vi.fn(),
  };
  const db = {
    logEvent: vi.fn(),
    upsertDomain: vi.fn(),
  };
  return new GatekeeperWebSocket(server, guardian as never, db as never);
}

function connect(port: number, opts: { headers?: Record<string, string>; query?: string } = {}): Promise<{ open: boolean; error?: Error }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/security/gatekeeper${opts.query ?? ''}`,
      { headers: opts.headers },
    );
    ws.once('open', () => {
      ws.close();
      resolve({ open: true });
    });
    ws.once('error', (error: Error) => resolve({ open: false, error }));
  });
}

describe('GatekeeperWebSocket auth', () => {
  let server: Server;
  let port: number;
  let gatekeeper: GatekeeperWebSocket;

  beforeEach(async () => {
    vi.spyOn(GatekeeperWebSocket.prototype as never, 'getOrCreateSecret' as never).mockReturnValue(TEST_SECRET);
    server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    port = (server.address() as { port: number }).port;
    gatekeeper = createGatekeeperHarness(server);
  });

  afterEach(async () => {
    gatekeeper.destroy();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    vi.restoreAllMocks();
  });

  it('accepts a connection with a valid X-Gatekeeper-Token header', async () => {
    const result = await connect(port, { headers: { 'X-Gatekeeper-Token': TEST_SECRET } });
    expect(result.open).toBe(true);
  });

  it('rejects a correct token sent via the query string', async () => {
    const result = await connect(port, { query: `?token=${TEST_SECRET}` });
    expect(result.open).toBe(false);
    expect(result.error?.message).toContain('401');
  });

  it('rejects an invalid header token', async () => {
    const result = await connect(port, { headers: { 'X-Gatekeeper-Token': 'b'.repeat(64) } });
    expect(result.open).toBe(false);
    expect(result.error?.message).toContain('401');
  });

  it('rejects a missing token', async () => {
    const result = await connect(port);
    expect(result.open).toBe(false);
    expect(result.error?.message).toContain('401');
  });

  it('locks out a caller after repeated failed attempts, even with a valid token', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await connect(port, { headers: { 'X-Gatekeeper-Token': `wrong-${i}` } });
      expect(result.open).toBe(false);
    }

    const lockedOut = await connect(port, { headers: { 'X-Gatekeeper-Token': TEST_SECRET } });
    expect(lockedOut.open).toBe(false);
    expect(lockedOut.error?.message).toContain('429');
  });
});
