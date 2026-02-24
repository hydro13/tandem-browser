import { SecurityAnalyzer, AnalyzerContext, SecurityEvent, AnalysisConfidence } from '../types';

/**
 * EventBurstAnalyzer — Detects rapid bursts of security events from a single domain.
 *
 * Watches all security events and tracks timestamps per domain.
 * If 10+ events from the same domain occur within 60 seconds, generates an
 * 'event-burst' meta-event. This can indicate an active attack or a misconfigured
 * site triggering many false positives.
 */
export class EventBurstAnalyzer implements SecurityAnalyzer {
  readonly name = 'event-burst-detector';
  readonly version = '1.0.0';
  readonly eventTypes = ['*'];  // Subscribe to all events
  readonly priority = 950;      // Very low priority (runs after everything else)
  readonly description = 'Detects rapid bursts of security events from a single domain';

  private recentEvents = new Map<string, number[]>();  // domain -> timestamps
  private context!: AnalyzerContext;

  async initialize(context: AnalyzerContext): Promise<void> {
    this.context = context;
  }

  canAnalyze(event: SecurityEvent): boolean {
    // Only analyze events that have a domain and are not our own burst events
    return !!event.domain && event.eventType !== 'event-burst';
  }

  async analyze(event: SecurityEvent): Promise<SecurityEvent[]> {
    const domain = event.domain!;
    const now = Date.now();

    // Track timestamps
    const timestamps = this.recentEvents.get(domain) || [];
    timestamps.push(now);

    // Keep only last 60 seconds
    const recent = timestamps.filter(t => now - t < 60_000);
    this.recentEvents.set(domain, recent);

    // If 10+ events in 60 seconds: burst detected
    if (recent.length >= 10) {
      this.recentEvents.set(domain, []);  // Reset to avoid re-triggering
      return [{
        timestamp: now,
        domain,
        tabId: null,
        eventType: 'event-burst',
        severity: 'medium',
        category: 'behavior',
        details: JSON.stringify({
          eventCount: recent.length,
          windowSeconds: 60,
          reason: 'Rapid burst of security events detected',
        }),
        actionTaken: 'flagged',
        confidence: AnalysisConfidence.ANOMALY,
      }];
    }

    return [];
  }

  async destroy(): Promise<void> {
    this.recentEvents.clear();
  }
}
