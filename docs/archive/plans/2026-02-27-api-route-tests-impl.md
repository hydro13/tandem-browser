# API Route Integration Tests — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add supertest-based integration tests for all 12 route files + security routes (~200 endpoints, ~500 test cases).

**Architecture:** Shared test helper creates mock RouteContext + Express app per test file. Each route file gets a dedicated test file using supertest to make real HTTP requests against a minimal Express app with mocked manager dependencies.

**Tech Stack:** Vitest, supertest, Express, vi.mock/vi.fn for manager stubs

---

### Task 1: Install supertest

**Files:**
- Modify: `package.json`

**Step 1: Install supertest and types**

Run: `npm install --save-dev supertest @types/supertest`

**Step 2: Verify installation**

Run: `npm ls supertest`
Expected: `supertest@<version>`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add supertest for API route testing"
```

---

### Task 2: Create test helper (`src/api/tests/helpers.ts`)

**Files:**
- Create: `src/api/tests/helpers.ts`

**Step 1: Write the test helper**

This file provides two factories:
- `createMockContext()` — Returns a `RouteContext` with all 34 managers stubbed via `vi.fn()`
- `createTestApp(registerFn, ctx)` — Creates Express app with JSON middleware, registers routes, returns app

```typescript
import { vi } from 'vitest';
import express from 'express';
import type { RouteContext } from '../context';

/**
 * Create a mock BrowserWindow with the minimum shape routes need.
 */
function createMockWin() {
  return {
    webContents: {
      id: 1,
      session: {
        cookies: {
          get: vi.fn().mockResolvedValue([]),
          remove: vi.fn().mockResolvedValue(undefined),
        },
        removeExtension: vi.fn(),
        getAllExtensions: vi.fn().mockReturnValue({}),
      },
      send: vi.fn(),
      executeJavaScript: vi.fn().mockResolvedValue('{}'),
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
    },
  } as any;
}

/**
 * Create a mock WebContents instance for active tab simulation.
 */
export function createMockWebContents() {
  return {
    id: 100,
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
  } as any;
}

/**
 * Create a fully-stubbed RouteContext where every manager is vi.fn() mocks.
 * Tests override specific methods as needed.
 */
