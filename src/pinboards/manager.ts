import path from 'path';
import fs from 'fs';
import { tandemDir, ensureDir } from '../utils/paths';
import { createLogger } from '../utils/logger';
import type { SyncManager } from '../sync/manager';

const log = createLogger('PinboardManager');

// ─── Types ──────────────────────────────────────────────────────────

export interface Pinboard {
  id: string;
  name: string;
  emoji: string;
  layout?: 'default' | 'spacious' | 'dense';
  background?: 'dark' | 'light';
  createdAt: string;
  updatedAt: string;
  items: PinboardItem[];
}

export interface PinboardItem {
  id: string;
  type: 'link' | 'image' | 'text' | 'quote';
  url?: string;
  title?: string;
  description?: string;
  content?: string;
  thumbnail?: string;
  note?: string;
  sourceUrl?: string;
  createdAt: string;
  position: number;
}

interface OGMeta {
  title?: string;
  description?: string;
  image?: string;
}

interface PinboardStore {
  boards: Pinboard[];
  lastModified: string;
}

// ─── Storage path ───────────────────────────────────────────────────

const STORAGE_DIR = ensureDir(tandemDir('pinboards'));
const STORAGE_PATH = path.join(STORAGE_DIR, 'boards.json');

// ─── Manager ────────────────────────────────────────────────────────

/**
 * PinboardManager — CRUD operations for pinboards and their items.
 *
 * Persistence: ~/.tandem/pinboards/boards.json
 * API routes:  src/api/routes/pinboards.ts
 * MCP tools:   src/mcp/tools/pinboards.ts
 */
export class PinboardManager {

  // === 1. Private state ===

  private store: PinboardStore;
  private syncManager: SyncManager | null = null;

  // === 2. Constructor ===

  constructor() {
    this.store = this.load();
  }

  // === 3. Dependency setters ===

  setSyncManager(sm: SyncManager): void {
    this.syncManager = sm;
    this.mergeFromSync();
  }

  // === 4. Public methods ===

  // --- Board CRUD ---

