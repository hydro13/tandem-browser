# Phase 7-C: BehaviorMonitor Migration to Plugin Interface

> **Priority:** LOW | **Effort:** ~1.5 hours | **Dependencies:** Phase 7-B (ContentAnalyzer migration proven)

## Goal
Migrate BehaviorMonitor to the SecurityAnalyzer plugin interface, completing the plugin architecture proof-of-concept with two production modules running as plugins.

## Files to Read
- `src/security/behavior-monitor.ts` — current implementation, permission handling, CPU monitoring
- `src/security/content-analyzer.ts` — ContentAnalyzerPlugin wrapper (Phase 7-B) as pattern to follow
- `src/security/analyzer-manager.ts` — AnalyzerManager API
- `src/security/types.ts` — SecurityAnalyzer interface
- `src/security/security-manager.ts` — how BehaviorMonitor is currently wired

## Files to Modify
- `src/security/behavior-monitor.ts` — add wrapper plugin class
- `src/security/security-manager.ts` — register as plugin

## Tasks

### 7C.1 Wrap BehaviorMonitor as SecurityAnalyzer

Follow the same wrapper pattern as ContentAnalyzerPlugin (Phase 7-B):

```typescript
export class BehaviorMonitorPlugin implements SecurityAnalyzer {
  readonly name = 'behavior-monitor'
  readonly version = '1.0.0'
  readonly eventTypes = ['permission-request', 'cpu-spike', 'api-access']
  readonly priority = 500  // BEHAVIORAL confidence level
  readonly description = 'Runtime behavior monitoring: permissions, CPU usage, API access patterns'

  private monitor: BehaviorMonitor

  constructor(monitor: BehaviorMonitor) {
    this.monitor = monitor
  }

  async initialize(context: AnalyzerContext): Promise<void> {
    // BehaviorMonitor already initialized via SecurityManager
  }

  canAnalyze(event: SecurityEvent): boolean {
    return this.eventTypes.includes(event.type)
  }

  async analyze(event: SecurityEvent): Promise<SecurityEvent[]> {
    // BehaviorMonitor handles its own event processing internally
    // This wrapper routes events to existing handlers
    // Specific routing depends on how BehaviorMonitor currently processes events
    return []
  }

  async destroy(): Promise<void> {
    // BehaviorMonitor lifecycle managed by SecurityManager
  }
}
```

**Note:** BehaviorMonitor may handle events differently from ContentAnalyzer. Read the actual code carefully to understand:
- What triggers BehaviorMonitor? (Permission requests? CPU polling? Both?)
- Does it have a single entry point like `analyzePage()`?
- Are there async operations (CDP calls for CPU metrics)?

Adjust the wrapper accordingly. The wrapper should delegate to existing methods, NOT reimplement them.

### 7C.2 Register plugin in SecurityManager

1. Create `BehaviorMonitorPlugin` wrapper around existing BehaviorMonitor instance
2. Register with AnalyzerManager
3. Where BehaviorMonitor is currently triggered directly: route through AnalyzerManager instead
4. Keep BehaviorMonitor's permission handler registrations as-is (these are Electron event handlers, not SecurityAnalyzer events)

**Important caveat:** BehaviorMonitor likely has Electron permission handlers (`setPermissionRequestHandler`, etc.) that are NOT event-driven in the SecurityAnalyzer sense. These should stay as direct registrations. Only the analysis/reporting side should go through the plugin.

### 7C.3 Verify both plugins work together

After this migration:
- Both ContentAnalyzerPlugin and BehaviorMonitorPlugin run through AnalyzerManager
- Event burst example analyzer (from Phase 7-A) still works alongside them
- No event is processed by two plugins accidentally (check eventTypes don't overlap unexpectedly)
- Priority ordering is correct (lower number runs first)

### 7C.4 Document the plugin architecture

Add a comment block at the top of `analyzer-manager.ts` documenting:
- How to create a new SecurityAnalyzer
- Available eventTypes
- Priority conventions
- How to register a new analyzer

This is NOT a README — it's inline documentation for developers who will add future analyzers.

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] BehaviorMonitorPlugin registered in AnalyzerManager
- [ ] Permission handling still works (camera, microphone, geolocation requests)
- [ ] CPU monitoring still works (if applicable)
- [ ] `GET /security/analyzers/status` shows all 3 analyzers: example, content-analyzer, behavior-monitor
- [ ] No duplicate event processing (events handled by correct analyzers only)
- [ ] All 3 analyzers have correct priority ordering
- [ ] App still starts, browsing works
- [ ] Phase 0-7B changes still work (regression)

## Scope
- ONLY modify `behavior-monitor.ts` and `security-manager.ts`
- Use WRAPPER pattern — do NOT rewrite BehaviorMonitor
- Keep Electron permission handlers as direct registrations (not plugin-routed)
- Do NOT migrate any other modules (this completes the plugin proof-of-concept)

## After Completion
1. Update `docs/security-upgrade/STATUS.md`
2. Update `docs/security-upgrade/ROADMAP.md`

## Project Completion Note
This is the FINAL phase of the security upgrade project. After this phase:
- All 16 sub-phases are complete
- Update STATUS.md with overall project completion status
- Run a final full regression check of ALL security functionality
