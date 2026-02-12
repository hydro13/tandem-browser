import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventStreamManager, BrowserEvent, BrowserEventType } from '../events/stream';

export interface ContextSnapshot {
  url: string;
  domain: string;
  title: string;
  summary: string;
  timestamp: number;
  headings: string[];
  linksCount: number;
  notes: string[];
}

/** Compact live context for AI consumption (~500 tokens max) */
export interface ContextSummary {
  activeTab: { url: string; title: string; tabId: string } | null;
  openTabs: Array<{ id: string; title: string; url: string }>;
  recentEvents: Array<{ type: BrowserEventType; url?: string; ago: string }>;
  voiceActive: boolean;
  text: string; // Pre-formatted text version
}

/**
 * ContextBridge — Makes everything Tandem reads available to external tools.
 * 
 * Stores context snapshots per URL in ~/.tandem/context/
 * Searchable, queryable via API. This is the bridge between Tandem and OpenClaw.
 */
export class ContextBridge {
  private contextDir: string;
  private indexPath: string;
  private index: Map<string, ContextSnapshot> = new Map();

  // Live context state (Fase 2.2)
  private activeTab: { url: string; title: string; tabId: string } | null = null;
  private openTabs: Array<{ id: string; title: string; url: string }> = [];
  private voiceActive = false;
  private eventStream: EventStreamManager | null = null;
  private unsubscribe: (() => void) | null = null;
  private contextChangeListeners = new Set<() => void>();

  constructor() {
    this.contextDir = path.join(os.homedir(), '.tandem', 'context');
    this.indexPath = path.join(this.contextDir, '_index.json');

    if (!fs.existsSync(this.contextDir)) {
      fs.mkdirSync(this.contextDir, { recursive: true });
    }

    this.loadIndex();
  }

  /** Load the index from disk */
  private loadIndex(): void {
    try {
      if (fs.existsSync(this.indexPath)) {
        const raw: ContextSnapshot[] = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
        for (const snap of raw) {
          this.index.set(snap.url, snap);
        }
      }
    } catch {
      // Start fresh
    }
  }

  /** Save the index to disk */
  private saveIndex(): void {
    try {
      const entries = Array.from(this.index.values());
      fs.writeFileSync(this.indexPath, JSON.stringify(entries, null, 2));
    } catch {
      // Silent fail
    }
  }

  /** Extract domain from URL */
  private getDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Record a context snapshot for a page visit.
   * Called from main process after page load.
   */
  recordSnapshot(url: string, title: string, textContent: string, headings: string[], linksCount: number): ContextSnapshot {
    if (!url || url.startsWith('file://') || url.startsWith('about:')) {
      // Skip internal pages
      return { url, domain: 'internal', title, summary: '', timestamp: Date.now(), headings: [], linksCount: 0, notes: [] };
    }

    const domain = this.getDomain(url);
    const summary = textContent.replace(/\s+/g, ' ').trim().substring(0, 1000);

    const existing = this.index.get(url);
    const notes = existing?.notes || [];

    const snapshot: ContextSnapshot = {
      url,
      domain,
      title,
      summary,
      timestamp: Date.now(),
      headings: headings.slice(0, 30),
      linksCount,
      notes,
    };

    this.index.set(url, snapshot);

    // Keep index reasonable (max 5000 entries, remove oldest)
    if (this.index.size > 5000) {
      const entries = Array.from(this.index.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, entries.length - 5000);
      for (const [key] of toRemove) {
        this.index.delete(key);
      }
    }

    this.saveIndex();
    return snapshot;
  }