export function createMockContext(): RouteContext {
  const mockWC = createMockWebContents();

  return {
    win: createMockWin(),
    tabManager: {
      getActiveWebContents: vi.fn().mockResolvedValue(mockWC),
      getActiveTab: vi.fn().mockReturnValue({ id: 'tab-1', url: 'https://example.com', title: 'Example', webContentsId: 100, partition: 'persist:tandem' }),
      openTab: vi.fn().mockResolvedValue({ id: 'tab-new', url: 'about:blank' }),
      closeTab: vi.fn().mockResolvedValue(true),
      focusTab: vi.fn().mockResolvedValue(true),
      listTabs: vi.fn().mockReturnValue([]),
      listGroups: vi.fn().mockReturnValue([]),
      setGroup: vi.fn().mockReturnValue({ id: 'g1', name: 'test', color: '#fff', tabIds: [] }),
      setTabSource: vi.fn().mockReturnValue(true),
      count: 1,
    },
    panelManager: {
      logActivity: vi.fn(),
      togglePanel: vi.fn().mockReturnValue(true),
      getChatMessages: vi.fn().mockReturnValue([]),
      getChatMessagesSince: vi.fn().mockReturnValue([]),
      addChatMessage: vi.fn().mockReturnValue({ id: 1, from: 'wingman', text: 'test' }),
      saveImage: vi.fn().mockReturnValue('img-123.png'),
      getImagePath: vi.fn().mockReturnValue('/tmp/img-123.png'),
      setWingmanTyping: vi.fn(),
      sendLiveModeChanged: vi.fn(),
    },
    drawManager: {
      getLastScreenshot: vi.fn().mockReturnValue(null),
      captureAnnotated: vi.fn().mockResolvedValue({ ok: true }),
      toggleDrawMode: vi.fn().mockReturnValue(true),
      listScreenshots: vi.fn().mockReturnValue([]),
    },
    activityTracker: {
      getLog: vi.fn().mockReturnValue([]),
    },
    voiceManager: {
      start: vi.fn(),
      stop: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ listening: false }),
    },
    behaviorObserver: {
      getStats: vi.fn().mockReturnValue({}),
      recordScroll: vi.fn(),
    },
    configManager: {
      getConfig: vi.fn().mockReturnValue({ general: {}, webhook: {} }),
      updateConfig: vi.fn().mockReturnValue({}),
    },
    siteMemory: {
      listSites: vi.fn().mockReturnValue([]),
      getSite: vi.fn().mockReturnValue(null),
      getDiffs: vi.fn().mockReturnValue([]),
      search: vi.fn().mockReturnValue([]),
    },
    watchManager: {
      addWatch: vi.fn().mockReturnValue({ id: 'w1', url: 'https://example.com' }),
      listWatches: vi.fn().mockReturnValue([]),
      removeWatch: vi.fn().mockReturnValue(true),
      forceCheck: vi.fn().mockResolvedValue({ changed: false }),
    },
    headlessManager: {
      open: vi.fn().mockResolvedValue({ ok: true }),
      getContent: vi.fn().mockResolvedValue({ text: 'hello' }),
      getStatus: vi.fn().mockReturnValue({ open: false }),
      show: vi.fn().mockReturnValue(true),
      hide: vi.fn().mockReturnValue(true),
      close: vi.fn(),
    },
    formMemory: {
      listAll: vi.fn().mockReturnValue([]),
      getForDomain: vi.fn().mockReturnValue(null),
      getFillData: vi.fn().mockReturnValue(null),
      deleteDomain: vi.fn().mockReturnValue(true),
    },
    contextBridge: {
      getRecent: vi.fn().mockReturnValue([]),
      search: vi.fn().mockReturnValue([]),
      getPage: vi.fn().mockReturnValue(null),
      getContextSummary: vi.fn().mockReturnValue({}),
      addNote: vi.fn().mockReturnValue({}),
    },
    pipManager: {
      toggle: vi.fn().mockReturnValue(true),
      getStatus: vi.fn().mockReturnValue({ visible: false }),
    },
    networkInspector: {
      getLog: vi.fn().mockReturnValue([]),
      getApis: vi.fn().mockReturnValue([]),
      getDomains: vi.fn().mockReturnValue([]),
      clear: vi.fn(),
    },
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
    },
    bookmarkManager: {
      list: vi.fn().mockReturnValue([]),
      getBarItems: vi.fn().mockReturnValue([]),
      add: vi.fn().mockReturnValue({ id: 'bm1', name: 'test', url: 'https://example.com' }),
      remove: vi.fn().mockReturnValue(true),
      update: vi.fn().mockReturnValue({ id: 'bm1', name: 'updated' }),
      addFolder: vi.fn().mockReturnValue({ id: 'f1', name: 'folder' }),
      move: vi.fn().mockReturnValue(true),
      search: vi.fn().mockReturnValue([]),
      isBookmarked: vi.fn().mockReturnValue(false),
      findByUrl: vi.fn().mockReturnValue(null),
      reload: vi.fn(),
    },
    historyManager: {
      getHistory: vi.fn().mockReturnValue([]),
      search: vi.fn().mockReturnValue([]),
      clear: vi.fn(),
      count: 0,
    },
    downloadManager: {
      list: vi.fn().mockReturnValue([]),
      listActive: vi.fn().mockReturnValue([]),
    },
    audioCaptureManager: {
      startRecording: vi.fn().mockResolvedValue({ ok: true }),
      stopRecording: vi.fn().mockReturnValue({ ok: true }),
      getStatus: vi.fn().mockReturnValue({ recording: false }),
      listRecordings: vi.fn().mockReturnValue([]),
    },
    extensionLoader: {
      loadExtension: vi.fn().mockResolvedValue({ id: 'ext-1', name: 'Test Extension' }),
    },
    extensionManager: {
      list: vi.fn().mockReturnValue({ loaded: [], available: [] }),
      install: vi.fn().mockResolvedValue({ success: true }),
      getConflictsForExtension: vi.fn().mockReturnValue([]),
      getNativeMessagingStatus: vi.fn().mockReturnValue({}),
      getInstalledExtensions: vi.fn().mockReturnValue([]),
      getIdentityPolyfill: vi.fn().mockReturnValue({
        handleLaunchWebAuthFlow: vi.fn().mockResolvedValue({ redirectUrl: 'https://example.com/callback' }),
      }),
      checkForUpdates: vi.fn().mockResolvedValue([]),
      getUpdateState: vi.fn().mockReturnValue({ extensions: {}, lastCheckTimestamp: null, checkIntervalMs: 86400000 }),
      getNextScheduledCheck: vi.fn().mockReturnValue(null),
      applyUpdate: vi.fn().mockResolvedValue({ success: true }),
      applyAllUpdates: vi.fn().mockResolvedValue([]),
      getDiskUsage: vi.fn().mockReturnValue({}),
      getAllConflicts: vi.fn().mockReturnValue({ conflicts: [], summary: {} }),
    },
    claroNoteManager: {
      login: vi.fn().mockResolvedValue({ success: true }),
      logout: vi.fn().mockResolvedValue(undefined),
      getMe: vi.fn().mockResolvedValue({ id: 'u1', name: 'Test' }),
      getAuth: vi.fn().mockReturnValue({ user: { id: 'u1', name: 'Test' } }),
      getRecordingStatus: vi.fn().mockReturnValue({ recording: false }),
      startRecording: vi.fn().mockResolvedValue({ success: true }),
      stopRecording: vi.fn().mockResolvedValue({ success: true, noteId: 'n1' }),
      getNotes: vi.fn().mockResolvedValue([]),
      getNote: vi.fn().mockResolvedValue({ id: 'n1', title: 'Test' }),
      uploadRecording: vi.fn().mockResolvedValue('n1'),
    },
    contentExtractor: {
      extractCurrentPage: vi.fn().mockResolvedValue({ title: 'Test', text: 'content' }),
      extractFromURL: vi.fn().mockResolvedValue({ title: 'Test', text: 'content' }),
    },
    workflowEngine: {
      getWorkflows: vi.fn().mockResolvedValue([]),
      saveWorkflow: vi.fn().mockResolvedValue('wf-1'),
      deleteWorkflow: vi.fn().mockResolvedValue(undefined),
      runWorkflow: vi.fn().mockResolvedValue('exec-1'),
      getExecutionStatus: vi.fn().mockResolvedValue({ status: 'running' }),
      stopWorkflow: vi.fn().mockResolvedValue(undefined),
      getRunningExecutions: vi.fn().mockResolvedValue([]),
    },
    loginManager: {
      getAllStates: vi.fn().mockResolvedValue([]),
      getLoginState: vi.fn().mockResolvedValue({ domain: 'example.com', status: 'unknown' }),
      checkCurrentPage: vi.fn().mockResolvedValue({ isLoginPage: false }),
      isLoginPage: vi.fn().mockResolvedValue(false),
      updateLoginState: vi.fn().mockResolvedValue(undefined),
      clearLoginState: vi.fn().mockResolvedValue(undefined),
    },
    eventStream: {
      sseHandler: vi.fn().mockImplementation((_req, res) => { res.status(200).end(); }),
      getRecent: vi.fn().mockReturnValue([]),
      subscribe: vi.fn().mockReturnValue(() => {}),
      handleTabEvent: vi.fn(),
    },
    taskManager: {
      listTasks: vi.fn().mockReturnValue([]),
      getTask: vi.fn().mockReturnValue(null),
      createTask: vi.fn().mockReturnValue({ id: 't1', description: 'test', steps: [] }),
      respondToApproval: vi.fn(),
      markTaskRunning: vi.fn(),
      markTaskDone: vi.fn(),
      markTaskFailed: vi.fn(),
      updateStepStatus: vi.fn(),
      emergencyStop: vi.fn().mockReturnValue({ stopped: 1 }),
      requestApproval: vi.fn().mockResolvedValue(true),
      needsApproval: vi.fn().mockReturnValue(false),
      getAutonomySettings: vi.fn().mockReturnValue({}),
      updateAutonomySettings: vi.fn().mockReturnValue({}),
      getActivityLog: vi.fn().mockReturnValue([]),
    },
    tabLockManager: {
      getAllLocks: vi.fn().mockReturnValue([]),
      acquire: vi.fn().mockReturnValue({ acquired: true }),
      release: vi.fn().mockReturnValue(true),
      getOwner: vi.fn().mockReturnValue(null),
    },
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
      evaluate: vi.fn().mockResolvedValue('result'),
      sendCommand: vi.fn().mockResolvedValue({}),
      screenshotElement: vi.fn().mockResolvedValue(null),
    },
    wingmanStream: {
      setEnabled: vi.fn(),
      isEnabled: vi.fn().mockReturnValue(false),
    },
    securityManager: null,
    snapshotManager: {
      getSnapshot: vi.fn().mockResolvedValue({ text: 'snapshot', count: 5, url: 'https://example.com' }),
      clickRef: vi.fn().mockResolvedValue(undefined),
      fillRef: vi.fn().mockResolvedValue(undefined),
      getTextRef: vi.fn().mockResolvedValue('text content'),
    },
    networkMocker: {
      addRule: vi.fn().mockResolvedValue({ id: 'rule-1', pattern: '*.js' }),
      getRules: vi.fn().mockReturnValue([]),
      removeRule: vi.fn().mockResolvedValue(1),
      removeRuleById: vi.fn().mockResolvedValue(1),
      clearRules: vi.fn().mockResolvedValue(0),
    },
    sessionManager: {
      list: vi.fn().mockReturnValue([]),
      getActive: vi.fn().mockReturnValue('default'),
      create: vi.fn().mockReturnValue({ name: 'test', partition: 'persist:session-test' }),
      setActive: vi.fn(),
      get: vi.fn().mockReturnValue(null),
      destroy: vi.fn(),
      resolvePartition: vi.fn().mockReturnValue('persist:session-test'),
    },
    stateManager: {
      save: vi.fn().mockResolvedValue('/path/to/state.json'),
      load: vi.fn().mockResolvedValue({ cookiesRestored: 5 }),
      list: vi.fn().mockReturnValue([]),
    },
    scriptInjector: {
      listScripts: vi.fn().mockReturnValue([]),
      addScript: vi.fn().mockReturnValue({ name: 'test', enabled: true }),
      removeScript: vi.fn().mockReturnValue(true),
      enableScript: vi.fn().mockReturnValue(true),
      disableScript: vi.fn().mockReturnValue(true),
      listStyles: vi.fn().mockReturnValue([]),
      addStyle: vi.fn(),
      removeStyle: vi.fn().mockReturnValue(true),
      enableStyle: vi.fn().mockReturnValue(true),
      disableStyle: vi.fn().mockReturnValue(true),
    },
    locatorFinder: {
      find: vi.fn().mockResolvedValue({ found: true, ref: '@e1' }),
      findAll: vi.fn().mockResolvedValue([]),
    },
    deviceEmulator: {
      getProfiles: vi.fn().mockReturnValue([]),
      getStatus: vi.fn().mockReturnValue({}),
      emulateDevice: vi.fn().mockResolvedValue({ name: 'iPhone 14' }),
      emulateCustom: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
    },
  } as any;
}

