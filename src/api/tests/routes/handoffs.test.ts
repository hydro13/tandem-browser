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

import { registerHandoffRoutes } from '../../routes/handoffs';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

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
      expect(res.body.workspaceName).toBe('AI Workspace');
    });

    it('returns 400 when status is invalid', async () => {
      const res = await request(app)
        .post('/handoffs')
        .send({ status: 'oops', title: 'Broken' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('status must be one of');
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
  });
});
