import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { tandemDir } from '../utils/paths';
import type { SecurityEvent, DomainInfo, BlocklistEntry, GuardianMode, WhitelistEntry, BaselineEntry, ZeroDayCandidate, TrustChange } from './types';

export class SecurityDB {
  private db: Database.Database;

  // Phase 0-B: Optional callback fired after every logEvent() call
  // Phase 7-A: Updated to pass the logged event for analyzer routing
  onEventLogged: ((event: SecurityEvent) => void) | null = null;

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
  // Phase 3: Script fingerprints + permission log
  private stmtGetScriptFingerprint!: Database.Statement;
  private stmtUpsertScriptFingerprint!: Database.Statement;
  private stmtGetScriptsByDomain!: Database.Statement;
  private stmtGetScriptFingerprintCount!: Database.Statement;
  // Phase 3-A: Cross-domain script correlation
  private stmtGetDomainsForHash!: Database.Statement;
  private stmtGetDomainCountForHash!: Database.Statement;
  // Phase 3-B: Normalized hashing + correlation API
  private stmtUpdateNormalizedHash!: Database.Statement;
  private stmtGetDomainsForNormalizedHash!: Database.Statement;
  private stmtGetWidespreadScripts!: Database.Statement;
  private stmtGetCrossDomainScriptCount!: Database.Statement;
  // Phase 8: Reliable script_hash from source
  private stmtUpdateScriptHash!: Database.Statement;
  // Phase 6-A: AST hash
  private stmtUpdateAstHash!: Database.Statement;
  // Phase 6-B: AST-based correlation + similarity
  private stmtGetDomainsForAstHash!: Database.Statement;
  private stmtGetAstMatches!: Database.Statement;
  private stmtGetWidespreadAstScripts!: Database.Statement;
  private stmtUpdateAstFeatures!: Database.Statement;
  private stmtGetAstFeaturesForBlockedCheck!: Database.Statement;
  // Phase 5: Baselines, zero-day candidates, analytics
  private stmtGetBaseline!: Database.Statement;
  private stmtGetBaselinesByDomain!: Database.Statement;
  private stmtUpsertBaseline!: Database.Statement;
  private stmtInsertZeroDayCandidate!: Database.Statement;
  private stmtGetZeroDayCandidates!: Database.Statement;
  private stmtGetOpenZeroDayCandidates!: Database.Statement;
  private stmtResolveZeroDayCandidate!: Database.Statement;
  private stmtCountEventsSince!: Database.Statement;
  private stmtCountEventsSinceByAction!: Database.Statement;
  private stmtGetTopBlockedDomains!: Database.Statement;
  private stmtGetNewDomains!: Database.Statement;
  private stmtGetTrustChanges!: Database.Statement;
  private stmtPruneOldEvents!: Database.Statement;
  private stmtDeleteBlocklistBySource!: Database.Statement;
  private stmtGetRecentAnomalyEvents!: Database.Statement;
  // Phase 7-A: Events by domain (for AnalyzerContext)
  private stmtGetEventsForDomain!: Database.Statement;
  // Phase 0-B: Blocklist metadata
  private stmtGetBlocklistMeta!: Database.Statement;
  private stmtUpsertBlocklistMeta!: Database.Statement;

