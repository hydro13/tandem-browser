import { SecurityDB } from './security-db';
import { PageMetrics, Anomaly, EventSeverity, AnalysisConfidence } from './types';

/**
 * EvolutionEngine — Baseline learning, anomaly detection, and trust evolution.
 *
 * Per-domain rolling baselines track expected behavior (script count, external domains,
 * form count, etc.). After 5+ visits, anomaly detection kicks in using 2-sigma tolerance.
 * Trust evolves asymmetrically: +1 per clean visit (max 90), -10 per anomaly,
 * -15 per blocked request, 0 on blocklist hit.
 *
 * 3+ anomalies on a single page load → zero-day candidate.
 * High-trust domains (≥70) with anomalies → immediate Gatekeeper escalation.
 */
export class EvolutionEngine {
  private db: SecurityDB;

  /** Minimum sample count before baselines are active */
  private static readonly MIN_SAMPLES = 5;
  /** Sigma multiplier for tolerance (2 = 95% normal variation) */
  private static readonly SIGMA_MULTIPLIER = 2;
  /** Minimum tolerance floor to avoid false positives on low-variance metrics */
  private static readonly MIN_TOLERANCE = 1;

  constructor(db: SecurityDB) {
    this.db = db;
  }

  /**
   * Update rolling baseline for a domain after page load.
   * Uses Welford's online algorithm for running mean + variance.
   */
  updateBaseline(domain: string, metrics: PageMetrics): void {
    for (const [metric, value] of Object.entries(metrics)) {
      if (typeof value !== 'number') continue;

      const existing = this.db.getBaseline(domain, metric);

      if (!existing) {
        // First observation — create baseline with initial tolerance
        this.db.upsertBaseline(domain, metric, value, Math.max(value * 0.3, EvolutionEngine.MIN_TOLERANCE), 1);
      } else {
        // Update rolling average using Welford's method
        const newCount = existing.sampleCount + 1;
        const newAvg = existing.expectedValue + (value - existing.expectedValue) / newCount;

        // Recover old variance from stored tolerance (tolerance = sqrt(variance) * 2)
        const oldStddev = existing.tolerance / EvolutionEngine.SIGMA_MULTIPLIER;
        const oldVariance = oldStddev * oldStddev;

        // Update variance using online formula
        const newVariance = ((newCount - 1) * oldVariance + (value - newAvg) * (value - existing.expectedValue)) / newCount;
        const newTolerance = Math.max(
          Math.sqrt(Math.max(newVariance, 0)) * EvolutionEngine.SIGMA_MULTIPLIER,
          EvolutionEngine.MIN_TOLERANCE
        );

        this.db.upsertBaseline(domain, metric, newAvg, newTolerance, newCount);
      }
    }
  }

  /**
   * Check current page metrics against established baselines.
   * Returns anomalies only when baseline has MIN_SAMPLES+ observations.
   */
  checkForAnomalies(domain: string, metrics: PageMetrics): Anomaly[] {
    const anomalies: Anomaly[] = [];

    for (const [metric, value] of Object.entries(metrics)) {
      if (typeof value !== 'number') continue;

      const baseline = this.db.getBaseline(domain, metric);
      if (!baseline || baseline.sampleCount < EvolutionEngine.MIN_SAMPLES) continue;

      const deviation = Math.abs(value - baseline.expectedValue);
      if (deviation > baseline.tolerance) {
        const severity = this.calculateSeverity(deviation, baseline.tolerance);
        anomalies.push({
          domain,
          metric,
          expected: baseline.expectedValue,
          actual: value,
          deviation,
          tolerance: baseline.tolerance,
          severity,
        });
      }
    }

    // Multiple anomalies on same page = potential zero-day
    if (anomalies.length >= 3) {
      this.reportZeroDay(domain, anomalies);
    }

    return anomalies;
  }

  /**
   * Report a zero-day candidate (3+ anomalies on a single page load).
   * Returns true if the domain is high-trust (≥70) and should be escalated to Gatekeeper.
   */
  reportZeroDay(domain: string, anomalies: Anomaly[]): boolean {
    this.db.insertZeroDayCandidate({
      detectedAt: Date.now(),
      domain,
      anomalyType: anomalies.map(a => a.metric).join(', '),
      baselineDeviation: Math.max(...anomalies.map(a => a.deviation / a.tolerance)),
      details: JSON.stringify(anomalies),
    });

    // Log event
    this.db.logEvent({
      timestamp: Date.now(),
      domain,
      tabId: null,
      eventType: 'anomaly',
      severity: 'high',
      category: 'behavior',
      details: JSON.stringify({
        reason: 'zero_day_candidate',
        anomalyCount: anomalies.length,
        metrics: anomalies.map(a => a.metric),
        maxDeviation: Math.max(...anomalies.map(a => a.deviation / a.tolerance)),
      }),
      actionTaken: 'flagged',
      confidence: AnalysisConfidence.ANOMALY,
    });

    // Check if high-trust domain → needs escalation
    const info = this.db.getDomainInfo(domain);
    return !!(info && info.trustLevel >= 70);
  }

  /**
   * Evolve trust score for a domain based on observed behavior.
   * Asymmetric: up slow (+1, max 90), down fast (-10/-15), blocklist_hit → 0.
   * Trust deltas are weighted by confidence: high confidence (low number) = full impact,
   * low confidence (high number) = reduced impact.
   */
  evolveTrust(domain: string, event: 'clean_visit' | 'anomaly' | 'blocked' | 'blocklist_hit', confidence?: number): void {
    const info = this.db.getDomainInfo(domain);
    if (!info) return;

    let newTrust = info.trustLevel;

    switch (event) {
      case 'clean_visit':
        newTrust = Math.min(90, newTrust + this.getTrustAdjustment(1, confidence));
        break;
      case 'anomaly':
        newTrust = Math.max(0, newTrust + this.getTrustAdjustment(-10, confidence));
        break;
      case 'blocked':
        newTrust = Math.max(0, newTrust + this.getTrustAdjustment(-15, confidence));
        break;
      case 'blocklist_hit':
        newTrust = 0;
        break;
    }

    // Round to avoid floating point drift
    newTrust = Math.round(newTrust);

    if (newTrust !== info.trustLevel) {
      this.db.upsertDomain(domain, { trustLevel: newTrust });
      this.db.logEvent({
        timestamp: Date.now(),
        domain,
        tabId: null,
        eventType: 'info',
        severity: 'info',
        category: 'behavior',
        details: JSON.stringify({
          event,
          oldTrust: info.trustLevel,
          newTrust,
          confidence,
        }),
        actionTaken: 'logged',
        confidence: confidence ?? AnalysisConfidence.BEHAVIORAL,
      });
    }
  }

  /**
   * Weight trust adjustment by confidence level.
   * High confidence (<=300) = full impact, medium (301-600) = 70%, low (>600) = 40%.
   */
  private getTrustAdjustment(baseDelta: number, confidence?: number): number {
    if (confidence === undefined) return baseDelta;
    if (confidence <= 300) return baseDelta;
    if (confidence <= 600) return baseDelta * 0.7;
    return baseDelta * 0.4;
  }

  /**
   * Calculate severity based on how far the deviation exceeds tolerance.
   * 1-2x tolerance = low, 2-3x = medium, 3-5x = high, 5x+ = critical
   */
  private calculateSeverity(deviation: number, tolerance: number): EventSeverity {
    const ratio = deviation / tolerance;
    if (ratio >= 5) return 'critical';
    if (ratio >= 3) return 'high';
    if (ratio >= 2) return 'medium';
    return 'low';
  }
}
