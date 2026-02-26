import { Request } from 'express';
import { BrowserWindow, webContents } from 'electron';
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

export interface RouteContext {
  win: BrowserWindow;
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
  contentExtractor: ContentExtractor;
  workflowEngine: WorkflowEngine;
  loginManager: LoginManager;
  eventStream: EventStreamManager;
  taskManager: TaskManager;
  tabLockManager: TabLockManager;
  devToolsManager: DevToolsManager;
  copilotStream: CopilotStream;
  securityManager: SecurityManager | null;
  snapshotManager: SnapshotManager;
  networkMocker: NetworkMocker;
  sessionManager: SessionManager;
  stateManager: StateManager;
  scriptInjector: ScriptInjector;
  locatorFinder: LocatorFinder;
  deviceEmulator: DeviceEmulator;
}

/** Get active tab's WebContents, or null */
export async function getActiveWC(ctx: RouteContext): Promise<Electron.WebContents | null> {
  return ctx.tabManager.getActiveWebContents();
}

/** Run JS in the active tab's webview */
export async function execInActiveTab(ctx: RouteContext, code: string): Promise<any> {
  const wc = await getActiveWC(ctx);
  if (!wc) throw new Error('No active tab');
  return wc.executeJavaScript(code);
}

/** Resolve X-Session header to partition string */
export function getSessionPartition(ctx: RouteContext, req: Request): string {
  const sessionName = req.headers['x-session'] as string;
  if (!sessionName || sessionName === 'default') {
    return 'persist:tandem';
  }
  return ctx.sessionManager.resolvePartition(sessionName);
}

/** Get WebContents for a session (via X-Session header) */
export async function getSessionWC(ctx: RouteContext, req: Request): Promise<Electron.WebContents | null> {
  const sessionName = req.headers['x-session'] as string;
  if (!sessionName || sessionName === 'default') {
    return getActiveWC(ctx);
  }
  const partition = getSessionPartition(ctx, req);
  const tabs = ctx.tabManager.listTabs().filter(t => t.partition === partition);
  if (tabs.length === 0) return null;
  return webContents.fromId(tabs[0].webContentsId) || null;
}

/** Run JS in a session's tab (via X-Session header) */
export async function execInSessionTab(ctx: RouteContext, req: Request, code: string): Promise<any> {
  const wc = await getSessionWC(ctx, req);
  if (!wc) throw new Error('No active tab for this session');
  return wc.executeJavaScript(code);
}