  constructor() {
    const dbDir = tandemDir('security');
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

      CREATE TABLE IF NOT EXISTS blocklist_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_domain ON events(domain);
      CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
      CREATE INDEX IF NOT EXISTS idx_baselines_domain ON baselines(domain);
      CREATE INDEX IF NOT EXISTS idx_blocklist_domain ON blocklist(domain);
      CREATE INDEX IF NOT EXISTS idx_script_fp_domain ON script_fingerprints(domain);
      CREATE INDEX IF NOT EXISTS idx_script_fp_hash ON script_fingerprints(script_hash);
      CREATE INDEX IF NOT EXISTS idx_zeroday_domain ON zero_day_candidates(domain);
      CREATE INDEX IF NOT EXISTS idx_zeroday_resolved ON zero_day_candidates(resolved);
    `);

    // Phase 3-B: Add normalized_hash column to script_fingerprints (backward-compatible)
    try {
      this.db.exec('ALTER TABLE script_fingerprints ADD COLUMN normalized_hash TEXT');
    } catch {
      // Column already exists — ignore
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_script_fp_normalized_hash ON script_fingerprints(normalized_hash)');

    // Phase 5-A: Add confidence column to events (backward-compatible, default 500 = BEHAVIORAL)
    try {
      this.db.exec('ALTER TABLE events ADD COLUMN confidence INTEGER DEFAULT 500');
    } catch {
      // Column already exists — ignore
    }

    // Phase 6-A: Add ast_hash column to script_fingerprints (backward-compatible)
    try {
      this.db.exec('ALTER TABLE script_fingerprints ADD COLUMN ast_hash TEXT');
    } catch {
      // Column already exists — ignore
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_script_fp_ast_hash ON script_fingerprints(ast_hash)');

    // Phase 6-B: Add ast_features column for similarity scoring (stores serialized feature vector)
    try {
      this.db.exec('ALTER TABLE script_fingerprints ADD COLUMN ast_features TEXT');
    } catch {
      // Column already exists — ignore
    }
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
      INSERT INTO events (timestamp, domain, tab_id, event_type, severity, category, details, action_taken, false_positive, confidence)
      VALUES (@timestamp, @domain, @tabId, @eventType, @severity, @category, @details, @actionTaken, @falsePositive, @confidence)
    `);
    this.stmtAddBlocklist = this.db.prepare(`
      INSERT OR IGNORE INTO blocklist (domain, source, category)
      VALUES (@domain, @source, @category)
    `);
    this.stmtGetRecentEvents = this.db.prepare(
      'SELECT id, timestamp, domain, tab_id, event_type, severity, category, details, action_taken, false_positive, confidence FROM events ORDER BY timestamp DESC LIMIT ?'
    );
    this.stmtGetRecentEventsBySeverity = this.db.prepare(
      'SELECT id, timestamp, domain, tab_id, event_type, severity, category, details, action_taken, false_positive, confidence FROM events WHERE severity = ? ORDER BY timestamp DESC LIMIT ?'
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
      'SELECT id, timestamp, domain, tab_id, event_type, severity, category, details, action_taken, false_positive, confidence FROM events WHERE category = ? ORDER BY timestamp DESC LIMIT ?'
    );
    // Phase 7-A: Events by domain (for AnalyzerContext)
    this.stmtGetEventsForDomain = this.db.prepare(
      'SELECT id, timestamp, domain, tab_id, event_type, severity, category, details, action_taken, false_positive, confidence FROM events WHERE domain = ? ORDER BY timestamp DESC LIMIT ?'
    );
    // Phase 3: Script fingerprints
    this.stmtGetScriptFingerprint = this.db.prepare(
      'SELECT id, domain, script_url, script_hash, first_seen, last_seen, trusted FROM script_fingerprints WHERE domain = ? AND script_url = ?'
    );
    this.stmtUpsertScriptFingerprint = this.db.prepare(`
      INSERT INTO script_fingerprints (domain, script_url, script_hash, first_seen, last_seen, trusted)
      VALUES (@domain, @scriptUrl, @scriptHash, @firstSeen, @lastSeen, 0)
      ON CONFLICT(domain, script_url) DO UPDATE SET
        last_seen = @lastSeen,
        script_hash = COALESCE(@scriptHash, script_hash)
    `);
    this.stmtGetScriptsByDomain = this.db.prepare(
      'SELECT id, domain, script_url, script_hash, first_seen, last_seen, trusted FROM script_fingerprints WHERE domain = ? ORDER BY last_seen DESC LIMIT ?'
    );
    this.stmtGetScriptFingerprintCount = this.db.prepare(
      'SELECT COUNT(*) as total FROM script_fingerprints'
    );
    // Phase 3-A: Cross-domain script correlation
    this.stmtGetDomainsForHash = this.db.prepare(
      'SELECT DISTINCT domain FROM script_fingerprints WHERE script_hash = ?'
    );
    this.stmtGetDomainCountForHash = this.db.prepare(
      'SELECT COUNT(DISTINCT domain) as count FROM script_fingerprints WHERE script_hash = ?'
    );
    // Phase 3-B: Normalized hashing + correlation API
    this.stmtUpdateNormalizedHash = this.db.prepare(
      'UPDATE script_fingerprints SET normalized_hash = ? WHERE domain = ? AND script_url = ?'
    );
    this.stmtGetDomainsForNormalizedHash = this.db.prepare(
      'SELECT DISTINCT domain FROM script_fingerprints WHERE normalized_hash = ?'
    );
    this.stmtGetWidespreadScripts = this.db.prepare(`
      SELECT script_hash, MAX(normalized_hash) as normalized_hash,
             COUNT(DISTINCT domain) as domain_count,
             MIN(first_seen) as first_seen
      FROM script_fingerprints
      WHERE script_hash IS NOT NULL
      GROUP BY script_hash
      HAVING domain_count >= 2
      ORDER BY domain_count DESC
      LIMIT 50
    `);
    this.stmtGetCrossDomainScriptCount = this.db.prepare(`
      SELECT COUNT(*) as total FROM (
        SELECT script_hash FROM script_fingerprints
        WHERE script_hash IS NOT NULL
        GROUP BY script_hash
        HAVING COUNT(DISTINCT domain) >= 2
      )
    `);
    // Phase 8: Reliable script_hash from source (update when CDP didn't provide one)
    this.stmtUpdateScriptHash = this.db.prepare(
      'UPDATE script_fingerprints SET script_hash = ? WHERE domain = ? AND script_url = ? AND script_hash IS NULL'
    );
    // Phase 6-A: AST hash
    this.stmtUpdateAstHash = this.db.prepare(
      'UPDATE script_fingerprints SET ast_hash = ? WHERE domain = ? AND script_url = ?'
    );
    // Phase 6-B: AST-based correlation
    this.stmtGetDomainsForAstHash = this.db.prepare(
      'SELECT DISTINCT domain FROM script_fingerprints WHERE ast_hash = ? AND ast_hash IS NOT NULL'
    );
    this.stmtGetAstMatches = this.db.prepare(`
      SELECT script_hash, normalized_hash, ast_hash, domain, script_url, first_seen
      FROM script_fingerprints
      WHERE ast_hash = ? AND ast_hash IS NOT NULL
      ORDER BY first_seen ASC
    `);
    this.stmtGetWidespreadAstScripts = this.db.prepare(`
      SELECT ast_hash, COUNT(DISTINCT domain) as domain_count,
             COUNT(DISTINCT script_hash) as hash_variant_count,
             MIN(first_seen) as first_seen
      FROM script_fingerprints
      WHERE ast_hash IS NOT NULL
      GROUP BY ast_hash
      HAVING domain_count >= 2
      ORDER BY domain_count DESC
      LIMIT 50
    `);
    this.stmtUpdateAstFeatures = this.db.prepare(
      'UPDATE script_fingerprints SET ast_features = ? WHERE domain = ? AND script_url = ?'
    );
    this.stmtGetAstFeaturesForBlockedCheck = this.db.prepare(`
      SELECT domain, script_url, ast_hash, ast_features
      FROM script_fingerprints
      WHERE ast_features IS NOT NULL
      ORDER BY last_seen DESC
      LIMIT 200
    `);
    // Phase 5: Baselines
    this.stmtGetBaseline = this.db.prepare(
      'SELECT domain, metric, expected_value, tolerance, sample_count, last_updated FROM baselines WHERE domain = ? AND metric = ?'
    );
    this.stmtGetBaselinesByDomain = this.db.prepare(
      'SELECT domain, metric, expected_value, tolerance, sample_count, last_updated FROM baselines WHERE domain = ?'
    );
    this.stmtUpsertBaseline = this.db.prepare(`
      INSERT INTO baselines (domain, metric, expected_value, tolerance, sample_count, last_updated)
      VALUES (@domain, @metric, @expectedValue, @tolerance, @sampleCount, datetime('now'))
      ON CONFLICT(domain, metric) DO UPDATE SET
        expected_value = @expectedValue,
        tolerance = @tolerance,
        sample_count = @sampleCount,
        last_updated = datetime('now')
    `);
    // Phase 5: Zero-day candidates
    this.stmtInsertZeroDayCandidate = this.db.prepare(`
      INSERT INTO zero_day_candidates (detected_at, domain, anomaly_type, baseline_deviation, details)
      VALUES (@detectedAt, @domain, @anomalyType, @baselineDeviation, @details)
    `);
    this.stmtGetZeroDayCandidates = this.db.prepare(
      'SELECT id, detected_at, domain, anomaly_type, baseline_deviation, details, resolved, resolution, resolved_at FROM zero_day_candidates WHERE detected_at >= ? ORDER BY detected_at DESC'
    );
    this.stmtGetOpenZeroDayCandidates = this.db.prepare(
      'SELECT id, detected_at, domain, anomaly_type, baseline_deviation, details, resolved, resolution, resolved_at FROM zero_day_candidates WHERE resolved = 0 ORDER BY detected_at DESC'
    );
    this.stmtResolveZeroDayCandidate = this.db.prepare(
      'UPDATE zero_day_candidates SET resolved = 1, resolution = ?, resolved_at = ? WHERE id = ?'
    );
    // Phase 5: Analytics queries
    this.stmtCountEventsSince = this.db.prepare(
      'SELECT COUNT(*) as total FROM events WHERE timestamp >= ?'
    );
    this.stmtCountEventsSinceByAction = this.db.prepare(
      'SELECT COUNT(*) as total FROM events WHERE timestamp >= ? AND action_taken = ?'
    );
    this.stmtGetTopBlockedDomains = this.db.prepare(
      'SELECT domain, COUNT(*) as count FROM events WHERE timestamp >= ? AND action_taken IN (\'auto_block\', \'agent_block\') AND domain IS NOT NULL GROUP BY domain ORDER BY count DESC LIMIT ?'
    );
    this.stmtGetNewDomains = this.db.prepare(
      'SELECT domain, first_seen FROM domains WHERE first_seen >= ? ORDER BY first_seen DESC'
    );
    this.stmtGetTrustChanges = this.db.prepare(
      'SELECT domain, details, timestamp FROM events WHERE timestamp >= ? AND event_type = \'info\' AND category = \'behavior\' ORDER BY timestamp DESC'
    );
    this.stmtPruneOldEvents = this.db.prepare(
      'DELETE FROM events WHERE timestamp < ?'
    );
    this.stmtDeleteBlocklistBySource = this.db.prepare(
      'DELETE FROM blocklist WHERE source = ?'
    );
    this.stmtGetRecentAnomalyEvents = this.db.prepare(
      'SELECT id, timestamp, domain, tab_id, event_type, severity, category, details, action_taken, false_positive, confidence FROM events WHERE category = \'behavior\' AND event_type = \'anomaly\' ORDER BY timestamp DESC LIMIT ?'
    );
    // Phase 0-B: Blocklist metadata
    this.stmtGetBlocklistMeta = this.db.prepare(
      'SELECT value FROM blocklist_metadata WHERE key = ?'
    );
    this.stmtUpsertBlocklistMeta = this.db.prepare(
      'INSERT INTO blocklist_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
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
      confidence: row.confidence ?? 500,
      falsePositive: !!row.false_positive,
    }));
  }

  getEventsForDomain(domain: string, limit: number): SecurityEvent[] {
    const rows = this.stmtGetEventsForDomain.all(domain, limit) as any[];
    return rows.map(row => ({
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

  // === Phase 3: Script fingerprints ===

  getScriptFingerprint(domain: string, scriptUrl: string): { id: number; domain: string; scriptUrl: string; scriptHash: string | null; firstSeen: number; lastSeen: number; trusted: boolean } | null {
    const row = this.stmtGetScriptFingerprint.get(domain, scriptUrl) as any;
    if (!row) return null;
    return {
      id: row.id,
      domain: row.domain,
      scriptUrl: row.script_url,
      scriptHash: row.script_hash,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      trusted: !!row.trusted,
    };
  }

  upsertScriptFingerprint(domain: string, scriptUrl: string, scriptHash?: string): void {
    const now = Date.now();
    this.stmtUpsertScriptFingerprint.run({
      domain,
      scriptUrl,
      scriptHash: scriptHash || null,
      firstSeen: now,
      lastSeen: now,
    });
  }

  getScriptsByDomain(domain: string, limit = 100): { id: number; scriptUrl: string; scriptHash: string | null; firstSeen: number; lastSeen: number; trusted: boolean }[] {
    const rows = this.stmtGetScriptsByDomain.all(domain, limit) as any[];
    return rows.map(row => ({
      id: row.id,
      scriptUrl: row.script_url,
      scriptHash: row.script_hash,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      trusted: !!row.trusted,
    }));
  }

  getScriptFingerprintCount(): number {
    return (this.stmtGetScriptFingerprintCount.get() as { total: number }).total;
  }

  // === Phase 3-A: Cross-domain script correlation ===

  getDomainsForHash(scriptHash: string): string[] {
    const rows = this.stmtGetDomainsForHash.all(scriptHash) as { domain: string }[];
    return rows.map(row => row.domain);
  }

  getDomainCountForHash(scriptHash: string): number {
    return (this.stmtGetDomainCountForHash.get(scriptHash) as { count: number }).count;
  }

  // === Phase 3-B: Normalized hashing + correlation API ===

  updateNormalizedHash(domain: string, scriptUrl: string, normalizedHash: string): void {
    this.stmtUpdateNormalizedHash.run(normalizedHash, domain, scriptUrl);
  }

  // === Phase 8: Reliable script_hash from source ===

  updateScriptHash(domain: string, scriptUrl: string, hash: string): void {
    this.stmtUpdateScriptHash.run(hash, domain, scriptUrl);
  }

  // === Phase 6-A: AST hash ===

  updateAstHash(domain: string, scriptUrl: string, astHash: string): void {
    this.stmtUpdateAstHash.run(astHash, domain, scriptUrl);
  }

  // === Phase 6-B: AST-based correlation ===

  getDomainsForAstHash(astHash: string): string[] {
    const rows = this.stmtGetDomainsForAstHash.all(astHash) as { domain: string }[];
    return rows.map(row => row.domain);
  }

  getAstMatches(astHash: string): { scriptHash: string | null; normalizedHash: string | null; astHash: string; domain: string; scriptUrl: string; firstSeen: number }[] {
    const rows = this.stmtGetAstMatches.all(astHash) as any[];
    return rows.map(row => ({
      scriptHash: row.script_hash,
      normalizedHash: row.normalized_hash,
      astHash: row.ast_hash,
      domain: row.domain,
      scriptUrl: row.script_url,
      firstSeen: row.first_seen,
    }));
  }

  getWidespreadAstScripts(): { astHash: string; domainCount: number; hashVariantCount: number; firstSeen: number }[] {
    const rows = this.stmtGetWidespreadAstScripts.all() as any[];
    return rows.map(row => ({
      astHash: row.ast_hash,
      domainCount: row.domain_count,
      hashVariantCount: row.hash_variant_count,
      firstSeen: row.first_seen,
    }));
  }

  updateAstFeatures(domain: string, scriptUrl: string, features: string): void {
    this.stmtUpdateAstFeatures.run(features, domain, scriptUrl);
  }

  getScriptsWithAstFeatures(): { domain: string; scriptUrl: string; astHash: string | null; astFeatures: string }[] {
    const rows = this.stmtGetAstFeaturesForBlockedCheck.all() as any[];
    return rows.map(row => ({
      domain: row.domain,
      scriptUrl: row.script_url,
      astHash: row.ast_hash,
      astFeatures: row.ast_features,
    }));
  }

  getDomainsForNormalizedHash(normalizedHash: string): string[] {
    const rows = this.stmtGetDomainsForNormalizedHash.all(normalizedHash) as { domain: string }[];
    return rows.map(row => row.domain);
  }

  getWidespreadScripts(): { scriptHash: string; normalizedHash: string | null; domainCount: number; firstSeen: number }[] {
    const rows = this.stmtGetWidespreadScripts.all() as { script_hash: string; normalized_hash: string | null; domain_count: number; first_seen: number }[];
    return rows.map(row => ({
      scriptHash: row.script_hash,
      normalizedHash: row.normalized_hash,
      domainCount: row.domain_count,
      firstSeen: row.first_seen,
    }));
  }

  getCrossDomainScriptCount(): number {
    return (this.stmtGetCrossDomainScriptCount.get() as { total: number }).total;
  }

  // === Phase 5: Baselines ===

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

  // === Phase 5: Zero-day candidates ===

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
    return rows.map(row => ({
      id: row.id,
      detectedAt: row.detected_at,
      domain: row.domain,
      anomalyType: row.anomaly_type,
      baselineDeviation: row.baseline_deviation,
      details: row.details,
      resolved: !!row.resolved,
      resolution: row.resolution,
      resolvedAt: row.resolved_at,
    }));
  }

  getOpenZeroDayCandidates(): ZeroDayCandidate[] {
    const rows = this.stmtGetOpenZeroDayCandidates.all() as any[];
    return rows.map(row => ({
      id: row.id,
      detectedAt: row.detected_at,
      domain: row.domain,
      anomalyType: row.anomaly_type,
      baselineDeviation: row.baseline_deviation,
      details: row.details,
      resolved: !!row.resolved,
      resolution: row.resolution,
      resolvedAt: row.resolved_at,
    }));
  }

  resolveZeroDayCandidate(id: number, resolution: string): boolean {
    const result = this.stmtResolveZeroDayCandidate.run(resolution, Date.now(), id);
    return result.changes > 0;
  }

  // === Phase 5: Analytics ===

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
    return rows.map(row => ({
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
    }));
  }

  pruneOldEvents(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    const result = this.stmtPruneOldEvents.run(cutoff);
    return result.changes;
  }

  // === Phase 5: Blocklist sync ===

  syncBlocklistSource(sourceName: string, domains: string[], category: string): number {
    // Delete old entries for this source, then insert new
    this.stmtDeleteBlocklistBySource.run(sourceName);
    let added = 0;
    const insertMany = this.db.transaction((items: string[]) => {
      for (const domain of items) {
        this.stmtAddBlocklist.run({ domain, source: sourceName, category });
        added++;
      }
    });
    insertMany(domains);
    return added;
  }

  // === Phase 0-B: Blocklist metadata ===

  getBlocklistMeta(key: string): string | null {
    const row = this.stmtGetBlocklistMeta.get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setBlocklistMeta(key: string, value: string): void {
    this.stmtUpsertBlocklistMeta.run(key, value);
  }

  // === Cleanup ===

  close(): void {
    this.db.close();
  }
}
