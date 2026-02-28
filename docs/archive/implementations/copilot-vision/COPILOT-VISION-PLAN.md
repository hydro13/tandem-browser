# Copilot Vision — Real-Time Activity Stream to OpenClaw

## Goal
Give Kees (AI copilot on OpenClaw) real-time awareness of what Robin does in Tandem. Currently Kees is blind unless he actively polls. After this: Tandem pushes activity events via webhook so Kees sees everything as it happens.

## Architecture
Same pattern as the existing chat bridge webhook in `PanelManager.fireWebhook()`:
- Tandem fires HTTP POST to `http://127.0.0.1:18789/api/sessions/main/events`
- Events are lightweight JSON, debounced where needed
- Non-blocking, silent fail if OpenClaw is not running

## New File: `src/activity/copilot-stream.ts`

Single new class: `CopilotStream`

```typescript
interface CopilotEvent {
  type: 'tab-switched' | 'navigated' | 'page-loaded' | 'tab-opened' | 'tab-closed' | 'text-selected' | 'scroll-position' | 'form-interaction';
  tabId: string;
  timestamp: number;
  data: Record<string, unknown>;
}
```

### Event Types

| Event | Trigger | Data | Debounce |
|-------|---------|------|----------|
| `tab-switched` | User switches active tab | `{ tabId, url, title }` | none |
| `navigated` | URL changes in any tab | `{ tabId, url, title, fromUrl }` | none |
| `page-loaded` | Page finished loading | `{ tabId, url, title, loadTimeMs }` | none |
| `tab-opened` | New tab created by user | `{ tabId, url, source }` | none |
| `tab-closed` | Tab closed by user | `{ tabId, url, title }` | none |
| `text-selected` | User selects text on page | `{ tabId, text (max 500 chars), url }` | 1000ms |
| `scroll-position` | User scrolls | `{ tabId, scrollPercent, url }` | 3000ms |
| `form-interaction` | User focuses/types in form field | `{ tabId, fieldType, fieldName, url }` | 2000ms (no values! privacy) |

### What NOT to stream
- Passwords, form values, or sensitive input content
- Mouse movements (too noisy)
- Hover events
- Any data from incognito/private tabs (if ever added)

## Implementation

### Step 1: Create `src/activity/copilot-stream.ts`

```typescript
import { ConfigManager } from '../config/manager';

interface CopilotEvent {
  type: string;
  tabId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export class CopilotStream {
  private configManager: ConfigManager;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private enabled: boolean = true;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  /** Send event to OpenClaw (non-blocking) */
  async emit(event: CopilotEvent): Promise<void> {
    if (!this.enabled) return;
    const config = this.configManager.getConfig();
    if (!config.webhook?.enabled || !config.webhook?.url) return;

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
      // Silent fail
    }
  }

  /** Debounced emit — groups rapid-fire events */
  emitDebounced(key: string, event: CopilotEvent, delayMs: number): void {
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    this.debounceTimers.set(key, setTimeout(() => {
      this.debounceTimers.delete(key);
      this.emit(event);
    }, delayMs));
  }

  /** Format event as readable text for Kees */
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

  /** Cleanup timers */
  destroy(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
```

### Step 2: Add config option

In `src/config/manager.ts`, add to the `webhook` section of `TandemConfig`:

```typescript
webhook: {
  enabled: boolean;
  url: string;
  secret: string;
  notifyOnRobinChat: boolean;
  notifyOnActivity: boolean;  // NEW — stream activity events to OpenClaw
};
```

Default: `notifyOnActivity: true`

### Step 3: Wire up in `src/activity/tracker.ts`

The `ActivityTracker` already receives all webview events via `onWebviewEvent()`. Add `CopilotStream` as a dependency and emit events:

```typescript
import { CopilotStream } from './copilot-stream';

export class ActivityTracker {
  // ... existing fields ...
  private copilotStream?: CopilotStream;

  constructor(win: BrowserWindow, panelManager: PanelManager, drawManager: DrawOverlayManager, copilotStream?: CopilotStream) {
    // ... existing ...
    this.copilotStream = copilotStream;
  }

  onWebviewEvent(data: { type: string; url?: string; tabId?: string; [key: string]: unknown }): void {
    // ... existing logging code ...

    // Stream to Kees
    if (this.copilotStream) {
      this.streamToKees(data);
    }
  }

  private streamToKees(data: Record<string, unknown>): void {
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
}
```

### Step 4: Wire up in `src/tabs/manager.ts`

The TabManager handles tab switching, opening, and closing. It should emit tab-level events to the ActivityTracker (if not already doing so). Check if `tab-switch`, `tab-open`, and `tab-close` events are already being forwarded. If not, add them:

