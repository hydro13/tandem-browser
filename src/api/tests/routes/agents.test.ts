import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {},
  webContents: {
    fromId: vi.fn(),
    getAllWebContents: vi.fn().mockReturnValue([]),
  },
}));

import { registerAgentRoutes } from '../../routes/agents';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

describe('Agent Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerAgentRoutes, ctx);
  });

  // ─── GET /tasks ──────────────────────────────────

  describe('GET /tasks', () => {
    it('returns all tasks', async () => {
      const fakeTasks = [{ id: 'task-1', description: 'Test task' }];
      vi.mocked(ctx.taskManager.listTasks).mockReturnValue(fakeTasks as any);

      const res = await request(app).get('/tasks');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(fakeTasks);
      expect(ctx.taskManager.listTasks).toHaveBeenCalledWith(undefined);
    });

    it('filters tasks by status query param', async () => {
      vi.mocked(ctx.taskManager.listTasks).mockReturnValue([]);

      const res = await request(app).get('/tasks?status=running');

      expect(res.status).toBe(200);
      expect(ctx.taskManager.listTasks).toHaveBeenCalledWith('running');
    });
  });

  // ─── GET /tasks/:id ─────────────────────────────

  describe('GET /tasks/:id', () => {
    it('returns a task by id', async () => {
      const fakeTask = { id: 'task-1', description: 'Test task', steps: [] };
      vi.mocked(ctx.taskManager.getTask).mockReturnValue(fakeTask as any);

      const res = await request(app).get('/tasks/task-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(fakeTask);
      expect(ctx.taskManager.getTask).toHaveBeenCalledWith('task-1');
    });

    it('returns 404 when task is not found', async () => {
      vi.mocked(ctx.taskManager.getTask).mockReturnValue(null as any);

      const res = await request(app).get('/tasks/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });
  });

  // ─── POST /tasks ────────────────────────────────

  describe('POST /tasks', () => {
    it('creates a task with description and steps', async () => {
      const fakeTask = { id: 'task-1', description: 'Do something', steps: [{ description: 'step 1' }] };
      vi.mocked(ctx.taskManager.createTask).mockReturnValue(fakeTask as any);

      const res = await request(app)
        .post('/tasks')
        .send({ description: 'Do something', steps: [{ description: 'step 1' }] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(fakeTask);
      expect(ctx.taskManager.createTask).toHaveBeenCalledWith(
        'Do something',
        'claude',
        'claude',
        [{ description: 'step 1' }],
      );
    });

    it('uses provided createdBy and assignedTo', async () => {
      vi.mocked(ctx.taskManager.createTask).mockReturnValue({ id: 'task-2' } as any);

      await request(app)
        .post('/tasks')
        .send({
          description: 'Test',
          steps: [{ description: 's1' }],
          createdBy: 'user',
          assignedTo: 'agent-2',
        });

      expect(ctx.taskManager.createTask).toHaveBeenCalledWith(
        'Test',
        'user',
        'agent-2',
        [{ description: 's1' }],
      );
    });

    it('returns 400 when description is missing', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ steps: [{ description: 'step 1' }] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('description and steps required');
    });

    it('returns 400 when steps is missing', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ description: 'Do something' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('description and steps required');
    });
  });

  // ─── POST /tasks/:id/approve ────────────────────

  describe('POST /tasks/:id/approve', () => {
    it('approves a task step', async () => {
      const res = await request(app)
        .post('/tasks/task-1/approve')
        .send({ stepId: 'step-0' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, approved: true });
      expect(ctx.taskManager.respondToApproval).toHaveBeenCalledWith('task-1', 'step-0', true);
    });

    it('returns 500 when respondToApproval throws', async () => {
      vi.mocked(ctx.taskManager.respondToApproval).mockImplementationOnce(() => {
        throw new Error('No pending approval');
      });

      const res = await request(app)
        .post('/tasks/task-1/approve')
        .send({ stepId: 'step-0' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('No pending approval');
    });
  });

  // ─── POST /tasks/:id/reject ─────────────────────

  describe('POST /tasks/:id/reject', () => {
    it('rejects a task step', async () => {
      const res = await request(app)
        .post('/tasks/task-1/reject')
        .send({ stepId: 'step-0' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, approved: false });
      expect(ctx.taskManager.respondToApproval).toHaveBeenCalledWith('task-1', 'step-0', false);
    });

    it('returns 500 when respondToApproval throws', async () => {
      vi.mocked(ctx.taskManager.respondToApproval).mockImplementationOnce(() => {
        throw new Error('Task not found');
      });

      const res = await request(app)
        .post('/tasks/task-1/reject')
        .send({ stepId: 'step-0' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Task not found');
    });
  });

  // ─── POST /tasks/:id/status ─────────────────────

  describe('POST /tasks/:id/status', () => {
    it('marks a task as running', async () => {
      const fakeTask = { id: 'task-1', status: 'running' };
      vi.mocked(ctx.taskManager.getTask).mockReturnValue(fakeTask as any);

      const res = await request(app)
        .post('/tasks/task-1/status')
        .send({ status: 'running' });

      expect(res.status).toBe(200);
      expect(ctx.taskManager.markTaskRunning).toHaveBeenCalledWith('task-1');
      expect(res.body).toEqual(fakeTask);
    });

    it('marks a task as done with result', async () => {
      const fakeTask = { id: 'task-1', status: 'done' };
      vi.mocked(ctx.taskManager.getTask).mockReturnValue(fakeTask as any);

      const res = await request(app)
        .post('/tasks/task-1/status')
        .send({ status: 'done', result: 'All good' });

      expect(res.status).toBe(200);
      expect(ctx.taskManager.markTaskDone).toHaveBeenCalledWith('task-1', 'All good');
    });

    it('marks a task as failed with result', async () => {
      const fakeTask = { id: 'task-1', status: 'failed' };
      vi.mocked(ctx.taskManager.getTask).mockReturnValue(fakeTask as any);

      const res = await request(app)
        .post('/tasks/task-1/status')
        .send({ status: 'failed', result: 'Something broke' });

      expect(res.status).toBe(200);
      expect(ctx.taskManager.markTaskFailed).toHaveBeenCalledWith('task-1', 'Something broke');
    });

    it('marks a task as failed with default message when result is missing', async () => {
      const fakeTask = { id: 'task-1', status: 'failed' };
      vi.mocked(ctx.taskManager.getTask).mockReturnValue(fakeTask as any);

      const res = await request(app)
        .post('/tasks/task-1/status')
        .send({ status: 'failed' });

      expect(res.status).toBe(200);
      expect(ctx.taskManager.markTaskFailed).toHaveBeenCalledWith('task-1', 'Unknown error');
    });

    it('updates step status when stepIndex and stepStatus are provided', async () => {
      const fakeTask = { id: 'task-1', status: 'running' };
      vi.mocked(ctx.taskManager.getTask).mockReturnValue(fakeTask as any);

      const res = await request(app)
        .post('/tasks/task-1/status')
        .send({ status: 'running', stepIndex: 0, stepStatus: 'done', result: 'Step done' });

      expect(res.status).toBe(200);
      expect(ctx.taskManager.markTaskRunning).toHaveBeenCalledWith('task-1');
      expect(ctx.taskManager.updateStepStatus).toHaveBeenCalledWith('task-1', 0, 'done', 'Step done');
    });

    it('returns task error object when task not found after update', async () => {
      vi.mocked(ctx.taskManager.getTask).mockReturnValue(null as any);

      const res = await request(app)
        .post('/tasks/task-1/status')
        .send({ status: 'running' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ error: 'Task not found' });
    });
  });

  // ─── POST /emergency-stop ──────────────────────

  describe('POST /emergency-stop', () => {
    it('stops all tasks and sends chat message', async () => {
      vi.mocked(ctx.taskManager.emergencyStop).mockReturnValue({ stopped: 3 } as any);

      const res = await request(app).post('/emergency-stop');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ stopped: 3 });
      expect(ctx.taskManager.emergencyStop).toHaveBeenCalled();
      expect(ctx.panelManager.addChatMessage).toHaveBeenCalledWith(
        'wingman',
        expect.stringContaining('3 tasks stopped'),
      );
    });

    it('works when panelManager is null', async () => {
      vi.mocked(ctx.taskManager.emergencyStop).mockReturnValue({ stopped: 0 } as any);
      (ctx as any).panelManager = null;

      const res = await request(app).post('/emergency-stop');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ stopped: 0 });
    });
  });

  // ─── POST /execute-js/confirm ───────────────────

  describe('POST /execute-js/confirm', () => {
    it('returns 400 when code is missing', async () => {
      const res = await request(app)
        .post('/execute-js/confirm')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('code is required');
    });

    it('returns 400 when code is not a string', async () => {
      const res = await request(app)
        .post('/execute-js/confirm')
        .send({ code: 123 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('code is required');
    });

    it('executes JS when approval resolves true', async () => {
      vi.mocked(ctx.taskManager.requestApproval).mockResolvedValue(true);
      const mockWC = ctx.tabManager.getActiveWebContents as any;
      const wc = await mockWC();
      wc.executeJavaScript.mockResolvedValue('result-value');

      const res = await request(app)
        .post('/execute-js/confirm')
        .send({ code: 'document.title' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, result: 'result-value' });
      expect(ctx.taskManager.createTask).toHaveBeenCalled();
      expect(ctx.taskManager.requestApproval).toHaveBeenCalled();
    });

    it('returns 403 when approval resolves false (rejected)', async () => {
      vi.mocked(ctx.taskManager.requestApproval).mockResolvedValue(false);

      const res = await request(app)
        .post('/execute-js/confirm')
        .send({ code: 'document.title' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('User rejected JS execution');
      expect(res.body.rejected).toBe(true);
    });

    it('returns 400 when no active tab', async () => {
      vi.mocked(ctx.taskManager.requestApproval).mockResolvedValue(true);
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValue(null as any);

      const res = await request(app)
        .post('/execute-js/confirm')
        .send({ code: 'document.title' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No active tab');
    });

    it('targets a specific tab when X-Tab-Id header is provided', async () => {
      // Arrange: tab list contains two tabs, the targeted one has a distinct wcId
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([
        { id: 'tab-1', webContentsId: 100, url: 'https://a.com', title: 'A', active: true, source: 'user', partition: 'persist:tandem' } as any,
        { id: 'tab-7', webContentsId: 707, url: 'https://b.com', title: 'B', active: false, source: 'user', partition: 'persist:tandem' } as any,
      ]);
      const { webContents } = await import('electron');
      const targetWC = { executeJavaScript: vi.fn().mockResolvedValue('from-tab-7'), id: 707 } as any;
      vi.mocked(webContents.fromId).mockImplementation((id: number) => (id === 707 ? targetWC : null));
      vi.mocked(ctx.taskManager.requestApproval).mockResolvedValue(true);

      // Act
      const res = await request(app)
        .post('/execute-js/confirm')
        .set('X-Tab-Id', 'tab-7')
        .send({ code: 'document.title' });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, result: 'from-tab-7' });
      expect(targetWC.executeJavaScript).toHaveBeenCalledWith('document.title');
      // The default active WC should NOT have been used
      const activeWC = await (ctx.tabManager.getActiveWebContents as any)();
      expect(activeWC.executeJavaScript).not.toHaveBeenCalled();
    });
  });

  // ─── GET /tasks/check-approval ──────────────────
  // NOTE: This route is unreachable because GET /tasks/:id is registered first
  // and Express matches "check-approval" as the :id param. This is a known
  // routing conflict in the production code.

  describe('GET /tasks/check-approval', () => {
    it('is intercepted by /tasks/:id (routing conflict — returns 404)', async () => {
      // The :id route sees id="check-approval", getTask returns null → 404
      const res = await request(app)
        .get('/tasks/check-approval?actionType=navigate&targetUrl=https://example.com');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });
  });

  // ─── GET /autonomy ──────────────────────────────

  describe('GET /autonomy', () => {
    it('returns autonomy settings', async () => {
      const settings = { level: 'supervised', maxActions: 10 };
      vi.mocked(ctx.taskManager.getAutonomySettings).mockReturnValue(settings as any);

      const res = await request(app).get('/autonomy');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(settings);
    });
  });

  // ─── PATCH /autonomy ────────────────────────────

  describe('PATCH /autonomy', () => {
    it('updates autonomy settings', async () => {
      const updated = { level: 'autonomous', maxActions: 50 };
      vi.mocked(ctx.taskManager.updateAutonomySettings).mockReturnValue(updated as any);

      const res = await request(app)
        .patch('/autonomy')
        .send({ level: 'autonomous', maxActions: 50 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updated);
      expect(ctx.taskManager.updateAutonomySettings).toHaveBeenCalledWith({
        level: 'autonomous',
        maxActions: 50,
      });
    });

    it('returns 500 when updateAutonomySettings throws', async () => {
      vi.mocked(ctx.taskManager.updateAutonomySettings).mockImplementationOnce(() => {
        throw new Error('Invalid settings');
      });

      const res = await request(app)
        .patch('/autonomy')
        .send({ level: 'invalid' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Invalid settings');
    });
  });

  // ─── GET /activity-log/agent ────────────────────

  describe('GET /activity-log/agent', () => {
    it('returns activity log with default limit', async () => {
      const logs = [{ id: 1, action: 'navigate' }];
      vi.mocked(ctx.taskManager.getActivityLog).mockReturnValue(logs as any);

      const res = await request(app).get('/activity-log/agent');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(logs);
      expect(ctx.taskManager.getActivityLog).toHaveBeenCalledWith(50);
    });

    it('respects custom limit query param', async () => {
      vi.mocked(ctx.taskManager.getActivityLog).mockReturnValue([]);

      const res = await request(app).get('/activity-log/agent?limit=10');

      expect(res.status).toBe(200);
      expect(ctx.taskManager.getActivityLog).toHaveBeenCalledWith(10);
    });
  });

  // ─── GET /tab-locks ─────────────────────────────

  describe('GET /tab-locks', () => {
    it('returns all locks', async () => {
      const fakeLocks = [{ tabId: 'tab-1', agentId: 'agent-1' }];
      vi.mocked(ctx.tabLockManager.getAllLocks).mockReturnValue(fakeLocks as any);

      const res = await request(app).get('/tab-locks');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ locks: fakeLocks });
    });
  });

  // ─── POST /tab-locks/acquire ────────────────────

  describe('POST /tab-locks/acquire', () => {
    it('acquires a lock for a tab', async () => {
      vi.mocked(ctx.tabLockManager.acquire).mockReturnValue({ acquired: true } as any);

      const res = await request(app)
        .post('/tab-locks/acquire')
        .send({ tabId: 'tab-1', agentId: 'agent-1' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ acquired: true });
      expect(ctx.tabLockManager.acquire).toHaveBeenCalledWith('tab-1', 'agent-1');
    });

    it('returns 400 when tabId is missing', async () => {
      const res = await request(app)
        .post('/tab-locks/acquire')
        .send({ agentId: 'agent-1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tabId and agentId required');
    });

    it('returns 400 when agentId is missing', async () => {
      const res = await request(app)
        .post('/tab-locks/acquire')
        .send({ tabId: 'tab-1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tabId and agentId required');
    });
  });

  // ─── POST /tab-locks/release ────────────────────

  describe('POST /tab-locks/release', () => {
    it('releases a lock for a tab', async () => {
      vi.mocked(ctx.tabLockManager.release).mockReturnValue(true);

      const res = await request(app)
        .post('/tab-locks/release')
        .send({ tabId: 'tab-1', agentId: 'agent-1' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(ctx.tabLockManager.release).toHaveBeenCalledWith('tab-1', 'agent-1');
    });

    it('returns ok: false when release fails', async () => {
      vi.mocked(ctx.tabLockManager.release).mockReturnValue(false);

      const res = await request(app)
        .post('/tab-locks/release')
        .send({ tabId: 'tab-1', agentId: 'agent-1' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: false });
    });

    it('returns 400 when tabId is missing', async () => {
      const res = await request(app)
        .post('/tab-locks/release')
        .send({ agentId: 'agent-1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tabId and agentId required');
    });

    it('returns 400 when agentId is missing', async () => {
      const res = await request(app)
        .post('/tab-locks/release')
        .send({ tabId: 'tab-1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tabId and agentId required');
    });
  });

  // ─── GET /tab-locks/:tabId ──────────────────────

  describe('GET /tab-locks/:tabId', () => {
    it('returns lock status for a tab with no owner', async () => {
      vi.mocked(ctx.tabLockManager.getOwner).mockReturnValue(null);

      const res = await request(app).get('/tab-locks/tab-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ tabId: 'tab-1', locked: false, owner: null });
      expect(ctx.tabLockManager.getOwner).toHaveBeenCalledWith('tab-1');
    });

    it('returns lock status for a tab with an owner', async () => {
      vi.mocked(ctx.tabLockManager.getOwner).mockReturnValue('agent-1' as any);

      const res = await request(app).get('/tab-locks/tab-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ tabId: 'tab-1', locked: true, owner: 'agent-1' });
    });
  });
});
