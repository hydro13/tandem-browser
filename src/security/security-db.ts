import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { SecurityEvent, DomainInfo, BlocklistEntry, GuardianMode, WhitelistEntry } from './types';

export class SecurityDB {
  private db: Database.Database;

  // Prepared statements (cached for hot-path performance)
  private stmtIsDomainBlocked!: Database.Statement;
  private stmtGetDomainInfo!: Database.Statement;
  private stmtUpsertDomain!: Database.Statement;
  private stmtUpdateDomainSeen!: Database.Statement;
  private stmtInsertEvent!: Database.Statement;
  private stmtAddBlocklist!: Database.Statement;
  private stmtGetRecentEvents!: Database.Statement;
  private stmtGetRecentEventsBySeverity!: Database.Statement;
  private stmtGetDomains!: Database.Statement;
  private stmtBlocklistCount!: Database.Statement;
  private stmtBlocklistBySource!: Database.Statement;
  private stmtEventCount!: Database.Statement;
  private stmtDomainCount!: Database.Statement;
  private stmtSetDomainTrust!: Database.Statement;
  private stmtSetDomainMode!: Database.Statement;
  // Phase 2: Outbound whitelist + category-filtered events
  private stmtIsWhitelistedPair!: Database.Statement;
  private stmtAddWhitelistPair!: Database.Statement;
  private stmtGetWhitelistEntries!: Database.Statement;
  private stmtGetRecentEventsByCategory!: Database.Statement;

  constructor() {
    const dbDir = path.join(os.homedir(), '.tandem', 'security');
    fs.mkdirSync(dbDir, { recursive: true });
    this.db = new Database(path.join(dbDir, 'shield.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.initialize();
    this.prepareStatements();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS domains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT UNIQUE NOT NULL,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        visit_count INTEGER DEFAULT 1,
        trust_level INTEGER DEFAULT 30,
        guardian_mode TEXT DEFAULT 'balanced',
        category TEXT DEFAULT 'unknown',
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS baselines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        metric TEXT NOT NULL,
        expected_value REAL NOT NULL,
        tolerance REAL NOT NULL,
        sample_count INTEGER DEFAULT 1,
        last_updated TEXT DEFAULT (datetime('now')),
        UNIQUE(domain, metric)
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        domain TEXT,
        tab_id TEXT,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        category TEXT,
        details TEXT,
        action_taken TEXT,
        false_positive INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS script_fingerprints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        script_url TEXT NOT NULL,
        script_hash TEXT,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        trusted INTEGER DEFAULT 0,
        UNIQUE(domain, script_url)
      );

      CREATE TABLE IF NOT EXISTS zero_day_candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        detected_at INTEGER NOT NULL,
        domain TEXT NOT NULL,
        anomaly_type TEXT NOT NULL,
        baseline_deviation REAL,
        details TEXT,
        resolved INTEGER DEFAULT 0,
        resolution TEXT,
        resolved_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS blocklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT UNIQUE NOT NULL,
        source TEXT NOT NULL,
        category TEXT,
        added_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT
      );

      CREATE TABLE IF NOT EXISTS outbound_whitelist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origin_domain TEXT NOT NULL,
        destination_domain TEXT NOT NULL,
        added_at TEXT DEFAULT (datetime('now')),
        UNIQUE(origin_domain, destination_domain)
      );

