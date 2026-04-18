import { dialog, session, type BrowserWindow, type WebContents } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';
import type { TandemAPI } from '../api/server';
import { ActivityTracker } from '../activity/tracker';
import { WingmanStream } from '../activity/wingman-stream';
import { TaskManager } from '../agents/task-manager';
import { TaskHandoffCoordinator } from '../agents/task-handoff-coordinator';
import { TabLockManager } from '../agents/tab-lock-manager';
import { LoginManager } from '../auth/login-manager';
import { GooglePhotosManager } from '../integrations/google-photos';
import { ContextBridge } from '../bridge/context-bridge';
import { buildOwnershipContextForTabId } from '../tabs/runtime-context';
import { ClaroNoteManager } from '../claronote/manager';
import { ConfigManager } from '../config/manager';
import { ContentExtractor } from '../content/extractor';
import { ContextMenuManager } from '../context-menu/manager';
import { DevToolsManager } from '../devtools/manager';
import { DeviceEmulator } from '../device/emulator';
import { DownloadManager } from '../downloads/manager';
import { EventStreamManager } from '../events/stream';
import { getHandoffAttentionLevel } from '../handoffs/attention';
import { HandoffManager, type Handoff } from '../handoffs/manager';
import { ChromeImporter } from '../import/chrome-importer';
import type { Logger } from '../utils/logger';
import type { ManagerRegistry } from '../registry';
import { VideoRecorderManager } from '../video/recorder';
import { BookmarkManager } from '../bookmarks/manager';
import { NetworkMocker } from '../network/mocker';
import { ExtensionManager } from '../extensions/manager';
import { ExtensionToolbar } from '../extensions/toolbar';
import { HistoryManager } from '../history/manager';
import { registerIpcHandlers } from '../ipc/handlers';
import { LocatorFinder } from '../locators/finder';
import { SiteMemoryManager } from '../memory/site-memory';
import { FormMemoryManager } from '../memory/form-memory';
import { NetworkInspector } from '../network/inspector';
import type { RequestDispatcher } from '../network/dispatcher';
import { PanelManager } from '../panel/manager';
import { PiPManager } from '../pip/manager';
import { PinboardManager } from '../pinboards/manager';
import { SecurityManager, type SecurityContainmentIncident } from '../security/security-manager';
import { SessionRestoreManager } from '../session/restore';
import { SessionManager } from '../sessions/manager';
import { StateManager } from '../sessions/state';
import { SidebarManager } from '../sidebar/manager';
import { SnapshotManager } from '../snapshot/manager';
import { SyncManager } from '../sync/manager';
import { TabManager } from '../tabs/manager';
import { DrawOverlayManager } from '../draw/overlay';
import { ScriptInjector } from '../scripts/injector';
import { VoiceManager } from '../voice/recognition';
import { WatchManager } from '../watch/watcher';
import { HeadlessManager } from '../headless/manager';
import { BehaviorObserver } from '../behavior/observer';
import { WorkflowEngine } from '../workflow/engine';
import { WorkspaceManager } from '../workspaces/manager';
import { ClipboardManager } from '../clipboard/manager';
import { PairingManager } from '../pairing/manager';
import { DEFAULT_PARTITION } from '../utils/constants';
import type { RuntimeManagers } from './types';

interface InitializeRuntimeOptions {
  win: BrowserWindow;
  dispatcher: RequestDispatcher | null;
  pendingContextMenuWebContents: WebContents[];
  pendingSecurityCoverageWebContentsIds: number[];
  canUseWindow: (win: BrowserWindow | null) => win is BrowserWindow;
  log: Logger;
}

interface DestroyRuntimeOptions {
  api: TandemAPI | null;
  runtime: RuntimeManagers | null;
  mainWindow: BrowserWindow | null;
  canUseWindow: (win: BrowserWindow | null) => win is BrowserWindow;
}

function drainPendingContextMenus(contextMenuManager: ContextMenuManager, pendingContextMenuWebContents: WebContents[]): void {
  while (pendingContextMenuWebContents.length > 0) {
    const wc = pendingContextMenuWebContents.shift();
    if (wc && !wc.isDestroyed()) {
      contextMenuManager.registerWebContents(wc);
    }
  }
}

