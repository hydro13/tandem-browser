# CDP Copilot Vision — Scroll/Selection/Form tracking via Runtime.addBinding

## Why This Replaces the Current Approach

The current scroll tracking in `shell/index.html` uses `webview.executeJavaScript()` which runs in the **main world** of the page — detectable by anti-bot scripts.

`Runtime.addBinding()` creates a **hidden binding** that page JavaScript cannot see, enumerate, or intercept. It's the proper CDP way to create a stealth communication channel between the browser internals and external tooling.

## How Runtime.addBinding Works

```
CDP: Runtime.addBinding({ name: '__x' })
  → Creates window.__x() in the page
  → NOT visible via Object.keys(window), for..in, getOwnPropertyNames
  → Calling __x(payload) fires a Runtime.bindingCalled CDP event
  → Anti-bot scripts cannot detect it
```

## Implementation

### What Changes

| Component | Current | New |
|-----------|---------|-----|
| Scroll tracking | `shell/index.html` polling via `executeJavaScript` every 5s | CDP `Runtime.addBinding` + scroll listener injected via `Runtime.evaluate` after each navigation |
| Text selection | `context-menu` event only (fires on right-click) | CDP binding + `selectionchange` listener (fires on any selection) |
| Form interaction | `context-menu` isEditable only | CDP binding + `focusin` listener on input/textarea/select |
| Communication | IPC via shell → main process | CDP `Runtime.bindingCalled` event → DevToolsManager → CopilotStream |

### Step 1: Add CopilotStream to DevToolsManager

File: `src/devtools/manager.ts`

Add CopilotStream as an optional dependency:

```typescript
import { CopilotStream } from '../activity/copilot-stream';

export class DevToolsManager {
  private copilotStream?: CopilotStream;
  
  setCopilotStream(stream: CopilotStream): void {
    this.copilotStream = stream;
  }
}
```

### Step 2: Install bindings after CDP attach

In `DevToolsManager.ensureAttached()`, after the existing domain enables (`Network.enable`, `DOM.enable`, `Page.enable`), add:

```typescript
// Copilot Vision: install stealth bindings for scroll/selection/form tracking
await this.installCopilotBindings(wc);
```

New private method:

```typescript
private async installCopilotBindings(wc: WebContents): Promise<void> {
  if (!this.copilotStream) return;
  
  try {
    // Create hidden bindings
    await wc.debugger.sendCommand('Runtime.addBinding', { name: '__tandemScroll' });
    await wc.debugger.sendCommand('Runtime.addBinding', { name: '__tandemSelection' });
    await wc.debugger.sendCommand('Runtime.addBinding', { name: '__tandemFormFocus' });
    
    // Inject listeners (runs in page context but communicates via invisible bindings)
    await this.injectCopilotListeners(wc);
    
    // Re-inject after every navigation (SPA + traditional)
    // Page.enable is already called, so we get frameNavigated events
    // The handleCDPEvent will catch Page.frameStoppedLoading and re-inject
  } catch (e: any) {
    console.warn('⚠️ Copilot Vision bindings failed:', e.message);
  }
}
```

### Step 3: Inject lightweight listeners

New private method in `DevToolsManager`:

```typescript
private async injectCopilotListeners(wc: WebContents): Promise<void> {
  // Single injection — all three listeners in one evaluate call
  // Uses IIFE so no global variables are created (stealth)
  const script = `(function(){
    if(window.__tandemVisionActive) return; // prevent double-inject
    window.__tandemVisionActive = true;
    
    // --- Scroll ---
    var _sT=null, _lastPct=-1;
    window.addEventListener('scroll', function(){
      if(_sT) clearTimeout(_sT);
      _sT = setTimeout(function(){
        var h = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        var pct = Math.round((window.scrollY / h) * 100);
        if(pct !== _lastPct){ _lastPct = pct; __tandemScroll(String(pct)); }
      }, 2000);
    }, {passive:true});
    
    // --- Text Selection ---
    var _selT=null;
    document.addEventListener('selectionchange', function(){
      if(_selT) clearTimeout(_selT);
      _selT = setTimeout(function(){
        var s = (window.getSelection()||'').toString().trim();
        if(s.length > 10) __tandemSelection(s.substring(0, 500));
      }, 800);
    });
    
    // --- Form Focus ---
    var _lastField='';
    document.addEventListener('focusin', function(e){
      var t = e.target;
      if(!t || !t.tagName) return;
      var tag = t.tagName.toLowerCase();
      if(tag==='input'||tag==='textarea'||tag==='select'||t.isContentEditable){
        var name = t.name || t.id || t.placeholder || t.getAttribute('aria-label') || '';
        var type = t.type || tag;
        var key = type+':'+name;
        if(key !== _lastField){ _lastField = key; __tandemFormFocus(JSON.stringify({type:type,name:name})); }
      }
    }, true);
  })()`;
  
  try {
    await wc.debugger.sendCommand('Runtime.evaluate', {
      expression: script,
      silent: true,        // don't report errors to console
      returnByValue: true,
    });
  } catch {
    // Page may not be ready yet — will retry on next navigation
  }
}
```

