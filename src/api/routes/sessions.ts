import type { Router, Request, Response } from 'express';
import type { RouteContext} from '../context';
import { getSessionPartition, getSessionWC } from '../context';
import { handleRouteError } from '../../utils/errors';

const SESSION_FETCH_TIMEOUT_MS = 15000;
const SESSION_FETCH_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const FORBIDDEN_SESSION_FETCH_HEADERS = new Set([
  'authorization',
  'cookie',
  'host',
  'origin',
  'referer',
]);

export function registerSessionRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // DEVICE EMULATION
  // ═══════════════════════════════════════════════

  router.get('/device/profiles', (_req: Request, res: Response) => {
    res.json({ profiles: ctx.deviceEmulator.getProfiles() });
  });

  router.get('/device/status', (_req: Request, res: Response) => {
    res.json(ctx.deviceEmulator.getStatus());
  });

  router.post('/device/emulate', async (req: Request, res: Response) => {
    try {
      const wc = await getSessionWC(ctx, req);
      if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }

      const { device, width, height, deviceScaleFactor, mobile, userAgent } = req.body;

      if (device) {
        const profile = await ctx.deviceEmulator.emulateDevice(wc, device);
        res.json({ ok: true, profile });
      } else if (width && height) {
        await ctx.deviceEmulator.emulateCustom(wc, {
          width: Number(width),
          height: Number(height),
          deviceScaleFactor: deviceScaleFactor ? Number(deviceScaleFactor) : undefined,
          mobile: Boolean(mobile),
          userAgent,
        });
        res.json({ ok: true });
      } else {
        res.status(400).json({ error: '"device" or "width"+"height" required' });
      }
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/device/reset', async (req: Request, res: Response) => {
    try {
      const wc = await getSessionWC(ctx, req);
      if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }
      await ctx.deviceEmulator.reset(wc);
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // SESSIONS — Geïsoleerde Browser Sessies
  // ═══════════════════════════════════════════════

  router.get('/sessions/list', async (_req: Request, res: Response) => {
    try {
      const sessions = ctx.sessionManager.list().map(s => ({
        ...s,
        tabs: ctx.tabManager.listTabs().filter(t => t.partition === s.partition).length,
      }));
      res.json({ ok: true, sessions, active: ctx.sessionManager.getActive() });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/sessions/create', async (req: Request, res: Response) => {
    const { name, url } = req.body;
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    try {
      const sess = ctx.sessionManager.create(name);
      let tab = null;
      if (url) {
        tab = await ctx.tabManager.openTab(url, undefined, 'wingman', sess.partition);
      }
      res.json({ ok: true, name: sess.name, partition: sess.partition, tab: tab || undefined });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post('/sessions/switch', async (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    try {
      ctx.sessionManager.setActive(name);
      res.json({ ok: true, active: name });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post('/sessions/destroy', async (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    try {
      const sess = ctx.sessionManager.get(name);
      if (!sess) { res.status(404).json({ error: `Session '${name}' does not exist` }); return; }
      // Close all tabs belonging to this session
      const tabsToClose = ctx.tabManager.listTabs().filter(t => t.partition === sess.partition);
      for (const tab of tabsToClose) {
        await ctx.tabManager.closeTab(tab.id);
      }
      ctx.sessionManager.destroy(name);
      res.json({ ok: true, name });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post('/sessions/state/save', async (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    try {
      const partition = getSessionPartition(ctx, req);
      const filePath = await ctx.stateManager.save(name, partition);
      res.json({ ok: true, path: filePath });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/sessions/state/load', async (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    try {
      const partition = getSessionPartition(ctx, req);
      const result = await ctx.stateManager.load(name, partition);
      res.json({ ok: true, cookiesRestored: result.cookiesRestored });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/sessions/state/list', async (_req: Request, res: Response) => {
    try {
      const states = ctx.stateManager.list();
      res.json({ ok: true, states });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // SESSION FETCH RELAY
  // ═══════════════════════════════════════════════

  router.post('/sessions/fetch', async (req: Request, res: Response) => {
    try {
      const rawUrl = req.body?.url;
      if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        res.status(400).json({ error: 'url required' });
        return;
      }

      const method = typeof req.body?.method === 'string' ? req.body.method.toUpperCase() : 'GET';
      if (!SESSION_FETCH_METHODS.has(method)) {
        res.status(400).json({ error: `Unsupported method: ${method}` });
        return;
      }

      if ((method === 'GET' || method === 'HEAD') && req.body?.body !== undefined) {
        res.status(400).json({ error: `body is not allowed for ${method} requests` });
        return;
      }

      const rawHeaders = req.body?.headers;
      if (rawHeaders !== undefined && (typeof rawHeaders !== 'object' || rawHeaders === null || Array.isArray(rawHeaders))) {
        res.status(400).json({ error: 'headers must be an object' });
        return;
      }

      const normalizedHeaders: Record<string, string> = {};
      const headerNames = new Set<string>();

      if (rawHeaders) {
        for (const [key, value] of Object.entries(rawHeaders as Record<string, unknown>)) {
          const normalizedName = key.toLowerCase();
          if (
            FORBIDDEN_SESSION_FETCH_HEADERS.has(normalizedName) ||
            normalizedName.startsWith('sec-') ||
            normalizedName.startsWith('proxy-')
          ) {
            res.status(400).json({ error: `Header not allowed: ${key}` });
            return;
          }

          if (value === undefined || value === null) continue;
          if (typeof value === 'object') {
            res.status(400).json({ error: `Header value for ${key} must be a string, number, or boolean` });
            return;
          }

          normalizedHeaders[key] = String(value);
          headerNames.add(normalizedName);
        }
      }

      const requestedTabId = typeof req.body?.tabId === 'string'
        ? req.body.tabId
        : typeof req.query.tabId === 'string'
          ? req.query.tabId
          : undefined;

      const wc = requestedTabId ? ctx.tabManager.getWebContents(requestedTabId) : await getSessionWC(ctx, req);
      if (!wc) {
        res.status(500).json({ error: 'No active tab' });
        return;
      }

      const pageUrl = wc.getURL();
      let pageOrigin: string;
      let targetUrl: URL;

      try {
        const currentUrl = new URL(pageUrl);
        if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
          res.status(400).json({ error: 'Active tab must be on an http(s) page' });
          return;
        }

        pageOrigin = currentUrl.origin;
        targetUrl = new URL(rawUrl, currentUrl);
      } catch {
        res.status(400).json({ error: 'Invalid url or active tab URL' });
        return;
      }

      if (targetUrl.origin !== pageOrigin) {
        res.status(400).json({ error: 'Cross-origin fetch is not allowed; use the tab origin or a relative URL' });
        return;
      }

      let serializedBody: string | undefined;
      if (req.body?.body !== undefined) {
        serializedBody = typeof req.body.body === 'string'
          ? req.body.body
          : JSON.stringify(req.body.body);

        if (!headerNames.has('content-type')) {
          normalizedHeaders['content-type'] = 'application/json';
        }
      }

      const payload = JSON.stringify({
        url: targetUrl.toString(),
        method,
        headers: normalizedHeaders,
        body: serializedBody,
        timeoutMs: SESSION_FETCH_TIMEOUT_MS,
      });

      const result = await wc.executeJavaScript(`
        (async function() {
          const request = ${payload};
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), request.timeoutMs);

          try {
            const response = await window.fetch(request.url, {
              method: request.method,
              headers: request.headers,
              body: request.body,
              credentials: 'include',
              signal: controller.signal,
            });

            const headers = {};
            response.headers.forEach((value, key) => {
              headers[key] = value;
            });

            const contentType = response.headers.get('content-type') || '';
            const rawBody = await response.text();
            let responseType = 'text';
            let body = rawBody;

            if (contentType.toLowerCase().includes('application/json')) {
              if (rawBody.trim().length === 0) {
                responseType = 'json';
                body = null;
              } else {
                try {
                  body = JSON.parse(rawBody);
                  responseType = 'json';
                } catch {
                  body = rawBody;
                }
              }
            }

            return {
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
              url: response.url,
              headers,
              body,
              responseType,
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message === 'The user aborted a request.') {
              throw new Error('Fetch timed out');
            }
            throw new Error(message);
          } finally {
            clearTimeout(timer);
          }
        })()
      `, true);

      res.json({ ok: true, response: result });
    } catch (e) {
      if (e instanceof Error && e.message === 'Fetch timed out') {
        res.status(408).json({ error: `Fetch timed out after ${SESSION_FETCH_TIMEOUT_MS / 1000}s` });
        return;
      }
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // AUTH HEADERS — lees auth token uit actieve tab
  // ═══════════════════════════════════════════════

  router.get('/sessions/auth-headers', async (req: Request, res: Response) => {
    try {
      const wc = await getSessionWC(ctx, req);
      if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }

      // Methode 1: Discord webpack module registry
      const token: string | null = await wc.executeJavaScript(`
        (function() {
          try {
            if (typeof webpackChunkdiscord_app !== 'undefined') {
              var chunk = webpackChunkdiscord_app;
              var req = chunk.push([[Symbol()], {}, function(e) { return e; }]);
              chunk.pop();
              var found = null;
              Object.values(req.m).some(function(m) {
                try {
                  var mod = { exports: {} };
                  m(mod, mod.exports, req);
                  if (mod.exports && typeof mod.exports.getToken === 'function') {
                    var t = mod.exports.getToken();
                    if (typeof t === 'string' && t.split('.').length === 3) { found = t; return true; }
                  }
                  if (mod.exports && mod.exports.default && typeof mod.exports.default.getToken === 'function') {
                    var t2 = mod.exports.default.getToken();
                    if (typeof t2 === 'string' && t2.split('.').length === 3) { found = t2; return true; }
                  }
                } catch(e) {}
                return false;
              });
              if (found) return found;
            }
            // Methode 2: eerder gevangen via interceptor
            if (window.__capturedAuthToken) return window.__capturedAuthToken;
            return null;
          } catch(e) { return null; }
        })()
      `, true);

      if (token) {
        return res.json({ ok: true, authorization: token });
      }

      // Methode 3: installeer fetch-interceptor voor volgende API call
      await wc.executeJavaScript(`
        (function() {
          if (window.__authInterceptorActive) return;
          window.__authInterceptorActive = true;
          window.__capturedAuthToken = null;
          var _fetch = window.fetch;
          window.fetch = function(url, opts) {
            if (opts && opts.headers) {
              try {
                var auth = typeof opts.headers.get === 'function'
                  ? opts.headers.get('Authorization')
                  : (opts.headers['Authorization'] || opts.headers['authorization']);
                if (auth) window.__capturedAuthToken = auth;
              } catch(e) {}
            }
            return _fetch.apply(this, arguments);
          };
        })()
      `, true);

      res.json({
        ok: false,
        authorization: null,
        hint: 'Interceptor installed. Scroll the page to trigger an API call, then retry.'
      });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
