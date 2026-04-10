import path from 'path';
import fs from 'fs';
import { tandemDir } from '../utils/paths';
import { createLogger } from '../utils/logger';
import type { SyncManager } from '../sync/manager';

const log = createLogger('HistoryManager');

/**
 * HistoryEntry — A single browsing history entry.
 */
export interface HistoryEntry {
  url: string;
  title: string;
  visitCount: number;
  lastVisitTime: string;
  firstVisitTime?: string;
}

interface HistoryStore {
  entries: HistoryEntry[];
  importedFrom?: string;
}

const MAX_ENTRIES = 10000;

/**
 * HistoryManager — Auto-tracks page visits and provides search.
 * 
 * Storage: ~/.tandem/history.json (max 10000 entries, FIFO)
 */
export class HistoryManager {
  private storePath: string;
  private store: HistoryStore;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private syncManager: SyncManager | null = null;

  constructor() {
    const baseDir = tandemDir();
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.storePath = path.join(baseDir, 'history.json');
    this.store = this.load();
  }

  /** Wire up sync manager for cross-device history publishing. */
  setSyncManager(sm: SyncManager): void {
    this.syncManager = sm;
  }

  private load(): HistoryStore {
    try {
      if (fs.existsSync(this.storePath)) {
        return JSON.parse(fs.readFileSync(this.storePath, 'utf-8'));
      }
    } catch (e) { log.warn('History file corrupted, starting fresh:', e instanceof Error ? e.message : String(e)); }
    return { entries: [] };
  }

  private save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2));
      } catch (e) {
        log.warn('Failed to save:', e instanceof Error ? e.message : String(e));
      }
      if (this.syncManager?.isConfigured()) {
        this.syncManager.publishHistory(this.store.entries);
      }
    }, 2000);
  }

  /** Flush pending history writes to disk on shutdown. */
  destroy(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      try {
        fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2));
      } catch (e) {
        log.warn('Failed to save on destroy:', e instanceof Error ? e.message : String(e));
      }
    }
  }

  /** Record a page visit */
  recordVisit(url: string, title: string): void {
    if (!url || url === 'about:blank' || url.startsWith('file://')) return;

    const now = new Date().toISOString();
    const existing = this.store.entries.find(e => e.url === url);

    if (existing) {
      existing.visitCount++;
      existing.lastVisitTime = now;
      if (title) existing.title = title;
      // Move to end (most recent)
      const idx = this.store.entries.indexOf(existing);
      this.store.entries.splice(idx, 1);
      this.store.entries.push(existing);
    } else {
      this.store.entries.push({
        url,
        title: title || '',
        visitCount: 1,
        lastVisitTime: now,
        firstVisitTime: now,
      });
    }

    // FIFO cap
    if (this.store.entries.length > MAX_ENTRIES) {
      this.store.entries = this.store.entries.slice(-MAX_ENTRIES);
    }

    this.save();
  }

  /** Get history entries (most recent first) */
  getHistory(limit: number = 100, offset: number = 0): HistoryEntry[] {
    const reversed = [...this.store.entries].reverse();
    return reversed.slice(offset, offset + limit);
  }

  /** Search history by URL or title */
  search(query: string): HistoryEntry[] {
    const q = query.toLowerCase();
    return this.store.entries
      .filter(e =>
        e.url.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q)
      )
      .reverse()
      .slice(0, 100);
  }

  /** Clear all history */
  clear(): void {
    this.store.entries = [];
    this.save();
  }

  /** Get total count */
  get count(): number {
    return this.store.entries.length;
  }
}
