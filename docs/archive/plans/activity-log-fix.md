# Activity Log Fix — Route CDP Events to ActivityTracker + Filter Endpoint

## Problem
CDP Wingman Vision events (scroll, text selection, form focus) go to WingmanStream → webhook → nowhere (OpenClaw has no inbound event endpoint). Meanwhile the existing `/activity-log` endpoint only contains basic webview events (loading-start, loading-stop, did-navigate).

## Solution
1. Route CDP events into the existing ActivityTracker so they appear in `/activity-log`
2. Add type filtering to `/activity-log` so Kees can query only relevant events
3. Drop the webhook approach entirely — Kees reads `/activity-log` via pull instead or push

## Changes

### Step 1: Give DevToolsManager access to ActivityTracker

File: `src/devtools/manager.ts`

Add ActivityTracker as a dependency alongside WingmanStream:

```typescript
import { ActivityTracker } from '../activity/tracker';

// Add to class fields:
private activityTracker?: ActivityTracker;

// Add setter (same pattern as setWingmanStream):
setActivityTracker(tracker: ActivityTracker): void {
  this.activityTracker = tracker;
}
```

### Step 2: Write CDP events to ActivityTracker

File: `src/devtools/manager.ts`

In `onWingmanBinding()`, after each WingmanStream call, also write to ActivityTracker:

```typescript
private onWingmanBinding(params: { name: string; payload: string }, tabId?: string): void {
  if (!this.wingmanStream) return;
  const timestamp = Date.now();
  const tab = tabId || 'unknown';
  const wc = this.attachedWcId ? webContents.fromId(this.attachedWcId) : null;
  const url = wc && !wc.isDestroyed() ? wc.getURL() : '';

  switch (params.name) {
    case '__tandemScroll':
      const scrollPct = parseInt(params.payload, 10);
      this.wingmanStream.emitDebounced(`scroll-${tab}`, {
        type: 'scroll-position', tabId: tab, timestamp,
        data: { scrollPercent: scrollPct, url },
      }, 3000);
      // Also log to ActivityTracker
      this.activityTracker?.onWebviewEvent({
        type: 'scroll-position', tabId: tab, scrollPercent: scrollPct, url,
      });
      break;

    case '__tandemSelection':
      this.wingmanStream.emitDebounced(`select-${tab}`, {
        type: 'text-selected', tabId: tab, timestamp,
        data: { text: params.payload, url },
      }, 1000);
      this.activityTracker?.onWebviewEvent({
        type: 'text-selected', tabId: tab, text: params.payload, url,
      });
      break;

    case '__tandemFormFocus':
      try {
        const field = JSON.parse(params.payload);
        this.wingmanStream.emitDebounced(`form-${tab}`, {
          type: 'form-interaction', tabId: tab, timestamp,
          data: { fieldType: field.type, fieldName: field.name, url },
        }, 2000);
        this.activityTracker?.onWebviewEvent({
          type: 'form-interaction', tabId: tab, fieldType: field.type, fieldName: field.name, url,
        });
      } catch { /* invalid JSON */ }
      break;
  }
}
```

### Step 3: Wire ActivityTracker in main.ts

File: `src/main.ts`

After both DevToolsManager and ActivityTracker are instantiated, add:

```typescript
devToolsManager.setActivityTracker(activityTracker);
```

### Step 4: Add type filter to /activity-log endpoint

File: `src/api/server.ts`

The existing `/activity-log` endpoint already accepts `limit` and `since`. Add a `types` query parameter:

```typescript
this.app.get('/activity-log', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const since = req.query.since ? parseInt(req.query.since as string) : undefined;
  const types = req.query.types ? (req.query.types as string).split(',') : undefined;

  let entries = this.activityTracker.getLog(limit * 2, since); // fetch extra to compensate for filtering

  if (types) {
    entries = entries.filter(e => types.includes(e.type));
  }

  entries = entries.slice(-limit);

  res.json({ entries, count: entries.length });
});
```

### Step 5: Remove webhook dependency (optional but clean)

File: `src/activity/wingman-stream.ts`

The webhook `emit()` will keep silently failing since the endpoint doesn't exist. Two options:

**Option A (recommended):** Keep WingmanStream but make the webhook optional. Add a file-based fallback:

```typescript
// Add to WingmanStream:
private logPath: string;

constructor(configManager: ConfigManager) {
  this.configManager = configManager;
  this.logPath = path.join(os.homedir(), '.tandem', 'wingman-stream.jsonl');
}

async emit(event: WingmanEvent): Promise<void> {
  if (!this.enabled) return;
  
  // Always write to file (rolling log)
  this.writeToFile(event);
  
  // Try webhook (silent fail)
  const config = this.configManager.getConfig();
  if (config.webhook?.enabled && config.webhook?.url && config.webhook?.notifyOnActivity) {
    this.sendWebhook(event, config).catch(() => {});
  }
}

private writeToFile(event: WingmanEvent): void {
  try {
    const line = JSON.stringify({ ...event, ts: new Date().toISOString() }) + '\n';
    fs.appendFileSync(this.logPath, line);
    
    // Rotate: keep file under 500KB
    const stat = fs.statSync(this.logPath);
    if (stat.size > 500_000) {
      const lines = fs.readFileSync(this.logPath, 'utf-8').split('\n').filter(Boolean);
      fs.writeFileSync(this.logPath, lines.slice(-200).join('\n') + '\n');
    }
  } catch { /* disk error, skip */ }
}
```

**Option B (minimal):** Just leave WingmanStream as-is. The webhook silently fails, and all real data flows through ActivityTracker now.

Go with Option B for now. Option A is nice-to-have for persistent logging across restarts.

## Files to Modify

| File | Change |
|------|--------|
| `src/devtools/manager.ts` | Add `activityTracker` field + `setActivityTracker()`. In `onWingmanBinding()`: also write events to ActivityTracker. |
| `src/main.ts` | Add `devToolsManager.setActivityTracker(activityTracker)` wiring. |
| `src/api/server.ts` | Add `types` query param filter to `/activity-log` endpoint. |

## How Kees Uses This

```bash
# Get all wingman-relevant events from the last 5 minutes
curl -s 'http://127.0.0.1:8765/activity-log?types=navigated,page-loaded,tab-switched,tab-opened,tab-closed,text-selected,scroll-position,form-interaction&since=1771430000000&limit=50'

# Quick check: what is Robin doing right now?
curl -s 'http://127.0.0.1:8765/activity-log?types=navigated,text-selected,tab-switched&limit=5'

# Full activity stream (all events)
curl -s 'http://127.0.0.1:8765/activity-log?limit=20'
```

## Testing

1. Start Tandem
2. Browse to a site, scroll around, select text, click in a form
3. `curl 'http://127.0.0.1:8765/activity-log?types=scroll-position,text-selected,form-interaction&limit=10'`
4. Should see the CDP events in the activity log
5. Test filter: `?types=text-selected` should only return selection events
6. Test `since`: only events after timestamp X
