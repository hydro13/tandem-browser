import type { Request, Response } from 'express';
import { buildTabOwnershipContext, type TabOwnershipContext } from '../tabs/context';

// ─── Types ──────────────────────────────────────────────────────────

export type BrowserEventType =
  | 'navigation'     | 'page-loaded'   | 'tab-opened'
  | 'tab-closed'     | 'tab-focused'   | 'click'
  | 'form-submit'    | 'scroll'        | 'voice-input'
  | 'screenshot'     | 'error';

export interface BrowserEvent {
  id: number;
  type: BrowserEventType;
  timestamp: number;
  tabId?: string;
  url?: string;
  title?: string;
  data?: Record<string, unknown>;
  context: TabOwnershipContext;
}

// ─── Constants ──────────────────────────────────────────────────────

const MAX_EVENTS = 100;
const SCROLL_DEBOUNCE_MS = 5000;

// ─── Manager ────────────────────────────────────────────────────────

/**
 * EventStreamManager — real-time browser event bus with SSE streaming.
 */
export class EventStreamManager {

  // === 1. Private state ===

  private listeners = new Set<(event: BrowserEvent) => void>();
  private recentEvents: BrowserEvent[] = [];
  private eventCounter = 0;
  private lastScrollTime = 0;
  private contextResolver: ((opts: {
    type: BrowserEventType;
    tabId?: string;
    url?: string;
    title?: string;
  }) => TabOwnershipContext) | null = null;

  // === 4. Public methods ===

  /** Wire a resolver that enriches emitted events with workspace/source ownership context. */
  setContextResolver(resolver: ((opts: {
    type: BrowserEventType;
    tabId?: string;
    url?: string;
    title?: string;
  }) => TabOwnershipContext) | null): void {
    this.contextResolver = resolver;
  }

  // --- IPC Handlers ---

  /** Handle webview events from IPC (activity-webview-event) */
  handleWebviewEvent(data: { type: string; url?: string; tabId?: string; title?: string; context?: TabOwnershipContext }): void {
    switch (data.type) {
      case 'did-navigate':
      case 'did-navigate-in-page':
        this.emit(this.createEvent('navigation', {
          tabId: data.tabId,
          url: data.url,
          title: data.title,
          context: data.context,
        }));
        break;

      case 'did-finish-load':
        this.emit(this.createEvent('page-loaded', {
          tabId: data.tabId,
          url: data.url,
          title: data.title,
          context: data.context,
        }));
        break;

      case 'did-start-navigation':
        // Ignored — we emit on did-navigate instead
        break;
    }
  }

  /** Handle tab lifecycle events from IPC (tab-update, tab-register) */
  handleTabEvent(eventType: 'tab-opened' | 'tab-closed' | 'tab-focused' | 'tab-updated', data: { tabId?: string; url?: string; title?: string; context?: TabOwnershipContext }): void {
    switch (eventType) {
      case 'tab-opened':
        this.emit(this.createEvent('tab-opened', data));
        break;

      case 'tab-closed':
        this.emit(this.createEvent('tab-closed', data));
        break;

      case 'tab-focused':
        this.emit(this.createEvent('tab-focused', data));
        break;

      case 'tab-updated':
        // Tab metadata updates (title/url change) — not a separate event type,
        // navigations are already covered by handleWebviewEvent
        break;
    }
  }

  /** Handle form submission events */
  handleFormSubmit(data: { url?: string; tabId?: string; fields?: unknown; context?: TabOwnershipContext }): void {
    this.emit(this.createEvent('form-submit', {
      url: data.url,
      tabId: data.tabId,
      data: { fieldCount: Array.isArray(data.fields) ? data.fields.length : 0 },
      context: data.context,
    }));
  }

  /** Handle voice transcript events */
  handleVoiceInput(data: { text: string; isFinal: boolean }): void {
    if (!data.isFinal) return; // Only emit final transcripts
    this.emit(this.createEvent('voice-input', {
      data: { text: data.text },
    }));
  }

  /** Handle voice status changes */
  handleVoiceStatus(data: { listening: boolean }): void {
    this.emit(this.createEvent('voice-input', {
      data: { listening: data.listening },
    }));
  }

  /** Handle scroll events — debounced to max 1 per 5 seconds */
  handleScroll(data: { tabId?: string; url?: string; context?: TabOwnershipContext }): void {
    const now = Date.now();
    if (now - this.lastScrollTime < SCROLL_DEBOUNCE_MS) return;
    this.lastScrollTime = now;

    this.emit(this.createEvent('scroll', {
      tabId: data.tabId,
      url: data.url,
      context: data.context,
    }));
  }

  /** Emit an error event */
  handleError(message: string, data?: Record<string, unknown>, context?: TabOwnershipContext): void {
    this.emit(this.createEvent('error', {
      data: { message, ...data },
      context,
    }));
  }

  // --- Subscribe / Query ---

  /** Subscribe to events. Returns an unsubscribe function. */
  subscribe(cb: (event: BrowserEvent) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Get recent events (from ring buffer) */
  getRecent(limit?: number): BrowserEvent[] {
    if (!limit) return [...this.recentEvents];
    return this.recentEvents.slice(-limit);
  }

  // --- SSE Handler ---

  /** Express middleware for SSE endpoint: GET /events/stream */
  sseHandler = (req: Request, res: Response): void => {
    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial comment to establish connection
    res.write(': connected\n\n');

    // Send recent events as catchup (last 10)
    const recent = this.getRecent(10);
    for (const event of recent) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // Subscribe to new events
    const unsubscribe = this.subscribe((event) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // Client disconnected
        unsubscribe();
      }
    });

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
        unsubscribe();
      }
    }, 30000);

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  };

  // === 7. Private helpers ===

  private emit(event: BrowserEvent): void {
    // Ring buffer: push and trim
    this.recentEvents.push(event);
    if (this.recentEvents.length > MAX_EVENTS) {
      this.recentEvents.shift();
    }

    // Notify all subscribers
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Don't let a broken listener crash the stream
      }
    }
  }

  private createEvent(type: BrowserEventType, opts: {
    tabId?: string;
    url?: string;
    title?: string;
    data?: Record<string, unknown>;
    context?: TabOwnershipContext;
  } = {}): BrowserEvent {
    const context = opts.context
      ?? this.contextResolver?.({
        type,
        tabId: opts.tabId,
        url: opts.url,
        title: opts.title,
      })
      ?? buildTabOwnershipContext({ scope: opts.tabId ? 'tab' : 'global' });

    return {
      id: ++this.eventCounter,
      type,
      timestamp: Date.now(),
      tabId: opts.tabId,
      url: opts.url,
      title: opts.title,
      data: opts.data,
      context,
    };
  }
}
