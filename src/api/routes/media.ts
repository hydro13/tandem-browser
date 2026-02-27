import { Router, Request, Response } from 'express';
import fs from 'fs';
import { RouteContext } from '../context';
import { handleRouteError } from '../../utils/errors';

export function registerMediaRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // PANEL — Copilot side panel
  // ═══════════════════════════════════════════════

  router.post('/panel/toggle', (req: Request, res: Response) => {
    try {
      const { open } = req.body;
      const isOpen = ctx.panelManager.togglePanel(open);
      res.json({ ok: true, open: isOpen });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // CHAT — Copilot chat messages
  // ═══════════════════════════════════════════════

  /** Get chat messages (supports ?since_id= for polling) */
  router.get('/chat', (req: Request, res: Response) => {
    try {
      const sinceId = parseInt(req.query.since_id as string);
      if (sinceId && !isNaN(sinceId)) {
        const messages = ctx.panelManager.getChatMessagesSince(sinceId);
        res.json({ messages });
      } else {
        const limit = parseInt(req.query.limit as string) || 50;
        const messages = ctx.panelManager.getChatMessages(limit);
        res.json({ messages });
      }
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  /** Send chat message (default: copilot, 'from' param allows robin/claude) */
  router.post('/chat', (req: Request, res: Response) => {
    const { text, from, image } = req.body;
    if (!text && !image) { res.status(400).json({ error: 'text or image required' }); return; }
    const sender: 'robin' | 'copilot' | 'kees' | 'claude' = (from === 'robin') ? 'robin' : (from === 'claude') ? 'claude' : 'copilot';
    try {
      let savedImage: string | undefined;
      if (image) {
        savedImage = ctx.panelManager.saveImage(image);
      }
      const msg = ctx.panelManager.addChatMessage(sender, text || '', savedImage);
      res.json({ ok: true, message: msg });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  /** Serve chat images */
  router.get('/chat/image/:filename', (req: Request, res: Response) => {
    const filename = req.params.filename as string;
    // Security: prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }
    const filePath = ctx.panelManager.getImagePath(filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Image not found' });
      return;
    }
    res.sendFile(filePath);
  });

  /** Set Copilot typing indicator */
  router.post('/chat/typing', (req: Request, res: Response) => {
    try {
      const { typing = true } = req.body;
      ctx.panelManager.setCopilotTyping(typing);
      res.json({ ok: true, typing });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  /** Test webhook connectivity */
  router.post('/chat/webhook/test', async (_req: Request, res: Response) => {
    try {
      const config = ctx.configManager.getConfig();
      if (!config.webhook?.enabled || !config.webhook?.url) {
        res.json({ ok: false, error: 'Webhook not configured or disabled' });
        return;
      }

      const url = config.webhook.url.replace(/\/$/, '');
      const response = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });

      res.json({
        ok: response.ok,
        status: response.status,
        url: config.webhook.url,
      });
    } catch (e) {
      res.json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  // ═══════════════════════════════════════════════
  // VOICE — Speech recognition control
  // ═══════════════════════════════════════════════

  router.post('/voice/start', (_req: Request, res: Response) => {
    try {
      ctx.voiceManager.start();
      res.json({ ok: true, listening: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/voice/stop', (_req: Request, res: Response) => {
    try {
      ctx.voiceManager.stop();
      res.json({ ok: true, listening: false });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/voice/status', (_req: Request, res: Response) => {
    try {
      const status = ctx.voiceManager.getStatus();
      res.json(status);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // AUDIO CAPTURE
  // ═══════════════════════════════════════════════

  router.post('/audio/start', async (_req: Request, res: Response) => {
    try {
      const activeTab = ctx.tabManager.getActiveTab();
      if (!activeTab) { res.status(400).json({ error: 'No active tab' }); return; }
      const result = await ctx.audioCaptureManager.startRecording(activeTab.webContentsId);
      res.json(result);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/audio/stop', (_req: Request, res: Response) => {
    try {
      const result = ctx.audioCaptureManager.stopRecording();
      res.json(result);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/audio/status', (_req: Request, res: Response) => {
    try {
      res.json(ctx.audioCaptureManager.getStatus());
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/audio/recordings', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const recordings = ctx.audioCaptureManager.listRecordings(limit);
      res.json({ recordings });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // DRAW — Annotated screenshots
  // ═══════════════════════════════════════════════

  router.get('/screenshot/annotated', (_req: Request, res: Response) => {
    try {
      const png = ctx.drawManager.getLastScreenshot();
      if (!png) {
        res.status(404).json({ error: 'No annotated screenshot available' });
        return;
      }
      res.type('png').send(png);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/screenshot/annotated', async (_req: Request, res: Response) => {
    try {
      const activeTab = ctx.tabManager.getActiveTab();
      const wcId = activeTab ? activeTab.webContentsId : null;
      const result = await ctx.drawManager.captureAnnotated(wcId);
      if (result.ok) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/draw/toggle', (req: Request, res: Response) => {
    try {
      const { enabled } = req.body;
      const isEnabled = ctx.drawManager.toggleDrawMode(enabled);
      res.json({ ok: true, drawMode: isEnabled });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/screenshots', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const screenshots = ctx.drawManager.listScreenshots(limit);
      res.json({ screenshots });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // COPILOT STREAM (Activity Streaming to OpenClaw)
  // ═══════════════════════════════════════════════

  router.post('/copilot-stream/toggle', (req: Request, res: Response) => {
    const { enabled } = req.body;
    ctx.copilotStream.setEnabled(!!enabled);
    res.json({ ok: true, enabled: !!enabled });
  });

  router.get('/copilot-stream/status', (_req: Request, res: Response) => {
    res.json({ ok: true, enabled: ctx.copilotStream.isEnabled() });
  });
}