function wireTaskManagerEvents(win: BrowserWindow, taskManager: TaskManager, canUseWindow: (win: BrowserWindow | null) => win is BrowserWindow): void {
  taskManager.on('approval-request', (data: Record<string, unknown>) => {
    if (canUseWindow(win)) {
      win.webContents.send(IpcChannels.APPROVAL_REQUEST, data);
    }
  });
  // Broadcast every approval resolution to the shell so any UI surface
  // showing a card for the same requestId (Wingman Chat, Activity, etc.)
  // can dismiss or update itself — regardless of which surface actually
  // triggered the response. Without this, the Chat inline card stayed
  // visible after the user rejected via the Activity panel.
  taskManager.on('approval-response', (data: { requestId: string; approved: boolean }) => {
    if (canUseWindow(win)) {
      win.webContents.send(IpcChannels.APPROVAL_RESPONSE, data);
    }
  });
  taskManager.on('task-updated', (task: Record<string, unknown>) => {
    if (canUseWindow(win)) {
      win.webContents.send(IpcChannels.TASK_UPDATED, task);
    }
  });
  taskManager.on('emergency-stop', (data: Record<string, unknown>) => {
    if (canUseWindow(win)) {
      win.webContents.send(IpcChannels.EMERGENCY_STOP, data);
    }
  });
}

function wireHandoffManagerEvents(
  win: BrowserWindow,
  handoffManager: HandoffManager,
  eventStream: EventStreamManager,
  panelManager: PanelManager,
  canUseWindow: (win: BrowserWindow | null) => win is BrowserWindow,
): void {
  const emitRendererUpdate = (kind: 'created' | 'updated', handoff: Handoff) => {
    eventStream.handleHandoffEvent(kind, handoff);
    panelManager.logActivity('handoff', {
      title: handoff.title,
      status: handoff.status,
      source: handoff.source ?? handoff.agentId ?? 'agent',
    });

    if (canUseWindow(win)) {
      win.webContents.send(IpcChannels.HANDOFF_UPDATED, {
        kind,
        handoff: {
          ...handoff,
          attentionLevel: getHandoffAttentionLevel(handoff),
        },
      });
    }
  };

  handoffManager.on('handoff-created', (handoff: Handoff) => {
    emitRendererUpdate('created', handoff);
  });

  handoffManager.on('handoff-updated', (handoff: Handoff) => {
    emitRendererUpdate('updated', handoff);
  });
}

