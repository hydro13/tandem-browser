import express, { Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { BrowserWindow } from 'electron';
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
import { TabManager } from '../tabs/manager';
import { PanelManager } from '../panel/manager';
import { DrawOverlayManager } from '../draw/overlay';
import { ActivityTracker } from '../activity/tracker';
import { VoiceManager } from '../voice/recognition';
import { BehaviorObserver } from '../behavior/observer';
import { ConfigManager } from '../config/manager';
import { SiteMemoryManager } from '../memory/site-memory';
import { WatchManager } from '../watch/watcher';
import { HeadlessManager } from '../headless/manager';
import { FormMemoryManager } from '../memory/form-memory';
import { ContextBridge } from '../bridge/context-bridge';
import { PiPManager } from '../pip/manager';
import { NetworkInspector } from '../network/inspector';
import { ChromeImporter } from '../import/chrome-importer';
import { BookmarkManager } from '../bookmarks/manager';
import { HistoryManager } from '../history/manager';
import { DownloadManager } from '../downloads/manager';
import { AudioCaptureManager } from '../audio/capture';
import { ExtensionLoader } from '../extensions/loader';
import { ExtensionManager } from '../extensions/manager';
import { ClaroNoteManager } from '../claronote/manager';
import { ContentExtractor } from '../content/extractor';
import { WorkflowEngine } from '../workflow/engine';
import { LoginManager } from '../auth/login-manager';
import { EventStreamManager } from '../events/stream';
import { TaskManager } from '../agents/task-manager';
import { TabLockManager } from '../agents/tab-lock-manager';
import { DevToolsManager } from '../devtools/manager';
import { CopilotStream } from '../activity/copilot-stream';
import { SecurityManager } from '../security/security-manager';
import { SnapshotManager } from '../snapshot/manager';
import { NetworkMocker } from '../network/mocker';
import { SessionManager } from '../sessions/manager';
import { StateManager } from '../sessions/state';
import { ScriptInjector } from '../scripts/injector';
import { LocatorFinder } from '../locators/finder';
import { DeviceEmulator } from '../device/emulator';

/** Generate or load API auth token from ~/.tandem/api-token */
function getOrCreateAuthToken(): string {
  const tandemDir = path.join(os.homedir(), '.tandem');
  if (!fs.existsSync(tandemDir)) fs.mkdirSync(tandemDir, { recursive: true });

  const tokenPath = path.join(tandemDir, 'api-token');
  try {
    if (fs.existsSync(tokenPath)) {
      const existing = fs.readFileSync(tokenPath, 'utf-8').trim();
      if (existing.length >= 32) return existing;
    }
  } catch (e: any) {
    console.warn('Could not read existing API token, generating new:', e.message);
  }

  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(tokenPath, token, { mode: 0o600 });
  console.log('🔑 New API token generated → ~/.tandem/api-token');
  return token;
}

/** Options object for TandemAPI constructor */
export interface TandemAPIOptions {
  win: BrowserWindow;
  port?: number;
  tabManager: TabManager;
  panelManager: PanelManager;
  drawManager: DrawOverlayManager;
  activityTracker: ActivityTracker;
  voiceManager: VoiceManager;
  behaviorObserver: BehaviorObserver;
  configManager: ConfigManager;
  siteMemory: SiteMemoryManager;
  watchManager: WatchManager;
  headlessManager: HeadlessManager;
  formMemory: FormMemoryManager;
  contextBridge: ContextBridge;
  pipManager: PiPManager;
  networkInspector: NetworkInspector;
  chromeImporter: ChromeImporter;
  bookmarkManager: BookmarkManager;
  historyManager: HistoryManager;
  downloadManager: DownloadManager;
  audioCaptureManager: AudioCaptureManager;
  extensionLoader: ExtensionLoader;
  extensionManager: ExtensionManager;
  claroNoteManager: ClaroNoteManager;
  eventStream: EventStreamManager;
  taskManager: TaskManager;
  tabLockManager: TabLockManager;
  devToolsManager: DevToolsManager;
  copilotStream: CopilotStream;
  securityManager?: SecurityManager;
  snapshotManager: SnapshotManager;
  networkMocker: NetworkMocker;
  sessionManager: SessionManager;
  stateManager: StateManager;
  scriptInjector: ScriptInjector;
  locatorFinder: LocatorFinder;
  deviceEmulator: DeviceEmulator;
}

export class TandemAPI {
  private app: express.Application;
  private server: http.Server | null = null;
  private win: BrowserWindow;
  private authToken: string;
  private port: number;
  private tabManager: TabManager;
  private panelManager: PanelManager;
  private drawManager: DrawOverlayManager;
  private activityTracker: ActivityTracker;
  private voiceManager: VoiceManager;
  private behaviorObserver: BehaviorObserver;
  private configManager: ConfigManager;
  private siteMemory: SiteMemoryManager;
  private watchManager: WatchManager;
  private headlessManager: HeadlessManager;
  private formMemory: FormMemoryManager;
  private contextBridge: ContextBridge;
  private pipManager: PiPManager;
  private networkInspector: NetworkInspector;
  private chromeImporter: ChromeImporter;
  private bookmarkManager: BookmarkManager;
  private historyManager: HistoryManager;
  private downloadManager: DownloadManager;
  private audioCaptureManager: AudioCaptureManager;
  private extensionLoader: ExtensionLoader;
  private extensionManager: ExtensionManager;
  private claroNoteManager: ClaroNoteManager;
  private eventStream: EventStreamManager;
  private taskManager: TaskManager;
  private tabLockManager: TabLockManager;
  private devToolsManager: DevToolsManager;
  private copilotStream: CopilotStream;
  private securityManager: SecurityManager | null;
  private snapshotManager: SnapshotManager;
  private networkMocker: NetworkMocker;
  private sessionManager: SessionManager;
  private stateManager: StateManager;
  private scriptInjector: ScriptInjector;
  private locatorFinder: LocatorFinder;
  private deviceEmulator: DeviceEmulator;
  private contentExtractor: ContentExtractor;
  private workflowEngine: WorkflowEngine;
  private loginManager: LoginManager;

  constructor(opts: TandemAPIOptions) {
    this.win = opts.win;
    this.port = opts.port ?? 8765;
    this.tabManager = opts.tabManager;
    this.panelManager = opts.panelManager;
    this.drawManager = opts.drawManager;
    this.activityTracker = opts.activityTracker;
    this.voiceManager = opts.voiceManager;
    this.behaviorObserver = opts.behaviorObserver;
    this.configManager = opts.configManager;
    this.siteMemory = opts.siteMemory;
    this.watchManager = opts.watchManager;
    this.headlessManager = opts.headlessManager;
    this.formMemory = opts.formMemory;
    this.contextBridge = opts.contextBridge;
    this.pipManager = opts.pipManager;
    this.networkInspector = opts.networkInspector;
    this.chromeImporter = opts.chromeImporter;
    this.bookmarkManager = opts.bookmarkManager;
    this.historyManager = opts.historyManager;
    this.downloadManager = opts.downloadManager;
    this.audioCaptureManager = opts.audioCaptureManager;
    this.extensionLoader = opts.extensionLoader;
    this.extensionManager = opts.extensionManager;
    this.claroNoteManager = opts.claroNoteManager;
    this.eventStream = opts.eventStream;
    this.taskManager = opts.taskManager;
    this.tabLockManager = opts.tabLockManager;
    this.devToolsManager = opts.devToolsManager;
    this.copilotStream = opts.copilotStream;
    this.securityManager = opts.securityManager || null;
    this.snapshotManager = opts.snapshotManager;
    this.networkMocker = opts.networkMocker;
    this.sessionManager = opts.sessionManager;
    this.stateManager = opts.stateManager;
    this.scriptInjector = opts.scriptInjector;
    this.locatorFinder = opts.locatorFinder;
    this.deviceEmulator = opts.deviceEmulator;

    // Initialize new Phase 5 managers
    this.contentExtractor = new ContentExtractor();
    this.workflowEngine = new WorkflowEngine();
    this.loginManager = new LoginManager();

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
        if (match && match[1] === this.authToken) return next();
      }
      if (queryToken === this.authToken) return next();

      res.status(401).json({ error: 'Unauthorized — provide Authorization: Bearer <token> header or ?token=<token>. Token is in ~/.tandem/api-token' });
    });

    this.setupRoutes();

    // Register SecurityManager API routes
    if (this.securityManager) {
      this.securityManager.registerRoutes(this.app);
    }
  }

  private buildContext(): RouteContext {
    return {
      win: this.win,
      tabManager: this.tabManager,
      panelManager: this.panelManager,
      drawManager: this.drawManager,
      activityTracker: this.activityTracker,
      voiceManager: this.voiceManager,
      behaviorObserver: this.behaviorObserver,
      configManager: this.configManager,
      siteMemory: this.siteMemory,
      watchManager: this.watchManager,
      headlessManager: this.headlessManager,
      formMemory: this.formMemory,
      contextBridge: this.contextBridge,
      pipManager: this.pipManager,
      networkInspector: this.networkInspector,
      chromeImporter: this.chromeImporter,
      bookmarkManager: this.bookmarkManager,
      historyManager: this.historyManager,
      downloadManager: this.downloadManager,
      audioCaptureManager: this.audioCaptureManager,
      extensionLoader: this.extensionLoader,
      extensionManager: this.extensionManager,
      claroNoteManager: this.claroNoteManager,
      contentExtractor: this.contentExtractor,
      workflowEngine: this.workflowEngine,
      loginManager: this.loginManager,
      eventStream: this.eventStream,
      taskManager: this.taskManager,
      tabLockManager: this.tabLockManager,
      devToolsManager: this.devToolsManager,
      copilotStream: this.copilotStream,
      securityManager: this.securityManager,
      snapshotManager: this.snapshotManager,
      networkMocker: this.networkMocker,
      sessionManager: this.sessionManager,
      stateManager: this.stateManager,
      scriptInjector: this.scriptInjector,
      locatorFinder: this.locatorFinder,
      deviceEmulator: this.deviceEmulator,
    };
  }

  private setupRoutes(): void {
    const ctx = this.buildContext();
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
