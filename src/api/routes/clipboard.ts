import type { Router, Request, Response } from 'express';
import type { RouteContext } from '../context';
import { handleRouteError } from '../../utils/errors';

export function registerClipboardRoutes(router: Router, ctx: RouteContext): void {

  // ═══ GET /clipboard — Read clipboard content ═══
  router.get('/clipboard', (_req: Request, res: Response) => {
    try {
      const content = ctx.clipboardManager.read();
      res.json(content);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══ POST /clipboard/text — Write text to clipboard ═══
  router.post('/clipboard/text', (req: Request, res: Response) => {
    try {
      const { text } = req.body;
      if (typeof text !== 'string') {
        res.status(400).json({ error: 'text is required (string)' });
        return;
      }
      ctx.clipboardManager.writeText(text);
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══ POST /clipboard/image — Write image to clipboard ═══
  router.post('/clipboard/image', (req: Request, res: Response) => {
    try {
      const { base64 } = req.body;
      if (typeof base64 !== 'string') {
        res.status(400).json({ error: 'base64 is required (string)' });
        return;
      }
      ctx.clipboardManager.writeImage(base64);
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══ POST /clipboard/save — Save clipboard content as file ═══
  router.post('/clipboard/save', (req: Request, res: Response) => {
    try {
      const { filename, format, quality, directory } = req.body;
      if (typeof filename !== 'string' || !filename) {
        res.status(400).json({ error: 'filename is required (string)' });
        return;
      }
      const result = ctx.clipboardManager.saveAs({ filename, format, quality, directory });
      res.json({ ok: true, path: result.path, size: result.size });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
