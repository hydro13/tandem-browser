import type Database from 'better-sqlite3';
import type { BaselineEntry, ZeroDayCandidate } from './types';

/**
 * Baselines + zero-day candidate database operations.
 * Extracted from SecurityDB for separation of concerns.
 */
export class SecurityBaselinesDB {
  private stmtGetBaseline: Database.Statement;
  private stmtGetBaselinesByDomain: Database.Statement;
  private stmtUpsertBaseline: Database.Statement;
  private stmtInsertZeroDayCandidate: Database.Statement;
  private stmtGetZeroDayCandidates: Database.Statement;
  private stmtGetOpenZeroDayCandidates: Database.Statement;
  private stmtResolveZeroDayCandidate: Database.Statement;

  constructor(db: Database.Database) {
    this.stmtGetBaseline = db.prepare(
      'SELECT domain, metric, expected_value, tolerance, sample_count, last_updated FROM baselines WHERE domain = ? AND metric = ?'
    );
    this.stmtGetBaselinesByDomain = db.prepare(
      'SELECT domain, metric, expected_value, tolerance, sample_count, last_updated FROM baselines WHERE domain = ?'
    );
    this.stmtUpsertBaseline = db.prepare(`
      INSERT INTO baselines (domain, metric, expected_value, tolerance, sample_count, last_updated)
      VALUES (@domain, @metric, @expectedValue, @tolerance, @sampleCount, datetime('now'))
      ON CONFLICT(domain, metric) DO UPDATE SET
        expected_value = @expectedValue,
        tolerance = @tolerance,
        sample_count = @sampleCount,
        last_updated = datetime('now')
    `);
    this.stmtInsertZeroDayCandidate = db.prepare(`
      INSERT INTO zero_day_candidates (detected_at, domain, anomaly_type, baseline_deviation, details)
      VALUES (@detectedAt, @domain, @anomalyType, @baselineDeviation, @details)
    `);
    this.stmtGetZeroDayCandidates = db.prepare(
      'SELECT id, detected_at, domain, anomaly_type, baseline_deviation, details, resolved, resolution, resolved_at FROM zero_day_candidates WHERE detected_at >= ? ORDER BY detected_at DESC'
    );
    this.stmtGetOpenZeroDayCandidates = db.prepare(
      'SELECT id, detected_at, domain, anomaly_type, baseline_deviation, details, resolved, resolution, resolved_at FROM zero_day_candidates WHERE resolved = 0 ORDER BY detected_at DESC'
    );
    this.stmtResolveZeroDayCandidate = db.prepare(
      'UPDATE zero_day_candidates SET resolved = 1, resolution = ?, resolved_at = ? WHERE id = ?'
    );
  }

  private mapZeroDayRow(row: any): ZeroDayCandidate {
    return {
      id: row.id,
      detectedAt: row.detected_at,
      domain: row.domain,
      anomalyType: row.anomaly_type,
      baselineDeviation: row.baseline_deviation,
      details: row.details,
      resolved: !!row.resolved,
      resolution: row.resolution,
      resolvedAt: row.resolved_at,
    };
  }

  getBaseline(domain: string, metric: string): BaselineEntry | null {
    const row = this.stmtGetBaseline.get(domain, metric) as any;
    if (!row) return null;
    return {
      domain: row.domain,
      metric: row.metric,
      expectedValue: row.expected_value,
      tolerance: row.tolerance,
      sampleCount: row.sample_count,
      lastUpdated: row.last_updated,
    };
  }

  getBaselinesByDomain(domain: string): BaselineEntry[] {
    const rows = this.stmtGetBaselinesByDomain.all(domain) as any[];
    return rows.map(row => ({
      domain: row.domain,
      metric: row.metric,
      expectedValue: row.expected_value,
      tolerance: row.tolerance,
      sampleCount: row.sample_count,
      lastUpdated: row.last_updated,
    }));
  }

  upsertBaseline(domain: string, metric: string, expectedValue: number, tolerance: number, sampleCount: number): void {
    this.stmtUpsertBaseline.run({
      domain,
      metric,
      expectedValue,
      tolerance,
      sampleCount,
    });
  }

  insertZeroDayCandidate(candidate: Omit<ZeroDayCandidate, 'id' | 'resolved' | 'resolution' | 'resolvedAt'>): number {
    const result = this.stmtInsertZeroDayCandidate.run({
      detectedAt: candidate.detectedAt,
      domain: candidate.domain,
      anomalyType: candidate.anomalyType,
      baselineDeviation: candidate.baselineDeviation,
      details: candidate.details,
    });
    return Number(result.lastInsertRowid);
  }

  getZeroDayCandidates(since: number): ZeroDayCandidate[] {
    const rows = this.stmtGetZeroDayCandidates.all(since) as any[];
    return rows.map(row => this.mapZeroDayRow(row));
  }

  getOpenZeroDayCandidates(): ZeroDayCandidate[] {
    const rows = this.stmtGetOpenZeroDayCandidates.all() as any[];
    return rows.map(row => this.mapZeroDayRow(row));
  }

  resolveZeroDayCandidate(id: number, resolution: string): boolean {
    const result = this.stmtResolveZeroDayCandidate.run(resolution, Date.now(), id);
    return result.changes > 0;
  }
}