async function configureNativeMessagingHostDirectories(log: Logger): Promise<void> {
  try {
    const os = await import('os');
    const path = await import('path');
    const nativeMsgDirs = [
      path.join(os.homedir(), 'Library', 'Application Support', 'Tandem Browser', 'NativeMessagingHosts'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'),
      '/Library/Google/Chrome/NativeMessagingHosts',
    ].filter(d => { try { return require('fs').existsSync(d); } catch { return false; } });

    for (const dir of nativeMsgDirs) {
      for (const targetSession of [session.fromPartition(DEFAULT_PARTITION), session.defaultSession]) {
        const runtimeSession = targetSession as unknown as Record<string, unknown>;
        if (typeof runtimeSession['setNativeMessagingHostDirectory'] === 'function') {
          (runtimeSession['setNativeMessagingHostDirectory'] as (nativeDir: string) => void)(dir);
          log.info(`🔌 Native messaging: set host directory ${dir}`);
        }
      }
      if (nativeMsgDirs.indexOf(dir) === 0) {
        break;
      }
    }
  } catch (err) {
    log.warn('⚠️ Native messaging dir setup failed:', err instanceof Error ? err.message : String(err));
  }
}

export async function initializeRuntimeManagers(opts: InitializeRuntimeOptions): Promise<RuntimeManagers> {
  const { win, dispatcher, pendingContextMenuWebContents, pendingSecurityCoverageWebContentsIds, canUseWindow, log } = opts;
  const runtime: RuntimeManagers = {} as RuntimeManagers;

  runtime.configManager = new ConfigManager();
  runtime.googlePhotosManager = new GooglePhotosManager(runtime.configManager);
  runtime.tabManager = new TabManager(win);
  runtime.panelManager = new PanelManager(win, runtime.configManager);
  runtime.drawManager = new DrawOverlayManager(win, runtime.configManager, runtime.googlePhotosManager);
  runtime.wingmanStream = new WingmanStream(runtime.configManager);
  runtime.activityTracker = new ActivityTracker(win, runtime.panelManager, runtime.drawManager, runtime.wingmanStream);
  runtime.voiceManager = new VoiceManager(win, runtime.panelManager);
  runtime.behaviorObserver = new BehaviorObserver(win);
  runtime.siteMemory = new SiteMemoryManager();
  runtime.watchManager = new WatchManager();
  runtime.headlessManager = new HeadlessManager();
  runtime.formMemory = new FormMemoryManager();
  runtime.contextBridge = new ContextBridge();
  runtime.pipManager = new PiPManager();
  runtime.networkInspector = new NetworkInspector();
  runtime.networkInspector.setTabIdResolver((webContentsId) =>
    runtime.tabManager.listTabs().find(tab => tab.webContentsId === webContentsId)?.id ?? null,
  );
  if (dispatcher) {
    runtime.networkInspector.registerWith(dispatcher);
  }
  runtime.securityManager = new SecurityManager();
  runtime.chromeImporter = new ChromeImporter(runtime.configManager);
  runtime.bookmarkManager = new BookmarkManager();
  runtime.historyManager = new HistoryManager();
  runtime.downloadManager = new DownloadManager();
  runtime.videoRecorderManager = new VideoRecorderManager();
  runtime.extensionManager = new ExtensionManager();
  runtime.extensionLoader = runtime.extensionManager.getLoader();
  runtime.extensionToolbar = new ExtensionToolbar(runtime.extensionManager);
  runtime.claroNoteManager = new ClaroNoteManager();
  runtime.eventStream = new EventStreamManager();
  runtime.handoffManager = new HandoffManager();
  runtime.taskManager = new TaskManager();
  runtime.taskHandoffCoordinator = new TaskHandoffCoordinator(runtime.taskManager, runtime.handoffManager);
  runtime.tabLockManager = new TabLockManager();
  runtime.devToolsManager = new DevToolsManager(runtime.tabManager);
  runtime.snapshotManager = new SnapshotManager(runtime.devToolsManager);
  runtime.networkMocker = new NetworkMocker(runtime.devToolsManager);
  runtime.sessionManager = new SessionManager();
  runtime.stateManager = new StateManager();
  runtime.scriptInjector = new ScriptInjector();
  runtime.locatorFinder = new LocatorFinder(runtime.devToolsManager, runtime.snapshotManager);
  runtime.deviceEmulator = new DeviceEmulator();
  runtime.sidebarManager = new SidebarManager();
  runtime.workspaceManager = new WorkspaceManager();
  runtime.syncManager = new SyncManager();
  runtime.pinboardManager = new PinboardManager();
  runtime.contentExtractor = new ContentExtractor();
  runtime.workflowEngine = new WorkflowEngine();
  runtime.loginManager = new LoginManager();
  runtime.clipboardManager = new ClipboardManager();
  runtime.pairingManager = new PairingManager();
  runtime.sessionRestoreManager = new SessionRestoreManager(runtime.syncManager);

  runtime.workspaceManager.setMainWindow(win);
  const deviceSyncConfig = runtime.configManager.getConfig().deviceSync;
  if (deviceSyncConfig.enabled && deviceSyncConfig.syncRoot) {
    runtime.syncManager.init(deviceSyncConfig);
  }

  runtime.pinboardManager.setSyncManager(runtime.syncManager);
  runtime.tabManager.setSyncManager(runtime.syncManager);
  runtime.tabManager.setSessionRestore(runtime.sessionRestoreManager);
  runtime.tabManager.setWorkspaceIdResolver((webContentsId) => runtime.workspaceManager.getWorkspaceIdForTab(webContentsId) ?? null);
  runtime.tabManager.setActiveTabChangedHandler((tab) => {
    runtime.workspaceManager.reconcileTabState(
      runtime.tabManager.listWebContentsIds(),
      tab?.webContentsId ?? null,
      { notify: true, followFocusedTab: true },
    );
  });
  runtime.historyManager.setSyncManager(runtime.syncManager);
  runtime.workspaceManager.setSyncManager(runtime.syncManager);
  runtime.workspaceManager.setTabStateResolvers({
    listTrackedTabIds: () => runtime.tabManager.listWebContentsIds(),
    getActiveTabId: () => runtime.tabManager.getActiveWebContentsId(),
  });
  runtime.eventStream.setContextResolver(({ tabId }) =>
    buildOwnershipContextForTabId(
      runtime.tabManager,
      runtime.workspaceManager,
      tabId,
      tabId ? 'tab' : 'global',
    )
  );
  runtime.devToolsManager.setWingmanStream(runtime.wingmanStream);
  runtime.devToolsManager.setActivityTracker(runtime.activityTracker);

  runtime.contextMenuManager = new ContextMenuManager({
    win,
    tabManager: runtime.tabManager,
    bookmarkManager: runtime.bookmarkManager,
    historyManager: runtime.historyManager,
    panelManager: runtime.panelManager,
    downloadManager: runtime.downloadManager,
    pinboardManager: runtime.pinboardManager,
    configManager: runtime.configManager,
  });

  drainPendingContextMenus(runtime.contextMenuManager, pendingContextMenuWebContents);

  runtime.contextBridge.connectEventStream(runtime.eventStream);
  wireTaskManagerEvents(win, runtime.taskManager, canUseWindow);
  wireHandoffManagerEvents(
    win,
    runtime.handoffManager,
    runtime.eventStream,
    runtime.panelManager,
    canUseWindow,
  );

  runtime.taskManager.on('approval-request', (data: Record<string, unknown>) => {
    runtime.taskHandoffCoordinator.handleApprovalRequest(data);
  });

  runtime.taskManager.on('approval-response', (data: { requestId: string; approved: boolean }) => {
    runtime.taskHandoffCoordinator.handleApprovalResponse(data);
  });

  const ses = session.fromPartition(DEFAULT_PARTITION);
  runtime.downloadManager.hookSession(ses, win);

  runtime.securityManager.init({
    dispatcher: dispatcher ?? undefined,
    devToolsManager: runtime.devToolsManager,
    session: ses,
  });
  runtime.securityManager.onContainmentIncident = (incident: SecurityContainmentIncident) => {
    if (!canUseWindow(win)) {
      return;
    }

    win.webContents.send(IpcChannels.EMERGENCY_STOP, {
      source: 'security-containment',
      incidentId: incident.id,
      domain: incident.domain,
      url: incident.url,
      wcId: incident.wcId,
      reason: incident.reason,
      actionSummary: incident.actionSummary,
      reviewMessage: incident.reviewMessage,
      automationPaused: incident.automationPaused,
    });

    const domainLabel = incident.domain ?? 'the current site';
    void dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['OK'],
      defaultId: 0,
      title: 'Security containment activated',
      message: `Tandem contained ${domainLabel}.`,
      detail: `${incident.actionSummary}\n\nWhy it happened: ${incident.reason}\n\nNext step: ${incident.reviewMessage}`,
    }).catch((e) => {
      log.warn('containment dialog failed:', e instanceof Error ? e.message : String(e));
    });
  };

  while (pendingSecurityCoverageWebContentsIds.length > 0) {
    const wcId = pendingSecurityCoverageWebContentsIds.shift();
    if (typeof wcId === 'number') {
      runtime.securityManager.onTabCreated(wcId).catch(e => log.warn('securityManager.onTabCreated failed:', e instanceof Error ? e.message : e));
    }
  }

  await configureNativeMessagingHostDirectories(log);

  runtime.extensionToolbar.setMainWindow(win);
  runtime.extensionManager.init(ses).then(() => {
    runtime.extensionToolbar.registerIpcHandlers(ses);
    runtime.extensionToolbar.notifyToolbarUpdate(ses);
  }).catch((err) => {
    log.warn('⚠️ Failed to load some extensions:', err);
    runtime.extensionToolbar.registerIpcHandlers(ses);
  });

  if (runtime.configManager.getConfig().sync.chromeBookmarks) {
    runtime.chromeImporter.startSync();
  }

  return runtime;
}

