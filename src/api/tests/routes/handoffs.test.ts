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

vi.mock('../../../notifications/alert', () => ({
  wingmanAlert: vi.fn(),
}));

import { registerHandoffRoutes } from '../../routes/handoffs';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';
import { wingmanAlert } from '../../../notifications/alert';

describe('Handoff Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerHandoffRoutes, ctx);
  });

  describe('GET /handoffs', () => {
    it('lists open handoffs with serialized context', async () => {
      vi.mocked(ctx.handoffManager.list).mockReturnValue([
        {
          id: 'handoff-1',
          status: 'needs_human',
          title: 'Captcha detected',
          body: 'Please solve the captcha',
          reason: 'captcha',
          workspaceId: 'ws-1',
          tabId: 'tab-1',
          agentId: 'claude',
          source: 'claude',
          actionLabel: 'Solve captcha and resume',
          taskId: null,
          stepId: null,
          open: true,
          createdAt: 1,
          updatedAt: 2,
        },
      ] as any);
      vi.mocked(ctx.workspaceManager.get).mockReturnValue({
        id: 'ws-1',
        name: 'AI Workspace',
        icon: 'sparkles',
        color: '#fff',
        tabIds: [100],
      } as any);

      const res = await request(app).get('/handoffs?openOnly=true');

      expect(res.status).toBe(200);
      expect(ctx.handoffManager.list).toHaveBeenCalledWith(expect.objectContaining({ openOnly: true }));
      expect(res.body.handoffs[0]).toEqual(expect.objectContaining({
        id: 'handoff-1',
        actionable: true,
        workspaceName: 'AI Workspace',
        tabTitle: 'Example',
        tabUrl: 'https://example.com',
      }));
    });

    it('returns 400 when the status filter is invalid', async () => {
      const res = await request(app).get('/handoffs?status=oops');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('status must be one of');
    });
  });

  describe('GET /handoffs/:id', () => {
    it('returns 404 when the handoff is missing', async () => {
      const res = await request(app).get('/handoffs/missing');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Handoff not found');
    });
  });

  describe('POST /handoffs', () => {
    it('creates a handoff and infers workspace from tab context', async () => {
      vi.mocked(ctx.workspaceManager.getWorkspaceIdForTab).mockReturnValue('ws-1');
      vi.mocked(ctx.workspaceManager.get).mockReturnValue({
        id: 'ws-1',
        name: 'AI Workspace',
        icon: 'sparkles',
        color: '#fff',
        tabIds: [100],
      } as any);
      vi.mocked(ctx.handoffManager.create).mockReturnValue({
        id: 'handoff-2',
        status: 'blocked',
        title: 'Login required',
        body: 'Please sign in',
        reason: 'login_required',
        workspaceId: 'ws-1',
        tabId: 'tab-1',
        agentId: 'claude',
        source: 'claude',
        actionLabel: 'Log in and continue',
        taskId: null,
        stepId: null,
        open: true,
        createdAt: 1,
        updatedAt: 1,
      } as any);

      const res = await request(app)
        .post('/handoffs')
        .send({
          status: 'blocked',
          title: 'Login required',
          body: 'Please sign in',
          reason: 'login_required',
          tabId: 'tab-1',
          source: 'claude',
        });

      expect(res.status).toBe(200);
      expect(ctx.handoffManager.create).toHaveBeenCalledWith(expect.objectContaining({
        status: 'blocked',
        title: 'Login required',
        workspaceId: 'ws-1',
        tabId: 'tab-1',
      }));
      expect(ctx.taskHandoffCoordinator.syncHandoffState).toHaveBeenCalledWith(expect.objectContaining({
        id: 'handoff-2',
      }));
      expect(res.body.workspaceName).toBe('AI Workspace');
    });

    it('returns 400 when status is invalid', async () => {
      const res = await request(app)
        .post('/handoffs')
        .send({ status: 'oops', title: 'Broken' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('status must be one of');
    });

    it('notifies Wingman when requested and normalizes optional metadata', async () => {
      vi.mocked(ctx.handoffManager.create).mockReturnValue({
        id: 'handoff-5',
        status: 'waiting_approval',
        title: 'Need approval',
        body: 'Please confirm',
        reason: 'approval_required',
        workspaceId: null,
        tabId: null,
        agentId: null,
        source: null,
        actionLabel: null,
        taskId: null,
        stepId: null,
        open: true,
        createdAt: 1,
        updatedAt: 1,
      } as any);

      const res = await request(app)
        .post('/handoffs')
        .send({
          status: 'waiting_approval',
          title: 'Need approval',
          body: 'Please confirm',
          reason: 'approval_required',
          source: '  ',
          actionLabel: '  ',
          notify: true,
        });

      expect(res.status).toBe(200);
      expect(ctx.handoffManager.create).toHaveBeenCalledWith(expect.objectContaining({
        source: null,
        actionLabel: null,
      }));
      expect(ctx.taskHandoffCoordinator.syncHandoffState).toHaveBeenCalledWith(expect.objectContaining({
        id: 'handoff-5',
      }));
      expect(wingmanAlert).toHaveBeenCalledWith('Need approval', 'Please confirm');
    });

    it('returns 400 when an optional metadata field is not a string', async () => {
      const res = await request(app)
        .post('/handoffs')
        .send({
          status: 'needs_human',
          title: 'Bad source',
          source: 42,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('source must be a string when provided');
    });

    it('returns 500 when the requested workspace does not exist', async () => {
      vi.mocked(ctx.workspaceManager.get).mockReturnValue(undefined);

      const res = await request(app)
        .post('/handoffs')
        .send({
          status: 'needs_human',
          title: 'Missing workspace',
          workspaceId: 'ws-missing',
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Workspace ws-missing not found');
    });
  });

  describe('PATCH /handoffs/:id', () => {
    it('updates a handoff status', async () => {
      vi.mocked(ctx.handoffManager.update).mockReturnValue({
        id: 'handoff-3',
        status: 'ready_to_resume',
        title: 'Captcha solved',
        body: 'Agent can continue',
        reason: 'captcha',
        workspaceId: null,
        tabId: null,
        agentId: 'claude',
        source: 'claude',
        actionLabel: 'Resume agent',
        taskId: null,
        stepId: null,
        open: true,
        createdAt: 1,
        updatedAt: 2,
      } as any);

      const res = await request(app)
        .patch('/handoffs/handoff-3')
        .send({ status: 'ready_to_resume', actionLabel: 'Resume agent' });

      expect(res.status).toBe(200);
      expect(ctx.handoffManager.update).toHaveBeenCalledWith('handoff-3', expect.objectContaining({
        status: 'ready_to_resume',
        actionLabel: 'Resume agent',
      }));
      expect(ctx.taskHandoffCoordinator.syncHandoffState).toHaveBeenCalledWith(expect.objectContaining({
        id: 'handoff-3',
      }));
    });

    it('returns 400 when open is not a boolean', async () => {
      const res = await request(app)
        .patch('/handoffs/handoff-3')
        .send({ open: 'yes' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('open must be a boolean');
    });

    it('returns 404 when the handoff cannot be updated', async () => {
      vi.mocked(ctx.handoffManager.update).mockReturnValue(null);

      const res = await request(app)
        .patch('/handoffs/missing')
        .send({ status: 'resolved' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Handoff not found');
    });

    it('returns 400 when title is empty or reason/body types are invalid', async () => {
      const emptyTitle = await request(app)
        .patch('/handoffs/handoff-3')
        .send({ title: '   ' });
      expect(emptyTitle.status).toBe(400);
      expect(emptyTitle.body.error).toBe('title must be a non-empty string');

      const badBody = await request(app)
        .patch('/handoffs/handoff-3')
        .send({ body: 42 });
      expect(badBody.status).toBe(400);
      expect(badBody.body.error).toBe('body must be a string');

      const badReason = await request(app)
        .patch('/handoffs/handoff-3')
        .send({ reason: 42 });
      expect(badReason.status).toBe(400);
      expect(badReason.body.error).toBe('reason must be a string');
    });

    it('validates optional metadata fields and syncs patched task-linked handoffs', async () => {
      vi.mocked(ctx.workspaceManager.getWorkspaceIdForTab).mockReturnValue('ws-1');
      vi.mocked(ctx.workspaceManager.get).mockReturnValue({
        id: 'ws-1',
        name: 'AI Workspace',
        icon: 'sparkles',
        color: '#fff',
        tabIds: [100],
      } as any);
      vi.mocked(ctx.handoffManager.update).mockReturnValue({
        id: 'handoff-3',
        status: 'blocked',
        title: 'Updated',
        body: 'Updated body',
        reason: 'human_help',
        workspaceId: 'ws-1',
        tabId: 'tab-1',
        agentId: null,
        source: null,
        actionLabel: null,
        taskId: 'task-1',
        stepId: 'step-1',
        open: true,
        createdAt: 1,
        updatedAt: 2,
      } as any);

      const res = await request(app)
        .patch('/handoffs/handoff-3')
        .send({ workspaceId: 'ws-1', tabId: 'tab-1', source: '  ', agentId: '  ' });

      expect(res.status).toBe(200);
      expect(ctx.handoffManager.update).toHaveBeenCalledWith('handoff-3', expect.objectContaining({
        workspaceId: 'ws-1',
        tabId: 'tab-1',
        source: null,
        agentId: null,
      }));
      expect(ctx.taskHandoffCoordinator.syncHandoffState).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task-1',
        stepId: 'step-1',
      }));

      const badSource = await request(app)
        .patch('/handoffs/handoff-3')
        .send({ source: 42 });
      expect(badSource.status).toBe(400);
      expect(badSource.body.error).toBe('source must be a string when provided');
    });
  });

  describe('POST /handoffs/:id/resolve', () => {
    it('resolves an open handoff', async () => {
      vi.mocked(ctx.handoffManager.resolve).mockReturnValue({
        id: 'handoff-6',
        status: 'resolved',
        title: 'All set',
        body: '',
        reason: 'done',
        workspaceId: null,
        tabId: null,
        agentId: null,
        source: 'claude',
        actionLabel: null,
        taskId: null,
        stepId: null,
        open: false,
        createdAt: 1,
        updatedAt: 2,
        resolvedAt: 2,
      } as any);

      const res = await request(app).post('/handoffs/handoff-6/resolve');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(expect.objectContaining({
        id: 'handoff-6',
        actionable: false,
        status: 'resolved',
      }));
      expect(ctx.taskHandoffCoordinator.syncHandoffState).toHaveBeenCalledWith(expect.objectContaining({
        id: 'handoff-6',
      }));
    });

    it('returns 404 when resolving a missing handoff', async () => {
      const res = await request(app).post('/handoffs/missing/resolve');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Handoff not found');
    });
  });

  describe('POST /handoffs/:id/ready', () => {
    it('marks a handoff ready to resume', async () => {
      vi.mocked(ctx.taskHandoffCoordinator.markReady).mockReturnValue({
        id: 'handoff-ready',
        status: 'ready_to_resume',
        title: 'Captcha solved',
        body: 'Ready now',
        reason: 'captcha',
        workspaceId: null,
        tabId: null,
        agentId: 'claude',
        source: 'claude',
        actionLabel: 'Resume agent',
        taskId: 'task-1',
        stepId: 'step-1',
        open: true,
        createdAt: 1,
        updatedAt: 2,
      } as any);

      const res = await request(app).post('/handoffs/handoff-ready/ready');

      expect(res.status).toBe(200);
      expect(ctx.taskHandoffCoordinator.markReady).toHaveBeenCalledWith('handoff-ready');
      expect(res.body.status).toBe('ready_to_resume');
    });

    it('returns 404 and surfaces coordinator errors for ready actions', async () => {
      vi.mocked(ctx.taskHandoffCoordinator.markReady).mockReturnValueOnce(null);
      const missing = await request(app).post('/handoffs/missing/ready');
      expect(missing.status).toBe(404);
      expect(missing.body.error).toBe('Handoff not found');

      vi.mocked(ctx.taskHandoffCoordinator.markReady).mockImplementationOnce(() => {
        throw new Error('handoff not resumable yet');
      });
      const failing = await request(app).post('/handoffs/handoff-ready/ready');
      expect(failing.status).toBe(500);
      expect(failing.body.error).toBe('handoff not resumable yet');
    });
  });

  describe('POST /handoffs/:id/resume', () => {
    it('resumes a handoff-linked task', async () => {
      vi.mocked(ctx.taskHandoffCoordinator.resume).mockReturnValue({
        id: 'handoff-resume',
        status: 'resolved',
        title: 'Resume task',
        body: 'Resumed',
        reason: 'human_help',
        workspaceId: null,
        tabId: null,
        agentId: 'claude',
        source: 'claude',
        actionLabel: 'Agent resumed',
        taskId: 'task-1',
        stepId: 'step-1',
        open: false,
        createdAt: 1,
        updatedAt: 2,
        resolvedAt: 2,
      } as any);

      const res = await request(app).post('/handoffs/handoff-resume/resume');

      expect(res.status).toBe(200);
      expect(ctx.taskHandoffCoordinator.resume).toHaveBeenCalledWith('handoff-resume');
      expect(res.body.status).toBe('resolved');
    });

    it('returns 404 and 500 variants for resume actions', async () => {
      vi.mocked(ctx.taskHandoffCoordinator.resume).mockReturnValueOnce(null);
      const missing = await request(app).post('/handoffs/missing/resume');
      expect(missing.status).toBe(404);

      vi.mocked(ctx.taskHandoffCoordinator.resume).mockImplementationOnce(() => {
        throw new Error('Task task-1 step step-1 is not resumable');
      });
      const failing = await request(app).post('/handoffs/handoff-resume/resume');
      expect(failing.status).toBe(500);
      expect(failing.body.error).toContain('not resumable');
    });
  });

  describe('POST /handoffs/:id/approve', () => {
    it('approves a waiting handoff', async () => {
      vi.mocked(ctx.taskHandoffCoordinator.approve).mockReturnValue({
        id: 'handoff-approve',
        status: 'resolved',
        title: 'Approve delete',
        body: 'Approval granted.',
        reason: 'approval_required',
        workspaceId: null,
        tabId: null,
        agentId: 'claude',
        source: 'claude',
        actionLabel: 'Approval granted',
        taskId: 'task-1',
        stepId: 'step-1',
        open: false,
        createdAt: 1,
        updatedAt: 2,
        resolvedAt: 2,
      } as any);

      const res = await request(app).post('/handoffs/handoff-approve/approve');

      expect(res.status).toBe(200);
      expect(ctx.taskHandoffCoordinator.approve).toHaveBeenCalledWith('handoff-approve');
    });

    it('returns 404 when approval handoff is missing', async () => {
      vi.mocked(ctx.taskHandoffCoordinator.approve).mockReturnValueOnce(null);
      const res = await request(app).post('/handoffs/missing/approve');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /handoffs/:id/reject', () => {
    it('rejects a waiting handoff', async () => {
      vi.mocked(ctx.taskHandoffCoordinator.reject).mockReturnValue({
        id: 'handoff-reject',
        status: 'resolved',
        title: 'Reject delete',
        body: 'Approval rejected.',
        reason: 'approval_required',
        workspaceId: null,
        tabId: null,
        agentId: 'claude',
        source: 'claude',
        actionLabel: 'Approval rejected',
        taskId: 'task-1',
        stepId: 'step-1',
        open: false,
        createdAt: 1,
        updatedAt: 2,
        resolvedAt: 2,
      } as any);

      const res = await request(app).post('/handoffs/handoff-reject/reject');

      expect(res.status).toBe(200);
      expect(ctx.taskHandoffCoordinator.reject).toHaveBeenCalledWith('handoff-reject');
    });

    it('returns 404 when rejection handoff is missing', async () => {
      vi.mocked(ctx.taskHandoffCoordinator.reject).mockReturnValueOnce(null);
      const res = await request(app).post('/handoffs/missing/reject');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /handoffs/:id/activate', () => {
    it('switches workspace and focuses the targeted tab', async () => {
      vi.mocked(ctx.handoffManager.get).mockReturnValue({
        id: 'handoff-4',
        status: 'needs_human',
        title: 'Review this tab',
        body: '',
        reason: 'review',
        workspaceId: 'ws-1',
        tabId: 'tab-1',
        agentId: null,
        source: 'claude',
        actionLabel: null,
        taskId: null,
        stepId: null,
        open: true,
        createdAt: 1,
        updatedAt: 2,
      } as any);
      vi.mocked(ctx.workspaceManager.get).mockReturnValue({
        id: 'ws-1',
        name: 'AI Workspace',
        icon: 'sparkles',
        color: '#fff',
        tabIds: [100],
      } as any);

      const res = await request(app).post('/handoffs/handoff-4/activate');

      expect(res.status).toBe(200);
      expect(ctx.workspaceManager.switch).toHaveBeenCalledWith('ws-1');
      expect(ctx.tabManager.focusTab).toHaveBeenCalledWith('tab-1');
      expect(res.body.focusedTabId).toBe('tab-1');
    });

    it('focuses the first tab in the workspace when no tabId is attached', async () => {
      vi.mocked(ctx.handoffManager.get).mockReturnValue({
        id: 'handoff-7',
        status: 'needs_human',
        title: 'Workspace review',
        body: '',
        reason: 'review',
        workspaceId: 'ws-1',
        tabId: null,
        agentId: null,
        source: 'claude',
        actionLabel: null,
        taskId: null,
        stepId: null,
        open: true,
        createdAt: 1,
        updatedAt: 2,
      } as any);
      vi.mocked(ctx.workspaceManager.get).mockReturnValue({
        id: 'ws-1',
        name: 'AI Workspace',
        icon: 'sparkles',
        color: '#fff',
        tabIds: [100],
      } as any);

      const res = await request(app).post('/handoffs/handoff-7/activate');

      expect(res.status).toBe(200);
      expect(ctx.tabManager.focusTab).toHaveBeenCalledWith('tab-1');
      expect(res.body.focusedTabId).toBe('tab-1');
    });

    it('returns 404 when activating a missing handoff', async () => {
      const res = await request(app).post('/handoffs/missing/activate');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Handoff not found');
    });
  });
});
