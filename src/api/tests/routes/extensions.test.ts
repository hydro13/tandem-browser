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

vi.mock('../../../utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(false),
      rmSync: vi.fn(),
    },
  };
});

vi.mock('../../../extensions/chrome-importer', () => ({
  ChromeExtensionImporter: vi.fn(function (this: any) {
    this.getChromeExtensionsDir = vi.fn().mockReturnValue('/fake/chrome');
    this.listChromeExtensions = vi.fn().mockReturnValue([]);
    this.isAlreadyImported = vi.fn().mockReturnValue(false);
    this.importAll = vi.fn().mockReturnValue({ imported: 0, failed: 0, skipped: 0, details: [] });
    this.importExtension = vi.fn().mockReturnValue({ success: true });
  }),
}));

vi.mock('../../../extensions/gallery-loader', () => ({
  GalleryLoader: vi.fn(function (this: any) {
    this.getGalleryResponse = vi.fn().mockReturnValue({ extensions: [], categories: [] });
  }),
}));

import fs from 'fs';
import { registerExtensionRoutes } from '../../routes/extensions';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';
import { ChromeExtensionImporter } from '../../../extensions/chrome-importer';
import { GalleryLoader } from '../../../extensions/gallery-loader';

describe('Extension Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerExtensionRoutes, ctx);
  });

  // ─── GET /extensions/list ──────────────────────────

  describe('GET /extensions/list', () => {
    it('returns loaded and available extensions with counts', async () => {
      vi.mocked(ctx.extensionManager.list).mockReturnValue({
        loaded: [
          { id: 'ext1', name: 'Ext One', path: '/home/.tandem/extensions/abcdefghijklmnopabcdefghijklmnop' },
        ],
        available: [
          { path: '/home/.tandem/extensions/abcdefghijklmnopabcdefghijklmnop' },
          { path: '/home/.tandem/extensions/pppppppppppppppppppppppppppppppp' },
        ],
      } as any);
      vi.mocked(ctx.extensionManager.getConflictsForExtension).mockReturnValue([
        { type: 'content_script', detail: 'overlap' },
      ] as any);

      const res = await request(app).get('/extensions/list');

      expect(res.status).toBe(200);
      expect(res.body.loaded).toHaveLength(1);
      expect(res.body.loaded[0].conflicts).toEqual([{ type: 'content_script', detail: 'overlap' }]);
      expect(res.body.available).toHaveLength(2);
      expect(res.body.count).toEqual({ loaded: 1, available: 2 });
    });

    it('returns empty lists when no extensions', async () => {
      const res = await request(app).get('/extensions/list');

      expect(res.status).toBe(200);
      expect(res.body.loaded).toEqual([]);
      expect(res.body.available).toEqual([]);
      expect(res.body.count).toEqual({ loaded: 0, available: 0 });
    });

    it('returns 500 when extensionManager.list throws', async () => {
      vi.mocked(ctx.extensionManager.list).mockImplementation(() => {
        throw new Error('list failed');
      });

      const res = await request(app).get('/extensions/list');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('list failed');
    });
  });

  // ─── POST /extensions/load ─────────────────────────

  describe('POST /extensions/load', () => {
    it('loads an extension by path', async () => {
      const res = await request(app)
        .post('/extensions/load')
        .send({ path: '/home/.tandem/extensions/my-ext' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.extension).toBeDefined();
      expect(ctx.extensionLoader.loadExtension).toHaveBeenCalledWith(
        ctx.win.webContents.session,
        '/home/.tandem/extensions/my-ext',
      );
    });

    it('returns 400 when path is missing', async () => {
      const res = await request(app)
        .post('/extensions/load')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('path required');
    });

    it('returns 500 when loadExtension throws', async () => {
      vi.mocked(ctx.extensionLoader.loadExtension).mockRejectedValueOnce(new Error('load failed'));

      const res = await request(app)
        .post('/extensions/load')
        .send({ path: '/some/path' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('load failed');
    });
  });

  // ─── POST /extensions/install ──────────────────────

  describe('POST /extensions/install', () => {
    it('installs extension from input string', async () => {
      vi.mocked(ctx.extensionManager.install).mockResolvedValue({
        success: true,
        extensionId: 'abcdefghijklmnopabcdefghijklmnop',
      } as any);

      const res = await request(app)
        .post('/extensions/install')
        .send({ input: 'abcdefghijklmnopabcdefghijklmnop' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(ctx.extensionManager.install).toHaveBeenCalledWith(
        'abcdefghijklmnopabcdefghijklmnop',
        ctx.win.webContents.session,
      );
      expect(ctx.win.webContents.send).toHaveBeenCalledWith('extension-toolbar-refresh');
    });

    it('returns 400 when input is missing', async () => {
      const res = await request(app)
        .post('/extensions/install')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Missing or invalid "input" field/);
    });

    it('returns 400 when input is empty string', async () => {
      const res = await request(app)
        .post('/extensions/install')
        .send({ input: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when input is not a string', async () => {
      const res = await request(app)
        .post('/extensions/install')
        .send({ input: 123 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when install returns failure', async () => {
      vi.mocked(ctx.extensionManager.install).mockResolvedValue({
        success: false,
        error: 'Invalid extension ID',
      } as any);

      const res = await request(app)
        .post('/extensions/install')
        .send({ input: 'bad-ext' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Invalid extension ID');
    });

    it('does not send toolbar refresh when install fails', async () => {
      vi.mocked(ctx.extensionManager.install).mockResolvedValue({
        success: false,
        error: 'fail',
      } as any);

      await request(app)
        .post('/extensions/install')
        .send({ input: 'bad-ext' });

      expect(ctx.win.webContents.send).not.toHaveBeenCalledWith('extension-toolbar-refresh');
    });

    it('returns 500 when install throws', async () => {
      vi.mocked(ctx.extensionManager.install).mockRejectedValueOnce(new Error('network error'));

      const res = await request(app)
        .post('/extensions/install')
        .send({ input: 'some-ext' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('network error');
    });
  });

  // ─── DELETE /extensions/uninstall/:id ──────────────

  describe('DELETE /extensions/uninstall/:id', () => {
    const validId = 'abcdefghijklmnopabcdefghijklmnop'; // 32 a-p chars

    it('returns 400 for invalid ID format (not 32 a-p chars)', async () => {
      const res = await request(app).delete('/extensions/uninstall/invalid-id');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid extension ID format/);
    });

    it('returns 400 for ID with uppercase chars', async () => {
      const res = await request(app).delete('/extensions/uninstall/ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for ID with chars outside a-p range', async () => {
      // 'z' is outside a-p
      const res = await request(app).delete('/extensions/uninstall/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when extension is not found', async () => {
      vi.mocked(ctx.extensionManager.list).mockReturnValue({
        loaded: [],
        available: [],
      } as any);

      const res = await request(app).delete(`/extensions/uninstall/${validId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/not found/);
    });

    it('uninstalls by Electron ID (loaded extension)', async () => {
      vi.mocked(ctx.extensionManager.list).mockReturnValue({
        loaded: [{ id: validId, path: '/home/.tandem/extensions/diskfoldername' }],
        available: [],
      } as any);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.rmSync).mockReturnValue(undefined);

      const res = await request(app).delete(`/extensions/uninstall/${validId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(ctx.win.webContents.session.removeExtension).toHaveBeenCalledWith(validId);
      expect(ctx.win.webContents.send).toHaveBeenCalledWith('extension-toolbar-refresh');
    });

    it('uninstalls by disk/CWS ID (available extension)', async () => {
      vi.mocked(ctx.extensionManager.list).mockReturnValue({
        loaded: [],
        available: [{ path: `/home/.tandem/extensions/${validId}` }],
      } as any);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.rmSync).mockReturnValue(undefined);

      const res = await request(app).delete(`/extensions/uninstall/${validId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(ctx.win.webContents.send).toHaveBeenCalledWith('extension-toolbar-refresh');
    });
  });

  // ─── GET /extensions/chrome/list ───────────────────

  describe('GET /extensions/chrome/list', () => {
    it('returns chrome extensions list with default profile', async () => {
      const res = await request(app).get('/extensions/chrome/list');

      expect(res.status).toBe(200);
      expect(res.body.chromeDir).toBe('/fake/chrome');
      expect(res.body.extensions).toEqual([]);
      expect(ChromeExtensionImporter).toHaveBeenCalledWith('Default');
    });

    it('uses custom profile from query param', async () => {
      await request(app).get('/extensions/chrome/list?profile=Profile%201');

      expect(ChromeExtensionImporter).toHaveBeenCalledWith('Profile 1');
    });

    it('returns null chromeDir when getChromeExtensionsDir returns null', async () => {
      vi.mocked(ChromeExtensionImporter).mockImplementationOnce(function (this: any) {
        this.getChromeExtensionsDir = vi.fn().mockReturnValue(null);
        this.listChromeExtensions = vi.fn().mockReturnValue([]);
        this.isAlreadyImported = vi.fn().mockReturnValue(false);
        this.importAll = vi.fn();
        this.importExtension = vi.fn();
      } as any);

      const res = await request(app).get('/extensions/chrome/list');

      expect(res.status).toBe(200);
      expect(res.body.chromeDir).toBeNull();
      expect(res.body.extensions).toEqual([]);
    });

    it('enriches extensions with alreadyImported flag', async () => {
      vi.mocked(ChromeExtensionImporter).mockImplementationOnce(function (this: any) {
        this.getChromeExtensionsDir = vi.fn().mockReturnValue('/fake/chrome');
        this.listChromeExtensions = vi.fn().mockReturnValue([
          { id: 'ext1', name: 'Ext One', version: '1.0' },
          { id: 'ext2', name: 'Ext Two', version: '2.0' },
        ]);
        this.isAlreadyImported = vi.fn().mockImplementation((id: string) => id === 'ext1');
        this.importAll = vi.fn();
        this.importExtension = vi.fn();
      } as any);

      const res = await request(app).get('/extensions/chrome/list');

      expect(res.status).toBe(200);
      expect(res.body.extensions).toEqual([
        { id: 'ext1', name: 'Ext One', version: '1.0', alreadyImported: true },
        { id: 'ext2', name: 'Ext Two', version: '2.0', alreadyImported: false },
      ]);
    });
  });

  // ─── POST /extensions/chrome/import ────────────────

  describe('POST /extensions/chrome/import', () => {
    it('imports all chrome extensions when all=true', async () => {
      const res = await request(app)
        .post('/extensions/chrome/import')
        .send({ all: true });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ imported: 0, failed: 0, skipped: 0, details: [] });
      expect(ChromeExtensionImporter).toHaveBeenCalledWith('Default');
    });

    it('uses custom profile from body', async () => {
      await request(app)
        .post('/extensions/chrome/import')
        .send({ all: true, profile: 'Profile 2' });

      expect(ChromeExtensionImporter).toHaveBeenCalledWith('Profile 2');
    });

    it('imports a single extension by extensionId', async () => {
      vi.mocked(ChromeExtensionImporter).mockImplementationOnce(function (this: any) {
        this.getChromeExtensionsDir = vi.fn();
        this.listChromeExtensions = vi.fn();
        this.isAlreadyImported = vi.fn();
        this.importAll = vi.fn();
        this.importExtension = vi.fn().mockReturnValue({ success: true });
      } as any);

      const res = await request(app)
        .post('/extensions/chrome/import')
        .send({ extensionId: 'ext-abc' });

      expect(res.status).toBe(200);
      expect(res.body.imported).toBe(1);
      expect(res.body.skipped).toBe(0);
      expect(res.body.failed).toBe(0);
      expect(res.body.details).toHaveLength(1);
    });

    it('reports skipped when importExtension returns skipped', async () => {
      vi.mocked(ChromeExtensionImporter).mockImplementationOnce(function (this: any) {
        this.getChromeExtensionsDir = vi.fn();
        this.listChromeExtensions = vi.fn();
        this.isAlreadyImported = vi.fn();
        this.importAll = vi.fn();
        this.importExtension = vi.fn().mockReturnValue({ success: false, skipped: true });
      } as any);

      const res = await request(app)
        .post('/extensions/chrome/import')
        .send({ extensionId: 'ext-abc' });

      expect(res.status).toBe(200);
      expect(res.body.imported).toBe(0);
      expect(res.body.skipped).toBe(1);
    });

    it('returns 400 when importExtension fails (not skipped)', async () => {
      vi.mocked(ChromeExtensionImporter).mockImplementationOnce(function (this: any) {
        this.getChromeExtensionsDir = vi.fn();
        this.listChromeExtensions = vi.fn();
        this.isAlreadyImported = vi.fn();
        this.importAll = vi.fn();
        this.importExtension = vi.fn().mockReturnValue({ success: false, error: 'bad manifest' });
      } as any);

      const res = await request(app)
        .post('/extensions/chrome/import')
        .send({ extensionId: 'ext-abc' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when extensionId is missing and all is not true', async () => {
      const res = await request(app)
        .post('/extensions/chrome/import')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing "extensionId"/);
    });

    it('returns 400 when extensionId is not a string', async () => {
      const res = await request(app)
        .post('/extensions/chrome/import')
        .send({ extensionId: 123 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing "extensionId"/);
    });
  });

  // ─── GET /extensions/gallery ───────────────────────

  describe('GET /extensions/gallery', () => {
    it('returns gallery response', async () => {
      vi.mocked(ctx.extensionManager.list).mockReturnValue({
        loaded: [],
        available: [{ path: '/home/.tandem/extensions/ext1' }],
      } as any);

      const res = await request(app).get('/extensions/gallery');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ extensions: [], categories: [] });
      expect(GalleryLoader).toHaveBeenCalled();
    });

    it('passes category query param to getGalleryResponse', async () => {
      vi.mocked(ctx.extensionManager.list).mockReturnValue({
        loaded: [],
        available: [],
      } as any);

      const mockGetGallery = vi.fn().mockReturnValue({ extensions: [], categories: [] });
      vi.mocked(GalleryLoader).mockImplementationOnce(function (this: any) {
        this.getGalleryResponse = mockGetGallery;
      } as any);

      await request(app).get('/extensions/gallery?category=productivity');

      expect(mockGetGallery).toHaveBeenCalledWith(
        expect.any(Set),
        { category: 'productivity', featured: undefined },
      );
    });

    it('passes featured query param to getGalleryResponse', async () => {
      vi.mocked(ctx.extensionManager.list).mockReturnValue({
        loaded: [],
        available: [],
      } as any);

      const mockGetGallery = vi.fn().mockReturnValue({ extensions: [], categories: [] });
      vi.mocked(GalleryLoader).mockImplementationOnce(function (this: any) {
        this.getGalleryResponse = mockGetGallery;
      } as any);

      await request(app).get('/extensions/gallery?featured=true');

      expect(mockGetGallery).toHaveBeenCalledWith(
        expect.any(Set),
        { category: undefined, featured: 'true' },
      );
    });
  });

  // ─── GET /extensions/native-messaging/status ───────

  describe('GET /extensions/native-messaging/status', () => {
    it('returns native messaging status', async () => {
      vi.mocked(ctx.extensionManager.getNativeMessagingStatus).mockReturnValue({
        supported: true,
        hosts: [],
      } as any);

      const res = await request(app).get('/extensions/native-messaging/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ supported: true, hosts: [] });
    });

    it('returns 500 when getNativeMessagingStatus throws', async () => {
      vi.mocked(ctx.extensionManager.getNativeMessagingStatus).mockImplementation(() => {
        throw new Error('native messaging error');
      });

      const res = await request(app).get('/extensions/native-messaging/status');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('native messaging error');
    });
  });

  // ─── POST /extensions/identity/auth ────────────────

  describe('POST /extensions/identity/auth', () => {
    it('returns 400 when url is missing', async () => {
      const res = await request(app)
        .post('/extensions/identity/auth')
        .send({ extensionId: 'ext1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('url is required');
    });

    it('returns 400 when url is not a string', async () => {
      const res = await request(app)
        .post('/extensions/identity/auth')
        .send({ url: 123, extensionId: 'ext1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('url is required');
    });

    it('returns 400 when extensionId is missing', async () => {
      const res = await request(app)
        .post('/extensions/identity/auth')
        .send({ url: 'https://auth.example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('extensionId is required');
    });

    it('returns 400 when extensionId is not a string', async () => {
      const res = await request(app)
        .post('/extensions/identity/auth')
        .send({ url: 'https://auth.example.com', extensionId: 42 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('extensionId is required');
    });

    it('returns 403 when extension is not installed', async () => {
      vi.mocked(ctx.extensionManager.isInstalledExtension).mockReturnValue(false);

      const res = await request(app)
        .post('/extensions/identity/auth')
        .send({ url: 'https://auth.example.com', extensionId: 'ext-unknown' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/not installed/);
    });

    it('calls handleLaunchWebAuthFlow for installed extension', async () => {
      const mockAuthFlow = vi.fn().mockResolvedValue({ redirectUrl: 'https://done.com' });
      vi.mocked(ctx.extensionManager.isInstalledExtension).mockReturnValue(true);
      vi.mocked(ctx.extensionManager.getIdentityPolyfill).mockReturnValue({
        handleLaunchWebAuthFlow: mockAuthFlow,
      } as any);

      const res = await request(app)
        .post('/extensions/identity/auth')
        .send({ url: 'https://auth.example.com', interactive: true, extensionId: 'ext1' });

      expect(res.status).toBe(200);
      expect(res.body.redirectUrl).toBe('https://done.com');
      expect(mockAuthFlow).toHaveBeenCalledWith({
        url: 'https://auth.example.com',
        interactive: true,
        extensionId: 'ext1',
      });
    });

    it('defaults interactive to true when not provided', async () => {
      const mockAuthFlow = vi.fn().mockResolvedValue({});
      vi.mocked(ctx.extensionManager.isInstalledExtension).mockReturnValue(true);
      vi.mocked(ctx.extensionManager.getIdentityPolyfill).mockReturnValue({
        handleLaunchWebAuthFlow: mockAuthFlow,
      } as any);

      await request(app)
        .post('/extensions/identity/auth')
        .send({ url: 'https://auth.example.com', extensionId: 'ext1' });

      expect(mockAuthFlow).toHaveBeenCalledWith(
        expect.objectContaining({ interactive: true }),
      );
    });

    it('passes interactive=false when explicitly set', async () => {
      const mockAuthFlow = vi.fn().mockResolvedValue({});
      vi.mocked(ctx.extensionManager.isInstalledExtension).mockReturnValue(true);
      vi.mocked(ctx.extensionManager.getIdentityPolyfill).mockReturnValue({
        handleLaunchWebAuthFlow: mockAuthFlow,
      } as any);

      await request(app)
        .post('/extensions/identity/auth')
        .send({ url: 'https://auth.example.com', extensionId: 'ext1', interactive: false });

      expect(mockAuthFlow).toHaveBeenCalledWith(
        expect.objectContaining({ interactive: false }),
      );
    });
  });

  // ─── GET /extensions/updates/check ─────────────────

  describe('GET /extensions/updates/check', () => {
    it('returns update check results', async () => {
      vi.mocked(ctx.extensionManager.checkForUpdates).mockResolvedValue([
        { extensionId: 'ext1', updateAvailable: true, latestVersion: '2.0' },
        { extensionId: 'ext2', updateAvailable: false, latestVersion: '1.0' },
      ] as any);
      vi.mocked(ctx.extensionManager.getUpdateState).mockReturnValue({
        extensions: {},
        lastCheckTimestamp: 1700000000,
        checkIntervalMs: 86400000,
      } as any);

      const res = await request(app).get('/extensions/updates/check');

      expect(res.status).toBe(200);
      expect(res.body.checked).toBe(2);
      expect(res.body.updatesAvailable).toHaveLength(1);
      expect(res.body.updatesAvailable[0].extensionId).toBe('ext1');
      expect(res.body.results).toHaveLength(2);
      expect(res.body.lastCheck).toBe(1700000000);
    });

    it('returns 500 when checkForUpdates throws', async () => {
      vi.mocked(ctx.extensionManager.checkForUpdates).mockRejectedValueOnce(new Error('check failed'));

      const res = await request(app).get('/extensions/updates/check');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('check failed');
    });
  });

  // ─── GET /extensions/updates/status ────────────────

  describe('GET /extensions/updates/status', () => {
    it('returns update status with per-extension info', async () => {
      vi.mocked(ctx.extensionManager.getUpdateState).mockReturnValue({
        extensions: {
          ext1: { installedVersion: '1.0', latestKnownVersion: '2.0' },
          ext2: { installedVersion: '1.5', latestKnownVersion: '1.5' },
          ext3: { installedVersion: '3.0', latestKnownVersion: null },
        },
        lastCheckTimestamp: 1700000000,
        checkIntervalMs: 86400000,
      } as any);
      vi.mocked(ctx.extensionManager.getNextScheduledCheck).mockReturnValue(1700086400 as any);

      const res = await request(app).get('/extensions/updates/status');

      expect(res.status).toBe(200);
      expect(res.body.lastCheck).toBe(1700000000);
      expect(res.body.nextScheduledCheck).toBe(1700086400);
      expect(res.body.checkIntervalMs).toBe(86400000);
      expect(res.body.extensions.ext1.updateAvailable).toBe(true);
      expect(res.body.extensions.ext2.updateAvailable).toBe(false);
      expect(res.body.extensions.ext3.updateAvailable).toBe(false);
    });

    it('returns empty extensions when none tracked', async () => {
      const res = await request(app).get('/extensions/updates/status');

      expect(res.status).toBe(200);
      expect(res.body.extensions).toEqual({});
      expect(res.body.lastCheck).toBeNull();
    });
  });

  // ─── POST /extensions/updates/apply ────────────────

  describe('POST /extensions/updates/apply', () => {
    it('applies update for a specific extension', async () => {
      vi.mocked(ctx.extensionManager.applyUpdate).mockResolvedValue({
        success: true,
        extensionId: 'ext1',
      } as any);

      const res = await request(app)
        .post('/extensions/updates/apply')
        .send({ extensionId: 'ext1' });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].success).toBe(true);
      expect(ctx.extensionManager.applyUpdate).toHaveBeenCalledWith(
        'ext1',
        ctx.win.webContents.session,
      );
      expect(ctx.win.webContents.send).toHaveBeenCalledWith('extension-toolbar-refresh');
    });

    it('applies all updates when no extensionId provided', async () => {
      vi.mocked(ctx.extensionManager.applyAllUpdates).mockResolvedValue([
        { success: true, extensionId: 'ext1' },
        { success: true, extensionId: 'ext2' },
      ] as any);

      const res = await request(app)
        .post('/extensions/updates/apply')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(2);
      expect(ctx.extensionManager.applyAllUpdates).toHaveBeenCalledWith(
        ctx.win.webContents.session,
      );
      expect(ctx.win.webContents.send).toHaveBeenCalledWith('extension-toolbar-refresh');
    });

    it('does not send toolbar refresh when no updates succeed', async () => {
      vi.mocked(ctx.extensionManager.applyAllUpdates).mockResolvedValue([
        { success: false, extensionId: 'ext1', error: 'fail' },
      ] as any);

      await request(app)
        .post('/extensions/updates/apply')
        .send({});

      expect(ctx.win.webContents.send).not.toHaveBeenCalledWith('extension-toolbar-refresh');
    });

    it('trims extensionId whitespace', async () => {
      vi.mocked(ctx.extensionManager.applyUpdate).mockResolvedValue({ success: true } as any);

      await request(app)
        .post('/extensions/updates/apply')
        .send({ extensionId: '  ext1  ' });

      expect(ctx.extensionManager.applyUpdate).toHaveBeenCalledWith(
        'ext1',
        ctx.win.webContents.session,
      );
    });

    it('returns 500 when applyUpdate throws', async () => {
      vi.mocked(ctx.extensionManager.applyUpdate).mockRejectedValueOnce(new Error('apply failed'));

      const res = await request(app)
        .post('/extensions/updates/apply')
        .send({ extensionId: 'ext1' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('apply failed');
    });
  });

  // ─── GET /extensions/disk-usage ────────────────────

  describe('GET /extensions/disk-usage', () => {
    it('returns disk usage data', async () => {
      vi.mocked(ctx.extensionManager.getDiskUsage).mockReturnValue({
        total: 1024000,
        extensions: [{ id: 'ext1', size: 512000 }],
      } as any);

      const res = await request(app).get('/extensions/disk-usage');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1024000);
      expect(res.body.extensions).toHaveLength(1);
    });

    it('returns 500 when getDiskUsage throws', async () => {
      vi.mocked(ctx.extensionManager.getDiskUsage).mockImplementation(() => {
        throw new Error('disk error');
      });

      const res = await request(app).get('/extensions/disk-usage');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('disk error');
    });
  });

  // ─── GET /extensions/conflicts ─────────────────────

  describe('GET /extensions/conflicts', () => {
    it('returns conflicts and summary', async () => {
      vi.mocked(ctx.extensionManager.getAllConflicts).mockReturnValue({
        conflicts: [{ type: 'content_script', extensions: ['ext1', 'ext2'] }],
        summary: { totalConflicts: 1 },
      } as any);

      const res = await request(app).get('/extensions/conflicts');

      expect(res.status).toBe(200);
      expect(res.body.conflicts).toHaveLength(1);
      expect(res.body.summary).toEqual({ totalConflicts: 1 });
    });

    it('returns empty conflicts when none exist', async () => {
      const res = await request(app).get('/extensions/conflicts');

      expect(res.status).toBe(200);
      expect(res.body.conflicts).toEqual([]);
      expect(res.body.summary).toEqual({});
    });

    it('returns 500 when getAllConflicts throws', async () => {
      vi.mocked(ctx.extensionManager.getAllConflicts).mockImplementation(() => {
        throw new Error('conflict error');
      });

      const res = await request(app).get('/extensions/conflicts');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('conflict error');
    });
  });
});