/**
 * Create a minimal Express app with JSON middleware and registered routes.
 * Use this with supertest: `request(createTestApp(registerFn, ctx)).get('/path')`
 */
export function createTestApp(
  registerFn: (router: any, ctx: RouteContext) => void,
  ctx: RouteContext,
): express.Application {
  const app = express();
  app.use(express.json());
  registerFn(app, ctx);
  return app;
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/api/tests/helpers.ts` (or `npm run build` if available)
This may fail because it's a test helper using `vi` — that's fine, Vitest will handle it.

**Step 3: Commit**

```bash
git add src/api/tests/helpers.ts
git commit -m "test: add shared test helper for API route testing"
```

---

### Task 3: Tests for `tabs.ts` (7 endpoints)

**Files:**
- Create: `src/api/tests/routes/tabs.test.ts`
- Test: `src/api/routes/tabs.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {},
  webContents: {
    fromId: vi.fn().mockReturnValue(null),
    getAllWebContents: vi.fn().mockReturnValue([]),
  },
}));

import { registerTabRoutes } from '../../routes/tabs';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

describe('Tab Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerTabRoutes, ctx);
  });

  describe('POST /tabs/open', () => {
    it('opens a new tab with default url', async () => {
      const res = await request(app).post('/tabs/open').send({});
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.tabManager.openTab).toHaveBeenCalled();
    });

    it('opens a tab with specified url', async () => {
      const res = await request(app).post('/tabs/open').send({ url: 'https://example.com' });
      expect(res.status).toBe(200);
      expect(ctx.tabManager.openTab).toHaveBeenCalledWith(
        'https://example.com', undefined, 'robin', 'persist:tandem', true
      );
    });

    it('maps wingman source correctly', async () => {
      await request(app).post('/tabs/open').send({ source: 'wingman' });
      expect(ctx.tabManager.openTab).toHaveBeenCalledWith(
        'about:blank', undefined, 'wingman', 'persist:tandem', true
      );
    });

    it('returns 500 when openTab throws', async () => {
      vi.mocked(ctx.tabManager.openTab).mockRejectedValue(new Error('fail'));
      const res = await request(app).post('/tabs/open').send({});
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('fail');
    });
  });

  describe('POST /tabs/close', () => {
    it('closes a tab by id', async () => {
      const res = await request(app).post('/tabs/close').send({ tabId: 'tab-1' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 400 when tabId is missing', async () => {
      const res = await request(app).post('/tabs/close').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('tabId required');
    });
  });

  describe('GET /tabs/list', () => {
    it('returns tabs and groups', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([{ id: 't1' }] as any);
      vi.mocked(ctx.tabManager.listGroups).mockReturnValue([{ id: 'g1' }] as any);
      const res = await request(app).get('/tabs/list');
      expect(res.status).toBe(200);
      expect(res.body.tabs).toHaveLength(1);
      expect(res.body.groups).toHaveLength(1);
    });
  });

  describe('POST /tabs/focus', () => {
    it('focuses a tab', async () => {
      const res = await request(app).post('/tabs/focus').send({ tabId: 'tab-1' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 400 when tabId missing', async () => {
      const res = await request(app).post('/tabs/focus').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /tabs/group', () => {
    it('creates/updates a tab group', async () => {
      const res = await request(app).post('/tabs/group').send({
        groupId: 'g1', name: 'Test', tabIds: ['t1'],
      });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 400 when fields missing', async () => {
      const res = await request(app).post('/tabs/group').send({ groupId: 'g1' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /tabs/source', () => {
    it('sets tab source', async () => {
      const res = await request(app).post('/tabs/source').send({ tabId: 'tab-1', source: 'wingman' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 400 when fields missing', async () => {
      const res = await request(app).post('/tabs/source').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /tabs/cleanup', () => {
    it('destroys untracked webContents', async () => {
      const res = await request(app).post('/tabs/cleanup');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.destroyed).toBeDefined();
    });
  });
});
```

**Step 2: Run the test**

Run: `npx vitest run src/api/tests/routes/tabs.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/api/tests/routes/tabs.test.ts
git commit -m "test: add integration tests for tab routes (7 endpoints)"
```

---

### Task 4: Tests for `snapshots.ts` (8 endpoints)

**Files:**
- Create: `src/api/tests/routes/snapshots.test.ts`

**Step 1: Write the test file**

Test all 8 endpoints: GET /snapshot, POST /snapshot/click, POST /snapshot/fill, GET /snapshot/text, POST /find, POST /find/click, POST /find/fill, POST /find/all. Pattern: happy path + validation (400) + error (500) for each.

Key behaviors to test:
- `GET /snapshot` parses query params (interactive, compact, selector, depth)
- `POST /snapshot/click` requires `ref`
- `POST /snapshot/fill` requires `ref` and `value`
- `GET /snapshot/text` requires `ref` query param
- `POST /find` requires `by` and `value`
- `POST /find/click` returns 404 when element not found
- `POST /find/fill` requires `fillValue`
- `POST /find/all` returns count

**Step 2: Run the test**

Run: `npx vitest run src/api/tests/routes/snapshots.test.ts`

**Step 3: Commit**

```bash
git add src/api/tests/routes/snapshots.test.ts
git commit -m "test: add integration tests for snapshot routes (8 endpoints)"
```

---

### Task 5: Tests for `network.ts` (10 endpoints)

**Files:**
- Create: `src/api/tests/routes/network.test.ts`

**Step 1: Write tests**

Endpoints: GET /network/log, GET /network/apis, GET /network/domains, DELETE /network/clear, POST /network/mock, POST /network/route, GET /network/mocks, POST /network/unmock, POST /network/unroute, POST /network/mock-clear.

Key behaviors:
- `GET /network/log` parses limit and domain query params
- `POST /network/mock` requires pattern, returns rule id
- `POST /network/unmock` accepts either pattern or id
- Route aliases (/network/route = /network/mock, /network/unroute = /network/unmock)

**Step 2: Run & commit**

---

### Task 6: Tests for `sessions.ts` (11 endpoints)

**Files:**
- Create: `src/api/tests/routes/sessions.test.ts`

**Step 1: Write tests**

Endpoints: GET /device/profiles, GET /device/status, POST /device/emulate, POST /device/reset, GET /sessions/list, POST /sessions/create, POST /sessions/switch, POST /sessions/destroy, POST /sessions/state/save, POST /sessions/state/load, GET /sessions/state/list.

Key behaviors:
- `POST /device/emulate` has two modes: device name OR width+height
- `POST /device/emulate` returns 400 when neither provided
- `POST /sessions/create` requires name, optionally opens URL
- `POST /sessions/destroy` closes tabs and destroys session
- `POST /sessions/destroy` returns 404 for nonexistent session
- Sessions routes need `getSessionWC` and `getSessionPartition` mock — mock the `electron` module and ensure `ctx.tabManager.getActiveWebContents` returns a mock WC

**Step 2: Run & commit**

---

### Task 7: Tests for `devtools.ts` (15 endpoints)

**Files:**
- Create: `src/api/tests/routes/devtools.test.ts`

**Step 1: Write tests**

Key behaviors:
- `GET /devtools/console` parses level, since_id, limit, search
- `GET /devtools/network/:requestId/body` returns 404 when body is null
- `POST /devtools/evaluate` enforces MAX_CODE_LENGTH (1MB), returns 413
- `POST /devtools/evaluate` returns 408 on timeout (mock slow evaluate)
- `POST /devtools/dom/query` requires selector
- `POST /devtools/cdp` requires method
- `POST /devtools/screenshot/element` returns 404 when element not found
- `POST /devtools/toggle` interacts with webContents devtools methods

**Step 2: Run & commit**

---

### Task 8: Tests for `content.ts` (17 endpoints)

**Files:**
- Create: `src/api/tests/routes/content.test.ts`

**Step 1: Write tests**

Sections: content extraction (2), context bridge (5), scripts (5), styles (5).

Key behaviors:
- `POST /content/extract` returns 500 when no active tab
- `POST /content/extract/url` requires url
- `GET /context/search` requires q param
- `GET /context/page` returns 404 when page not found
- `POST /scripts/add` requires name and code
- `POST /scripts/enable` returns 404 when script not found
- `POST /styles/add` injects CSS into active tab
- `DELETE /styles/remove` requires name

**Step 2: Run & commit**

---

### Task 9: Tests for `agents.ts` (16 endpoints)

**Files:**
- Create: `src/api/tests/routes/agents.test.ts`

**Step 1: Write tests**

Sections: tasks (8), execute-js/confirm (1), check-approval (1), autonomy (2), activity log (1), tab locks (3).

Key behaviors:
- `GET /tasks/:id` returns 404 when task not found
- `POST /tasks` requires description and steps
- `POST /tasks/:id/status` handles running/done/failed + optional stepIndex
- `POST /emergency-stop` also sends chat message
- `POST /execute-js/confirm` creates task, waits for approval, executes JS
- `POST /tab-locks/acquire` requires tabId and agentId

**Step 2: Run & commit**

---

### Task 10: Tests for `data.ts` (25 endpoints)

**Files:**
- Create: `src/api/tests/routes/data.test.ts`

**Step 1: Write tests**

Sections: bookmarks (8), history (3), downloads (2), config (3), data export/import (2), chrome import (7).

Key behaviors:
- `POST /bookmarks/add` requires name and url
- `PUT /bookmarks/update` returns 404 when bookmark not found
- `GET /bookmarks/search` requires q param
- `GET /config/openclaw-token` reads file from disk — mock `fs.existsSync` and `fs.readFileSync`
- `GET /data/export` aggregates config + chat history + behavior stats
- `POST /data/import` writes chat history to disk
- Chrome import routes delegate to chromeImporter

Need to mock `fs` for config/openclaw-token and data export/import routes. Use `vi.mock('fs')` at the top or the test file.

**Step 2: Run & commit**

---

### Task 11: Tests for `extensions.ts` (14 endpoints)

**Files:**
- Create: `src/api/tests/routes/extensions.test.ts`

**Step 1: Write tests**

Key behaviors:
- `GET /extensions/list` enriches loaded extensions with conflicts
- `POST /extensions/load` requires path
- `POST /extensions/install` validates input string
- `DELETE /extensions/uninstall/:id` validates 32 char a-p format, resolves electron vs disk ID
- Chrome extension routes instantiate `ChromeExtensionImporter` — mock this class via `vi.mock`
- Gallery route instantiates `GalleryLoader` — mock this class
- `POST /extensions/identity/auth` validates extensionId is installed
- `POST /extensions/updates/apply` accepts optional extensionId

Mock `ChromeExtensionImporter` and `GalleryLoader` via `vi.mock('../../extensions/chrome-importer')` and `vi.mock('../../extensions/gallery-loader')`.

**Step 2: Run & commit**

---

### Task 12: Tests for `media.ts` (19 endpoints)

**Files:**
- Create: `src/api/tests/routes/media.test.ts`

**Step 1: Write tests**

Sections: panel (1), chat (5), voice (3), audio (4), draw/screenshots (4), wingman stream (2).

Key behaviors:
- `POST /chat` requires text or image, maps from param to sender type
- `GET /chat/image/:filename` prevents path traversal (.. / \ in filename)
- `POST /chat/webhook/test` reads config, makes fetch request — mock `fetch`
- `POST /audio/start` requires active tab
- `GET /screenshot/annotated` returns 404 when no screenshot
- `POST /wingman-stream/toggle` sets enabled state

**Step 2: Run & commit**

---

### Task 13: Tests for `browser.ts` (14 endpoints)

**Files:**
- Create: `src/api/tests/routes/browser.test.ts`

**Step 1: Write tests**

Key behaviors:
- `POST /navigate` requires url, supports session-aware navigation
- `GET /page-content` executes JS in active tab with DOM settlement
- `POST /click` requires selector, uses humanizedClick
- `POST /type` requires selector and text
- `POST /execute-js` enforces 1MB limit (413), 30s timeout (408)
- `GET /screenshot` returns PNG or saves to allowed dirs
- `GET /cookies` delegates to session.cookies
- `POST /cookies/clear` requires domain
- `POST /scroll` supports direction/target/selector modes
- `POST /wait` supports selector or load event

Need to mock `humanizedClick`, `humanizedType`, `wingmanAlert` via vi.mock:
```typescript
vi.mock('../../../input/humanized', () => ({
  humanizedClick: vi.fn().mockResolvedValue({ ok: true }),
  humanizedType: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('../../../notifications/alert', () => ({
  wingmanAlert: vi.fn(),
}));
```

**Step 2: Run & commit**

---

### Task 14: Tests for `misc.ts` — Part 1: Status, Passwords, Events, Live (lines 1-183)

**Files:**
- Create: `src/api/tests/routes/misc.test.ts`

This is the largest file (788 lines, 55+ endpoints). Split implementation into 3 parts but one test file.

**Step 1: Write tests for first section**

Sections: status (1), passwords (5), events (2), live mode (3).

Key behaviors:
- `GET /status` returns ready state, handles no active tab
- `POST /passwords/unlock` requires password, returns 401 on wrong password
- `GET /passwords/suggest` requires domain, returns 403 when vault locked
- `GET /passwords/generate` uses PasswordCrypto — mock require call
- `GET /events/stream` delegates to eventStream.sseHandler
- `POST /live/toggle` toggles module-level liveMode state
- `GET /live/stream` sets up SSE headers

Need to mock `getPasswordManager`:
```typescript
vi.mock('../../../passwords/manager', () => ({
  getPasswordManager: vi.fn().mockReturnValue({
    isVaultUnlocked: true,
    isNewVault: vi.fn().mockReturnValue(false),
    unlock: vi.fn().mockResolvedValue(true),
    lock: vi.fn(),
    getIdentitiesForDomain: vi.fn().mockReturnValue([]),
    saveItem: vi.fn(),
  }),
}));
```

**Step 2: Run & verify**

---

### Task 15: Tests for `misc.ts` — Part 2: Activity, Behavior, Memory, Watch, Headless, Forms, PiP (lines 185-448)

**Step 1: Add tests to misc.test.ts**

Sections: activity log (1), behavior (2), site memory (4), watch (4), headless (6), form memory (4), pip (2).

Key behaviors:
- `GET /activity-log` parses limit, since, types query params and filters
- `POST /behavior/clear` interacts with filesystem — mock `fs`
- `GET /memory/site/:domain` returns 404 when site not found
- `POST /watch/add` requires url
- `POST /headless/open` requires url
- `GET /forms/memory/:domain` returns 404 when no data
- `POST /forms/fill` returns 404 when no fill data

**Step 2: Run & verify**

---

### Task 16: Tests for `misc.ts` — Part 3: ClaroNote, Data Wipe, Workflows, Auth (lines 450-788)

**Step 1: Add tests to misc.test.ts**

Sections: claronote (8), data wipe (1), workflows (6), auth/login (5).

Key behaviors:
- `POST /claronote/login` requires email and password, returns 401 on failure
- `GET /claronote/me` returns 401 on error
- `POST /claronote/record/start` returns 400 on failure
- `POST /claronote/upload` requires audioBase64
- `POST /data/wipe` deletes files from disk — mock `fs`
- `POST /workflows` requires name and steps
- `POST /workflow/run` requires workflowId and active tab
- `GET /workflow/status/:executionId` returns 404 when not found
- `POST /auth/update` requires domain and status

**Step 2: Run full misc test file**

Run: `npx vitest run src/api/tests/routes/misc.test.ts`

**Step 3: Commit**

```bash
git add src/api/tests/routes/misc.test.ts
git commit -m "test: add integration tests for misc routes (55+ endpoints)"
```

---

### Task 17: Tests for security routes (`src/security/routes.ts`)

**Files:**
- Create: `src/security/tests/routes.test.ts`

**Step 1: Write tests**

The security routes use a different registration pattern: `registerSecurityRoutes(app, securityManager)` instead or `registerXRoutes(router, ctx)`. Create a mock SecurityManager with all sub-components (guardian, shield, outboundGuard, db, scriptGuard, contentAnalyzer, behaviorMonitor, gatekeeper).

Read the full security routes file to enumerate all 34 endpoints. Test happy path + error for each.

**Step 2: Run & commit**

```bash
git add src/security/tests/routes.test.ts
git commit -m "test: add integration tests for security routes (34 endpoints)"
```

---

### Task 18: Run full test suite and fix failures

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass (existing + new)

**Step 2: Run linter**

Run: `npm run lint`
Fix any lint errors in test files.

**Step 3: Count tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: ~500+ new tests on top or existing ~202

**Step 4: Commit fixes if any**

---

### Task 19: Version bump, changelog, STATUS.md update

**Files:**
- Modify: `package.json` (version 0.11.4 → 0.12.0 — this is a large/architectural item)
- Modify: `CHANGELOG.md`
- Modify: `docs/code-quality/STATUS.md`

**Step 1: Bump version**

Edit `package.json`: `"version": "0.11.4"` → `"version": "0.12.0"`

(Item 17 is a Large Effort — per CONVENTIONS.md, use MINOR bump)

**Step 2: Add changelog entry**

At the top or CHANGELOG.md (below header, above previous entry):

```markdown
## [0.12.0] — 2026-02-27

### Code Quality — Item 17

- **API route tests**: Added supertest-based integration tests for all 12 route files + security routes (~500 test cases). Shared test helper with mock RouteContext factory.
```

**Step 3: Update STATUS.md**

- Mark item 17 as DONE with commit hash and session date
- Update "Current State" section: version 0.12.0, last completed #17, 17/19 done
- Add session log entry

**Step 4: Commit**

```bash
git add package.json CHANGELOG.md docs/code-quality/STATUS.md
git commit -m "chore: bump to 0.12.0 — item 17 complete (17/19 done)"
```

**Step 5: Update STATUS.md with commit hash**

Edit STATUS.md to include the actual commit hash from step 4.

```bash
git add docs/code-quality/STATUS.md
git commit -m "docs: update STATUS.md with commit hash for item 17"
```
