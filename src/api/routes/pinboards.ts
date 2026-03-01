import type { Router, Request, Response } from 'express';
import type { RouteContext } from '../context';
import { handleRouteError } from '../../utils/errors';

interface IdParams { id: string }
interface ItemParams { id: string; itemId: string }

export function registerPinboardRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // PINBOARDS — Content Curation Boards
  // ═══════════════════════════════════════════════

  // GET /pinboards — list all boards (without items)
  router.get('/pinboards', (_req: Request, res: Response) => {
    try {
      const boards = ctx.pinboardManager.listBoards();
      res.json({ ok: true, boards });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // POST /pinboards — create new board
  router.post('/pinboards', (req: Request, res: Response) => {
    try {
      const { name, emoji } = req.body;
      if (!name) { res.status(400).json({ error: 'name required' }); return; }
      const board = ctx.pinboardManager.createBoard(name, emoji);
      res.json({ ok: true, board });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // GET /pinboards/:id — get board with items
  router.get('/pinboards/:id', (req: Request<IdParams>, res: Response) => {
    try {
      const board = ctx.pinboardManager.getBoard(req.params.id);
      if (!board) { res.status(404).json({ error: 'Board not found' }); return; }
      res.json({ ok: true, board });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // PUT /pinboards/:id — update board
  router.put('/pinboards/:id', (req: Request<IdParams>, res: Response) => {
    try {
      const { name, emoji } = req.body;
      const board = ctx.pinboardManager.updateBoard(req.params.id, { name, emoji });
      if (!board) { res.status(404).json({ error: 'Board not found' }); return; }
      res.json({ ok: true, board });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // PUT /pinboards/:id/settings — update board appearance settings
  router.put('/pinboards/:id/settings', (req: Request<IdParams>, res: Response) => {
    try {
      const { layout, background } = req.body;
      const board = ctx.pinboardManager.updateBoardSettings(req.params.id, { layout, background });
      if (!board) { res.status(404).json({ error: 'Board not found' }); return; }
      res.json({ ok: true, board });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // DELETE /pinboards/:id — delete board
  router.delete('/pinboards/:id', (req: Request<IdParams>, res: Response) => {
    try {
      const deleted = ctx.pinboardManager.deleteBoard(req.params.id);
      if (!deleted) { res.status(404).json({ error: 'Board not found' }); return; }
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // GET /pinboards/:id/items — get items for a board
  router.get('/pinboards/:id/items', (req: Request<IdParams>, res: Response) => {
    try {
      const items = ctx.pinboardManager.getItems(req.params.id);
      if (items === null) { res.status(404).json({ error: 'Board not found' }); return; }
      res.json({ ok: true, items });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // POST /pinboards/:id/items — add item to board
  router.post('/pinboards/:id/items', async (req: Request<IdParams>, res: Response) => {
    try {
      const { type, url, title, content, thumbnail, note, sourceUrl } = req.body;
      if (!type) { res.status(400).json({ error: 'type required' }); return; }
      if (!['link', 'image', 'text', 'quote'].includes(type)) {
        res.status(400).json({ error: 'type must be link, image, text, or quote' }); return;
      }
      const item = await ctx.pinboardManager.addItem(req.params.id, {
        type, url, title, content, thumbnail, note, sourceUrl
      });
      if (!item) { res.status(404).json({ error: 'Board not found' }); return; }
      res.json({ ok: true, item });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // PUT /pinboards/:id/items/:itemId — update item
  router.put('/pinboards/:id/items/:itemId', (req: Request<ItemParams>, res: Response) => {
    try {
      const { title, note, content, description, thumbnail } = req.body;
      const item = ctx.pinboardManager.updateItem(req.params.id, req.params.itemId, {
        title, note, content, description, thumbnail
      });
      if (!item) { res.status(404).json({ error: 'Board or item not found' }); return; }
      res.json({ ok: true, item });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // DELETE /pinboards/:id/items/:itemId — delete item
  router.delete('/pinboards/:id/items/:itemId', (req: Request<ItemParams>, res: Response) => {
    try {
      const deleted = ctx.pinboardManager.deleteItem(req.params.id, req.params.itemId);
      if (!deleted) { res.status(404).json({ error: 'Board or item not found' }); return; }
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // POST /pinboards/:id/items/reorder — reorder items
  router.post('/pinboards/:id/items/reorder', (req: Request<IdParams>, res: Response) => {
    try {
      const { itemIds } = req.body;
      if (!itemIds || !Array.isArray(itemIds)) {
        res.status(400).json({ error: 'itemIds array required' }); return;
      }
      const reordered = ctx.pinboardManager.reorderItems(req.params.id, itemIds);
      if (!reordered) { res.status(404).json({ error: 'Board not found' }); return; }
      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
