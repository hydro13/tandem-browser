import express, { Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { BrowserWindow, webContents } from 'electron';
import { copilotAlert } from '../main';
import { RouteContext } from './context';
import { registerBrowserRoutes } from './routes/browser';
import { registerTabRoutes } from './routes/tabs';
import { TabManager } from '../tabs/manager';
import { PanelManager } from '../panel/manager';
import { DrawOverlayManager } from '../draw/overlay';
import { ActivityTracker } from '../activity/tracker';
import { VoiceManager } from '../voice/recognition';
import { BehaviorObserver } from '../behavior/observer';
import { humanizedClick, humanizedType } from '../input/humanized';
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
import { passwordManager } from '../passwords/manager';
import { ExtensionManager } from '../extensions/manager';
import { ChromeExtensionImporter } from '../extensions/chrome-importer';
import { GalleryLoader } from '../extensions/gallery-loader';
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
import { LocatorFinder, LocatorQuery } from '../locators/finder';
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

  /** Get active tab's WebContents, or null */
  private async getActiveWC(): Promise<Electron.WebContents | null> {
    return this.tabManager.getActiveWebContents();
  }

  /** Helper to run JS in the active tab's webview */
  private async execInActiveTab(code: string): Promise<any> {
    const wc = await this.getActiveWC();
    if (!wc) throw new Error('No active tab');
    return wc.executeJavaScript(code);
  }

  /** Resolve X-Session header to partition string */
  private getSessionPartition(req: Request): string {
    const sessionName = req.headers['x-session'] as string;
    if (!sessionName || sessionName === 'default') {
      return 'persist:tandem';
    }
    return this.sessionManager.resolvePartition(sessionName);
  }

  /** Get WebContents for a session (via X-Session header). */
  private async getSessionWC(req: Request): Promise<Electron.WebContents | null> {
    const sessionName = req.headers['x-session'] as string;
    if (!sessionName || sessionName === 'default') {
      return this.getActiveWC();
    }
    const partition = this.getSessionPartition(req);
    const tabs = this.tabManager.listTabs().filter(t => t.partition === partition);
    if (tabs.length === 0) return null;
    return webContents.fromId(tabs[0].webContentsId) || null;
  }

  /** Run JS in a session's tab (via X-Session header) */
  private async execInSessionTab(req: Request, code: string): Promise<any> {
    const wc = await this.getSessionWC(req);
    if (!wc) throw new Error('No active tab for this session');
    return wc.executeJavaScript(code);
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
    registerBrowserRoutes(this.app as unknown as Router, ctx);
    registerTabRoutes(this.app as unknown as Router, ctx);

    // ═══════════════════════════════════════════════
    // STATUS
    // ═══════════════════════════════════════════════

    this.app.get('/status', async (_req: Request, res: Response) => {
      try {
        const tab = this.tabManager.getActiveTab();
        if (!tab) {
          res.json({ ready: false, tabs: 0 });
          return;
        }
        const wc = await this.getActiveWC();
        let viewport = undefined;
        if (wc) {
          try {
            const info = await wc.executeJavaScript(`
              JSON.stringify({
                innerWidth: window.innerWidth,
                innerHeight: window.innerHeight,
                scrollTop: Math.round(document.documentElement.scrollTop),
                scrollHeight: document.documentElement.scrollHeight,
                clientHeight: document.documentElement.clientHeight,
                screenWidth: screen.width,
                screenHeight: screen.height
              })
            `);
            viewport = JSON.parse(info);
          } catch (_) { /* viewport info is best-effort */ }
        }
        res.json({
          ready: !!wc,
          url: tab.url,
          title: tab.title,
          loading: wc ? wc.isLoading() : false,
          activeTab: tab.id,
          tabs: this.tabManager.count,
          viewport,
        });
      } catch (e: any) {
        res.json({ ready: false, error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // PASSWORD MANAGER
    // ═══════════════════════════════════════════════

    this.app.get('/passwords/status', (_req: Request, res: Response) => {
      res.json({
        unlocked: passwordManager.isVaultUnlocked,
        isNewVault: passwordManager.isNewVault()
      });
    });

    this.app.post('/passwords/unlock', async (req: Request, res: Response) => {
      const { password } = req.body;
      if (!password) {
        res.status(400).json({ error: 'Password required' });
        return;
      }
      const success = await passwordManager.unlock(password);
      if (success) {
        res.json({ success: true, isNewVault: false });
      } else {
        res.status(401).json({ error: 'Incorrect master password' });
      }
    });

    this.app.post('/passwords/lock', (_req: Request, res: Response) => {
      passwordManager.lock();
      res.json({ success: true });
    });

    this.app.get('/passwords/suggest', (req: Request, res: Response) => {
      const domain = req.query.domain as string;
      if (!domain) {
        res.status(400).json({ error: 'Domain query parameter required' });
        return;
      }
      try {
        const identities = passwordManager.getIdentitiesForDomain(domain);
        res.json({ identities });
      } catch (err: any) {
        res.status(403).json({ error: err.message });
      }
    });

    this.app.post('/passwords/save', (req: Request, res: Response) => {
      const { domain, username, payload } = req.body;
      if (!domain || !username || !payload) {
        res.status(400).json({ error: 'domain, username, and payload required' });
        return;
      }
      try {
        passwordManager.saveItem(domain, username, payload);
        res.json({ success: true });
      } catch (err: any) {
        res.status(403).json({ error: err.message });
      }
    });

    this.app.get('/passwords/generate', (req: Request, res: Response) => {
      const { PasswordCrypto } = require('../security/crypto');
      const length = req.query.length ? parseInt(req.query.length as string) : 24;
      res.json({ password: PasswordCrypto.generatePassword(length) });
    });

    // ═══════════════════════════════════════════════
    // OPENCLAW TOKEN — Phase 3 (Chat Router)
    // ═══════════════════════════════════════════════

    this.app.get('/config/openclaw-token', (_req: Request, res: Response) => {
      try {
        const openclawPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
        if (!fs.existsSync(openclawPath)) {
          res.status(404).json({ error: 'OpenClaw config not found at ~/.openclaw/openclaw.json' });
          return;
        }
        const data = JSON.parse(fs.readFileSync(openclawPath, 'utf-8'));
        const token = data.token || data.gateway?.auth?.token;
        if (!token) {
          res.status(404).json({ error: 'No token field in openclaw.json' });
          return;
        }
        res.json({ token });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // EVENT STREAM — SSE (Phase 2)
    // ═══════════════════════════════════════════════

    this.app.get('/events/stream', (req: Request, res: Response) => {
      this.eventStream.sseHandler(req, res);
    });

    this.app.get('/events/recent', (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const events = this.eventStream.getRecent(limit);
        res.json({ events });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // LIVE MODE — Copilot live monitoring toggle
    // ═══════════════════════════════════════════════

    let liveMode = false;

    this.app.get('/live/status', (_req: Request, res: Response) => {
      res.json({ enabled: liveMode });
    });

    this.app.post('/live/toggle', (req: Request, res: Response) => {
      const { enabled } = req.body;
      liveMode = (enabled !== undefined) ? !!enabled : !liveMode;
      // Notify panel UI about live mode change
      this.panelManager.sendLiveModeChanged(liveMode);
      res.json({ ok: true, enabled: liveMode });
    });

    // Filtered SSE stream — only active when live mode is on
    this.app.get('/live/stream', (req: Request, res: Response) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(': connected\n\n');
      res.write(`data: ${JSON.stringify({ type: 'live-status', enabled: liveMode })}\n\n`);

      const unsubscribe = this.eventStream.subscribe((event) => {
        if (!liveMode) return; // Skip events when live mode is off
        // Filter: only send meaningful events (skip scroll noise)
        if (event.type === 'scroll') return;
        try {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          unsubscribe();
        }
      });

      const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); unsubscribe(); }
      }, 30000);

      req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
    });

    // ═══════════════════════════════════════════════
    // PANEL — Copilot side panel
    // ═══════════════════════════════════════════════

    this.app.post('/panel/toggle', (req: Request, res: Response) => {
      try {
        const { open } = req.body;
        const isOpen = this.panelManager.togglePanel(open);
        res.json({ ok: true, open: isOpen });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    /** Get chat messages (supports ?since_id= for polling) */
    this.app.get('/chat', (req: Request, res: Response) => {
      try {
        const sinceId = parseInt(req.query.since_id as string);
        if (sinceId && !isNaN(sinceId)) {
          const messages = this.panelManager.getChatMessagesSince(sinceId);
          res.json({ messages });
        } else {
          const limit = parseInt(req.query.limit as string) || 50;
          const messages = this.panelManager.getChatMessages(limit);
          res.json({ messages });
        }
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    /** Send chat message (default: copilot, 'from' param allows robin/claude) */
    this.app.post('/chat', (req: Request, res: Response) => {
      const { text, from, image } = req.body;
      if (!text && !image) { res.status(400).json({ error: 'text or image required' }); return; }
      const sender: 'robin' | 'copilot' | 'kees' | 'claude' = (from === 'robin') ? 'robin' : (from === 'claude') ? 'claude' : 'copilot';
      try {
        let savedImage: string | undefined;
        if (image) {
          savedImage = this.panelManager.saveImage(image);
        }
        const msg = this.panelManager.addChatMessage(sender, text || '', savedImage);
        res.json({ ok: true, message: msg });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    /** Serve chat images */
    this.app.get('/chat/image/:filename', (req: Request, res: Response) => {
      const filename = req.params.filename as string;
      // Security: prevent path traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        res.status(400).json({ error: 'Invalid filename' });
        return;
      }
      const filePath = this.panelManager.getImagePath(filename);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Image not found' });
        return;
      }
      res.sendFile(filePath);
    });

    /** Set Copilot typing indicator */
    this.app.post('/chat/typing', (req: Request, res: Response) => {
      try {
        const { typing = true } = req.body;
        this.panelManager.setCopilotTyping(typing);
        res.json({ ok: true, typing });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    /** Test webhook connectivity */
    this.app.post('/chat/webhook/test', async (_req: Request, res: Response) => {
      try {
        const config = this.configManager.getConfig();
        if (!config.webhook?.enabled || !config.webhook?.url) {
          res.json({ ok: false, error: 'Webhook not configured or disabled' });
          return;
        }

        const url = config.webhook.url.replace(/\/$/, '');
        const response = await fetch(`${url}/api/health`, {
          signal: AbortSignal.timeout(5000),
        });

        res.json({
          ok: response.ok,
          status: response.status,
          url: config.webhook.url,
        });
      } catch (e: any) {
        res.json({ ok: false, error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // DRAW — Annotated screenshots
    // ═══════════════════════════════════════════════

    this.app.get('/screenshot/annotated', (_req: Request, res: Response) => {
      try {
        const png = this.drawManager.getLastScreenshot();
        if (!png) {
          res.status(404).json({ error: 'No annotated screenshot available' });
          return;
        }
        res.type('png').send(png);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/screenshot/annotated', async (_req: Request, res: Response) => {
      try {
        const activeTab = this.tabManager.getActiveTab();
        const wcId = activeTab ? activeTab.webContentsId : null;
        const result = await this.drawManager.captureAnnotated(wcId);
        if (result.ok) {
          res.json(result);
        } else {
          res.status(500).json(result);
        }
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/draw/toggle', (req: Request, res: Response) => {
      try {
        const { enabled } = req.body;
        const isEnabled = this.drawManager.toggleDrawMode(enabled);
        res.json({ ok: true, drawMode: isEnabled });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/screenshots', (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 10;
        const screenshots = this.drawManager.listScreenshots(limit);
        res.json({ screenshots });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // VOICE — Speech recognition control
    // ═══════════════════════════════════════════════

    this.app.post('/voice/start', (_req: Request, res: Response) => {
      try {
        this.voiceManager.start();
        res.json({ ok: true, listening: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/voice/stop', (_req: Request, res: Response) => {
      try {
        this.voiceManager.stop();
        res.json({ ok: true, listening: false });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/voice/status', (_req: Request, res: Response) => {
      try {
        const status = this.voiceManager.getStatus();
        res.json(status);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // ACTIVITY LOG — Live co-pilot feed
    // ═══════════════════════════════════════════════

    this.app.get('/activity-log', (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 100;
        const since = req.query.since ? parseInt(req.query.since as string) : undefined;
        const types = req.query.types ? (req.query.types as string).split(',') : undefined;

        let entries = this.activityTracker.getLog(limit * 2, since); // fetch extra to compensate for filtering

        if (types) {
          entries = entries.filter(e => types.includes(e.type));
        }

        entries = entries.slice(-limit);

        res.json({ entries, count: entries.length });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // BEHAVIORAL LEARNING — Stats endpoint
    // ═══════════════════════════════════════════════

    this.app.get('/behavior/stats', (_req: Request, res: Response) => {
      try {
        const stats = this.behaviorObserver.getStats();
        res.json(stats);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // CONFIG — Settings management
    // ═══════════════════════════════════════════════

    this.app.get('/config', (_req: Request, res: Response) => {
      try {
        res.json(this.configManager.getConfig());
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.patch('/config', (req: Request, res: Response) => {
      try {
        const updated = this.configManager.updateConfig(req.body);
        res.json(updated);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // TASKS — Agent task queue + approval (Fase 4)
    // ═══════════════════════════════════════════════

    this.app.get('/tasks', (req: Request, res: Response) => {
      try {
        const status = req.query.status as string | undefined;
        const tasks = this.taskManager.listTasks(status as any);
        res.json(tasks);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/tasks/:id', (req: Request, res: Response) => {
      const taskId = req.params.id as string;
      const task = this.taskManager.getTask(taskId);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    });

    this.app.post('/tasks', (req: Request, res: Response) => {
      try {
        const { description, createdBy, assignedTo, steps } = req.body;
        if (!description || !steps) {
          return res.status(400).json({ error: 'description and steps required' });
        }
        const task = this.taskManager.createTask(
          description,
          createdBy || 'claude',
          assignedTo || 'claude',
          steps
        );
        res.json(task);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/tasks/:id/approve', (req: Request, res: Response) => {
      try {
        const taskId = req.params.id as string;
        const { stepId } = req.body;
        this.taskManager.respondToApproval(taskId, stepId, true);
        res.json({ ok: true, approved: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/tasks/:id/reject', (req: Request, res: Response) => {
      try {
        const taskId = req.params.id as string;
        const { stepId } = req.body;
        this.taskManager.respondToApproval(taskId, stepId, false);
        res.json({ ok: true, approved: false });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/tasks/:id/status', (req: Request, res: Response) => {
      try {
        const taskId = req.params.id as string;
        const { status, stepIndex, stepStatus, result } = req.body;
        if (status === 'running') this.taskManager.markTaskRunning(taskId);
        else if (status === 'done') this.taskManager.markTaskDone(taskId, result);
        else if (status === 'failed') this.taskManager.markTaskFailed(taskId, result || 'Unknown error');
        if (stepIndex !== undefined && stepStatus) {
          this.taskManager.updateStepStatus(taskId, stepIndex, stepStatus, result);
        }
        const task = this.taskManager.getTask(taskId);
        res.json(task || { error: 'Task not found' });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/emergency-stop', (_req: Request, res: Response) => {
      try {
        const result = this.taskManager.emergencyStop();
        if (this.panelManager) {
          this.panelManager.addChatMessage('copilot', `🛑 Emergency stop! ${result.stopped} tasks stopped.`);
        }
        res.json(result);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/tasks/check-approval', (req: Request, res: Response) => {
      try {
        const { actionType, targetUrl } = req.query;
        const needs = this.taskManager.needsApproval(
          actionType as string || '',
          targetUrl as string
        );
        res.json({ needsApproval: needs });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/autonomy', (_req: Request, res: Response) => {
      res.json(this.taskManager.getAutonomySettings());
    });

    this.app.patch('/autonomy', (req: Request, res: Response) => {
      try {
        const updated = this.taskManager.updateAutonomySettings(req.body);
        res.json(updated);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/activity-log/agent', (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        res.json(this.taskManager.getActivityLog(limit));
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // TAB LOCKS — Multi-AI tab conflict prevention (Fase 5)
    // ═══════════════════════════════════════════════

    this.app.get('/tab-locks', (_req: Request, res: Response) => {
      try {
        res.json({ locks: this.tabLockManager.getAllLocks() });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/tab-locks/acquire', (req: Request, res: Response) => {
      try {
        const { tabId, agentId } = req.body;
        if (!tabId || !agentId) {
          return res.status(400).json({ error: 'tabId and agentId required' });
        }
        const result = this.tabLockManager.acquire(tabId, agentId);
        res.json(result);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/tab-locks/release', (req: Request, res: Response) => {
      try {
        const { tabId, agentId } = req.body;
        if (!tabId || !agentId) {
          return res.status(400).json({ error: 'tabId and agentId required' });
        }
        const released = this.tabLockManager.release(tabId, agentId);
        res.json({ ok: released });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/tab-locks/:tabId', (req: Request, res: Response) => {
      try {
        const tabId = req.params.tabId as string;
        const owner = this.tabLockManager.getOwner(tabId);
        res.json({ tabId, locked: owner !== null, owner });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // DATA — Export, Import, Wipe
    // ═══════════════════════════════════════════════

    this.app.post('/behavior/clear', (_req: Request, res: Response) => {
      try {
        const rawDir = path.join(os.homedir(), '.tandem', 'behavior', 'raw');
        if (fs.existsSync(rawDir)) {
          const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.jsonl'));
          for (const file of files) {
            fs.unlinkSync(path.join(rawDir, file));
          }
        }
        res.json({ ok: true, cleared: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/data/export', (_req: Request, res: Response) => {
      try {
        const tandemDir = path.join(os.homedir(), '.tandem');
        const data: Record<string, unknown> = {
          exportDate: new Date().toISOString(),
          version: '0.1.0',
        };

        // Config
        data.config = this.configManager.getConfig();

        // Chat history
        const chatPath = path.join(tandemDir, 'chat-history.json');
        if (fs.existsSync(chatPath)) {
          try { data.chatHistory = JSON.parse(fs.readFileSync(chatPath, 'utf-8')); } catch (e: any) { console.warn('Chat history load failed:', e.message); }
        }

        // Behavior stats
        data.behaviorStats = this.behaviorObserver.getStats();

        res.json(data);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/data/import', (req: Request, res: Response) => {
      try {
        const data = req.body;
        if (data.config) {
          this.configManager.updateConfig(data.config);
        }
        if (data.chatHistory) {
          const chatPath = path.join(os.homedir(), '.tandem', 'chat-history.json');
          fs.writeFileSync(chatPath, JSON.stringify(data.chatHistory, null, 2));
        }
        res.json({ ok: true, imported: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // SITE MEMORY — Phase 3.1
    // ═══════════════════════════════════════════════

    this.app.get('/memory/sites', (_req: Request, res: Response) => {
      try {
        const sites = this.siteMemory.listSites();
        res.json({ sites });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/memory/site/:domain', (req: Request, res: Response) => {
      try {
        const data = this.siteMemory.getSite(req.params.domain as string);
        if (!data) { res.status(404).json({ error: 'Site not found' }); return; }
        res.json(data);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/memory/site/:domain/diff', (req: Request, res: Response) => {
      try {
        const diffs = this.siteMemory.getDiffs(req.params.domain as string);
        res.json({ diffs });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/memory/search', (req: Request, res: Response) => {
      try {
        const q = req.query.q as string;
        if (!q) { res.status(400).json({ error: 'q parameter required' }); return; }
        const results = this.siteMemory.search(q);
        res.json({ results });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // WATCH — Phase 3.2
    // ═══════════════════════════════════════════════

    this.app.post('/watch/add', (req: Request, res: Response) => {
      try {
        const { url, intervalMinutes = 30 } = req.body;
        if (!url) { res.status(400).json({ error: 'url required' }); return; }
        const result = this.watchManager.addWatch(url, intervalMinutes);
        if ('error' in result) { res.status(400).json(result); return; }
        res.json({ ok: true, watch: result });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/watch/list', (_req: Request, res: Response) => {
      try {
        const watches = this.watchManager.listWatches();
        res.json({ watches });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.delete('/watch/remove', (req: Request, res: Response) => {
      try {
        const { url, id } = req.body;
        const removed = this.watchManager.removeWatch(id || url);
        res.json({ ok: removed });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/watch/check', async (req: Request, res: Response) => {
      try {
        const { url, id } = req.body;
        const results = await this.watchManager.forceCheck(id || url);
        res.json(results);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // HEADLESS — Phase 3.3
    // ═══════════════════════════════════════════════

    this.app.post('/headless/open', async (req: Request, res: Response) => {
      try {
        const { url } = req.body;
        if (!url) { res.status(400).json({ error: 'url required' }); return; }
        const result = await this.headlessManager.open(url);
        res.json(result);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/headless/content', async (_req: Request, res: Response) => {
      try {
        const result = await this.headlessManager.getContent();
        res.json(result);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/headless/status', (_req: Request, res: Response) => {
      try {
        res.json(this.headlessManager.getStatus());
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/headless/show', (_req: Request, res: Response) => {
      try {
        const shown = this.headlessManager.show();
        res.json({ ok: shown });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/headless/hide', (_req: Request, res: Response) => {
      try {
        const hidden = this.headlessManager.hide();
        res.json({ ok: hidden });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/headless/close', (_req: Request, res: Response) => {
      try {
        this.headlessManager.close();
        res.json({ ok: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // FORM MEMORY — Phase 3.4
    // ═══════════════════════════════════════════════

    this.app.get('/forms/memory', (_req: Request, res: Response) => {
      try {
        const domains = this.formMemory.listAll();
        res.json({ domains });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/forms/memory/:domain', (req: Request, res: Response) => {
      try {
        const data = this.formMemory.getForDomain(req.params.domain as string);
        if (!data) { res.status(404).json({ error: 'No form data for this domain' }); return; }
        res.json(data);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/forms/fill', (req: Request, res: Response) => {
      try {
        const { domain } = req.body;
        if (!domain) { res.status(400).json({ error: 'domain required' }); return; }
        const fields = this.formMemory.getFillData(domain);
        if (!fields) { res.status(404).json({ error: 'No form data for this domain' }); return; }
        res.json({ domain, fields });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.delete('/forms/memory/:domain', (req: Request, res: Response) => {
      try {
        const deleted = this.formMemory.deleteDomain(req.params.domain as string);
        res.json({ ok: deleted });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // CONTEXT BRIDGE — Phase 3.5
    // ═══════════════════════════════════════════════

    this.app.get('/context/recent', (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const pages = this.contextBridge.getRecent(limit);
        res.json({ pages });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/context/search', (req: Request, res: Response) => {
      try {
        const q = req.query.q as string;
        if (!q) { res.status(400).json({ error: 'q parameter required' }); return; }
        const results = this.contextBridge.search(q);
        res.json({ results });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/context/page', (req: Request, res: Response) => {
      try {
        const url = req.query.url as string;
        if (!url) { res.status(400).json({ error: 'url parameter required' }); return; }
        const page = this.contextBridge.getPage(url);
        if (!page) { res.status(404).json({ error: 'Page not found in context' }); return; }
        res.json(page);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/context/summary', (_req: Request, res: Response) => {
      try {
        const summary = this.contextBridge.getContextSummary();
        res.json(summary);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/context/note', (req: Request, res: Response) => {
      try {
        const { url, note } = req.body;
        if (!url || !note) { res.status(400).json({ error: 'url and note required' }); return; }
        const page = this.contextBridge.addNote(url, note);
        res.json({ ok: true, page });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // PIP — Phase 3.7
    // ═══════════════════════════════════════════════

    this.app.post('/pip/toggle', (req: Request, res: Response) => {
      try {
        const { open } = req.body;
        const visible = this.pipManager.toggle(open);
        res.json({ ok: true, visible });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/pip/status', (_req: Request, res: Response) => {
      try {
        res.json(this.pipManager.getStatus());
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // NETWORK INSPECTOR — Phase 3.8
    // ═══════════════════════════════════════════════

    this.app.get('/network/log', (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 100;
        const domain = req.query.domain as string | undefined;
        const entries = this.networkInspector.getLog(limit, domain);
        res.json({ entries, count: entries.length });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/network/apis', (_req: Request, res: Response) => {
      try {
        const apis = this.networkInspector.getApis();
        res.json({ apis });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/network/domains', (_req: Request, res: Response) => {
      try {
        const domains = this.networkInspector.getDomains();
        res.json({ domains });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.delete('/network/clear', (_req: Request, res: Response) => {
      try {
        this.networkInspector.clear();
        res.json({ ok: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // NETWORK MOCK — Request Interceptie & Mocking
    // ═══════════════════════════════════════════════

    this.app.post('/network/mock', async (req: Request, res: Response) => {
      try {
        const { pattern, abort, status, body, headers, delay } = req.body;
        if (!pattern) { res.status(400).json({ error: 'pattern required' }); return; }
        const rule = await this.networkMocker.addRule({ pattern, abort, status, body, headers, delay });
        res.json({ ok: true, id: rule.id, pattern: rule.pattern });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // Alias: agent-browser compatible
    this.app.post('/network/route', async (req: Request, res: Response) => {
      try {
        const { pattern, abort, status, body, headers, delay } = req.body;
        if (!pattern) { res.status(400).json({ error: 'pattern required' }); return; }
        const rule = await this.networkMocker.addRule({ pattern, abort, status, body, headers, delay });
        res.json({ ok: true, id: rule.id, pattern: rule.pattern });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/network/mocks', (_req: Request, res: Response) => {
      try {
        const mocks = this.networkMocker.getRules().map(r => ({
          id: r.id,
          pattern: r.pattern,
          status: r.status,
          abort: r.abort || false,
          delay: r.delay,
          createdAt: r.createdAt,
        }));
        res.json({ ok: true, mocks, count: mocks.length });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/network/unmock', async (req: Request, res: Response) => {
      try {
        const { pattern, id } = req.body;
        if (!pattern && !id) { res.status(400).json({ error: 'pattern or id required' }); return; }
        let removed = 0;
        if (id) {
          removed = await this.networkMocker.removeRuleById(id);
        } else {
          removed = await this.networkMocker.removeRule(pattern);
        }
        res.json({ ok: true, removed });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // Alias: agent-browser compatible
    this.app.post('/network/unroute', async (req: Request, res: Response) => {
      try {
        const { pattern, id } = req.body;
        if (!pattern && !id) { res.status(400).json({ error: 'pattern or id required' }); return; }
        let removed = 0;
        if (id) {
          removed = await this.networkMocker.removeRuleById(id);
        } else {
          removed = await this.networkMocker.removeRule(pattern);
        }
        res.json({ ok: true, removed });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/network/mock-clear', async (_req: Request, res: Response) => {
      try {
        const removed = await this.networkMocker.clearRules();
        res.json({ ok: true, removed });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // PERSISTENT SCRIPT INJECTION — Agent Tools Phase 1
    // ═══════════════════════════════════════════════

    this.app.get('/scripts', (_req: Request, res: Response) => {
      try {
        const scripts = this.scriptInjector.listScripts().map(s => ({
          name: s.name,
          enabled: s.enabled,
          preview: s.code.substring(0, 80),
          addedAt: s.addedAt,
        }));
        res.json({ scripts });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/scripts/add', (req: Request, res: Response) => {
      const { name, code } = req.body;
      if (!name || !code) { res.status(400).json({ error: 'name and code required' }); return; }
      try {
        const entry = this.scriptInjector.addScript(name, code);
        res.json({ ok: true, name: entry.name, active: entry.enabled });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.delete('/scripts/remove', (req: Request, res: Response) => {
      const { name } = req.body;
      if (!name) { res.status(400).json({ error: 'name required' }); return; }
      try {
        const removed = this.scriptInjector.removeScript(name);
        res.json({ ok: true, removed });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/scripts/enable', (req: Request, res: Response) => {
      const { name } = req.body;
      if (!name) { res.status(400).json({ error: 'name required' }); return; }
      try {
        const ok = this.scriptInjector.enableScript(name);
        if (!ok) { res.status(404).json({ error: `script "${name}" not found` }); return; }
        res.json({ ok: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/scripts/disable', (req: Request, res: Response) => {
      const { name } = req.body;
      if (!name) { res.status(400).json({ error: 'name required' }); return; }
      try {
        const ok = this.scriptInjector.disableScript(name);
        if (!ok) { res.status(404).json({ error: `script "${name}" not found` }); return; }
        res.json({ ok: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // PERSISTENT STYLE INJECTION — Agent Tools Phase 1
    // ═══════════════════════════════════════════════

    this.app.get('/styles', (_req: Request, res: Response) => {
      try {
        const styles = this.scriptInjector.listStyles().map(s => ({
          name: s.name,
          enabled: s.enabled,
          preview: s.css.substring(0, 80),
          addedAt: s.addedAt,
        }));
        res.json({ styles });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/styles/add', async (req: Request, res: Response) => {
      const { name, css } = req.body;
      if (!name || !css) { res.status(400).json({ error: 'name and css required' }); return; }
      try {
        this.scriptInjector.addStyle(name, css);
        // Inject immediately into active tab
        const wc = await this.getSessionWC(req);
        if (wc && !wc.isDestroyed()) await wc.insertCSS(css);
        res.json({ ok: true, name });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.delete('/styles/remove', async (req: Request, res: Response) => {
      const { name } = req.body;
      if (!name) { res.status(400).json({ error: 'name required' }); return; }
      try {
        const removed = this.scriptInjector.removeStyle(name);
        res.json({ ok: true, removed });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/styles/enable', (req: Request, res: Response) => {
      const { name } = req.body;
      if (!name) { res.status(400).json({ error: 'name required' }); return; }
      try {
        const ok = this.scriptInjector.enableStyle(name);
        if (!ok) { res.status(404).json({ error: `style "${name}" not found` }); return; }
        res.json({ ok: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/styles/disable', (req: Request, res: Response) => {
      const { name } = req.body;
      if (!name) { res.status(400).json({ error: 'name required' }); return; }
      try {
        const ok = this.scriptInjector.disableStyle(name);
        if (!ok) { res.status(404).json({ error: `style "${name}" not found` }); return; }
        res.json({ ok: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // CHROME IMPORT — Phase 4.1
    // ═══════════════════════════════════════════════

    this.app.get('/import/chrome/status', (_req: Request, res: Response) => {
      try {
        res.json(this.chromeImporter.getStatus());
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/import/chrome/bookmarks', (_req: Request, res: Response) => {
      try {
        const result = this.chromeImporter.importBookmarks();
        // Reload BookmarkManager so it picks up the imported data
        this.bookmarkManager.reload();
        res.json(result);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/import/chrome/history', (_req: Request, res: Response) => {
      try {
        const result = this.chromeImporter.importHistory();
        res.json(result);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/import/chrome/cookies', async (_req: Request, res: Response) => {
      try {
        const result = await this.chromeImporter.importCookies(this.win.webContents.session);
        res.json(result);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══ Chrome Sync — Bookmark auto-sync ═══

    this.app.get('/import/chrome/profiles', (_req: Request, res: Response) => {
      try {
        const profiles = this.chromeImporter.listProfiles();
        res.json({ profiles });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/import/chrome/sync/start', (req: Request, res: Response) => {
      try {
        if (req.body.profile) {
          this.chromeImporter.setProfile(req.body.profile);
        }
        const started = this.chromeImporter.startSync();
        res.json({ ok: started, syncing: this.chromeImporter.isSyncing() });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/import/chrome/sync/stop', (_req: Request, res: Response) => {
      try {
        this.chromeImporter.stopSync();
        res.json({ ok: true, syncing: false });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/import/chrome/sync/status', (_req: Request, res: Response) => {
      try {
        res.json({ syncing: this.chromeImporter.isSyncing() });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // BOOKMARKS — Phase 4.2
    // ═══════════════════════════════════════════════

    this.app.get('/bookmarks', (_req: Request, res: Response) => {
      try {
        const bookmarks = this.bookmarkManager.list();
        const bar = this.bookmarkManager.getBarItems();
        res.json({ bookmarks, bar });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/bookmarks/add', (req: Request, res: Response) => {
      try {
        const { name, url, parentId } = req.body;
        if (!name || !url) { res.status(400).json({ error: 'name and url required' }); return; }
        const bookmark = this.bookmarkManager.add(name, url, parentId);
        res.json({ ok: true, bookmark });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.delete('/bookmarks/remove', (req: Request, res: Response) => {
      try {
        const { id } = req.body;
        if (!id) { res.status(400).json({ error: 'id required' }); return; }
        const removed = this.bookmarkManager.remove(id);
        res.json({ ok: removed });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.put('/bookmarks/update', (req: Request, res: Response) => {
      try {
        const { id, name, url } = req.body;
        if (!id) { res.status(400).json({ error: 'id required' }); return; }
        const updated = this.bookmarkManager.update(id, { name, url });
        if (!updated) { res.status(404).json({ error: 'Bookmark not found' }); return; }
        res.json({ ok: true, bookmark: updated });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/bookmarks/add-folder', (req: Request, res: Response) => {
      try {
        const { name, parentId } = req.body;
        if (!name) { res.status(400).json({ error: 'name required' }); return; }
        const folder = this.bookmarkManager.addFolder(name, parentId);
        res.json({ ok: true, folder });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/bookmarks/move', (req: Request, res: Response) => {
      try {
        const { id, parentId } = req.body;
        if (!id) { res.status(400).json({ error: 'id required' }); return; }
        const moved = this.bookmarkManager.move(id, parentId);
        res.json({ ok: moved });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/bookmarks/search', (req: Request, res: Response) => {
      try {
        const q = req.query.q as string;
        if (!q) { res.status(400).json({ error: 'q parameter required' }); return; }
        const results = this.bookmarkManager.search(q);
        res.json({ results });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/bookmarks/check', (req: Request, res: Response) => {
      try {
        const url = req.query.url as string;
        if (!url) { res.status(400).json({ error: 'url parameter required' }); return; }
        const bookmarked = this.bookmarkManager.isBookmarked(url);
        const bookmark = this.bookmarkManager.findByUrl(url);
        res.json({ bookmarked, bookmark });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // HISTORY — Phase 4.3
    // ═══════════════════════════════════════════════

    this.app.get('/history', (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 100;
        const offset = parseInt(req.query.offset as string) || 0;
        const entries = this.historyManager.getHistory(limit, offset);
        res.json({ entries, total: this.historyManager.count });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/history/search', (req: Request, res: Response) => {
      try {
        const q = req.query.q as string;
        if (!q) { res.status(400).json({ error: 'q parameter required' }); return; }
        const results = this.historyManager.search(q);
        res.json({ results });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.delete('/history/clear', (_req: Request, res: Response) => {
      try {
        this.historyManager.clear();
        res.json({ ok: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // DOWNLOADS — Phase 4.4
    // ═══════════════════════════════════════════════

    this.app.get('/downloads', (_req: Request, res: Response) => {
      try {
        const downloads = this.downloadManager.list();
        res.json({ downloads });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/downloads/active', (_req: Request, res: Response) => {
      try {
        const downloads = this.downloadManager.listActive();
        res.json({ downloads });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // AUDIO CAPTURE — Phase 5.6
    // ═══════════════════════════════════════════════

    this.app.post('/audio/start', async (_req: Request, res: Response) => {
      try {
        const activeTab = this.tabManager.getActiveTab();
        if (!activeTab) { res.status(400).json({ error: 'No active tab' }); return; }
        const result = await this.audioCaptureManager.startRecording(activeTab.webContentsId);
        res.json(result);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/audio/stop', (_req: Request, res: Response) => {
      try {
        const result = this.audioCaptureManager.stopRecording();
        res.json(result);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/audio/status', (_req: Request, res: Response) => {
      try {
        res.json(this.audioCaptureManager.getStatus());
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/audio/recordings', (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const recordings = this.audioCaptureManager.listRecordings(limit);
        res.json({ recordings });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // EXTENSIONS — Phase 5.7 + Phase 2 API Routes
    // ═══════════════════════════════════════════════

    this.app.get('/extensions/list', (_req: Request, res: Response) => {
      try {
        const { loaded, available } = this.extensionManager.list();

        // Enrich loaded extensions with conflict info (Phase 10a)
        const loadedWithConflicts = loaded.map(ext => {
          const conflicts = this.extensionManager.getConflictsForExtension(
            path.basename(ext.path)
          );
          return { ...ext, conflicts };
        });

        res.json({
          loaded: loadedWithConflicts,
          available,
          count: { loaded: loaded.length, available: available.length },
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/extensions/load', async (req: Request, res: Response) => {
      try {
        const { path: extPath } = req.body;
        if (!extPath) { res.status(400).json({ error: 'path required' }); return; }
        const ses = this.win.webContents.session;
        const result = await this.extensionLoader.loadExtension(ses, extPath);
        res.json({ ok: true, extension: result });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // POST /extensions/install — Install extension from CWS URL or extension ID
    this.app.post('/extensions/install', async (req: Request, res: Response) => {
      try {
        const { input } = req.body;
        if (!input || typeof input !== 'string' || !input.trim()) {
          res.status(400).json({ success: false, error: 'Missing or invalid "input" field — provide a CWS URL or extension ID' });
          return;
        }
        const ses = this.win.webContents.session;
        const result = await this.extensionManager.install(input.trim(), ses);
        if (!result.success) {
          res.status(400).json(result);
          return;
        }
        // Notify renderer to refresh extension toolbar
        this.win.webContents.send('extension-toolbar-refresh');
        res.json(result);
      } catch (e: any) {
        console.error('Extension install error:', e);
        res.status(500).json({ success: false, error: e.message });
      }
    });

    // DELETE /extensions/uninstall/:id — Uninstall extension by ID (accepts CWS ID or Electron ID)
    this.app.delete('/extensions/uninstall/:id', (req: Request, res: Response) => {
      try {
        const id = req.params.id as string;
        // Validate extension ID format (32 lowercase a-p chars)
        if (!/^[a-p]{32}$/.test(id)) {
          res.status(400).json({ success: false, error: 'Invalid extension ID format — must be 32 lowercase a-p characters' });
          return;
        }

        const { loaded, available } = this.extensionManager.list();
        const ses = this.win.webContents.session;

        // Resolve IDs: user may pass CWS ID (folder name) or Electron runtime ID
        // When manifest lacks "key" field, these differ — we need both for correct cleanup
        let electronId: string | null = null;
        let diskId: string | null = null;

        // Check if ID matches a loaded extension's Electron ID
        const byElectronId = loaded.find(e => e.id === id);
        if (byElectronId) {
          electronId = id;
          diskId = path.basename(byElectronId.path);
        }

        // Check if ID matches a CWS/disk folder name
        if (!diskId) {
          const onDisk = available.some(e => path.basename(e.path) === id);
          if (onDisk) {
            diskId = id;
            // Find Electron ID for session removal
            const byPath = loaded.find(e => path.basename(e.path) === id);
            if (byPath) electronId = byPath.id;
          }
        }

        if (!electronId && !diskId) {
          res.status(404).json({ success: false, error: `Extension ${id} not found` });
          return;
        }

        // Remove from session using Electron ID (may differ from CWS ID)
        if (electronId) {
          try {
            ses.removeExtension(electronId);
            console.log(`🧩 Extension removed from session — Electron ID: ${electronId}`);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`⚠️ session.removeExtension(${electronId}) failed: ${msg}`);
          }
        }

        // Remove from disk using CWS/disk ID (the folder name)
        if (diskId) {
          const extPath = path.join(os.homedir(), '.tandem', 'extensions', diskId);
          if (fs.existsSync(extPath)) {
            try {
              fs.rmSync(extPath, { recursive: true, force: true });
              console.log(`🧩 Extension removed from disk: ${extPath}`);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              res.status(500).json({ success: false, error: `Failed to remove extension files: ${msg}` });
              return;
            }
          }
        }

        // Notify renderer to refresh extension toolbar
        this.win.webContents.send('extension-toolbar-refresh');
        res.json({ success: true });
      } catch (e: any) {
        console.error('Extension uninstall error:', e);
        res.status(500).json({ success: false, error: e.message });
      }
    });

    // GET /extensions/chrome/list — List Chrome extensions available for import
    this.app.get('/extensions/chrome/list', (req: Request, res: Response) => {
      try {
        const profile = typeof req.query.profile === 'string' ? req.query.profile : 'Default';
        const importer = new ChromeExtensionImporter(profile);
        const chromeDir = importer.getChromeExtensionsDir();

        if (!chromeDir) {
          res.json({ chromeDir: null, extensions: [] });
          return;
        }

        const extensions = importer.listChromeExtensions().map(ext => ({
          id: ext.id,
          name: ext.name,
          version: ext.version,
          alreadyImported: importer.isAlreadyImported(ext.id),
        }));

        res.json({ chromeDir, extensions });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // POST /extensions/chrome/import — Import Chrome extension(s) into Tandem
    this.app.post('/extensions/chrome/import', (req: Request, res: Response) => {
      try {
        const profile = typeof req.body.profile === 'string' ? req.body.profile : 'Default';
        const importer = new ChromeExtensionImporter(profile);

        if (req.body.all === true) {
          const result = importer.importAll();
          res.json(result);
          return;
        }

        const extensionId = req.body.extensionId;
        if (!extensionId || typeof extensionId !== 'string') {
          res.status(400).json({ error: 'Missing "extensionId" or set "all: true" to import all' });
          return;
        }

        const result = importer.importExtension(extensionId.trim());
        if (!result.success && !result.skipped) {
          res.status(400).json(result);
          return;
        }
        res.json({
          imported: result.skipped ? 0 : 1,
          skipped: result.skipped ? 1 : 0,
          failed: 0,
          details: [result],
        });
      } catch (e: any) {
        console.error('Chrome extension import error:', e);
        res.status(500).json({ error: e.message });
      }
    });

    // GET /extensions/gallery — Curated extension gallery with install status
    this.app.get('/extensions/gallery', (_req: Request, res: Response) => {
      try {
        const gallery = new GalleryLoader();

        // Build set of installed extension IDs (folder names on disk)
        const { available } = this.extensionManager.list();
        const installedIds = new Set(available.map(e => path.basename(e.path)));

        const category = typeof _req.query.category === 'string' ? _req.query.category : undefined;
        const featured = typeof _req.query.featured === 'string' ? _req.query.featured : undefined;

        const result = gallery.getGalleryResponse(installedIds, { category, featured });
        res.json(result);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // GET /extensions/native-messaging/status — Native messaging host detection status
    this.app.get('/extensions/native-messaging/status', (_req: Request, res: Response) => {
      try {
        const status = this.extensionManager.getNativeMessagingStatus();
        res.json(status);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // POST /extensions/identity/auth — Handle chrome.identity.launchWebAuthFlow() from extensions
    // No auth token required — called by extension service workers via polyfill.
    // Accepts only from localhost (Express binds to 127.0.0.1).
    this.app.post('/extensions/identity/auth', async (req: Request, res: Response) => {
      try {
        const { url, interactive, extensionId } = req.body;
        if (!url || typeof url !== 'string') {
          res.status(400).json({ error: 'url is required' });
          return;
        }
        if (!extensionId || typeof extensionId !== 'string') {
          res.status(400).json({ error: 'extensionId is required' });
          return;
        }
        const polyfill = this.extensionManager.getIdentityPolyfill();
        const result = await polyfill.handleLaunchWebAuthFlow({
          url,
          interactive: interactive !== false,
          extensionId,
        });
        res.json(result);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: message });
      }
    });

    // GET /extensions/updates/check — Trigger manual update check for all installed extensions
    this.app.get('/extensions/updates/check', async (_req: Request, res: Response) => {
      try {
        const results = await this.extensionManager.checkForUpdates();
        const updatesAvailable = results.filter(r => r.updateAvailable);
        const state = this.extensionManager.getUpdateState();
        res.json({
          checked: results.length,
          updatesAvailable,
          results,
          lastCheck: state.lastCheckTimestamp,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: message });
      }
    });

    // GET /extensions/updates/status — Current update status without triggering a check
    this.app.get('/extensions/updates/status', (_req: Request, res: Response) => {
      try {
        const state = this.extensionManager.getUpdateState();
        const nextCheck = this.extensionManager.getNextScheduledCheck();

        // Build per-extension status from state
        const extensions: Record<string, { installedVersion: string; latestKnownVersion: string | null; updateAvailable: boolean }> = {};
        for (const [id, ext] of Object.entries(state.extensions)) {
          extensions[id] = {
            installedVersion: ext.installedVersion,
            latestKnownVersion: ext.latestKnownVersion,
            updateAvailable: ext.latestKnownVersion !== null && ext.latestKnownVersion !== ext.installedVersion,
          };
        }

        res.json({
          lastCheck: state.lastCheckTimestamp,
          nextScheduledCheck: nextCheck,
          checkIntervalMs: state.checkIntervalMs,
          extensions,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: message });
      }
    });

    // POST /extensions/updates/apply — Apply available updates
    this.app.post('/extensions/updates/apply', async (req: Request, res: Response) => {
      try {
        const ses = this.win.webContents.session;
        const { extensionId } = req.body;

        let results;
        if (extensionId && typeof extensionId === 'string') {
          // Update specific extension
          const result = await this.extensionManager.applyUpdate(extensionId.trim(), ses);
          results = [result];
        } else {
          // Update all
          results = await this.extensionManager.applyAllUpdates(ses);
        }

        // Notify renderer to refresh extension toolbar after updates
        if (results.some(r => r.success)) {
          this.win.webContents.send('extension-toolbar-refresh');
        }

        res.json({ results });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: message });
      }
    });

    // GET /extensions/disk-usage — Per-extension disk usage
    this.app.get('/extensions/disk-usage', (_req: Request, res: Response) => {
      try {
        const usage = this.extensionManager.getDiskUsage();
        res.json(usage);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: message });
      }
    });

    // GET /extensions/conflicts — All detected conflicts across installed extensions (Phase 10a)
    this.app.get('/extensions/conflicts', (_req: Request, res: Response) => {
      try {
        const { conflicts, summary } = this.extensionManager.getAllConflicts();
        res.json({ conflicts, summary });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: message });
      }
    });

    // ═══════════════════════════════════════════════
    // CLARONOTE — Voice-to-text integration
    // ═══════════════════════════════════════════════

    // Authentication
    this.app.post('/claronote/login', async (req: Request, res: Response) => {
      try {
        const { email, password } = req.body;
        if (!email || !password) {
          res.status(400).json({ error: 'Email and password required' });
          return;
        }

        const result = await this.claroNoteManager.login(email, password);
        if (result.success) {
          res.json({ success: true, user: this.claroNoteManager.getAuth()?.user });
        } else {
          res.status(401).json({ success: false, error: result.error });
        }
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/claronote/logout', async (_req: Request, res: Response) => {
      try {
        await this.claroNoteManager.logout();
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/claronote/me', async (_req: Request, res: Response) => {
      try {
        const user = await this.claroNoteManager.getMe();
        res.json({ user });
      } catch (e: any) {
        res.status(401).json({ error: e.message });
      }
    });

    this.app.get('/claronote/status', (_req: Request, res: Response) => {
      try {
        const auth = this.claroNoteManager.getAuth();
        res.json({
          authenticated: !!auth,
          user: auth?.user || null,
          recording: this.claroNoteManager.getRecordingStatus()
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // Recording
    this.app.post('/claronote/record/start', async (_req: Request, res: Response) => {
      try {
        const result = await this.claroNoteManager.startRecording();
        if (result.success) {
          res.json({ success: true });
        } else {
          res.status(400).json({ success: false, error: result.error });
        }
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/claronote/record/stop', async (_req: Request, res: Response) => {
      try {
        const result = await this.claroNoteManager.stopRecording();
        if (result.success) {
          res.json({ success: true, noteId: result.noteId });
        } else {
          res.status(400).json({ success: false, error: result.error });
        }
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // Notes
    this.app.get('/claronote/notes', async (req: Request, res: Response) => {
      try {
        const limitParam = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
        const limit = parseInt(limitParam as string || '10') || 10;
        const notes = await this.claroNoteManager.getNotes(limit);
        res.json({ notes });
      } catch (e: any) {
        res.status(401).json({ error: e.message });
      }
    });

    this.app.get('/claronote/notes/:id', async (req: Request, res: Response) => {
      try {
        const noteId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const note = await this.claroNoteManager.getNote(noteId);
        res.json({ note });
      } catch (e: any) {
        res.status(404).json({ error: e.message });
      }
    });

    // Upload audio recording from renderer
    this.app.post('/claronote/upload', async (req: Request, res: Response) => {
      try {
        const { audioBase64, duration } = req.body;
        if (!audioBase64) { res.status(400).json({ error: 'audioBase64 required' }); return; }
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const noteId = await this.claroNoteManager.uploadRecording(audioBuffer, duration || 0);
        res.json({ ok: true, noteId });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // DATA — Export, Import, Wipe
    // ═══════════════════════════════════════════════

    this.app.post('/data/wipe', (_req: Request, res: Response) => {
      try {
        const tandemDir = path.join(os.homedir(), '.tandem');

        // Wipe chat history
        const chatPath = path.join(tandemDir, 'chat-history.json');
        if (fs.existsSync(chatPath)) fs.unlinkSync(chatPath);

        // Wipe config
        const configPath = path.join(tandemDir, 'config.json');
        if (fs.existsSync(configPath)) fs.unlinkSync(configPath);

        // Wipe behavior data
        const rawDir = path.join(tandemDir, 'behavior', 'raw');
        if (fs.existsSync(rawDir)) {
          const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.jsonl'));
          for (const file of files) {
            fs.unlinkSync(path.join(rawDir, file));
          }
        }

        res.json({ ok: true, wiped: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // CONTENT EXTRACTION (Phase 5)
    // ═══════════════════════════════════════════════

    this.app.post('/content/extract', async (_req: Request, res: Response) => {
      try {
        const wc = await this.getActiveWC();
        if (!wc) {
          res.status(500).json({ error: 'No active tab' });
          return;
        }

        const content = await this.contentExtractor.extractCurrentPage(this.win);
        res.json(content);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/content/extract/url', async (req: Request, res: Response) => {
      try {
        const { url } = req.body;
        if (!url) {
          res.status(400).json({ error: 'url required' });
          return;
        }

        const content = await this.contentExtractor.extractFromURL(url, this.headlessManager);
        res.json(content);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // WORKFLOW ENGINE (Phase 5)
    // ═══════════════════════════════════════════════

    this.app.get('/workflows', async (_req: Request, res: Response) => {
      try {
        const workflows = await this.workflowEngine.getWorkflows();
        res.json({ workflows });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/workflows', async (req: Request, res: Response) => {
      try {
        const { name, description, steps, variables } = req.body;
        if (!name || !steps) {
          res.status(400).json({ error: 'name and steps required' });
          return;
        }

        const id = await this.workflowEngine.saveWorkflow({
          name,
          description,
          steps,
          variables
        });

        res.json({ id });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.delete('/workflows/:id', async (req: Request, res: Response) => {
      try {
        const id = req.params.id as string;
        await this.workflowEngine.deleteWorkflow(id);
        res.json({ ok: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/workflow/run', async (req: Request, res: Response) => {
      try {
        const { workflowId, variables } = req.body;
        if (!workflowId) {
          res.status(400).json({ error: 'workflowId required' });
          return;
        }

        const wc = await this.getActiveWC();
        if (!wc) {
          res.status(500).json({ error: 'No active tab' });
          return;
        }

        const executionId = await this.workflowEngine.runWorkflow(
          workflowId,
          this.win,
          variables || {}
        );

        res.json({ executionId });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/workflow/status/:executionId', async (req: Request, res: Response) => {
      try {
        const executionId = req.params.executionId as string;
        if (Array.isArray(executionId)) {
          res.status(400).json({ error: 'Invalid executionId' });
          return;
        }
        const status = await this.workflowEngine.getExecutionStatus(executionId);

        if (!status) {
          res.status(404).json({ error: 'Execution not found' });
          return;
        }

        res.json(status);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/workflow/stop', async (req: Request, res: Response) => {
      try {
        const { executionId } = req.body;
        if (!executionId) {
          res.status(400).json({ error: 'executionId required' });
          return;
        }

        await this.workflowEngine.stopWorkflow(executionId);
        res.json({ ok: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/workflow/running', async (_req: Request, res: Response) => {
      try {
        const executions = await this.workflowEngine.getRunningExecutions();
        res.json({ executions });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // LOGIN STATE MANAGER (Phase 5)
    // ═══════════════════════════════════════════════

    this.app.get('/auth/states', async (_req: Request, res: Response) => {
      try {
        const states = await this.loginManager.getAllStates();
        res.json({ states });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/auth/state/:domain', async (req: Request, res: Response) => {
      try {
        const domain = req.params.domain as string;
        const state = await this.loginManager.getLoginState(domain);
        res.json(state);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/auth/check', async (_req: Request, res: Response) => {
      try {
        const wc = await this.getActiveWC();
        if (!wc) {
          res.status(500).json({ error: 'No active tab' });
          return;
        }

        const state = await this.loginManager.checkCurrentPage(this.win);
        res.json(state);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/auth/is-login-page', async (_req: Request, res: Response) => {
      try {
        const wc = await this.getActiveWC();
        if (!wc) {
          res.status(500).json({ error: 'No active tab' });
          return;
        }

        const isLoginPage = await this.loginManager.isLoginPage(this.win);
        res.json({ isLoginPage });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/auth/update', async (req: Request, res: Response) => {
      try {
        const { domain, status, username } = req.body;
        if (!domain || !status) {
          res.status(400).json({ error: 'domain and status required' });
          return;
        }

        await this.loginManager.updateLoginState(domain, status, username);
        res.json({ ok: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.delete('/auth/state/:domain', async (req: Request, res: Response) => {
      try {
        const domain = req.params.domain as string;
        await this.loginManager.clearLoginState(domain);
        res.json({ ok: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // DEVTOOLS — CDP Bridge for Copilot
    // ═══════════════════════════════════════════════

    /** DevTools status */
    this.app.get('/devtools/status', async (_req: Request, res: Response) => {
      try {
        const status = this.devToolsManager.getStatus();
        res.json(status);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    /** Console log entries */
    this.app.get('/devtools/console', (req: Request, res: Response) => {
      try {
        const level = req.query.level as string | undefined;
        const sinceId = req.query.since_id ? parseInt(req.query.since_id as string) : undefined;
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
        const search = req.query.search as string | undefined;
        const entries = this.devToolsManager.getConsoleEntries({ level, sinceId, limit, search });
        const counts = this.devToolsManager.getConsoleCounts();
        res.json({ entries, counts, total: entries.length });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    /** Console errors only (convenience) */
    this.app.get('/devtools/console/errors', (req: Request, res: Response) => {
      try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
        const errors = this.devToolsManager.getConsoleErrors(limit);
        res.json({ errors, total: errors.length });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    /** Clear console log buffer */
    this.app.post('/devtools/console/clear', (_req: Request, res: Response) => {
      this.devToolsManager.clearConsole();
      res.json({ ok: true });
    });

    /** Network entries (CDP-level, with headers and POST bodies) */
    this.app.get('/devtools/network', (req: Request, res: Response) => {
      try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
        const domain = req.query.domain as string | undefined;
        const type = req.query.type as string | undefined;
        const failed = req.query.failed === 'true' ? true : req.query.failed === 'false' ? false : undefined;
        const search = req.query.search as string | undefined;
        const statusMin = req.query.status_min ? parseInt(req.query.status_min as string) : undefined;
        const statusMax = req.query.status_max ? parseInt(req.query.status_max as string) : undefined;
        const entries = this.devToolsManager.getNetworkEntries({ limit, domain, type, failed, search, statusMin, statusMax });
        res.json({ entries, total: entries.length });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    /** Get response body for a specific network request */
    this.app.get('/devtools/network/:requestId/body', async (req: Request, res: Response) => {
      try {
        const body = await this.devToolsManager.getResponseBody(req.params.requestId as string);
        if (!body) {
          res.status(404).json({ error: 'Response body not available (evicted or streamed)' });
          return;
        }
        res.json(body);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    /** Clear network log */
    this.app.post('/devtools/network/clear', (_req: Request, res: Response) => {
      this.devToolsManager.clearNetwork();
      res.json({ ok: true });
    });

    /** Query DOM by CSS selector */
    this.app.post('/devtools/dom/query', async (req: Request, res: Response) => {
      try {
        const { selector, maxResults = 10 } = req.body;
        if (!selector) { res.status(400).json({ error: 'selector required' }); return; }
        const nodes = await this.devToolsManager.queryDOM(selector, maxResults);
        res.json({ nodes, total: nodes.length });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    /** Query DOM by XPath */
    this.app.post('/devtools/dom/xpath', async (req: Request, res: Response) => {
      try {
        const { expression, maxResults = 10 } = req.body;
        if (!expression) { res.status(400).json({ error: 'expression required' }); return; }
        const nodes = await this.devToolsManager.queryXPath(expression, maxResults);
        res.json({ nodes, total: nodes.length });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    /** Get storage (cookies, localStorage, sessionStorage) */
    this.app.get('/devtools/storage', async (_req: Request, res: Response) => {
      try {
        const data = await this.devToolsManager.getStorage();
        res.json(data);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    /** Get performance metrics */
    this.app.get('/devtools/performance', async (_req: Request, res: Response) => {
      try {
        const metrics = await this.devToolsManager.getPerformanceMetrics();
        if (!metrics) {
          res.status(503).json({ error: 'No active tab or CDP not attached' });
          return;
        }
        res.json(metrics);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    /** Evaluate JavaScript via CDP Runtime */
    this.app.post('/devtools/evaluate', async (req: Request, res: Response) => {
      try {
        const { expression, returnByValue = true, awaitPromise = true } = req.body;
        if (!expression) { res.status(400).json({ error: 'expression required' }); return; }
        const result = await this.devToolsManager.evaluate(expression, { returnByValue, awaitPromise });
        res.json({ ok: true, result });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    /** Raw CDP command (advanced — send any CDP method) */
    this.app.post('/devtools/cdp', async (req: Request, res: Response) => {
      try {
        const { method, params } = req.body;
        if (!method) { res.status(400).json({ error: 'method required' }); return; }
        const result = await this.devToolsManager.sendCommand(method, params);
        res.json({ ok: true, result });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    /** Screenshot a specific element by CSS selector */
    this.app.post('/devtools/screenshot/element', async (req: Request, res: Response) => {
      try {
        const { selector } = req.body;
        if (!selector) { res.status(400).json({ error: 'selector required' }); return; }
        const png = await this.devToolsManager.screenshotElement(selector);
        if (!png) {
          res.status(404).json({ error: 'Element not found or screenshot failed' });
          return;
        }
        res.set('Content-Type', 'image/png');
        res.send(png);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    /** Toggle DevTools window for active tab (for debugging).
     *  NOTE: After closing DevTools, CDP connection is lost.
     *  The next API call to any /devtools/* endpoint will re-attach automatically. */
    this.app.post('/devtools/toggle', async (_req: Request, res: Response) => {
      try {
        const wc = await this.tabManager.getActiveWebContents();
        if (wc) {
          if (wc.isDevToolsOpened()) {
            wc.closeDevTools();
          } else {
            wc.openDevTools({ mode: 'detach' });
          }
          res.json({ ok: true, open: wc.isDevToolsOpened() });
        } else {
          res.status(404).json({ error: 'No active tab' });
        }
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // SNAPSHOT — Accessibility Tree met @refs
    // ═══════════════════════════════════════════════

    this.app.get('/snapshot', async (req: Request, res: Response) => {
      try {
        const interactive = req.query.interactive === 'true';
        const compact = req.query.compact === 'true';
        const selector = req.query.selector as string | undefined;
        const depthStr = req.query.depth as string | undefined;
        const depth = depthStr ? parseInt(depthStr, 10) : undefined;
        const result = await this.snapshotManager.getSnapshot({ interactive, compact, selector, depth });
        res.json({ ok: true, snapshot: result.text, count: result.count, url: result.url });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/snapshot/click', async (req: Request, res: Response) => {
      const { ref } = req.body;
      if (!ref) { res.status(400).json({ error: 'ref required (e.g. "@e1")' }); return; }
      try {
        await this.snapshotManager.clickRef(ref);
        res.json({ ok: true, ref });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/snapshot/fill', async (req: Request, res: Response) => {
      const { ref, value } = req.body;
      if (!ref || value === undefined) { res.status(400).json({ error: 'ref and value required' }); return; }
      try {
        await this.snapshotManager.fillRef(ref, value);
        res.json({ ok: true, ref });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/snapshot/text', async (req: Request, res: Response) => {
      const ref = req.query.ref as string;
      if (!ref) { res.status(400).json({ error: 'ref query parameter required (e.g. "?ref=@e1")' }); return; }
      try {
        const text = await this.snapshotManager.getTextRef(ref);
        res.json({ ok: true, ref, text });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // LOCATORS — Semantic Element Finding (Playwright-style)
    // ═══════════════════════════════════════════════

    this.app.post('/find', async (req: Request, res: Response) => {
      const query: LocatorQuery = req.body;
      if (!query.by || !query.value) {
        res.status(400).json({ error: '"by" and "value" required' }); return;
      }
      try {
        const result = await this.locatorFinder.find(query);
        res.json(result);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/find/click', async (req: Request, res: Response) => {
      const { fillValue, ...query } = req.body;
      if (!query.by || !query.value) {
        res.status(400).json({ error: '"by" and "value" required' }); return;
      }
      try {
        const result = await this.locatorFinder.find(query);
        if (!result.found || !result.ref) {
          res.status(404).json({ found: false, error: 'Element not found' }); return;
        }
        await this.snapshotManager.clickRef(result.ref);
        res.json({ ok: true, ref: result.ref, clicked: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/find/fill', async (req: Request, res: Response) => {
      const { fillValue, ...query } = req.body;
      if (!query.by || !query.value) {
        res.status(400).json({ error: '"by" and "value" required' }); return;
      }
      if (!fillValue) { res.status(400).json({ error: 'fillValue required' }); return; }
      try {
        const result = await this.locatorFinder.find(query);
        if (!result.found || !result.ref) {
          res.status(404).json({ found: false, error: 'Element not found' }); return;
        }
        await this.snapshotManager.fillRef(result.ref, fillValue);
        res.json({ ok: true, ref: result.ref, filled: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/find/all', async (req: Request, res: Response) => {
      const query: LocatorQuery = req.body;
      if (!query.by || !query.value) {
        res.status(400).json({ error: '"by" and "value" required' }); return;
      }
      try {
        const results = await this.locatorFinder.findAll(query);
        res.json({ found: results.length > 0, count: results.length, results });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // DEVICE EMULATION
    // ═══════════════════════════════════════════════

    this.app.get('/device/profiles', (_req: Request, res: Response) => {
      res.json({ profiles: this.deviceEmulator.getProfiles() });
    });

    this.app.get('/device/status', (_req: Request, res: Response) => {
      res.json(this.deviceEmulator.getStatus());
    });

    this.app.post('/device/emulate', async (req: Request, res: Response) => {
      try {
        const wc = await this.getSessionWC(req);
        if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }

        const { device, width, height, deviceScaleFactor, mobile, userAgent } = req.body;

        if (device) {
          const profile = await this.deviceEmulator.emulateDevice(wc, device);
          res.json({ ok: true, profile });
        } else if (width && height) {
          await this.deviceEmulator.emulateCustom(wc, {
            width: Number(width),
            height: Number(height),
            deviceScaleFactor: deviceScaleFactor ? Number(deviceScaleFactor) : undefined,
            mobile: Boolean(mobile),
            userAgent,
          });
          res.json({ ok: true });
        } else {
          res.status(400).json({ error: '"device" or "width"+"height" required' });
        }
      } catch (e: unknown) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
      }
    });

    this.app.post('/device/reset', async (req: Request, res: Response) => {
      try {
        const wc = await this.getSessionWC(req);
        if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }
        await this.deviceEmulator.reset(wc);
        res.json({ ok: true });
      } catch (e: unknown) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
      }
    });

    // ═══════════════════════════════════════════════
    // SESSIONS — Geïsoleerde Browser Sessies
    // ═══════════════════════════════════════════════

    this.app.get('/sessions/list', async (_req: Request, res: Response) => {
      try {
        const sessions = this.sessionManager.list().map(s => ({
          ...s,
          tabs: this.tabManager.listTabs().filter(t => t.partition === s.partition).length,
        }));
        res.json({ ok: true, sessions, active: this.sessionManager.getActive() });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/sessions/create', async (req: Request, res: Response) => {
      const { name, url } = req.body;
      if (!name) { res.status(400).json({ error: 'name required' }); return; }
      try {
        const sess = this.sessionManager.create(name);
        let tab = null;
        if (url) {
          tab = await this.tabManager.openTab(url, undefined, 'copilot', sess.partition);
        }
        res.json({ ok: true, name: sess.name, partition: sess.partition, tab: tab || undefined });
      } catch (e: any) {
        res.status(400).json({ error: e.message });
      }
    });

    this.app.post('/sessions/switch', async (req: Request, res: Response) => {
      const { name } = req.body;
      if (!name) { res.status(400).json({ error: 'name required' }); return; }
      try {
        this.sessionManager.setActive(name);
        res.json({ ok: true, active: name });
      } catch (e: any) {
        res.status(400).json({ error: e.message });
      }
    });

    this.app.post('/sessions/destroy', async (req: Request, res: Response) => {
      const { name } = req.body;
      if (!name) { res.status(400).json({ error: 'name required' }); return; }
      try {
        const sess = this.sessionManager.get(name);
        if (!sess) { res.status(404).json({ error: `Session '${name}' does not exist` }); return; }
        // Close all tabs belonging to this session
        const tabsToClose = this.tabManager.listTabs().filter(t => t.partition === sess.partition);
        for (const tab of tabsToClose) {
          await this.tabManager.closeTab(tab.id);
        }
        this.sessionManager.destroy(name);
        res.json({ ok: true, name });
      } catch (e: any) {
        res.status(400).json({ error: e.message });
      }
    });

    this.app.post('/sessions/state/save', async (req: Request, res: Response) => {
      const { name } = req.body;
      if (!name) { res.status(400).json({ error: 'name required' }); return; }
      try {
        const partition = this.getSessionPartition(req);
        const filePath = await this.stateManager.save(name, partition);
        res.json({ ok: true, path: filePath });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/sessions/state/load', async (req: Request, res: Response) => {
      const { name } = req.body;
      if (!name) { res.status(400).json({ error: 'name required' }); return; }
      try {
        const partition = this.getSessionPartition(req);
        const result = await this.stateManager.load(name, partition);
        res.json({ ok: true, cookiesRestored: result.cookiesRestored });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/sessions/state/list', async (_req: Request, res: Response) => {
      try {
        const states = this.stateManager.list();
        res.json({ ok: true, states });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ═══════════════════════════════════════════════
    // COPILOT STREAM (Activity Streaming to OpenClaw)
    // ═══════════════════════════════════════════════

    this.app.post('/copilot-stream/toggle', (req: Request, res: Response) => {
      const { enabled } = req.body;
      this.copilotStream.setEnabled(!!enabled);
      res.json({ ok: true, enabled: !!enabled });
    });

    this.app.get('/copilot-stream/status', (_req: Request, res: Response) => {
      res.json({ ok: true, enabled: this.copilotStream.isEnabled() });
    });
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