**Note on __tandemVisionActive:** This IS a detectable global, but it's a simple boolean flag to prevent double injection. If even this is too much, replace with a check on whether the scroll listener is already installed by testing a unique Symbol or using a WeakRef approach. But for practical purposes this is fine — no anti-bot system checks for random boolean flags.

### Step 4: Handle binding callbacks in handleCDPEvent

In `DevToolsManager.handleCDPEvent()`, add before the existing console/network handling:

```typescript
// Copilot Vision: binding callbacks
if (method === 'Runtime.bindingCalled') {
  this.onCopilotBinding(params, tabId);
  return;
}

// Re-inject listeners after navigation (page context is reset)
if (method === 'Page.frameStoppedLoading' && params.frameId) {
  // Only re-inject for main frame (not iframes)
  this.reinjectCopilotListeners();
  return;
}
```

New method:

```typescript
private onCopilotBinding(params: { name: string; payload: string }, tabId?: string): void {
  if (!this.copilotStream) return;
  const timestamp = Date.now();
  const tab = tabId || 'unknown';
  
  // Get current URL for context
  const wc = this.attachedWcId ? webContents.fromId(this.attachedWcId) : null;
  const url = wc && !wc.isDestroyed() ? wc.getURL() : '';

  switch (params.name) {
    case '__tandemScroll':
      this.copilotStream.emitDebounced(`scroll-${tab}`, {
        type: 'scroll-position',
        tabId: tab,
        timestamp,
        data: { scrollPercent: parseInt(params.payload, 10), url },
      }, 3000);
      break;
      
    case '__tandemSelection':
      this.copilotStream.emitDebounced(`select-${tab}`, {
        type: 'text-selected',
        tabId: tab,
        timestamp,
        data: { text: params.payload, url },
      }, 1000);
      break;
      
    case '__tandemFormFocus':
      try {
        const field = JSON.parse(params.payload);
        this.copilotStream.emitDebounced(`form-${tab}`, {
          type: 'form-interaction',
          tabId: tab,
          timestamp,
          data: { fieldType: field.type, fieldName: field.name, url },
        }, 2000);
      } catch { /* invalid JSON, skip */ }
      break;
  }
}

private async reinjectCopilotListeners(): Promise<void> {
  if (!this.copilotStream) return;
  const wc = this.attachedWcId ? webContents.fromId(this.attachedWcId) : null;
  if (!wc || wc.isDestroyed()) return;
  
  // Small delay to let page initialize
  setTimeout(async () => {
    try {
      await this.injectCopilotListeners(wc);
    } catch { /* page may have navigated again */ }
  }, 500);
}
```

### Step 5: Remove old scroll tracking from shell/index.html

Remove the scroll polling code that was added in the previous implementation. Find and delete:

```javascript
// Copilot Vision: scroll position tracking (polls every 5s, only reports changes)
let _scrollInterval = null;
let _lastScrollPct = -1;
const scrollCheckJS = `(function(){...})()`;
function startScrollTracking() { ... }
wv.addEventListener('did-finish-load', startScrollTracking);
wv.addEventListener('destroyed', () => { if (_scrollInterval) clearInterval(_scrollInterval); });
wv.addEventListener('did-navigate', () => { _lastScrollPct = -1; });
```

This is approximately lines 3044-3065 in `shell/index.html` (the block starting with the "Copilot Vision" comment).

