import type { Router, Request, Response } from 'express';
import fs from 'fs';
import type { RouteContext } from '../context';
import { handleRouteError } from '../../utils/errors';
import { getErrorMessage } from '../../utils/security';
import { createRateLimitMiddleware } from '../rate-limit';

function renderGooglePhotosAuthPage(opts: { ok: boolean; title: string; message: string; detail?: string }): string {
  return `<!doctype html>
<html>
  <body style="font-family: sans-serif; padding: 24px;">
    <h1>${opts.title}</h1>
    <p id="status-message"></p>
    <p id="status-detail"></p>
    <script>
      const tandemAuthPayload = ${JSON.stringify({ type: 'tandem-google-photos-auth', ok: opts.ok })};
      const tandemStatusMessage = ${JSON.stringify(opts.message)};
      const tandemStatusDetail = ${JSON.stringify(opts.detail ?? '')};
      const statusEl = document.getElementById('status-message');
      const detailEl = document.getElementById('status-detail');
      if (statusEl) {
        statusEl.textContent = tandemStatusMessage;
      }
      if (detailEl) {
        detailEl.textContent = tandemStatusDetail;
      }
      if (window.opener) {
        window.opener.postMessage(tandemAuthPayload, '*');
      }
      if (${opts.ok ? 'true' : 'false'}) {
        window.close();
      }
    </script>
  </body>
</html>`;
}

export function registerMediaRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // PANEL — Wingman side panel
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
  // CHAT — Wingman chat messages
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

  /** Send chat message (default: wingman, 'from' param allows robin/claude) */
  router.post('/chat', (req: Request, res: Response) => {
    const { text, from, image } = req.body;
    if (!text && !image) { res.status(400).json({ error: 'text or image required' }); return; }
    const sender: 'robin' | 'wingman' | 'kees' | 'claude' = (from === 'robin') ? 'robin' : (from === 'claude') ? 'claude' : 'wingman';
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
  router.get('/chat/image/:filename', createRateLimitMiddleware({
    bucket: 'media-chat-image',
    windowMs: 60_000,
    max: 120,
    message: 'Too many chat image requests. Retry shortly.',
  }), (req: Request, res: Response) => {
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

  /** Set Wingman typing indicator */
  router.post('/chat/typing', (req: Request, res: Response) => {
    try {
      const { typing = true } = req.body;
      ctx.panelManager.setWingmanTyping(typing);
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
      const result = await ctx.videoRecorderManager.startRecording('application');
      res.json(result);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/audio/stop', async (_req: Request, res: Response) => {
    try {
      const result = await ctx.videoRecorderManager.stopRecording();
      res.json(result);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/audio/status', (_req: Request, res: Response) => {
    try {
      res.json(ctx.videoRecorderManager.getStatus());
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/audio/recordings', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const recordings = ctx.videoRecorderManager.listRecordings(limit);
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

  router.get('/integrations/google-photos/status', (_req: Request, res: Response) => {
    try {
      res.json({
        ...ctx.googlePhotosManager.getStatus(),
        clientId: ctx.googlePhotosManager.getClientId(),
      });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/integrations/google-photos/config', (req: Request, res: Response) => {
    try {
      const clientId = typeof req.body?.clientId === 'string' ? req.body.clientId : '';
      const status = ctx.googlePhotosManager.setClientId(clientId);
      res.json({
        ok: true,
        ...status,
        clientId: ctx.googlePhotosManager.getClientId(),
      });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/integrations/google-photos/connect', createRateLimitMiddleware({
    bucket: 'media-google-photos-connect',
    windowMs: 60_000,
    max: 10,
    message: 'Too many Google Photos connect requests. Retry shortly.',
  }), (req: Request, res: Response) => {
    try {
      const clientId = typeof req.body?.clientId === 'string' ? req.body.clientId.trim() : '';
      if (clientId) {
        ctx.googlePhotosManager.setClientId(clientId);
      }
      const authUrl = ctx.googlePhotosManager.beginAuth();
      res.json({ ok: true, authUrl });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/integrations/google-photos/disconnect', (_req: Request, res: Response) => {
    try {
      res.json({
        ok: true,
        ...ctx.googlePhotosManager.disconnect(),
      });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/google-photos/oauth/callback', createRateLimitMiddleware({
    bucket: 'media-google-photos-callback',
    windowMs: 60_000,
    max: 30,
    message: 'Too many Google Photos callback requests. Retry shortly.',
  }), async (req: Request, res: Response) => {
    try {
      const code = typeof req.query.code === 'string' ? req.query.code : undefined;
      const state = typeof req.query.state === 'string' ? req.query.state : undefined;
      const error = typeof req.query.error === 'string' ? req.query.error : undefined;
      await ctx.googlePhotosManager.completeAuth({ code, state, error });
      res.type('html').send(renderGooglePhotosAuthPage({
        ok: true,
        title: 'Google Photos connected',
        message: 'You can close this window and return to Tandem.',
      }));
    } catch (e) {
      const message = getErrorMessage(e, 'Google Photos authorization failed');
      res.status(400).type('html').send(renderGooglePhotosAuthPage({
        ok: false,
        title: 'Google Photos connection failed',
        message: 'Google Photos authorization failed. Review Tandem logs for details.',
        detail: message,
      }));
    }
  });

  // ═══════════════════════════════════════════════
  // WINGMAN STREAM (Activity Streaming to OpenClaw)
  // ═══════════════════════════════════════════════

  router.post('/wingman-stream/toggle', (req: Request, res: Response) => {
    const { enabled } = req.body;
    ctx.wingmanStream.setEnabled(!!enabled);
    res.json({ ok: true, enabled: !!enabled });
  });

  router.get('/wingman-stream/status', (_req: Request, res: Response) => {
    res.json({ ok: true, enabled: ctx.wingmanStream.isEnabled() });
  });
}
