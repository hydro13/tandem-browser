import { Router, Request, Response } from 'express';
import path from 'path';
import os from 'os';
import { RouteContext, getActiveWC, execInActiveTab, getSessionWC, execInSessionTab, getSessionPartition } from '../context';
import { copilotAlert } from '../../notifications/alert';
import { humanizedClick, humanizedType } from '../../input/humanized';

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
          const tab = await ctx.tabManager.openTab(url, undefined, 'copilot', partition);
          ctx.panelManager.logActivity('navigate', { url, source: 'copilot', session: sessionName });
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
      wc.loadURL(url);
      // Mark tab as copilot-controlled when navigated via API
      const activeTab = ctx.tabManager.getActiveTab();
      if (activeTab) {
        ctx.tabManager.setTabSource(activeTab.id, 'copilot');
      }
      ctx.panelManager.logActivity('navigate', { url, source: 'copilot' });
      res.json({ ok: true, url });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // PAGE CONTENT
  // ═══════════════════════════════════════════════

  router.get('/page-content', async (req: Request, res: Response) => {
    try {
      const settleMs = parseInt(req.query.settle as string) || 800;
      const maxWait = parseInt(req.query.timeout as string) || 10000;
      const targetLength = parseInt(req.query.minLength as string) || 1000;

      const content = await execInSessionTab(ctx, req, `
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

          // Quick check: if content is already substantial, return immediately
          // But for SPA docs, we sometimes want to wait anyway if it's too short
          const quick = extract();
          if (quick.length > ${targetLength}) {
            resolve(quick);
            return;
          }

          // SPA wait: use MutationObserver to detect when DOM settles
          // Real sliding timeout: reset the settle timer on every mutation
          const onSettle = () => {
            // Wait period elapsed with no mutations
            const current = extract();
            // If we are settled but still suspiciously short, it might mean the
            // API fetch is still ongoing and hasn't mutated the DOM yet.
            // In this case, we extend the wait until the hard deadline.
            if (current.length < ${targetLength} && Date.now() < deadline) {
              // Check again in 500ms
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
            // Reset settle timer
            if (timer) clearTimeout(timer);
            timer = setTimeout(onSettle, ${settleMs});
          };

          observer = new MutationObserver(onMutation);

          observer.observe(document.body, {
            childList: true, subtree: true,
            characterData: true, attributes: false
          });

          // Start the initial settle timer (in case no mutations happen)
          timer = setTimeout(onSettle, ${settleMs});

          // Hard deadline safety
          setTimeout(cleanupAndResolve, ${maxWait});
        })
      `);
      res.json(content);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/page-html', async (_req: Request, res: Response) => {
    try {
      const html = await execInActiveTab(ctx, 'document.documentElement.outerHTML');
      res.type('html').send(html);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // CLICK — via sendInputEvent (Event.isTrusted = true)
  // ═══════════════════════════════════════════════

  router.post('/click', async (req: Request, res: Response) => {
    const { selector } = req.body;
    if (!selector) { res.status(400).json({ error: 'selector required' }); return; }
    try {
      const wc = await getSessionWC(ctx, req);
      if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }
      const result = await humanizedClick(wc, selector);
      ctx.panelManager.logActivity('click', { selector });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // TYPE — via sendInputEvent char-by-char (Event.isTrusted = true)
  // ═══════════════════════════════════════════════

  router.post('/type', async (req: Request, res: Response) => {
    const { selector, text, clear } = req.body;
    if (!selector || text === undefined) {
      res.status(400).json({ error: 'selector and text required' });
      return;
    }
    try {
      const wc = await getSessionWC(ctx, req);
      if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }
      const result = await humanizedType(wc, selector, text, !!clear);
      ctx.panelManager.logActivity('input', { selector, textLength: text.length });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // EXECUTE JS
  // ═══════════════════════════════════════════════

  router.post('/execute-js', async (req: Request, res: Response) => {
    const script = req.body.code || req.body.script;
    if (!script) { res.status(400).json({ error: 'code or script required' }); return; }
    try {
      const result = await execInActiveTab(ctx, script);
      res.json({ ok: true, result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // SCREENSHOT — via capturePage (main process, not in webview)
  // ═══════════════════════════════════════════════

  router.get('/screenshot', async (req: Request, res: Response) => {
    try {
      const wc = await getSessionWC(ctx, req);
      if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }
      const image = await wc.capturePage();
      const png = image.toPNG();

      if (req.query.save) {
        const fs = require('fs');
        const filePath = path.resolve(req.query.save as string);

        const allowedDirs = [
          path.join(os.homedir(), 'Desktop'),
          path.join(os.homedir(), 'Downloads'),
          path.join(os.homedir(), '.tandem'),
        ];
        const isAllowed = allowedDirs.some(dir => filePath.startsWith(dir + path.sep) || filePath === dir);

        if (!isAllowed) {
          res.status(400).json({ error: 'Save path must be in ~/Desktop, ~/Downloads, or ~/.tandem' });
          return;
        }

        fs.writeFileSync(filePath, png);
        res.json({ ok: true, path: filePath, size: png.length });
      } else {
        res.type('png').send(png);
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
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
    } catch (e: any) {
      res.status(500).json({ error: e.message });
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
    } catch (e: any) {
      res.status(500).json({ error: e.message });
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
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // COPILOT ALERT
  // ═══════════════════════════════════════════════

  router.post('/copilot-alert', (req: Request, res: Response) => {
    const { title = 'Hulp nodig', body = '' } = req.body;
    copilotAlert(title, body);
    res.json({ ok: true, sent: true });
  });

  // ═══════════════════════════════════════════════
  // WAIT
  // ═══════════════════════════════════════════════

  router.post('/wait', async (req: Request, res: Response) => {
    const { selector, timeout = 10000 } = req.body;
    try {
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
      const result = await execInActiveTab(ctx, code);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // LINKS
  // ═══════════════════════════════════════════════

  router.get('/links', async (_req: Request, res: Response) => {
    try {
      const links = await execInActiveTab(ctx, `
        Array.from(document.querySelectorAll('a[href]')).map(a => ({
          text: a.textContent?.trim().substring(0, 100),
          href: a.href,
          visible: a.offsetParent !== null
        })).filter(l => l.href && !l.href.startsWith('javascript:'))
      `);
      res.json({ links });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // FORMS
  // ═══════════════════════════════════════════════

  router.get('/forms', async (_req: Request, res: Response) => {
    try {
      const forms = await execInActiveTab(ctx, `
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
      `);
      res.json({ forms });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
