import type { BrowserWindow } from 'electron';
import type { PanelManager } from '../panel/manager';
import type { ActivityEvent } from '../panel/manager';
import type { DrawOverlayManager } from '../draw/overlay';
import type { WingmanStream } from './wingman-stream';
import { createLogger } from '../utils/logger';
import { hostnameMatches, tryParseUrl, urlHasProtocol } from '../utils/security';

const log = createLogger('ActivityTracker');
const PANEL_ACTIVITY_TYPES: ReadonlySet<ActivityEvent['type']> = new Set([
  'navigate',
  'click',
  'scroll',
  'input',
  'tab-switch',
  'tab-open',
  'tab-close',
]);

function isPanelActivityType(value: string): value is ActivityEvent['type'] {
  return PANEL_ACTIVITY_TYPES.has(value as ActivityEvent['type']);
}

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
  private wingmanStream?: WingmanStream;
  private log: ActivityEntry[] = [];
  private counter = 0;
  private maxEntries = 1000;
  private autoSnapshotEnabled = false; // Disabled until stable

  constructor(win: BrowserWindow, panelManager: PanelManager, drawManager: DrawOverlayManager, wingmanStream?: WingmanStream) {
    this.win = win;
    this.panelManager = panelManager;
    this.drawManager = drawManager;
    this.wingmanStream = wingmanStream;
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
    if (isPanelActivityType(data.type)) {
      this.panelManager.logActivity(data.type, data as Record<string, unknown>);
    }

    // Stream to Wingman (Wingman Vision)
    if (this.wingmanStream) {
      this.streamToWingman(data);
    }

    // Auto-snapshot on navigation (skip initial loads and internal pages)
    if (this.autoSnapshotEnabled && data.type === 'did-navigate' && data.url && this.counter > 5) {
      const url = data.url as string;
      const parsedUrl = tryParseUrl(url);
      if (parsedUrl && urlHasProtocol(parsedUrl, 'http:', 'https:') && !hostnameMatches(parsedUrl, 'duckduckgo.com')) {
        setTimeout(() => {
          try {
            this.win.webContents.send('auto-snapshot-request', { url });
          } catch (e) { log.warn('Auto-snapshot send failed (window may be closed):', e instanceof Error ? e.message : String(e)); }
        }, 3000);
      }
    }
  }

  /** Stream activity events to Wingman via WingmanStream */
  private streamToWingman(data: Record<string, unknown>): void {
    if (!this.wingmanStream) return;
    const tabId = (data.tabId as string) || 'unknown';
    const timestamp = Date.now();

    switch (data.type) {
      case 'did-navigate':
      case 'did-navigate-in-page':
        void this.wingmanStream.emit({
          type: 'navigated',
          tabId,
          timestamp,
          data: { url: data.url, title: data.title || '', fromUrl: data.fromUrl || '' },
        });
        break;

      case 'did-finish-load':
        void this.wingmanStream.emit({
          type: 'page-loaded',
          tabId,
          timestamp,
          data: { url: data.url, title: data.title || '', loadTimeMs: data.loadTimeMs || 0 },
        });
        break;

      case 'tab-switch':
        void this.wingmanStream.emit({
          type: 'tab-switched',
          tabId,
          timestamp,
          data: { url: data.url, title: data.title || '' },
        });
        break;

      case 'tab-open':
        // Only stream user-initiated opens (source: 'robin'), not agent opens
        if (data.source === 'robin') {
          void this.wingmanStream.emit({
            type: 'tab-opened',
            tabId,
            timestamp,
            data: { url: data.url, source: data.source },
          });
        }
        break;

      case 'tab-close':
        void this.wingmanStream.emit({
          type: 'tab-closed',
          tabId,
          timestamp,
          data: { url: data.url, title: data.title || '' },
        });
        break;

      case 'text-selected':
        if (data.text) {
          const text = (data.text as string).substring(0, 500);
          this.wingmanStream.emitDebounced(`select-${tabId}`, {
            type: 'text-selected',
            tabId,
            timestamp,
            data: { text, url: data.url },
          }, 1000);
        }
        break;

      case 'scroll':
        this.wingmanStream.emitDebounced(`scroll-${tabId}`, {
          type: 'scroll-position',
          tabId,
          timestamp,
          data: { scrollPercent: data.scrollPercent, url: data.url },
        }, 3000);
        break;

      case 'input-focus':
        this.wingmanStream.emitDebounced(`form-${tabId}`, {
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
