import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { registerWorkspaceRoutes } from '../../routes/workspaces';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

describe('Workspace Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerWorkspaceRoutes, ctx);
  });

  describe('GET /workspaces', () => {
    it('returns the reconciled active workspace together with focused-tab ownership info', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([
        { id: 'tab-1', webContentsId: 321, url: 'https://example.com', title: 'Example' },
      ] as any);
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue({
        id: 'tab-1',
        webContentsId: 321,
        url: 'https://example.com',
        title: 'Example',
      } as any);
      vi.mocked(ctx.workspaceManager.list).mockReturnValue([
        { id: 'ws-1', name: 'Test', icon: 'briefcase', color: '#4285f4', order: 0, isDefault: false, tabIds: [321] },
      ] as any);
      vi.mocked(ctx.workspaceManager.getActiveId).mockReturnValue('ws-1');
      vi.mocked(ctx.workspaceManager.getWorkspaceIdForTab).mockReturnValue('ws-1');

      const res = await request(app).get('/workspaces');

      expect(res.status).toBe(200);
      expect(ctx.workspaceManager.reconcileTabState).toHaveBeenCalledWith([321], 321);
      expect(res.body).toEqual({
        ok: true,
        scope: 'global',
        workspaces: [
          { id: 'ws-1', name: 'Test', icon: 'briefcase', color: '#4285f4', order: 0, isDefault: false, tabIds: [321] },
        ],
        activeId: 'ws-1',
        activeTabId: 'tab-1',
        activeTabWorkspaceId: 'ws-1',
        activeWorkspaceSource: 'focused-tab',
      });
    });
  });

  describe('POST /workspaces/:id/activate', () => {
    it('focuses one of the requested workspace tabs instead of forcing a workspace switch when a live tab exists', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([
        { id: 'tab-1', webContentsId: 111, url: 'https://example.com', title: 'Example' },
        { id: 'tab-2', webContentsId: 222, url: 'https://openai.com', title: 'OpenAI' },
      ] as any);
      vi.mocked(ctx.tabManager.getActiveTab)
        .mockReturnValueOnce({ id: 'tab-1', webContentsId: 111, url: 'https://example.com', title: 'Example' } as any)
        .mockReturnValueOnce({ id: 'tab-2', webContentsId: 222, url: 'https://openai.com', title: 'OpenAI' } as any);
      vi.mocked(ctx.workspaceManager.getWorkspaceIdForTab)
        .mockReturnValueOnce('ws-default')
        .mockReturnValueOnce('ws-1');
      vi.mocked(ctx.workspaceManager.switch).mockReturnValue({
        id: 'ws-1',
        name: 'Test',
        icon: 'briefcase',
        color: '#4285f4',
        order: 0,
        isDefault: false,
        tabIds: [222],
      } as any);
      vi.mocked(ctx.workspaceManager.get).mockReturnValue({
        id: 'ws-1',
        name: 'Test',
        icon: 'briefcase',
        color: '#4285f4',
        order: 0,
        isDefault: false,
        tabIds: [222],
      } as any);
      vi.mocked(ctx.workspaceManager.getActiveId).mockReturnValue('ws-1');

      const res = await request(app).post('/workspaces/ws-1/activate').send({});

      expect(res.status).toBe(200);
      expect(ctx.workspaceManager.switch).not.toHaveBeenCalled();
      expect(ctx.tabManager.focusTab).toHaveBeenCalledWith('tab-2');
      expect(res.body).toEqual({
        ok: true,
        scope: 'global',
        workspace: {
          id: 'ws-1',
          name: 'Test',
          icon: 'briefcase',
          color: '#4285f4',
          order: 0,
          isDefault: false,
          tabIds: [222],
        },
        focusedTabId: 'tab-2',
        activeId: 'ws-1',
      });
    });

    it('falls back to an explicit workspace switch when the target workspace has no live tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([
        { id: 'tab-1', webContentsId: 111, url: 'https://example.com', title: 'Example' },
      ] as any);
      vi.mocked(ctx.tabManager.getActiveTab)
        .mockReturnValueOnce({ id: 'tab-1', webContentsId: 111, url: 'https://example.com', title: 'Example' } as any)
        .mockReturnValueOnce({ id: 'tab-1', webContentsId: 111, url: 'https://example.com', title: 'Example' } as any);
      vi.mocked(ctx.workspaceManager.get).mockReturnValue({
        id: 'ws-1',
        name: 'Test',
        icon: 'briefcase',
        color: '#4285f4',
        order: 0,
        isDefault: false,
        tabIds: [222],
      } as any);
      vi.mocked(ctx.workspaceManager.switch).mockReturnValue({
        id: 'ws-1',
        name: 'Test',
        icon: 'briefcase',
        color: '#4285f4',
        order: 0,
        isDefault: false,
        tabIds: [222],
      } as any);
      vi.mocked(ctx.workspaceManager.getActiveId).mockReturnValue('ws-1');
      vi.mocked(ctx.workspaceManager.getActiveSource).mockReturnValue('selection');

      const res = await request(app).post('/workspaces/ws-1/activate').send({});

      expect(res.status).toBe(200);
      expect(ctx.workspaceManager.switch).toHaveBeenCalledWith('ws-1');
      expect(ctx.tabManager.focusTab).not.toHaveBeenCalled();
      expect(res.body.focusedTabId).toBeNull();
      expect(ctx.workspaceManager.reconcileTabState).toHaveBeenLastCalledWith([111], 111);
    });
  });

  describe('POST /workspaces/:id/tabs', () => {
    it('moves a tab into the requested workspace', async () => {
      const res = await request(app)
        .post('/workspaces/ws-1/tabs')
        .send({ tabId: 321 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(ctx.workspaceManager.moveTab).toHaveBeenCalledWith(321, 'ws-1');
    });

    it('accepts numeric strings for tabId', async () => {
      const res = await request(app)
        .post('/workspaces/ws-1/tabs')
        .send({ tabId: '321' });

      expect(res.status).toBe(200);
      expect(ctx.workspaceManager.moveTab).toHaveBeenCalledWith(321, 'ws-1');
    });

    it('returns 400 when tabId is missing', async () => {
      const res = await request(app)
        .post('/workspaces/ws-1/tabs')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tabId is required');
      expect(ctx.workspaceManager.moveTab).not.toHaveBeenCalled();
    });

    it('returns 400 when tabId is not numeric', async () => {
      const res = await request(app)
        .post('/workspaces/ws-1/tabs')
        .send({ tabId: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tabId must be a numeric webContents ID');
      expect(ctx.workspaceManager.moveTab).not.toHaveBeenCalled();
    });
  });
});