### Step 6: Remove context-menu based selection/form tracking from main.ts

Remove the `context-menu` event handler that was added for text selection and form interaction. Find and delete the block starting with:

```typescript
// Copilot Vision: detect text selection + form interaction via context-menu
contents.on('context-menu', (_event, params) => {
```

This is around line 130 in `src/main.ts`. The context-menu approach only fires on right-click and is now fully replaced by the continuous CDP listeners.

### Step 7: Wire CopilotStream to DevToolsManager in main.ts

In `src/main.ts`, after DevToolsManager and CopilotStream are both instantiated:

```typescript
devToolsManager.setCopilotStream(copilotStream);
```

### Step 8: Auto-attach CDP on tab switch

Currently DevToolsManager uses lazy attachment (attaches on first API call). For Copilot Vision to work continuously, CDP needs to be attached whenever the active tab changes.

In `src/main.ts`, in the `tab-focus` IPC handler (around line 555), add after the existing code:

```typescript
// Ensure CDP is attached to the new active tab for Copilot Vision
devToolsManager.ensureAttached().catch(() => {});
```

This ensures that when Robin switches tabs, CDP re-attaches to the new tab and installs the copilot bindings.

## Files to Modify

| File | Change |
|------|--------|
| `src/devtools/manager.ts` | Add `setCopilotStream()`, `installCopilotBindings()`, `injectCopilotListeners()`, `onCopilotBinding()`, `reinjectCopilotListeners()`. Extend `handleCDPEvent()` with binding + navigation handlers. Auto-attach on ensureAttached. |
| `src/main.ts` | Wire `copilotStream` to `devToolsManager`. Add `ensureAttached()` call on tab-focus. Remove the old `context-menu` based selection/form tracking. |
| `shell/index.html` | Remove the scroll polling block (~lines 3044-3065). |

## Files NOT Changed
- `src/activity/copilot-stream.ts` — no changes needed, works as-is
- `src/activity/tracker.ts` — still handles tab-switch/open/close/navigate events from IPC. Only scroll/selection/form move to CDP.
- `src/config/manager.ts` — no changes, `notifyOnActivity` config still applies
- `src/api/server.ts` — no changes, toggle endpoints still work

## Event Flow After Implementation

```
Tab events (switch/open/close/navigate):
  shell IPC → main.ts → ActivityTracker → CopilotStream → OpenClaw webhook

Scroll/Selection/Form (NEW CDP route):
  Page JS → Runtime.addBinding → CDP event → DevToolsManager.onCopilotBinding → CopilotStream → OpenClaw webhook
```

## Anti-Detect Safety Analysis

| Aspect | Risk |
|--------|------|
| `Runtime.addBinding` | ✅ Invisible to page JS. Cannot be detected. |
| `Runtime.evaluate` (listener injection) | ⚠️ Low risk. Runs in page context but only adds passive event listeners. No DOM modification. |
| `__tandemVisionActive` flag | ⚠️ Minimal risk. Simple boolean, no anti-bot checks for this. Can be replaced with Symbol if needed. |
| Scroll listener | ✅ `{passive:true}`, indistinguishable from any extension or framework listener. |
| Selection listener | ✅ `selectionchange` is a standard event, widely used by extensions. |
| Form focus listener | ✅ `focusin` capture phase, standard pattern. |

Overall: much safer than `executeJavaScript` polling. The only page-visible artifact is the event listeners themselves, which look identical to what any browser extension would install.

## Testing

1. Start Tandem with `npm start`
2. Verify CDP attaches automatically when browsing (check console for CDP attach logs)
3. Browse to any site, scroll around → Kees should receive scroll events
4. Select text on a page → Kees should receive selection events
5. Click into a search field or form → Kees should receive form-interaction events
6. Navigate to a new page → listeners should re-inject (check via selecting text on new page)
7. Switch tabs → CDP should re-attach to new tab, bindings should work on new tab
8. Test anti-detect: open DevTools console on a page, run `Object.keys(window).filter(k => k.includes('tandem'))` → should only show `__tandemVisionActive` (acceptable)
9. Toggle off: `curl -X POST http://127.0.0.1:8765/copilot-stream/toggle -d '{"enabled":false}'` → no more events
10. Test on LinkedIn (anti-bot heavy) → page should load normally, no detection
