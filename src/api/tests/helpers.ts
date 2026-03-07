import { vi } from 'vitest';
import express from 'express';
import type { Router } from 'express';
import type { RouteContext } from '../context';

/**
 * Creates a mock WebContents object with common methods stubbed.
 * Used for both the main window and tab webContents.
 */
export function createMockWebContents(id = 1) {
  return {
    id,
    session: {
      cookies: {
        get: vi.fn().mockResolvedValue([]),
        remove: vi.fn().mockResolvedValue(undefined),
      },
      removeExtension: vi.fn(),
    },
    send: vi.fn(),
    executeJavaScript: vi.fn().mockResolvedValue(undefined),
    isLoading: vi.fn().mockReturnValue(false),
    isDevToolsOpened: vi.fn().mockReturnValue(false),
    openDevTools: vi.fn(),
    closeDevTools: vi.fn(),
    loadURL: vi.fn().mockResolvedValue(undefined),
    capturePage: vi.fn().mockResolvedValue({
      toPNG: () => Buffer.from('fake-png'),
    }),
    sendInputEvent: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    insertCSS: vi.fn().mockResolvedValue(''),
    getURL: vi.fn().mockReturnValue('https://example.com'),
    close: vi.fn(),
  };
}

/**
 * Creates a fully-stubbed RouteContext for use in integration tests.
 * Every manager property is mocked with vi.fn() stubs that return sensible defaults.
 */
