# CDP Listener Fix — Event handlers can't reach bindings

## Problem
The CDP bindings (`__tandemScroll`, `__tandemSelection`, `__tandemFormFocus`) are installed via `Runtime.addBinding` and work when called directly. But the event listeners injected via `Runtime.evaluate` in `injectCopilotListeners()` don't fire or can't reach the bindings.

This is a known CDP issue: `Runtime.addBinding` creates bindings in the main world, but `Runtime.evaluate` may run in a different execution context, or the event handlers lose access to the binding references.

## Fix
Replace `Runtime.evaluate` with `Page.addScriptToEvaluateOnNewDocument` for the listener injection. This method:
- Runs the script in the main world on every page load (including SPA navigations)
- Has reliable access to `Runtime.addBinding` bindings
- Auto-reinjects on navigation (no need for `reinjectCopilotListeners`)

## Changes

### File: `src/devtools/manager.ts`

#### 1. Replace `injectCopilotListeners()`:

```typescript
private async injectCopilotListeners(wc: WebContents): Promise<void> {
  const script = `(function(){
    if(window.__tandemVisionActive) return;
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
    // Use addScriptToEvaluateOnNewDocument — runs in main world, survives navigations,
    // and has reliable access to Runtime.addBinding bindings
    await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: script,
      worldName: '', // empty string = main world
    });

    // Also run it immediately on the current page (addScriptToEvaluateOnNewDocument
    // only runs on FUTURE navigations)
    await wc.debugger.sendCommand('Runtime.evaluate', {
      expression: script,
      silent: true,
      returnByValue: true,
    });
  } catch {
    // Page may not be ready
  }
}
```

#### 2. Remove `reinjectCopilotListeners()`

Since `Page.addScriptToEvaluateOnNewDocument` auto-runs on every navigation, the `reinjectCopilotListeners()` method and its `Page.frameStoppedLoading` trigger in `handleCDPEvent()` are no longer needed.

Remove:
- The `reinjectCopilotListeners()` method
- The `Page.frameStoppedLoading` handler in `handleCDPEvent()`

#### 3. Note on re-attach

When CDP detaches and re-attaches (tab switch), `installCopilotBindings()` is called again which calls `injectCopilotListeners()`. The `addScriptToEvaluateOnNewDocument` will be re-registered for the new tab. The `__tandemVisionActive` guard prevents double-registration on the current page.

## Files to Modify

| File | Change |
|------|--------|
| `src/devtools/manager.ts` | Update `injectCopilotListeners()` to use `Page.addScriptToEvaluateOnNewDocument`. Remove `reinjectCopilotListeners()` and its `Page.frameStoppedLoading` trigger. |

## Testing

1. Start Tandem — CDP auto-attaches
2. Scroll on a page → check `activity-log?types=scroll-position`
3. Select text → check `activity-log?types=text-selected`
4. Click in a form field → check `activity-log?types=form-interaction`
5. Navigate to a new page → listeners should auto-reinject
6. Switch tabs → CDP re-attaches, listeners work on new tab
