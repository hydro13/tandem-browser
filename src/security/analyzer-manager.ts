import { SecurityAnalyzer, AnalyzerContext, SecurityEvent } from './types';
import { createLogger } from '../utils/logger';

const log = createLogger('AnalyzerManager');

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
 *
 * ## Creating a new SecurityAnalyzer
 *
 * 1. Implement the `SecurityAnalyzer` interface from `types.ts`
 * 2. Set `eventTypes` to the event types your analyzer processes (or '*' for all)
 * 3. Set `priority` following the conventions below
 * 4. `canAnalyze()` should filter events beyond the type check (e.g. require a domain)
 * 5. `analyze()` returns new SecurityEvent[] to log, or [] if events are logged internally
 * 6. Wrap existing modules (don't reimplement) — see ContentAnalyzerPlugin, BehaviorMonitorPlugin
 *
 * ## Event types currently routed
 *
 * - 'page-loaded'  — emitted by SecurityManager.onPageLoaded() after navigation
 * - '*'            — wildcard, receives all events (used by EventBurstAnalyzer)
 * - Custom types can be added as synthetic events via routeEvent()
 *
 * ## Priority conventions (lower = runs first)
 *
 * - 100-300: Blocklist / high-certainty analyzers (AnalysisConfidence.BLOCKLIST-level)
 * - 400:     Content analysis (ContentAnalyzerPlugin)
 * - 500:     Behavioral analysis (BehaviorMonitorPlugin)
 * - 700+:    Heuristic / meta-analyzers (EventBurstAnalyzer at 950)
 *
 * ## Registration
 *
 * Register analyzers in SecurityManager.setDevToolsManager() via:
 *   this.analyzerManager.register(new MyPlugin(existingModule)).catch(...)
 *
 * Events are routed automatically via the db.onEventLogged callback in SecurityManager.
 * Cascade events (produced by analyze()) are logged but NOT re-routed (re-entrancy guard).
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
      log.info(`Registered: ${analyzer.name} v${analyzer.version} (priority ${analyzer.priority})`);
    } catch (error) {
      log.error(`Failed to initialize ${analyzer.name}:`, error instanceof Error ? error.message : String(error));
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
        } catch (error) {
          // A crashing analyzer must NEVER break the pipeline
          log.error(`${analyzer.name} crashed:`, error instanceof Error ? error.message : String(error));
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
    log.info('All analyzers destroyed');
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