```typescript
// In switchTab():
this.activityTracker?.onWebviewEvent({
  type: 'tab-switch',
  tabId: tab.id,
  url: tab.webContents.getURL(),
  title: tab.webContents.getTitle(),
});

// In createTab() — only for user-initiated:
this.activityTracker?.onWebviewEvent({
  type: 'tab-open',
  tabId: tab.id,
  url: options.url,
  source: options.source || 'robin',
});

// In closeTab():
this.activityTracker?.onWebviewEvent({
  type: 'tab-close',
  tabId: tab.id,
  url: tab.webContents.getURL(),
  title: tab.webContents.getTitle(),
});
```

### Step 5: Text selection events from renderer

Text selection happens in the webview content. We need a **safe** way to detect it without injecting scripts that could be detected by anti-bot systems.

Option A (preferred): Use Electron's `webContents` selection API:
```typescript
// In the webContents setup for each tab:
webContents.on('context-menu', (event, params) => {
  if (params.selectionText) {
    activityTracker.onWebviewEvent({
      type: 'text-selected',
      tabId: tab.id,
      text: params.selectionText,
      url: webContents.getURL(),
    });
  }
});
```

Note: This only fires on right-click with selection. For continuous selection tracking, we'd need the preload script to listen for `selectionchange` — but check if `context-bridge.ts` already exposes this. If not, add to preload:

```typescript
// In preload.ts or context-bridge.ts:
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection()?.toString().trim();
  if (sel && sel.length > 10) { // Only meaningful selections
    window.electronAPI.sendActivity('text-selected', { text: sel.substring(0, 500) });
  }
});
```

**Important**: Wrap in a debounce (500ms) in the renderer to avoid flooding.

### Step 6: Scroll position from renderer

Similar to text selection, scroll events need renderer cooperation:

```typescript
// In preload.ts or context-bridge.ts:
let scrollTimer: number | null = null;
window.addEventListener('scroll', () => {
  if (scrollTimer) clearTimeout(scrollTimer);
  scrollTimer = window.setTimeout(() => {
    const scrollPercent = Math.round(
      (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
    );
    window.electronAPI.sendActivity('scroll', { scrollPercent });
  }, 1000); // 1s debounce in renderer + 3s debounce in CopilotStream
}, { passive: true });
```

### Step 7: Instantiate in `src/main.ts`

```typescript
import { CopilotStream } from './activity/copilot-stream';

// After ConfigManager is ready:
const copilotStream = new CopilotStream(configManager);

// Pass to ActivityTracker constructor:
const activityTracker = new ActivityTracker(win, panelManager, drawManager, copilotStream);
```

### Step 8: API endpoint to toggle stream

Add to `src/api/server.ts`:

```typescript
// POST /copilot-stream/toggle — enable/disable activity streaming
this.app.post('/copilot-stream/toggle', (req: Request, res: Response) => {
  const { enabled } = req.body;
  this.copilotStream.setEnabled(!!enabled);
  res.json({ ok: true, enabled: !!enabled });
});

// GET /copilot-stream/status — check if streaming is active
this.app.get('/copilot-stream/status', (req: Request, res: Response) => {
  res.json({ ok: true, enabled: this.copilotStream.isEnabled() });
});
```

## Files to Create
1. `src/activity/copilot-stream.ts` — new file (the CopilotStream class)

## Files to Modify
1. `src/config/manager.ts` — add `notifyOnActivity` to webhook config + default
2. `src/activity/tracker.ts` — add CopilotStream dependency + `streamToKees()` method
3. `src/tabs/manager.ts` — emit tab-switch/open/close events to ActivityTracker (if not already)
4. `src/main.ts` — instantiate CopilotStream, pass to ActivityTracker
5. `src/api/server.ts` — add toggle/status endpoints
6. `src/preload.ts` or `src/bridge/context-bridge.ts` — add selectionchange + scroll listeners with `electronAPI.sendActivity()`

## Anti-Detect Safety
- Selection + scroll listeners go in the **preload script** (isolated world), NOT injected into page context
- All listeners use `passive: true` where applicable
- No DOM manipulation, no MutationObservers on page content
- The `electronAPI.sendActivity` IPC channel is invisible to page JavaScript

## Config
```json
{
  "webhook": {
    "enabled": true,
    "url": "http://127.0.0.1:18789",
    "secret": "",
    "notifyOnRobinChat": true,
    "notifyOnActivity": true
  }
}
```

## Testing
1. Start Tandem with `npm start`
2. Check OpenClaw is running on 18789
3. Browse normally — switch tabs, navigate, select text, scroll
4. Kees should receive events as system events in the main session
5. Test toggle: `curl -X POST http://127.0.0.1:8765/copilot-stream/toggle -H 'Content-Type: application/json' -d '{"enabled":false}'`
6. Verify no events are sent when disabled
7. Verify agent-initiated actions (source: 'kees') are NOT streamed (prevent echo loops)

## Edge Cases
- **Don't stream Kees' own actions**: Filter out events where source is 'kees' or 'agent' to prevent feedback loops
- **Don't stream during typing in chat panel**: The chat panel is internal UI, not browsing activity
- **Rate limit**: If more than 10 events/second somehow happen, drop excess (safety valve)
- **OpenClaw down**: Silent fail, no retries, no queue — events are ephemeral
