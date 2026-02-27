import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { tandemDir } from '../utils/paths';
import { BrowserWindow, session } from 'electron';
import { StealthManager } from '../stealth/manager';
import { copilotAlert } from '../notifications/alert';
import { DEFAULT_TIMEOUT_MS } from '../utils/constants';
import { createLogger } from '../utils/logger';

const log = createLogger('Watcher');

export interface WatchEntry {
  id: string;
  url: string;
  intervalMs: number;
  lastCheck: number | null;
  lastHash: string | null;
  lastTitle: string | null;
  lastError: string | null;
  changeCount: number;
  createdAt: number;
}

interface WatchState {
  watches: WatchEntry[];
}

/**
 * WatchManager — Scheduled background page watching.
 * 
 * Uses a hidden BrowserWindow to periodically check pages for changes.
 * Hashes page text content and compares with previous check.
 * Alerts the human/copilot when something changes.
 */
export class WatchManager {
  private watchFile: string;
  private state: WatchState;
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private hiddenWindow: BrowserWindow | null = null;
  private counter = 0;
  private checking = false;
  private readonly MAX_WATCHES = 20;

  constructor() {
    const baseDir = tandemDir();
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

    this.watchFile = path.join(baseDir, 'watches.json');
    this.state = this.load();
    this.startAllTimers();
  }

  private load(): WatchState {
    try {
      if (fs.existsSync(this.watchFile)) {
        return JSON.parse(fs.readFileSync(this.watchFile, 'utf-8'));
      }
    } catch (e) { log.warn('Watch state load failed, starting fresh:', e instanceof Error ? e.message : String(e)); }
    return { watches: [] };
  }

  private save(): void {
    fs.writeFileSync(this.watchFile, JSON.stringify(this.state, null, 2));
  }

  private nextId(): string {
    return `watch-${Date.now()}-${++this.counter}`;
  }

  /** Create hidden BrowserWindow for background checks */
  private async getHiddenWindow(): Promise<BrowserWindow> {
    if (this.hiddenWindow && !this.hiddenWindow.isDestroyed()) {
      return this.hiddenWindow;
    }

    const partition = 'persist:tandem';
    const _ses = session.fromPartition(partition);

    this.hiddenWindow = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Apply stealth script after page loads
    this.hiddenWindow.webContents.on('did-finish-load', () => {
      this.hiddenWindow?.webContents.executeJavaScript(StealthManager.getStealthScript()).catch((e) => log.warn('Watch stealth injection failed:', e.message));
    });

    return this.hiddenWindow;
  }

  /** Hash text content of a page */
  private hashContent(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
  }

  /** Check a single URL for changes */
  async checkUrl(watchId: string): Promise<{ changed: boolean; error?: string }> {
    const watch = this.state.watches.find(w => w.id === watchId);
    if (!watch) return { changed: false, error: 'Watch not found' };

    // Prevent concurrent checks
    if (this.checking) return { changed: false, error: 'Already checking' };
    this.checking = true;

    try {
      const win = await this.getHiddenWindow();
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Page load timeout'));
        }, DEFAULT_TIMEOUT_MS);

        win.webContents.once('did-finish-load', () => {
          clearTimeout(timeout);
          // Small delay for dynamic content
          setTimeout(resolve, 2000);
        });

        win.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
          clearTimeout(timeout);
          reject(new Error(`Load failed: ${errorDescription} (${errorCode})`));
        });

        win.webContents.loadURL(watch.url).catch(reject);
      });

      // Extract text content
      const textContent: string = await win.webContents.executeJavaScript(`
        document.body ? document.body.innerText.replace(/\\s+/g, ' ').trim() : ''
      `);

      const title: string = await win.webContents.executeJavaScript('document.title');
      const newHash = this.hashContent(textContent);
      const changed = watch.lastHash !== null && watch.lastHash !== newHash;

      watch.lastCheck = Date.now();
      watch.lastTitle = title;
      watch.lastError = null;

      if (changed) {
        watch.changeCount++;
        copilotAlert(
          `Pagina veranderd: ${watch.lastTitle || watch.url}`,
          `${watch.url} is gewijzigd sinds de vorige check.`
        );
      }

      watch.lastHash = newHash;
      this.save();

      return { changed };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      watch.lastCheck = Date.now();
      watch.lastError = message;
      this.save();
      return { changed: false, error: message };
    } finally {
      this.checking = false;
    }
  }

  /** Start timer for a single watch */
  private startTimer(watch: WatchEntry): void {
    this.stopTimer(watch.id);
    const timer = setInterval(() => {
      this.checkUrl(watch.id).catch((e) => log.warn('Watch check failed for ' + watch.id + ':', e.message));
    }, watch.intervalMs);
    this.timers.set(watch.id, timer);
  }

  /** Stop timer for a watch */
  private stopTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(id);
    }
  }

  /** Start all timers from saved state */
  private startAllTimers(): void {
    for (const watch of this.state.watches) {
      this.startTimer(watch);
    }
  }

  /** Add a new watch */
  addWatch(url: string, intervalMinutes: number): WatchEntry | { error: string } {
    if (this.state.watches.length >= this.MAX_WATCHES) {
      return { error: `Maximum ${this.MAX_WATCHES} watches bereikt` };
    }

    // Check for duplicate
    if (this.state.watches.some(w => w.url === url)) {
      return { error: 'URL wordt al bewaakt' };
    }

    const watch: WatchEntry = {
      id: this.nextId(),
      url,
      intervalMs: Math.max(1, intervalMinutes) * 60 * 1000,
      lastCheck: null,
      lastHash: null,
      lastTitle: null,
      lastError: null,
      changeCount: 0,
      createdAt: Date.now(),
    };

    this.state.watches.push(watch);
    this.save();
    this.startTimer(watch);

    // Do an initial check
    this.checkUrl(watch.id).catch((e) => log.warn('Watch check failed for ' + watch.id + ':', e.message));

    return watch;
  }

  /** Remove a watch by id or url */
  removeWatch(idOrUrl: string): boolean {
    const idx = this.state.watches.findIndex(w => w.id === idOrUrl || w.url === idOrUrl);
    if (idx === -1) return false;

    const watch = this.state.watches[idx];
    this.stopTimer(watch.id);
    this.state.watches.splice(idx, 1);
    this.save();
    return true;
  }

  /** List all watches */
  listWatches(): WatchEntry[] {
    return this.state.watches;
  }

  /** Force check a specific watch or all watches */
  async forceCheck(idOrUrl?: string): Promise<{ results: { id: string; changed: boolean; error?: string }[] }> {
    const targets = idOrUrl
      ? this.state.watches.filter(w => w.id === idOrUrl || w.url === idOrUrl)
      : this.state.watches;

    const results: { id: string; changed: boolean; error?: string }[] = [];
    for (const watch of targets) {
      const result = await this.checkUrl(watch.id);
      results.push({ id: watch.id, ...result });
    }
    return { results };
  }

  /** Cleanup — stop all timers and close hidden window */
  destroy(): void {
    for (const [id] of this.timers) {
      this.stopTimer(id);
    }
    if (this.hiddenWindow && !this.hiddenWindow.isDestroyed()) {
      this.hiddenWindow.close();
    }
  }
}