      CREATE INDEX IF NOT EXISTS idx_events_domain ON events(domain);
      CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
      CREATE INDEX IF NOT EXISTS idx_baselines_domain ON baselines(domain);
      CREATE INDEX IF NOT EXISTS idx_blocklist_domain ON blocklist(domain);
      CREATE INDEX IF NOT EXISTS idx_script_fp_domain ON script_fingerprints(domain);
      CREATE INDEX IF NOT EXISTS idx_zeroday_domain ON zero_day_candidates(domain);
      CREATE INDEX IF NOT EXISTS idx_zeroday_resolved ON zero_day_candidates(resolved);
    `);
  }

  private prepareStatements(): void {
    this.stmtIsDomainBlocked = this.db.prepare(
      'SELECT domain, source, category FROM blocklist WHERE domain = ?'
    );
    this.stmtGetDomainInfo = this.db.prepare(
      'SELECT id, domain, first_seen, last_seen, visit_count, trust_level, guardian_mode, category, notes FROM domains WHERE domain = ?'
    );
    this.stmtUpsertDomain = this.db.prepare(`
      INSERT INTO domains (domain, first_seen, last_seen, visit_count, trust_level, guardian_mode, category, notes)
      VALUES (@domain, @firstSeen, @lastSeen, @visitCount, @trustLevel, @guardianMode, @category, @notes)
      ON CONFLICT(domain) DO UPDATE SET
        last_seen = @lastSeen,
        visit_count = visit_count + 1,
        guardian_mode = COALESCE(@guardianMode, guardian_mode),
        category = COALESCE(@category, category),
        notes = COALESCE(@notes, notes),
        updated_at = datetime('now')
    `);
    this.stmtUpdateDomainSeen = this.db.prepare(
      'UPDATE domains SET last_seen = ?, visit_count = visit_count + 1, updated_at = datetime(\'now\') WHERE domain = ?'
    );
    this.stmtInsertEvent = this.db.prepare(`
      INSERT INTO events (timestamp, domain, tab_id, event_type, severity, category, details, action_taken, false_positive)
      VALUES (@timestamp, @domain, @tabId, @eventType, @severity, @category, @details, @actionTaken, @falsePositive)
    `);
    this.stmtAddBlocklist = this.db.prepare(`
      INSERT OR IGNORE INTO blocklist (domain, source, category)
      VALUES (@domain, @source, @category)
    `);
    this.stmtGetRecentEvents = this.db.prepare(
      'SELECT id, timestamp, domain, tab_id, event_type, severity, category, details, action_taken, false_positive FROM events ORDER BY timestamp DESC LIMIT ?'
    );
    this.stmtGetRecentEventsBySeverity = this.db.prepare(
      'SELECT id, timestamp, domain, tab_id, event_type, severity, category, details, action_taken, false_positive FROM events WHERE severity = ? ORDER BY timestamp DESC LIMIT ?'
    );
    this.stmtGetDomains = this.db.prepare(
      'SELECT id, domain, first_seen, last_seen, visit_count, trust_level, guardian_mode, category, notes FROM domains ORDER BY last_seen DESC LIMIT ?'
    );
    this.stmtBlocklistCount = this.db.prepare(
      'SELECT COUNT(*) as total FROM blocklist'
    );
    this.stmtBlocklistBySource = this.db.prepare(
      'SELECT source, COUNT(*) as count FROM blocklist GROUP BY source'
    );
    this.stmtEventCount = this.db.prepare(
      'SELECT COUNT(*) as total FROM events'
    );
    this.stmtDomainCount = this.db.prepare(
      'SELECT COUNT(*) as total FROM domains'
    );
    this.stmtSetDomainTrust = this.db.prepare(
      'UPDATE domains SET trust_level = ?, updated_at = datetime(\'now\') WHERE domain = ?'
    );
    this.stmtSetDomainMode = this.db.prepare(
      'UPDATE domains SET guardian_mode = ?, updated_at = datetime(\'now\') WHERE domain = ?'
    );
    // Phase 2: Outbound whitelist + category-filtered events
    this.stmtIsWhitelistedPair = this.db.prepare(
      'SELECT id FROM outbound_whitelist WHERE origin_domain = ? AND destination_domain = ?'
    );
    this.stmtAddWhitelistPair = this.db.prepare(
      'INSERT OR IGNORE INTO outbound_whitelist (origin_domain, destination_domain) VALUES (?, ?)'
    );
    this.stmtGetWhitelistEntries = this.db.prepare(
      'SELECT id, origin_domain, destination_domain, added_at FROM outbound_whitelist ORDER BY added_at DESC'
    );
    this.stmtGetRecentEventsByCategory = this.db.prepare(
      'SELECT id, timestamp, domain, tab_id, event_type, severity, category, details, action_taken, false_positive FROM events WHERE category = ? ORDER BY timestamp DESC LIMIT ?'
    );
  }

  // === Fast lookups (used in request handler — MUST be fast) ===

  isDomainBlocked(domain: string): { blocked: boolean; source?: string; category?: string } {
    const row = this.stmtIsDomainBlocked.get(domain) as { domain: string; source: string; category: string } | undefined;
    if (row) {
      return { blocked: true, source: row.source, category: row.category };
    }
    // Check parent domain: if "evil.com" is blocked, block "sub.evil.com"
    const parts = domain.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      const parent = parts.slice(i).join('.');
      const parentRow = this.stmtIsDomainBlocked.get(parent) as { domain: string; source: string; category: string } | undefined;
      if (parentRow) {
        return { blocked: true, source: parentRow.source, category: parentRow.category };
      }
    }
    return { blocked: false };
  }

  getDomainInfo(domain: string): DomainInfo | null {
    const row = this.stmtGetDomainInfo.get(domain) as any;
    if (!row) return null;
    return {
      id: row.id,
      domain: row.domain,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      visitCount: row.visit_count,
      trustLevel: row.trust_level,
      guardianMode: row.guardian_mode as GuardianMode,
      category: row.category,
      notes: row.notes,
    };
  }

  // === Write operations ===

  upsertDomain(domain: string, data: Partial<DomainInfo>): void {
    const existing = this.getDomainInfo(domain);
    if (existing) {
      // Update existing: only update specified fields
      if (data.guardianMode !== undefined) {
        this.stmtSetDomainMode.run(data.guardianMode, domain);
      }
      if (data.trustLevel !== undefined) {
        this.stmtSetDomainTrust.run(data.trustLevel, domain);
      }
      if (data.lastSeen !== undefined) {
        this.stmtUpdateDomainSeen.run(data.lastSeen, domain);
      }
    } else {
      // Insert new domain
      const now = Date.now();
      this.stmtUpsertDomain.run({
        domain,
        firstSeen: data.firstSeen ?? now,
        lastSeen: data.lastSeen ?? now,
        visitCount: data.visitCount ?? 1,
        trustLevel: data.trustLevel ?? 30,
        guardianMode: data.guardianMode ?? 'balanced',
        category: data.category ?? 'unknown',
        notes: data.notes ?? null,
      });
    }
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
    });
    return Number(result.lastInsertRowid);
  }

  addToBlocklist(entry: BlocklistEntry): void {
    this.stmtAddBlocklist.run({
      domain: entry.domain,
      source: entry.source,
      category: entry.category,
    });
  }

  // === Query operations ===

  getRecentEvents(limit: number, severity?: string, category?: string): SecurityEvent[] {
    let rows: unknown[];
    if (category) {
      rows = this.stmtGetRecentEventsByCategory.all(category, limit);
    } else if (severity) {
      rows = this.stmtGetRecentEventsBySeverity.all(severity, limit);
    } else {
      rows = this.stmtGetRecentEvents.all(limit);
    }

    return (rows as any[]).map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      domain: row.domain,
      tabId: row.tab_id,
      eventType: row.event_type,
      severity: row.severity,
      category: row.category,
      details: row.details,
      actionTaken: row.action_taken,
      falsePositive: !!row.false_positive,
    }));
  }

  getDomains(limit = 100): DomainInfo[] {
    const rows = this.stmtGetDomains.all(limit) as any[];
    return rows.map(row => ({
      id: row.id,
      domain: row.domain,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      visitCount: row.visit_count,
      trustLevel: row.trust_level,
      guardianMode: row.guardian_mode as GuardianMode,
      category: row.category,
      notes: row.notes,
    }));
  }

  getBlocklistStats(): { total: number; bySource: Record<string, number>; lastUpdate: string } {
    const totalRow = this.stmtBlocklistCount.get() as { total: number };
    const sourceRows = this.stmtBlocklistBySource.all() as { source: string; count: number }[];
    const bySource: Record<string, number> = {};
    for (const row of sourceRows) {
      bySource[row.source] = row.count;
    }
    return {
      total: totalRow.total,
      bySource,
      lastUpdate: new Date().toISOString(),
    };
  }

  getEventCount(): number {
    return (this.stmtEventCount.get() as { total: number }).total;
  }

  getDomainCount(): number {
    return (this.stmtDomainCount.get() as { total: number }).total;
  }

  // === Phase 2: Outbound whitelist ===

  isWhitelistedPair(origin: string, destination: string): boolean {
    return !!this.stmtIsWhitelistedPair.get(origin, destination);
  }

  addWhitelistPair(origin: string, destination: string): void {
    this.stmtAddWhitelistPair.run(origin, destination);
  }

  getWhitelistEntries(): WhitelistEntry[] {
    const rows = this.stmtGetWhitelistEntries.all() as any[];
    return rows.map(row => ({
      id: row.id,
      originDomain: row.origin_domain,
      destinationDomain: row.destination_domain,
      addedAt: row.added_at,
    }));
  }

  // === Cleanup ===

  close(): void {
    this.db.close();
  }
}
