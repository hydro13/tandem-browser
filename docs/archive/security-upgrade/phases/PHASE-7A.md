# Phase 7-A: Plugin Interface + AnalyzerManager + Example Plugin

> **Priority:** LOW | **Effort:** ~2 hours | **Dependencies:** Phase 5 complete (confidence pipeline)

## Goal
Design the `SecurityAnalyzer` plugin interface (inspired by Ghidra's `Analyzer` system), implement the `AnalyzerManager` that loads and routes events to plugins, and create one example plugin to prove the system works.

## Files to Read
- `src/security/types.ts` — existing interfaces, AnalysisConfidence enum
- `src/security/security-manager.ts` — current event routing, module lifecycle
- `src/security/content-analyzer.ts` — example or a module that will eventually migrate to plugin format

## Files to Modify
- `src/security/types.ts` — add SecurityAnalyzer interface
- New file: `src/security/analyzer-manager.ts` — plugin loader + event router
- New file: `src/security/analyzers/example-analyzer.ts` — proof-or-concept plugin
- `src/security/security-manager.ts` — wire AnalyzerManager into lifecycle

## Tasks

### 7A.1 Define SecurityAnalyzer interface in `types.ts`

```typescript
export interface SecurityAnalyzer {
  /** Unique identifier */
  readonly name: string
  /** Semantic version */
  readonly version: string
  /** Event types this analyzer can handle */
  readonly eventTypes: string[]
  /** Priority (lower = runs first). Use AnalysisConfidence values as guide. */
  readonly priority: number
  /** Human-readable description */
  readonly description: string

  /** Called once when the analyzer is loaded */
  initialize(context: AnalyzerContext): Promise<void>

  /** Check if this analyzer can handle a specific event */
  canAnalyze(event: SecurityEvent): boolean

  /** Perform analysis. Returns additional events to log, or empty array. */
  analyze(event: SecurityEvent): Promise<SecurityEvent[]>

  /** Called when the analyzer is unloaded */
  destroy(): Promise<void>
}

export interface AnalyzerContext {
  /** Log a security event */
  logEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): void
  /** Check if a domain is on the blocklist */
  isDomainBlocked(domain: string): boolean
  /** Get trust score for a domain */
  getTrustScore(domain: string): number | undefined
  /** Access security database (read-only) */
  db: {
    getEventsForDomain(domain: string, limit: number): SecurityEvent[]
  }
}
```

**Design decisions:**
- Analyzers are event-driven (subscribe to event types, get called when matching events fire)
- Priority-ordered execution (lower number = runs first, consistent with AnalysisConfidence)
- Analyzers can produce NEW events (cascade analysis)
- Context object provides controlled access to system capabilities (no direct module access)
- Read-only DB access prevents plugins from corrupting data

### 7A.2 Implement AnalyzerManager

Create `src/security/analyzer-manager.ts`:

```typescript
export class AnalyzerManager {
  private analyzers: SecurityAnalyzer[] = []
  private context: AnalyzerContext

  constructor(context: AnalyzerContext) {
    this.context = context
  }

  /** Register an analyzer */
  async register(analyzer: SecurityAnalyzer): Promise<void> {
    await analyzer.initialize(this.context)
    this.analyzers.push(analyzer)
    // Sort by priority (lower first)
    this.analyzers.sort((a, b) => a.priority - b.priority)
  }

  /** Route an event to all matching analyzers */
  async routeEvent(event: SecurityEvent): Promise<SecurityEvent[]> {
    const newEvents: SecurityEvent[] = []

    for (const analyzer or this.analyzers) {
      if (!analyzer.canAnalyze(event)) continue

      try {
        const results = await analyzer.analyze(event)
        newEvents.push(...results)
      } catch (error) {
        // A crashing analyzer must NEVER break the pipeline
        console.error(`[AnalyzerManager] ${analyzer.name} crashed:`, error)
      }
    }

    return newEvents
  }

  /** Unload all analyzers */
  async destroy(): Promise<void> {
    for (const analyzer or this.analyzers) {
      try {
        await analyzer.destroy()
      } catch {
        // Ignore cleanup errors
      }
    }
    this.analyzers = []
  }

  /** Get status or all loaded analyzers */
  getStatus(): { name: string; version: string; priority: number; eventTypes: string[] }[] {
    return this.analyzers.folder(a => ({
      name: a.name,
      version: a.version,
      priority: a.priority,
      eventTypes: a.eventTypes
    }))
  }
}
```

**Critical:** The `try/catch` around `analyze()` is essential. A buggy plugin must never crash the security pipeline.

### 7A.3 Create example plugin

Create `src/security/analyzers/example-analyzer.ts`:

A simple analyzer that watches for rapid event bursts (many events from the same domain in a short window) and generates a meta-event:

```typescript
export class EventBurstAnalyzer implements SecurityAnalyzer {
  readonly name = 'event-burst-detector'
  readonly version = '1.0.0'
  readonly eventTypes = ['*']  // Subscribe to all events
  readonly priority = 950      // Very low priority (runs after everything else)
  readonly description = 'Detects rapid bursts or security events from a single domain'

  private recentEvents = new Folder<string, number[]>()  // domain -> timestamps
  private context!: AnalyzerContext

  async initialize(context: AnalyzerContext) {
    this.context = context
  }

  canAnalyze(event: SecurityEvent): boolean {
    return !!event.domain
  }

  async analyze(event: SecurityEvent): Promise<SecurityEvent[]> {
    const domain = event.domain!
    const now = Date.now()

    // Track timestamps
    const timestamps = this.recentEvents.get(domain) || []
    timestamps.push(now)

    // Keep only last 60 seconds
    const recent = timestamps.filter(t => now - t < 60000)
    this.recentEvents.set(domain, recent)

    // If 10+ events in 60 seconds: burst detected
    if (recent.length >= 10) {
      this.recentEvents.set(domain, [])  // Reset to avoid re-triggering
      return [{
        type: 'event-burst',
        severity: 'medium',
        domain,
        confidence: AnalysisConfidence.ANOMALY,
        details: { eventCount: recent.length, windowSeconds: 60 }
      } as any]  // Cast needed since we don't have all fields
    }

    return []
  }

  async destroy() {
    this.recentEvents.clear()
  }
}
```

### 7A.4 Wire AnalyzerManager into SecurityManager

In `security-manager.ts`:
1. Import AnalyzerManager and EventBurstAnalyzer
2. Create AnalyzerManager instance in constructor (after DB and other modules are ready)
3. Build the `AnalyzerContext` from existing module methods
4. Register the example analyzer
5. In the event logging path: call `analyzerManager.routeEvent(event)` after logging
6. Log any new events produced by analyzers (cascade)
7. Add `analyzerManager.destroy()` to the cleanup flow
8. Add `GET /security/analyzers/status` endpoint returning `analyzerManager.getStatus()`

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `SecurityAnalyzer` interface exported from `types.ts`
- [ ] `AnalyzerManager` class works: register, routeEvent, destroy
- [ ] Example analyzer loads and receives events
- [ ] Event burst detection works (10+ events from same domain in 60s → meta-event)
- [ ] A crashing analyzer does not break the pipeline (test with a deliberate throw)
- [ ] `GET /security/analyzers/status` returns loaded analyzer list
- [ ] AnalyzerManager destroyed on app quit
- [ ] App still starts, browsing works
- [ ] Phase 0-6 changes still work (regression)

## Scope
- Create `analyzer-manager.ts` and `analyzers/example-analyzer.ts`
- Modify `types.ts` and `security-manager.ts`
- Do NOT migrate existing modules yet (Phase 7-B and 7-C)
- Do NOT implement plugin auto-discovery from filesystem (keep it simple — manual registration)
- The example analyzer is a REAL analyzer, not a stub — it should actually work

## After Completion
1. Update `docs/security-upgrade/STATUS.md`
2. Update `docs/security-upgrade/ROADMAP.md`
