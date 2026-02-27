import express, { Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { tandemDir } from '../utils/paths';
import { API_PORT } from '../utils/constants';
import { BrowserWindow } from 'electron';
import { ManagerRegistry } from '../registry';
import { RouteContext } from './context';
import { registerBrowserRoutes } from './routes/browser';
import { registerTabRoutes } from './routes/tabs';
import { registerSnapshotRoutes } from './routes/snapshots';
import { registerDevtoolsRoutes } from './routes/devtools';
import { registerExtensionRoutes } from './routes/extensions';
import { registerNetworkRoutes } from './routes/network';
import { registerSessionRoutes } from './routes/sessions';
import { registerAgentRoutes } from './routes/agents';
import { registerDataRoutes } from './routes/data';
import { registerContentRoutes } from './routes/content';
import { registerMediaRoutes } from './routes/media';
import { registerMiscRoutes } from './routes/misc';
import { registerSecurityRoutes } from '../security/routes';
import { createLogger } from '../utils/logger';

const log = createLogger('TandemAPI');

/** Generate or load API auth token from ~/.tandem/api-token */
function getOrCreateAuthToken(): string {
  const baseDir = tandemDir();
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

  const tokenPath = path.join(baseDir, 'api-token');
  try {
    if (fs.existsSync(tokenPath)) {
      const existing = fs.readFileSync(tokenPath, 'utf-8').trim();
      if (existing.length >= 32) return existing;
    }
  } catch (e) {
    log.warn('Could not read existing API token, generating new:', e instanceof Error ? e.message : e);
  }

  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(tokenPath, token, { mode: 0o600 });
  log.info('🔑 New API token generated → ~/.tandem/api-token');
  return token;
}

/** Options object for TandemAPI constructor */
export interface TandemAPIOptions {
  win: BrowserWindow;
  port?: number;
  registry: ManagerRegistry;
}

export class TandemAPI {
  private app: express.Application;
  private server: http.Server | null = null;
  private win: BrowserWindow;
  private authToken: string;
  private port: number;
  private registry: ManagerRegistry;

  constructor(opts: TandemAPIOptions) {
    this.win = opts.win;
    this.port = opts.port ?? API_PORT;
    this.registry = opts.registry;

    this.app = express();
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (curl, server-to-server)
        if (!origin) return callback(null, true);
        // Allow file:// protocol (Electron shell + webview pages)
        // Note: Electron may send 'file://', 'file:///', or 'file:///full/path'
        if (origin.startsWith('file://')) return callback(null, true);
        // Allow "null" origin — some Electron contexts send this for file:// → http:// fetches
        if (origin === 'null') return callback(null, true);
        // Allow localhost origins (dev tools, other local apps)
        if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)) return callback(null, true);
        // Block everything else
        callback(new Error('CORS not allowed'));
      }
    }));
    this.app.use(express.json({ limit: '50mb' }));

    // API auth token — require for all endpoints except /status
    this.authToken = getOrCreateAuthToken();
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      // Allow /status without auth (health check)
      if (req.path === '/status') return next();
      // Allow OPTIONS preflight
      if (req.method === 'OPTIONS') return next();

      // Since the server binds exclusively to 127.0.0.1, every TCP connection
      // is local by definition. Use socket address as the authoritative check —
      // Origin headers are unreliable across Electron versions (Chrome 131+
      // file:// webviews send no Origin at all; older versions send 'null' or 'file://').
      const remoteAddr = req.socket.remoteAddress || '';
      if (remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1') {
        return next();
      }
      // Fallback: also allow by origin for proxied setups
      const origin = req.headers.origin || '';
      if (!origin || origin.startsWith('file://') || origin === 'null' || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        return next();
      }

      // Check Authorization header or query param for external requests
      const authHeader = req.headers.authorization;
      const queryToken = req.query.token as string | undefined;

      if (authHeader) {
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (match && this.isTokenValid(match[1])) return next();
      }
      if (queryToken) {
        log.warn('Query string token auth is deprecated. Use Authorization: Bearer header instead.');
        if (this.isTokenValid(queryToken)) return next();
      }

      res.status(401).json({ error: 'Unauthorized — provide Authorization: Bearer <token> header or ?token=<token>. Token is in ~/.tandem/api-token' });
    });

    this.setupRoutes();

    // Register SecurityManager API routes
    if (this.registry.securityManager) {
      registerSecurityRoutes(this.app, this.registry.securityManager);
    }
  }

  /** Timing-safe comparison of a candidate token against the stored auth token */
  private isTokenValid(token: string): boolean {
    try {
      const bufA = Buffer.from(token);
      const bufB = Buffer.from(this.authToken);
      return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }

  private setupRoutes(): void {
    const ctx: RouteContext = { win: this.win, ...this.registry };
    const router = this.app as unknown as Router;
    registerBrowserRoutes(router, ctx);
    registerTabRoutes(router, ctx);
    registerSnapshotRoutes(router, ctx);
    registerDevtoolsRoutes(router, ctx);
    registerExtensionRoutes(router, ctx);
    registerNetworkRoutes(router, ctx);
    registerSessionRoutes(router, ctx);
    registerAgentRoutes(router, ctx);
    registerDataRoutes(router, ctx);
    registerContentRoutes(router, ctx);
    registerMediaRoutes(router, ctx);
    registerMiscRoutes(router, ctx);
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, '127.0.0.1', () => {
        resolve();
      });
    });
  }

  getHttpServer(): http.Server | null {
    return this.server;
  }

  stop(): void {
    this.server?.close();
  }
}
