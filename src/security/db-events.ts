import type Database from 'better-sqlite3';
import type { SecurityEvent, TrustChange } from './types';

/**
 * Events + analytics database operations.
 * Extracted from SecurityDB for separation of concerns.
 */
export class SecurityEventsDB {
  private stmtInsertEvent: Database.Statement;
  private stmtGetRecentEvents: Database.Statement;
  private stmtGetRecentEventsBySeverity: Database.Statement;
  private stmtGetRecentEventsByCategory: Database.Statement;
  private stmtGetEventsForDomain: Database.Statement;
  private stmtCountEventsSince: Database.Statement;
  private stmtCountEventsSinceByAction: Database.Statement;
  private stmtGetTopBlockedDomains: Database.Statement;
  private stmtGetNewDomains: Database.Statement;
  private stmtGetTrustChanges: Database.Statement;
  private stmtGetRecentAnomalyEvents: Database.Statement;
  private stmtPruneOldEvents: Database.Statement;

  onEventLogged: ((event: SecurityEvent) => void) | null = null;

  constructor(private db: Database.Database) {
    this.stmtInsertEvent = db.prepare(`
      INSERT INTO events (timestamp, domain, tab_id, event_type, severity, category, details, action_taken, false_positive, confidence)
      VALUES (@timestamp, @domain, @tabId, @eventType, @severity, @category, @details, @actionTaken, @falsePositive, @confidence)
    `);
    this.stmtGetRecentEvents = db.prepare(
      'SELECT id, timestamp, domain, tab_id, event_type, severity, category, details, action_taken, false_positive, confidence FROM events ORDER BY timestamp DESC LIMIT ?'
    );
    this.stmtGetRecentEventsBySeverity = db.prepare(
      'SELECT id, timestamp, domain, tab_id, event_type, severity, category, details, action_taken, false_positive, confidence FROM events WHERE severity = ? ORDER BY timestamp DESC LIMIT ?'
    );
    this.stmtGetRecentEventsByCategory = db.prepare(
      'SELECT id, timestamp, domain, tab_id, event_type, severity, category, details, action_taken, false_positive, confidence FROM events WHERE category = ? ORDER BY timestamp DESC LIMIT ?'
    );
    this.stmtGetEventsForDomain = db.prepare(
      'SELECT id, timestamp, domain, tab_id, event_type, severity, category, details, action_taken, false_positive, confidence FROM events WHERE domain = ? ORDER BY timestamp DESC LIMIT ?'
    );
    this.stmtCountEventsSince = db.prepare(
      'SELECT COUNT(*) as total FROM events WHERE timestamp >= ?'
    );
    this.stmtCountEventsSinceByAction = db.prepare(
      'SELECT COUNT(*) as total FROM events WHERE timestamp >= ? AND action_taken = ?'
    );
    this.stmtGetTopBlockedDomains = db.prepare(
      'SELECT domain, COUNT(*) as count FROM events WHERE timestamp >= ? AND action_taken IN (\'auto_block\', \'agent_block\') AND domain IS NOT NULL GROUP BY domain ORDER BY count DESC LIMIT ?'
    );
    this.stmtGetNewDomains = db.prepare(
      'SELECT domain, first_seen FROM domains WHERE first_seen >= ? ORDER BY first_seen DESC'
    );
    this.stmtGetTrustChanges = db.prepare(
      'SELECT domain, details, timestamp FROM events WHERE timestamp >= ? AND event_type = \'info\' AND category = \'behavior\' ORDER BY timestamp DESC'
    );
    this.stmtGetRecentAnomalyEvents = db.prepare(
      'SELECT id, timestamp, domain, tab_id, event_type, severity, category, details, action_taken, false_positive, confidence FROM events WHERE category = \'behavior\' AND event_type = \'anomaly\' ORDER BY timestamp DESC LIMIT ?'
    );
    this.stmtPruneOldEvents = db.prepare(
      'DELETE FROM events WHERE timestamp < ?'
    );
  }

  private mapEventRow(row: any): SecurityEvent {
    return {
      id: row.id,
      timestamp: row.timestamp,
      domain: row.domain,
      tabId: row.tab_id,
      eventType: row.event_type,
      severity: row.severity,
      category: row.category,
      details: row.details,
      actionTaken: row.action_taken,
      confidence: row.confidence ?? 500,
      falsePositive: !!row.false_positive,
    };
  }

  logEvent(event: SecurityEvent): number {
    const result = this.stmtInsertEvent.run({
      timestamp: event.timestamp,
      domain: event.domain,
      tabId: event.tabId,
      eventType: event.eventType,
      severity: event.severity,
      category: event.category,
      details: event.details,
      actionTaken: event.actionTaken,
      falsePositive: event.falsePositive ? 1 : 0,
      confidence: event.confidence ?? 500,
    });
    const loggedEvent: SecurityEvent = {
      ...event,
      id: Number(result.lastInsertRowid),
      confidence: event.confidence ?? 500,
    };
    this.onEventLogged?.(loggedEvent);
    return loggedEvent.id!;
  }

  getRecentEvents(limit: number, severity?: string, category?: string): SecurityEvent[] {
    let rows: unknown[];
    if (category) {
      rows = this.stmtGetRecentEventsByCategory.all(category, limit);
    } else if (severity) {
      rows = this.stmtGetRecentEventsBySeverity.all(severity, limit);
    } else {
      rows = this.stmtGetRecentEvents.all(limit);
    }
    return (rows as any[]).map(row => this.mapEventRow(row));
  }

  getEventsForDomain(domain: string, limit: number): SecurityEvent[] {
    const rows = this.stmtGetEventsForDomain.all(domain, limit) as any[];
    return rows.map(row => this.mapEventRow(row));
  }

  countEvents(since: number, actionFilter?: string): number {
    if (actionFilter) {
      return (this.stmtCountEventsSinceByAction.get(since, actionFilter) as { total: number }).total;
    }
    return (this.stmtCountEventsSince.get(since) as { total: number }).total;
  }

  getTopBlockedDomains(since: number, limit: number): { domain: string; count: number }[] {
    return this.stmtGetTopBlockedDomains.all(since, limit) as { domain: string; count: number }[];
  }

  getNewDomains(since: number): { domain: string; firstSeen: number }[] {
    const rows = this.stmtGetNewDomains.all(since) as any[];
    return rows.map(row => ({ domain: row.domain, firstSeen: row.first_seen }));
  }

  getTrustChanges(since: number): TrustChange[] {
    const rows = this.stmtGetTrustChanges.all(since) as any[];
    return rows.map(row => {
      try {
        const details = JSON.parse(row.details);
        return {
          domain: row.domain,
          event: details.event || 'unknown',
          oldTrust: details.oldTrust ?? 0,
          newTrust: details.newTrust ?? 0,
          timestamp: row.timestamp,
        };
      } catch {
        return {
          domain: row.domain,
          event: 'unknown',
          oldTrust: 0,
          newTrust: 0,
          timestamp: row.timestamp,
        };
      }
    });
  }

  getRecentAnomalies(limit: number): SecurityEvent[] {
    const rows = this.stmtGetRecentAnomalyEvents.all(limit) as any[];
    return rows.map(row => this.mapEventRow(row));
  }

  pruneOldEvents(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    const result = this.stmtPruneOldEvents.run(cutoff);
    return result.changes;
  }
}
