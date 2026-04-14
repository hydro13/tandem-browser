import http from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { WatchLiveWebSocket } from '../live-ws';
import type { WatchLiveEvent } from '../watcher';

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

class MockWatchManager {
  private readonly listeners = new Set<(event: WatchLiveEvent) => void>();

  getSnapshot(): WatchLiveEvent {
    return {
      type: 'snapshot',
      watches: [{
        id: 'watch-1',
        url: 'https://example.com',
        diffMode: 'content',
        intervalMs: 60_000,
        lastCheck: null,
        lastFingerprint: null,
        lastHash: null,
        lastTitle: null,
        lastError: null,
        changeCount: 0,
        createdAt: 1,
      }],
      emittedAt: 123,
    };
  }

  subscribe(cb: (event: WatchLiveEvent) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  emit(event: WatchLiveEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

describe('WatchLiveWebSocket', () => {
  let server: http.Server;
  let port: number;
  let watchManager: MockWatchManager;
  let watchLiveWs: WatchLiveWebSocket;

  beforeEach(async () => {
    watchManager = new MockWatchManager();
    server = http.createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    port = (server.address() as { port: number }).port;
    watchLiveWs = new WatchLiveWebSocket(server, watchManager as never, {
      authorizeRequest: (req) => new URL(req.url ?? '', 'http://localhost').searchParams.get('token') === 'secret',
    });
  });

  afterEach(async () => {
    watchLiveWs.close();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  it('sends a snapshot immediately after connection', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/watch/live?token=secret`);
    const message = await new Promise<WatchLiveEvent>((resolve, reject) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString()) as WatchLiveEvent));
      ws.once('error', reject);
    });

    expect(message).toEqual(watchManager.getSnapshot());
    ws.close();
  });

  it('forwards watch events to connected clients', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/watch/live?token=secret`);

    await new Promise<void>((resolve, reject) => {
      ws.once('message', () => resolve());
      ws.once('error', reject);
    });

    const forwarded = new Promise<WatchLiveEvent>((resolve, reject) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString()) as WatchLiveEvent));
      ws.once('error', reject);
    });

    watchManager.emit({
      type: 'watch-checked',
      watch: {
        id: 'watch-1',
        url: 'https://example.com',
        diffMode: 'content',
        intervalMs: 60_000,
        lastCheck: 999,
        lastFingerprint: 'abc',
        lastHash: 'abc',
        lastTitle: 'Example',
        lastError: null,
        changeCount: 1,
        createdAt: 1,
      },
      reason: 'timer',
      changed: true,
      emittedAt: 999,
    });

    expect(await forwarded).toEqual({
      type: 'watch-checked',
      watch: {
        id: 'watch-1',
        url: 'https://example.com',
        diffMode: 'content',
        intervalMs: 60_000,
        lastCheck: 999,
        lastFingerprint: 'abc',
        lastHash: 'abc',
        lastTitle: 'Example',
        lastError: null,
        changeCount: 1,
        createdAt: 1,
      },
      reason: 'timer',
      changed: true,
      emittedAt: 999,
    });

    ws.close();
  });

  it('rejects unauthorized upgrade requests', async () => {
    const error = await new Promise<Error>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/watch/live`);
      ws.once('error', (err) => resolve(err as Error));
    });

    expect(error.message).toContain('401');
  });
});
