import type { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { RouteContext} from '../context';
import { getActiveWC, getSessionWC, execInSessionTab, getSessionPartition, resolveRequestedTab } from '../context';
import { buildInteractionScope, resolveEffectiveTabTarget, sendRequestedTabNotFound } from '../interaction';
import { tandemDir } from '../../utils/paths';
import { wingmanAlert } from '../../notifications/alert';
import { humanizedClick, humanizedType } from '../../input/humanized';
import { captureNavigationState, hasObservablePageChange, readPageState } from '../../interaction/page-state';
import { handleRouteError } from '../../utils/errors';
import { DEFAULT_TIMEOUT_MS } from '../../utils/constants';
import { resolvePathInAllowedRoots } from '../../utils/security';
import { createRateLimitMiddleware } from '../rate-limit';
import { injectionScannerMiddleware } from '../middleware/injection-scanner';

/** Maximum allowed code length for JS execution endpoints (1 MB) */
const MAX_CODE_LENGTH = 1_048_576;

function buildPageContentScript(settleMs: number, maxWait: number, targetLength: number): string {
  return `
    new Promise((resolve) => {
      const extract = () => {
        const title = document.title;
        const url = window.location.href;
        const meta = document.querySelector('meta[name="description"]');
        const description = meta ? meta.getAttribute('content') : '';
        const text = document.body.innerText.replace(/\\n{3,}/g, '\\n\\n').trim();
        return { title, url, description, text, length: text.length };
      };

      const deadline = Date.now() + ${maxWait};
      let timer = null;
      let observer = null;

      const cleanupAndResolve = () => {
        if (timer) clearTimeout(timer);
        if (observer) observer.disconnect();
        resolve(extract());
      };

      const quick = extract();
      if (quick.length > ${targetLength}) {
        resolve(quick);
        return;
      }

      const onSettle = () => {
        const current = extract();
        if (current.length < ${targetLength} && Date.now() < deadline) {
          timer = setTimeout(onSettle, 500);
        } else {
          cleanupAndResolve();
        }
      };

      const onMutation = () => {
        if (Date.now() >= deadline) {
          cleanupAndResolve();
          return;
        }
        if (timer) clearTimeout(timer);
        timer = setTimeout(onSettle, ${settleMs});
      };

      observer = new MutationObserver(onMutation);

      observer.observe(document.body, {
        childList: true, subtree: true,
        characterData: true, attributes: false
      });

      timer = setTimeout(onSettle, ${settleMs});
      setTimeout(cleanupAndResolve, ${maxWait});
    })
  `;
}

/**
 * Register core browser action routes (navigate, click, type, scroll, key press, screenshots, etc.).
 * @param router - Express router to attach routes to
 * @param ctx - shared manager registry and main BrowserWindow
 */
export function registerBrowserRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // NAVIGATE
  // ═══════════════════════════════════════════════

  router.post('/navigate', async (req: Request, res: Response) => {
    const { url, tabId } = req.body;
    if (!url) { res.status(400).json({ error: 'url required' }); return; }
    try {
      const sessionName = req.headers['x-session'] as string;
      if (sessionName && sessionName !== 'default') {
        // Session-aware navigate: find or create tab for this session
        const partition = getSessionPartition(ctx, req);
        const sessionTabs = ctx.tabManager.listTabs().filter(t => t.partition === partition);
        if (sessionTabs.length === 0) {
          // No tab for this session — create one
          const tab = await ctx.tabManager.openTab(url, undefined, 'wingman', partition);
          ctx.panelManager.logActivity('navigate', { url, source: 'wingman', session: sessionName });
          res.json({ ok: true, url, tab: tab.id });
          return;
        }
        // Focus existing session tab
        await ctx.tabManager.focusTab(sessionTabs[0].id);
      } else if (tabId) {
        // If tabId specified, focus that tab first
        await ctx.tabManager.focusTab(tabId);
      }
      const wc = await getActiveWC(ctx);
      if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }
      void wc.loadURL(url);
      // Mark tab as wingman-controlled when navigated via API
      const activeTab = ctx.tabManager.getActiveTab();
      if (activeTab) {
        ctx.tabManager.setTabSource(activeTab.id, 'wingman');
      }
      ctx.panelManager.logActivity('navigate', { url, source: 'wingman' });
      res.json({ ok: true, url });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // PAGE CONTENT
  // ═══════════════════════════════════════════════

  router.get('/page-content', injectionScannerMiddleware, async (req: Request, res: Response) => {
    try {
      const settleMs = parseInt(req.query.settle as string) || 800;
      const maxWait = parseInt(req.query.timeout as string) || 10000;
      const targetLength = parseInt(req.query.minLength as string) || 1000;
      const requestedTab = resolveRequestedTab(ctx, req);
      if (requestedTab.requestedTabId && !requestedTab.tab) {
        sendRequestedTabNotFound(res, requestedTab.requestedTabId);
        return;
      }

      const script = buildPageContentScript(settleMs, maxWait, targetLength);
      const content = requestedTab.tab
        ? await ctx.devToolsManager.evaluateInTab(requestedTab.tab.webContentsId, script)
        : await execInSessionTab(ctx, req, script);
      res.json(content);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/page-html', injectionScannerMiddleware, async (req: Request, res: Response) => {
    try {
      const requestedTab = resolveRequestedTab(ctx, req);
      if (requestedTab.requestedTabId && !requestedTab.tab) {
        sendRequestedTabNotFound(res, requestedTab.requestedTabId);
        return;
      }

      const html = requestedTab.tab
        ? await ctx.devToolsManager.evaluateInTab(requestedTab.tab.webContentsId, 'document.documentElement.outerHTML')
        : await execInSessionTab(ctx, req, 'document.documentElement.outerHTML');
      res.type('html').send(html);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // CLICK — via sendInputEvent (Event.isTrusted = true)
  // ═══════════════════════════════════════════════

  router.post('/click', async (req: Request, res: Response) => {
    const {
      selector,
      confirm,
      waitForNavigation,
      navigationTimeoutMs,
      confirmTimeoutMs,
    } = req.body ?? {};
    if (!selector) { res.status(400).json({ error: 'selector required' }); return; }
    try {
      const target = resolveEffectiveTabTarget(ctx, req);
      if (target.requestedTabId && !target.tab) {
        sendRequestedTabNotFound(res, target.requestedTabId);
        return;
      }
      const wc = target.tab ? ctx.tabManager.getWebContents(target.tab.id) : null;
      if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }
      const result = await humanizedClick(wc, selector, {
        confirm,
        waitForNavigation,
        timeoutMs: navigationTimeoutMs,
        confirmTimeoutMs,
      });
      ctx.panelManager.logActivity('click', { selector });
      if (!result.ok) {
        res.status(404).json({
          ok: false,
          action: 'click',
          scope: buildInteractionScope(target),
          target: {
            kind: 'selector',
            selector,
            resolved: false,
          },
          completion: result.completion,
          error: result.error,
        });
        return;
      }
      res.json({
        ok: true,
        action: 'click',
        scope: buildInteractionScope(target),
        target: {
          kind: 'selector',
          selector,
          resolved: true,
          tagName: result.target.tagName,
          text: result.target.text,
        },
        completion: result.completion,
        postAction: result.postAction,
      });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // TYPE — via sendInputEvent char-by-char (Event.isTrusted = true)
  // ═══════════════════════════════════════════════

  router.post('/type', async (req: Request, res: Response) => {
    const { selector, text, clear, confirm, confirmTimeoutMs } = req.body ?? {};
    if (!selector || text === undefined) {
      res.status(400).json({ error: 'selector and text required' });
      return;
    }
    try {
      const target = resolveEffectiveTabTarget(ctx, req);
      if (target.requestedTabId && !target.tab) {
        sendRequestedTabNotFound(res, target.requestedTabId);
        return;
      }
      const wc = target.tab ? ctx.tabManager.getWebContents(target.tab.id) : null;
      if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }
      const result = await humanizedType(wc, selector, text, !!clear, {
        confirm,
        confirmTimeoutMs,
      });
      ctx.panelManager.logActivity('input', { selector, textLength: text.length });
      if (!result.ok) {
        res.status(404).json({
          ok: false,
          action: 'type',
          scope: buildInteractionScope(target),
          target: {
            kind: 'selector',
            selector,
            resolved: false,
          },
          completion: result.completion,
          error: result.error,
        });
        return;
      }
      res.json({
        ok: true,
        action: 'type',
        scope: buildInteractionScope(target),
        target: {
          kind: 'selector',
          selector,
          resolved: true,
          tagName: result.target.tagName,
          text: result.target.text,
          clearRequested: !!clear,
        },
        requestedValue: text,
        completion: result.completion,
        postAction: result.postAction,
      });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // EXECUTE JS
  // ═══════════════════════════════════════════════

  router.post('/execute-js', injectionScannerMiddleware, async (req: Request, res: Response) => {
    const script = req.body.code || req.body.script;
    if (!script) { res.status(400).json({ error: 'code or script required' }); return; }
    if (script.length > MAX_CODE_LENGTH) {
      res.status(413).json({ error: 'Code too large (max 1MB)' });
      return;
    }
    try {
      const requestedTab = resolveRequestedTab(ctx, req, { allowBody: true });
      if (requestedTab.requestedTabId && !requestedTab.tab) {
        sendRequestedTabNotFound(res, requestedTab.requestedTabId);
        return;
      }

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Execution timed out')), DEFAULT_TIMEOUT_MS)
      );
      const result = await Promise.race([
        requestedTab.tab
          ? ctx.devToolsManager.evaluateInTab(requestedTab.tab.webContentsId, script)
          : (async () => {
              const wc = await getActiveWC(ctx);
              if (!wc) {
                throw new Error('No active tab');
              }
              return wc.executeJavaScript(script);
            })(),
        timeout,
      ]);
      res.json({ ok: true, result });
    } catch (e) {
      if (e instanceof Error && e.message === 'Execution timed out') {
        res.status(408).json({ error: `Execution timed out after ${DEFAULT_TIMEOUT_MS / 1000}s` });
        return;
      }
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // SCREENSHOT — via capturePage (main process, not in webview)
  // ═══════════════════════════════════════════════

  router.get('/screenshot', createRateLimitMiddleware({
    bucket: 'browser-screenshot',
    windowMs: 60_000,
    max: 30,
    message: 'Too many screenshot requests. Retry shortly.',
  }), async (req: Request, res: Response) => {
    try {
      const wc = await getSessionWC(ctx, req);
      if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }
      const image = await wc.capturePage();
      const png = image.toPNG();

      if (req.query.save) {
        const allowedDirs = [
          path.join(os.homedir(), 'Desktop'),
          path.join(os.homedir(), 'Downloads'),
          tandemDir(),
        ];
        const rawSavePath = typeof req.query.save === 'string' ? req.query.save : '';
        const filePath = resolvePathInAllowedRoots(rawSavePath, allowedDirs);

        fs.writeFileSync(filePath, png);
        res.json({ ok: true, path: filePath, size: png.length });
      } else {
        res.type('png').send(png);
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'Path is outside the allowed directories') {
        res.status(400).json({ error: 'Save path must be in ~/Desktop, ~/Downloads, or ~/.tandem' });
        return;
      }
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // COOKIES
  // ═══════════════════════════════════════════════

  router.get('/cookies', async (req: Request, res: Response) => {
    try {
      const url = req.query.url as string || '';
      const cookies = await ctx.win.webContents.session.cookies.get(
        url ? { url } : {}
      );
      res.json({ cookies });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/cookies/clear', async (req: Request, res: Response) => {
    try {
      const { domain } = req.body;
      if (!domain) { res.status(400).json({ error: 'domain required' }); return; }
      const allCookies = await ctx.win.webContents.session.cookies.get({});
      const matching = allCookies.filter(c => (c.domain || '').includes(domain));
      let removed = 0;
      for (const c of matching) {
        const protocol = c.secure ? 'https' : 'http';
        const cookieUrl = `${protocol}://${(c.domain || '').replace(/^\./, '')}${c.path}`;
        await ctx.win.webContents.session.cookies.remove(cookieUrl, c.name);
        removed++;
      }
      res.json({ ok: true, removed, domain });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // SCROLL — via sendInputEvent (mouseWheel)
  // ═══════════════════════════════════════════════

  router.post('/scroll', async (req: Request, res: Response) => {
    const { direction = 'down', amount = 500, target, selector } = req.body;
    try {
      const wc = await getSessionWC(ctx, req);
      if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }

      // Smart scroll: target="top"|"bottom", selector=CSS selector, or classic deltaY
      if (target === 'top') {
        await wc.executeJavaScript('window.scrollTo({ top: 0, behavior: "smooth" })');
      } else if (target === 'bottom') {
        await wc.executeJavaScript('window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })');
      } else if (selector) {
        const scrolled = await wc.executeJavaScript(`
          (() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); return true; }
            return false;
          })()
        `);
        if (!scrolled) {
          res.status(404).json({ error: 'Selector not found', selector });
          return;
        }
      } else {
        const deltaY = direction === 'up' ? -amount : amount;
        wc.sendInputEvent({
          type: 'mouseWheel',
          x: 400,
          y: 400,
          deltaX: 0,
          deltaY,
        });
      }

      // Always return scroll position info
      const scrollInfo = await wc.executeJavaScript(`
        JSON.stringify({
          scrollTop: Math.round(document.documentElement.scrollTop),
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight,
          atTop: document.documentElement.scrollTop <= 0,
          atBottom: Math.ceil(document.documentElement.scrollTop + document.documentElement.clientHeight) >= document.documentElement.scrollHeight
        })
      `);
      const scroll = JSON.parse(scrollInfo);

      ctx.panelManager.logActivity('scroll', { direction, amount, target, selector });
      ctx.behaviorObserver.recordScroll(target === 'up' ? -amount : amount);
      res.json({ ok: true, scroll });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // PRESS KEY — via sendInputEvent (keyDown/char/keyUp)
  // ═══════════════════════════════════════════════

  /** Map common key name aliases to Electron's expected key strings */
  function normalizeKeyName(key: string): string {
    const map: Record<string, string> = {
      'enter': 'Return',
      'return': 'Return',
      'esc': 'Escape',
      'escape': 'Escape',
      'pagedown': 'PageDown',
      'pageup': 'PageUp',
      'arrowup': 'Up',
      'arrowdown': 'Down',
      'arrowleft': 'Left',
      'arrowright': 'Right',
      'backspace': 'Backspace',
      'delete': 'Delete',
      'tab': 'Tab',
      'home': 'Home',
      'end': 'End',
      'space': ' ',
      'insert': 'Insert',
    };
    return map[key.toLowerCase()] || key;
  }

  /** Check if a key produces a printable character */
  function isPrintableKey(key: string): boolean {
    // Single characters are printable (letters, digits, punctuation)
    if (key.length === 1) return true;
    // Space
    if (key === ' ') return true;
    return false;
  }

  router.post('/press-key', async (req: Request, res: Response) => {
    const { key, modifiers = [], waitForNavigation, navigationTimeoutMs } = req.body ?? {};
    if (!key) { res.status(400).json({ error: 'key required' }); return; }
    try {
      const target = resolveEffectiveTabTarget(ctx, req);
      if (target.requestedTabId && !target.tab) {
        sendRequestedTabNotFound(res, target.requestedTabId);
        return;
      }
      const wc = target.tab ? ctx.tabManager.getWebContents(target.tab.id) : null;
      if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }

      const normalizedKey = normalizeKeyName(key);
      const mods = (modifiers as string[]).map((m: string) => m.toLowerCase()) as Electron.InputEvent['modifiers'];
      const beforePage = await readPageState(wc);

      // keyDown
      wc.sendInputEvent({ type: 'keyDown', keyCode: normalizedKey, modifiers: mods });

      // For printable characters without modifiers (or with shift only), send a char event
      if (isPrintableKey(normalizedKey) && modifiers.every((m: string) => m.toLowerCase() === 'shift')) {
        wc.sendInputEvent({ type: 'char', keyCode: normalizedKey, modifiers: mods });
      }

      // keyUp
      wc.sendInputEvent({ type: 'keyUp', keyCode: normalizedKey, modifiers: mods });

      const navigation = await captureNavigationState(wc, beforePage.url, {
        waitForNavigation,
        timeoutMs: navigationTimeoutMs,
      });
      const page = await readPageState(wc);
      const effectConfirmed = hasObservablePageChange(beforePage, page, navigation);

      ctx.panelManager.logActivity('press-key', { key: normalizedKey, modifiers });
      res.json({
        ok: true,
        action: 'press-key',
        scope: buildInteractionScope(target),
        target: {
          kind: 'keyboard',
          key: normalizedKey,
          modifiers,
          resolved: true,
        },
        completion: {
          dispatchCompleted: true,
          effectConfirmed,
          mode: effectConfirmed ? 'confirmed' : 'dispatched',
          caveat: effectConfirmed ? undefined : 'Key dispatch finished, but no immediate active-element, value, or navigation change was observable.',
        },
        postAction: {
          page,
          navigation,
        },
      });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // PRESS KEY COMBO — multiple keys in sequence
  // ═══════════════════════════════════════════════

  router.post('/press-key-combo', async (req: Request, res: Response) => {
    const { keys, waitForNavigation, navigationTimeoutMs } = req.body ?? {};
    if (!Array.isArray(keys) || keys.length === 0) {
      res.status(400).json({ error: 'keys array required' });
      return;
    }
    try {
      const target = resolveEffectiveTabTarget(ctx, req);
      if (target.requestedTabId && !target.tab) {
        sendRequestedTabNotFound(res, target.requestedTabId);
        return;
      }
      const wc = target.tab ? ctx.tabManager.getWebContents(target.tab.id) : null;
      if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }
      const beforePage = await readPageState(wc);

      const pressedKeys: string[] = [];
      for (const key of keys) {
        const normalizedKey = normalizeKeyName(key);
        wc.sendInputEvent({ type: 'keyDown', keyCode: normalizedKey });
        if (isPrintableKey(normalizedKey)) {
          wc.sendInputEvent({ type: 'char', keyCode: normalizedKey });
        }
        wc.sendInputEvent({ type: 'keyUp', keyCode: normalizedKey });
        pressedKeys.push(normalizedKey);
        // Small delay between key presses
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const navigation = await captureNavigationState(wc, beforePage.url, {
        waitForNavigation,
        timeoutMs: navigationTimeoutMs,
      });
      const page = await readPageState(wc);
      const effectConfirmed = hasObservablePageChange(beforePage, page, navigation);

      ctx.panelManager.logActivity('press-key-combo', { keys: pressedKeys });
      res.json({
        ok: true,
        action: 'press-key-combo',
        scope: buildInteractionScope(target),
        target: {
          kind: 'keyboard-sequence',
          keys: pressedKeys,
          resolved: true,
        },
        completion: {
          dispatchCompleted: true,
          effectConfirmed,
          mode: effectConfirmed ? 'confirmed' : 'dispatched',
          caveat: effectConfirmed ? undefined : 'Key sequence dispatch finished, but no immediate active-element, value, or navigation change was observable.',
        },
        postAction: {
          page,
          navigation,
        },
      });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // WINGMAN ALERT
  // ═══════════════════════════════════════════════

  router.post('/wingman-alert', (req: Request, res: Response) => {
    const { title = 'Need help', body = '', workspaceId } = req.body;
    if (workspaceId !== undefined && typeof workspaceId !== 'string') {
      res.status(400).json({ error: 'workspaceId must be a workspace ID string' });
      return;
    }
    try {
      if (workspaceId) {
        ctx.workspaceManager.switch(workspaceId);
      }
      wingmanAlert(title, body);
      res.json({ ok: true, sent: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // WAIT
  // ═══════════════════════════════════════════════

  router.post('/wait', async (req: Request, res: Response) => {
    const { selector, timeout = 10000 } = req.body;
    try {
      const target = resolveEffectiveTabTarget(ctx, req);
      if (target.requestedTabId && !target.tab) {
        sendRequestedTabNotFound(res, target.requestedTabId);
        return;
      }

      const code = selector ? `
        new Promise((res, rej) => {
          const check = () => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (el) return res({ ok: true, found: true });
            setTimeout(check, 200);
          };
          check();
          setTimeout(() => res({ ok: true, found: false, timeout: true }), ${JSON.stringify(timeout)});
        })
      ` : `
        new Promise(res => {
          if (document.readyState === 'complete') return res({ ok: true, ready: true });
          window.addEventListener('load', () => res({ ok: true, ready: true }));
          setTimeout(() => res({ ok: true, ready: false, timeout: true }), ${timeout});
        })
      `;
      const result = target.tab
        ? await ctx.devToolsManager.evaluateInTab(target.tab.webContentsId, code)
        : await (async () => {
            const wc = await getActiveWC(ctx);
            if (!wc) throw new Error('No active tab');
            return wc.executeJavaScript(code);
          })();
      res.json({ scope: buildInteractionScope(target), ...result });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // LINKS
  // ═══════════════════════════════════════════════

  router.get('/links', async (req: Request, res: Response) => {
    try {
      const requestedTab = resolveRequestedTab(ctx, req);
      if (requestedTab.requestedTabId && !requestedTab.tab) {
        sendRequestedTabNotFound(res, requestedTab.requestedTabId);
        return;
      }

      const script = `
        Array.from(document.querySelectorAll('a[href]')).map(a => ({
          text: a.textContent?.trim().substring(0, 100),
          href: a.href,
          visible: a.offsetParent !== null
        })).filter(l => l.href && !l.href.startsWith('javascript:'))
      `;
      const links = requestedTab.tab
        ? await ctx.devToolsManager.evaluateInTab(requestedTab.tab.webContentsId, script)
        : await (async () => {
            const wc = await getActiveWC(ctx);
            if (!wc) throw new Error('No active tab');
            return wc.executeJavaScript(script);
          })();
      res.json({ links });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // FORMS
  // ═══════════════════════════════════════════════

  router.get('/forms', async (req: Request, res: Response) => {
    try {
      const requestedTab = resolveRequestedTab(ctx, req);
      if (requestedTab.requestedTabId && !requestedTab.tab) {
        sendRequestedTabNotFound(res, requestedTab.requestedTabId);
        return;
      }

      const script = `
        Array.from(document.querySelectorAll('form')).map((form, i) => ({
          index: i,
          action: form.action,
          method: form.method,
          fields: Array.from(form.querySelectorAll('input, textarea, select')).map(f => ({
            tag: f.tagName.toLowerCase(),
            type: f.type || '',
            name: f.name || '',
            id: f.id || '',
            placeholder: f.placeholder || '',
            value: f.value || ''
          }))
        }))
      `;
      const forms = requestedTab.tab
        ? await ctx.devToolsManager.evaluateInTab(requestedTab.tab.webContentsId, script)
        : await (async () => {
            const wc = await getActiveWC(ctx);
            if (!wc) throw new Error('No active tab');
            return wc.executeJavaScript(script);
          })();
      res.json({ forms });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
