/**
 * Preview Routes — Live HTML previews built by OpenClaw agents
 *
 * Previews are persisted to ~/.tandem/previews/<id>.json so they survive
 * Tandem restarts and can be bookmarked as stable URLs.
 *
 * Endpoints:
 *   POST   /preview              — create a new preview (opens in new tab)
 *   PUT    /preview/:id          — update existing preview (live refresh)
 *   GET    /preview/:id          — serve the preview page
 *   GET    /preview/:id/meta     — metadata only (no HTML body)
 *   GET    /previews             — list all saved previews
 *   DELETE /preview/:id          — delete a preview
 */

import type { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { tandemDir } from '../../utils/paths';
import { handleRouteError } from '../../utils/errors';
import { assertSinglePathSegment, escapeHtml, resolvePathWithinRoot } from '../../utils/security';
import type { RouteContext } from '../context';
import { createLogger } from '../../utils/logger';

const log = createLogger('PreviewRoutes');

// ─── Helpers ────────────────────────────────────────────────────────────────

function previewsDir(): string {
  const dir = path.join(tandemDir(), 'previews');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function previewPath(id: string): string {
  return resolvePathWithinRoot(previewsDir(), `${id}.json`);
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60) || 'preview';
}

function uniqueSlug(base: string): string {
  const dir = previewsDir();
  let slug = base;
  let i = 2;
  while (fs.existsSync(path.join(dir, `${slug}.json`))) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

interface PreviewMeta {
  id: string;
  title: string;
  inspiration?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

interface PreviewFile extends PreviewMeta {
  html: string;
}

function readPreview(id: string): PreviewFile | null {
  const p = previewPath(id);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as PreviewFile;
  } catch {
    return null;
  }
}

function writePreview(preview: PreviewFile): void {
  fs.writeFileSync(previewPath(preview.id), JSON.stringify(preview, null, 2), 'utf-8');
}

function listPreviews(): PreviewMeta[] {
  const dir = previewsDir();
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as PreviewFile;
        const { html: _html, ...meta } = raw;
        return meta;
      } catch {
        return null;
      }
    })
    .filter((m): m is PreviewMeta => m !== null)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Inject a live-reload script into the HTML so the browser polls for updates.
 * The script checks /preview/:id/meta every 2 seconds and reloads if version changed.
 */
