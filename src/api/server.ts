import type { Request, Response, NextFunction, Router } from 'express';
import express from 'express';
import cors from 'cors';
import type http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { tandemDir } from '../utils/paths';
import { API_PORT } from '../utils/constants';
import type { BrowserWindow } from 'electron';
import type { ManagerRegistry } from '../registry';
import type { RouteContext } from './context';
import { registerBrowserRoutes } from './routes/browser';
import { registerTabRoutes } from './routes/tabs';
import { registerSnapshotRoutes } from './routes/snapshots';
import { registerDevtoolsRoutes } from './routes/devtools';
import { registerExtensionRoutes, TRUSTED_EXTENSION_ROUTE_PATHS } from './routes/extensions';
import { registerNetworkRoutes } from './routes/network';
import { registerSessionRoutes } from './routes/sessions';
import { registerAgentRoutes } from './routes/agents';
import { registerDataRoutes } from './routes/data';
import { registerContentRoutes } from './routes/content';
import { registerMediaRoutes } from './routes/media';
import { registerMiscRoutes } from './routes/misc';
import { registerSidebarRoutes } from './routes/sidebar';
import { registerWorkspaceRoutes } from './routes/workspaces';
import { registerSyncRoutes } from './routes/sync';
import { registerPinboardRoutes } from './routes/pinboards';
import { registerSecurityRoutes } from '../security/routes';
import { nmProxy, TRUSTED_EXTENSION_PROXY_PATHS } from '../extensions/nm-proxy';
import { createLogger } from '../utils/logger';

const log = createLogger('TandemAPI');
const PUBLIC_ROUTE_PATHS = new Set<string>(['/status']);
const TRUSTED_EXTENSION_HTTP_PATHS = new Set<string>([
  ...TRUSTED_EXTENSION_ROUTE_PATHS,
  ...TRUSTED_EXTENSION_PROXY_PATHS,
]);

type ApiCallerClass =
  | 'public-healthcheck'
  | 'shell-internal'
  | 'local-automation'
  | 'trusted-extension'
  | 'unknown-local-process';

type ApiAuthMode = 'public' | 'trusted-extension' | 'token';

