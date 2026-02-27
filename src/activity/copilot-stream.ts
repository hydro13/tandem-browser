import type { ConfigManager } from '../config/manager';

interface CopilotEvent {
  type: string;
  tabId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

/**
 * CopilotStream — Pushes real-time activity events to OpenClaw
 * so the AI copilot can see what the human is doing in Tandem.
 *
 * Same webhook pattern as PanelManager.fireWebhook().
 * Non-blocking, silent fail if OpenClaw is not running.
 */
export class CopilotStream {
  private configManager: ConfigManager;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private enabled: boolean = true;
  private eventCount: number = 0;
  private rateLimitResetTime: number = 0;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  /** Send event to OpenClaw (non-blocking) */
  async emit(event: CopilotEvent): Promise<void> {
    if (!this.enabled) return;
    const config = this.configManager.getConfig();
    if (!config.webhook?.enabled || !config.webhook?.url || !config.webhook?.notifyOnActivity) return;

    // Rate limit: max 10 events/second
    const now = Date.now();
    if (now > this.rateLimitResetTime) {
      this.eventCount = 0;
      this.rateLimitResetTime = now + 1000;
    }
    if (++this.eventCount > 10) return;

    const url = config.webhook.url.replace(/\/$/, '');

    try {
      await fetch(`${url}/api/sessions/main/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.webhook.secret ? { 'Authorization': `Bearer ${config.webhook.secret}` } : {}),
        },
        body: JSON.stringify({
          type: 'tandem-activity',
          text: this.formatEventText(event),
          metadata: {
            eventType: event.type,
            tabId: event.tabId,
            timestamp: event.timestamp,
            source: 'tandem-browser',
            ...event.data,
          },
        }),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // Silent fail — OpenClaw may not be running
    }
  }

  /** Debounced emit — groups rapid-fire events */
  emitDebounced(key: string, event: CopilotEvent, delayMs: number): void {
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    this.debounceTimers.set(key, setTimeout(() => {
      this.debounceTimers.delete(key);
      void this.emit(event);
    }, delayMs));
  }

  /** Format event as readable text for the AI copilot */
  private formatEventText(event: CopilotEvent): string {
    switch (event.type) {
      case 'tab-switched':
        return `[Tandem] Robin switched to tab: ${event.data.title} (${event.data.url})`;
      case 'navigated':
        return `[Tandem] Robin navigated to: ${event.data.url} (${event.data.title})`;
      case 'page-loaded':
        return `[Tandem] Page loaded: ${event.data.title} (${event.data.url}) in ${event.data.loadTimeMs}ms`;
      case 'tab-opened':
        return `[Tandem] Robin opened new tab: ${event.data.url}`;
      case 'tab-closed':
        return `[Tandem] Robin closed tab: ${event.data.title} (${event.data.url})`;
      case 'text-selected':
        return `[Tandem] Robin selected text on ${event.data.url}: "${event.data.text}"`;
      case 'scroll-position':
        return `[Tandem] Robin scrolled to ${event.data.scrollPercent}% on ${event.data.url}`;
      case 'form-interaction':
        return `[Tandem] Robin interacting with ${event.data.fieldType} field "${event.data.fieldName}" on ${event.data.url}`;
      default:
        return `[Tandem] Activity: ${event.type}`;
    }
  }

  /** Toggle stream on/off */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Check if stream is enabled */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Cleanup timers */
  destroy(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
