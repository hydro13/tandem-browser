import type { Router, Request, Response } from 'express';
import { webContents } from 'electron';
import path from 'path';
import fs from 'fs';
import type { RouteContext } from '../context';
import { tandemDir } from '../../utils/paths';
import { ChromeExtensionImporter } from '../../extensions/chrome-importer';
import { GalleryLoader } from '../../extensions/gallery-loader';
import { handleRouteError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';

const log = createLogger('ExtensionRoutes');

interface ExtensionFrameInfo {
  frameId: number;
  parentFrameId: number;
  processId: number;
  url: string;
  errorOccurred: boolean;
}

function getExtensionFramesForWebContents(tabId: number): ExtensionFrameInfo[] {
  const wc = webContents.fromId(tabId);
  if (!wc || wc.isDestroyed()) {
    return [];
  }

  const mainFrame = wc.mainFrame;
  const frames = mainFrame.framesInSubtree;
  return frames
    .filter(frame => !frame.isDestroyed() && !frame.detached)
    .map(frame => ({
      // Chrome reports the top-level frame as frameId 0; match that shape so
      // extensions like 1Password don't treat the main frame as an arbitrary subframe.
      frameId: frame === mainFrame ? 0 : frame.routingId,
      parentFrameId: !frame.parent ? -1 : frame.parent === mainFrame ? 0 : frame.parent.routingId,
      processId: frame.processId,
      url: frame.url || '',
      errorOccurred: false,
    }));
}

export function registerExtensionRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // EXTENSIONS — Phase 5.7 + Phase 2 API Routes
  // ═══════════════════════════════════════════════

  router.get('/extensions/list', (_req: Request, res: Response) => {
    try {
      const { loaded, available } = ctx.extensionManager.list();

      // Enrich loaded extensions with conflict info (Phase 10a)
      const loadedWithConflicts = loaded.map(ext => {
        const conflicts = ctx.extensionManager.getConflictsForExtension(
          path.basename(ext.path)
        );
        return { ...ext, conflicts };
      });

      res.json({
        loaded: loadedWithConflicts,
        available,
        count: { loaded: loaded.length, available: available.length },
      });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/extensions/load', async (req: Request, res: Response) => {
    try {
      const { path: extPath } = req.body;
      if (!extPath) { res.status(400).json({ error: 'path required' }); return; }
      const ses = ctx.win.webContents.session;
      const result = await ctx.extensionLoader.loadExtension(ses, extPath);
      res.json({ ok: true, extension: result });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // POST /extensions/install — Install extension from CWS URL or extension ID
  router.post('/extensions/install', async (req: Request, res: Response) => {
    try {
      const { input } = req.body;
      if (!input || typeof input !== 'string' || !input.trim()) {
        res.status(400).json({ success: false, error: 'Missing or invalid "input" field — provide a CWS URL or extension ID' });
        return;
      }
      const ses = ctx.win.webContents.session;
      const result = await ctx.extensionManager.install(input.trim(), ses);
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      // Notify renderer to refresh extension toolbar
      ctx.win.webContents.send('extension-toolbar-refresh');
      res.json(result);
    } catch (e) {
      log.error('Extension install error:', e);
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  // DELETE /extensions/uninstall/:id — Uninstall extension by ID (accepts CWS ID or Electron ID)
  router.delete('/extensions/uninstall/:id', (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      // Validate extension ID format (32 lowercase a-p chars)
      if (!/^[a-p]{32}$/.test(id)) {
        res.status(400).json({ success: false, error: 'Invalid extension ID format — must be 32 lowercase a-p characters' });
        return;
      }

      const { loaded, available } = ctx.extensionManager.list();
      const ses = ctx.win.webContents.session;

      // Resolve IDs: user may pass CWS ID (folder name) or Electron runtime ID
      // When manifest lacks "key" field, these differ — we need both for correct cleanup
      let electronId: string | null = null;
      let diskId: string | null = null;

      // Check if ID matches a loaded extension's Electron ID
      const byElectronId = loaded.find(e => e.id === id);
      if (byElectronId) {
        electronId = id;
        diskId = path.basename(byElectronId.path);
      }

      // Check if ID matches a CWS/disk folder name
      if (!diskId) {
        const onDisk = available.some(e => path.basename(e.path) === id);
        if (onDisk) {
          diskId = id;
          // Find Electron ID for session removal
          const byPath = loaded.find(e => path.basename(e.path) === id);
          if (byPath) electronId = byPath.id;
        }
      }

      if (!electronId && !diskId) {
        res.status(404).json({ success: false, error: `Extension ${id} not found` });
        return;
      }

      // Remove from session using Electron ID (may differ from CWS ID)
      if (electronId) {
        try {
          ses.removeExtension(electronId);
          log.info(`🧩 Extension removed from session — Electron ID: ${electronId}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn(`⚠️ session.removeExtension(${electronId}) failed: ${msg}`);
        }
      }

      // Remove from disk using CWS/disk ID (the folder name)
      if (diskId) {
        const extPath = tandemDir('extensions', diskId);
        if (fs.existsSync(extPath)) {
          try {
            fs.rmSync(extPath, { recursive: true, force: true });
            log.info(`🧩 Extension removed from disk: ${extPath}`);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            res.status(500).json({ success: false, error: `Failed to remove extension files: ${msg}` });
            return;
          }
        }
      }

      // Notify renderer to refresh extension toolbar
      ctx.win.webContents.send('extension-toolbar-refresh');
      res.json({ success: true });
    } catch (e) {
      log.error('Extension uninstall error:', e);
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  // GET /extensions/chrome/list — List Chrome extensions available for import
  router.get('/extensions/chrome/list', (req: Request, res: Response) => {
    try {
      const profile = typeof req.query.profile === 'string' ? req.query.profile : 'Default';
      const importer = new ChromeExtensionImporter(profile);
      const chromeDir = importer.getChromeExtensionsDir();

      if (!chromeDir) {
        res.json({ chromeDir: null, extensions: [] });
        return;
      }

      const extensions = importer.listChromeExtensions().map(ext => ({
        id: ext.id,
        name: ext.name,
        version: ext.version,
        alreadyImported: importer.isAlreadyImported(ext.id),
      }));

      res.json({ chromeDir, extensions });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // POST /extensions/chrome/import — Import Chrome extension(s) into Tandem
  router.post('/extensions/chrome/import', (req: Request, res: Response) => {
    try {
      const profile = typeof req.body.profile === 'string' ? req.body.profile : 'Default';
      const importer = new ChromeExtensionImporter(profile);

      if (req.body.all === true) {
        const result = importer.importAll();
        res.json(result);
        return;
      }

      const extensionId = req.body.extensionId;
      if (!extensionId || typeof extensionId !== 'string') {
        res.status(400).json({ error: 'Missing "extensionId" or set "all: true" to import all' });
        return;
      }

      const result = importer.importExtension(extensionId.trim());
      if (!result.success && !result.skipped) {
        res.status(400).json(result);
        return;
      }
      res.json({
        imported: result.skipped ? 0 : 1,
        skipped: result.skipped ? 1 : 0,
        failed: 0,
        details: [result],
      });
    } catch (e) {
      log.error('Chrome extension import error:', e);
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // GET /extensions/gallery — Curated extension gallery with install status
  router.get('/extensions/gallery', (_req: Request, res: Response) => {
    try {
      const gallery = new GalleryLoader();

      // Build set of installed extension IDs (folder names on disk)
      const { available } = ctx.extensionManager.list();
      const installedIds = new Set(available.map(e => path.basename(e.path)));

      const category = typeof _req.query.category === 'string' ? _req.query.category : undefined;
      const featured = typeof _req.query.featured === 'string' ? _req.query.featured : undefined;

      const result = gallery.getGalleryResponse(installedIds, { category, featured });
      res.json(result);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // POST /extensions/log — Receive error logs from extension service workers.
  // Used by action-polyfill patches to surface SW errors to the Node.js console.
  router.post('/extensions/log', (req: Request, res: Response) => {
    try {
      const { source, error, msg, stack } = req.body as { source?: string; error?: string; msg?: string; stack?: string };
      const label = source ?? error ?? 'SW';
      const detail = msg ?? '(no message)';
      log.error(`[SW:${label}] ${detail}${stack ? `\n  ${stack}` : ''}`);
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // GET /extensions/active-tab — Active tab info for extension polyfill (tabs.query fallback).
  // Returns webContentsId as the Chrome tab id so that chrome.tabs.sendMessage() routes
  // correctly to the content script running in the active Tandem webview.
  // No auth required — called from extension service workers via polyfill fetch().
  router.get('/extensions/active-tab', (_req: Request, res: Response) => {
    try {
      const tab = ctx.tabManager.getActiveTab();
      if (!tab) {
        res.json({ tab: null });
        return;
      }
      // Chrome tab shape expected by 1Password: {id, url, title, active, windowId}
      res.json({
        tab: {
          id: tab.webContentsId,
          url: tab.url ?? '',
          title: tab.title ?? '',
          active: true,
          windowId: 1,
        },
      });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // GET /extensions/web-navigation/frames?tabId=123
  // Provides a Chrome-like webNavigation.getAllFrames() response for the active webview.
  router.get('/extensions/web-navigation/frames', (req: Request, res: Response) => {
    try {
      const rawTabId = typeof req.query.tabId === 'string' ? Number(req.query.tabId) : NaN;
      const activeTab = ctx.tabManager.getActiveTab();
      const tabId = Number.isFinite(rawTabId) ? rawTabId : activeTab?.webContentsId;
      if (!tabId) {
        res.json({ frames: [] });
        return;
      }

      res.json({ frames: getExtensionFramesForWebContents(tabId) });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // GET /extensions/web-navigation/frame?tabId=123&frameId=456
  // Provides a Chrome-like webNavigation.getFrame() response for a specific frame.
  router.get('/extensions/web-navigation/frame', (req: Request, res: Response) => {
    try {
      const rawTabId = typeof req.query.tabId === 'string' ? Number(req.query.tabId) : NaN;
      const rawFrameId = typeof req.query.frameId === 'string' ? Number(req.query.frameId) : NaN;
      if (!Number.isFinite(rawTabId) || !Number.isFinite(rawFrameId)) {
        res.status(400).json({ error: 'tabId and frameId are required numeric query params' });
        return;
      }

      const frame = getExtensionFramesForWebContents(rawTabId).find(entry => entry.frameId === rawFrameId) ?? null;
      res.json({ frame });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // GET /extensions/native-messaging/status — Native messaging host detection status
  router.get('/extensions/native-messaging/status', (_req: Request, res: Response) => {
    try {
      const status = ctx.extensionManager.getNativeMessagingStatus();
      res.json(status);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // POST /extensions/identity/auth — Handle chrome.identity.launchWebAuthFlow() from extensions
  // No auth token required — called by extension service workers via polyfill.
  // Accepts only from localhost (Express binds to 127.0.0.1).
  router.post('/extensions/identity/auth', async (req: Request, res: Response) => {
    try {
      const { url, interactive, extensionId } = req.body;
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'url is required' });
        return;
      }
      if (!extensionId || typeof extensionId !== 'string') {
        res.status(400).json({ error: 'extensionId is required' });
        return;
      }
      // Validate extensionId is actually installed
      const installed = ctx.extensionManager.getInstalledExtensions();
      const isInstalled = installed.some(ext => ext.id === extensionId);
      if (!isInstalled) {
        res.status(403).json({ error: `Extension ${extensionId} is not installed` });
        return;
      }
      const polyfill = ctx.extensionManager.getIdentityPolyfill();
      const result = await polyfill.handleLaunchWebAuthFlow({
        url,
        interactive: interactive !== false,
        extensionId,
      });
      res.json(result);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // GET /extensions/updates/check — Trigger manual update check for all installed extensions
  router.get('/extensions/updates/check', async (_req: Request, res: Response) => {
    try {
      const results = await ctx.extensionManager.checkForUpdates();
      const updatesAvailable = results.filter(r => r.updateAvailable);
      const state = ctx.extensionManager.getUpdateState();
      res.json({
        checked: results.length,
        updatesAvailable,
        results,
        lastCheck: state.lastCheckTimestamp,
      });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // GET /extensions/updates/status — Current update status without triggering a check
  router.get('/extensions/updates/status', (_req: Request, res: Response) => {
    try {
      const state = ctx.extensionManager.getUpdateState();
      const nextCheck = ctx.extensionManager.getNextScheduledCheck();

      // Build per-extension status from state
      const extensions: Record<string, { installedVersion: string; latestKnownVersion: string | null; updateAvailable: boolean }> = {};
      for (const [id, ext] of Object.entries(state.extensions)) {
        extensions[id] = {
          installedVersion: ext.installedVersion,
          latestKnownVersion: ext.latestKnownVersion,
          updateAvailable: ext.latestKnownVersion !== null && ext.latestKnownVersion !== ext.installedVersion,
        };
      }

      res.json({
        lastCheck: state.lastCheckTimestamp,
        nextScheduledCheck: nextCheck,
        checkIntervalMs: state.checkIntervalMs,
        extensions,
      });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // POST /extensions/updates/apply — Apply available updates
  router.post('/extensions/updates/apply', async (req: Request, res: Response) => {
    try {
      const ses = ctx.win.webContents.session;
      const { extensionId } = req.body;

      let results;
      if (extensionId && typeof extensionId === 'string') {
        // Update specific extension
        const result = await ctx.extensionManager.applyUpdate(extensionId.trim(), ses);
        results = [result];
      } else {
        // Update all
        results = await ctx.extensionManager.applyAllUpdates(ses);
      }

      // Notify renderer to refresh extension toolbar after updates
      if (results.some(r => r.success)) {
        ctx.win.webContents.send('extension-toolbar-refresh');
      }

      res.json({ results });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // GET /extensions/disk-usage — Per-extension disk usage
  router.get('/extensions/disk-usage', (_req: Request, res: Response) => {
    try {
      const usage = ctx.extensionManager.getDiskUsage();
      res.json(usage);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // GET /extensions/conflicts — All detected conflicts across installed extensions (Phase 10a)
  router.get('/extensions/conflicts', (_req: Request, res: Response) => {
    try {
      const { conflicts, summary } = ctx.extensionManager.getAllConflicts();
      res.json({ conflicts, summary });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
