import { SecurityAnalyzer, AnalyzerContext, SecurityEvent } from './types';

/**
 * AnalyzerManager — Plugin loader and event router for SecurityAnalyzer plugins.
 *
 * Inspired by Ghidra's Analyzer pipeline: analyzers are event-driven, priority-ordered,
 * and isolated (a crashing analyzer never breaks the pipeline).
 *
 * - Analyzers subscribe to event types via `eventTypes` ('*' = all events)
 * - Events are routed in priority order (lower number = runs first)
 * - Analyzers can produce new events (cascade analysis)
 * - Context object provides controlled access to system capabilities
 */
export class AnalyzerManager {
  private analyzers: SecurityAnalyzer[] = [];
  private context: AnalyzerContext;
  private routing: boolean = false;

  constructor(context: AnalyzerContext) {
    this.context = context;
  }

  /** Register an analyzer and initialize it with the shared context */
  async register(analyzer: SecurityAnalyzer): Promise<void> {
    try {
      await analyzer.initialize(this.context);
      this.analyzers.push(analyzer);
      // Sort by priority (lower first)
      this.analyzers.sort((a, b) => a.priority - b.priority);
      console.log(`[AnalyzerManager] Registered: ${analyzer.name} v${analyzer.version} (priority ${analyzer.priority})`);
    } catch (error: any) {
      console.error(`[AnalyzerManager] Failed to initialize ${analyzer.name}:`, error.message);
    }
  }

  /**
   * Route an event to all matching analyzers.
   * Returns any new events produced by analyzers (for cascade logging).
   */
  async routeEvent(event: SecurityEvent): Promise<SecurityEvent[]> {
    // Prevent re-entrant routing (cascade events are logged but not re-routed)
    if (this.routing) return [];
    this.routing = true;

    const newEvents: SecurityEvent[] = [];

    try {
      for (const analyzer of this.analyzers) {
        // Check event type subscription
        if (!analyzer.eventTypes.includes('*') && !analyzer.eventTypes.includes(event.eventType)) {
          continue;
        }

        // Check if analyzer can handle this specific event
        if (!analyzer.canAnalyze(event)) continue;

        try {
          const results = await analyzer.analyze(event);
          newEvents.push(...results);
        } catch (error: any) {
          // A crashing analyzer must NEVER break the pipeline
          console.error(`[AnalyzerManager] ${analyzer.name} crashed:`, error.message);
        }
      }
    } finally {
      this.routing = false;
    }

    return newEvents;
  }

  /** Unload all analyzers */
  async destroy(): Promise<void> {
    for (const analyzer of this.analyzers) {
      try {
        await analyzer.destroy();
      } catch {
        // Ignore cleanup errors
      }
    }
    this.analyzers = [];
    console.log('[AnalyzerManager] All analyzers destroyed');
  }

  /** Get status of all loaded analyzers */
  getStatus(): { name: string; version: string; priority: number; eventTypes: string[]; description: string }[] {
    return this.analyzers.map(a => ({
      name: a.name,
      version: a.version,
      priority: a.priority,
      eventTypes: a.eventTypes,
      description: a.description,
    }));
  }
}
