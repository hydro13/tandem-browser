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

  // ─── POST /tabs/open ──────────────────────────────

  describe('POST /tabs/open', () => {
    it('opens a tab with defaults', async () => {
      const res = await request(app)
        .post('/tabs/open')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.tab).toBeDefined();
      expect(ctx.tabManager.openTab).toHaveBeenCalledWith(
        'about:blank',
        undefined,
        'user',
        'persist:tandem',
        true,
        undefined,
      );
      expect(ctx.panelManager.logActivity).toHaveBeenCalledWith(
        'tab-open',
        { url: 'about:blank', source: 'user', inheritSessionFrom: null, workspaceId: null },
      );
    });

    it('opens a tab with explicit url and groupId', async () => {
      const res = await request(app)
        .post('/tabs/open')
        .send({ url: 'https://example.com', groupId: 'g1', source: 'user', focus: false });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.tabManager.openTab).toHaveBeenCalledWith(
        'https://example.com',
        'g1',
        'user',
        'persist:tandem',
        false,
        undefined,
      );
    });

    it('maps "wingman" source correctly', async () => {
      await request(app)
        .post('/tabs/open')
        .send({ source: 'wingman' });

      expect(ctx.tabManager.openTab).toHaveBeenCalledWith(
        'about:blank',
        undefined,
        'wingman',
        'persist:tandem',
        true,
        undefined,
      );
      expect(ctx.panelManager.logActivity).toHaveBeenCalledWith(
        'tab-open',
        { url: 'about:blank', source: 'wingman', inheritSessionFrom: null, workspaceId: null },
      );
    });

    it('passes through non-empty custom actor sources', async () => {
      await request(app)
        .post('/tabs/open')
        .send({ source: 'codex' });

      expect(ctx.tabManager.openTab).toHaveBeenCalledWith(
        'about:blank',
        undefined,
        'codex',
        'persist:tandem',
        true,
        undefined,
      );
    });

    it('passes inheritSessionFrom through to the tab manager', async () => {
      const res = await request(app)
        .post('/tabs/open')
        .send({ url: 'https://discord.com/channels/@me', inheritSessionFrom: 'tab-9' });

      expect(res.status).toBe(200);
      expect(ctx.tabManager.openTab).toHaveBeenCalledWith(
        'https://discord.com/channels/@me',
        undefined,
        'user',
        'persist:tandem',
        true,
        { inheritSessionFrom: 'tab-9' },
      );
      expect(ctx.panelManager.logActivity).toHaveBeenCalledWith(
        'tab-open',
        {
          url: 'https://discord.com/channels/@me',
          source: 'user',
          inheritSessionFrom: 'tab-9',
          workspaceId: null,
        },
      );
    });

    it('returns 400 when inheritSessionFrom is not a string', async () => {
      const res = await request(app)
        .post('/tabs/open')
        .send({ inheritSessionFrom: 42 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('inheritSessionFrom must be a tab ID string');
      expect(ctx.tabManager.openTab).not.toHaveBeenCalled();
    });

    it('assigns the new tab to the requested workspace', async () => {
      vi.mocked(ctx.workspaceManager.get).mockReturnValueOnce({
        id: 'ws-ai',
        name: 'AI',
        icon: 'cpu-chip',
        color: '#4285f4',
        order: 1,
        isDefault: false,
        tabIds: [],
      } as any);

      const res = await request(app)
        .post('/tabs/open')
        .send({ url: 'https://example.com', workspaceId: 'ws-ai' });

      expect(res.status).toBe(200);
      expect(ctx.tabManager.openTab).toHaveBeenCalledWith(
        'https://example.com',
        undefined,
        'user',
        'persist:tandem',
        false,
        undefined,
      );
      expect(ctx.workspaceManager.moveTab).toHaveBeenCalledWith(100, 'ws-ai');
      expect(ctx.tabManager.focusTab).toHaveBeenCalledWith('tab-1');
      expect(ctx.panelManager.logActivity).toHaveBeenCalledWith(
        'tab-open',
        {
          url: 'https://example.com',
          source: 'user',
          inheritSessionFrom: null,
          workspaceId: 'ws-ai',
        },
      );
    });

    it('returns 400 when workspaceId is not a string', async () => {
      const res = await request(app)
        .post('/tabs/open')
        .send({ workspaceId: 123 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('workspaceId must be a workspace ID string');
      expect(ctx.tabManager.openTab).not.toHaveBeenCalled();
    });

    it('returns 400 when workspaceId does not exist', async () => {
      vi.mocked(ctx.workspaceManager.get).mockReturnValueOnce(null);

      const res = await request(app)
        .post('/tabs/open')
        .send({ workspaceId: 'ws-missing' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Workspace ws-missing not found');
      expect(ctx.tabManager.openTab).not.toHaveBeenCalled();
    });

    it('returns 500 when tabManager.openTab throws', async () => {
      vi.mocked(ctx.tabManager.openTab).mockRejectedValueOnce(new Error('boom'));

      const res = await request(app)
        .post('/tabs/open')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('boom');
    });
  });

  // ─── POST /tabs/close ─────────────────────────────

  describe('POST /tabs/close', () => {
    it('closes a tab by id', async () => {
      const res = await request(app)
        .post('/tabs/close')
        .send({ tabId: 'tab-1' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.tabManager.closeTab).toHaveBeenCalledWith('tab-1');
    });

    it('returns 400 when tabId is missing', async () => {
      const res = await request(app)
        .post('/tabs/close')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tabId required');
    });
  });

  // ─── GET /tabs/list ───────────────────────────────

  describe('GET /tabs/list', () => {
    it('returns tabs and groups', async () => {
      const fakeTabs = [{ id: 'tab-1', url: 'https://example.com' }];
      const fakeGroups = [{ groupId: 'g1', name: 'Work' }];
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue(fakeTabs as any);
      vi.mocked(ctx.tabManager.listGroups).mockReturnValue(fakeGroups as any);

      const res = await request(app).get('/tabs/list');

      expect(res.status).toBe(200);
      expect(res.body.tabs).toEqual(fakeTabs);
      expect(res.body.groups).toEqual(fakeGroups);
    });
  });

  // ─── POST /tabs/focus ─────────────────────────────

  describe('POST /tabs/focus', () => {
    it('focuses a tab by id', async () => {
      const res = await request(app)
        .post('/tabs/focus')
        .send({ tabId: 'tab-2' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.tabManager.focusTab).toHaveBeenCalledWith('tab-2');
    });

    it('returns 400 when tabId is missing', async () => {
      const res = await request(app)
        .post('/tabs/focus')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tabId required');
    });
  });

  // ─── POST /tabs/group ─────────────────────────────

  describe('POST /tabs/group', () => {
    it('creates a group with provided fields', async () => {
      const res = await request(app)
        .post('/tabs/group')
        .send({ groupId: 'g1', name: 'Work', color: '#ff0000', tabIds: ['tab-1'] });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.group).toBeDefined();
      expect(ctx.tabManager.setGroup).toHaveBeenCalledWith('g1', 'Work', '#ff0000', ['tab-1']);
    });

    it('uses default color when not provided', async () => {
      const res = await request(app)
        .post('/tabs/group')
        .send({ groupId: 'g1', name: 'Work', tabIds: ['tab-1'] });

      expect(res.status).toBe(200);
      expect(ctx.tabManager.setGroup).toHaveBeenCalledWith('g1', 'Work', '#4285f4', ['tab-1']);
    });

    it('returns 400 when groupId is missing', async () => {
      const res = await request(app)
        .post('/tabs/group')
        .send({ name: 'Work', tabIds: ['tab-1'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('groupId, name, and tabIds required');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/tabs/group')
        .send({ groupId: 'g1', tabIds: ['tab-1'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('groupId, name, and tabIds required');
    });

    it('returns 400 when tabIds is missing', async () => {
      const res = await request(app)
        .post('/tabs/group')
        .send({ groupId: 'g1', name: 'Work' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('groupId, name, and tabIds required');
    });
  });

  // ─── POST /tabs/source ────────────────────────────

  describe('POST /tabs/source', () => {
    it('sets the tab source', async () => {
      const res = await request(app)
        .post('/tabs/source')
        .send({ tabId: 'tab-1', source: 'codex' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.tabManager.setTabSource).toHaveBeenCalledWith('tab-1', 'codex');
    });

    it('returns 400 when tabId is missing', async () => {
      const res = await request(app)
        .post('/tabs/source')
        .send({ source: 'wingman' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tabId and source required');
    });

    it('returns 400 when source is missing', async () => {
      const res = await request(app)
        .post('/tabs/source')
        .send({ tabId: 'tab-1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tabId and source required');
    });

    it('returns 400 when source is empty', async () => {
      const res = await request(app)
        .post('/tabs/source')
        .send({ tabId: 'tab-1', source: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('source must be a non-empty string');
    });
  });

  // ─── POST /tabs/cleanup ───────────────────────────

  describe('POST /tabs/cleanup', () => {
    it('destroys untracked webContents', async () => {
      const { webContents } = await import('electron');

      const trackedWc = { id: 100, isDestroyed: () => false, getURL: () => 'https://tracked.com', close: vi.fn() };
      const untrackedWc = { id: 200, isDestroyed: () => false, getURL: () => 'https://untracked.com', close: vi.fn() };
      const fileWc = { id: 300, isDestroyed: () => false, getURL: () => 'file:///index.html', close: vi.fn() };
      const destroyedWc = { id: 400, isDestroyed: () => true, getURL: () => 'https://gone.com', close: vi.fn() };

      vi.mocked(webContents.getAllWebContents).mockReturnValue([trackedWc, untrackedWc, fileWc, destroyedWc] as any);
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([
        { webContentsId: 100 } as any,
      ]);
      // Main window webContents id is 1 (from createMockContext)
      (ctx.win.webContents as any).id = 1;

      const res = await request(app).post('/tabs/cleanup');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      // Only untrackedWc (id 200) should be destroyed
      // trackedWc (100) is in listTabs, fileWc (300) starts with file://, destroyedWc (400) isDestroyed
      expect(res.body.destroyed).toBe(1);
      expect(untrackedWc.close).toHaveBeenCalled();
      expect(trackedWc.close).not.toHaveBeenCalled();
      expect(fileWc.close).not.toHaveBeenCalled();
    });

    it('skips devtools:// and chrome:// URLs', async () => {
      const { webContents } = await import('electron');

      const devtoolsWc = { id: 500, isDestroyed: () => false, getURL: () => 'devtools://devtools/bundled/inspector.html', close: vi.fn() };
      const chromeWc = { id: 600, isDestroyed: () => false, getURL: () => 'chrome://settings', close: vi.fn() };

      vi.mocked(webContents.getAllWebContents).mockReturnValue([devtoolsWc, chromeWc] as any);
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);
      (ctx.win.webContents as any).id = 1;

      const res = await request(app).post('/tabs/cleanup');

      expect(res.status).toBe(200);
      expect(res.body.destroyed).toBe(0);
      expect(devtoolsWc.close).not.toHaveBeenCalled();
      expect(chromeWc.close).not.toHaveBeenCalled();
    });
  });

  // ─── POST /tabs/:id/emoji ────────────────────────

  describe('POST /tabs/:id/emoji', () => {
    it('sets emoji on a tab', async () => {
      const res = await request(app)
        .post('/tabs/tab-1/emoji')
        .send({ emoji: '🔥' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.tabManager.setEmoji).toHaveBeenCalledWith('tab-1', '🔥');
    });

    it('returns 400 when emoji is missing', async () => {
      const res = await request(app)
        .post('/tabs/tab-1/emoji')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('emoji required');
      expect(ctx.tabManager.setEmoji).not.toHaveBeenCalled();
    });

    it('returns 404 when tab not found', async () => {
      vi.mocked(ctx.tabManager.setEmoji).mockReturnValueOnce(false);

      const res = await request(app)
        .post('/tabs/bad-id/emoji')
        .send({ emoji: '🔥' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab not found');
    });

    it('flashes emoji when flash=true', async () => {
      const res = await request(app)
        .post('/tabs/tab-1/emoji')
        .send({ emoji: '🔥', flash: true });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.tabManager.flashEmoji).toHaveBeenCalledWith('tab-1', '🔥');
    });
  });

  // ─── DELETE /tabs/:id/emoji ──────────────────────

  describe('DELETE /tabs/:id/emoji', () => {
    it('removes emoji from a tab', async () => {
      const res = await request(app)
        .delete('/tabs/tab-1/emoji');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.tabManager.clearEmoji).toHaveBeenCalledWith('tab-1');
    });

    it('returns 404 when tab not found', async () => {
      vi.mocked(ctx.tabManager.clearEmoji).mockReturnValueOnce(false);

      const res = await request(app)
        .delete('/tabs/bad-id/emoji');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab not found');
    });
  });
});