export function createManagerRegistry(runtime: RuntimeManagers): ManagerRegistry {
  return {
    tabManager: runtime.tabManager,
    panelManager: runtime.panelManager,
    drawManager: runtime.drawManager,
    activityTracker: runtime.activityTracker,
    voiceManager: runtime.voiceManager,
    behaviorObserver: runtime.behaviorObserver,
    configManager: runtime.configManager,
    siteMemory: runtime.siteMemory,
    watchManager: runtime.watchManager,
    headlessManager: runtime.headlessManager,
    formMemory: runtime.formMemory,
    contextBridge: runtime.contextBridge,
    pipManager: runtime.pipManager,
    networkInspector: runtime.networkInspector,
    chromeImporter: runtime.chromeImporter,
    bookmarkManager: runtime.bookmarkManager,
    historyManager: runtime.historyManager,
    downloadManager: runtime.downloadManager,
    videoRecorderManager: runtime.videoRecorderManager,
    extensionLoader: runtime.extensionLoader,
    extensionManager: runtime.extensionManager,
    claroNoteManager: runtime.claroNoteManager,
    contentExtractor: runtime.contentExtractor,
    workflowEngine: runtime.workflowEngine,
    loginManager: runtime.loginManager,
    eventStream: runtime.eventStream,
    handoffManager: runtime.handoffManager,
    taskManager: runtime.taskManager,
    taskHandoffCoordinator: runtime.taskHandoffCoordinator,
    tabLockManager: runtime.tabLockManager,
    devToolsManager: runtime.devToolsManager,
    wingmanStream: runtime.wingmanStream,
    securityManager: runtime.securityManager,
    snapshotManager: runtime.snapshotManager,
    networkMocker: runtime.networkMocker,
    sessionManager: runtime.sessionManager,
    stateManager: runtime.stateManager,
    scriptInjector: runtime.scriptInjector,
    locatorFinder: runtime.locatorFinder,
    deviceEmulator: runtime.deviceEmulator,
    sidebarManager: runtime.sidebarManager,
    workspaceManager: runtime.workspaceManager,
    syncManager: runtime.syncManager,
    pinboardManager: runtime.pinboardManager,
    googlePhotosManager: runtime.googlePhotosManager,
    clipboardManager: runtime.clipboardManager,
    pairingManager: runtime.pairingManager,
  };
}

