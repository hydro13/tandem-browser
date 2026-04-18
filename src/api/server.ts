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
import { registerHandoffRoutes } from './routes/handoffs';
import { registerSidebarRoutes } from './routes/sidebar';
import { registerWorkspaceRoutes } from './routes/workspaces';
import { registerSyncRoutes } from './routes/sync';
import { registerPinboardRoutes } from './routes/pinboards';
import { registerPreviewRoutes } from './routes/previews';
import { registerAwarenessRoutes } from './routes/awareness';
import { registerClipboardRoutes } from './routes/clipboard';
import { registerBootstrapRoutes } from './routes/bootstrap';
import { registerPairingRoutes } from './routes/pairing';
import { registerSecurityRoutes } from '../security/routes';
import { nmProxy, TRUSTED_EXTENSION_PROXY_PATHS } from '../extensions/nm-proxy';
import { WatchLiveWebSocket } from '../watch/live-ws';
import type { ExtensionRouteAccessDecision } from '../extensions/manager';
import { createLogger } from '../utils/logger';
import { createRateLimitMiddleware } from './rate-limit';
import { McpHttpTransportManager } from '../mcp/http-transport';

const log = createLogger('TandemAPI');
const PUBLIC_ROUTE_PATHS = new Set<string>([
  '/status',
  '/google-photos/oauth/callback',
  '/agent',
  '/agent/version',
  '/agent/manifest',
  '/skill',
  '/pairing/exchange',
  '/pairing/whoami',
]);
// Preview routes are public — they serve HTML pages that must be openable in a browser tab
// without requiring a Bearer token in the request headers.
const PUBLIC_ROUTE_PREFIXES = ['/preview/', '/previews'];
const TRUSTED_EXTENSION_HTTP_PATHS = new Set<string>([
  ...TRUSTED_EXTENSION_ROUTE_PATHS,
  ...TRUSTED_EXTENSION_PROXY_PATHS,
]);

type ApiCallerClass =
  | 'public-healthcheck'
  | 'shell-internal'
  | 'local-automation'
  | 'extension-origin'
  | 'unknown-local-process';

type ApiAuthMode = 'public' | 'trusted-extension' | 'token';