  /** Get recent pages (last N visited) */
  getRecent(limit: number = 50): ContextSnapshot[] {
    return Array.from(this.index.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /** Search through all context snapshots */
  search(query: string): ContextSnapshot[] {
    const q = query.toLowerCase();
    return Array.from(this.index.values())
      .filter(snap => {
        const searchable = `${snap.title} ${snap.domain} ${snap.summary} ${snap.headings.join(' ')} ${snap.notes.join(' ')}`.toLowerCase();
        return searchable.includes(q);
      })
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100);
  }

  /** Get full context for a specific URL */
  getPage(url: string): ContextSnapshot | null {
    return this.index.get(url) || null;
  }

  /** Add a manual note to a page */
  addNote(url: string, note: string): ContextSnapshot | null {
    const snap = this.index.get(url);
    if (!snap) {
      // Create a minimal entry if page not yet visited
      const newSnap: ContextSnapshot = {
        url,
        domain: this.getDomain(url),
        title: '',
        summary: '',
        timestamp: Date.now(),
        headings: [],
        linksCount: 0,
        notes: [note],
      };
      this.index.set(url, newSnap);
      this.saveIndex();
      return newSnap;
    }

    snap.notes.push(note);
    this.saveIndex();
    return snap;
  }

  // ═══════════════════════════════════════════════
  // Live Context (Fase 2.2)
  // ═══════════════════════════════════════════════

  /** Connect to EventStreamManager and start tracking live context */
  connectEventStream(eventStream: EventStreamManager): void {
    this.eventStream = eventStream;

    this.unsubscribe = eventStream.subscribe((event) => {
      this.handleEvent(event);
    });
  }

  /** Update live tab list (call from main.ts when tabs change) */
  updateTabs(tabs: Array<{ id: string; title: string; url: string; active: boolean }>): void {
    this.openTabs = tabs.map(t => ({ id: t.id, title: t.title, url: t.url }));
    const active = tabs.find(t => t.active);
    if (active) {
      this.activeTab = { url: active.url, title: active.title, tabId: active.id };
    }
  }

  /** Update active tab info directly */
  updateActiveTab(tabId: string, url: string, title: string): void {
    this.activeTab = { tabId, url, title };
    this.notifyContextChange();
  }

  /** Set voice status */
  setVoiceActive(active: boolean): void {
    this.voiceActive = active;
  }

  /** Subscribe to context changes (for MCP notifications) */
  onContextChange(cb: () => void): () => void {
    this.contextChangeListeners.add(cb);
    return () => { this.contextChangeListeners.delete(cb); };
  }

  private notifyContextChange(): void {
    for (const cb of this.contextChangeListeners) {
      try { cb(); } catch { /* ignore */ }
    }
  }

  private handleEvent(event: BrowserEvent): void {
    // Update active tab on navigation/page-loaded/tab-focused
    if ((event.type === 'navigation' || event.type === 'page-loaded' || event.type === 'tab-focused') && event.tabId) {
      this.activeTab = {
        tabId: event.tabId,
        url: event.url || this.activeTab?.url || '',
        title: event.title || this.activeTab?.title || '',
      };
    }

    // Track voice status
    if (event.type === 'voice-input' && event.data) {
      if ('listening' in event.data) {
        this.voiceActive = event.data.listening as boolean;
      }
    }

    // Notify listeners on meaningful events
    const meaningfulEvents: BrowserEventType[] = ['navigation', 'page-loaded', 'tab-opened', 'tab-closed', 'tab-focused'];
    if (meaningfulEvents.includes(event.type)) {
      this.notifyContextChange();
    }
  }

  private timeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }

  /**
   * Get a compact context summary for AI consumption (~500 tokens max).
   * Format:
   *   Actieve tab: Google Search - https://google.com (tab-abc)
   *   Open tabs: 4 (Google, LinkedIn, GitHub, Tandem Settings)
   *   Laatste events: navigatie naar google.com (2s geleden), tab switch (15s geleden)
   *   Voice: inactief
   */
  getContextSummary(): ContextSummary {
    const recentEvents = this.eventStream
      ? this.eventStream.getRecent(10).reverse().map(e => ({
          type: e.type,
          url: e.url,
          ago: this.timeAgo(e.timestamp),
        }))
      : [];

    // Build text summary
    let text = '';

    // Active tab
    if (this.activeTab) {
      text += `Actieve tab: ${this.activeTab.title || 'Untitled'} — ${this.activeTab.url} (${this.activeTab.tabId})\n`;
    } else {
      text += `Actieve tab: geen\n`;
    }

    // Open tabs
    if (this.openTabs.length > 0) {
      const names = this.openTabs.map(t => t.title || 'untitled').join(', ');
      text += `Open tabs: ${this.openTabs.length} (${names})\n`;
    } else {
      text += `Open tabs: 0\n`;
    }

    // Recent events
    if (recentEvents.length > 0) {
      const eventDescs = recentEvents.slice(0, 5).map(e => {
        if (e.url) {
          try {
            const hostname = new URL(e.url).hostname;
            return `${e.type} → ${hostname} (${e.ago})`;
          } catch {
            return `${e.type} (${e.ago})`;
          }
        }
        return `${e.type} (${e.ago})`;
      });
      text += `Laatste events: ${eventDescs.join(', ')}\n`;
    }

    // Voice
    text += `Voice: ${this.voiceActive ? 'actief (luistert)' : 'inactief'}\n`;

    return {
      activeTab: this.activeTab,
      openTabs: this.openTabs,
      recentEvents,
      voiceActive: this.voiceActive,
      text,
    };
  }

  /** Cleanup */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.contextChangeListeners.clear();
  }
}