export function createMockContext(): RouteContext {
  const mockWC = createMockWebContents(1);

  const win = {
    webContents: mockWC,
  } as any;

  const ctx: RouteContext = {
    win,

    // ── tabManager ──────────────────────────────
    tabManager: {
      openTab: vi.fn().mockResolvedValue({
        id: 'tab-1',
        webContentsId: 100,
        url: 'about:blank',
        title: '',
        active: true,
        source: 'robin',
        partition: 'persist:tandem',
      }),
      closeTab: vi.fn().mockResolvedValue(true),
      listTabs: vi.fn().mockReturnValue([]),
      listGroups: vi.fn().mockReturnValue([]),
      focusTab: vi.fn().mockResolvedValue(true),
      setGroup: vi.fn().mockReturnValue({ groupId: 'g1', name: 'Test', color: '#4285f4', tabIds: [] }),
      setTabSource: vi.fn().mockReturnValue(true),
      getActiveWebContents: vi.fn().mockResolvedValue(mockWC),
      getActiveTab: vi.fn().mockReturnValue({
        id: 'tab-1',
        webContentsId: 100,
        url: 'https://example.com',
        title: 'Example',
        active: true,
        source: 'robin',
        partition: 'persist:tandem',
      }),
      count: 1,
    } as any,

    // ── panelManager ────────────────────────────
    panelManager: {
      logActivity: vi.fn(),
      togglePanel: vi.fn().mockReturnValue(true),
      getChatMessages: vi.fn().mockReturnValue([]),
      getChatMessagesSince: vi.fn().mockReturnValue([]),
      addChatMessage: vi.fn().mockReturnValue({ id: 1, from: 'wingman', text: '', ts: Date.now() }),
      saveImage: vi.fn().mockReturnValue('image.png'),
      getImagePath: vi.fn().mockReturnValue('/tmp/image.png'),
      setWingmanTyping: vi.fn(),
      sendLiveModeChanged: vi.fn(),
    } as any,

    // ── drawManager ─────────────────────────────
    drawManager: {
      getLastScreenshot: vi.fn().mockReturnValue(null),
      captureAnnotated: vi.fn().mockResolvedValue({ ok: true }),
      toggleDrawMode: vi.fn().mockReturnValue(true),
      listScreenshots: vi.fn().mockReturnValue([]),
    } as any,

    // ── activityTracker ─────────────────────────
    activityTracker: {
      getLog: vi.fn().mockReturnValue([]),
    } as any,

    // ── voiceManager ────────────────────────────
    voiceManager: {
      start: vi.fn(),
      stop: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ listening: false }),
    } as any,

    // ── behaviorObserver ────────────────────────
    behaviorObserver: {
      getStats: vi.fn().mockReturnValue({}),
      recordScroll: vi.fn(),
    } as any,

    // ── configManager ───────────────────────────
    configManager: {
      getConfig: vi.fn().mockReturnValue({}),
      updateConfig: vi.fn().mockReturnValue({}),
    } as any,

    // ── siteMemory ──────────────────────────────
    siteMemory: {
      listSites: vi.fn().mockReturnValue([]),
      getSite: vi.fn().mockReturnValue(null),
      getDiffs: vi.fn().mockReturnValue([]),
      search: vi.fn().mockReturnValue([]),
    } as any,

    // ── watchManager ────────────────────────────
    watchManager: {
      addWatch: vi.fn().mockReturnValue({ id: 'w1', url: '', intervalMinutes: 30 }),
      listWatches: vi.fn().mockReturnValue([]),
      removeWatch: vi.fn().mockReturnValue(true),
      forceCheck: vi.fn().mockResolvedValue({ changed: false }),
    } as any,

    // ── headlessManager ─────────────────────────
    headlessManager: {
      open: vi.fn().mockResolvedValue({ ok: true }),
      getContent: vi.fn().mockResolvedValue({ content: '' }),
      getStatus: vi.fn().mockReturnValue({ open: false }),
      show: vi.fn().mockReturnValue(true),
      hide: vi.fn().mockReturnValue(true),
      close: vi.fn(),
    } as any,

    // ── formMemory ──────────────────────────────
    formMemory: {
      listAll: vi.fn().mockReturnValue([]),
      getForDomain: vi.fn().mockReturnValue(null),
      getFillData: vi.fn().mockReturnValue(null),
      deleteDomain: vi.fn().mockReturnValue(true),
    } as any,

    // ── contextBridge ───────────────────────────
    contextBridge: {
      getRecent: vi.fn().mockReturnValue([]),
      search: vi.fn().mockReturnValue([]),
      getPage: vi.fn().mockReturnValue(null),
      getContextSummary: vi.fn().mockReturnValue({}),
      addNote: vi.fn().mockReturnValue({}),
    } as any,

    // ── pipManager ──────────────────────────────
    pipManager: {
      toggle: vi.fn().mockReturnValue(true),
      getStatus: vi.fn().mockReturnValue({ visible: false }),
    } as any,

    // ── networkInspector ────────────────────────
    networkInspector: {
      getLog: vi.fn().mockReturnValue([]),
      getApis: vi.fn().mockReturnValue([]),
      getDomains: vi.fn().mockReturnValue([]),
      clear: vi.fn(),
    } as any,

    // ── chromeImporter ──────────────────────────
    chromeImporter: {
      getStatus: vi.fn().mockReturnValue({}),
      importBookmarks: vi.fn().mockReturnValue({ imported: 0 }),
      importHistory: vi.fn().mockReturnValue({ imported: 0 }),
      importCookies: vi.fn().mockResolvedValue({ imported: 0 }),
      listProfiles: vi.fn().mockReturnValue([]),
      setProfile: vi.fn(),
      startSync: vi.fn().mockReturnValue(true),
      stopSync: vi.fn(),
      isSyncing: vi.fn().mockReturnValue(false),
    } as any,

    // ── bookmarkManager ─────────────────────────
    bookmarkManager: {
      list: vi.fn().mockReturnValue([]),
      getBarItems: vi.fn().mockReturnValue([]),
      add: vi.fn().mockReturnValue({ id: 'bk1', name: '', url: '' }),
      remove: vi.fn().mockReturnValue(true),
      update: vi.fn().mockReturnValue({ id: 'bk1', name: '', url: '' }),
      addFolder: vi.fn().mockReturnValue({ id: 'f1', name: '' }),
      move: vi.fn().mockReturnValue(true),
      search: vi.fn().mockReturnValue([]),
      isBookmarked: vi.fn().mockReturnValue(false),
      findByUrl: vi.fn().mockReturnValue(null),
      reload: vi.fn(),
    } as any,

    // ── historyManager ──────────────────────────
    historyManager: {
      getHistory: vi.fn().mockReturnValue([]),
      search: vi.fn().mockReturnValue([]),
      clear: vi.fn(),
      count: 0,
    } as any,

    // ── downloadManager ─────────────────────────
    downloadManager: {
      list: vi.fn().mockReturnValue([]),
      listActive: vi.fn().mockReturnValue([]),
    } as any,

    // ── audioCaptureManager ─────────────────────
    audioCaptureManager: {
      startRecording: vi.fn().mockResolvedValue({ ok: true }),
      stopRecording: vi.fn().mockReturnValue({ ok: true }),
      getStatus: vi.fn().mockReturnValue({ recording: false }),
      listRecordings: vi.fn().mockReturnValue([]),
    } as any,

    // ── extensionLoader ─────────────────────────
    extensionLoader: {
      loadExtension: vi.fn().mockResolvedValue({ id: 'ext1', name: 'Test' }),
    } as any,

    // ── extensionManager ────────────────────────
    extensionManager: {
      list: vi.fn().mockReturnValue({ loaded: [], available: [] }),
      getConflictsForExtension: vi.fn().mockReturnValue([]),
      install: vi.fn().mockResolvedValue({ success: true }),
      getInstalledExtensions: vi.fn().mockReturnValue([]),
      isInstalledExtension: vi.fn().mockReturnValue(false),
      evaluateApiRouteAccess: vi.fn().mockImplementation((extensionId: string, routePath: string) => ({
        allowed: true,
        level: 'trusted',
        routePath,
        scope: 'test-scope',
        reason: `Allowed test scope for ${extensionId}`,
        extensionId,
        runtimeId: extensionId,
        storageId: extensionId,
        extensionName: extensionId,
        permissions: ['nativeMessaging'],
        auditLabel: `${extensionId} [trusted; runtime=${extensionId}, storage=${extensionId}]`,
      })),
      getIdentityPolyfill: vi.fn().mockReturnValue({
        handleLaunchWebAuthFlow: vi.fn().mockResolvedValue({}),
      }),
      checkForUpdates: vi.fn().mockResolvedValue([]),
      getUpdateState: vi.fn().mockReturnValue({ extensions: {}, lastCheckTimestamp: null, checkIntervalMs: 86400000 }),
      getNextScheduledCheck: vi.fn().mockReturnValue(null),
      applyUpdate: vi.fn().mockResolvedValue({ success: true }),
      applyAllUpdates: vi.fn().mockResolvedValue([]),
      getDiskUsage: vi.fn().mockReturnValue({}),
      getAllConflicts: vi.fn().mockReturnValue({ conflicts: [], summary: {} }),
      getNativeMessagingStatus: vi.fn().mockReturnValue({}),
    } as any,

    // ── claroNoteManager ────────────────────────
    claroNoteManager: {
      login: vi.fn().mockResolvedValue({ success: true }),
      logout: vi.fn().mockResolvedValue(undefined),
      getMe: vi.fn().mockResolvedValue({ id: '1', email: 'test@test.com' }),
      getAuth: vi.fn().mockReturnValue(null),
      getRecordingStatus: vi.fn().mockReturnValue({ recording: false }),
      startRecording: vi.fn().mockResolvedValue({ success: true }),
      stopRecording: vi.fn().mockResolvedValue({ success: true }),
      getNotes: vi.fn().mockResolvedValue([]),
      getNote: vi.fn().mockResolvedValue({}),
      uploadRecording: vi.fn().mockResolvedValue('note-1'),
    } as any,

    // ── contentExtractor ────────────────────────
    contentExtractor: {
      extractCurrentPage: vi.fn().mockResolvedValue({ title: '', text: '', url: '' }),
      extractFromURL: vi.fn().mockResolvedValue({ title: '', text: '', url: '' }),
    } as any,

    // ── workflowEngine ──────────────────────────
    workflowEngine: {
      getWorkflows: vi.fn().mockResolvedValue([]),
      saveWorkflow: vi.fn().mockResolvedValue('wf-1'),
      deleteWorkflow: vi.fn().mockResolvedValue(undefined),
      runWorkflow: vi.fn().mockResolvedValue('exec-1'),
      getExecutionStatus: vi.fn().mockResolvedValue(null),
      stopWorkflow: vi.fn().mockResolvedValue(undefined),
      getRunningExecutions: vi.fn().mockResolvedValue([]),
    } as any,

    // ── loginManager ────────────────────────────
    loginManager: {
      getAllStates: vi.fn().mockResolvedValue([]),
      getLoginState: vi.fn().mockResolvedValue({}),
      checkCurrentPage: vi.fn().mockResolvedValue({}),
      isLoginPage: vi.fn().mockResolvedValue(false),
      updateLoginState: vi.fn().mockResolvedValue(undefined),
      clearLoginState: vi.fn().mockResolvedValue(undefined),
    } as any,

    // ── eventStream ─────────────────────────────
    eventStream: {
      sseHandler: vi.fn(),
      getRecent: vi.fn().mockReturnValue([]),
      subscribe: vi.fn().mockReturnValue(() => {}),
    } as any,

    // ── taskManager ─────────────────────────────
    taskManager: {
      listTasks: vi.fn().mockReturnValue([]),
      getTask: vi.fn().mockReturnValue(null),
      createTask: vi.fn().mockReturnValue({ id: 'task-1', description: '', steps: [] }),
      respondToApproval: vi.fn(),
      markTaskRunning: vi.fn(),
      markTaskDone: vi.fn(),
      markTaskFailed: vi.fn(),
      updateStepStatus: vi.fn(),
      emergencyStop: vi.fn().mockReturnValue({ stopped: 0 }),
      requestApproval: vi.fn().mockResolvedValue(true),
      needsApproval: vi.fn().mockReturnValue(false),
      getAutonomySettings: vi.fn().mockReturnValue({}),
      updateAutonomySettings: vi.fn().mockReturnValue({}),
      getActivityLog: vi.fn().mockReturnValue([]),
    } as any,

    // ── tabLockManager ──────────────────────────
    tabLockManager: {
      getAllLocks: vi.fn().mockReturnValue([]),
      acquire: vi.fn().mockReturnValue({ acquired: true }),
      release: vi.fn().mockReturnValue(true),
      getOwner: vi.fn().mockReturnValue(null),
    } as any,

    // ── devToolsManager ─────────────────────────
    devToolsManager: {
      getStatus: vi.fn().mockReturnValue({ attached: false }),
      getConsoleEntries: vi.fn().mockReturnValue([]),
      getConsoleCounts: vi.fn().mockReturnValue({}),
      getConsoleErrors: vi.fn().mockReturnValue([]),
      clearConsole: vi.fn(),
      getNetworkEntries: vi.fn().mockReturnValue([]),
      getResponseBody: vi.fn().mockResolvedValue(null),
      clearNetwork: vi.fn(),
      queryDOM: vi.fn().mockResolvedValue([]),
      queryXPath: vi.fn().mockResolvedValue([]),
      getStorage: vi.fn().mockResolvedValue({}),
      getPerformanceMetrics: vi.fn().mockResolvedValue(null),
      evaluate: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn().mockResolvedValue({}),
      screenshotElement: vi.fn().mockResolvedValue(null),
    } as any,

    // ── wingmanStream ───────────────────────────
    wingmanStream: {
      setEnabled: vi.fn(),
      isEnabled: vi.fn().mockReturnValue(false),
    } as any,

    // ── securityManager ─────────────────────────
    securityManager: null,

    // ── snapshotManager ─────────────────────────
    snapshotManager: {
      getSnapshot: vi.fn().mockResolvedValue({ text: '', count: 0, url: '' }),
      clickRef: vi.fn().mockResolvedValue(undefined),
      fillRef: vi.fn().mockResolvedValue(undefined),
      getTextRef: vi.fn().mockResolvedValue(''),
    } as any,

    // ── networkMocker ───────────────────────────
    networkMocker: {
      addRule: vi.fn().mockResolvedValue({ id: 'rule-1', pattern: '' }),
      getRules: vi.fn().mockReturnValue([]),
      removeRule: vi.fn().mockResolvedValue(1),
      removeRuleById: vi.fn().mockResolvedValue(1),
      clearRules: vi.fn().mockResolvedValue(0),
    } as any,

    // ── sessionManager ──────────────────────────
    sessionManager: {
      list: vi.fn().mockReturnValue([]),
      create: vi.fn().mockReturnValue({ name: 'test', partition: 'persist:test' }),
      get: vi.fn().mockReturnValue(null),
      setActive: vi.fn(),
      getActive: vi.fn().mockReturnValue('default'),
      destroy: vi.fn(),
      resolvePartition: vi.fn().mockReturnValue('persist:test'),
    } as any,

    // ── stateManager ────────────────────────────
    stateManager: {
      save: vi.fn().mockResolvedValue('/path/to/state'),
      load: vi.fn().mockResolvedValue({ cookiesRestored: 0 }),
      list: vi.fn().mockReturnValue([]),
    } as any,

    // ── scriptInjector ──────────────────────────
    scriptInjector: {
      listScripts: vi.fn().mockReturnValue([]),
      addScript: vi.fn().mockReturnValue({ name: 'test', code: '', enabled: true, addedAt: Date.now() }),
      removeScript: vi.fn().mockReturnValue(true),
      enableScript: vi.fn().mockReturnValue(true),
      disableScript: vi.fn().mockReturnValue(true),
      listStyles: vi.fn().mockReturnValue([]),
      addStyle: vi.fn(),
      removeStyle: vi.fn().mockReturnValue(true),
      enableStyle: vi.fn().mockReturnValue(true),
      disableStyle: vi.fn().mockReturnValue(true),
    } as any,

    // ── locatorFinder ───────────────────────────
    locatorFinder: {
      find: vi.fn().mockResolvedValue({ found: false }),
      findAll: vi.fn().mockResolvedValue([]),
    } as any,

    // ── deviceEmulator ──────────────────────────
    deviceEmulator: {
      getProfiles: vi.fn().mockReturnValue([]),
      getStatus: vi.fn().mockReturnValue({}),
      emulateDevice: vi.fn().mockResolvedValue({}),
      emulateCustom: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
    } as any,

    // ── sidebarManager ───────────────────────────
    sidebarManager: {
      getConfig: vi.fn().mockReturnValue({ state: 'narrow', activeItemId: null, items: [] }),
      updateConfig: vi.fn().mockReturnValue({ state: 'narrow', activeItemId: null, items: [] }),
      toggleItem: vi.fn().mockReturnValue({ id: 'bookmarks', enabled: false }),
      reorderItems: vi.fn(),
      setState: vi.fn(),
      setActiveItem: vi.fn(),
      destroy: vi.fn(),
    } as any,

    // ── workspaceManager ────────────────────────
    workspaceManager: {
      list: vi.fn().mockReturnValue([]),
      create: vi.fn().mockReturnValue({ id: 'ws-1', name: 'Test', icon: 'briefcase', color: '#4285f4', order: 0, isDefault: false, tabIds: [] }),
      remove: vi.fn(),
      switch: vi.fn().mockReturnValue({ id: 'ws-1', name: 'Test', icon: 'briefcase', color: '#4285f4', order: 0, isDefault: false, tabIds: [] }),
      getActive: vi.fn().mockReturnValue({ id: 'ws-default', name: 'Default', icon: 'home', color: '#4285f4', order: 0, isDefault: true, tabIds: [] }),
      getActiveId: vi.fn().mockReturnValue('ws-default'),
      get: vi.fn().mockReturnValue(null),
      update: vi.fn().mockReturnValue({ id: 'ws-1', name: 'Test', icon: 'briefcase', color: '#4285f4', order: 0, isDefault: false, tabIds: [] }),
      assignTab: vi.fn(),
      removeTab: vi.fn(),
      moveTab: vi.fn(),
      destroy: vi.fn(),
    } as any,

    // ── syncManager ──────────────────────────────
    syncManager: {
      init: vi.fn(),
      isConfigured: vi.fn().mockReturnValue(false),
      publishTabs: vi.fn(),
      publishHistory: vi.fn(),
      getRemoteDevices: vi.fn().mockReturnValue([]),
      writeShared: vi.fn(),
      readShared: vi.fn().mockReturnValue(null),
      getConfig: vi.fn().mockReturnValue(null),
      destroy: vi.fn(),
    } as any,

    // ── pinboardManager ──────────────────────────
    pinboardManager: {
      listBoards: vi.fn().mockReturnValue([]),
      getBoard: vi.fn().mockReturnValue(null),
      createBoard: vi.fn().mockReturnValue({ id: 'pb-1', name: 'Test', emoji: '📌', createdAt: '', updatedAt: '', items: [] }),
      updateBoard: vi.fn().mockReturnValue({ id: 'pb-1', name: 'Updated', emoji: '📌', createdAt: '', updatedAt: '', items: [] }),
      deleteBoard: vi.fn().mockReturnValue(true),
      getItems: vi.fn().mockReturnValue([]),
      addItem: vi.fn().mockResolvedValue({ id: 'item-1', type: 'link', createdAt: '', position: 0 }),
      updateItem: vi.fn().mockReturnValue({ id: 'item-1', type: 'link', createdAt: '', position: 0 }),
      deleteItem: vi.fn().mockReturnValue(true),
      reorderItems: vi.fn().mockReturnValue(true),
      destroy: vi.fn(),
    } as any,
  };

  return ctx;
}

/**
 * Creates an Express app wired up for testing a specific route registration function.
 *
 * @param registerFn - The route registration function (e.g. registerTabRoutes)
 * @param ctx - A RouteContext (typically from createMockContext())
 * @returns An Express app ready for supertest
 */
export function createTestApp(
  registerFn: (router: Router, ctx: RouteContext) => void,
  ctx: RouteContext,
) {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registerFn(router, ctx);
  app.use(router);
  return app;
}
