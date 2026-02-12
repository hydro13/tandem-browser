import { BrowserWindow, app } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';

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

export class BehaviorObserver {
  private win: BrowserWindow;
  private rawDir: string;
  private currentStream: fs.WriteStream | null = null;
  private currentDate: string = '';
  private eventCount = 0;
  private lastKeypressTs = 0;
  private keypressIntervals: number[] = [];
  private clickTimestamps: number[] = [];
  private readonly MAX_SAMPLES = 1000;

  constructor(win: BrowserWindow) {
    this.win = win;
    const tandemDir = path.join(os.homedir(), '.tandem', 'behavior', 'raw');
    this.rawDir = tandemDir;
    if (!fs.existsSync(tandemDir)) {
      fs.mkdirSync(tandemDir, { recursive: true });
    }
    this.setupTracking();
  }

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
    } catch (e: any) {
      console.warn('Behavior event write failed:', e.message);
    }
  }

  /** Set up main process event tracking */
  private setupTracking(): void {
    const wc = this.win.webContents;

    // Track mouse clicks via input events on the shell window
    wc.on('before-input-event', (_event, input) => {
      const now = Date.now();

      if (input.type === 'mouseDown' || input.type === 'mouseUp') {
        // We can't easily get mouse position from before-input-event for mouse,
        // so we track keyboard timing here instead
      }

      if (input.type === 'keyDown' && input.key && input.key.length === 1) {
        // Track keyboard timing (interval between keystrokes)
        if (this.lastKeypressTs > 0) {
          const interval = now - this.lastKeypressTs;
          if (interval < 5000) { // Only track reasonable intervals
            // Efficient circular buffer management
            if (this.keypressIntervals.length >= this.MAX_SAMPLES) {
              this.keypressIntervals.shift(); // Remove oldest
            }
            this.keypressIntervals.push(interval);
          }
        }
        this.lastKeypressTs = now;
        this.record({
          type: 'keypress',
          ts: now,
          data: { interval: this.lastKeypressTs > 0 ? now - this.lastKeypressTs : 0 },
        });
      }
    });

    console.log('🧬 Behavior observer active (passive mode)');
  }

  /** Record a click event (called from activity tracker) */
  recordClick(x: number, y: number): void {
    const now = Date.now();
    // Efficient circular buffer management
    if (this.clickTimestamps.length >= this.MAX_SAMPLES) {
      this.clickTimestamps.shift(); // Remove oldest
    }
    this.clickTimestamps.push(now);
    this.record({ type: 'click', ts: now, data: { x, y } });
  }

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

    // Average click delay (time between consecutive clicks)
    let avgClickDelay: number | null = null;
    if (this.clickTimestamps.length > 1) {
      const delays: number[] = [];
      for (let i = 1; i < this.clickTimestamps.length; i++) {
        delays.push(this.clickTimestamps[i] - this.clickTimestamps[i - 1]);
      }
      avgClickDelay = Math.round(delays.reduce((a, b) => a + b, 0) / delays.length);
    }

    // Count today's file lines
    let todayEvents = 0;
    const today = new Date().toISOString().slice(0, 10);
    const todayFile = path.join(this.rawDir, `${today}.jsonl`);
    if (fs.existsSync(todayFile)) {
      try {
        const content = fs.readFileSync(todayFile, 'utf-8');
        todayEvents = content.split('\n').filter(l => l.trim()).length;
      } catch (e: any) { console.warn('Behavior stats read failed:', e.message); }
    }

    // List all raw files
    let totalFiles = 0;
    try {
      totalFiles = fs.readdirSync(this.rawDir).filter(f => f.endsWith('.jsonl')).length;
    } catch (e: any) { console.warn('Behavior rawDir read failed:', e.message); }

    return {
      totalEventsSession: this.eventCount,
      todayEvents,
      totalFiles,
      avgKeypressIntervalMs: avgKeypressInterval,
      avgClickDelayMs: avgClickDelay,
      keypressSamples: this.keypressIntervals.length,
      clickSamples: this.clickTimestamps.length,
    };
  }

  /** Cleanup */
  destroy(): void {
    if (this.currentStream) {
      this.currentStream.end();
      this.currentStream = null;
    }
  }
}
