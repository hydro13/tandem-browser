import type { BrowserWindow} from 'electron';
import path from 'path';
import fs from 'fs';
import { tandemDir } from '../utils/paths';
import { createLogger } from '../utils/logger';

const log = createLogger('BehaviorObserver');

// ─── Types ──────────────────────────────────────────────────────────

/**
 * BehaviorObserver — Passive observation layer for behavioral learning.
 *
 * CRITICAL: All tracking via Electron main process events (NOT in webview).
 * Appends events to ~/.tandem/behavior/raw/{date}.jsonl (append-only).
 *
 * Tracks: mouse clicks, scroll events, keyboard timing, navigation.
 * Always runs in background, passively, minimal performance impact.
 */

interface BehaviorEvent {
  type: 'click' | 'scroll' | 'keypress' | 'navigate' | 'tab-switch';
  ts: number;
  data: Record<string, unknown>;
}

// ─── Manager ────────────────────────────────────────────────────────

export class BehaviorObserver {

  // === 1. Private state ===

  private win: BrowserWindow;
  private rawDir: string;
  private currentStream: fs.WriteStream | null = null;
  private currentDate: string = '';
  private eventCount = 0;
  private lastKeypressTs = 0;
  private keypressIntervals: number[] = [];
  private readonly MAX_SAMPLES = 1000;

  // === 2. Constructor ===

  constructor(win: BrowserWindow) {
    this.win = win;
    this.rawDir = tandemDir('behavior', 'raw');
    if (!fs.existsSync(this.rawDir)) {
      fs.mkdirSync(this.rawDir, { recursive: true });
    }
    this.setupTracking();
  }

  // === 4. Public methods ===

  // recordClick was removed — it was defined here but never called from
  // any caller in the codebase (no activity-tracker hook existed), so
  // click events were never observed. When we decide to learn a real
  // click-cadence profile, the wiring belongs in ActivityTracker on the
  // same webContents.before-input-event listener that handles keypress.

  /** Record a scroll event */
  recordScroll(deltaY: number, url?: string): void {
    this.record({ type: 'scroll', ts: Date.now(), data: { deltaY, url } });
  }

  /** Record a navigation event */
  recordNavigation(url: string, tabId?: string): void {
    this.record({ type: 'navigate', ts: Date.now(), data: { url, tabId } });
  }

  /** Record a tab switch */
  recordTabSwitch(tabId: string): void {
    this.record({ type: 'tab-switch', ts: Date.now(), data: { tabId } });
  }

  /** Get basic statistics */
  getStats(): Record<string, unknown> {
    const avgKeypressInterval = this.keypressIntervals.length > 0
      ? Math.round(this.keypressIntervals.reduce((a, b) => a + b, 0) / this.keypressIntervals.length)
      : null;

    // Count today's file lines
    let todayEvents = 0;
    const today = new Date().toISOString().slice(0, 10);
    const todayFile = path.join(this.rawDir, `${today}.jsonl`);
    if (fs.existsSync(todayFile)) {
      try {
        const content = fs.readFileSync(todayFile, 'utf-8');
        todayEvents = content.split('\n').filter(l => l.trim()).length;
      } catch (e) { log.warn('Behavior stats read failed:', e instanceof Error ? e.message : String(e)); }
    }

    // List all raw files
    let totalFiles = 0;
    try {
      totalFiles = fs.readdirSync(this.rawDir).filter(f => f.endsWith('.jsonl')).length;
    } catch (e) { log.warn('Behavior rawDir read failed:', e instanceof Error ? e.message : String(e)); }

    return {
      totalEventsSession: this.eventCount,
      todayEvents,
      totalFiles,
      avgKeypressIntervalMs: avgKeypressInterval,
      keypressSamples: this.keypressIntervals.length,
    };
  }

  // === 6. Cleanup ===

  /** Cleanup */
  destroy(): void {
    if (this.currentStream) {
      this.currentStream.end();
      this.currentStream = null;
    }
  }

  // === 7. Private helpers ===

  /** Get or create write stream for today's JSONL file */
  private getStream(): fs.WriteStream {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    if (today !== this.currentDate || !this.currentStream) {
      if (this.currentStream) {
        this.currentStream.end();
      }
      this.currentDate = today;
      const filePath = path.join(this.rawDir, `${today}.jsonl`);
      this.currentStream = fs.createWriteStream(filePath, { flags: 'a' });
    }
    return this.currentStream;
  }

  /** Append a behavior event */
  private record(event: BehaviorEvent): void {
    try {
      const stream = this.getStream();
      stream.write(JSON.stringify(event) + '\n');
      this.eventCount++;
    } catch (e) {
      log.warn('Behavior event write failed:', e instanceof Error ? e.message : String(e));
    }
  }

  /** Set up main process event tracking */
  private setupTracking(): void {
    const wc = this.win.webContents;

    // Only keyboard timing for now. Mouse position is not available on the
    // before-input-event payload, and webview mouse events live in a
    // different webContents; a click-cadence observer will come with the
    // full BehaviorCompiler rewrite.
    wc.on('before-input-event', (_event, input) => {
      const now = Date.now();

      if (input.type === 'keyDown' && input.key && input.key.length === 1) {
        // Track keyboard timing (interval between keystrokes).
        // NB: compute the interval BEFORE updating lastKeypressTs, so we
        // actually measure now-minus-previous rather than zero. An earlier
        // version persisted the post-update value and stored interval: 0
        // in every JSONL record.
        const prevTs = this.lastKeypressTs;
        const interval = prevTs > 0 ? now - prevTs : 0;
        if (prevTs > 0 && interval > 0 && interval < 5000) {
          if (this.keypressIntervals.length >= this.MAX_SAMPLES) {
            this.keypressIntervals.shift(); // Remove oldest
          }
          this.keypressIntervals.push(interval);
        }
        this.lastKeypressTs = now;
        this.record({
          type: 'keypress',
          ts: now,
          data: { interval },
        });
      }
    });

    log.info('🧬 Behavior observer active (passive mode)');
  }
}