function injectLiveReload(html: string, id: string, version: number): string {
  const script = `
<script>
(function() {
  var _version = ${version};
  var _id = ${JSON.stringify(id)};
  setInterval(function() {
    fetch('/preview/' + _id + '/meta')
      .then(function(r) { return r.json(); })
      .then(function(m) { if (m.version !== _version) location.reload(); })
      .catch(function() {});
  }, 2000);
})();
</script>`;

  // Inject before </body> if present, otherwise append
  if (html.includes('</body>')) {
    return html.replace('</body>', script + '\n</body>');
  }
  return html + '\n' + script;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * Register headless preview CRUD and content routes.
 * @param router - Express router to attach routes to
 * @param ctx - shared manager registry and main BrowserWindow
 */
/** Derive base URL from the incoming request's Host header. */
function getBaseUrl(req: Request): string {
  const host = req.headers.host ?? 'localhost:8765';
  return `http://${host}`;
}

export function registerPreviewRoutes(router: Router, ctx: RouteContext): void {

  // List all previews
  router.get('/previews', (_req: Request, res: Response) => {
    try {
      res.json({ previews: listPreviews() });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // Create a new preview
  router.post('/preview', async (req: Request, res: Response) => {
    try {
      const { html, title, inspiration, openTab } = req.body as {
        html: string;
        title?: string;
        inspiration?: string;
        openTab?: boolean;
      };

      if (!html || typeof html !== 'string') {
        res.status(400).json({ error: 'html is required' });
        return;
      }

      const base = slugify(title || 'preview');
      const id = uniqueSlug(base);
      const now = new Date().toISOString();

      const preview: PreviewFile = {
        id,
        title: title || 'Untitled Preview',
        inspiration,
        html,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };

      writePreview(preview);
      log.info(`Preview created: ${id}`);

      const url = `${getBaseUrl(req)}/preview/${id}`;

      // Open in a new tab by default (openTab defaults to true)
      if (openTab !== false) {
        const newTab = await ctx.tabManager.openTab(url, undefined, 'wingman', 'persist:tandem', true);
        // Explicit focus to ensure the tab comes to the front
        if (newTab) {
          setTimeout(() => ctx.tabManager.focusTab(newTab.id), 150);
        }
      }

      res.json({ ok: true, id, url, title: preview.title });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // Update an existing preview (triggers live reload in the browser)
  router.put('/preview/:id', (req: Request, res: Response) => {
    try {
      const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = assertSinglePathSegment(rawId, 'preview ID');
      const existing = readPreview(id);
      if (!existing) {
        res.status(404).json({ error: `Preview '${id}' not found` });
        return;
      }

      const { html, title, inspiration } = req.body as {
        html?: string;
        title?: string;
        inspiration?: string;
      };

      const updated: PreviewFile = {
        ...existing,
        html: html ?? existing.html,
        title: title ?? existing.title,
        inspiration: inspiration ?? existing.inspiration,
        updatedAt: new Date().toISOString(),
        version: existing.version + 1,
      };

      writePreview(updated);
      log.info(`Preview updated: ${id} (v${updated.version})`);

      res.json({ ok: true, id, version: updated.version, url: `${getBaseUrl(req)}/preview/${id}` });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // Serve preview metadata (used by live reload polling)
  router.get('/preview/:id/meta', (req: Request, res: Response) => {
    try {
      const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = assertSinglePathSegment(rawId, 'preview ID');
      const preview = readPreview(id);
      if (!preview) {
        res.status(404).json({ error: `Preview '${id}' not found` });
        return;
      }
      const { html: _html, ...meta } = preview;
      res.json(meta);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // Serve the preview HTML page
  router.get('/preview/:id', (req: Request, res: Response) => {
    try {
      const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = assertSinglePathSegment(rawId, 'preview ID');
      const preview = readPreview(id);
      if (!preview) {
        res.status(404).send(`<!DOCTYPE html><html><body>
          <h1>Preview not found</h1>
          <p>No preview with id <code>${escapeHtml(id)}</code> exists.</p>
          <p><a href="/previews">View all previews</a></p>
        </body></html>`);
        return;
      }

      const html = injectLiveReload(preview.html, preview.id, preview.version);
      res.type('html').send(html);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // Delete a preview
  router.delete('/preview/:id', (req: Request, res: Response) => {
    try {
      const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = assertSinglePathSegment(rawId, 'preview ID');
      const p = previewPath(id);
      if (!fs.existsSync(p)) {
        res.status(404).json({ error: `Preview '${id}' not found` });
        return;
      }
      fs.unlinkSync(p);
      log.info(`Preview deleted: ${id}`);
      res.json({ ok: true, id });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // List previews as a browsable HTML page (for convenience)
  router.get('/previews/index', (_req: Request, res: Response) => {
    try {
      const previews = listPreviews();
      const rows = previews.map(p => `
        <tr>
          <td><a href="/preview/${p.id}">${p.title}</a></td>
          <td><code>${p.id}</code></td>
          <td>${new Date(p.updatedAt).toLocaleString()}</td>
          <td>v${p.version}</td>
          ${p.inspiration ? `<td><a href="${p.inspiration}" target="_blank">source</a></td>` : '<td>—</td>'}
        </tr>`).join('');

      res.type('html').send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tandem Previews</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; background: #0f0f0f; color: #eee; }
    h1 { margin-bottom: 1.5rem; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; padding: 0.5rem 1rem; border-bottom: 1px solid #333; }
    th { color: #888; font-size: 0.85rem; text-transform: uppercase; }
    a { color: #4ecca3; }
    code { background: #1a1a1a; padding: 2px 6px; border-radius: 4px; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>Tandem Previews</h1>
  ${previews.length === 0 ? '<p>No previews yet.</p>' : `
  <table>
    <thead><tr><th>Title</th><th>ID</th><th>Last updated</th><th>Version</th><th>Inspiration</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`}
</body>
</html>`);
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
