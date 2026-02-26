import { Router, Request, Response } from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { RouteContext, getActiveWC } from '../context';
import { passwordManager } from '../../passwords/manager';

// Module-level live mode state (was a closure variable in server.ts)
let liveMode = false;

export function registerMiscRoutes(router: Router, ctx: RouteContext): void {

  // ═══════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════

  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const tab = ctx.tabManager.getActiveTab();
      if (!tab) {
        res.json({ ready: false, tabs: 0 });
        return;
      }
      const wc = await getActiveWC(ctx);
      let viewport = undefined;
      if (wc) {
        try {
          const info = await wc.executeJavaScript(`
            JSON.stringify({
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              scrollTop: Math.round(document.documentElement.scrollTop),
              scrollHeight: document.documentElement.scrollHeight,
              clientHeight: document.documentElement.clientHeight,
              screenWidth: screen.width,
              screenHeight: screen.height
            })
          `);
          viewport = JSON.parse(info);
        } catch (_) { /* viewport info is best-effort */ }
      }
      res.json({
        ready: !!wc,
        url: tab.url,
        title: tab.title,
        loading: wc ? wc.isLoading() : false,
        activeTab: tab.id,
        tabs: ctx.tabManager.count,
        viewport,
      });
    } catch (e: any) {
      res.json({ ready: false, error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // PASSWORD MANAGER
  // ═══════════════════════════════════════════════

  router.get('/passwords/status', (_req: Request, res: Response) => {
    res.json({
      unlocked: passwordManager.isVaultUnlocked,
      isNewVault: passwordManager.isNewVault()
    });
  });

  router.post('/passwords/unlock', async (req: Request, res: Response) => {
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ error: 'Password required' });
      return;
    }
    const success = await passwordManager.unlock(password);
    if (success) {
      res.json({ success: true, isNewVault: false });
    } else {
      res.status(401).json({ error: 'Incorrect master password' });
    }
  });

  router.post('/passwords/lock', (_req: Request, res: Response) => {
    passwordManager.lock();
    res.json({ success: true });
  });

  router.get('/passwords/suggest', (req: Request, res: Response) => {
    const domain = req.query.domain as string;
    if (!domain) {
      res.status(400).json({ error: 'Domain query parameter required' });
      return;
    }
    try {
      const identities = passwordManager.getIdentitiesForDomain(domain);
      res.json({ identities });
    } catch (err: any) {
      res.status(403).json({ error: err.message });
    }
  });

  router.post('/passwords/save', (req: Request, res: Response) => {
    const { domain, username, payload } = req.body;
    if (!domain || !username || !payload) {
      res.status(400).json({ error: 'domain, username, and payload required' });
      return;
    }
    try {
      passwordManager.saveItem(domain, username, payload);
      res.json({ success: true });
    } catch (err: any) {
      res.status(403).json({ error: err.message });
    }
  });

  router.get('/passwords/generate', (req: Request, res: Response) => {
    const { PasswordCrypto } = require('../../security/crypto');
    const length = req.query.length ? parseInt(req.query.length as string) : 24;
    res.json({ password: PasswordCrypto.generatePassword(length) });
  });

  // ═══════════════════════════════════════════════
  // EVENT STREAM — SSE (Phase 2)
  // ═══════════════════════════════════════════════

  router.get('/events/stream', (req: Request, res: Response) => {
    ctx.eventStream.sseHandler(req, res);
  });

  router.get('/events/recent', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const events = ctx.eventStream.getRecent(limit);
      res.json({ events });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // LIVE MODE — Copilot live monitoring toggle
  // ═══════════════════════════════════════════════

  router.get('/live/status', (_req: Request, res: Response) => {
    res.json({ enabled: liveMode });
  });

  router.post('/live/toggle', (req: Request, res: Response) => {
    const { enabled } = req.body;
    liveMode = (enabled !== undefined) ? !!enabled : !liveMode;
    // Notify panel UI about live mode change
    ctx.panelManager.sendLiveModeChanged(liveMode);
    res.json({ ok: true, enabled: liveMode });
  });

  // Filtered SSE stream — only active when live mode is on
  router.get('/live/stream', (req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    res.write(`data: ${JSON.stringify({ type: 'live-status', enabled: liveMode })}\n\n`);

    const unsubscribe = ctx.eventStream.subscribe((event) => {
      if (!liveMode) return; // Skip events when live mode is off
      // Filter: only send meaningful events (skip scroll noise)
      if (event.type === 'scroll') return;
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        unsubscribe();
      }
    });

    const heartbeat = setInterval(() => {
      try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); unsubscribe(); }
    }, 30000);

    req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
  });

  // ═══════════════════════════════════════════════
  // ACTIVITY LOG
  // ═══════════════════════════════════════════════

  router.get('/activity-log', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const since = req.query.since ? parseInt(req.query.since as string) : undefined;
      const types = req.query.types ? (req.query.types as string).split(',') : undefined;

      let entries = ctx.activityTracker.getLog(limit * 2, since); // fetch extra to compensate for filtering

      if (types) {
        entries = entries.filter(e => types.includes(e.type));
      }

      entries = entries.slice(-limit);

      res.json({ entries, count: entries.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // BEHAVIORAL LEARNING — Stats endpoint
  // ═══════════════════════════════════════════════

  router.get('/behavior/stats', (_req: Request, res: Response) => {
    try {
      const stats = ctx.behaviorObserver.getStats();
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/behavior/clear', (_req: Request, res: Response) => {
    try {
      const rawDir = path.join(os.homedir(), '.tandem', 'behavior', 'raw');
      if (fs.existsSync(rawDir)) {
        const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.jsonl'));
        for (const file of files) {
          fs.unlinkSync(path.join(rawDir, file));
        }
      }
      res.json({ ok: true, cleared: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // SITE MEMORY — Phase 3.1
  // ═══════════════════════════════════════════════

  router.get('/memory/sites', (_req: Request, res: Response) => {
    try {
      const sites = ctx.siteMemory.listSites();
      res.json({ sites });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/memory/site/:domain', (req: Request, res: Response) => {
    try {
      const data = ctx.siteMemory.getSite(req.params.domain as string);
      if (!data) { res.status(404).json({ error: 'Site not found' }); return; }
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/memory/site/:domain/diff', (req: Request, res: Response) => {
    try {
      const diffs = ctx.siteMemory.getDiffs(req.params.domain as string);
      res.json({ diffs });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/memory/search', (req: Request, res: Response) => {
    try {
      const q = req.query.q as string;
      if (!q) { res.status(400).json({ error: 'q parameter required' }); return; }
      const results = ctx.siteMemory.search(q);
      res.json({ results });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // WATCH — Phase 3.2
  // ═══════════════════════════════════════════════

  router.post('/watch/add', (req: Request, res: Response) => {
    try {
      const { url, intervalMinutes = 30 } = req.body;
      if (!url) { res.status(400).json({ error: 'url required' }); return; }
      const result = ctx.watchManager.addWatch(url, intervalMinutes);
      if ('error' in result) { res.status(400).json(result); return; }
      res.json({ ok: true, watch: result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/watch/list', (_req: Request, res: Response) => {
    try {
      const watches = ctx.watchManager.listWatches();
      res.json({ watches });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/watch/remove', (req: Request, res: Response) => {
    try {
      const { url, id } = req.body;
      const removed = ctx.watchManager.removeWatch(id || url);
      res.json({ ok: removed });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/watch/check', async (req: Request, res: Response) => {
    try {
      const { url, id } = req.body;
      const results = await ctx.watchManager.forceCheck(id || url);
      res.json(results);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // HEADLESS — Phase 3.3
  // ═══════════════════════════════════════════════

  router.post('/headless/open', async (req: Request, res: Response) => {
    try {
      const { url } = req.body;
      if (!url) { res.status(400).json({ error: 'url required' }); return; }
      const result = await ctx.headlessManager.open(url);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/headless/content', async (_req: Request, res: Response) => {
    try {
      const result = await ctx.headlessManager.getContent();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/headless/status', (_req: Request, res: Response) => {
    try {
      res.json(ctx.headlessManager.getStatus());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/headless/show', (_req: Request, res: Response) => {
    try {
      const shown = ctx.headlessManager.show();
      res.json({ ok: shown });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/headless/hide', (_req: Request, res: Response) => {
    try {
      const hidden = ctx.headlessManager.hide();
      res.json({ ok: hidden });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/headless/close', (_req: Request, res: Response) => {
    try {
      ctx.headlessManager.close();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // FORM MEMORY — Phase 3.4
  // ═══════════════════════════════════════════════

  router.get('/forms/memory', (_req: Request, res: Response) => {
    try {
      const domains = ctx.formMemory.listAll();
      res.json({ domains });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/forms/memory/:domain', (req: Request, res: Response) => {
    try {
      const data = ctx.formMemory.getForDomain(req.params.domain as string);
      if (!data) { res.status(404).json({ error: 'No form data for this domain' }); return; }
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/forms/fill', (req: Request, res: Response) => {
    try {
      const { domain } = req.body;
      if (!domain) { res.status(400).json({ error: 'domain required' }); return; }
      const fields = ctx.formMemory.getFillData(domain);
      if (!fields) { res.status(404).json({ error: 'No form data for this domain' }); return; }
      res.json({ domain, fields });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/forms/memory/:domain', (req: Request, res: Response) => {
    try {
      const deleted = ctx.formMemory.deleteDomain(req.params.domain as string);
      res.json({ ok: deleted });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // PIP — Picture-in-Picture
  // ═══════════════════════════════════════════════

  router.post('/pip/toggle', (req: Request, res: Response) => {
    try {
      const { open } = req.body;
      const visible = ctx.pipManager.toggle(open);
      res.json({ ok: true, visible });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/pip/status', (_req: Request, res: Response) => {
    try {
      res.json(ctx.pipManager.getStatus());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // CLARONOTE — Notes & Recording
  // ═══════════════════════════════════════════════

  router.post('/claronote/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password required' });
        return;
      }

      const result = await ctx.claroNoteManager.login(email, password);
      if (result.success) {
        res.json({ success: true, user: ctx.claroNoteManager.getAuth()?.user });
      } else {
        res.status(401).json({ success: false, error: result.error });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/claronote/logout', async (_req: Request, res: Response) => {
    try {
      await ctx.claroNoteManager.logout();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/claronote/me', async (_req: Request, res: Response) => {
    try {
      const user = await ctx.claroNoteManager.getMe();
      res.json({ user });
    } catch (e: any) {
      res.status(401).json({ error: e.message });
    }
  });

  router.get('/claronote/status', (_req: Request, res: Response) => {
    try {
      const auth = ctx.claroNoteManager.getAuth();
      res.json({
        authenticated: !!auth,
        user: auth?.user || null,
        recording: ctx.claroNoteManager.getRecordingStatus()
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Recording
  router.post('/claronote/record/start', async (_req: Request, res: Response) => {
    try {
      const result = await ctx.claroNoteManager.startRecording();
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/claronote/record/stop', async (_req: Request, res: Response) => {
    try {
      const result = await ctx.claroNoteManager.stopRecording();
      if (result.success) {
        res.json({ success: true, noteId: result.noteId });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Notes
  router.get('/claronote/notes', async (req: Request, res: Response) => {
    try {
      const limitParam = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const limit = parseInt(limitParam as string || '10') || 10;
      const notes = await ctx.claroNoteManager.getNotes(limit);
      res.json({ notes });
    } catch (e: any) {
      res.status(401).json({ error: e.message });
    }
  });

  router.get('/claronote/notes/:id', async (req: Request, res: Response) => {
    try {
      const noteId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const note = await ctx.claroNoteManager.getNote(noteId);
      res.json({ note });
    } catch (e: any) {
      res.status(404).json({ error: e.message });
    }
  });

  // Upload audio recording from renderer
  router.post('/claronote/upload', async (req: Request, res: Response) => {
    try {
      const { audioBase64, duration } = req.body;
      if (!audioBase64) { res.status(400).json({ error: 'audioBase64 required' }); return; }
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      const noteId = await ctx.claroNoteManager.uploadRecording(audioBuffer, duration || 0);
      res.json({ ok: true, noteId });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // DATA — Wipe
  // ═══════════════════════════════════════════════

  router.post('/data/wipe', (_req: Request, res: Response) => {
    try {
      const tandemDir = path.join(os.homedir(), '.tandem');

      // Wipe chat history
      const chatPath = path.join(tandemDir, 'chat-history.json');
      if (fs.existsSync(chatPath)) fs.unlinkSync(chatPath);

      // Wipe config
      const configPath = path.join(tandemDir, 'config.json');
      if (fs.existsSync(configPath)) fs.unlinkSync(configPath);

      // Wipe behavior data
      const rawDir = path.join(tandemDir, 'behavior', 'raw');
      if (fs.existsSync(rawDir)) {
        const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.jsonl'));
        for (const file of files) {
          fs.unlinkSync(path.join(rawDir, file));
        }
      }

      res.json({ ok: true, wiped: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // WORKFLOW ENGINE (Phase 5)
  // ═══════════════════════════════════════════════

  router.get('/workflows', async (_req: Request, res: Response) => {
    try {
      const workflows = await ctx.workflowEngine.getWorkflows();
      res.json({ workflows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/workflows', async (req: Request, res: Response) => {
    try {
      const { name, description, steps, variables } = req.body;
      if (!name || !steps) {
        res.status(400).json({ error: 'name and steps required' });
        return;
      }

      const id = await ctx.workflowEngine.saveWorkflow({
        name,
        description,
        steps,
        variables
      });

      res.json({ id });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/workflows/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await ctx.workflowEngine.deleteWorkflow(id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/workflow/run', async (req: Request, res: Response) => {
    try {
      const { workflowId, variables } = req.body;
      if (!workflowId) {
        res.status(400).json({ error: 'workflowId required' });
        return;
      }

      const wc = await getActiveWC(ctx);
      if (!wc) {
        res.status(500).json({ error: 'No active tab' });
        return;
      }

      const executionId = await ctx.workflowEngine.runWorkflow(
        workflowId,
        ctx.win,
        variables || {}
      );

      res.json({ executionId });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/workflow/status/:executionId', async (req: Request, res: Response) => {
    try {
      const executionId = req.params.executionId as string;
      if (Array.isArray(executionId)) {
        res.status(400).json({ error: 'Invalid executionId' });
        return;
      }
      const status = await ctx.workflowEngine.getExecutionStatus(executionId);

      if (!status) {
        res.status(404).json({ error: 'Execution not found' });
        return;
      }

      res.json(status);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/workflow/stop', async (req: Request, res: Response) => {
    try {
      const { executionId } = req.body;
      if (!executionId) {
        res.status(400).json({ error: 'executionId required' });
        return;
      }

      await ctx.workflowEngine.stopWorkflow(executionId);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/workflow/running', async (_req: Request, res: Response) => {
    try {
      const executions = await ctx.workflowEngine.getRunningExecutions();
      res.json({ executions });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // LOGIN STATE MANAGER (Phase 5)
  // ═══════════════════════════════════════════════

  router.get('/auth/states', async (_req: Request, res: Response) => {
    try {
      const states = await ctx.loginManager.getAllStates();
      res.json({ states });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/auth/state/:domain', async (req: Request, res: Response) => {
    try {
      const domain = req.params.domain as string;
      const state = await ctx.loginManager.getLoginState(domain);
      res.json(state);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/auth/check', async (_req: Request, res: Response) => {
    try {
      const wc = await getActiveWC(ctx);
      if (!wc) {
        res.status(500).json({ error: 'No active tab' });
        return;
      }

      const state = await ctx.loginManager.checkCurrentPage(ctx.win);
      res.json(state);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/auth/is-login-page', async (_req: Request, res: Response) => {
    try {
      const wc = await getActiveWC(ctx);
      if (!wc) {
        res.status(500).json({ error: 'No active tab' });
        return;
      }

      const isLoginPage = await ctx.loginManager.isLoginPage(ctx.win);
      res.json({ isLoginPage });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/auth/update', async (req: Request, res: Response) => {
    try {
      const { domain, status, username } = req.body;
      if (!domain || !status) {
        res.status(400).json({ error: 'domain and status required' });
        return;
      }

      await ctx.loginManager.updateLoginState(domain, status, username);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/auth/state/:domain', async (req: Request, res: Response) => {
    try {
      const domain = req.params.domain as string;
      await ctx.loginManager.clearLoginState(domain);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
