/**
 * HTTP MCP transport — Streamable HTTP MCP server for remote agents.
 *
 * Runs in-process inside the Express server. Uses the MCP SDK's
 * StreamableHTTPServerTransport so remote agents (over Tailscale)
 * can use the full MCP tool surface via POST /mcp.
 *
 * Auth is handled by the Express auth middleware before requests
 * reach this module — only already-authorized requests arrive here.
 */

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerAllTools, registerAllResources } from './register-all.js';
import { createLogger } from '../utils/logger';

const log = createLogger('McpHttpTransport');

/** Max concurrent MCP sessions. */
const MAX_SESSIONS = 20;

/** Idle timeout before a session is cleaned up (5 minutes). */
const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

interface ManagedSession {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  sessionId: string;
  createdAt: number;
  lastActivityAt: number;
}

/**
 * Manages the lifecycle of HTTP MCP sessions.
 *
 * Each MCP client connection gets its own session (McpServer + transport pair).
 * Sessions are created on `initialize` and cleaned up on DELETE, idle timeout,
 * or binding revocation.
 */
export class McpHttpTransportManager {
  private sessions = new Map<string, ManagedSession>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /** Start the periodic cleanup timer. */
  start(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.cleanupIdleSessions(), 60_000);
  }

  /** Stop the manager and close all sessions. */
  async stop(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    const closing = Array.from(this.sessions.values()).map(s => this.closeSession(s.sessionId));
    await Promise.allSettled(closing);
  }

  /** Handle an incoming MCP HTTP request (POST, GET, or DELETE /mcp). */
  async handleRequest(req: IncomingMessage, res: ServerResponse, body?: unknown): Promise<void> {
    const sessionId = this.getSessionIdFromRequest(req);

    if (req.method === 'POST' && !sessionId) {
      // New session — initialize request
      if (this.sessions.size >= MAX_SESSIONS) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many active MCP sessions' }));
        return;
      }

      const session = await this.createSession();
      log.info(`MCP session created: ${session.sessionId}`);
      session.lastActivityAt = Date.now();
      await session.transport.handleRequest(req, res, body);
      return;
    }

    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'MCP session not found or expired' }));
        return;
      }

      session.lastActivityAt = Date.now();

      if (req.method === 'DELETE') {
        await this.closeSession(sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      await session.transport.handleRequest(req, res, body);
      return;
    }

    // GET without session ID — not valid for stateful mode
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing Mcp-Session-Id header' }));
  }

  /** Close all sessions (e.g. when a binding is revoked). */
  async closeAllSessions(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    await Promise.allSettled(ids.map(id => this.closeSession(id)));
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  private async createSession(): Promise<ManagedSession> {
    const server = new McpServer({
      name: 'tandem-browser',
      version: '1.0.0',
    });

    registerAllTools(server);
    registerAllResources(server);

    let capturedSessionId: string | undefined;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => {
        capturedSessionId = randomUUID();
        return capturedSessionId;
      },
    });

    await server.connect(transport);

    const sessionId = capturedSessionId ?? randomUUID();

    const managed: ManagedSession = {
      transport,
      server,
      sessionId,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.sessions.set(sessionId, managed);

    transport.onclose = () => {
      this.sessions.delete(sessionId);
      log.info(`MCP session closed: ${sessionId}`);
    };

    return managed;
  }

  private async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    try {
      await session.transport.close();
    } catch (e) {
      log.warn(`Error closing MCP session ${sessionId}:`, e instanceof Error ? e.message : e);
    }
  }

  private cleanupIdleSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivityAt > SESSION_IDLE_TIMEOUT_MS) {
        log.info(`Cleaning up idle MCP session: ${id}`);
        void this.closeSession(id);
      }
    }
  }

  private getSessionIdFromRequest(req: IncomingMessage): string | undefined {
    const header = req.headers['mcp-session-id'];
    if (typeof header === 'string' && header.trim()) {
      return header.trim();
    }
    return undefined;
  }
}
