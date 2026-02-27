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
        'robin',
        'persist:tandem',
        true,
      );
      expect(ctx.panelManager.logActivity).toHaveBeenCalledWith(
        'tab-open',
        { url: 'about:blank', source: 'robin' },
      );
    });

    it('opens a tab with explicit url and groupId', async () => {
      const res = await request(app)
        .post('/tabs/open')
        .send({ url: 'https://example.com', groupId: 'g1', source: 'robin', focus: false });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.tabManager.openTab).toHaveBeenCalledWith(
        'https://example.com',
        'g1',
        'robin',
        'persist:tandem',
        false,
      );
    });

    it('maps "copilot" source correctly', async () => {
      await request(app)
        .post('/tabs/open')
        .send({ source: 'copilot' });

      expect(ctx.tabManager.openTab).toHaveBeenCalledWith(
        'about:blank',
        undefined,
        'copilot',
        'persist:tandem',
        true,
      );
      expect(ctx.panelManager.logActivity).toHaveBeenCalledWith(
        'tab-open',
        { url: 'about:blank', source: 'copilot' },
      );
    });

    it('maps "kees" source to copilot', async () => {
      await request(app)
        .post('/tabs/open')
        .send({ source: 'kees' });

      expect(ctx.tabManager.openTab).toHaveBeenCalledWith(
        'about:blank',
        undefined,
        'copilot',
        'persist:tandem',
        true,
      );
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
        .send({ tabId: 'tab-1', source: 'copilot' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(ctx.tabManager.setTabSource).toHaveBeenCalledWith('tab-1', 'copilot');
    });

    it('returns 400 when tabId is missing', async () => {
      const res = await request(app)
        .post('/tabs/source')
        .send({ source: 'copilot' });

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
      ctx.win.webContents.id = 1;

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
      ctx.win.webContents.id = 1;

      const res = await request(app).post('/tabs/cleanup');

      expect(res.status).toBe(200);
      expect(res.body.destroyed).toBe(0);
      expect(devtoolsWc.close).not.toHaveBeenCalled();
      expect(chromeWc.close).not.toHaveBeenCalled();
    });
  });
});
