/**
 * ManagerRegistry — single source of truth for all shared manager instances.
 *
 * Replaces the 35+ param TandemAPIOptions object and the duplicate RouteContext interface.
 * Built once in main.ts, passed to TandemAPI, and used as RouteContext for route handlers.
 */
import { TabManager } from './tabs/manager';
import { PanelManager } from './panel/manager';
import { DrawOverlayManager } from './draw/overlay';
import { ActivityTracker } from './activity/tracker';
import { VoiceManager } from './voice/recognition';
import { BehaviorObserver } from './behavior/observer';
import { ConfigManager } from './config/manager';
import { SiteMemoryManager } from './memory/site-memory';
import { WatchManager } from './watch/watcher';
import { HeadlessManager } from './headless/manager';
import { FormMemoryManager } from './memory/form-memory';
import { ContextBridge } from './bridge/context-bridge';
import { PiPManager } from './pip/manager';
import { NetworkInspector } from './network/inspector';
import { ChromeImporter } from './import/chrome-importer';
import { BookmarkManager } from './bookmarks/manager';
import { HistoryManager } from './history/manager';
import { DownloadManager } from './downloads/manager';
import { AudioCaptureManager } from './audio/capture';
import { ExtensionLoader } from './extensions/loader';
import { ExtensionManager } from './extensions/manager';
import { ClaroNoteManager } from './claronote/manager';
import { ContentExtractor } from './content/extractor';
import { WorkflowEngine } from './workflow/engine';
import { LoginManager } from './auth/login-manager';
import { EventStreamManager } from './events/stream';
import { TaskManager } from './agents/task-manager';
import { TabLockManager } from './agents/tab-lock-manager';
import { DevToolsManager } from './devtools/manager';
import { CopilotStream } from './activity/copilot-stream';
import { SecurityManager } from './security/security-manager';
import { SnapshotManager } from './snapshot/manager';
import { NetworkMocker } from './network/mocker';
import { SessionManager } from './sessions/manager';
import { StateManager } from './sessions/state';
import { ScriptInjector } from './scripts/injector';
import { LocatorFinder } from './locators/finder';
import { DeviceEmulator } from './device/emulator';

export interface ManagerRegistry {
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