  listBoards(): Array<{ id: string; name: string; emoji: string; itemCount: number; createdAt: string; updatedAt: string }> {
    return this.store.boards.map(b => ({
      id: b.id,
      name: b.name,
      emoji: b.emoji,
      itemCount: b.items.length,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));
  }

  getBoard(boardId: string): Pinboard | null {
    return this.store.boards.find(b => b.id === boardId) || null;
  }

  createBoard(name: string, emoji?: string): Pinboard {
    const now = new Date().toISOString();
    const board: Pinboard = {
      id: this.generateId(),
      name,
      emoji: emoji || '📌',
      createdAt: now,
      updatedAt: now,
      items: [],
    };
    this.store.boards.push(board);
    this.save();
    return board;
  }

  updateBoard(boardId: string, updates: { name?: string; emoji?: string }): Pinboard | null {
    const board = this.store.boards.find(b => b.id === boardId);
    if (!board) return null;
    if (updates.name !== undefined) board.name = updates.name;
    if (updates.emoji !== undefined) board.emoji = updates.emoji;
    board.updatedAt = new Date().toISOString();
    this.save();
    return board;
  }

  deleteBoard(boardId: string): boolean {
    const idx = this.store.boards.findIndex(b => b.id === boardId);
    if (idx === -1) return false;
    this.store.boards.splice(idx, 1);
    this.save();
    return true;
  }

  updateBoardSettings(boardId: string, settings: { layout?: 'default' | 'spacious' | 'dense'; background?: 'dark' | 'light' }): Pinboard | null {
    const board = this.store.boards.find(b => b.id === boardId);
    if (!board) return null;
    if (settings.layout !== undefined) board.layout = settings.layout;
    if (settings.background !== undefined) board.background = settings.background;
    board.updatedAt = new Date().toISOString();
    this.save();
    return board;
  }

  // --- Item CRUD ---

  getItems(boardId: string): PinboardItem[] | null {
    const board = this.store.boards.find(b => b.id === boardId);
    if (!board) return null;
    return [...board.items].sort((a, b) => a.position - b.position);
  }

  async addItem(boardId: string, item: Omit<PinboardItem, 'id' | 'createdAt' | 'position'>): Promise<PinboardItem | null> {
    const board = this.store.boards.find(b => b.id === boardId);
    if (!board) return null;
    const newItem: PinboardItem = {
      ...item,
      id: this.generateId(),
      createdAt: new Date().toISOString(),
      position: board.items.length,
    };
    // Auto-enrich link items with OG metadata
    if (newItem.type === 'link' && newItem.url) {
      const meta = await this.fetchOGMeta(newItem.url);
      if (!newItem.title && meta.title) newItem.title = meta.title;
      if (!newItem.thumbnail && meta.image) newItem.thumbnail = meta.image;
      if (!newItem.description && meta.description) newItem.description = meta.description;
    }
    board.items.push(newItem);
    board.updatedAt = new Date().toISOString();
    this.save();
    return newItem;
  }

  updateItem(boardId: string, itemId: string, updates: { title?: string; note?: string; content?: string; description?: string; thumbnail?: string }): PinboardItem | null {
    const board = this.store.boards.find(b => b.id === boardId);
    if (!board) return null;
    const item = board.items.find(i => i.id === itemId);
    if (!item) return null;
    if (updates.title !== undefined) item.title = updates.title;
    if (updates.note !== undefined) item.note = updates.note;
    if (updates.content !== undefined) item.content = updates.content;
    if (updates.description !== undefined) item.description = updates.description;
    if (updates.thumbnail !== undefined) item.thumbnail = updates.thumbnail;
    board.updatedAt = new Date().toISOString();
    this.save();
    return item;
  }

  deleteItem(boardId: string, itemId: string): boolean {
    const board = this.store.boards.find(b => b.id === boardId);
    if (!board) return false;
    const idx = board.items.findIndex(i => i.id === itemId);
    if (idx === -1) return false;
    board.items.splice(idx, 1);
    // Recalculate positions
    board.items.forEach((item, i) => { item.position = i; });
    board.updatedAt = new Date().toISOString();
    this.save();
    return true;
  }

  reorderItems(boardId: string, itemIds: string[]): boolean {
    const board = this.store.boards.find(b => b.id === boardId);
    if (!board) return false;
    for (let i = 0; i < itemIds.length; i++) {
      const item = board.items.find(it => it.id === itemIds[i]);
      if (item) item.position = i;
    }
    board.updatedAt = new Date().toISOString();
    this.save();
    return true;
  }

  // === 5. Sync integration ===

  private mergeFromSync(): void {
    if (!this.syncManager?.isConfigured()) return;
    try {
      const shared = this.syncManager.readShared<PinboardStore>('pinboards.json');
      if (!shared) return;
      const localTime = new Date(this.store.lastModified).getTime() || 0;
      const sharedTime = new Date(shared.lastModified).getTime() || 0;
      // If local has no boards yet (fresh install / new device), always prefer shared
      const localEmpty = this.store.boards.length === 0;
      if (localEmpty || sharedTime > localTime) {
        this.store = shared;
        this.save();
        log.info('Pinboards loaded from sync (newer version found)');
      }
    } catch (e) {
      log.warn('mergeFromSync failed:', e instanceof Error ? e.message : String(e));
    }
  }

  // === 6. Cleanup ===

  destroy(): void {
    // Currently noop (no file watchers or timers)
  }

  // === 7. Private I/O ===

  private load(): PinboardStore {
    try {
      if (fs.existsSync(STORAGE_PATH)) {
        return JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf-8'));
      }
    } catch (e) {
      log.warn('Pinboards file corrupted, starting fresh:', e instanceof Error ? e.message : String(e));
    }
    return { boards: [], lastModified: new Date().toISOString() };
  }

  private save(): void {
    try {
      this.store.lastModified = new Date().toISOString();
      fs.writeFileSync(STORAGE_PATH, JSON.stringify(this.store, null, 2));
      if (this.syncManager?.isConfigured()) {
        this.syncManager.writeShared('pinboards.json', this.store);
      }
    } catch (e) {
      log.warn('Failed to save pinboards:', e instanceof Error ? e.message : String(e));
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  }

  private async fetchOGMeta(url: string): Promise<OGMeta> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Tandem/1.0)' },
        signal: AbortSignal.timeout(5000),
      });
      const html = await res.text();
      const og = (prop: string): string | undefined => {
        const m = html.match(new RegExp(`<meta[^>]*property=["']og:${prop}["'][^>]*content=["']([^"']+)["']`, 'i'))
               || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:${prop}["']`, 'i'));
        return m?.[1];
      };
      const title = og('title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
      return { title, description: og('description'), image: og('image') };
    } catch {
      return {};
    }
  }
}
