# Phase 7-B: ContentAnalyzer Migration to Plugin Interface

> **Priority:** LOW | **Effort:** ~1.5 hours | **Dependencies:** Phase 7-A (AnalyzerManager)

## Goal
Migrate ContentAnalyzer to work as a SecurityAnalyzer plugin while maintaining all existing functionality. This is the first real migration — it proves the plugin system works for production modules.

## Files to Read
- `src/security/content-analyzer.ts` — current implementation, all analysis methods
- `src/security/analyzer-manager.ts` — AnalyzerManager API (from Phase 7-A)
- `src/security/types.ts` — SecurityAnalyzer interface
- `src/security/security-manager.ts` — how ContentAnalyzer is currently wired

## Files to Modify
- `src/security/content-analyzer.ts` — wrap as SecurityAnalyzer
- `src/security/security-manager.ts` — register as plugin instead of direct calls

## Tasks

### 7B.1 Wrap ContentAnalyzer as SecurityAnalyzer

The key insight: ContentAnalyzer doesn't need to be rewritten. It needs a **wrapper** that implements the SecurityAnalyzer interface and delegates to existing methods.

```typescript
export class ContentAnalyzerPlugin implements SecurityAnalyzer {
  readonly name = 'content-analyzer'
  readonly version = '1.0.0'
  readonly eventTypes = ['page-loaded', 'navigation-complete']
  readonly priority = 400  // After blocklist (100-300), before heuristics (700+)
  readonly description = 'Page-level phishing, tracker, and content analysis'

  private analyzer: ContentAnalyzer  // The existing class

  constructor(analyzer: ContentAnalyzer) {
    this.analyzer = analyzer
  }

  async initialize(context: AnalyzerContext): Promise<void> {
    // ContentAnalyzer is already initialized via SecurityManager
    // No additional setup needed
  }

  canAnalyze(event: SecurityEvent): boolean {
    return this.eventTypes.includes(event.type)
  }

  async analyze(event: SecurityEvent): Promise<SecurityEvent[]> {
    // Delegate to existing analysis method
    // The existing analyzePage() already calls logEvent internally
    // We just trigger it and return empty (it handles its own event logging)
    if (event.type === 'page-loaded' && event.domain) {
      await this.analyzer.analyzePage(event.domain)
    }
    return []
  }

  async destroy(): Promise<void> {
    // ContentAnalyzer lifecycle managed by SecurityManager
  }
}
```

**Important:** This is a wrapper pattern, NOT a rewrite. All existing ContentAnalyzer code stays exactly as-is. The wrapper just routes events to it via the plugin interface.

### 7B.2 Register plugin in SecurityManager

In `security-manager.ts`:
1. Create `ContentAnalyzerPlugin` wrapper around the existing ContentAnalyzer instance
2. Register it with AnalyzerManager: `analyzerManager.register(new ContentAnalyzerPlugin(this.contentAnalyzer))`
3. Remove the direct call to `contentAnalyzer.analyzePage()` from wherever it's currently triggered (replace with event routing through AnalyzerManager)

**Critical:** Make sure the page analysis still happens! If it was triggered directly, it now needs to be triggered via `analyzerManager.routeEvent({ type: 'page-loaded', domain: ... })`.

### 7B.3 Verify backward compatibility

After the migration:
- All existing ContentAnalyzer analysis must still work
- All existing API endpoints that return ContentAnalyzer data must still work
- `GET /security/page/analysis` must return the same data as before
- Event logging behavior unchanged
- The only difference is HOW it's triggered (via plugin routing instead of direct call)

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] ContentAnalyzerPlugin registered in AnalyzerManager
- [ ] Page analysis runs when navigating to a new page
- [ ] `GET /security/page/analysis` returns valid data after loading a page
- [ ] Phishing detection still works (hidden forms, credential fields)
- [ ] Tracker detection still works (KNOWN_TRACKERS matching)
- [ ] Deep source scanning still works (from Phase 4, if implemented)
- [ ] `GET /security/analyzers/status` shows content-analyzer in the list
- [ ] App still starts, browsing works
- [ ] Phase 0-7A changes still work (regression)

## Scope
- ONLY modify `content-analyzer.ts` and `security-manager.ts`
- Use WRAPPER pattern — do NOT rewrite ContentAnalyzer
- All existing analysis logic stays in place
- Do NOT change any API endpoints
- Do NOT change event types or severity levels

## After Completion
1. Update `docs/security-upgrade/STATUS.md`
2. Update `docs/security-upgrade/ROADMAP.md`
