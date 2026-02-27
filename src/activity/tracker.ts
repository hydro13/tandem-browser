import { BrowserWindow } from 'electron';
import { PanelManager } from '../panel/manager';
import { DrawOverlayManager } from '../draw/overlay';
import { CopilotStream } from './copilot-stream';

export interface ActivityEntry {
  id: number;
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

/**
 * ActivityTracker — Tracks navigation, clicks, scrolls via Electron webview events.
 *
 * CRITICAL: All tracking happens via Electron main process events,
 * NOT via injected scripts in the webview. Anti-detect safe.
 *
 * Auto-snapshots on navigation events.
 */
export class ActivityTracker {
  private win: BrowserWindow;
  private panelManager: PanelManager;
  private drawManager: DrawOverlayManager;
  private copilotStream?: CopilotStream;
  private log: ActivityEntry[] = [];
  private counter = 0;
  private maxEntries = 1000;
  private autoSnapshotEnabled = false; // Disabled until stable

  constructor(win: BrowserWindow, panelManager: PanelManager, drawManager: DrawOverlayManager, copilotStream?: CopilotStream) {
    this.win = win;
    this.panelManager = panelManager;
    this.drawManager = drawManager;
    this.copilotStream = copilotStream;
  }

  /** Handle webview event forwarded from renderer */
  onWebviewEvent(data: { type: string; url?: string; tabId?: string; [key: string]: unknown }): void {
    const entry: ActivityEntry = {
      id: ++this.counter,
      type: data.type,
      timestamp: Date.now(),
      data,
    };
    this.log.push(entry);
    if (this.log.length > this.maxEntries) {
      this.log = this.log.slice(-this.maxEntries);
    }

    // Log to panel
    this.panelManager.logActivity(
      data.type as any,
      data as Record<string, unknown>
    );

    // Stream to Copilot (Copilot Vision)
    if (this.copilotStream) {
      this.streamToCopilot(data);
    }

    // Auto-snapshot on navigation (skip initial loads and internal pages)
    if (this.autoSnapshotEnabled && data.type === 'did-navigate' && data.url && this.counter > 5) {
      const url = data.url as string;
      if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
        setTimeout(() => {
          try {
            this.win.webContents.send('auto-snapshot-request', { url });
          } catch (e) { console.warn('Auto-snapshot send failed (window may be closed):', e instanceof Error ? e.message : String(e)); }
        }, 3000);
      }
    }
  }

  /** Stream activity events to Copilot via CopilotStream */
  private streamToCopilot(data: Record<string, unknown>): void {
    if (!this.copilotStream) return;
    const tabId = (data.tabId as string) || 'unknown';
    const timestamp = Date.now();

    switch (data.type) {
      case 'did-navigate':
      case 'did-navigate-in-page':
        this.copilotStream.emit({
          type: 'navigated',
          tabId,
          timestamp,
          data: { url: data.url, title: data.title || '', fromUrl: data.fromUrl || '' },
        });
        break;

      case 'did-finish-load':
        this.copilotStream.emit({
          type: 'page-loaded',
          tabId,
          timestamp,
          data: { url: data.url, title: data.title || '', loadTimeMs: data.loadTimeMs || 0 },
        });
        break;

      case 'tab-switch':
        this.copilotStream.emit({
          type: 'tab-switched',
          tabId,
          timestamp,
          data: { url: data.url, title: data.title || '' },
        });
        break;

      case 'tab-open':
        // Only stream user-initiated opens (source: 'robin'), not agent opens
        if (data.source === 'robin') {
          this.copilotStream.emit({
            type: 'tab-opened',
            tabId,
            timestamp,
            data: { url: data.url, source: data.source },
          });
        }
        break;

      case 'tab-close':
        this.copilotStream.emit({
          type: 'tab-closed',
          tabId,
          timestamp,
          data: { url: data.url, title: data.title || '' },
        });
        break;

      case 'text-selected':
        if (data.text) {
          const text = (data.text as string).substring(0, 500);
          this.copilotStream.emitDebounced(`select-${tabId}`, {
            type: 'text-selected',
            tabId,
            timestamp,
            data: { text, url: data.url },
          }, 1000);
        }
        break;

      case 'scroll':
        this.copilotStream.emitDebounced(`scroll-${tabId}`, {
          type: 'scroll-position',
          tabId,
          timestamp,
          data: { scrollPercent: data.scrollPercent, url: data.url },
        }, 3000);
        break;

      case 'input-focus':
        this.copilotStream.emitDebounced(`form-${tabId}`, {
          type: 'form-interaction',
          tabId,
          timestamp,
          data: { fieldType: data.fieldType, fieldName: data.fieldName, url: data.url },
        }, 2000);
        break;
    }
  }

  /** Get activity log */
  getLog(limit: number = 100, since?: number): ActivityEntry[] {
    let entries = this.log;
    if (since) {
      entries = entries.filter(e => e.timestamp > since);
    }
    return entries.slice(-limit);
  }

  /** Enable/disable auto-snapshot */
  setAutoSnapshot(enabled: boolean): void {
    this.autoSnapshotEnabled = enabled;
  }
}