interface ApiCallerInfo {
  kind: ApiCallerClass;
  authMode: ApiAuthMode;
  origin: string | null;
  remoteAddress: string | null;
  extensionId: string | null;
}

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
        // Allow installed extensions to call their narrow helper routes.
        if (this.isTrustedExtensionOrigin(origin)) return callback(null, true);
        // Block everything else
        callback(new Error('CORS not allowed'));
      },
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Session'],
    }));
    this.app.use(express.json({ limit: '50mb' }));

    // API auth token — required for normal HTTP routes. Only a small set of
    // extension helper routes are allowlisted for installed extension origins.
    this.authToken = getOrCreateAuthToken();
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      // Allow OPTIONS preflight
      if (req.method === 'OPTIONS') return next();

      const decision = this.authorizeRequest(req);
      if (decision.allowed) {
        return next();
      }

      log.warn(`Blocked API request (${decision.caller.kind}) ${req.method} ${req.path}: ${decision.reason}`);
      res.status(decision.status).json({ error: decision.reason });
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

  /** Shared validator for extension-authenticated HTTP and WebSocket bridges. */
  public isTrustedExtensionOrigin(originHeader: string | string[] | undefined | null, requestedExtensionId?: string | null): boolean {
    const origin = this.normalizeOrigin(originHeader);
    const originExtensionId = this.parseExtensionOriginId(origin);
    if (!originExtensionId) return false;
    if (!this.isInstalledExtensionId(originExtensionId)) return false;
    if (requestedExtensionId && requestedExtensionId !== originExtensionId) return false;
    return true;
  }

  private authorizeRequest(req: Request): {
    allowed: boolean;
    caller: ApiCallerInfo;
    reason: string;
    status: number;
  } {
    const caller = this.classifyCaller(req);
    if (caller.authMode === 'public' || caller.kind === 'local-automation' || caller.kind === 'trusted-extension') {
      return { allowed: true, caller, reason: 'authorized', status: 200 };
    }

    if (req.query.token) {
      return {
        allowed: false,
        caller,
        reason: 'Unauthorized — query-string token auth was removed. Use Authorization: Bearer <token>. Token is in ~/.tandem/api-token',
        status: 401,
      };
    }

    const reason = caller.kind === 'shell-internal'
      ? 'Unauthorized — shell/file callers are no longer auto-trusted. Use Authorization: Bearer <token>. Token is in ~/.tandem/api-token'
      : TRUSTED_EXTENSION_HTTP_PATHS.has(req.path)
        ? 'Unauthorized — this route is reserved for installed extension callers or bearer-token clients'
        : 'Unauthorized — provide Authorization: Bearer <token>. Token is in ~/.tandem/api-token';

    return {
      allowed: false,
      caller,
      reason,
      status: 401,
    };
  }

  private classifyCaller(req: Request): ApiCallerInfo {
    const origin = this.normalizeOrigin(req.headers.origin);
    const remoteAddress = req.socket.remoteAddress ?? null;
    const extensionId = this.parseExtensionOriginId(origin);
    const authMode = this.getAuthModeForPath(req.path);
    const bearerToken = this.extractBearerToken(req.headers.authorization);

    if (authMode === 'public') {
      return { kind: 'public-healthcheck', authMode, origin, remoteAddress, extensionId: null };
    }

    if (bearerToken && this.isTokenValid(bearerToken)) {
      return { kind: 'local-automation', authMode: 'token', origin, remoteAddress, extensionId: null };
    }

    if (authMode === 'trusted-extension' && this.isTrustedExtensionOrigin(origin, this.getRequiredExtensionId(req))) {
      return { kind: 'trusted-extension', authMode, origin, remoteAddress, extensionId };
    }

    if (origin?.startsWith('file://') || origin === 'null') {
      return { kind: 'shell-internal', authMode, origin, remoteAddress, extensionId: null };
    }

    return { kind: 'unknown-local-process', authMode, origin, remoteAddress, extensionId };
  }

  private getAuthModeForPath(pathname: string): ApiAuthMode {
    if (PUBLIC_ROUTE_PATHS.has(pathname)) return 'public';
    if (TRUSTED_EXTENSION_HTTP_PATHS.has(pathname)) return 'trusted-extension';
    return 'token';
  }

  private extractBearerToken(authorizationHeader: string | undefined): string | null {
    if (!authorizationHeader) return null;
    const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
    return match?.[1] ?? null;
  }

  private normalizeOrigin(originHeader: string | string[] | undefined | null): string | null {
    if (Array.isArray(originHeader)) {
      return originHeader[0]?.trim() || null;
    }
    if (typeof originHeader === 'string') {
      return originHeader.trim() || null;
    }
    return null;
  }

  private parseExtensionOriginId(origin: string | null): string | null {
    if (!origin) return null;
    const match = origin.match(/^chrome-extension:\/\/([a-p]{32})\/?$/);
    return match?.[1] ?? null;
  }

  private getRequiredExtensionId(req: Request): string | null {
    if (req.path !== '/extensions/identity/auth') {
      return null;
    }

    const body = req.body as { extensionId?: unknown } | undefined;
    return typeof body?.extensionId === 'string' ? body.extensionId : null;
  }

  private isInstalledExtensionId(extensionId: string): boolean {
    const installed = this.registry.extensionManager.getInstalledExtensions();
    if (installed.some((extension) => extension.id === extensionId)) {
      return true;
    }

    const { loaded, available } = this.registry.extensionManager.list();
    if (loaded.some((extension) => extension.id === extensionId || path.basename(extension.path) === extensionId)) {
      return true;
    }

    return available.some((extension) => path.basename(extension.path) === extensionId);
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
    registerSidebarRoutes(router, ctx);
    registerWorkspaceRoutes(router, ctx);
    registerSyncRoutes(router, ctx);
    registerPinboardRoutes(router, ctx);

    // Native messaging proxy: route extension connectNative/sendNativeMessage
    // through Tandem's API since Electron 40 doesn't support them natively.
    nmProxy.registerRoutes(router);
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