interface ApiCallerInfo {
  kind: ApiCallerClass;
  authMode: ApiAuthMode;
  origin: string | null;
  remoteAddress: string | null;
  extensionId: string | null;
  extensionAccess?: ExtensionRouteAccessDecision | null;
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
  private watchLiveWebSocket: WatchLiveWebSocket | null = null;
  private mcpTransportManager: McpHttpTransportManager;
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
        // Allow requests with no origin (curl, MCP Node.js fetch, Electron
        // shell — modern Electron strips Origin on file:// → http://localhost
        // cross-origin fetches, so this is the shell's normal case).
        if (!origin) return callback(null, true);
        // Allow file:// protocol — some Electron versions do send this.
        // Note: may appear as 'file://', 'file:///', or 'file:///full/path'.
        if (origin.startsWith('file://')) return callback(null, true);
        // Allow installed extensions to call their narrow helper routes.
        if (this.isTrustedExtensionOrigin(origin)) return callback(null, true);
        // Reject everything else. Origin: "null" in particular is the
        // attacker-reachable case (data: URIs, sandbox=""  iframes) and
        // must not reach public routes — see audit #34 Medium #1.
        callback(new Error('CORS not allowed'));
      },
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Session', 'X-Tab-Id', 'X-Tandem-Extension-Id', 'X-Tandem-Shell-Initiated', 'Mcp-Session-Id'],
      exposedHeaders: ['Mcp-Session-Id'],
    }));
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(createRateLimitMiddleware({
      bucket: 'global-api',
      windowMs: 60_000,
      max: 600,
      message: 'Too many API requests. Retry shortly.',
    }));

    // API auth token — required for normal HTTP routes. Only a small set of
    // extension helper routes are allowlisted for installed extension origins.
    this.authToken = getOrCreateAuthToken();
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      // Allow OPTIONS preflight
      if (req.method === 'OPTIONS') return next();

      const decision = this.authorizeRequest(req);
      res.locals.apiCaller = decision.caller;
      res.locals.extensionAccess = decision.extensionAccess ?? null;
      if (decision.allowed) {
        if (decision.extensionAccess) {
          log.info(`Extension API allow ${req.method} ${req.path}: ${decision.extensionAccess.reason}`);
        }
        return next();
      }

      if (decision.extensionAccess) {
        log.warn(`Extension API block ${req.method} ${req.path}: ${decision.extensionAccess.reason}`);
      } else {
        log.warn(`Blocked API request (${decision.caller.kind}) ${req.method} ${req.path}: ${decision.reason}`);
      }
      res.status(decision.status).json({ error: decision.reason });
    });

    // MCP over Streamable HTTP — remote agents use POST/GET/DELETE /mcp
    this.mcpTransportManager = new McpHttpTransportManager();
    this.mountMcpRoute();

    // Close MCP sessions when a binding is paused/revoked
    this.registry.pairingManager.on('binding-changed', () => {
      // On any binding state change, we could track per-binding sessions.
      // For simplicity, we don't map sessions to bindings — the auth middleware
      // will reject the next request from a paused/revoked binding anyway.
      // Active SSE streams will fail on the next heartbeat cycle.
    });

    this.setupRoutes();

    // Register SecurityManager API routes
    if (this.registry.securityManager) {
      registerSecurityRoutes(this.app, this.registry.securityManager, this.registry.taskManager);
    }
  }

  /** Check if a token is a valid binding token from a paired agent. */
  private isBindingTokenValid(token: string): boolean {
    if (!token.startsWith('tdm_ast_')) return false;
    return this.registry.pairingManager.validateToken(token) !== null;
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

  private getWebSocketToken(req: http.IncomingMessage): string | null {
    const url = new URL(req.url ?? '', 'http://localhost');
    const queryToken = url.searchParams.get('token')?.trim();
    if (queryToken) {
      return queryToken;
    }

    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string') {
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (match?.[1]?.trim()) {
        return match[1].trim();
      }
    }

    const headerToken = req.headers['x-tandem-token'];
    if (typeof headerToken === 'string' && headerToken.trim()) {
      return headerToken.trim();
    }

    return null;
  }

  private authorizeWatchLiveRequest(req: http.IncomingMessage): boolean {
    const token = this.getWebSocketToken(req);
    if (!token) return false;
    return this.isTokenValid(token) || this.isBindingTokenValid(token);
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

  public authorizeExtensionBridgeRequest(opts: {
    originHeader: string | string[] | undefined | null;
    requestedExtensionId?: string | null;
    routePath: string;
    requestedHost?: string | null;
  }): ExtensionRouteAccessDecision {
    const origin = this.normalizeOrigin(opts.originHeader);
    const originExtensionId = this.parseExtensionOriginId(origin);
    if (!originExtensionId) {
      return {
        allowed: false,
        level: 'unknown',
        routePath: opts.routePath,
        scope: null,
        reason: 'Denied extension bridge access because the request is missing a valid chrome-extension origin',
        extensionId: opts.requestedExtensionId ?? 'unknown-extension',
        runtimeId: null,
        storageId: null,
        extensionName: null,
        permissions: [],
        auditLabel: 'unknown-extension [unknown]',
      };
    }

    if (opts.requestedExtensionId && opts.requestedExtensionId !== originExtensionId) {
      return {
        allowed: false,
        level: 'unknown',
        routePath: opts.routePath,
        scope: null,
        reason: `Denied extension bridge access because origin ${originExtensionId} does not match requested extension ${opts.requestedExtensionId}`,
        extensionId: originExtensionId,
        runtimeId: originExtensionId,
        storageId: null,
        extensionName: null,
        permissions: [],
        auditLabel: `${originExtensionId} [unknown; runtime=${originExtensionId}]`,
      };
    }

    return this.registry.extensionManager.evaluateApiRouteAccess(
      originExtensionId,
      opts.routePath,
      opts.requestedHost ?? null,
    );
  }

  private authorizeRequest(req: Request): {
    allowed: boolean;
    caller: ApiCallerInfo;
    reason: string;
    status: number;
    extensionAccess: ExtensionRouteAccessDecision | null;
  } {
    const caller = this.classifyCaller(req);
    if (caller.authMode === 'public' || caller.kind === 'local-automation') {
      return { allowed: true, caller, reason: 'authorized', status: 200, extensionAccess: null };
    }

    // Preview pages are public — openable in a browser tab without Bearer token
    if (PUBLIC_ROUTE_PREFIXES.some(prefix => req.path.startsWith(prefix))) {
      return { allowed: true, caller, reason: 'public-preview', status: 200, extensionAccess: null };
    }

    if (caller.kind === 'extension-origin' && caller.extensionId) {
      const extensionAccess = this.registry.extensionManager.evaluateApiRouteAccess(
        caller.extensionId,
        req.path,
        this.getRequestedNativeMessagingHost(req),
      );
      caller.extensionAccess = extensionAccess;
      if (extensionAccess.allowed) {
        return { allowed: true, caller, reason: 'authorized', status: 200, extensionAccess };
      }

      return {
        allowed: false,
        caller,
        reason: extensionAccess.reason,
        status: 403,
        extensionAccess,
      };
    }

    if (req.query.token) {
      return {
        allowed: false,
        caller,
        reason: 'Unauthorized — query-string token auth was removed. Use Authorization: Bearer <token>. Token is in ~/.tandem/api-token',
        status: 401,
        extensionAccess: null,
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
      extensionAccess: null,
    };
  }

  private classifyCaller(req: Request): ApiCallerInfo {
    const origin = this.normalizeOrigin(req.headers.origin);
    const referer = this.normalizeOrigin(req.headers.referer);
    const remoteAddress = req.socket.remoteAddress ?? null;
    const extensionId = this.parseExtensionOriginId(origin)
      ?? this.parseExtensionOriginId(referer)
      ?? this.extractClaimedExtensionId(req);
    const authMode = this.getAuthModeForPath(req.path);
    const bearerToken = this.extractBearerToken(req.headers.authorization);

    if (authMode === 'public') {
      return { kind: 'public-healthcheck', authMode, origin, remoteAddress, extensionId: null };
    }

    if (bearerToken && this.isTokenValid(bearerToken)) {
      return { kind: 'local-automation', authMode: 'token', origin, remoteAddress, extensionId: null };
    }

    // Check binding tokens from paired agents
    if (bearerToken && this.isBindingTokenValid(bearerToken)) {
      return { kind: 'local-automation', authMode: 'token', origin, remoteAddress, extensionId: null };
    }

    if (
      authMode === 'trusted-extension'
      && extensionId
      && this.isRequiredExtensionIdSatisfied(req, extensionId)
    ) {
      return { kind: 'extension-origin', authMode, origin: origin ?? referer, remoteAddress, extensionId };
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
    const trimmed = authorizationHeader.trim();
    if (!trimmed || trimmed.length > 8192) {
      return null;
    }

    const separatorIndex = trimmed.indexOf(' ');
    if (separatorIndex <= 0) {
      return null;
    }

    const scheme = trimmed.slice(0, separatorIndex);
    if (scheme.toLowerCase() !== 'bearer') {
      return null;
    }

    const token = trimmed.slice(separatorIndex + 1).trim();
    return token || null;
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
    const match = origin.match(/^chrome-extension:\/\/([a-p]{32})(?:\/.*)?$/);
    return match?.[1] ?? null;
  }

  private extractClaimedExtensionId(req: Request): string | null {
    const headerValue = req.headers['x-tandem-extension-id'];
    if (Array.isArray(headerValue)) {
      return headerValue[0]?.trim() || null;
    }
    if (typeof headerValue === 'string' && headerValue.trim()) {
      return headerValue.trim();
    }
    return null;
  }

  private isRequiredExtensionIdSatisfied(req: Request, extensionId: string): boolean {
    if (req.path === '/extensions/identity/auth' || req.path === '/extensions/native-message') {
      const body = req.body as { extensionId?: unknown } | undefined;
      return typeof body?.extensionId === 'string' ? body.extensionId === extensionId : true;
    }
    return true;
  }

  private getRequestedNativeMessagingHost(req: Request): string | null {
    if (req.path !== '/extensions/native-message') {
      return null;
    }
    const body = req.body as { host?: unknown } | undefined;
    return typeof body?.host === 'string' && body.host.trim() ? body.host.trim() : null;
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

  /**
   * Mount the /mcp route for Streamable HTTP MCP transport.
   * Auth is handled by the Express middleware above — only authorized
   * requests (Bearer token: local api-token or binding token) reach here.
   */
  private mountMcpRoute(): void {
    // Use raw body handling for MCP — the SDK expects to parse the body itself
    // when we don't pass parsedBody, but Express already parsed it via express.json().
    // So we pass req.body as parsedBody.
    this.app.all('/mcp', (req: Request, res: Response) => {
      void this.mcpTransportManager.handleRequest(req, res, req.body);
    });
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
    registerHandoffRoutes(router, ctx);
    registerSidebarRoutes(router, ctx);
    registerWorkspaceRoutes(router, ctx);
    registerSyncRoutes(router, ctx);
    registerPinboardRoutes(router, ctx);
    registerPreviewRoutes(router, ctx);
    registerAwarenessRoutes(router, ctx);
    registerClipboardRoutes(router, ctx);
    registerBootstrapRoutes(router, ctx);
    registerPairingRoutes(router, ctx);

    // Native messaging proxy: route extension connectNative/sendNativeMessage
    // through Tandem's API since Electron 40 doesn't support them natively.
    nmProxy.registerRoutes(router);
  }

  async start(): Promise<void> {
    // Default: 0.0.0.0 (all interfaces — supports both local and Tailscale remote).
    // Existing installs with 127.0.0.1 are auto-migrated to 0.0.0.0 on config load.
    const listenHost = this.registry.configManager.getConfig().general?.apiListenHost ?? '0.0.0.0';
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, listenHost, () => {
        if (this.server) {
          this.watchLiveWebSocket?.close();
          this.watchLiveWebSocket = new WatchLiveWebSocket(this.server, this.registry.watchManager, {
            authorizeRequest: (req) => this.authorizeWatchLiveRequest(req),
          });
        }
        this.mcpTransportManager.start();
        resolve();
      });
    });
  }

  getHttpServer(): http.Server | null {
    return this.server;
  }

  stop(): void {
    this.watchLiveWebSocket?.close();
    this.watchLiveWebSocket = null;
    void this.mcpTransportManager.stop();
    this.server?.close();
  }
}