export function registerRuntimeIpcHandlers(win: BrowserWindow, runtime: RuntimeManagers): void {
  registerIpcHandlers({
    win,
    tabManager: runtime.tabManager,
    panelManager: runtime.panelManager,
    drawManager: runtime.drawManager,
    voiceManager: runtime.voiceManager,
    behaviorObserver: runtime.behaviorObserver,
    siteMemory: runtime.siteMemory,
    formMemory: runtime.formMemory,
    contextBridge: runtime.contextBridge,
    networkInspector: runtime.networkInspector,
    bookmarkManager: runtime.bookmarkManager,
    historyManager: runtime.historyManager,
    eventStream: runtime.eventStream,
    taskManager: runtime.taskManager,
    contextMenuManager: runtime.contextMenuManager,
    devToolsManager: runtime.devToolsManager,
    activityTracker: runtime.activityTracker,
    securityManager: runtime.securityManager,
    scriptInjector: runtime.scriptInjector,
    deviceEmulator: runtime.deviceEmulator,
    wingmanStream: runtime.wingmanStream,
    snapshotManager: runtime.snapshotManager,
    videoRecorderManager: runtime.videoRecorderManager,
    workspaceManager: runtime.workspaceManager,
  });
}

export function destroyRuntime(opts: DestroyRuntimeOptions): void {
  const { api, runtime, mainWindow, canUseWindow } = opts;

  if (api) {
    api.stop();
  }

  if (!runtime) {
    return;
  }

  runtime.behaviorObserver.destroy();
  runtime.watchManager.destroy();
  runtime.headlessManager.destroy();
  runtime.pipManager.destroy();
  runtime.networkInspector.destroy();

  if (canUseWindow(mainWindow)) {
    runtime.voiceManager.stop();
  }

  runtime.videoRecorderManager.forceStop();
  runtime.chromeImporter.destroy();
  runtime.taskManager.destroy();
  runtime.tabLockManager.destroy();
  runtime.contextMenuManager.destroy();
  runtime.devToolsManager.destroy();
  runtime.wingmanStream.destroy();
  runtime.securityManager.destroy();
  runtime.snapshotManager.destroy();
  runtime.networkMocker.destroy();
  runtime.sessionManager.destroy();
  runtime.extensionToolbar.destroy();
  runtime.extensionManager.getIdentityPolyfill().destroy();
  runtime.extensionManager.destroyUpdateChecker();
  runtime.historyManager.destroy();
  runtime.sidebarManager.destroy();
  runtime.workspaceManager.destroy();
  runtime.pinboardManager.destroy();
  runtime.syncManager.destroy();
  runtime.pairingManager.destroy();
}
